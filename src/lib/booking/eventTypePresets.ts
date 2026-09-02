/**
 * DB-backed event-type presets (event_types table, shared migration 006).
 * Presets are per-business, user-managed rows: plain-text label, emoji icon,
 * optional default calendar color (booking-colors.json key; null = themed
 * default) and a sort_order. RLS scopes reads to active members and writes to
 * settings.manage_business (owners implicitly).
 *
 * Bookings SNAPSHOT the preset at save time (bookings.event_type = label,
 * bookings.event_icon = icon) — renaming or deleting a preset never rewrites
 * existing bookings. Writes go through the offline outbox layer; the guest
 * Dexie local client supports the same table for full parity.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { insertWithOutbox, updateWithOutbox } from '@/lib/outbox/mutate';
import { CUSTOM_EVENT_TYPE_KEY, EVENT_TYPES, findEventType, type EventTypeKind } from './eventTypes';

export interface EventTypePreset {
  id: string;
  business_id: string;
  /** Plain-text user data — NOT a catalog key. */
  label: string;
  /** Emoji, copied into bookings.event_icon at save time. */
  icon: string;
  /** booking-colors.json key; null = themed default. */
  color: string | null;
  /**
   * 'booking' = real customer booking; 'marker' = auspicious-day
   * self-indicator (calendar highlight only — excluded from booking counts
   * and revenue). Absent in pre-kind rows → 'booking' (schema contract).
   */
  kind: EventTypeKind;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type Translate = (key: string) => string;

export interface EventTypeInput {
  label: string;
  icon: string;
  color: string | null;
  kind: EventTypeKind;
}

/** Fills schema-lag gaps for rows read from a pre-006-shaped store. */
function normalizePreset(row: Record<string, unknown>): EventTypePreset {
  const p = row as unknown as EventTypePreset;
  return {
    ...p,
    color: p.color ?? null,
    sort_order: p.sort_order ?? 0,
    kind: p.kind === 'marker' ? 'marker' : 'booking',
  };
}

/**
 * Live (non-deleted) presets of a business, in sort_order. Returns null when
 * the read fails — e.g. the server has not applied migration 006 yet — so
 * callers can degrade to the static contract template instead of erroring.
 */
export async function fetchEventTypes(
  db: SupabaseClient,
  businessId: string,
): Promise<EventTypePreset[] | null> {
  try {
    const { data, error } = await db
      .from('event_types')
      .select('*')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) {
      return null;
    }
    return ((data ?? []) as Record<string, unknown>[]).map(normalizePreset);
  } catch {
    return null;
  }
}

/**
 * Static fallback presets from shared/event-types.json for when the
 * event_types table is not readable yet (schema lag). The `custom` entry is
 * excluded: the booking form renders its own free-text option.
 */
export function fallbackPresets(translate: Translate): EventTypePreset[] {
  const epoch = new Date(0).toISOString();
  return EVENT_TYPES.filter((et) => et.key !== CUSTOM_EVENT_TYPE_KEY).map((et, i) => ({
    id: `builtin:${et.key}`,
    business_id: '',
    label: translate(et.label_key),
    icon: et.emoji,
    color: et.color,
    kind: et.kind,
    sort_order: i,
    created_at: epoch,
    updated_at: epoch,
    deleted_at: null,
  }));
}

/**
 * Caseless, whitespace/underscore-insensitive label form. Bridges legacy
 * pre-006 bookings that stored built-in KEYS ('room_booking') to the seeded
 * preset LABELS ('Room Booking').
 */
export function normalizeTypeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, '');
}

/** Finds the preset a stored bookings.event_type refers to (label snapshot or legacy key). */
export function findPresetForType(
  presets: EventTypePreset[],
  eventType: string,
): EventTypePreset | undefined {
  const exact = presets.find((p) => p.label === eventType);
  if (exact) {
    return exact;
  }
  const wanted = normalizeTypeLabel(eventType);
  if (wanted === '') {
    return undefined;
  }
  return presets.find((p) => normalizeTypeLabel(p.label) === wanted);
}

/**
 * Duplicate-name validation for the add/edit dialog: matches another live
 * preset case-insensitively (the DB unique index is exact, but two labels
 * differing only in case would be indistinguishable in the dropdown).
 */
export function isDuplicateLabel(
  presets: EventTypePreset[],
  label: string,
  excludeId?: string,
): boolean {
  const wanted = normalizeTypeLabel(label);
  if (wanted === '') {
    return false;
  }
  return presets.some((p) => p.id !== excludeId && normalizeTypeLabel(p.label) === wanted);
}

