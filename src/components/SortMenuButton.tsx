'use client';

import CheckIcon from '@mui/icons-material/Check';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { LIST_SORT_ORDERS, type ListSortOrder } from '@/lib/listSort';

interface SortMenuButtonProps {
  /** Currently selected order (checkmarked in the menu). */
  value: ListSortOrder;
  onChange: (order: ListSortOrder) => void;
}

/**
 * Sort control (Android parity): an icon button opening a three-option menu
 * (last updated / A to Z / Z to A) with a checkmark on the active order.
 * Labels come from the cross-platform `common.sort.*` keys — the
 * `ListSortOrder` values are deliberately the key leaf names.
 */
export default function SortMenuButton({ value, onChange }: SortMenuButtonProps) {
  const t = useTranslations('common');
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  return (
    <>
      <Tooltip title={t('sort.open')}>
        <IconButton
          aria-label={t('sort.open')}
          aria-haspopup="menu"
          onClick={(event) => setAnchorEl(event.currentTarget)}
        >
          <SwapVertIcon />
        </IconButton>
      </Tooltip>
      <Menu open={anchorEl !== null} anchorEl={anchorEl} onClose={() => setAnchorEl(null)}>
        {LIST_SORT_ORDERS.map((order) => (
          <MenuItem
            key={order}
            selected={order === value}
            onClick={() => {
              setAnchorEl(null);
              onChange(order);
            }}
          >
            <ListItemIcon sx={order === value ? undefined : { visibility: 'hidden' }}>
              <CheckIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t(`sort.${order}`)}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
