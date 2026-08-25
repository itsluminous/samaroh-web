import { useTranslations } from 'next-intl';
import PlaceholderScreen from '@/components/PlaceholderScreen';

export default function BookingPage() {
  const t = useTranslations('common.nav');
  return <PlaceholderScreen feature={t('booking')} />;
}
