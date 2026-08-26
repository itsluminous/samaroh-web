/**
 * Guest-mode local client: implements the exact subset of the Supabase
 * client surface this app uses (PostgREST-style query builder + auth.getUser)
 * on top of the local Dexie store. Feature screens receive it from
 * `createClient()` unchanged — in guest mode every read/write stays on-device.
 *
 * Supported surface (kept in lockstep with src usage — grep before extending):
 *   from(t).select(cols).eq/neq/is/in/gte/lte/gt/lt.order.limit.single/maybeSingle
 *   from(t).insert(row|rows)               → duplicate id yields code 23505
 *   from(t).update(patch).<filters>[.select(cols)]
 *   from(t).delete().<filters>
 *   nested select: `expense_attachments(...)` inside an expenses select
 *   rpc()      → returns an error so callers use their client-side fallback
 *   storage    → download errors (guest businesses have no uploaded logo)
 *   auth       → fixed local guest user
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { GUEST_USER_ID } from './guest';
import { localTable, type LocalRow } from './localDb';

/** Marker so shared code (outbox mutate) can detect the local client. */
export const LOCAL_CLIENT_MARKER = 'samaroh_local_client';

export function isLocalClient(client: SupabaseClient | null): boolean {
  return client !== null && (client as unknown as Record<string, unknown>)[LOCAL_CLIENT_MARKER] === true;
}

interface Result<T = unknown> {
  data: T;
  error: { message: string; code?: string } | null;
}

interface OrderSpec {
  column: string;
  ascending: boolean;
}

type Predicate = (row: LocalRow) => boolean;

/** FK column for the nested relations the app selects. */
const NESTED_FK: Record<string, string> = { expense_attachments: 'expense_id' };

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls last, like PostgREST default
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

/** Splits a select string on top-level commas (parenthesis-aware). */
function splitColumns(select: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of select) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

async function projectRow(row: LocalRow, select: string | null): Promise<LocalRow> {
  if (!select || select.trim() === '*') {
    return { ...row };
  }
  const out: LocalRow = { id: row.id };
  for (const part of splitColumns(select)) {
    const nested = /^([a-z_]+)\((.*)\)$/s.exec(part);
    if (nested) {
      const relation = nested[1] as string;
      const innerSelect = nested[2] ?? '*';
      const fk = NESTED_FK[relation];
      const table = localTable(relation);
      if (!fk || !table) {
        out[relation] = [];
        continue;
      }
      const children = (await table.toArray()).filter((c) => c[fk] === row.id);
      out[relation] = await Promise.all(children.map((c) => projectRow(c, innerSelect)));
    } else {
      out[part] = part in row ? row[part] : null;
    }
  }
  return out;
}

type Mode = 'select' | 'insert' | 'update' | 'delete';

/**
 * Thenable query builder mirroring postgrest-js semantics for the chains the
 * app uses. `await` resolves to `{ data, error }` — never rejects.
 */
class LocalQueryBuilder implements PromiseLike<Result> {
  private mode: Mode = 'select';
  private selectCols: string | null = null;
  private predicates: Predicate[] = [];
  private orders: OrderSpec[] = [];
  private limitCount: number | null = null;
  private cardinality: 'many' | 'single' | 'maybeSingle' = 'many';
  private insertRows: LocalRow[] = [];
  private updatePatch: Record<string, unknown> | null = null;
  private returning = false;

  constructor(private tableName: string) {}

  select(columns?: string): this {
    if (this.mode === 'update' || this.mode === 'delete') {
      this.returning = true;
    }
    this.selectCols = columns ?? '*';
    return this;
  }

  insert(rows: Record<string, unknown> | Record<string, unknown>[]): this {
    this.mode = 'insert';
    this.insertRows = (Array.isArray(rows) ? rows : [rows]) as LocalRow[];
    return this;
  }

  update(patch: Record<string, unknown>): this {
    this.mode = 'update';
    this.updatePatch = patch;
    return this;
  }

  delete(): this {
    this.mode = 'delete';
    return this;
  }

  eq(column: string, value: unknown): this {
    this.predicates.push((row) => row[column] === value);
    return this;
  }

  neq(column: string, value: unknown): this {
    this.predicates.push((row) => row[column] !== value);
    return this;
  }

  is(column: string, value: unknown): this {
    this.predicates.push((row) => (value === null ? row[column] == null : row[column] === value));
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.predicates.push((row) => values.includes(row[column]));
    return this;
  }

