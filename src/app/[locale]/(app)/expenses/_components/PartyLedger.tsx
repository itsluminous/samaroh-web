'use client';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import EditIcon from '@mui/icons-material/Edit';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { computeLedger, computeNetBalance, type ExpenseDirection } from '@/lib/expenses/ledger';
import { formatAmount } from '@/lib/format/amount';
import { useMembership } from '@/lib/permissions/useMembership';
import { partyInitials, toLedgerEntry } from '../_lib/view';
import {
  fetchParty,
  fetchPartyExpenses,
  PARTY_DELETED_NOTICE_KEY,
  updatePartyBusinessRelated,
  type ExpenseRecord,
  type PartyRecord,
} from '../_lib/queries';
import BusinessRelatedPill from './BusinessRelatedPill';
import EditPartyDialog from './EditPartyDialog';
import EntryDialog from './EntryDialog';

/**
 * Person ledger (spec §4.2): running balance newest-first, balance-after
 * chips, attachment chips with pending badge, big gave/got bottom buttons.
 */
export default function PartyLedger({ partyId }: { partyId: string }) {
  const t = useTranslations('expenses');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const router = useRouter();
  const {
    supabase,
    business,
    permissions,
    loading: businessLoading,
    error: businessError,
  } = useMembership();
  const businessId = business?.id ?? null;
  const businessName = business?.name ?? null;

  const [party, setParty] = useState<PartyRecord | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [dialogDirection, setDialogDirection] = useState<ExpenseDirection>('paid');
  const [dialogEntry, setDialogEntry] = useState<ExpenseRecord | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!supabase) {
      return;
    }
    setLoadError(false);
    try {
      const [partyRow, expenseRows] = await Promise.all([
        fetchParty(supabase, partyId),
        fetchPartyExpenses(supabase, partyId),
      ]);
      setParty(partyRow);
      setExpenses(expenseRows);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [supabase, partyId]);

  useEffect(() => {
    if (businessLoading) {
      return;
    }
    if (!supabase || !businessId) {
      setLoading(false);
      return;
    }
    void reload();
  }, [businessLoading, supabase, businessId, reload]);

  const ledgerRows = useMemo(() => {
    const byId = new Map(expenses.map((e) => [e.id, e]));
    return computeLedger(expenses.map(toLedgerEntry)).map((row) => ({
      ...row,
      record: byId.get(row.entry.id)!,
    }));
  }, [expenses]);

  const netBalance = useMemo(() => computeNetBalance(expenses.map(toLedgerEntry)), [expenses]);

  const openAdd = (direction: ExpenseDirection) => {
    setDialogDirection(direction);
    setDialogEntry(null);
    setDialogOpen(true);
  };

  /** Flips business/personal on the party — optimistic, reverted on failure. */
  const handleBusinessRelatedChange = async (next: boolean) => {
    if (!supabase || !party || party.business_related === next) {
      return;
    }
    const previous = party;
    setParty({ ...party, business_related: next });
    try {
      await updatePartyBusinessRelated(supabase, party, next);
    } catch {
      setParty(previous);
      setLoadError(true);
    }
  };

  const openEdit = (record: ExpenseRecord) => {
    setDialogDirection(record.direction);
    setDialogEntry(record);
    setDialogOpen(true);
  };

  if (businessLoading || loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress aria-label={tCommon('state.loading')} />
      </Box>
    );
  }

  if (businessError || !businessId) {
    return <Alert severity="warning">{t('state.no_business')}</Alert>;
  }

  if (loadError || !party) {
    return <Alert severity="error">{t('error.load_failed')}</Alert>;
  }

  return (
    <Box sx={{ pb: 12 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <IconButton aria-label={t('ledger.back')} onClick={() => router.push('/expenses')}>
          <ArrowBackIcon />
        </IconButton>
        <Avatar>{partyInitials(party.name)}</Avatar>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Typography variant="h6" noWrap>
              {party.name}
            </Typography>
            {!party.business_related && (
              <Chip size="small" variant="outlined" label={t('party.personal_tag')} />
            )}
          </Box>
          {party.phone && (
            <Typography variant="body2" color="text.secondary">
              {party.phone}
            </Typography>
          )}
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography
            variant="h6"
            color={netBalance > 0 ? 'error.main' : netBalance < 0 ? 'success.main' : 'text.secondary'}
          >
            {formatAmount(Math.abs(netBalance))}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {netBalance > 0
              ? t('ledger.net_you_get')
              : netBalance < 0
                ? t('ledger.net_you_give')
                : t('ledger.settled')}
          </Typography>
        </Box>
        {permissions.expenses.manage_parties ? (
          <IconButton aria-label={t('party.edit_title')} onClick={() => setEditOpen(true)}>
            <EditIcon />
          </IconButton>
        ) : null}
      </Box>

      <Box sx={{ mb: 2, ml: 7 }}>
        <BusinessRelatedPill
          value={party.business_related}
          businessName={businessName ?? ''}
          onChange={(next) => void handleBusinessRelatedChange(next)}
        />
      </Box>

      {ledgerRows.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 6 }}>
          {t('ledger.empty')}
        </Typography>
      ) : (
        <List disablePadding>
          {ledgerRows.map(({ record, balanceAfter }) => (
            <ListItemButton
              key={record.id}
              divider
              onClick={() => openEdit(record)}
              sx={{ alignItems: 'flex-start', py: 1.5 }}
            >
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography variant="body2" color="text.secondary">
                  {format.dateTime(new Date(`${record.expense_date}T00:00:00`), {
                    dateStyle: 'medium',
                  })}
                </Typography>
                {record.notes && (
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {record.notes}
                  </Typography>
                )}
                {record.expense_attachments.length > 0 && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                    {record.expense_attachments.map((attachment) => (
                      <Chip
                        key={attachment.id}
                        size="small"
                        icon={<AttachFileIcon />}
                        variant="outlined"
                        color={attachment.drive_file_id === null ? 'warning' : 'default'}
                        label={
                          attachment.drive_file_id === null
                            ? `${attachment.file_name} — ${t('entry.attachment_pending')}`
                            : attachment.file_name
                        }
                      />
                    ))}
                  </Box>
                )}
                <Chip
                  size="small"
                  sx={{ mt: 0.75 }}
                  label={t('ledger.balance_chip', { amount: formatAmount(balanceAfter) })}
                />
              </Box>
              <Box sx={{ textAlign: 'right', ml: 1 }}>
                <Typography
                  variant="subtitle1"
                  color={record.direction === 'paid' ? 'error.main' : 'success.main'}
                >
                  {formatAmount(Number(record.amount))}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {record.direction === 'paid' ? t('home.you_gave') : t('home.you_got')}
                </Typography>
              </Box>
            </ListItemButton>
          ))}
        </List>
      )}

      <Box
        sx={{
          position: 'fixed',
          left: { xs: 0, md: 220 },
          right: 0,
          bottom: { xs: 56, md: 0 },
          display: 'flex',
          gap: 2,
          p: 2,
          bgcolor: 'background.paper',
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        <Button
          fullWidth
          size="large"
          variant="contained"
          color="error"
          onClick={() => openAdd('paid')}
        >
          {t('ledger.you_gave_button')}
        </Button>
        <Button
          fullWidth
          size="large"
          variant="contained"
          color="success"
          onClick={() => openAdd('received')}
        >
          {t('ledger.you_got_button')}
        </Button>
      </Box>

      <EntryDialog
        open={dialogOpen}
        partyId={partyId}
        direction={dialogDirection}
        entry={dialogEntry}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false);
          void reload();
        }}
      />

      {permissions.expenses.manage_parties ? (
        <EditPartyDialog
          open={editOpen}
          party={party}
          canDelete={permissions.expenses.delete}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setEditOpen(false);
            setParty(updated);
          }}
          onDeleted={() => {
            setEditOpen(false);
            // The list screen shows the "{name} deleted" notice after we land.
            try {
              window.sessionStorage.setItem(PARTY_DELETED_NOTICE_KEY, party.name);
            } catch {
              // Storage unavailable (private mode) — skip the notice.
            }
            router.push('/expenses');
          }}
        />
      ) : null}
    </Box>
  );
}
