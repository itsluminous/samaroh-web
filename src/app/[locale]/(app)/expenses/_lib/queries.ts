/**
 * Supabase data access for the expenses section (parties, expenses,
 * expense_attachments). All writes follow the app-wide contract: client
 * UUIDs, soft deletes via `deleted_at` tombstones, `updated_at` bumped by the
 * server trigger. RLS scopes every query to the caller's business membership.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExpenseDirection } from '@/lib/expenses/ledger';
import { insertWithOutbox, updateWithOutbox } from '@/lib/outbox/mutate';

export interface PartyRecord {
  id: string;
  name: string;
  phone: string | null;
  created_at: string;
}

export interface ExpenseAttachmentRecord {
  id: string;
  expense_id: string;
  /** Null while the Google Drive upload is pending (pending badge). */
  drive_file_id: string | null;
  mime_type: string;
  file_name: string;
  deleted_at: string | null;
}

export interface ExpenseRecord {
  id: string;
  party_id: string;
  direction: ExpenseDirection;
  amount: number;
  expense_date: string;
  notes: string | null;
  created_at: string;
  expense_attachments: ExpenseAttachmentRecord[];
}

export const MAX_ATTACHMENTS_PER_ENTRY = 4;

export async function fetchParties(
  supabase: SupabaseClient,
  businessId: string,
): Promise<PartyRecord[]> {
  const { data, error } = await supabase
    .from('parties')
    .select('id, name, phone, created_at')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .order('name', { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as PartyRecord[];
}

export async function fetchParty(
  supabase: SupabaseClient,
  partyId: string,
): Promise<PartyRecord | null> {
  const { data, error } = await supabase
    .from('parties')
    .select('id, name, phone, created_at')
    .eq('id', partyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return (data as PartyRecord | null) ?? null;
}

/** All live expenses of the business (party aggregation happens client-side). */
export async function fetchBusinessExpenses(
  supabase: SupabaseClient,
  businessId: string,
): Promise<ExpenseRecord[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('id, party_id, direction, amount, expense_date, notes, created_at')
    .eq('business_id', businessId)
    .is('deleted_at', null);
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as Omit<ExpenseRecord, 'expense_attachments'>[]).map((row) => ({
    ...row,
    expense_attachments: [],
  }));
}

/** One party's live expenses with their attachment metadata rows. */
export async function fetchPartyExpenses(
  supabase: SupabaseClient,
  partyId: string,
): Promise<ExpenseRecord[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select(
      'id, party_id, direction, amount, expense_date, notes, created_at, expense_attachments(id, expense_id, drive_file_id, mime_type, file_name, deleted_at)',
    )
    .eq('party_id', partyId)
    .is('deleted_at', null);
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as ExpenseRecord[]).map((row) => ({
    ...row,
    expense_attachments: (row.expense_attachments ?? []).filter((a) => a.deleted_at === null),
  }));
}

export async function createParty(
  supabase: SupabaseClient,
  businessId: string,
  name: string,
  phone: string | null,
): Promise<PartyRecord> {
  const record = {
    id: crypto.randomUUID(),
    business_id: businessId,
    name: name.trim(),
    phone: phone?.trim() || null,
  };
  await insertWithOutbox(supabase, { module: 'expenses', table: 'parties', row: record, label: record.name });
  return { id: record.id, name: record.name, phone: record.phone, created_at: new Date().toISOString() };
}

export interface NewAttachmentInput {
  fileName: string;
  mimeType: string;
}

export interface ExpenseInput {
  direction: ExpenseDirection;
  amount: number;
  expenseDate: string;
  notes: string | null;
}

export async function createExpense(
  supabase: SupabaseClient,
  businessId: string,
  partyId: string,
  userId: string,
  input: ExpenseInput,
  attachments: NewAttachmentInput[],
): Promise<void> {
  const expenseId = crypto.randomUUID();
  await insertWithOutbox(supabase, {
    module: 'expenses',
    table: 'expenses',
    row: {
      id: expenseId,
      business_id: businessId,
      party_id: partyId,
      direction: input.direction,
      amount: input.amount,
      expense_date: input.expenseDate,
      notes: input.notes,
      created_by: userId,
    },
    // The ledger entry itself is the label (amount is formatted at display time).
    label: input.notes ?? input.expenseDate,
  });
  await insertAttachments(supabase, businessId, expenseId, attachments);
}

export async function updateExpense(
  supabase: SupabaseClient,
  businessId: string,
  expenseId: string,
  input: ExpenseInput,
  newAttachments: NewAttachmentInput[],
  removedAttachmentIds: string[],
): Promise<void> {
  await updateWithOutbox(supabase, {
    module: 'expenses',
    table: 'expenses',
    entityId: expenseId,
    patch: {
      amount: input.amount,
      expense_date: input.expenseDate,
      notes: input.notes,
      updated_at: new Date().toISOString(),
    },
    baseUpdatedAt: null,
    label: input.notes ?? input.expenseDate,
  });
  await insertAttachments(supabase, businessId, expenseId, newAttachments);
  if (removedAttachmentIds.length > 0) {
    const { error: attachmentError } = await supabase
      .from('expense_attachments')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', removedAttachmentIds);
    if (attachmentError) {
      throw new Error(attachmentError.message);
    }
  }
}

/** Tombstone delete: the row (and its attachments) stay for sync, hidden from UI. */
export async function deleteExpense(supabase: SupabaseClient, expenseId: string): Promise<void> {
  const deletedAt = new Date().toISOString();
  const { error } = await supabase
    .from('expenses')
    .update({ deleted_at: deletedAt })
    .eq('id', expenseId);
  if (error) {
    throw new Error(error.message);
  }
  const { error: attachmentError } = await supabase
    .from('expense_attachments')
    .update({ deleted_at: deletedAt })
    .eq('expense_id', expenseId)
    .is('deleted_at', null);
  if (attachmentError) {
    throw new Error(attachmentError.message);
  }
}

/**
 * Inserts attachment METADATA rows with `drive_file_id = null` — the pending
 * state. The Google Drive upload itself (which fills drive_file_id) is the
 * sync/Drive integration's responsibility; files never touch Supabase Storage.
 */
async function insertAttachments(
  supabase: SupabaseClient,
  businessId: string,
  expenseId: string,
  attachments: NewAttachmentInput[],
): Promise<void> {
  if (attachments.length === 0) {
    return;
  }
  const { error } = await supabase.from('expense_attachments').insert(
    attachments.map((a) => ({
      id: crypto.randomUUID(),
      expense_id: expenseId,
      business_id: businessId,
      drive_file_id: null,
      mime_type: a.mimeType,
      file_name: a.fileName,
    })),
  );
  if (error) {
    throw new Error(error.message);
  }
}
