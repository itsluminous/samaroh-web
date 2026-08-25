'use client';

import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Fab from '@mui/material/Fab';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useBusiness } from '@/lib/hooks/useBusiness';
import {
  createImageUrls,
  deleteMasterItem,
  fetchItemIdsWithTransactions,
  fetchMasterItems,
  type MasterItemRecord,
} from '../_lib/queries';
import { isBuiltInUnit, unitLabelKey } from '../_lib/units';
import MasterItemDialog from './MasterItemDialog';

/**
 * Master list (spec §4.3): manage master items — photo, name, unit; edit /
 * delete (blocked while the item has transactions); fuzzy duplicate chips on
 * add live in the dialog.
 */
export default function Masterlist() {
  const t = useTranslations('inventory');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { supabase, businessId, loading: businessLoading, error: businessError } = useBusiness();

  const [items, setItems] = useState<MasterItemRecord[]>([]);
  const [itemsWithTxns, setItemsWithTxns] = useState<Set<string>>(new Set());
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MasterItemRecord | null>(null);
  const [deletingItem, setDeletingItem] = useState<MasterItemRecord | null>(null);
  const [deleteError, setDeleteError] = useState(false);

  const reload = useCallback(async () => {
    if (!supabase || !businessId) {
      return;
    }
    setLoadError(false);
    try {
      const [itemRows, txnItemIds] = await Promise.all([
        fetchMasterItems(supabase, businessId),
        fetchItemIdsWithTransactions(supabase, businessId),
      ]);
      setItems(itemRows);
      setItemsWithTxns(txnItemIds);
      const paths = itemRows
        .map((item) => item.image_path)
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

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => query === '' || item.name.toLowerCase().includes(query));
  }, [items, search]);

  const handleDelete = async () => {
    if (!supabase || !deletingItem) {
      return;
    }
    setDeleteError(false);
    try {
      await deleteMasterItem(supabase, deletingItem.id);
      setDeletingItem(null);
      void reload();
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

  if (loadError) {
    return <Alert severity="error">{t('error.load_failed')}</Alert>;
  }

  return (
    <Box sx={{ pb: 10 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Tooltip title={t('stock.title')}>
          <IconButton aria-label={t('stock.title')} onClick={() => router.push('/inventory')}>
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          {t('stock.open_masterlist')}
        </Typography>
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

      {items.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 6 }}>
          {t('master.empty')}
        </Typography>
      ) : visibleItems.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 6 }}>
          {t('stock.no_results')}
        </Typography>
      ) : (
        <List disablePadding>
          {visibleItems.map((item) => {
            const imageUrl = item.image_path ? imageUrls.get(item.image_path) : undefined;
            const hasTxns = itemsWithTxns.has(item.id);
            return (
              <ListItem
                key={item.id}
                divider
                secondaryAction={
                  <Box>
                    <IconButton
                      aria-label={tCommon('action.edit')}
                      onClick={() => {
                        setEditingItem(item);
                        setDialogOpen(true);
                      }}
                    >
                      <EditIcon />
                    </IconButton>
                    <Tooltip title={hasTxns ? t('master.delete_blocked') : tCommon('action.delete')}>
                      <span>
                        <IconButton
                          aria-label={tCommon('action.delete')}
                          disabled={hasTxns}
                          onClick={() => setDeletingItem(item)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                }
              >
                <ListItemAvatar>
                  <Avatar src={imageUrl} alt={item.name} variant="rounded" sx={{ width: 48, height: 48 }}>
                    <Inventory2OutlinedIcon />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText primary={item.name} secondary={unitLabel(item.unit)} />
              </ListItem>
            );
          })}
        </List>
      )}

      <Fab
        color="primary"
        variant="extended"
        aria-label={t('master.add_item')}
        onClick={() => {
          setEditingItem(null);
          setDialogOpen(true);
        }}
        sx={{ position: 'fixed', right: 24, bottom: { xs: 80, md: 24 } }}
      >
        <AddIcon sx={{ mr: 1 }} />
        {t('master.add_item')}
      </Fab>

      <MasterItemDialog
        open={dialogOpen}
        item={editingItem}
        items={items}
        currentImageUrl={
          editingItem?.image_path ? (imageUrls.get(editingItem.image_path) ?? null) : null
        }
        supabase={supabase}
        businessId={businessId}
        onClose={() => setDialogOpen(false)}
        onPickExisting={(existing) => setEditingItem(existing)}
        onSaved={() => {
          setDialogOpen(false);
          void reload();
        }}
      />

      <Dialog open={deletingItem !== null} onClose={() => setDeletingItem(null)} maxWidth="xs">
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
          <Button onClick={() => setDeletingItem(null)}>{tCommon('action.cancel')}</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>
            {tCommon('action.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
