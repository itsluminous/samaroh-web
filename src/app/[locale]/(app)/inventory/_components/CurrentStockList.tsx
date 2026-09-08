'use client';

import AddIcon from '@mui/icons-material/Add';
import ListAltIcon from '@mui/icons-material/ListAlt';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import GlassFab from '@/components/GlassFab';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Snackbar from '@mui/material/Snackbar';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import MaskedAmount, { maskAmount } from '@/components/MaskedAmount';
import SortMenuButton from '@/components/SortMenuButton';
import { formatAmount, formatIndianNumber } from '@/lib/format/amount';
import {
  STOCK_LIST_SORT_STORAGE_KEY,
  listSortComparator,
  readListSort,
  writeListSort,
  type ListSortOrder,
} from '@/lib/listSort';
import { useMembership } from '@/lib/permissions/useMembership';
import type { CurrentInventoryRow } from '@/lib/inventory/fifo';
import {
  fetchCurrentInventory,
  fetchMasterItems,
  type MasterItemRecord,
} from '../_lib/queries';
import { unitLabelKey } from '../_lib/units';
import ItemPhotoAvatar from './ItemPhotoAvatar';
import RecordTransactionDialog from './RecordTransactionDialog';

/**
 * Current stock list (spec §4.3): item photo rendered from Google Drive by
 * `drive_image_id` (tap opens the Drive full view), name, qty + unit, FIFO
 * value, last-updated relative time, search, sort menu (last updated /
 * A to Z / Z to A, persisted per list), master-list toggle,
 * record-transaction FAB.
 */
export default function CurrentStockList() {
  const t = useTranslations('inventory');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const router = useRouter();
  const {
    supabase,
    business,
    userId,
    isOwner,
    permissions,
    loading: businessLoading,
    error: businessError,
  } = useMembership();
  const businessId = business?.id ?? null;
  // Record transaction is a write — hidden without inventory.create (§3).
  const canRecord = isOwner || permissions.inventory.create;
  // inventory.view_amounts (absent = true): false masks stock values as ₹•••
  // — quantities stay visible.
  const showAmounts = isOwner || permissions.inventory.view_amounts;

  const [rows, setRows] = useState<CurrentInventoryRow[]>([]);
  const [items, setItems] = useState<MasterItemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ListSortOrder>(() =>
    readListSort(STOCK_LIST_SORT_STORAGE_KEY),
  );
  const [txnOpen, setTxnOpen] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);

  const changeSort = useCallback((order: ListSortOrder) => {
    setSort(order);
    writeListSort(STOCK_LIST_SORT_STORAGE_KEY, order);
  }, []);

  const reload = useCallback(async () => {
    if (!supabase || !businessId) {
      return;
    }
    setLoadError(false);
    try {
      const [inventoryRows, masterItems] = await Promise.all([
        fetchCurrentInventory(supabase, businessId),
        fetchMasterItems(supabase, businessId),
      ]);
      setRows(inventoryRows);
      setItems(masterItems);
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

  const unitLabel = useCallback(
    (unit: string) => {
      const key = unitLabelKey(unit);
      return key ? t(key) : unit;
    },
    [t],
  );

  // Zero-stock / no-transaction master items are not hidden: they are
  // appended after the in-stock rows (sorted by the chosen order within each
  // group), dimmed, with 0 qty and ₹0 value, and stay searchable. The sort
  // choice never affects which rows the search matches.
  const { inStockRows, zeroStockRows } = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = (row: CurrentInventoryRow) =>
      query === '' || row.name.toLowerCase().includes(query);
    const comparator = listSortComparator<CurrentInventoryRow>(sort, {
      name: (row) => row.name,
      lastActivityAt: (row) => row.lastTransactionAt,
    });
    return {
      inStockRows: rows.filter((row) => row.currentQuantity > 0 && matches(row)).sort(comparator),
      zeroStockRows: rows
        .filter((row) => row.currentQuantity <= 0 && matches(row))
        .sort(comparator),
    };
  }, [rows, search, sort]);

  // Shared row renderer; `dimmed` marks the zero-stock group, which always
  // shows 0 qty and ₹0 value at reduced opacity.
  const renderRow = (row: CurrentInventoryRow, dimmed: boolean) => {
    const quantity = dimmed ? 0 : row.currentQuantity;
    const value = dimmed ? 0 : row.currentValue;
    const quantityText = `${formatIndianNumber(quantity)} ${unitLabel(row.unit)}`;
    return (
      <ListItem key={row.masterItemId} divider disablePadding>
        <ListItemButton
          sx={dimmed ? { opacity: 0.55 } : undefined}
          onClick={() => router.push(`/inventory/${row.masterItemId}`)}
        >
          <ListItemAvatar>
            <ItemPhotoAvatar driveImageId={row.driveImageId} alt={row.name} size={48} expandable />
          </ListItemAvatar>
          <ListItemText
            primary={row.name}
            secondary={
              row.lastTransactionAt
                ? `${quantityText} · ${t('stock.updated', {
                    time: format.relativeTime(new Date(row.lastTransactionAt)),
                  })}`
                : quantityText
            }
          />
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="subtitle1">
              {showAmounts ? formatAmount(value) : <MaskedAmount />}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('stock.value_label')}
            </Typography>
          </Box>
        </ListItemButton>
      </ListItem>
    );
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

  if (loadError) {
    return <Alert severity="error">{t('error.load_failed')}</Alert>;
  }

  return (
    <Box sx={{ pb: 10 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          {t('stock.title')}
        </Typography>
        <SortMenuButton value={sort} onChange={changeSort} />
        <Tooltip title={t('stock.open_masterlist')}>
          <IconButton
            aria-label={t('stock.open_masterlist')}
            onClick={() => router.push('/inventory/masterlist')}
          >
            <ListAltIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <TextField
        fullWidth
        size="small"
        type="search"
        placeholder={t('stock.search_placeholder')}
        inputProps={{ 'aria-label': t('stock.search_placeholder') }}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        sx={{ mb: 1 }}
      />

      {rows.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 6 }}>
          {t('stock.empty')}
        </Typography>
      ) : inStockRows.length === 0 && zeroStockRows.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 6 }}>
          {t('stock.no_results')}
        </Typography>
      ) : (
        <List disablePadding>
          {inStockRows.map((row) => renderRow(row, false))}
          {zeroStockRows.map((row) => renderRow(row, true))}
        </List>
      )}

      {canRecord ? (
        <GlassFab
          color="primary"
          variant="extended"
          aria-label={t('stock.record_transaction')}
          onClick={() => setTxnOpen(true)}
          sx={{ position: 'fixed', right: 24, bottom: { xs: 80, md: 24 } }}
        >
          <AddIcon sx={{ mr: 1 }} />
          {t('stock.record_transaction')}
        </GlassFab>
      ) : null}

      <RecordTransactionDialog
        open={txnOpen && canRecord}
        items={items}
        stockByItemId={new Map(rows.map((row) => [row.masterItemId, row.currentQuantity]))}
        supabase={supabase}
        businessId={businessId}
        userId={userId}
        onClose={() => setTxnOpen(false)}
        onSaved={(result) => {
          setTxnOpen(false);
          setSnack(
            result.type === 'add'
              ? t('txn.add_success', { name: result.itemName })
              : t('txn.remove_success', {
                  name: result.itemName,
                  amount: maskAmount(formatAmount(result.removedValue ?? 0), showAmounts),
                }),
          );
          void reload();
        }}
      />

      <Snackbar
        open={snack !== null}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        message={snack ?? ''}
      />
    </Box>
  );
}
