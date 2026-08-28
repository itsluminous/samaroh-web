'use client';

// Booking detail bottom drawer (§4.1 "Smart Booking Card"): one card =
// customer + event + financials. Due is auto-calculated, bold, red when > 0.

import CallIcon from '@mui/icons-material/Call';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import PaymentsIcon from '@mui/icons-material/Payments';
import PrintIcon from '@mui/icons-material/Print';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { computeDue, computePaid } from '@/lib/booking/due';
import { effectiveBookingColor } from '@/lib/booking/bookingColors';
import type { EventTypePreset } from '@/lib/booking/eventTypePresets';
import { formatDate, formatDateRange } from '@/lib/booking/dates';
import { formatRupees } from '@/lib/booking/money';
import type { Booking, BookingPayment, BookingPermissions, Business } from '@/lib/booking/types';
import { buildWhatsAppLink } from '@/lib/booking/whatsapp';
import { formatBookingTitle } from './format';

function AmountRow({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
      <Typography color="text.secondary">{label}</Typography>
      <Typography fontWeight={bold ? 700 : 500} color={color}>
        {value}
      </Typography>
    </Box>
  );
}

export default function BookingDetail({
  booking,
  payments,
  business,
  memberNames,
  permissions,
  presets,
  onClose,
  onEdit,
  onRecordPayment,
  onCancelBooking,
  onInvoicePdf,
  onInvoiceText,
  invoiceBusy,
}: {
  booking: Booking;
  payments: BookingPayment[];
  business: Business;
  memberNames: Record<string, string>;
  permissions: BookingPermissions;
  /** Live event-type presets for type-default color resolution (null = static fallback). */
  presets?: EventTypePreset[] | null;
  onClose: () => void;
  onEdit: () => void;
  onRecordPayment: () => void;
  onCancelBooking: () => void;
  onInvoicePdf: () => void;
  onInvoiceText: () => void;
  invoiceBusy: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [invoiceMenuEl, setInvoiceMenuEl] = useState<HTMLElement | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const paid = computePaid(payments);
  const due = computeDue(booking.total_amount, payments);
  const cancelled = booking.status === 'cancelled';
  const statusLabel = t(`booking.status.${booking.status}`);
  const colorDef = effectiveBookingColor(booking, presets);
  const addedBy = memberNames[booking.created_by] ?? business.owner_name;

  const waText = t('booking.whatsapp.reminder_text', {
    name: booking.customer_name,
    due: formatRupees(Math.max(due, 0)),
    event: formatBookingTitle(booking, t),
    date: formatDate(booking.start_date, locale),
    business: business.name,
  });
  const waLink = buildWhatsAppLink(booking.customer_phone, waText);
  const telHref = booking.customer_phone ? `tel:${booking.customer_phone}` : null;
  const invoiceNumberLine = booking.invoice_number
    ? `${t('invoice.number_label')} ${booking.invoice_number}`
    : null;
  const datesLine = `${t('booking.card.dates_label')}: ${formatDateRange(booking.start_date, booking.end_date, locale)}`;
  const paymentLine = (p: BookingPayment) =>
    `${formatDate(p.paid_on, locale)} \u00B7 ${t(`booking.payment.method_${p.method}`)}${p.notes ? ` \u00B7 ${p.notes}` : ''}`;

  return (
    <Drawer anchor="bottom" open onClose={onClose} PaperProps={{ sx: { maxHeight: '88vh', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxWidth: 640, mx: 'auto' } }}>
      <Box sx={{ p: 2.5, pb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" sx={{ textDecoration: cancelled ? 'line-through' : 'none' }}>
              {formatBookingTitle(booking, t)}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} alignItems="center">
              <Chip
                size="small"
                label={statusLabel}
                color={booking.status === 'confirmed' ? 'primary' : booking.status === 'tentative' ? 'warning' : 'default'}
                variant={booking.status === 'tentative' ? 'outlined' : 'filled'}
              />
              {colorDef ? (
                <Chip
                  size="small"
                  label={t(colorDef.label_key)}
                  sx={{ bgcolor: colorDef.hex, color: colorDef.on_hex }}
                />
              ) : null}
              {invoiceNumberLine ? (
                <Typography variant="caption" color="text.secondary">
                  {invoiceNumberLine}
                </Typography>
              ) : null}
            </Stack>
          </Box>
          <IconButton onClick={onClose} aria-label={t('common.action.close')}>
            <CloseIcon />
          </IconButton>
        </Box>

        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5 }}>
          <Typography fontWeight={500}>{booking.customer_name}</Typography>
          {booking.customer_phone ? (
            <>
              <Typography color="text.secondary">{booking.customer_phone}</Typography>
              <Tooltip title={t('booking.card.phone_call')}>
                <IconButton size="small" component="a" href={telHref ?? undefined} aria-label={t('booking.card.phone_call')}>
                  <CallIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          ) : null}
        </Stack>
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          {datesLine}
        </Typography>
        {booking.notes ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {booking.notes}
          </Typography>
        ) : null}

        <Divider sx={{ my: 1.5 }} />
        <AmountRow label={t('booking.card.total_label')} value={formatRupees(booking.total_amount)} />
        {booking.security_deposit > 0 ? (
          <AmountRow label={t('booking.card.deposit_label')} value={formatRupees(booking.security_deposit)} />
        ) : null}
        <AmountRow label={t('booking.card.paid_label')} value={formatRupees(paid)} />
        <AmountRow
          label={t('booking.card.due_label')}
          value={formatRupees(Math.max(due, 0))}
          bold
          color={due > 0 ? 'error.main' : 'success.main'}
        />

        <Divider sx={{ my: 1.5 }} />
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          {t('booking.card.payments_title')}
        </Typography>
        {payments.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('booking.card.no_payments')}
          </Typography>
        ) : (
          payments.map((p) => (
            <Box key={p.id} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
              <Typography variant="body2" color="text.secondary">
                {paymentLine(p)}
              </Typography>
              <Typography variant="body2" fontWeight={500}>
                {formatRupees(p.amount)}
              </Typography>
            </Box>
          ))
        )}

        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1.5 }}>
          {t('booking.card.audit_added', {
            name: addedBy,
            date: formatDate(booking.created_at.slice(0, 10), locale),
          })}
        </Typography>

        <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', rowGap: 1 }}>
          {permissions.edit && !cancelled ? (
            <Button variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>
              {t('common.action.edit')}
            </Button>
          ) : null}
          {permissions.record_payment && !cancelled ? (
            <Button variant="contained" startIcon={<PaymentsIcon />} onClick={onRecordPayment}>
              {t('booking.card.action_record_payment')}
            </Button>
          ) : null}
          {permissions.generate_invoice ? (
            <Button
              variant="outlined"
              startIcon={<PrintIcon />}
              disabled={invoiceBusy}
              onClick={(e) => setInvoiceMenuEl(e.currentTarget)}
            >
              {t('booking.card.action_invoice')}
            </Button>
          ) : null}
          {waLink && !cancelled ? (
            <Button
              variant="outlined"
              color="success"
              startIcon={<WhatsAppIcon />}
              component="a"
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('booking.card.action_whatsapp')}
            </Button>
          ) : null}
          {permissions.delete && !cancelled ? (
            <Button variant="text" color="error" onClick={() => setConfirmCancel(true)}>
              {t('booking.card.action_cancel_booking')}
            </Button>
          ) : null}
        </Stack>

        <Menu anchorEl={invoiceMenuEl} open={invoiceMenuEl !== null} onClose={() => setInvoiceMenuEl(null)}>
          <MenuItem
            onClick={() => {
              setInvoiceMenuEl(null);
              onInvoicePdf();
            }}
          >
            {t('booking.card.invoice_pdf')}
          </MenuItem>
          <MenuItem
            onClick={() => {
              setInvoiceMenuEl(null);
              onInvoiceText();
            }}
          >
            {t('booking.card.invoice_text')}
          </MenuItem>
        </Menu>

        <Dialog open={confirmCancel} onClose={() => setConfirmCancel(false)}>
          <DialogTitle>{t('booking.card.cancel_confirm_title')}</DialogTitle>
          <DialogContent>
            <DialogContentText>{t('booking.card.cancel_confirm_message')}</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmCancel(false)}>{t('common.action.cancel')}</Button>
            <Button
              color="error"
              onClick={() => {
                setConfirmCancel(false);
                onCancelBooking();
              }}
            >
              {t('booking.card.action_cancel_booking')}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Drawer>
  );
}
