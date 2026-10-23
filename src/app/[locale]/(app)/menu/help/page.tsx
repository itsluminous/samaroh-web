import { useTranslations } from 'next-intl';
import HelpScreen from '../_components/HelpScreen';

// Menu → Help: the in-app user guide (shared/help/guide.json). Server wrapper
// keeps the page statically renderable; visibility is resolved client-side.
export default function HelpPage() {
  const t = useTranslations('common.menu');
  return <HelpScreen title={t('help')} />;
}
