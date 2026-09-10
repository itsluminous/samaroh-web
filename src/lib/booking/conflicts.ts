// Conflict + block detection for the Add/Edit form (§4.1): overlapping
// bookings only WARN (halls host multiple events — never block); date blocks
// DO block, with an owner override.

import { rangesOverlap } from './calendar';
import type { Booking, DateBlock } from './types';

/**
 * Non-cancelled, non-deleted, BOOKING-kind bookings overlapping [start, end],
 * excluding the booking being edited. The count drives the non-blocking
 * conflict warning. Marker-kind bookings (Lagan/Tilak day indicators) are
 * calendar highlights, not hall occupancy — pass `isMarkerType` (resolved
 * from the business's event-type presets) to exclude them; omitted, every
 * booking counts (legacy behavior for callers without preset context).
 */
export function findConflicts(
  bookings: Booking[],
  start: string,
  end: string,
  excludeId?: string,
  isMarkerType?: (eventType: string) => boolean,
): Booking[] {
  return bookings.filter(
    (b) =>
      b.id !== excludeId &&
      b.deleted_at === null &&
      b.status !== 'cancelled' &&
      !(isMarkerType?.(b.event_type) === true) &&
      rangesOverlap(b.start_date, b.end_date, start, end),
  );
}

/** Active date blocks overlapping [start, end] — these block saving (owner may override). */
export function findBlockingBlocks(blocks: DateBlock[], start: string, end: string): DateBlock[] {
  return blocks.filter(
    (blk) => blk.deleted_at === null && rangesOverlap(blk.start_date, blk.end_date, start, end),
  );
}
