'use client';

/**
 * Per-screen help metadata: a `<link rel="help">` pointing at the public
 * GitHub Pages guide page for the screen the user is on (index page when the
 * route has no section), in the UI language. React 19 hoists `<link>` rendered
 * anywhere in the tree into `<head>`, so this needs no metadata plumbing per
 * route. Cheap and harmless; assistive tech / browsers that honour rel=help
 * get a stable, public, sign-in-free destination (shared help/README.md).
 */
import { useLocale } from 'next-intl';
import { usePathname } from '@/i18n/navigation';
import { publicHelpUrl, screenIdForPath, type HelpLang } from '@/lib/help/guide';

export default function HelpLink() {
  const pathname = usePathname();
  const lang = useLocale() as HelpLang;
  return <link rel="help" href={publicHelpUrl(lang, screenIdForPath(pathname))} />;
}
