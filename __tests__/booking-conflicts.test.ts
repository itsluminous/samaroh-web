// Conflict warning is non-blocking and counts overlapping bookings;
// date blocks DO block (owner override handled in the form).

import { findBlockingBlocks, findConflicts } from '@/lib/booking/conflicts';
import { makeBlock, makeBooking } from '../test-utils/fixtures';

describe('findConflicts', () => {
  it('detects overlapping bookings incl. exact and partial range overlap', () => {
    const existing = makeBooking({ start_date: '2026-07-10', end_date: '2026-07-12' });
    expect(findConflicts([existing], '2026-07-10', '2026-07-10')).toHaveLength(1);
    expect(findConflicts([existing], '2026-07-12', '2026-07-14')).toHaveLength(1);
    expect(findConflicts([existing], '2026-07-08', '2026-07-09')).toHaveLength(0);
    expect(findConflicts([existing], '2026-07-13', '2026-07-13')).toHaveLength(0);
  });

  it('ignores cancelled and soft-deleted bookings', () => {
    const cancelled = makeBooking({ status: 'cancelled' });
    const deleted = makeBooking({ deleted_at: '2026-07-01T00:00:00Z' });
    expect(findConflicts([cancelled, deleted], '2026-07-10', '2026-07-10')).toHaveLength(0);
  });

  it('excludes the booking being edited', () => {
    const existing = makeBooking({ start_date: '2026-07-10', end_date: '2026-07-10' });
    expect(findConflicts([existing], '2026-07-10', '2026-07-10', existing.id)).toHaveLength(0);
  });

  it('counts multiple overlaps (the warning shows the count)', () => {
    const a = makeBooking({ start_date: '2026-07-10', end_date: '2026-07-10' });
    const b = makeBooking({ start_date: '2026-07-09', end_date: '2026-07-11' });
    expect(findConflicts([a, b], '2026-07-10', '2026-07-10')).toHaveLength(2);
  });
});

describe('findBlockingBlocks', () => {
  it('flags ranges overlapping an active block and ignores removed blocks', () => {
    const active = makeBlock({ start_date: '2026-07-20', end_date: '2026-07-21' });
    const removed = makeBlock({ start_date: '2026-07-25', end_date: '2026-07-25', deleted_at: '2026-07-01T00:00:00Z' });
    expect(findBlockingBlocks([active, removed], '2026-07-21', '2026-07-22')).toHaveLength(1);
    expect(findBlockingBlocks([active, removed], '2026-07-25', '2026-07-25')).toHaveLength(0);
    expect(findBlockingBlocks([active, removed], '2026-07-22', '2026-07-23')).toHaveLength(0);
  });
});
