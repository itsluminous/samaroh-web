'use client';

/**
 * Permission matrix editor (§3 / §4.4): quick presets (Viewer / Staff /
 * Manager) + per-action switches grouped by module, mirroring
 * shared/permissions/permissions-schema.json exactly.
 */
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useTranslations } from 'next-intl';
import type { MemberPermissions, PermissionModule, PresetKey } from '@/lib/permissions/permissions';
import { hasPerm, matchingPreset, PERMISSION_MATRIX, presetPermissions } from '@/lib/permissions/permissions';

const PRESETS: PresetKey[] = ['viewer', 'staff', 'manager'];

export default function PermissionMatrixEditor({
  value,
  onChange,
}: {
  value: MemberPermissions;
  onChange: (next: MemberPermissions) => void;
}) {
  const t = useTranslations('auth.permissions');
  const activePreset = matchingPreset(value);

  const toggle = (module: PermissionModule, action: string, checked: boolean) => {
    const next = structuredClone(value) as MemberPermissions;
    (next[module] as Record<string, boolean>)[action] = checked;
    onChange(next);
  };

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="caption" color="text.secondary">
          {t('presets_label')}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
          {PRESETS.map((preset) => (
            <Chip
              key={preset}
              label={t(`preset_${preset}`)}
              color={activePreset === preset ? 'primary' : 'default'}
              variant={activePreset === preset ? 'filled' : 'outlined'}
              onClick={() => onChange(presetPermissions(preset))}
            />
          ))}
        </Stack>
      </Box>

      {PERMISSION_MATRIX.map(({ module, actions }) => (
        <Box key={module}>
          <Typography variant="subtitle2">{t(`group_${module}`)}</Typography>
          <Stack sx={{ pl: 1 }}>
            {actions.map((action) => (
              <FormControlLabel
                key={action}
                control={
                  <Switch
                    size="small"
                    checked={hasPerm(value, module, action)}
                    onChange={(_e, checked) => toggle(module, action, checked)}
                  />
                }
                label={t(`action_${action}`)}
              />
            ))}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}
