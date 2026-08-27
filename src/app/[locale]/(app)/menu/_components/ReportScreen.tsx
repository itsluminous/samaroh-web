'use client';

/**
 * One screen renders all 10 reports (§4.4), keyed by the dynamic route
 * segment: fetch → pure compute (src/lib/reports/compute) → hand-rolled
 * chart + table + CSV download. Access is gated on `reports.view`
 * (owners implicitly pass).
 */
import DownloadIcon from '@mui/icons-material/Download';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCurrentInventory } from '@/app/[locale]/(app)/inventory/_lib/queries';
import { isBuiltInEventType } from '@/lib/booking/eventTypes';
import { formatAmount } from '@/lib/format/amount';
import { useMembership } from '@/lib/permissions/useMembership';
import {
  collectionEfficiency,
  duesByBucket,
  eventTypeBreakdown,
  expenseSummaryByMonth,
  monthOf,
  occupancyByMonth,
  outstandingDues,
  partitionExpensesByParty,
  personalSpendByMonth,
  personalSpendByParty,
  profitByMonth,
  profitTotals,
  revenueByMonth,
  sourceBreakdown,
  sumBy,
  topPartiesBySpend,
  type AgingBucket,
} from '@/lib/reports/compute';
import { csvAmount, downloadCsv, toCsvSections, type CsvSection } from '@/lib/reports/csv';
import {
  fetchBookingsWithPayments,
  fetchExpensesInRange,
  fetchInventoryPurchasesInRange,
  fetchPartyNames,
  fetchPaymentsInRange,
} from '@/lib/reports/queries';
import type { DateRange, ReportKey } from '@/lib/reports/types';
import { BarChart, HBarList, LineChart, type BarDatum, type HBarRow, type LineSeries } from './charts';
import DateRangeFilter, { presetRange, type RangePreset } from './DateRangeFilter';

type ChartColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error';

type ChartSpec =
  | { kind: 'bars'; data: { label: string; segments: { value: number; color: ChartColor }[] }[] }
  | { kind: 'lines'; labels: string[]; series: { color: ChartColor; values: number[] }[] }
  | { kind: 'hbars'; rows: HBarRow[]; color?: ChartColor };

