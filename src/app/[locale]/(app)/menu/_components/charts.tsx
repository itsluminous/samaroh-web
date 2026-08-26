'use client';

/**
 * Hand-rolled SVG/MUI charts for the Reports section (§4.4) — deliberately
 * dependency-free, in the spirit of the finance-dashboard charts referenced
 * by the spec. Three primitives cover all 9 reports:
 *   - BarChart:   vertical bars, optionally stacked (non-negative values)
 *   - LineChart:  one or more series, supports negative values (zero line)
 *   - HBarList:   labelled horizontal bars for top-N breakdowns
 */
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import type { ReactElement } from 'react';

const CHART_HEIGHT = 220;
const PAD_LEFT = 44;
const PAD_BOTTOM = 24;
const PAD_TOP = 8;

export interface BarSegment {
  value: number;
  color: string;
}

export interface BarDatum {
  label: string;
  segments: BarSegment[];
}

function niceMax(value: number): number {
  if (value <= 0) {
    return 1;
  }
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const mult of [1, 2, 2.5, 5, 10]) {
    if (value <= magnitude * mult) {
      return magnitude * mult;
    }
  }
  return magnitude * 10;
}

interface AxisProps {
  width: number;
  max: number;
  min?: number;
  formatValue: (v: number) => string;
  gridColor: string;
  textColor: string;
}

function YAxis({ width, max, min = 0, formatValue, gridColor, textColor }: AxisProps): ReactElement {
  const innerH = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const ticks = [0, 0.5, 1];
  return (
    <g>
      {ticks.map((f) => {
        const value = min + (max - min) * f;
        const y = PAD_TOP + innerH * (1 - f);
        return (
          <g key={f}>
            <line x1={PAD_LEFT} y1={y} x2={width - 4} y2={y} stroke={gridColor} strokeWidth={1} />
            <text x={PAD_LEFT - 6} y={y + 3} textAnchor="end" fontSize={10} fill={textColor}>
              {formatValue(value)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function BarChart({
  data,
  ariaLabel,
  formatValue,
}: {
  data: BarDatum[];
  ariaLabel: string;
  formatValue: (v: number) => string;
}): ReactElement {
  const theme = useTheme();
  const gridColor = theme.palette.divider;
  const textColor = theme.palette.text.secondary;
  const width = Math.max(360, PAD_LEFT + data.length * 44 + 8);
  const innerH = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const max = niceMax(Math.max(...data.map((d) => d.segments.reduce((s, seg) => s + seg.value, 0)), 0));
  const slot = (width - PAD_LEFT - 8) / Math.max(data.length, 1);
  const barW = Math.min(28, slot * 0.6);

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
        width={width}
        height={CHART_HEIGHT}
        role="img"
        aria-label={ariaLabel}
      >
        <YAxis width={width} max={max} formatValue={formatValue} gridColor={gridColor} textColor={textColor} />
        {data.map((d, i) => {
          const x = PAD_LEFT + slot * i + (slot - barW) / 2;
          let yCursor = PAD_TOP + innerH;
          return (
            <g key={d.label}>
              {d.segments.map((seg, j) => {
                const h = (seg.value / max) * innerH;
                yCursor -= h;
                return <rect key={j} x={x} y={yCursor} width={barW} height={h} rx={3} fill={seg.color} />;
              })}
              <text
                x={x + barW / 2}
                y={CHART_HEIGHT - 8}
                textAnchor="middle"
                fontSize={10}
                fill={textColor}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </Box>
  );
}

export interface LineSeries {
  color: string;
  values: number[];
}

export function LineChart({
  labels,
  series,
  ariaLabel,
  formatValue,
}: {
  labels: string[];
  series: LineSeries[];
  ariaLabel: string;
  formatValue: (v: number) => string;
}): ReactElement {
  const theme = useTheme();
  const gridColor = theme.palette.divider;
  const textColor = theme.palette.text.secondary;
  const width = Math.max(360, PAD_LEFT + labels.length * 44 + 8);
  const innerH = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const allValues = series.flatMap((s) => s.values);
  const rawMax = Math.max(...allValues, 0);
  const rawMin = Math.min(...allValues, 0);
  const max = niceMax(rawMax);
  const min = rawMin < 0 ? -niceMax(-rawMin) : 0;
  const slot = (width - PAD_LEFT - 8) / Math.max(labels.length, 1);
  const yOf = (v: number) => PAD_TOP + innerH * (1 - (v - min) / (max - min || 1));
  const xOf = (i: number) => PAD_LEFT + slot * i + slot / 2;

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
        width={width}
        height={CHART_HEIGHT}
        role="img"
        aria-label={ariaLabel}
      >
        <YAxis
          width={width}
          max={max}
          min={min}
          formatValue={formatValue}
          gridColor={gridColor}
          textColor={textColor}
        />
        {min < 0 ? (
          <line x1={PAD_LEFT} y1={yOf(0)} x2={width - 4} y2={yOf(0)} stroke={textColor} strokeWidth={1} />
        ) : null}
        {series.map((s, si) => (
          <g key={si}>
            <polyline
              points={s.values.map((v, i) => `${xOf(i)},${yOf(v)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
            />
            {s.values.map((v, i) => (
              <circle key={i} cx={xOf(i)} cy={yOf(v)} r={2.5} fill={s.color} />
            ))}
          </g>
        ))}
        {labels.map((label, i) => (
          <text key={label} x={xOf(i)} y={CHART_HEIGHT - 8} textAnchor="middle" fontSize={10} fill={textColor}>
            {label}
          </text>
        ))}
      </svg>
    </Box>
  );
}

export interface HBarRow {
  label: string;
  value: number;
  /** Preformatted display value (₹ formatting happens at the call site). */
  display: string;
}

export function HBarList({ rows, color }: { rows: HBarRow[]; color?: string }): ReactElement {
  const theme = useTheme();
  const barColor = color ?? theme.palette.primary.main;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <Stack spacing={1.25}>
      {rows.map((row) => (
        <Box key={row.label}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
            <Typography variant="body2" noWrap sx={{ mr: 2 }}>
              {row.label}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {row.display}
            </Typography>
          </Box>
          <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, height: 8 }}>
            <Box
              sx={{
                width: `${Math.max((row.value / max) * 100, 1)}%`,
                bgcolor: barColor,
                borderRadius: 1,
                height: 8,
              }}
            />
          </Box>
        </Box>
      ))}
    </Stack>
  );
}
