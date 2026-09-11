/**
 * rowDrag unit tests: the long-press/press-and-move state machine and the
 * midpoint-crossing reorder math behind the pointer-events checklist drag.
 */
import {
  LONG_PRESS_MS,
  MOUSE_PICKUP_PX,
  TOUCH_SLOP_PX,
  pressCancel,
  pressEnd,
  pressLongPress,
  pressMove,
  pressStart,
  rowShift,
  targetIndexFor,
} from '../rowDrag';

describe('press state machine — mouse', () => {
  it('press-and-move picks up without delay once past the jitter threshold', () => {
    let s = pressStart('mouse', 100, 100);
    expect(s.phase).toBe('pressing');
    s = pressMove(s, 101, 100); // sub-threshold jitter stays a press
    expect(s.phase).toBe('pressing');
    s = pressMove(s, 100, 100 + MOUSE_PICKUP_PX);
    expect(s.phase).toBe('dragging');
  });

  it('release without movement stays a click (cancelled, no drop)', () => {
    const s = pressEnd(pressStart('mouse', 0, 0));
    expect(s.phase).toBe('cancelled');
  });

  it('the long-press timer never picks up a mouse press', () => {
    expect(pressLongPress(pressStart('mouse', 0, 0)).phase).toBe('pressing');
  });

  it('pen behaves like mouse (immediate pickup on move)', () => {
    const s = pressMove(pressStart('pen', 0, 0), 0, MOUSE_PICKUP_PX);
    expect(s.phase).toBe('dragging');
  });

  it('unknown pointer types fall back to mouse behavior', () => {
    expect(pressStart('', 0, 0).kind).toBe('mouse');
  });
});

describe('press state machine — touch long-press', () => {
  it('holding still through the timer picks the row up', () => {
    let s = pressStart('touch', 50, 50);
    s = pressMove(s, 52, 53); // within slop
    expect(s.phase).toBe('pressing');
    s = pressLongPress(s);
    expect(s.phase).toBe('dragging');
  });

  it(`moving beyond the ${TOUCH_SLOP_PX}px slop before the timer cancels (scroll wins)`, () => {
    let s = pressStart('touch', 50, 50);
    s = pressMove(s, 50, 50 + TOUCH_SLOP_PX + 1);
    expect(s.phase).toBe('cancelled');
    // A late timer fire on the cancelled press must not resurrect it.
    expect(pressLongPress(s).phase).toBe('cancelled');
  });

  it('touch does NOT pick up from movement alone (only the timer)', () => {
    const s = pressMove(pressStart('touch', 0, 0), 0, TOUCH_SLOP_PX); // at slop, not beyond
    expect(s.phase).toBe('pressing');
  });

  it('a released press before the timer stays a tap', () => {
    const s = pressEnd(pressStart('touch', 0, 0));
    expect(s.phase).toBe('cancelled');
  });

  it('dragging then release drops (commit)', () => {
    const s = pressEnd(pressLongPress(pressStart('touch', 0, 0)));
    expect(s.phase).toBe('dropped');
  });

  it('pointercancel aborts any phase', () => {
    expect(pressCancel(pressStart('touch', 0, 0)).phase).toBe('cancelled');
    expect(pressCancel(pressLongPress(pressStart('touch', 0, 0))).phase).toBe('cancelled');
  });

  it('moves after pickup never cancel the drag', () => {
    let s = pressLongPress(pressStart('touch', 0, 0));
    s = pressMove(s, 0, 500);
    expect(s.phase).toBe('dragging');
  });

  it('exposes a 400ms hold constant for the editor timer', () => {
    expect(LONG_PRESS_MS).toBe(400);
  });
});

describe('targetIndexFor — midpoint crossing', () => {
  const uniform = [40, 40, 40, 40];

  it('no displacement keeps the row in place', () => {
    expect(targetIndexFor(1, 0, uniform)).toBe(1);
  });

  it('moving down crosses each neighbor at its midpoint', () => {
    expect(targetIndexFor(0, 19, uniform)).toBe(0); // before row 1's midpoint
    expect(targetIndexFor(0, 20, uniform)).toBe(1); // crossed row 1
    expect(targetIndexFor(0, 59, uniform)).toBe(1); // before row 2's midpoint (40+20)
    expect(targetIndexFor(0, 60, uniform)).toBe(2);
    expect(targetIndexFor(0, 100, uniform)).toBe(3);
  });

  it('moving up mirrors the midpoint rule', () => {
    expect(targetIndexFor(3, -19, uniform)).toBe(3);
    expect(targetIndexFor(3, -20, uniform)).toBe(2);
    expect(targetIndexFor(3, -60, uniform)).toBe(1);
    expect(targetIndexFor(3, -100, uniform)).toBe(0);
  });

  it('clamps at the list edges for huge displacements', () => {
    expect(targetIndexFor(0, 10_000, uniform)).toBe(3);
    expect(targetIndexFor(3, -10_000, uniform)).toBe(0);
  });

  it('handles non-uniform row heights (wrapped two-line rows)', () => {
    const heights = [40, 80, 40];
    // From row 0 going down: row 1 (h=80) midpoint at 40.
    expect(targetIndexFor(0, 39, heights)).toBe(0);
    expect(targetIndexFor(0, 40, heights)).toBe(1);
    // Row 2's midpoint sits another 80 + 20 further.
    expect(targetIndexFor(0, 99, heights)).toBe(1);
    expect(targetIndexFor(0, 100, heights)).toBe(2);
  });

  it('out-of-range indices return themselves untouched', () => {
    expect(targetIndexFor(-1, 50, uniform)).toBe(-1);
    expect(targetIndexFor(4, 50, uniform)).toBe(4);
    expect(targetIndexFor(1.5, 50, uniform)).toBe(1.5);
  });
});

describe('rowShift — neighbors opening the gap', () => {
  const H = 40;

  it('dragging down shifts the crossed rows up by the dragged height', () => {
    // from=0, hovering at target=2: rows 1 and 2 slide up; row 3 stays.
    expect(rowShift(1, 0, 2, H)).toBe(-H);
    expect(rowShift(2, 0, 2, H)).toBe(-H);
    expect(rowShift(3, 0, 2, H)).toBe(0);
  });

  it('dragging up shifts the crossed rows down', () => {
    // from=3, hovering at target=1: rows 1 and 2 slide down; row 0 stays.
    expect(rowShift(0, 3, 1, H)).toBe(0);
    expect(rowShift(1, 3, 1, H)).toBe(H);
    expect(rowShift(2, 3, 1, H)).toBe(H);
  });

  it('the dragged row itself never shifts (it follows the pointer)', () => {
    expect(rowShift(0, 0, 2, H)).toBe(0);
    expect(rowShift(3, 3, 1, H)).toBe(0);
  });

  it('no shift when the target equals the pickup index', () => {
    for (const row of [0, 1, 2, 3]) {
      expect(rowShift(row, 1, 1, H)).toBe(0);
    }
  });
});
