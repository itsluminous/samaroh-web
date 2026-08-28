'use client';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import MaskedAmount, { maskAmount } from '@/components/MaskedAmount';
import { formatAmount, formatIndianNumber } from '@/lib/format/amount';
import { useBusiness } from '@/lib/hooks/useBusiness';
import {
  computeCurrentStock,
  computeFifoValue,
  type TransactionType,
} from '@/lib/inventory/fifo';
import { useMembership } from '@/lib/permissions/useMembership';
import {
  createImageUrls,
  deleteMasterItem,
  fetchItemTransactions,
  fetchMasterItem,
  fetchMasterItems,
  type ItemTransactionRecord,
  type MasterItemRecord,
} from '../_lib/queries';
import { isBuiltInUnit, unitLabelKey } from '../_lib/units';
import MasterItemDialog from './MasterItemDialog';
import RecordTransactionDialog from './RecordTransactionDialog';

/** Transactions revealed per page (Load more windowing). */
export const ITEM_TXN_PAGE_SIZE = 20;

interface ItemDetailProps {
  itemId: string;
}

/**
 * Per-item detail page (spec §4.3): header with photo, name, unit, current
 * FIFO stock and total value; newest-first transaction table (date, add/remove
 * chip, qty, unit price, total price, notes) windowed 20 rows per page with a
 * Load-more button and a "Showing N of M" caption; Add/Remove buttons that
 * open the record-transaction dialog pre-selected to this item.
 */
