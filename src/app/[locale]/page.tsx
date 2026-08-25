import { redirect } from '@/i18n/navigation';

export default async function LocaleIndexPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  // The Booking tab is the home section (§4.1 of the product spec).
  redirect({ href: '/booking', locale });
}
