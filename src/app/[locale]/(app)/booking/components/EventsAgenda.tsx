'use client';

// Events view: the full agenda list of ALL bookings grouped by date,
// replacing the month grid. Opens anchored on today; scrolling to the top
// loads earlier bookings, scrolling to the bottom loads later ones (windowed
// pages via useAgendaWindow — never everything at once). Rows are
// colour-tinted BookingRows; tapping one opens the same detail drawer as the
// month view.

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import List from '@mui/material/List';
import Typography from '@mui/material/Typography';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { groupAgenda, todayAnchorIndex, type AgendaGroup } from '@/lib/booking/agenda';
import { formatDate } from '@/lib/booking/dates';
import type { EventTypePreset } from '@/lib/booking/eventTypePresets';
import type { Booking } from '@/lib/booking/types';
import type { AgendaWindowState } from './useAgendaWindow';
import BookingRow from './BookingRow';

export default function EventsAgenda({
  agenda,
  presets,
  onOpen,
}: {
  agenda: AgendaWindowState;
  presets?: EventTypePreset[] | null;
  onOpen: (booking: Booking) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<HTMLLIElement | null>(null);
  // Initial today-positioning must happen before the top sentinel may trigger
  // past loads; prepends then preserve the visual scroll position.
  const positionedRef = useRef(false);
  const prependHeightRef = useRef<number | null>(null);
  const loadMoreRef = useRef(agenda.loadMore);
  loadMoreRef.current = agenda.loadMore;

  const groups = groupAgenda(agenda.window?.bookings ?? []);
  const anchorIndex = todayAnchorIndex(groups, agenda.today);
  const bookingCount = agenda.window?.bookings.length ?? 0;
  const hasWindow = agenda.window !== null;

  // Position on today once the first window arrives.
  useLayoutEffect(() => {
    if (positionedRef.current || agenda.window === null) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const anchor = anchorRef.current;
    if (anchor) {
      container.scrollTop = Math.max(anchor.offsetTop - container.offsetTop - 8, 0);
    } else {
      container.scrollTop = container.scrollHeight; // everything is in the past
    }
    positionedRef.current = true;
  }, [agenda.window]);

  // Keep the viewport stable when a past page is prepended above it.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const before = prependHeightRef.current;
    if (container && before !== null && container.scrollHeight !== before) {
      container.scrollTop += container.scrollHeight - before;
      prependHeightRef.current = null;
    }
  }, [bookingCount]);

  // Sentinel observers (no-ops where IntersectionObserver is unavailable, e.g. jsdom).
  useEffect(() => {
    const container = containerRef.current;
    const top = topSentinelRef.current;
    const bottom = bottomSentinelRef.current;
    if (typeof IntersectionObserver === 'undefined' || !container || !top || !bottom) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || !positionedRef.current) {
            continue;
          }
          if (entry.target === top) {
            prependHeightRef.current = container.scrollHeight;
            loadMoreRef.current('past');
          } else {
            loadMoreRef.current('future');
          }
        }
      },
      { root: container, rootMargin: '120px' },
    );
    observer.observe(top);
    observer.observe(bottom);
    return () => observer.disconnect();
  }, [hasWindow]);

  if (agenda.error && agenda.window === null) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={agenda.retry}>
            {t('common.action.retry')}
          </Button>
        }
        sx={{ mb: 2 }}
      >
        {t('booking.error.load_failed')}
      </Alert>
    );
  }

  if (agenda.loading || agenda.window === null) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }} aria-label={t('common.state.loading')}>
        <CircularProgress />
      </Box>
    );
  }

  if (groups.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        {t('booking.calendar.events_empty')}
      </Typography>
    );
  }

  return (
    <Box
      ref={containerRef}
      sx={{
        overflowY: 'auto',
        maxHeight: { xs: 'calc(100dvh - 240px)', md: 'calc(100dvh - 200px)' },
        minHeight: 240,
      }}
    >
      <Box ref={topSentinelRef} sx={{ height: 1 }} />
      {agenda.loadingPast ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }} aria-label={t('common.state.loading')}>
          <CircularProgress size={20} />
        </Box>
      ) : null}
      <List disablePadding>
        {groups.map((group: AgendaGroup, i) => {
          const isToday = group.date === agenda.today;
          return (
            <Box
              component="li"
              key={group.date}
              ref={i === anchorIndex ? anchorRef : undefined}
              sx={{ listStyle: 'none' }}
            >
              <Typography
                variant="subtitle2"
                sx={{
                  mt: i === 0 ? 0 : 1.5,
                  mb: 0.5,
                  color: isToday ? 'primary.main' : 'text.secondary',
                  fontWeight: isToday ? 700 : 600,
                }}
              >
                {formatDate(group.date, locale)}
                {isToday ? ` \u2022 ${t('booking.calendar.today')}` : ''}
              </Typography>
              <List disablePadding>
                {group.bookings.map((booking) => (
                  <BookingRow
                    key={booking.id}
                    booking={booking}
                    payments={agenda.paymentsByBooking[booking.id] ?? []}
                    presets={presets}
                    onClick={() => onOpen(booking)}
                  />
                ))}
              </List>
            </Box>
          );
        })}
      </List>
      {agenda.loadingFuture ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }} aria-label={t('common.state.loading')}>
          <CircularProgress size={20} />
        </Box>
      ) : null}
      <Box ref={bottomSentinelRef} sx={{ height: 1 }} />
    </Box>
  );
}