  gte(column: string, value: unknown): this {
    this.predicates.push((row) => row[column] != null && compareValues(row[column], value) >= 0);
    return this;
  }

  lte(column: string, value: unknown): this {
    this.predicates.push((row) => row[column] != null && compareValues(row[column], value) <= 0);
    return this;
  }

  gt(column: string, value: unknown): this {
    this.predicates.push((row) => row[column] != null && compareValues(row[column], value) > 0);
    return this;
  }

  lt(column: string, value: unknown): this {
    this.predicates.push((row) => row[column] != null && compareValues(row[column], value) < 0);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orders.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  single(): this {
    this.cardinality = 'single';
    return this;
  }

  maybeSingle(): this {
    this.cardinality = 'maybeSingle';
    return this;
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<Result> {
    const table = localTable(this.tableName);
    if (!table) {
      return { data: null, error: { message: `unknown local table ${this.tableName}` } };
    }

    if (this.mode === 'insert') {
      const now = new Date().toISOString();
      for (const row of this.insertRows) {
        if (await table.get(String(row.id))) {
          return { data: null, error: { message: 'duplicate key value', code: '23505' } };
        }
        await table.add({
          deleted_at: null,
          ...row,
          created_at: (row.created_at as string | undefined) ?? now,
          updated_at: (row.updated_at as string | undefined) ?? now,
        });
      }
      return { data: null, error: null };
    }

    const all = await table.toArray();
    const matched = all.filter((row) => this.predicates.every((p) => p(row)));

    if (this.mode === 'update') {
      const patch = this.updatePatch ?? {};
      const updated: LocalRow[] = [];
      for (const row of matched) {
        const next = {
          ...row,
          ...patch,
          updated_at: (patch.updated_at as string | undefined) ?? new Date().toISOString(),
        };
        await table.put(next);
        updated.push(next);
      }
      if (this.returning) {
        const data = await Promise.all(updated.map((r) => projectRow(r, this.selectCols)));
        return { data, error: null };
      }
      return { data: null, error: null };
    }

    if (this.mode === 'delete') {
      for (const row of matched) {
        await table.delete(String(row.id));
      }
      return { data: null, error: null };
    }

    // select
    const sorted = [...matched];
    if (this.orders.length > 0) {
      sorted.sort((a, b) => {
        for (const { column, ascending } of this.orders) {
          const c = compareValues(a[column], b[column]);
          if (c !== 0) return ascending ? c : -c;
        }
        return 0;
      });
    }
    const limited = this.limitCount != null ? sorted.slice(0, this.limitCount) : sorted;
    const data = await Promise.all(limited.map((r) => projectRow(r, this.selectCols)));

    if (this.cardinality === 'single') {
      if (data.length !== 1) {
        return { data: null, error: { message: 'expected a single row', code: 'PGRST116' } };
      }
      return { data: data[0], error: null };
    }
    if (this.cardinality === 'maybeSingle') {
      if (data.length > 1) {
        return { data: null, error: { message: 'expected at most one row', code: 'PGRST116' } };
      }
      return { data: data[0] ?? null, error: null };
    }
    return { data, error: null };
  }
}

const guestUser = {
  id: GUEST_USER_ID,
  aud: 'local',
  role: 'guest',
  email: '',
  created_at: new Date(0).toISOString(),
  app_metadata: {},
  user_metadata: {},
} as User;

/**
 * Builds the guest client. The cast is deliberate: SupabaseClient's full type
 * is enormous, we implement exactly the members the app calls (documented
 * above) and TypeScript still checks every call site through the cast type.
 */
export function createLocalClient(): SupabaseClient {
  const client = {
    [LOCAL_CLIENT_MARKER]: true,
    from(tableName: string) {
      return new LocalQueryBuilder(tableName);
    },
    async rpc() {
      return { data: null, error: { message: 'rpc unavailable in guest mode' } };
    },
    storage: {
      from() {
        return {
          async download() {
            return { data: null, error: { message: 'storage unavailable in guest mode' } };
          },
        };
      },
    },
    auth: {
      async getUser() {
        return { data: { user: guestUser }, error: null };
      },
      async getSession() {
        return { data: { session: null }, error: null };
      },
      async signOut() {
        return { error: null };
      },
    },
  };
  return client as unknown as SupabaseClient;
}
