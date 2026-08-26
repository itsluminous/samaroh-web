import { useTranslations } from 'next-intl';
import MenuHome from './_components/MenuHome';

// Menu tab home (§4.4): Settings, Reports, Members (owner only), About.
export default function MenuPage() {
  // Server component wrapper keeps the page statically renderable; the
  // owner-only Members row is resolved client-side in MenuHome.
  const t = useTranslations('menu.home');
  return <MenuHome title={t('title')} />;
}
