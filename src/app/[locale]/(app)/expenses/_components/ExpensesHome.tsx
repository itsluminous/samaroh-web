'use client';

import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import GlassFab from '@/components/GlassFab';
import List from '@mui/material/List';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Snackbar from '@mui/material/Snackbar';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { computeNetBalance, computeTotals } from '@/lib/expenses/ledger';
import MaskedAmount from '@/components/MaskedAmount';
import { formatAmount } from '@/lib/format/amount';
import { useMembership } from '@/lib/permissions/useMembership';
import { partyInitials, toLedgerEntry } from '../_lib/view';
import { fetchBusinessExpenses, fetchParties, PARTY_DELETED_NOTICE_KEY, type ExpenseRecord, type PartyRecord } from '../_lib/queries';
import AddPersonDialog from './AddPersonDialog';

interface PartyListRow {
  party: PartyRecord;
  netBalance: number;
  lastEntryAt: string | null;
}

/** Expenses home (spec §4.2): gave/got totals, search, party list, add person. */
export default function ExpensesHome() {
  const t = useTranslations('expenses');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const router = useRouter();
  const {
    supabase,
    business,
    isOwner,
    permissions,
    loading: businessLoading,
    error: businessError,
  } = useMembership();
  const businessId = business?.id ?? null;
  // Add person edits the party roster — hidden without manage_parties (§3).
  const canManageParties = isOwner || permissions.expenses.manage_parties;
  // expenses.view_amounts (absent = true): false masks totals and balances as ₹•••.
  const showAmounts = isOwner || permissions.expenses.view_amounts;

  const [parties, setParties] = useState<PartyRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [deletedNotice, setDeletedNotice] = useState<string | null>(null);

  // Party deletion navigates back here; the ledger leaves the name behind.
  useEffect(() => {
    try {
      const name = window.sessionStorage.getItem(PARTY_DELETED_NOTICE_KEY);
      if (name !== null) {
        window.sessionStorage.removeItem(PARTY_DELETED_NOTICE_KEY);
        setDeletedNotice(name);
      }
    } catch {
      // Storage unavailable — no notice.
    }
  }, []);

  const reload = useCallback(async () => {
    if (!supabase || !businessId) {
      return;
    }
    setLoadError(false);
    try {
      const [partyRows, expenseRows] = await Promise.all([
        fetchParties(supabase, businessId),
        fetchBusinessExpenses(supabase, businessId),
      ]);
      setParties(partyRows);
      setExpenses(expenseRows);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [supabase, businessId]);

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

  const totals = useMemo(() => computeTotals(expenses.map(toLedgerEntry)), [expenses]);

  const rows = useMemo<PartyListRow[]>(() => {
    const byParty = new Map<string, ExpenseRecord[]>();
    for (const expense of expenses) {
      const list = byParty.get(expense.party_id);
      if (list) {
        list.push(expense);
      } else {
        byParty.set(expense.party_id, [expense]);
      }
    }
    const query = search.trim().toLowerCase();
    return parties
      .filter((party) => query === '' || party.name.toLowerCase().includes(query))
      .map((party) => {
        const partyExpenses = byParty.get(party.id) ?? [];
        const lastEntryAt = partyExpenses.reduce<string | null>(
          (latest, e) => (latest === null || e.created_at > latest ? e.created_at : latest),
          null,
        );
        return {
          party,
          netBalance: computeNetBalance(partyExpenses.map(toLedgerEntry)),
          lastEntryAt,
        };
      });
  }, [parties, expenses, search]);

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

  if (loadError) {
    return <Alert severity="error">{t('error.load_failed')}</Alert>;
  }

  return (
    <Box sx={{ pb: 10 }}>
      <Card variant="outlined" sx={{ display: 'flex', mb: 2 }}>
        <Box sx={{ flex: 1, p: 2, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {t('home.you_gave')}
          </Typography>
          <Typography variant="h6" color="error.main">
            {showAmounts ? formatAmount(totals.gave) : <MaskedAmount />}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, p: 2, textAlign: 'center', borderLeft: 1, borderColor: 'divider' }}>
          <Typography variant="body2" color="text.secondary">
            {t('home.you_got')}
          </Typography>
          <Typography variant="h6" color="success.main">
            {showAmounts ? formatAmount(totals.got) : <MaskedAmount />}
          </Typography>
        </Box>
      </Card>

      <TextField
        fullWidth
        size="small"
        type="search"
        placeholder={t('home.search_placeholder')}
        inputProps={{ 'aria-label': t('home.search_placeholder') }}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        sx={{ mb: 1 }}
      />

      {parties.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 6 }}>
          {t('home.empty')}
        </Typography>
      ) : rows.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 6 }}>
          {t('home.no_results')}
        </Typography>
      ) : (
        <List disablePadding>
          {rows.map(({ party, netBalance, lastEntryAt }) => (
            <ListItemButton
              key={party.id}
              divider
              onClick={() => router.push(`/expenses/${party.id}`)}
            >
              <ListItemAvatar>
                <Avatar>{partyInitials(party.name)}</Avatar>
              </ListItemAvatar>
              <ListItemText
                sx={{ minWidth: 0 }}
                primaryTypographyProps={{ component: 'div' }}
                primary={
                  <>
                    <Box
                      sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {party.name}
                    </Box>
                    {!party.business_related && (
                      <Box sx={{ mt: 0.25 }}>
                        <Chip size="small" variant="outlined" label={t('party.personal_tag')} />
                      </Box>
                    )}
                  </>
                }
                secondary={
                  lastEntryAt
                    ? format.relativeTime(new Date(lastEntryAt))
                    : t('home.no_entries')
                }
              />
              <Box sx={{ textAlign: 'right' }}>
                <Typography
                  variant="subtitle1"
                  color={
                    netBalance > 0 ? 'error.main' : netBalance < 0 ? 'success.main' : 'text.secondary'
                  }
                >
                  {showAmounts ? formatAmount(Math.abs(netBalance)) : <MaskedAmount />}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {netBalance > 0
                    ? t('ledger.net_you_get')
                    : netBalance < 0
                      ? t('ledger.net_you_give')
                      : t('ledger.settled')}
                </Typography>
              </Box>
            </ListItemButton>
          ))}
        </List>
      )}

      {canManageParties ? (
        <GlassFab
          color="primary"
          variant="extended"
          aria-label={t('home.add_person')}
          onClick={() => setAddOpen(true)}
          sx={{ position: 'fixed', right: 24, bottom: { xs: 80, md: 24 } }}
        >
          <PersonAddAlt1Icon sx={{ mr: 1 }} />
          {t('home.add_person')}
        </GlassFab>
      ) : null}

      <AddPersonDialog
        open={addOpen && canManageParties}
        parties={parties}
        onClose={() => setAddOpen(false)}
        onPickExisting={(party) => {
          setAddOpen(false);
          router.push(`/expenses/${party.id}`);
        }}
        onCreated={(party) => {
          setAddOpen(false);
          router.push(`/expenses/${party.id}`);
        }}
      />

      <Snackbar
        open={deletedNotice !== null}
        autoHideDuration={4000}
        onClose={() => setDeletedNotice(null)}
        message={deletedNotice !== null ? t('party.deleted_notice', { name: deletedNotice }) : undefined}
      />
    </Box>
  );
}
