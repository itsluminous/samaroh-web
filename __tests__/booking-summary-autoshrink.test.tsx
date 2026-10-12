/**
 * Booking tab summary card ("This month · Received / Pending"): both figures
 * sit on ONE line and autoshrink instead of wrapping (owner feedback, Android
 * AutoShrinkText parity) — each half is a flex-filling, single-line
 * (`white-space: nowrap; overflow: hidden`) AutoShrinkText; masking and the
 * success/error colours are unchanged.
 */
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { NextIntlClientProvider } from 'next-intl';
import theme from '@/theme/theme';
import en from '../messages/en.json';
import SummaryCard from '@/app/[locale]/(app)/booking/components/SummaryCard';
import { AMOUNT_MASK } from '@/components/MaskedAmount';

function renderCard(showAmounts = true) {
  return render(
    <ThemeProvider theme={theme}>
      <NextIntlClientProvider locale="en" messages={en}>
        <SummaryCard received={10651161} pending={5000000} showAmounts={showAmounts} />
      </NextIntlClientProvider>
    </ThemeProvider>,
  );
}

describe('booking SummaryCard — one-line autoshrink', () => {
  it('renders both amounts through single-line autoshrink spans inside flex-filling halves', () => {
    renderCard();
    const received = screen.getByTestId('summary-received');
    const pending = screen.getByTestId('summary-pending');
    for (const half of [received, pending]) {
      expect(half).toHaveStyle({ flex: '1 1 0', minWidth: 0 });
      const span = half.firstElementChild as HTMLElement;
      expect(span.tagName).toBe('SPAN');
      expect(span).toHaveStyle({ whiteSpace: 'nowrap', overflow: 'hidden', display: 'block' });
    }
    expect(received).toHaveTextContent('Received \u20B91,06,51,161');
    expect(pending).toHaveTextContent('Pending \u20B950,00,000');
    // The two halves are siblings on one flex row.
    expect(screen.getByTestId('booking-summary-row')).toHaveStyle({ display: 'flex' });
  });

  it('keeps the colour contract (received success, pending error)', () => {
    renderCard();
    expect(screen.getByTestId('summary-received')).toHaveStyle({ color: 'var(--mui-palette-success-main)' });
    expect(screen.getByTestId('summary-pending')).toHaveStyle({ color: 'var(--mui-palette-error-main)' });
  });

  it('still masks when booking.view_amounts is denied', () => {
    renderCard(false);
    expect(screen.getByText(`Received ${AMOUNT_MASK}`)).toBeInTheDocument();
    expect(screen.queryByText(/1,06,51,161/)).not.toBeInTheDocument();
  });
});
