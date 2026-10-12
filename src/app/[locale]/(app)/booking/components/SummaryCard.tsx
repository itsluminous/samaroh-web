'use client';

// Header summary card (§4.1): "This month" with received/pending amounts.
// Colors match Android: received is green (success/moneyIn), pending is red (error).
// Both figures sit on ONE line and autoshrink instead of wrapping (owner
// feedback — a crore-scale ₹ total wrapped on phones; Android AutoShrinkText
// parity): each half owns `flex: 1 1 0` of the row and renders through the
// reports' AutoShrinkText (imported, not moved — shared components change
// via the integrator).

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import AutoShrinkText from '@/app/[locale]/(app)/menu/_components/AutoShrinkText';
import { maskAmount } from '@/components/MaskedAmount';
import { formatRupees } from '@/lib/booking/money';

export default function SummaryCard({
  received,
  pending,
  showAmounts,
}: {
  received: number;
  pending: number;
  /** false = booking.view_amounts denied — amounts render as ₹•••. */
  showAmounts: boolean;
}) {
  const t = useTranslations('booking.summary');
  return (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="overline" color="text.secondary" component="div">
          {t('this_month')}
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'baseline' }} data-testid="booking-summary-row">
          <Typography
            variant="subtitle1"
            fontWeight={600}
            color="success.main"
            component="div"
            sx={{ flex: '1 1 0', minWidth: 0 }}
            data-testid="summary-received"
          >
            <AutoShrinkText>{t('received', { amount: maskAmount(formatRupees(received), showAmounts) })}</AutoShrinkText>
          </Typography>
          <Typography
            variant="subtitle1"
            fontWeight={600}
            color="error.main"
            component="div"
            sx={{ flex: '1 1 0', minWidth: 0 }}
            data-testid="summary-pending"
          >
            <AutoShrinkText>{t('pending', { amount: maskAmount(formatRupees(pending), showAmounts) })}</AutoShrinkText>
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}
