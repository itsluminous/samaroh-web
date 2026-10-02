import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import AppTheme from '@/components/AppTheme';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';
import { routing } from '@/i18n/routing';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// PWA chrome color — primary from shared/brand/palette.md.
export const viewport: Viewport = {
  themeColor: '#6750A4',
};

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'common' });
  return {
    title: t('app_name'),
    manifest: '/manifest.webmanifest',
    // All icons are rendered from shared/brand/app-icon.svg — the same artwork as the
    // Android launcher icon (scripts/gen-icons.mjs).
    icons: {
      icon: [
        { url: '/icons/favicon.ico', sizes: '16x16 32x32 48x48', type: 'image/x-icon' },
        { url: '/icons/icon.svg', type: 'image/svg+xml' },
        { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      shortcut: [{ url: '/icons/favicon.ico', type: 'image/x-icon' }],
      apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
    appleWebApp: {
      capable: true,
      title: t('app_name'),
    },
  };
}

export default async function LocaleLayout(props: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <InitColorSchemeScript attribute="class" />
        <AppRouterCacheProvider options={{ enableCssLayer: false }}>
          <NextIntlClientProvider>
            <AppTheme>{props.children}</AppTheme>
          </NextIntlClientProvider>
        </AppRouterCacheProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