export default function ItemDetail({ itemId }: ItemDetailProps) {
  const t = useTranslations('inventory');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const router = useRouter();
  const { supabase, businessId, userId, loading: businessLoading, error: businessError } =
    useBusiness();
  // Same gate as the master list: owners always; members need
  // inventory.manage_master_items (shared/permissions/permissions-schema.json).
  const { isOwner, permissions } = useMembership();
  const canManageItems = isOwner || permissions.inventory.manage_master_items;
  // inventory.view_amounts (absent = true): false masks the stock value, unit
  // prices and transaction totals as ₹••• — quantities stay visible.
  const showAmounts = isOwner || permissions.inventory.view_amounts;

  const [item, setItem] = useState<MasterItemRecord | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [transactions, setTransactions] = useState<ItemTransactionRecord[]>([]);
  const [items, setItems] = useState<MasterItemRecord[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [shownCount, setShownCount] = useState(ITEM_TXN_PAGE_SIZE);
  const [dialog, setDialog] = useState<{ open: boolean; type: TransactionType }>({
    open: false,
    type: 'add',
  });
  const [editOpen, setEditOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const [imageExpanded, setImageExpanded] = useState(false);

  const reload = useCallback(async () => {
    if (!supabase || !businessId) {
      return;
    }
    setLoadError(false);
    try {
      const [itemRow, txns, allItems] = await Promise.all([
        fetchMasterItem(supabase, businessId, itemId),
        fetchItemTransactions(supabase, businessId, itemId),
        fetchMasterItems(supabase, businessId),
      ]);
      if (!itemRow) {
        setNotFound(true);
        return;
      }
      setItem(itemRow);
      setTransactions(txns);
      setItems(allItems);
      if (itemRow.image_path) {
        const urls = await createImageUrls(supabase, [itemRow.image_path]);
        setImageUrl(urls.get(itemRow.image_path) ?? null);
      } else {
        setImageUrl(null);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [supabase, businessId, itemId]);

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

  // FIFO stock and value derived from this item's own transactions.
  const currentStock = useMemo(
    () =>
      computeCurrentStock(
        transactions.map((txn) => ({
          id: txn.id,
          masterItemId: itemId,
          transactionType: txn.transactionType,
          quantity: txn.quantity,
          unitPrice: txn.unitPrice,
          remainingQuantity: txn.remainingQuantity,
          transactionDate: txn.transactionDate,
        })),
      ),
    [transactions, itemId],
  );
  const currentValue = useMemo(
    () =>
      computeFifoValue(
        transactions.map((txn) => ({
          id: txn.id,
          masterItemId: itemId,
          transactionType: txn.transactionType,
          quantity: txn.quantity,
          unitPrice: txn.unitPrice,
          remainingQuantity: txn.remainingQuantity,
          transactionDate: txn.transactionDate,
        })),
      ),
    [transactions, itemId],
  );

  const visibleTransactions = transactions.slice(0, shownCount);
  const stockByItemId = useMemo(
    () => new Map(item ? [[item.id, currentStock] as const] : []),
    [item, currentStock],
  );

  // Delete follows the master-list rule: blocked while the item has any live
  // transactions (the caller-side guard for the tombstone delete).
  const hasTransactions = transactions.length > 0;

  const handleDelete = async () => {
    if (!supabase || !item) {
      return;
    }
    setDeleteError(false);
    try {
      await deleteMasterItem(supabase, item.id);
      setConfirmingDelete(false);
      router.push('/inventory');
    } catch {
      setDeleteError(true);
    }
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

  if (notFound) {
    return <Alert severity="warning">{t('item.not_found')}</Alert>;
  }

  if (loadError || !item) {
    return <Alert severity="error">{t('error.load_failed')}</Alert>;
  }

  return (
    <Box sx={{ pb: 10 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Tooltip title={t('item.back')}>
          <IconButton aria-label={t('item.back')} onClick={() => router.push('/inventory')}>
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          {item.name}
        </Typography>
        {canManageItems && (
          <Box>
            <Tooltip title={tCommon('action.edit')}>
              <IconButton aria-label={tCommon('action.edit')} onClick={() => setEditOpen(true)}>
                <EditIcon />
              </IconButton>
            </Tooltip>
            <Tooltip
              title={hasTransactions ? t('master.delete_blocked') : tCommon('action.delete')}
            >
              <span>
                <IconButton
                  aria-label={tCommon('action.delete')}
                  disabled={hasTransactions}
                  onClick={() => setConfirmingDelete(true)}
                >
                  <DeleteIcon />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        {imageUrl ? (
          <Avatar
            src={imageUrl}
            alt={item.name}
            variant="rounded"
            sx={{ width: 72, height: 72, cursor: 'pointer' }}
            onClick={() => setImageExpanded(true)}
          />
        ) : (
          <Avatar variant="rounded" sx={{ width: 72, height: 72 }}>
            <Inventory2OutlinedIcon />
          </Avatar>
        )}
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t('txn.current_stock', {
              qty: formatIndianNumber(currentStock),
              unit: unitLabel(item.unit),
            })}
          </Typography>
          <Typography variant="h6">{showAmounts ? formatAmount(currentValue) : <MaskedAmount />}</Typography>
          <Typography variant="caption" color="text.secondary">
            {t('stock.value_label')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            color="success"
            onClick={() => setDialog({ open: true, type: 'add' })}
          >
            {t('txn.add')}
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => setDialog({ open: true, type: 'remove' })}
          >
            {t('txn.remove')}
          </Button>
        </Box>
      </Box>

      <Typography variant="subtitle1" component="h3" sx={{ mb: 0.5 }}>
        {t('item.history_title')}
      </Typography>

      {transactions.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 6 }}>
          {t('item.no_transactions')}
        </Typography>
      ) : (
        <>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
            {t('item.showing', {
              shown: visibleTransactions.length,
              total: transactions.length,
            })}
          </Typography>
          <TableContainer>
            <Table size="small" aria-label={t('item.history_title')}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('item.col_date')}</TableCell>
                  <TableCell>{t('item.col_type')}</TableCell>
                  <TableCell align="right">{t('item.col_quantity')}</TableCell>
                  <TableCell align="right">{t('item.col_unit_price')}</TableCell>
                  <TableCell align="right">{t('item.col_total_price')}</TableCell>
                  <TableCell>{t('item.col_notes')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleTransactions.map((txn) => (
                  <TableRow key={txn.id}>
                    <TableCell>
                      {format.dateTime(new Date(txn.transactionDate), {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={txn.transactionType === 'add' ? 'success' : 'error'}
                        label={txn.transactionType === 'add' ? t('txn.add') : t('txn.remove')}
                      />
                    </TableCell>
                    <TableCell align="right">{formatIndianNumber(txn.quantity)}</TableCell>
                    <TableCell align="right">{showAmounts ? formatAmount(txn.unitPrice) : <MaskedAmount />}</TableCell>
                    <TableCell align="right">
                      {showAmounts ? formatAmount(Math.round(txn.quantity * txn.unitPrice * 100) / 100) : <MaskedAmount />}
                    </TableCell>
                    <TableCell>{txn.notes ?? ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {shownCount < transactions.length && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
              <Button onClick={() => setShownCount((count) => count + ITEM_TXN_PAGE_SIZE)}>
                {t('item.load_more')}
              </Button>
            </Box>
          )}
        </>
      )}

      <RecordTransactionDialog
        open={dialog.open}
        items={items}
        stockByItemId={stockByItemId}
        preselectedItem={item}
        initialType={dialog.type}
        supabase={supabase}
        businessId={businessId}
        userId={userId}
        onClose={() => setDialog((state) => ({ ...state, open: false }))}
        onSaved={(result) => {
          setDialog((state) => ({ ...state, open: false }));
          setSnack(
            result.type === 'add'
              ? t('txn.add_success', { name: result.itemName })
              : t('txn.remove_success', {
                  name: result.itemName,
                  amount: maskAmount(formatAmount(result.removedValue ?? 0), showAmounts),
                }),
          );
          setShownCount(ITEM_TXN_PAGE_SIZE);
          void reload();
        }}
      />

      <MasterItemDialog
        open={editOpen}
        item={item}
        items={items}
        currentImageUrl={imageUrl}
        supabase={supabase}
        businessId={businessId}
        onClose={() => setEditOpen(false)}
        onPickExisting={(existing) => {
          // A duplicate chip points at another master item — go to its page.
          setEditOpen(false);
          router.push(`/inventory/${existing.id}`);
        }}
        onSaved={() => {
          setEditOpen(false);
          setSnack(t('master.save_success'));
          void reload();
        }}
      />

      <Dialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        maxWidth="xs"
      >
        <DialogTitle>{t('master.delete_title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('master.delete_message')}</DialogContentText>
          {deleteError && (
            <Typography variant="body2" color="error" sx={{ mt: 1 }}>
              {t('error.save_failed')}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmingDelete(false)}>{tCommon('action.cancel')}</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>
            {tCommon('action.delete')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snack !== null}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        message={snack ?? ''}
      />

      <Dialog
        open={imageExpanded}
        onClose={() => setImageExpanded(false)}
        maxWidth="md"
        aria-label={item.name}
      >
        {imageUrl && (
          <Box
            component="img"
            src={imageUrl}
            alt={item.name}
            sx={{ maxWidth: '100%', maxHeight: '80vh', display: 'block' }}
            onClick={() => setImageExpanded(false)}
          />
        )}
      </Dialog>
    </Box>
  );
}
