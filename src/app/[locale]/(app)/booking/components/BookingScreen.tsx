'use client';

// Booking tab home (§4.1): month calendar + summary + agenda, with the
// detail drawer, add/edit form, record-payment, block-dates and invoice
// flows. Data via the RLS-scoped Supabase browser client; degrades to the
// empty state when Supabase is not configured or no business exists yet.

import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import GlassFab from '@/components/GlassFab';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { bookingsOnDate, dayTapAction, monthRange, todayIso } from '@/lib/booking/calendar';
import { findBlockingBlocks, findConflicts } from '@/lib/booking/conflicts';
import { computeDue, monthMoneySummary } from '@/lib/booking/due';
import { formatMonthName } from '@/lib/booking/dates';
import {
  cancelBooking,
  createBooking,
  createDateBlock,
  ensureInvoiceNumber,
  fetchBusinessContext,
  fetchMonthData,
  fetchOverlaps,
  recordPayment,
  removeDateBlock,
  updateBooking,
  type BookingInput,
  type BusinessContext,
  type MonthData,
} from '@/lib/booking/repo';
import type { Booking, PaymentMethod } from '@/lib/booking/types';
import {
  fallbackPresets,
  fetchEventTypes,
  presetKindForType,
  type EventTypePreset,
} from '@/lib/booking/eventTypePresets';
import { createClient } from '@/lib/supabase/client';
import {
  buildInvoiceData,
  downloadPdf,
  fetchInvoiceFonts,
  fetchLogoPng,
  resolveInvoiceLabels,
} from '@/lib/invoice/client';
import { buildTextReceipt } from '@/lib/invoice/receipt';
import AgendaList from './AgendaList';
import BlockDatesDialog from './BlockDatesDialog';
import BookingDetail from './BookingDetail';
import BookingForm from './BookingForm';
import CalendarGrid from './CalendarGrid';
import DayBookingsDialog from './DayBookingsDialog';
import EventsAgenda from './EventsAgenda';
import MonthPickerDialog from './MonthPickerDialog';
import RecordPaymentDialog from './RecordPaymentDialog';
import SummaryCard from './SummaryCard';
import { useAgendaWindow } from './useAgendaWindow';

/** Persisted calendar view choice (localStorage). */
const VIEW_STORAGE_KEY = 'samaroh_booking_view';
type CalendarView = 'month' | 'events';

function storedView(): CalendarView | null {
  try {
    const v = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return v === 'events' || v === 'month' ? v : null;
  } catch {
    return null;
  }
}

interface FormState {
  mode: 'add' | 'edit';
  booking: Booking | null;
  initialDate: string | null;
}

