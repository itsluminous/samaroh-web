'use client';

// Checklist editor rows (NoteDialog edit mode). Items are NON-editable once
// added: each row is checkbox + plain text + a small remove cross, and the
// single "Add item" field at the bottom appends on Enter (keeping focus).
//
// Reordering is a pointer-events drag on the WHOLE row (HTML5 dnd was
// removed — it never fires on touch browsers):
//   - mouse/pen: press-and-move picks the row up immediately;
//   - touch: ~400ms long-press picks up; moving beyond the slop first
//     cancels, so rows keep `touch-action: pan-y` and normal scrolling
//     works until pickup. After pickup a non-passive touchmove listener
//     preventDefault()s so the browser never starts a scroll (which would
//     pointercancel the drag).
// While dragging, the row gets shadow + slight scale and follows the
// pointer; neighbors slide out of the way with transform transitions; the
// order commits on release at the midpoint-crossing target. The pure state
// machine + math live in ../_lib/rowDrag.ts.

import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import {
  LONG_PRESS_MS,
  pressCancel,
  pressEnd,
  pressLongPress,
  pressMove,
  pressStart,
  rowShift,
  targetIndexFor,
  type PressState,
} from '../_lib/rowDrag';
import {
  addChecklistItem,
  moveChecklistItem,
  removeChecklistItem,
  toggleChecklistItem,
} from '../_lib/notesView';
import type { ChecklistItem } from '../_lib/types';

/** Live drag view state: drives the row transforms. */
interface DragView {
  from: number;
  target: number;
  dy: number;
  /** Row heights measured at pickup (pre-drag order). */
  heights: number[];
}

/** One active pointer session, kept in a ref (mutated by window listeners). */
interface Session {
  pointerId: number;
  index: number;
  press: PressState;
  heights: number[];
  target: number;
  timer: number | null;
  detach: () => void;
}

