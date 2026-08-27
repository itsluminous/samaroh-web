/**
 * Renders the app shell in both v1 locales and asserts the chrome (app name,
 * 4 section nav labels) is fully localized from the generated catalog.
 */
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import en from '../messages/en.json';
import hi from '../messages/hi.json';
import AppShell from '@/components/AppShell';

jest.mock('next/navigation', () => ({
  usePathname: () => '/en/booking',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
  }),
  useParams: () => ({ locale: 'en' }),
  useSearchParams: () => new URLSearchParams(),
  redirect: jest.fn(),
}));

type Messages = typeof en;

function renderShell(locale: string, messages: Messages, children: ReactNode = null) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AppShell>{children}</AppShell>
    </NextIntlClientProvider>,
  );
}

describe('AppShell', () => {
  it.each([
    {
      locale: 'en',
      messages: en,
      appName: en.common.app_name,
      navLabels: Object.values(en.common.nav),
    },
    {
      locale: 'hi',
      messages: hi as Messages,
      appName: hi.common.app_name,
      navLabels: Object.values(hi.common.nav),
    },
  ])('renders the localized chrome in $locale', ({ locale, messages, appName, navLabels }) => {
    renderShell(locale, messages);

    expect(screen.getByRole('heading', { name: appName })).toBeInTheDocument();
    expect(navLabels).toHaveLength(4);
    for (const label of navLabels) {
      // Each section label appears in the desktop rail and the mobile bottom nav.
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('renders its children in the main region', () => {
    const probe = en.app.placeholder.title;
    renderShell('en', en, <span>{probe}</span>);
    expect(screen.getByRole('main')).toHaveTextContent(probe);
  });

  it('lets the main region shrink below its content min-width', () => {
    // <main> is a flex item; without min-width:0 any wide child (long chip
    // rows) inflates it and the whole page pans sideways on narrow phones.
    renderShell('en', en);
    expect(screen.getByRole('main')).toHaveStyle({ minWidth: 0 });
  });
});
