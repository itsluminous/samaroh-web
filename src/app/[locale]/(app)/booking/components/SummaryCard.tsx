'use client';

// Header summary card (§4.1): "This month: Received ₹X · Pending ₹Y".

import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { formatRupees } from '@/lib/booking/money';

export default function SummaryCard({ received, pending }: { received: number; pending: number }) {
  const t = useTranslations('booking.summary');
  return (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="overline" color="text.secondary" component="div">
          {t('this_month')}
        </Typography>
        <Typography variant="subtitle1" fontWeight={600}>
          {t('received_pending', {
            received: formatRupees(received),
            pending: formatRupees(pending),
          })}
        </Typography>
      </CardContent>
    </Card>
  );
}
