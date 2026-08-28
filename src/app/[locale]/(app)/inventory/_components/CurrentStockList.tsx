'use client';

import AddIcon from '@mui/icons-material/Add';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import ListAltIcon from '@mui/icons-material/ListAlt';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
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
import { formatAmount, formatIndianNumber } from '@/lib/format/amount';
import { useMembership } from '@/lib/permissions/useMembership';
import type { CurrentInventoryRow } from '@/lib/inventory/fifo';
import {
  createImageUrls,
  fetchCurrentInventory,
  fetchMasterItems,
  type MasterItemRecord,
} from '../_lib/queries';
import { isBuiltInUnit, unitLabelKey } from '../_lib/units';
import RecordTransactionDialog from './RecordTransactionDialog';

/**
 * Current stock list (spec §4.3): item image (tap to expand), name, qty +
 * unit, FIFO value, last-updated relative time, search, master-list toggle,
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
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [txnOpen, setTxnOpen] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<{ url: string; name: string } | null>(null);

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
      const paths = inventoryRows
        .map((row) => row.imagePath)
        .filter((path): path is string => path !== null);
      setImageUrls(await createImageUrls(supabase, paths));
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
    (unit: string) => (isBuiltInUnit(unit) ? t(`master.${unitLabelKey(unit)}`) : unit),
    [t],
  );

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter((row) => row.currentQuantity > 0)
      .filter((row) => query === '' || row.name.toLowerCase().includes(query));
  }, [rows, search]);

  const hasStock = useMemo(() => rows.some((row) => row.currentQuantity > 0), [rows]);

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

      {!hasStock ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 6 }}>
          {t('stock.empty')}
        </Typography>
      ) : visibleRows.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 6 }}>
          {t('stock.no_results')}
        </Typography>
      ) : (
        <List disablePadding>
          {visibleRows.map((row) => {
            const imageUrl = row.imagePath ? imageUrls.get(row.imagePath) : undefined;
            const quantityText = `${formatIndianNumber(row.currentQuantity)} ${unitLabel(row.unit)}`;
            return (
              <ListItem key={row.masterItemId} divider disablePadding>
                <ListItemButton onClick={() => router.push(`/inventory/${row.masterItemId}`)}>
                  <ListItemAvatar>
                    {imageUrl ? (
                      <Avatar
                        src={imageUrl}
                        alt={row.name}
                        variant="rounded"
                        sx={{ cursor: 'pointer', width: 48, height: 48 }}
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedImage({ url: imageUrl, name: row.name });
                        }}
                      />
                    ) : (
                      <Avatar variant="rounded" sx={{ width: 48, height: 48 }}>
                        <Inventory2OutlinedIcon />
                      </Avatar>
                    )}
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
                    <Typography variant="subtitle1">{showAmounts ? formatAmount(row.currentValue) : <MaskedAmount />}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('stock.value_label')}
                    </Typography>
                  </Box>
                </ListItemButton>
              </ListItem>
            );
          })}
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

      <Dialog
        open={expandedImage !== null}
        onClose={() => setExpandedImage(null)}
        maxWidth="md"
        aria-label={expandedImage?.name}
      >
        {expandedImage && (
          <Box
            component="img"
            src={expandedImage.url}
            alt={expandedImage.name}
            sx={{ maxWidth: '100%', maxHeight: '80vh', display: 'block' }}
            onClick={() => setExpandedImage(null)}
          />
        )}
      </Dialog>
    </Box>
  );
}
