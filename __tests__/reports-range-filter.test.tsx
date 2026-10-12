/**
 * The ONE DateRangeFilter every report page renders (shared
 * docs/reports-range-filter.md): six chips in contract order with the shared
 * labels (en + hi, typographic minus), tapping a preset emits the computed
 * range + its id, Custom reveals the from–to pickers, and the row is a
 * horizontally scrolling single line (ChipRow: nowrap, children never shrink).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import hi from '../messages/hi.json';
import DateRangeFilter from '@/app/[locale]/(app)/menu/_components/DateRangeFilter';
import { presetRange, type RangePreset } from '@/lib/reports/range';

function renderFilter(locale: 'en' | 'hi' = 'en', preset: RangePreset = 'minus_12m') {
  const onChange = jest.fn();
  render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : hi}>
      <DateRangeFilter range={presetRange('minus_12m')} preset={preset} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

const order = ['minus_12m', 'minus_3m', 'this_month', 'plus_3m', 'plus_12m', 'custom'] as const;

describe('DateRangeFilter', () => {
  it('renders the six chips in contract order with the shared English labels', () => {
    renderFilter();
    const chips = screen.getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual(order.map((k) => en.reports.range[k]));
    expect(en.reports.range.minus_12m.startsWith('\u2212')).toBe(true); // U+2212, not a hyphen
    // Deprecated labels are gone.
    expect(screen.queryByText(en.reports.range.last_12_months)).not.toBeInTheDocument();
    expect(screen.queryByText(en.reports.range.last_3_months)).not.toBeInTheDocument();
  });

  it('renders the Hindi labels', () => {
    renderFilter('hi');
    expect(screen.getAllByRole('button').map((c) => c.textContent)).toEqual(order.map((k) => hi.reports.range[k]));
  });

  it('marks the active preset and emits range + id on tap', () => {
    const onChange = renderFilter('en', 'minus_12m');
    expect(screen.getByRole('button', { name: en.reports.range.minus_12m })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: en.reports.range.plus_3m }));
    expect(onChange).toHaveBeenCalledWith(presetRange('plus_3m'), 'plus_3m');
    fireEvent.click(screen.getByRole('button', { name: en.reports.range.this_month }));
    expect(onChange).toHaveBeenLastCalledWith(presetRange('this_month'), 'this_month');
  });

  it('Custom shows the from–to pickers only while selected', () => {
    renderFilter('en', 'minus_3m');
    expect(screen.queryByLabelText(en.reports.range.from_label)).not.toBeInTheDocument();
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <DateRangeFilter range={presetRange('minus_3m')} preset="custom" onChange={jest.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByLabelText(en.reports.range.from_label)).toBeInTheDocument();
    expect(screen.getByLabelText(en.reports.range.to_label)).toBeInTheDocument();
  });

  it('the chip row is a labelled, horizontally scrolling single line', () => {
    renderFilter();
    const row = screen.getByRole('group', { name: en.reports.range.picker_title });
    expect(row).toHaveStyle({ flexWrap: 'nowrap', overflowX: 'auto' });
  });
});
