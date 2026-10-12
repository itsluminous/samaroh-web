'use client';

/**
 * Date-range quick filter shared by ALL report pages (§4.4; shared
 * docs/reports-range-filter.md, 2026-10-12): −12 months · −3 months · This
 * month · +3 months · +12 months · Custom, in that order, in a horizontally
 * scrolling ChipRow (never wraps, labels never shrink), plus the from–to
 * picker for Custom. Range math lives in `src/lib/reports/range.ts`
 * (device-local today, month arithmetic clamped to month end).
 */
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ChipRow from '@/components/ChipRow';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { presetRange, RANGE_PRESETS, type RangePreset } from '@/lib/reports/range';
import type { DateRange } from '@/lib/reports/types';

export { DEFAULT_RANGE_PRESET, presetRange, type RangePreset } from '@/lib/reports/range';

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

  return (
    <Box>
      <ChipRow role="group" aria-label={t('picker_title')} data-testid="report-range-chips">
        {RANGE_PRESETS.map((p) => (
          <Chip
            key={p}
            label={t(p)}
            color={preset === p ? 'primary' : 'default'}
            variant={preset === p ? 'filled' : 'outlined'}
            aria-pressed={preset === p}
            onClick={() => onChange(presetRange(p), p)}
          />
        ))}
        <Chip
          label={t('custom')}
          color={preset === 'custom' ? 'primary' : 'default'}
          variant={preset === 'custom' ? 'filled' : 'outlined'}
          aria-pressed={preset === 'custom'}
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
