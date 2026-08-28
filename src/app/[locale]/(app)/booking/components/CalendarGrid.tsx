'use client';

// Month calendar grid (§4.1): Sunday-start weeks, colored pills (confirmed =
// booking color or the themed purple default, tentative = outlined amber,
// cancelled hidden), grey-striped date blocks, multi-day spanning bars,
// today outlined.

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useLocale } from 'next-intl';
import { useMemo } from 'react';
import { buildMonthWeeks, todayIso } from '@/lib/booking/calendar';
import { pillPaint } from '@/lib/booking/bookingColors';
import type { EventTypePreset } from '@/lib/booking/eventTypePresets';
import { weekdayNarrowNames } from '@/lib/booking/dates';
import type { Booking, DateBlock } from '@/lib/booking/types';
import { pillLabel } from './format';

const CELL_MIN_HEIGHT = 88;
const LANE_HEIGHT = 22;

const STRIPES =
  'repeating-linear-gradient(135deg, transparent, transparent 6px, rgba(120,120,128,0.18) 6px, rgba(120,120,128,0.18) 12px)';

export default function CalendarGrid({
  year,
  month0,
  bookings,
  blocks,
  presets,
  onDayClick,
  onBookingClick,
}: {
  year: number;
  month0: number;
  bookings: Booking[];
  blocks: DateBlock[];
  /** Live event-type presets for type-default color resolution (null = static fallback). */
  presets?: EventTypePreset[] | null;
  onDayClick: (iso: string) => void;
  onBookingClick: (booking: Booking) => void;
}) {
  const locale = useLocale();
  const today = todayIso();
  const weeks = useMemo(
    () => buildMonthWeeks(year, month0, bookings, blocks),
    [year, month0, bookings, blocks],
  );
  const weekdays = useMemo(() => weekdayNarrowNames(locale), [locale]);

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {weekdays.map((name, i) => (
          <Typography
            key={i}
            variant="caption"
            align="center"
            color="text.secondary"
            sx={{ py: 0.5, fontWeight: 600 }}
          >
            {name}
          </Typography>
        ))}
      </Box>
      {weeks.map((week, w) => {
        const rowMinHeight = Math.max(CELL_MIN_HEIGHT, 34 + week.laneCount * LANE_HEIGHT);
        return (
          <Box key={w} sx={{ position: 'relative', borderTop: 1, borderColor: 'divider' }}>
            {/* Day cells (background layer, clickable) */}
            <Box
              sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', minHeight: rowMinHeight }}
            >
              {week.days.map((day) => {
                const isToday = day.iso === today;
                return (
                  <ButtonBase
                    key={day.iso}
                    onClick={() => onDayClick(day.iso)}
                    sx={{
                      alignItems: 'flex-start',
                      justifyContent: 'flex-start',
                      p: 0.5,
                      borderLeft: 1,
                      borderColor: 'divider',
                      '&:first-of-type': { borderLeft: 0 },
                      opacity: day.inMonth ? 1 : 0.4,
                      backgroundImage: day.blocked ? STRIPES : 'none',
                    }}
                  >
                    <Box
                      sx={{
                        width: 26,
                        height: 26,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '50%',
                        border: isToday ? 2 : 0,
                        borderColor: 'primary.main',
                      }}
                    >
                      <Typography variant="body2" fontWeight={isToday ? 700 : 400}>
                        {day.day}
                      </Typography>
                    </Box>
                  </ButtonBase>
                );
              })}
            </Box>
            {/* Booking pills (lane layer, spanning bars) */}
            <Box
              sx={{
                position: 'absolute',
                top: 34,
                left: 0,
                right: 0,
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gridAutoRows: `${LANE_HEIGHT}px`,
                columnGap: '2px',
                px: '2px',
                pointerEvents: 'none',
              }}
            >
              {week.segments.map((seg) => {
                const paint = pillPaint(seg.booking, presets);
                return (
                  <ButtonBase
                    key={`${seg.booking.id}-${seg.startCol}`}
                    onClick={() => onBookingClick(seg.booking)}
                    sx={{
                      pointerEvents: 'auto',
                      gridColumn: `${seg.startCol + 1} / span ${seg.span}`,
                      gridRow: seg.lane + 1,
                      height: LANE_HEIGHT - 3,
                      justifyContent: 'flex-start',
                      px: 0.75,
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      borderTopLeftRadius: seg.continuesLeft ? 0 : 10,
                      borderBottomLeftRadius: seg.continuesLeft ? 0 : 10,
                      borderTopRightRadius: seg.continuesRight ? 0 : 10,
                      borderBottomRightRadius: seg.continuesRight ? 0 : 10,
                      ...(paint.kind === 'tentative'
                        ? {
                            border: 1,
                            borderColor: 'warning.main',
                            color: 'warning.main',
                            bgcolor: 'transparent',
                          }
                        : paint.kind === 'custom'
                          ? {
                              bgcolor: paint.bg,
                              color: paint.fg,
                            }
                          : {
                              bgcolor: 'primary.main',
                              color: 'primary.contrastText',
                            }),
                    }}
                  >
                    <Typography variant="caption" noWrap sx={{ fontWeight: 600 }}>
                      {pillLabel(seg.booking)}
                    </Typography>
                  </ButtonBase>
                );
              })}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
