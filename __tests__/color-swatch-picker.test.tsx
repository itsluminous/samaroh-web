/**
 * ColorSwatchPicker variants: the standard wrapping grid of 32px swatches
 * vs the compact single-row of small dots (~22px, horizontal scroll) used
 * by the note editor and the booking form. Selection is exposed via
 * aria-pressed in both variants.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import ColorSwatchPicker, {
  COMPACT_SWATCH_SIZE,
  STANDARD_SWATCH_SIZE,
} from '@/components/ColorSwatchPicker';
import { BOOKING_COLORS } from '@/lib/booking/bookingColors';

function renderPicker({ compact = false, value = null as string | null, onChange = jest.fn() } = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ColorSwatchPicker label="Color" value={value} onChange={onChange} compact={compact} />
    </NextIntlClientProvider>,
  );
  return { onChange };
}

describe('ColorSwatchPicker — standard variant', () => {
  it('renders full-size swatches in a wrapping row', () => {
    renderPicker();
    const group = screen.getByRole('group', { name: 'Color' });
    expect(group).toHaveStyle({ flexWrap: 'wrap' });
    const swatch = screen.getByRole('button', { name: en.booking.color.default });
    expect(swatch).toHaveStyle({ width: `${STANDARD_SWATCH_SIZE}px`, height: `${STANDARD_SWATCH_SIZE}px` });
  });
});

describe('ColorSwatchPicker — compact variant', () => {
  it('renders small dots in ONE horizontally scrollable row', () => {
    renderPicker({ compact: true });
    const group = screen.getByRole('group', { name: 'Color' });
    expect(group).toHaveStyle({ flexWrap: 'nowrap', overflowX: 'auto' });
    // All 17 swatches (default + 16 palette colors) stay in the single row.
    const swatches = screen.getAllByRole('button');
    expect(swatches).toHaveLength(BOOKING_COLORS.length + 1);
    for (const swatch of swatches) {
      expect(swatch).toHaveStyle({
        width: `${COMPACT_SWATCH_SIZE}px`,
        height: `${COMPACT_SWATCH_SIZE}px`,
        flexShrink: '0',
      });
    }
  });

  it('marks the selected dot (ring exposed via aria-pressed) and selects on click', () => {
    const first = BOOKING_COLORS[0]!;
    const { onChange } = renderPicker({ compact: true, value: first.key });
    // Exactly one dot carries the selection.
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(BOOKING_COLORS.length);

    fireEvent.click(screen.getByRole('button', { name: en.booking.color.default }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
