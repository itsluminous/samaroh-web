/**
 * Business profile logo preview (owner feedback: the web business
 * configuration screen had no image): the profile card shows the business
 * logo fetched from the private `logos` bucket (same fetch as the invoice
 * header), falls back to the business-name initials when there is no logo
 * or storage is unavailable (guest mode), and always shows the localized
 * change-it-from-the-mobile-app hint (no upload path on web).
 */
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { SupabaseClient } from '@supabase/supabase-js';
import en from '../messages/en.json';
import hi from '../messages/hi.json';
import BusinessLogoAvatar, {
  businessInitials,
} from '@/app/[locale]/(app)/menu/_components/BusinessLogoAvatar';
import { BusinessProfileCard } from '@/app/[locale]/(app)/menu/_components/SettingsScreen';

type Messages = typeof en;

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

/** Minimal storage-only client double (fetchLogoPng surface). */
function storageClient(download: jest.Mock) {
  const from = jest.fn(() => ({ download }));
  return { client: { storage: { from } } as unknown as SupabaseClient, from };
}

/** Download resolving like a real bucket hit (Blob-ish with arrayBuffer). */
function downloadWithPng() {
  return jest.fn(async () => ({
    data: { arrayBuffer: async () => PNG_BYTES.buffer },
    error: null,
  }));
}

/** Download resolving like the guest local client (no storage). */
function downloadUnavailable() {
  return jest.fn(async () => ({ data: null, error: { message: 'storage unavailable in guest mode' } }));
}

function makeBusiness(overrides: Partial<Parameters<typeof BusinessProfileCard>[0]['business']> = {}) {
  return {
    id: 'biz-1',
    name: 'Sharma Palace',
    business_type: 'Banquet hall',
    address: null,
    owner_name: 'Ramesh Sharma',
    logo_path: 'biz-1/logo.png',
    invoice_prefix: 'SP',
    ...overrides,
  };
}

function withIntl(ui: React.ReactElement, locale = 'en', messages: Messages = en) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

beforeAll(() => {
  // jsdom has no object-URL support; the avatar turns the fetched bytes
  // into a blob URL for the <img src>.
  Object.defineProperty(URL, 'createObjectURL', { value: jest.fn(() => 'blob:logo'), writable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: jest.fn(), writable: true });
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('businessInitials', () => {
  it('takes the first letters of the first two words, uppercased', () => {
    expect(businessInitials('Sharma Palace')).toBe('SP');
    expect(businessInitials('  shree ganesh caterers ')).toBe('SG');
  });

  it('handles single-word names', () => {
    expect(businessInitials('Utsav')).toBe('U');
  });
});

describe('BusinessLogoAvatar', () => {
  it('renders the logo from the logos bucket when the business has one', async () => {
    const download = downloadWithPng();
    const { client, from } = storageClient(download);

    withIntl(<BusinessLogoAvatar supabase={client} business={makeBusiness()} />);

    const img = await screen.findByRole('img', { name: 'Sharma Palace' });
    expect(img).toHaveAttribute('src', 'blob:logo');
    expect(from).toHaveBeenCalledWith('logos');
    expect(download).toHaveBeenCalledWith('biz-1/logo.png');
  });

  it('shows the initials placeholder when the business has no logo (storage never touched)', () => {
    const download = downloadWithPng();
    const { client, from } = storageClient(download);

    withIntl(<BusinessLogoAvatar supabase={client} business={makeBusiness({ logo_path: null })} />);

    expect(screen.getByText('SP')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(from).not.toHaveBeenCalled();
  });

  it('keeps the initials placeholder when storage is unavailable (guest mode)', async () => {
    const download = downloadUnavailable();
    const { client } = storageClient(download);

    withIntl(<BusinessLogoAvatar supabase={client} business={makeBusiness()} />);

    await waitFor(() => expect(download).toHaveBeenCalled());
    expect(screen.getByText('SP')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('BusinessProfileCard logo section', () => {
  it('shows the localized change-from-mobile-app hint next to the preview', () => {
    const { client } = storageClient(downloadWithPng());

    withIntl(
      <BusinessProfileCard supabase={client} business={makeBusiness({ logo_path: null })} onSaved={() => {}} />,
    );

    expect(screen.getByText(en.settings.business.logo_mobile_hint)).toBeInTheDocument();
    expect(screen.getByText('SP')).toBeInTheDocument();
  });

  it('shows the hint in Hindi', () => {
    const { client } = storageClient(downloadWithPng());

    withIntl(
      <BusinessProfileCard supabase={client} business={makeBusiness({ logo_path: null })} onSaved={() => {}} />,
      'hi',
      hi as Messages,
    );

    expect(screen.getByText(hi.settings.business.logo_mobile_hint)).toBeInTheDocument();
  });
});