/** Creates a preset through the offline-aware data layer. Returns the optimistic row. */
export async function createEventType(
  db: SupabaseClient,
  businessId: string,
  input: EventTypeInput,
  sortOrder: number,
): Promise<EventTypePreset> {
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    business_id: businessId,
    label: input.label,
    icon: input.icon,
    color: input.color,
    kind: input.kind,
    sort_order: sortOrder,
  };
  await insertWithOutbox(db, {
    module: 'booking',
    table: 'event_types',
    row,
    label: input.label,
  });
  return { ...row, created_at: now, updated_at: now, deleted_at: null };
}

/** Updates a preset (label/icon/color) — existing bookings keep their snapshot. */
export async function updateEventType(
  db: SupabaseClient,
  preset: EventTypePreset,
  input: EventTypeInput,
): Promise<EventTypePreset> {
  const patch = { ...input, updated_at: new Date().toISOString() };
  await updateWithOutbox(db, {
    module: 'booking',
    table: 'event_types',
    entityId: preset.id,
    patch,
    baseUpdatedAt: preset.updated_at,
    label: input.label,
  });
  return { ...preset, ...patch };
}

/** Soft delete (tombstone); the label becomes reusable (partial unique index). */
export async function deleteEventType(db: SupabaseClient, preset: EventTypePreset): Promise<void> {
  const now = new Date().toISOString();
  await updateWithOutbox(db, {
    module: 'booking',
    table: 'event_types',
    entityId: preset.id,
    patch: { deleted_at: now, updated_at: now },
    baseUpdatedAt: preset.updated_at,
    label: preset.label,
  });
}

/**
 * Persists a new ordering: `ordered` is the full live list in its desired
 * order; every preset whose sort_order differs from its index is updated.
 * Returns the renumbered list.
 */
export async function reorderEventTypes(
  db: SupabaseClient,
  ordered: EventTypePreset[],
): Promise<EventTypePreset[]> {
  const out: EventTypePreset[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const preset = ordered[i] as EventTypePreset;
    if (preset.sort_order === i) {
      out.push(preset);
      continue;
    }
    const patch = { sort_order: i, updated_at: new Date().toISOString() };
    await updateWithOutbox(db, {
      module: 'booking',
      table: 'event_types',
      entityId: preset.id,
      patch,
      baseUpdatedAt: preset.updated_at,
      label: preset.label,
    });
    out.push({ ...preset, ...patch });
  }
  return out;
}

/**
 * Seed rows for a NEW business, from the shared template
 * (shared/event-types.json — includes the `custom` entry, matching the
 * migration's backfill). Labels resolve through the caller's locale.
 */
export function buildEventTypeSeedRows(
  businessId: string,
  translate: Translate,
): Record<string, unknown>[] {
  return EVENT_TYPES.map((et, i) => ({
    id: crypto.randomUUID(),
    business_id: businessId,
    label: translate(et.label_key),
    icon: et.emoji,
    color: et.color,
    kind: et.kind,
    sort_order: i,
  }));
}

/**
 * Seeds the built-in presets at business creation (sign-up flow). Best
 * effort: a failure (e.g. the server has not applied migration 006 yet) must
 * never block creating the business — reads fall back to the static template.
 */
export async function seedEventTypes(
  db: SupabaseClient,
  businessId: string,
  translate: Translate,
): Promise<boolean> {
  try {
    const { error } = await db.from('event_types').insert(buildEventTypeSeedRows(businessId, translate));
    return error === null;
  } catch {
    return false;
  }
}

/** Default color KEY for a preset matching a stored event_type; legacy keys use the static contract. */
export function presetColorKey(
  presets: EventTypePreset[] | null | undefined,
  eventType: string,
): string | null | undefined {
  if (presets) {
    const preset = findPresetForType(presets, eventType);
    if (preset) {
      return preset.color;
    }
  }
  // Pre-006 bookings store built-in keys; keep their contract default even
  // when presets are unavailable or the matching preset was renamed/deleted.
  return findEventType(eventType)?.color;
}

/**
 * Kind of the event type a stored bookings.event_type refers to: the live
 * preset's kind (label snapshot match), else the static contract's kind for
 * legacy built-in keys, else 'booking' (the schema default — a custom
 * free-text type or a renamed/deleted preset is a real booking).
 */
export function presetKindForType(
  presets: EventTypePreset[] | null | undefined,
  eventType: string,
): EventTypeKind {
  if (presets) {
    const preset = findPresetForType(presets, eventType);
    if (preset) {
      return preset.kind;
    }
  }
  return findEventType(eventType)?.kind ?? 'booking';
}