interface ReportModel {
  chart: ChartSpec | null;
  /** Legend entries: label + swatch color. */
  legend: { label: string; color: ChartColor }[];
  headers: string[];
  rows: string[][];
  /**
   * Screen-formatted TOTAL row (first cell is the total label) — present on
   * every money table, absent on non-money tables (occupancy, collection).
   */
  totalRow?: string[];
  /** Secondary titled table rendered below the main one. */
  extraTable?: { title: string; headers: string[]; rows: string[][]; totalRow?: string[] };
  /**
   * CSV export sections: plain decimal numbers (no ₹, no digit grouping) and
   * unambiguous dates (yyyy-mm months, yyyy-mm-dd dates), with the same TOTAL
   * rows as on screen.
   */
  csv: CsvSection[];
  /** Optional headline (e.g. overall average) rendered above the chart. */
  headline: string | null;
  empty: boolean;
  /** Report-specific empty state (falls back to the generic reports.empty.*). */
  emptyTitle?: string;
  emptyMessage?: string;
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const AGING_BUCKETS: AgingBucket[] = ['0_7', '8_30', '31_90', '90_plus'];

async function buildModel(
  db: SupabaseClient,
  businessId: string,
  key: ReportKey,
  range: DateRange,
  t: Translate,
  monthLabel: (m: string) => string,
  percent: (v: number) => string,
): Promise<ReportModel> {
  const money = (v: number) => formatAmount(v);
  const totalLabel = t('reports.table.total_row');
  switch (key) {
    case 'revenue': {
      const { bookings, payments } = await fetchBookingsWithPayments(db, businessId, range);
      const rows = revenueByMonth(bookings, payments, range);
      const totals = {
        collected: sumBy(rows, (r) => r.collected),
        outstanding: sumBy(rows, (r) => r.outstanding),
        total: sumBy(rows, (r) => r.total),
      };
      const headers = [
        t('reports.table.month'),
        t('reports.table.collected'),
        t('reports.table.outstanding'),
        t('reports.table.total'),
      ];
      return {
        chart: {
          kind: 'bars',
          data: rows.map((r) => ({
            label: monthLabel(r.month),
            segments: [
              { value: r.collected, color: 'success' },
              { value: r.outstanding, color: 'warning' },
            ],
          })),
        },
        legend: [
          { label: t('reports.legend.collected'), color: 'success' },
          { label: t('reports.legend.outstanding'), color: 'warning' },
        ],
        headers,
        rows: rows.map((r) => [monthLabel(r.month), money(r.collected), money(r.outstanding), money(r.total)]),
        totalRow: [totalLabel, money(totals.collected), money(totals.outstanding), money(totals.total)],
        csv: [
          {
            headers,
            rows: [
              ...rows.map((r) => [r.month, csvAmount(r.collected), csvAmount(r.outstanding), csvAmount(r.total)]),
              [totalLabel, csvAmount(totals.collected), csvAmount(totals.outstanding), csvAmount(totals.total)],
            ],
          },
        ],
        headline: null,
        empty: rows.every((r) => r.total === 0),
      };
    }
    case 'dues_aging': {
      const { bookings, payments } = await fetchBookingsWithPayments(db, businessId, range);
      const dues = outstandingDues(bookings, payments, todayIso());
      const buckets = duesByBucket(dues);
      const totalDue = sumBy(dues, (d) => d.due);
      const headers = [
        t('reports.table.customer'),
        t('reports.table.event'),
        t('reports.table.end_date'),
        t('reports.table.due'),
        t('reports.table.days_overdue'),
      ];
      const eventLabel = (d: (typeof dues)[number]) =>
        isBuiltInEventType(d.eventType) ? t(`booking.event_type.${d.eventType}`) : d.eventType;
      return {
        chart: {
          kind: 'bars',
          data: AGING_BUCKETS.map((bucket) => ({
            label: t(`reports.aging.bucket_${bucket}`),
            segments: [{ value: buckets[bucket], color: 'error' }],
          })),
        },
        legend: [{ label: t('reports.legend.outstanding'), color: 'error' }],
        headers,
        rows: dues.map((d) => [
          d.customer,
          `${d.eventIcon} ${eventLabel(d)}`,
          d.endDate,
          money(d.due),
          String(d.daysOverdue),
        ]),
        totalRow: [totalLabel, '', '', money(totalDue), ''],
        csv: [
          {
            headers,
            rows: [
              ...dues.map((d) => [d.customer, eventLabel(d), d.endDate, csvAmount(d.due), d.daysOverdue]),
              [totalLabel, '', '', csvAmount(totalDue), ''],
            ],
          },
        ],
        headline: null,
        empty: dues.length === 0,
      };
    }
    case 'occupancy': {
      const { bookings } = await fetchBookingsWithPayments(db, businessId, range);
      const rows = occupancyByMonth(bookings, range);
      const headers = [t('reports.table.month'), t('reports.table.booked_days'), t('reports.table.utilization')];
      return {
        chart: {
          kind: 'bars',
          data: rows.map((r) => ({
            label: monthLabel(r.month),
            segments: [{ value: r.bookedDays, color: 'primary' }],
          })),
        },
        legend: [{ label: t('reports.legend.booked_days'), color: 'primary' }],
        headers,
        rows: rows.map((r) => [monthLabel(r.month), String(r.bookedDays), percent(r.utilization)]),
        csv: [
          {
            headers,
            rows: rows.map((r) => [r.month, r.bookedDays, (r.utilization * 100).toFixed(1)]),
          },
        ],
        headline: null,
        empty: rows.every((r) => r.bookedDays === 0),
      };
    }
    case 'event_types':
    case 'sources': {
      const { bookings } = await fetchBookingsWithPayments(db, businessId, range);
      const rows = key === 'event_types' ? eventTypeBreakdown(bookings) : sourceBreakdown(bookings);
      const labelOf = (rowKey: string) =>
        key === 'event_types'
          ? isBuiltInEventType(rowKey)
            ? t(`booking.event_type.${rowKey}`)
            : rowKey
          : t(`booking.source.${rowKey}`);
      const totalCount = sumBy(rows, (r) => r.count);
      const totalRevenue = sumBy(rows, (r) => r.revenue);
      const headers = [
        key === 'event_types' ? t('reports.table.event_type') : t('reports.table.source'),
        t('reports.table.bookings'),
        t('reports.table.revenue'),
      ];
      return {
        chart: {
          kind: 'hbars',
          rows: rows.map((r) => ({ label: labelOf(r.key), value: r.revenue, display: money(r.revenue) })),
        },
        legend: [{ label: t('reports.legend.revenue'), color: 'primary' }],
        headers,
        rows: rows.map((r) => [labelOf(r.key), String(r.count), money(r.revenue)]),
        totalRow: [totalLabel, String(totalCount), money(totalRevenue)],
        csv: [
          {
            headers,
            rows: [
              ...rows.map((r) => [labelOf(r.key), r.count, csvAmount(r.revenue)]),
              [totalLabel, totalCount, csvAmount(totalRevenue)],
            ],
          },
        ],
        headline: null,
        empty: rows.length === 0,
      };
    }
    case 'expense_summary': {
      const [expenses, parties, purchases] = await Promise.all([
        fetchExpensesInRange(db, businessId, range),
        fetchPartyNames(db, businessId),
        fetchInventoryPurchasesInRange(db, businessId, range),
      ]);
      // Personal parties are excluded — their spend lives in the personal-expenses report.
      const { business } = partitionExpensesByParty(expenses, parties);
      const monthly = expenseSummaryByMonth(business, purchases, range);
      const top = topPartiesBySpend(business, parties);
      const inventoryLabel = t('reports.expense.inventory_purchases_label');
      const totals = {
        ledger: sumBy(monthly, (r) => r.ledger),
        inventory: sumBy(monthly, (r) => r.inventory),
        total: sumBy(monthly, (r) => r.total),
      };
      const headers = [
        t('reports.table.month'),
        t('reports.table.expenses'),
        inventoryLabel,
        t('reports.table.total'),
      ];
      return {
        chart: {
          kind: 'bars',
          data: monthly.map((r) => ({
            label: monthLabel(r.month),
            segments: [
              { value: r.ledger, color: 'secondary' },
              { value: r.inventory, color: 'warning' },
            ],
          })),
        },
        legend: [
          { label: t('reports.legend.spend'), color: 'secondary' },
          { label: inventoryLabel, color: 'warning' },
        ],
        headers,
        rows: monthly.map((r) => [monthLabel(r.month), money(r.ledger), money(r.inventory), money(r.total)]),
        totalRow: [totalLabel, money(totals.ledger), money(totals.inventory), money(totals.total)],
        csv: [
          {
            headers,
            rows: [
              ...monthly.map((r) => [r.month, csvAmount(r.ledger), csvAmount(r.inventory), csvAmount(r.total)]),
              [totalLabel, csvAmount(totals.ledger), csvAmount(totals.inventory), csvAmount(totals.total)],
            ],
          },
        ],
        extraTable: {
          title: t('reports.report.expense_summary_subtitle'),
          headers: [t('reports.table.party'), t('reports.table.spend')],
          rows: top.map((r) => [r.name, money(r.spend)]),
        },
        headline: null,
        empty: monthly.every((r) => r.total === 0),
      };
    }
    case 'profit': {
      const [payments, expenses, parties, purchases] = await Promise.all([
        fetchPaymentsInRange(db, businessId, range),
        fetchExpensesInRange(db, businessId, range),
        fetchPartyNames(db, businessId),
        fetchInventoryPurchasesInRange(db, businessId, range),
      ]);
      // Personal-party ledger entries stay out of the P&L in both directions.
      const { business } = partitionExpensesByParty(expenses, parties);
      const rows = profitByMonth(payments, business, purchases, range);
      const totals = profitTotals(rows);
      const headers = [
        t('reports.table.month'),
        t('reports.table.income'),
        t('reports.table.expenses'),
        t('reports.table.net'),
      ];
      return {
        chart: {
          kind: 'lines',
          labels: rows.map((r) => monthLabel(r.month)),
          series: [
            { color: 'success', values: rows.map((r) => r.income) },
            { color: 'error', values: rows.map((r) => r.spend) },
            { color: 'primary', values: rows.map((r) => r.net) },
          ],
        },
        legend: [
          { label: t('reports.table.income'), color: 'success' },
          { label: t('reports.table.expenses'), color: 'error' },
          { label: t('reports.legend.net'), color: 'primary' },
        ],
        headers,
        rows: rows.map((r) => [monthLabel(r.month), money(r.income), money(r.spend), money(r.net)]),
        totalRow: [totalLabel, money(totals.income), money(totals.spend), money(totals.net)],
        csv: [
          {
            headers,
            rows: [
              ...rows.map((r) => [r.month, csvAmount(r.income), csvAmount(r.spend), csvAmount(r.net)]),
              [totalLabel, csvAmount(totals.income), csvAmount(totals.spend), csvAmount(totals.net)],
            ],
          },
        ],
        headline: null,
        empty: rows.every((r) => r.income === 0 && r.spend === 0),
      };
    }
    case 'personal_expenses': {
      const [expenses, parties] = await Promise.all([
        fetchExpensesInRange(db, businessId, range),
        fetchPartyNames(db, businessId),
      ]);
      const monthly = personalSpendByMonth(expenses, parties, range);
      const byParty = personalSpendByParty(expenses, parties);
      const totalSpend = sumBy(monthly, (r) => r.spend);
      const headers = [t('reports.table.month'), t('reports.table.spend')];
      const partyHeaders = [t('reports.table.party'), t('reports.table.spend')];
      const partyTitle = t('reports.report.personal_expenses_subtitle');
      return {
        chart: {
          kind: 'bars',
          data: monthly.map((r) => ({
            label: monthLabel(r.month),
            segments: [{ value: r.spend, color: 'secondary' }],
          })),
        },
        legend: [{ label: t('reports.legend.spend'), color: 'secondary' }],
        headers,
        rows: monthly.map((r) => [monthLabel(r.month), money(r.spend)]),
        totalRow: [totalLabel, money(totalSpend)],
        extraTable: {
          title: partyTitle,
          headers: partyHeaders,
          rows: byParty.map((r) => [r.name, money(r.spend)]),
          totalRow: [totalLabel, money(totalSpend)],
        },
        csv: [
          {
            headers,
            rows: [
              ...monthly.map((r) => [r.month, csvAmount(r.spend)]),
              [totalLabel, csvAmount(totalSpend)],
            ],
          },
          {
            title: partyTitle,
            headers: partyHeaders,
            rows: [
              ...byParty.map((r) => [r.name, csvAmount(r.spend)]),
              [totalLabel, csvAmount(totalSpend)],
            ],
          },
        ],
        headline: null,
        empty: totalSpend === 0 && byParty.length === 0,
        emptyTitle: t('reports.personal_expenses.empty_title'),
        emptyMessage: t('reports.personal_expenses.empty_message'),
      };
    }
    case 'inventory_valuation': {
      const inventory = await fetchCurrentInventory(db, businessId);
      const held = inventory.filter((r) => r.currentQuantity > 0).sort((a, b) => b.currentValue - a.currentValue);
      const totalValue = sumBy(held, (r) => r.currentValue);
      const headers = [t('reports.table.item'), t('reports.table.quantity'), t('reports.table.value')];
      return {
        chart: {
          kind: 'hbars',
          rows: held.map((r) => ({ label: r.name, value: r.currentValue, display: money(r.currentValue) })),
        },
        legend: [{ label: t('reports.legend.value'), color: 'primary' }],
        headers,
        rows: held.map((r) => [r.name, `${r.currentQuantity} ${r.unit}`, money(r.currentValue)]),
        totalRow: [totalLabel, '', money(totalValue)],
        csv: [
          {
            headers,
            rows: [
              ...held.map((r) => [r.name, `${r.currentQuantity} ${r.unit}`, csvAmount(r.currentValue)]),
              [totalLabel, '', csvAmount(totalValue)],
            ],
          },
        ],
        headline: null,
        empty: held.length === 0,
      };
    }
    case 'collection': {
      const { bookings, payments } = await fetchBookingsWithPayments(db, businessId, range);
      const summary = collectionEfficiency(bookings, payments, todayIso());
      // Average days per month of event end, for the trend chart.
      const byMonth = new Map<string, { total: number; count: number }>();
      for (const row of summary.rows) {
        const m = monthOf(row.endDate);
        const agg = byMonth.get(m) ?? { total: 0, count: 0 };
        agg.total += row.daysToPay;
        agg.count += 1;
        byMonth.set(m, agg);
      }
      const months = [...byMonth.keys()].sort();
      const headers = [
        t('reports.table.customer'),
        t('reports.table.end_date'),
        t('reports.table.paid_on'),
        t('reports.table.days_to_pay'),
      ];
      return {
        chart: {
          kind: 'bars',
          data: months.map((m) => {
            const agg = byMonth.get(m)!;
            return {
              label: monthLabel(m),
              segments: [{ value: Math.round(agg.total / agg.count), color: 'primary' }],
            };
          }),
        },
        legend: [{ label: t('reports.legend.avg_days'), color: 'primary' }],
        headers,
        rows: summary.rows.map((r) => [r.customer, r.endDate, r.paidOn, String(r.daysToPay)]),
        csv: [
          {
            headers,
            rows: summary.rows.map((r) => [r.customer, r.endDate, r.paidOn, r.daysToPay]),
          },
        ],
        headline:
          summary.averageDays === null
            ? null
            : `${t('reports.legend.avg_days')}: ${Math.round(summary.averageDays)}`,
        empty: summary.rows.length === 0,
      };
    }
  }
}

export default function ReportScreen({ reportKey }: { reportKey: ReportKey }) {
  const t = useTranslations();
  const locale = useLocale();
  const theme = useTheme();
  const { supabase, business, isOwner, permissions, loading: memberLoading } = useMembership();

  const [preset, setPreset] = useState<RangePreset>('last_12_months');
  const [range, setRange] = useState<DateRange>(() => presetRange('last_12_months'));
  const [model, setModel] = useState<ReportModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const monthLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' });
    return (month: string) => fmt.format(new Date(`${month}-01T00:00:00Z`));
  }, [locale]);
  const percent = useMemo(() => {
    const fmt = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
    return (v: number) => fmt.format(v);
  }, [locale]);

  const canView = isOwner || permissions.reports.view;

  useEffect(() => {
    if (!supabase || !business || !canView) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    buildModel(supabase, business.id, reportKey, range, t, monthLabel, percent)
      .then((m) => {
        if (!cancelled) {
          setModel(m);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, business, canView, reportKey, range, t, monthLabel, percent]);

  /** Compact ₹ axis labels via the shared catalog (₹12L, ₹3.5Cr …). */
  const axisAmount = (v: number): string => {
    if (v >= 1_00_00_000) {
      return t('reports.amount.crore', { amount: trimmed(v / 1_00_00_000) });
    }
    if (v >= 1_00_000) {
      return t('reports.amount.lakh', { amount: trimmed(v / 1_00_000) });
    }
    if (v >= 1_000) {
      return t('reports.amount.thousand', { amount: trimmed(v / 1_000) });
    }
    return formatAmount(v, { decimals: 0 });
  };
  const isMoneyChart = reportKey !== 'occupancy' && reportKey !== 'collection';
  const axisValue = (v: number) => (isMoneyChart ? axisAmount(v) : String(Math.round(v)));

  if (memberLoading || loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!canView) {
    return (
      <Alert severity="warning">
        <Typography variant="subtitle2">{t('reports.permission.denied_title')}</Typography>
        {t('reports.permission.denied_message')}
      </Alert>
    );
  }
  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }
  if (!supabase || !business || !model) {
    return (
      <Alert severity="info">
        <Typography variant="subtitle2">{t('reports.empty.title')}</Typography>
        {t('reports.empty.message')}
      </Alert>
    );
  }

  const colorOf = (c: ChartColor) => theme.palette[c].main;

  const handleDownload = () => {
    downloadCsv(`${reportKey}-${range.start}-${range.end}.csv`, toCsvSections(model.csv));
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" component="h1">
          {t(`reports.report.${reportKey}`)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t(`reports.report.${reportKey}_subtitle`)}
        </Typography>
      </Box>

      {reportKey !== 'inventory_valuation' ? (
        <DateRangeFilter
          range={range}
          preset={preset}
          onChange={(r, p) => {
            setRange(r);
            setPreset(p);
          }}
        />
      ) : null}

      {model.empty ? (
        <Alert severity="info">
          <Typography variant="subtitle2">{model.emptyTitle ?? t('reports.empty.title')}</Typography>
          {model.emptyMessage ?? t('reports.empty.message')}
        </Alert>
      ) : (
        <>
          {model.headline ? <Typography variant="h6">{model.headline}</Typography> : null}

          {model.chart ? (
            <Paper variant="outlined" sx={{ p: 2 }}>
              {model.chart.kind === 'bars' ? (
                <BarChart
                  data={model.chart.data.map(
                    (d): BarDatum => ({
                      label: d.label,
                      segments: d.segments.map((s) => ({ value: s.value, color: colorOf(s.color) })),
                    }),
                  )}
                  ariaLabel={t(`reports.report.${reportKey}`)}
                  formatValue={axisValue}
                />
              ) : null}
              {model.chart.kind === 'lines' ? (
                <LineChart
                  labels={model.chart.labels}
                  series={model.chart.series.map(
                    (s): LineSeries => ({ color: colorOf(s.color), values: s.values }),
                  )}
                  ariaLabel={t(`reports.report.${reportKey}`)}
                  formatValue={axisValue}
                />
              ) : null}
              {model.chart.kind === 'hbars' ? <HBarList rows={model.chart.rows} /> : null}
              {model.legend.length > 0 && model.chart.kind !== 'hbars' ? (
                <Stack direction="row" spacing={2} sx={{ mt: 1, flexWrap: 'wrap' }}>
                  {model.legend.map((entry) => (
                    <Stack key={entry.label} direction="row" spacing={0.75} alignItems="center">
                      <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: colorOf(entry.color) }} />
                      <Typography variant="caption" color="text.secondary">
                        {entry.label}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              ) : null}
            </Paper>
          ) : null}

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  {model.headers.map((h) => (
                    <TableCell key={h}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {model.rows.map((row, i) => (
                  <TableRow key={i}>
                    {row.map((cell, j) => (
                      <TableCell key={j}>{cell}</TableCell>
                    ))}
                  </TableRow>
                ))}
                {model.totalRow ? (
                  <TableRow sx={{ '& td': { fontWeight: 'bold', borderTop: 2, borderColor: 'divider' } }}>
                    {model.totalRow.map((cell, j) => (
                      <TableCell key={j}>{cell}</TableCell>
                    ))}
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </TableContainer>

          {model.extraTable && model.extraTable.rows.length > 0 ? (
            <Box>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                {model.extraTable.title}
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {model.extraTable.headers.map((h) => (
                        <TableCell key={h}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {model.extraTable.rows.map((row, i) => (
                      <TableRow key={i}>
                        {row.map((cell, j) => (
                          <TableCell key={j}>{cell}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {model.extraTable.totalRow ? (
                      <TableRow sx={{ '& td': { fontWeight: 'bold', borderTop: 2, borderColor: 'divider' } }}>
                        {model.extraTable.totalRow.map((cell, j) => (
                          <TableCell key={j}>{cell}</TableCell>
                        ))}
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          ) : null}

          <Box>
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleDownload}>
              {t('reports.export.download_csv')}
            </Button>
          </Box>
        </>
      )}
    </Stack>
  );
}

/** 1 decimal, trailing .0 trimmed — for compact axis amounts. */
function trimmed(v: number): string {
  const fixed = v.toFixed(1);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
}