export default function ChecklistEditor({
  items,
  onItemsChange,
  pendingText,
  onPendingTextChange,
  surfaceColor,
}: {
  items: ChecklistItem[];
  onItemsChange: (next: ChecklistItem[]) => void;
  /** The Add-item field's draft (owned by NoteDialog so save can flush it). */
  pendingText: string;
  onPendingTextChange: (next: string) => void;
  /** The dialog's note-color surface, painted under the lifted row. */
  surfaceColor?: string;
}) {
  const t = useTranslations('notes');
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sessionRef = useRef<Session | null>(null);
  const [drag, setDrag] = useState<DragView | null>(null);
  // Latest items for the window listeners (registered once per press).
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Unmount safety: drop listeners/timer of an in-flight press.
  useEffect(
    () => () => {
      sessionRef.current?.detach();
      sessionRef.current = null;
    },
    [],
  );

  function endSession() {
    sessionRef.current?.detach();
    sessionRef.current = null;
    setDrag(null);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>, index: number) {
    if (sessionRef.current) {
      return; // one pointer at a time (ignore multi-touch)
    }
    // Presses on the row's controls stay clicks (checkbox toggle / remove).
    if ((e.target as Element).closest('button, input, textarea, a, label')) {
      return;
    }
    const press = pressStart(e.pointerType, e.clientX, e.clientY);
    if (press.kind !== 'touch') {
      // Mouse/pen: stop text-selection drags from the press.
      e.preventDefault();
    }

    const s: Session = {
      pointerId: e.pointerId ?? 0,
      index,
      press,
      heights: [],
      target: index,
      timer: null,
      detach: () => {},
    };

    const pickup = () => {
      s.heights = itemsRef.current.map(
        (_item, i) => rowRefs.current[i]?.getBoundingClientRect().height ?? 0,
      );
      s.target = s.index;
      setDrag({ from: s.index, target: s.index, dy: 0, heights: s.heights });
    };

    const onMove = (ev: PointerEvent) => {
      if ((ev.pointerId ?? 0) !== s.pointerId) {
        return;
      }
      const wasPressing = s.press.phase === 'pressing';
      s.press = pressMove(s.press, ev.clientX, ev.clientY);
      if (s.press.phase === 'cancelled') {
        endSession(); // touch wandered past the slop — let the scroll win
        return;
      }
      if (wasPressing && s.press.phase === 'dragging') {
        pickup(); // mouse/pen press-and-move pickup
      }
      if (s.press.phase === 'dragging') {
        const dy = ev.clientY - s.press.startY;
        s.target = targetIndexFor(s.index, dy, s.heights);
        setDrag({ from: s.index, target: s.target, dy, heights: s.heights });
      }
    };

    const onUp = (ev: PointerEvent) => {
      if ((ev.pointerId ?? 0) !== s.pointerId) {
        return;
      }
      s.press = pressEnd(s.press);
      if (s.press.phase === 'dropped') {
        onItemsChange(moveChecklistItem(itemsRef.current, s.index, s.target));
      }
      endSession();
    };

    const onCancel = (ev: PointerEvent) => {
      if ((ev.pointerId ?? 0) !== s.pointerId) {
        return;
      }
      s.press = pressCancel(s.press);
      endSession();
    };

    // Non-passive: once dragging, preventDefault() keeps the browser from
    // starting a scroll pan (which would fire pointercancel mid-drag).
    const onTouchMove = (ev: TouchEvent) => {
      if (s.press.phase === 'dragging' && ev.cancelable) {
        ev.preventDefault();
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    s.detach = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('touchmove', onTouchMove);
      if (s.timer !== null) {
        window.clearTimeout(s.timer);
      }
    };

    if (press.kind === 'touch') {
      s.timer = window.setTimeout(() => {
        s.press = pressLongPress(s.press);
        if (s.press.phase === 'dragging') {
          pickup();
        }
      }, LONG_PRESS_MS);
    }

    sessionRef.current = s;
  }

  function addPending() {
    const next = addChecklistItem(items, pendingText);
    if (next !== items) {
      onItemsChange(next);
    }
    onPendingTextChange('');
  }

  return (
    <Box>
      {items.map((item, index) => {
        const isDragged = drag !== null && drag.from === index;
        const shift =
          drag !== null && !isDragged
            ? rowShift(index, drag.from, drag.target, drag.heights[drag.from] ?? 0)
            : 0;
        return (
          <Box
            key={item.id}
            ref={(el: HTMLDivElement | null) => {
              rowRefs.current[index] = el;
            }}
            data-checklist-row
            data-dragging={isDragged ? 'true' : undefined}
            onPointerDown={(e) => handlePointerDown(e, index)}
            onContextMenu={(e) => {
              // Suppress the touch long-press context menu while a press is live.
              if (sessionRef.current) {
                e.preventDefault();
              }
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              position: 'relative',
              borderRadius: 1,
              // Vertical scroll keeps working until a long-press picks up.
              touchAction: 'pan-y',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              cursor: isDragged ? 'grabbing' : 'grab',
              ...(isDragged
                ? {
                    transform: `translateY(${drag.dy}px) scale(1.02)`,
                    transition: 'none',
                    zIndex: 2,
                    boxShadow: 4,
                    bgcolor: surfaceColor ?? 'background.paper',
                  }
                : {
                    transform: shift === 0 ? 'none' : `translateY(${shift}px)`,
                    transition: 'transform 150ms ease',
                  }),
            }}
          >
            <Checkbox
              size="small"
              checked={item.done}
              inputProps={{ 'aria-label': item.text }}
              sx={{ p: 0.25 }}
              onChange={() => onItemsChange(toggleChecklistItem(items, item.id))}
            />
            <Typography sx={{ flexGrow: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
              {item.text}
            </Typography>
            <IconButton
              size="small"
              aria-label={t('editor.checklist_remove')}
              sx={{ color: 'inherit' }}
              onClick={() => onItemsChange(removeChecklistItem(items, item.id))}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        );
      })}
      <TextField
        fullWidth
        variant="standard"
        label={t('editor.checklist_add')}
        value={pendingText}
        onChange={(e) => onPendingTextChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault(); // keep focus in the field for the next item
            addPending();
          }
        }}
      />
    </Box>
  );
}
