'use client';

// Header summary card (§4.1): "This month" with received/pending amounts.
// Colors match Android: received is green (success/moneyIn), pending is red (error).

import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
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
        <Stack direction="row" spacing={2}>
          <Typography variant="subtitle1" fontWeight={600} color="success.main">
            {t('received', { amount: maskAmount(formatRupees(received), showAmounts) })}
          </Typography>
          <Typography variant="subtitle1" fontWeight={600} color="error.main">
            {t('pending', { amount: maskAmount(formatRupees(pending), showAmounts) })}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
