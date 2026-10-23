'use client';

/**
 * Menu → Help (Android parity): the single-source user guide
 * (shared/help/guide.json, copied in by `npm run gen:help`) rendered in the
 * UI language — screens → tasks → numbered steps — with live search and a
 * "Show me" button per task that navigates to where the task starts (and,
 * where Android opens a sheet, opens the matching web dialog via `?action=`).
 *
 * Visibility is the guide's own rule (src/lib/help/guide.ts): web-platform
 * entries only, permission-gated screens/tasks HIDDEN (never greyed) for a
 * member who lacks the capability; degraded modes (Supabase unconfigured,
 * guest, membership still loading) fail open like the app chrome does.
 *
 * `?hl=<screenId>` (from the title-bar "Help for this screen" button) scrolls
 * to and briefly tints that screen's section — the same `hl` mechanism menu
 * search uses, so the hook and ids are shared.
 */
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SearchIcon from '@mui/icons-material/Search';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import {
  HELP_GUIDE,
  filterGuideForWeb,
  helpSectionDomId,
  publicHelpUrl,
  searchGuide,
  showMeHref,
  type HelpLang,
  type HelpScreen as HelpScreenData,
} from '@/lib/help/guide';
import { highlightSx, useHighlightParam } from '@/lib/hooks/useHighlightParam';
import { useMembership } from '@/lib/permissions/useMembership';

const SCREEN_IDS = HELP_GUIDE.screens.map((screen) => screen.id);

export default function HelpScreen({ title }: { title: string }) {
  const t = useTranslations();
  const lang = useLocale() as HelpLang;
  const membership = useMembership();

  // Fail open exactly like the nav chrome (src/lib/permissions/visibility.ts):
  // only a POSITIVELY resolved non-owner is filtered by permissions.
  const failOpen = !membership.supabase || membership.loading || membership.error !== null;
  const gates = useMemo(
    () => ({ isOwner: failOpen || membership.isOwner, permissions: membership.permissions }),
    [failOpen, membership.isOwner, membership.permissions],
  );

  const visible = useMemo(() => filterGuideForWeb(HELP_GUIDE.screens, gates), [gates]);
  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  const searching = trimmed.length > 0;
  const screens = useMemo(() => searchGuide(query, visible, lang), [query, visible, lang]);

  const hl = useHighlightParam(SCREEN_IDS);

  return (
    <Stack spacing={2} sx={{ maxWidth: 760 }}>
      <Typography variant="h5" component="h1">
        {title}
      </Typography>
      <Typography color="text.secondary">{t('menu.help.intro')}</Typography>

      <TextField
        fullWidth
        size="small"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('menu.help.search_placeholder')}
        slotProps={{
          htmlInput: { 'aria-label': t('menu.help.search_placeholder') },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
            endAdornment:
              query.length > 0 ? (
                <InputAdornment position="end">
                  <IconButton size="small" edge="end" aria-label={t('menu.search.clear')} onClick={() => setQuery('')}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
          },
        }}
      />

      {screens.length === 0 ? (
        <Typography color="text.secondary">{t('menu.help.no_results')}</Typography>
      ) : (
        screens.map((screen) => (
          <ScreenSection key={screen.id} screen={screen} lang={lang} expandAll={searching} highlighted={hl === screen.id} />
        ))
      )}
    </Stack>
  );
}

function ScreenSection({
  screen,
  lang,
  expandAll,
  highlighted,
}: {
  screen: HelpScreenData;
  lang: HelpLang;
  expandAll: boolean;
  highlighted: boolean;
}) {
  const t = useTranslations();
  const onlineLabel = t('menu.help.open_online');
  return (
    <Paper
      component="section"
      variant="outlined"
      id={helpSectionDomId(screen.id)}
      aria-labelledby={`${helpSectionDomId(screen.id)}-title`}
      sx={{ p: 2, ...(highlighted ? highlightSx : null) }}
    >
      <Stack direction="row" alignItems="flex-start" spacing={1}>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="h6" component="h2" id={`${helpSectionDomId(screen.id)}-title`}>
            {screen.title[lang]}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {screen.summary[lang]}
          </Typography>
        </Box>
        {/* The public (GitHub Pages) page of this section — for sharing a
            link with someone who is not signed in. */}
        <Tooltip title={onlineLabel}>
          <IconButton
            component="a"
            href={publicHelpUrl(lang, screen.id)}
            target="_blank"
            rel="noopener noreferrer help"
            aria-label={onlineLabel}
            size="small"
          >
            <OpenInNewIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      <Box sx={{ mt: 1.5 }}>
        {screen.tasks.map((task) => (
          <TaskAccordion key={task.id} screenId={screen.id} task={task} lang={lang} expandAll={expandAll} />
        ))}
      </Box>
    </Paper>
  );
}

function TaskAccordion({
  screenId,
  task,
  lang,
  expandAll,
}: {
  screenId: string;
  task: HelpScreenData['tasks'][number];
  lang: HelpLang;
  expandAll: boolean;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const href = showMeHref(screenId, task);
  const panelId = `help-${screenId}-${task.id}`;
  return (
    <Accordion
      disableGutters
      variant="outlined"
      expanded={expandAll || open}
      onChange={(_, expanded) => setOpen(expanded)}
      sx={{ '&:before': { display: 'none' } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-controls={panelId} id={`${panelId}-header`}>
        {/* The summary is a <button>: phrasing content only, hence spans. */}
        <Stack component="span" direction="row" spacing={1} alignItems="center" sx={{ flexGrow: 1, minWidth: 0, pr: 1 }}>
          <Typography component="span" sx={{ flexGrow: 1, textAlign: 'left' }}>
            {task.title[lang]}
          </Typography>
          <Chip component="span" size="small" variant="outlined" label={t('menu.help.step_count', { count: task.steps.length })} />
        </Stack>
      </AccordionSummary>
      {/* MUI gives the collapsible region the summary's aria-controls id. */}
      <AccordionDetails>
        <Box component="ol" sx={{ m: 0, pl: 3 }}>
          {task.steps.map((step, index) => (
            <Typography component="li" key={index} sx={{ mb: 0.75 }}>
              {step[lang]}
            </Typography>
          ))}
        </Box>
        {/* Hidden (not greyed) when the web has no route for this task. */}
        {href !== null ? (
          <Button component={Link} href={href} size="small" startIcon={<PlayArrowIcon />} sx={{ mt: 1 }}>
            {t('menu.help.show_me')}
          </Button>
        ) : null}
      </AccordionDetails>
    </Accordion>
  );
}
