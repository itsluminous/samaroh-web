'use client';

// One card of the Keep-style notes grid: booking-palette color surface,
// pin indicator, title, body preview OR checklist with inline done-toggles,
// and the note's tag chips. Clicking the card opens the popup; checklist
// checkboxes toggle in place (permission-gated by the parent).

import PushPinIcon from '@mui/icons-material/PushPin';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { findBookingColor } from '@/lib/booking/bookingColors';
import type { NoteRecord, NoteTagRecord } from '../_lib/types';

/** Checklist rows a card previews before eliding the rest. */
const PREVIEW_ITEMS = 6;

export default function NoteCard({
  note,
  tags,
  canToggle,
  onOpen,
  onToggleItem,
}: {
  note: NoteRecord;
  /** The note's live tags (resolved by the parent). */
  tags: NoteTagRecord[];
  /**
   * notes.edit OR notes.toggle_checklist (shared migration 007) — enables
   * the inline checklist done-toggles.
   */
  canToggle: boolean;
  onOpen: () => void;
  onToggleItem: (itemId: string) => void;
}) {
  const color = findBookingColor(note.color);
  const preview = note.checklist.slice(0, PREVIEW_ITEMS);
  const elided = note.checklist.length - preview.length;
  // Numeric badge, not a translatable string (jsx-no-literals: keep out of JSX).
  const elidedLabel = elided > 0 ? `+${elided}` : null;

  return (
    <Card
      variant="outlined"
      sx={{
        mb: 1.5,
        bgcolor: color?.hex,
        color: color?.on_hex,
        borderColor: color ? 'transparent' : 'divider',
      }}
    >
      {/* component="div" keeps the ripple/role without nesting the checklist
          checkboxes' <button>s inside a <button> (invalid HTML). */}
      <CardActionArea component="div" onClick={onOpen} sx={{ p: 1.5, display: 'block' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
          {note.title ? (
            <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
              {note.title}
            </Typography>
          ) : (
            <Box sx={{ flexGrow: 1 }} />
          )}
          {note.pinned ? <PushPinIcon fontSize="small" sx={{ color: 'inherit', opacity: 0.7 }} /> : null}
        </Box>

        {note.kind === 'note' && note.content ? (
          <Typography
            variant="body2"
            sx={{
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              display: '-webkit-box',
              WebkitLineClamp: 10,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {note.content}
          </Typography>
        ) : null}

        {note.kind === 'checklist' ? (
          <Box>
            {preview.map((item) => (
              <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Checkbox
                  size="small"
                  checked={item.done}
                  disabled={!canToggle}
                  inputProps={{ 'aria-label': item.text }}
                  sx={{ p: 0.25, color: 'inherit', '&.Mui-checked': { color: 'inherit' } }}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    e.stopPropagation();
                    onToggleItem(item.id);
                  }}
                />
                <Typography
                  variant="body2"
                  sx={{
                    minWidth: 0,
                    overflowWrap: 'anywhere',
                    textDecoration: item.done ? 'line-through' : 'none',
                    opacity: item.done ? 0.6 : 1,
                  }}
                >
                  {item.text}
                </Typography>
              </Box>
            ))}
            {elidedLabel !== null ? (
              <Typography variant="caption" sx={{ opacity: 0.7 }}>
                {elidedLabel}
              </Typography>
            ) : null}
          </Box>
        ) : null}

        {tags.length > 0 ? (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
            {tags.map((tag) => (
              <Chip
                key={tag.id}
                size="small"
                variant="outlined"
                label={tag.name}
                sx={{ color: 'inherit', borderColor: 'currentColor', opacity: 0.85 }}
              />
            ))}
          </Box>
        ) : null}
      </CardActionArea>
    </Card>
  );
}