export default function BookingScreen() {
  const t = useTranslations();
  const locale = useLocale();
  const db = useMemo(() => createClient(), []);

  const now = todayIso();
  const [year, setYear] = useState(Number(now.slice(0, 4)));
  const [month0, setMonth0] = useState(Number(now.slice(5, 7)) - 1);

  const [ctx, setCtx] = useState<BusinessContext | null>(null);
  const [ctxLoaded, setCtxLoaded] = useState(false);
  const [data, setData] = useState<MonthData>({ bookings: [], blocks: [], paymentsByBooking: {} });
  // The business's live event-type presets; null while loading or when the
  // table is unreadable (schema lag) — color resolution then uses the static
  // contract and the form falls back to the built-in template.
  const [presets, setPresets] = useState<EventTypePreset[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [payFor, setPayFor] = useState<Booking | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  // Month grid ↔ full agenda (events) view; the choice persists per device.
  // Starts as 'month' and reads localStorage after mount (SSR-safe).
  const [view, setView] = useState<CalendarView>('month');
  // Tapped date whose bookings the day chooser lists (null = closed).
  const [chooserDate, setChooserDate] = useState<string | null>(null);
  const agenda = useAgendaWindow(db, ctx?.business.id ?? null, view === 'events' && ctx !== null);

  useEffect(() => {
    const persisted = storedView();
    if (persisted) {
      setView(persisted);
    }
  }, []);

  function switchView(next: CalendarView) {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Private-mode storage failures just lose the persistence, not the toggle.
    }
  }

  useEffect(() => {
    let active = true;
    if (!db) {
      setCtxLoaded(true);
      setLoading(false);
      return;
    }
    fetchBusinessContext(db)
      .then((c) => {
        if (active) {
          setCtx(c);
          setCtxLoaded(true);
        }
      })
      .catch(() => {
        if (active) {
          setCtxLoaded(true);
          setLoadError(true);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [db]);

  const reload = useCallback(() => {
    if (!db || !ctx) {
      setLoading(false);
      return;
    }
    const { start, end } = monthRange(year, month0);
    setLoading(true);
    setLoadError(false);
    fetchMonthData(db, ctx.business.id, start, end)
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setLoadError(true);
        setLoading(false);
      });
  }, [db, ctx, year, month0]);

  useEffect(() => {
    if (ctxLoaded) {
      reload();
    }
  }, [ctxLoaded, reload]);

  useEffect(() => {
    let active = true;
    if (!db || !ctx) {
      return;
    }
    fetchEventTypes(db, ctx.business.id).then((p) => {
      if (active) {
        setPresets(p);
      }
    });
    return () => {
      active = false;
    };
  }, [db, ctx]);

  // The detail drawer resolves its booking from whichever view supplied it.
  const detailBooking = detailId
    ? (data.bookings.find((b) => b.id === detailId) ??
      agenda.window?.bookings.find((b) => b.id === detailId) ??
      null)
    : null;
  const detailPayments = detailBooking
    ? (data.paymentsByBooking[detailBooking.id] ?? agenda.paymentsByBooking[detailBooking.id] ?? [])
    : [];

  /** Reloads both views' data after a mutation. */
  const agendaRefresh = agenda.refresh;
  const reloadBoth = useCallback(() => {
    reload();
    agendaRefresh();
  }, [reload, agendaRefresh]);

  // Marker-kind bookings carry no payment status: the month summary's
  // Received/Pending exclude them (parity with Android).
  const summary = useMemo(
    () =>
      monthMoneySummary(
        data.bookings,
        data.paymentsByBooking,
        (eventType) => presetKindForType(presets, eventType) === 'marker',
      ),
    [data, presets],
  );

  function shiftMonth(delta: number) {
    const m = month0 + delta;
    setYear(year + Math.floor(m / 12));
    setMonth0(((m % 12) + 12) % 12);
  }

  function handleDayClick(iso: string) {
    const onDate = bookingsOnDate(iso, data.bookings);
    const action = dayTapAction(onDate.length, ctx?.permissions.create === true);
    if (action === 'chooser') {
      // Any bookings on the date (even one) → the day chooser (§4.1).
      setChooserDate(iso);
    } else if (action === 'add') {
      // Empty date → Add form with start AND end pre-selected (§4.1).
      setForm({ mode: 'add', booking: null, initialDate: iso });
    }
  }

  const checkOverlaps = useCallback(
    async (start: string, end: string, excludeId?: string) => {
      if (!db || !ctx) {
        return { conflictCount: 0, blocked: false };
      }
      const { bookings, blocks } = await fetchOverlaps(db, ctx.business.id, start, end);
      return {
        conflictCount: findConflicts(bookings, start, end, excludeId).length,
        blocked: findBlockingBlocks(blocks, start, end).length > 0,
      };
    },
    [db, ctx],
  );

  async function handleSave(input: BookingInput, advance: number) {
    if (!db || !ctx || !form) {
      return;
    }
    if (form.mode === 'edit' && form.booking) {
      await updateBooking(db, form.booking, ctx.userId, input);
    } else {
      await createBooking(db, ctx.business.id, ctx.userId, input, advance);
    }
    setForm(null);
    reloadBoth();
  }

  async function handleRecordPayment(input: {
    amount: number;
    paid_on: string;
    method: PaymentMethod;
    notes: string | null;
  }) {
    if (!db || !ctx || !payFor) {
      return;
    }
    await recordPayment(db, payFor, ctx.userId, input);
    setPayFor(null);
    setSnack(t('booking.payment.recorded'));
    reloadBoth();
  }

  async function handleCancelBooking() {
    if (!db || !ctx || !detailBooking) {
      return;
    }
    await cancelBooking(db, detailBooking, ctx.userId);
    setDetailId(null);
    reloadBoth();
  }

  async function handleInvoice(kind: 'pdf' | 'text') {
    if (!db || !ctx || !detailBooking) {
      return;
    }
    setInvoiceBusy(true);
    try {
      const number = await ensureInvoiceNumber(db, detailBooking, ctx.userId);
      const payments = data.paymentsByBooking[detailBooking.id] ?? [];
      const labels = resolveInvoiceLabels(t);
      const invoiceData = buildInvoiceData(detailBooking, payments, ctx.business, number, t);
      if (kind === 'pdf') {
        const [fonts, logoPng] = await Promise.all([fetchInvoiceFonts(), fetchLogoPng(db, ctx.business)]);
        const { renderInvoicePdf } = await import('@/lib/invoice/pdf');
        const bytes = await renderInvoicePdf({ ...invoiceData, logoPng }, labels, locale, fonts);
        downloadPdf(bytes, `${number}.pdf`);
      } else {
        const text = buildTextReceipt(invoiceData, labels, locale);
        await navigator.clipboard.writeText(text);
        setSnack(t('booking.card.text_copied'));
      }
      reloadBoth(); // pick up the frozen invoice number
    } catch {
      setSnack(t('booking.card.invoice_failed'));
    } finally {
      setInvoiceBusy(false);
    }
  }

  if (!ctxLoaded || (loading && !loadError && ctx === null && db !== null)) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }} aria-label={t('common.state.loading')}>
        <CircularProgress />
      </Box>
    );
  }

  if (!db || !ctx) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6">{t('booking.empty.no_business_title')}</Typography>
        <Typography color="text.secondary">{t('booking.empty.no_business_message')}</Typography>
      </Box>
    );
  }

  const monthLabel = `${formatMonthName(month0, locale)} ${year}`;

  return (
    <Box sx={{ pb: 10, position: 'relative' }}>
      {view === 'month' ? <SummaryCard received={summary.received} pending={summary.pending} showAmounts={ctx.permissions.view_amounts} /> : null}

      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 0.5 }}>
        {view === 'month' ? (
          <>
            <Tooltip title={t('booking.calendar.prev_month')}>
              <IconButton onClick={() => shiftMonth(-1)} aria-label={t('booking.calendar.prev_month')}>
                <ChevronLeftIcon />
              </IconButton>
            </Tooltip>
            <Button onClick={() => setPickerOpen(true)} sx={{ textTransform: 'none' }}>
              <Typography variant="h6">{monthLabel}</Typography>
            </Button>
            <Tooltip title={t('booking.calendar.next_month')}>
              <IconButton onClick={() => shiftMonth(1)} aria-label={t('booking.calendar.next_month')}>
                <ChevronRightIcon />
              </IconButton>
            </Tooltip>
            <Box sx={{ flexGrow: 1 }} />
            <Button
              size="small"
              onClick={() => {
                setYear(Number(now.slice(0, 4)));
                setMonth0(Number(now.slice(5, 7)) - 1);
              }}
            >
              {t('booking.calendar.today')}
            </Button>
          </>
        ) : (
          <>
            <Typography variant="h6" sx={{ px: 1 }}>
              {t('booking.calendar.events_title')}
            </Typography>
            <Box sx={{ flexGrow: 1 }} />
          </>
        )}
        <IconButton onClick={(e) => setMenuEl(e.currentTarget)} aria-label={t('booking.calendar.more_options')}>
          <MoreVertIcon />
        </IconButton>
        <Menu anchorEl={menuEl} open={menuEl !== null} onClose={() => setMenuEl(null)}>
          <MenuItem
            onClick={() => {
              setMenuEl(null);
              switchView(view === 'month' ? 'events' : 'month');
            }}
          >
            {view === 'month' ? t('booking.calendar.events_view') : t('booking.calendar.month_view')}
          </MenuItem>
          {ctx.permissions.edit ? (
            <MenuItem
              onClick={() => {
                setMenuEl(null);
                setBlockOpen(true);
              }}
            >
              {t('booking.calendar.block_dates')}
            </MenuItem>
          ) : null}
        </Menu>
      </Box>

      {loadError && view === 'month' ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={reload}>
              {t('common.action.retry')}
            </Button>
          }
          sx={{ mb: 2 }}
        >
          {t('booking.error.load_failed')}
        </Alert>
      ) : null}

      {view === 'events' ? (
        <EventsAgenda agenda={agenda} presets={presets} showAmounts={ctx.permissions.view_amounts} onOpen={(b) => setDetailId(b.id)} />
      ) : loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <CalendarGrid
            year={year}
            month0={month0}
            bookings={data.bookings}
            blocks={data.blocks}
            presets={presets}
            onDayClick={handleDayClick}
            onBookingClick={(b) => setDetailId(b.id)}
          />
          <AgendaList
            bookings={data.bookings}
            paymentsByBooking={data.paymentsByBooking}
            presets={presets}
            showAmounts={ctx.permissions.view_amounts}
            onOpen={(b) => setDetailId(b.id)}
          />
        </>
      )}

      {ctx.permissions.create ? (
        <Tooltip title={t('booking.calendar.add')}>
          <GlassFab
            color="primary"
            aria-label={t('booking.calendar.add')}
            onClick={() => setForm({ mode: 'add', booking: null, initialDate: null })}
            sx={{ position: 'fixed', bottom: { xs: 76, md: 24 }, right: 24 }}
          >
            <AddIcon />
          </GlassFab>
        </Tooltip>
      ) : null}

      {detailBooking ? (
        <BookingDetail
          booking={detailBooking}
          payments={detailPayments}
          business={ctx.business}
          memberNames={ctx.memberNames}
          permissions={ctx.permissions}
          presets={presets}
          invoiceBusy={invoiceBusy}
          onClose={() => setDetailId(null)}
          onEdit={() => setForm({ mode: 'edit', booking: detailBooking, initialDate: null })}
          onRecordPayment={() => setPayFor(detailBooking)}
          onCancelBooking={handleCancelBooking}
          onInvoicePdf={() => handleInvoice('pdf')}
          onInvoiceText={() => handleInvoice('text')}
        />
      ) : null}

      {chooserDate ? (
        <DayBookingsDialog
          iso={chooserDate}
          bookings={bookingsOnDate(chooserDate, data.bookings)}
          paymentsByBooking={data.paymentsByBooking}
          presets={presets}
          showAmounts={ctx.permissions.view_amounts}
          canCreate={ctx.permissions.create}
          onOpenBooking={(b) => {
            setChooserDate(null);
            setDetailId(b.id);
          }}
          onAddNew={() => {
            setForm({ mode: 'add', booking: null, initialDate: chooserDate });
            setChooserDate(null);
          }}
          onClose={() => setChooserDate(null)}
        />
      ) : null}

      {form ? (
        <BookingForm
          mode={form.mode}
          initial={form.booking}
          initialDate={form.initialDate}
          payments={form.booking ? (data.paymentsByBooking[form.booking.id] ?? []) : []}
          presets={presets ?? fallbackPresets((key) => t(key))}
          isOwner={ctx.isOwner}
          onCheckOverlaps={checkOverlaps}
          onSave={handleSave}
          onClose={() => setForm(null)}
        />
      ) : null}

      {payFor ? (
        <RecordPaymentDialog
          due={Math.max(computeDue(payFor.total_amount, data.paymentsByBooking[payFor.id] ?? []), 0)}
          onSave={handleRecordPayment}
          onClose={() => setPayFor(null)}
        />
      ) : null}

      {blockOpen ? (
        <BlockDatesDialog
          blocks={data.blocks}
          onCreate={async (input) => {
            await createDateBlock(db, ctx.business.id, ctx.userId, input);
            setBlockOpen(false);
            reload();
          }}
          onRemove={async (id) => {
            const block = data.blocks.find((b) => b.id === id);
            if (!block) {
              return;
            }
            await removeDateBlock(db, block);
            reload();
          }}
          onClose={() => setBlockOpen(false)}
        />
      ) : null}

      {pickerOpen ? (
        <MonthPickerDialog
          year={year}
          month0={month0}
          onPick={(y, m) => {
            setYear(y);
            setMonth0(m);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}

      <Snackbar
        open={snack !== null}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        message={snack}
      />
    </Box>
  );
}
