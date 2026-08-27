'use client';

/**
 * Date-range filter shared by all report pages (§4.4): quick presets
 * (this month / 3 months / 12 months) plus a custom from–to picker.
 */
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ChipRow from '@/components/ChipRow';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { DateRange } from '@/lib/reports/types';

export type RangePreset = 'this_month' | 'last_3_months' | 'last_12_months' | 'custom';

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function presetRange(preset: Exclude<RangePreset, 'custom'>, today = new Date()): DateRange {
  const end = iso(today);
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  if (preset === 'this_month') {
    return { start: iso(new Date(Date.UTC(y, m, 1))), end };
  }
  if (preset === 'last_3_months') {
    return { start: iso(new Date(Date.UTC(y, m - 2, 1))), end };
  }
  return { start: iso(new Date(Date.UTC(y, m - 11, 1))), end };
}

export default function DateRangeFilter({
  range,
  preset,
  onChange,
}: {
  range: DateRange;
  preset: RangePreset;
  onChange: (range: DateRange, preset: RangePreset) => void;
}) {
  const t = useTranslations('reports.range');
  const [custom, setCustom] = useState<DateRange>(range);

  const presets: Exclude<RangePreset, 'custom'>[] = ['this_month', 'last_3_months', 'last_12_months'];

  return (
    <Box>
      <ChipRow>
        {presets.map((p) => (
          <Chip
            key={p}
            label={t(p)}
            color={preset === p ? 'primary' : 'default'}
            variant={preset === p ? 'filled' : 'outlined'}
            onClick={() => onChange(presetRange(p), p)}
          />
        ))}
        <Chip
          label={t('custom')}
          color={preset === 'custom' ? 'primary' : 'default'}
          variant={preset === 'custom' ? 'filled' : 'outlined'}
          onClick={() => onChange(custom, 'custom')}
        />
      </ChipRow>
      {preset === 'custom' ? (
        <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
          <TextField
            type="date"
            size="small"
            label={t('from_label')}
            value={custom.start}
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(e) => {
              const next = { ...custom, start: e.target.value };
              setCustom(next);
              if (next.start && next.end && next.start <= next.end) {
                onChange(next, 'custom');
              }
            }}
          />
          <TextField
            type="date"
            size="small"
            label={t('to_label')}
            value={custom.end}
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(e) => {
              const next = { ...custom, end: e.target.value };
              setCustom(next);
              if (next.start && next.end && next.start <= next.end) {
                onChange(next, 'custom');
              }
            }}
          />
        </Stack>
      ) : null}
    </Box>
  );
}
