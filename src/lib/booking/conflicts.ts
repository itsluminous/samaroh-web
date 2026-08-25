// Conflict + block detection for the Add/Edit form (§4.1): overlapping
// bookings only WARN (halls host multiple events — never block); date blocks
// DO block, with an owner override.

import { rangesOverlap } from './calendar';
import type { Booking, DateBlock } from './types';

/**
 * Non-cancelled, non-deleted bookings overlapping [start, end], excluding the
 * booking being edited. The count drives the non-blocking conflict warning.
 */
export function findConflicts(
  bookings: Booking[],
  start: string,
  end: string,
  excludeId?: string,
): Booking[] {
  return bookings.filter(
    (b) =>
      b.id !== excludeId &&
      b.deleted_at === null &&
      b.status !== 'cancelled' &&
      rangesOverlap(b.start_date, b.end_date, start, end),
  );
}

/** Active date blocks overlapping [start, end] — these block saving (owner may override). */
export function findBlockingBlocks(blocks: DateBlock[], start: string, end: string): DateBlock[] {
  return blocks.filter(
    (blk) => blk.deleted_at === null && rangesOverlap(blk.start_date, blk.end_date, start, end),
  );
}
