'use client';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import ChipRow from '@/components/ChipRow';

interface BusinessRelatedPillProps {
  /** true = business-related (default), false = personal. */
  value: boolean;
  onChange: (value: boolean) => void;
  /** Business name interpolated into the question. */
  businessName: string;
  disabled?: boolean;
}

/**
 * Yes/no pill selector asking whether a party is associated with the
 * business (spec: parties.business_related). Yes (default) = counted in the
 * financial reports; No = personal, shown only in the personal-expenses
 * report. Used on the add-party dialog and the party ledger header.
 */
export default function BusinessRelatedPill({
  value,
  onChange,
  businessName,
  disabled = false,
}: BusinessRelatedPillProps) {
  const t = useTranslations('expenses');
  const tCommon = useTranslations('common');

  const pill = (pillValue: boolean, label: string) => (
    <Chip
      label={label}
      size="small"
      clickable={!disabled}
      disabled={disabled}
      color={value === pillValue ? 'primary' : 'default'}
      variant={value === pillValue ? 'filled' : 'outlined'}
      onClick={() => onChange(pillValue)}
      aria-pressed={value === pillValue}
    />
  );

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
        {t('add_person.business_question', { business: businessName })}
      </Typography>
      <ChipRow>
        {pill(true, tCommon('action.yes'))}
        {pill(false, tCommon('action.no'))}
      </ChipRow>
    </Box>
  );
}
