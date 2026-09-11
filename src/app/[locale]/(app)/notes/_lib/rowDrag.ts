/**
 * Pure logic for the pointer-events checklist row drag (NoteDialog editor).
 *
 * Replaces the HTML5 drag-and-drop reorder: HTML5 dnd never fires on touch
 * browsers (no dragstart from touch gestures), so the editor now drives a
 * pointer-event drag on the whole row. Two pickup gestures:
 *   - mouse/pen: press-and-move picks the row up without delay;
 *   - touch: long-press (LONG_PRESS_MS) picks up — moving beyond
 *     TOUCH_SLOP_PX before the timer cancels the press so normal scrolling
 *     keeps working (rows keep `touch-action: pan-y` until pickup).
 *
 * Kept free of React/DOM so the state machine and the midpoint-crossing
 * reorder math unit-test directly; the ChecklistEditor component wires
 * these transitions to real pointer events.
 */

/** Touch hold time before a row is picked up. */
export const LONG_PRESS_MS = 400;
/** Touch may wander this far during the long-press without cancelling it. */
export const TOUCH_SLOP_PX = 8;
/** Mouse/pen picks up as soon as the press moves this far (no delay). */
export const MOUSE_PICKUP_PX = 3;

export type PointerKind = 'mouse' | 'touch' | 'pen';

export type PressPhase =
  /** Pointer is down; not picked up yet (may still become a tap/click). */
  | 'pressing'
  /** Row picked up: it follows the pointer and neighbors shift. */
  | 'dragging'
  /** Aborted: touch moved beyond slop before the timer (scroll wins), or pointercancel. */
  | 'cancelled'
  /** Released while dragging — commit the reorder. */
  | 'dropped';

export interface PressState {
  phase: PressPhase;
  kind: PointerKind;
  startX: number;
  startY: number;
}

/** Pointer down on a row. Unknown pointer types behave like mouse. */
export function pressStart(kind: string, x: number, y: number): PressState {
  return {
    phase: 'pressing',
    kind: kind === 'touch' || kind === 'pen' ? kind : 'mouse',
    startX: x,
    startY: y,
  };
}

/**
 * Pointer moved. While pressing: mouse/pen picks up past MOUSE_PICKUP_PX;
 * touch cancels past TOUCH_SLOP_PX (the browser scroll should win — pickup
 * only comes from the long-press timer). Other phases are unaffected.
 */
export function pressMove(state: PressState, x: number, y: number): PressState {
  if (state.phase !== 'pressing') {
    return state;
  }
  const dist = Math.hypot(x - state.startX, y - state.startY);
  if (state.kind === 'touch') {
    return dist > TOUCH_SLOP_PX ? { ...state, phase: 'cancelled' } : state;
  }
  return dist >= MOUSE_PICKUP_PX ? { ...state, phase: 'dragging' } : state;
}

/** The long-press timer fired: a still-pressing touch picks the row up. */
export function pressLongPress(state: PressState): PressState {
  if (state.phase === 'pressing' && state.kind === 'touch') {
    return { ...state, phase: 'dragging' };
  }
  return state;
}

/** Pointer released: a drag drops (commit); a plain press stays a tap/click. */
export function pressEnd(state: PressState): PressState {
  return { ...state, phase: state.phase === 'dragging' ? 'dropped' : 'cancelled' };
}

/** pointercancel (browser took the gesture, e.g. scroll started). */
export function pressCancel(state: PressState): PressState {
  return { ...state, phase: 'cancelled' };
}

/**
 * Midpoint-crossing reorder target: with the dragged row displaced `dy`
 * pixels from its start, the row settles at the last neighbor whose
 * midpoint the displacement has crossed. `heights` are the row heights (px)
 * in the pre-drag order. Out-of-range `from` returns itself.
 */
export function targetIndexFor(from: number, dy: number, heights: number[]): number {
  if (!Number.isInteger(from) || from < 0 || from >= heights.length) {
    return from;
  }
  let target = from;
  if (dy > 0) {
    let acc = 0;
    for (let j = from + 1; j < heights.length; j++) {
      const h = heights[j] ?? 0;
      if (dy >= acc + h / 2) {
        target = j;
        acc += h;
      } else {
        break;
      }
    }
  } else if (dy < 0) {
    let acc = 0;
    for (let j = from - 1; j >= 0; j--) {
      const h = heights[j] ?? 0;
      if (-dy >= acc + h / 2) {
        target = j;
        acc += h;
      } else {
        break;
      }
    }
  }
  return target;
}

/**
 * Vertical shift (px) a NON-dragged row takes while the drag hovers at
 * `target`: rows between the pickup index and the target slide by the
 * dragged row's height to open the gap. The dragged row itself is 0 here —
 * it follows the pointer via `dy` instead.
 */
export function rowShift(
  rowIndex: number,
  from: number,
  target: number,
  draggedHeight: number,
): number {
  if (rowIndex === from) {
    return 0;
  }
  if (from < target && rowIndex > from && rowIndex <= target) {
    return -draggedHeight;
  }
  if (from > target && rowIndex >= target && rowIndex < from) {
    return draggedHeight;
  }
  return 0;
}
