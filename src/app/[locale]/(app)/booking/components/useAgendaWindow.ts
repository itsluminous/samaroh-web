'use client';

// Fetch orchestration for the events (full-agenda) view: an AgendaWindow that
// grows page-by-page in either direction, plus the payments of the loaded
// bookings (for the due/paid chips). Lives in BookingScreen so the detail
// drawer can resolve agenda-opened bookings too.

import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyAgendaPage,
  fetchAgendaPage,
  fetchAgendaRange,
  initialAgendaWindow,
  type AgendaDirection,
  type AgendaWindow,
} from '@/lib/booking/agenda';
import { todayIso } from '@/lib/booking/calendar';
import { fetchPaymentsByBooking } from '@/lib/booking/repo';
import type { Booking, BookingPayment } from '@/lib/booking/types';

export interface AgendaWindowState {
  /** Null until the first (both-direction) load resolves. */
  window: AgendaWindow | null;
  paymentsByBooking: Record<string, BookingPayment[]>;
  today: string;
  loading: boolean;
  loadingPast: boolean;
  loadingFuture: boolean;
  error: boolean;
  loadMore: (direction: AgendaDirection) => void;
  /** Re-reads the loaded range after a mutation (keeps the scroll window). */
  refresh: () => void;
  retry: () => void;
}

export function useAgendaWindow(
  db: SupabaseClient | null,
  businessId: string | null,
  active: boolean,
): AgendaWindowState {
  const [win, setWin] = useState<AgendaWindow | null>(null);
  const [paymentsByBooking, setPaymentsByBooking] = useState<Record<string, BookingPayment[]>>({});
  const [loading, setLoading] = useState(false);
  const [loadingPast, setLoadingPast] = useState(false);
  const [loadingFuture, setLoadingFuture] = useState(false);
  const [error, setError] = useState(false);
  const todayRef = useRef(todayIso());
  // Guards: one in-flight request per direction; a generation counter drops
  // stale results when the business changes.
  const busyRef = useRef<{ past: boolean; future: boolean; refresh: boolean }>({
    past: false,
    future: false,
    refresh: false,
  });
  const generationRef = useRef(0);
  const windowRef = useRef<AgendaWindow | null>(null);
  windowRef.current = win;

  const mergePayments = useCallback((next: Record<string, BookingPayment[]>) => {
    setPaymentsByBooking((prev) => ({ ...prev, ...next }));
  }, []);

  const loadInitial = useCallback(() => {
    if (!db || !businessId) {
      return;
    }
    const generation = ++generationRef.current;
    const today = todayIso();
    todayRef.current = today;
    const start = initialAgendaWindow(today);
    setLoading(true);
    setError(false);
    Promise.all([
      fetchAgendaPage(db, businessId, 'past', start.past),
      fetchAgendaPage(db, businessId, 'future', start.future),
    ])
      .then(async ([pastRows, futureRows]) => {
        let merged = applyAgendaPage(start, 'past', pastRows);
        merged = applyAgendaPage(merged, 'future', futureRows);
        const payments = await fetchPaymentsByBooking(db, merged.bookings.map((b) => b.id));
        if (generation !== generationRef.current) {
          return;
        }
        setWin(merged);
        setPaymentsByBooking(payments);
        setLoading(false);
      })
      .catch(() => {
        if (generation !== generationRef.current) {
          return;
        }
        setError(true);
        setLoading(false);
      });
  }, [db, businessId]);

  // Load once when the view first becomes active (data is kept when the user
  // toggles back to month view, so returning is instant).
  useEffect(() => {
    if (active && win === null && !loading && !error) {
      loadInitial();
    }
  }, [active, win, loading, error, loadInitial]);

  // Reset when the business changes.
  useEffect(() => {
    generationRef.current += 1;
    busyRef.current = { past: false, future: false, refresh: false };
    setWin(null);
    setPaymentsByBooking({});
    setLoading(false);
    setError(false);
  }, [db, businessId]);

  const loadMore = useCallback(
    (direction: AgendaDirection) => {
      const current = windowRef.current;
      if (!db || !businessId || !current || busyRef.current[direction]) {
        return;
      }
      const cursor = direction === 'past' ? current.past : current.future;
      if (cursor.exhausted) {
        return;
      }
      busyRef.current[direction] = true;
      const generation = generationRef.current;
      const setBusy = direction === 'past' ? setLoadingPast : setLoadingFuture;
      setBusy(true);
      fetchAgendaPage(db, businessId, direction, cursor)
        .then(async (rows) => {
          const payments = await fetchPaymentsByBooking(db, rows.map((b) => b.id));
          if (generation !== generationRef.current) {
            return;
          }
          setWin((prev) => (prev ? applyAgendaPage(prev, direction, rows) : prev));
          mergePayments(payments);
        })
        .catch(() => {
          if (generation === generationRef.current) {
            setError(true);
          }
        })
        .finally(() => {
          busyRef.current[direction] = false;
          if (generation === generationRef.current) {
            setBusy(false);
          }
        });
    },
    [db, businessId, mergePayments],
  );

  const refresh = useCallback(() => {
    const current = windowRef.current;
    if (!db || !businessId || busyRef.current.refresh) {
      return;
    }
    if (!current || current.bookings.length === 0) {
      setWin(null); // triggers a fresh initial load next time the view is active
      return;
    }
    const first = current.bookings[0] as Booking;
    const last = current.bookings[current.bookings.length - 1] as Booking;
    busyRef.current.refresh = true;
    const generation = generationRef.current;
    fetchAgendaRange(db, businessId, first.start_date, last.start_date)
      .then(async (rows) => {
        const payments = await fetchPaymentsByBooking(db, rows.map((b) => b.id));
        if (generation !== generationRef.current) {
          return;
        }
        setWin((prev) => (prev ? { ...prev, bookings: rows } : prev));
        setPaymentsByBooking(payments);
      })
      .catch(() => undefined) // best effort — the window keeps its last data
      .finally(() => {
        busyRef.current.refresh = false;
      });
  }, [db, businessId]);

  const retry = useCallback(() => {
    setError(false);
    if (windowRef.current === null) {
      loadInitial();
    }
  }, [loadInitial]);

  return {
    window: win,
    paymentsByBooking,
    today: todayRef.current,
    loading,
    loadingPast,
    loadingFuture,
    error,
    loadMore,
    refresh,
    retry,
  };
}
