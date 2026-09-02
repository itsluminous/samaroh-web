/**
 * Event-types manage page row layout: the marker badge and colour dot live
 * INSIDE the text block (badge on its own line, like the expenses Personal
 * tag) and the reorder/edit/delete buttons sit in the normal flex flow — no
 * absolutely-positioned secondaryAction for content to slide under at
 * narrow (320px) widths.
 */
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import EventTypesScreen from '@/app/[locale]/(app)/menu/_components/EventTypesScreen';
import type { EventTypePreset } from '@/lib/booking/eventTypePresets';
import { normalizePermissions } from '@/lib/permissions/permissions';

function makePreset(overrides: Partial<EventTypePreset>): EventTypePreset {
  return {
    id: 'p-x',
    business_id: 'biz-1',
    label: 'X',
    icon: '\u2728',
    color: null,
    kind: 'booking',
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

const mockPresets = [
  makePreset({ id: 'p1', label: 'Wedding', icon: '\u{1F492}', kind: 'booking', sort_order: 0 }),
  makePreset({ id: 'p2', label: 'Lagan', icon: '\u{1FA94}', kind: 'marker', sort_order: 1 }),
];

jest.mock('@/lib/permissions/useMembership', () => ({
  useMembership: () => ({
    supabase: {},
    business: { id: 'biz-1', name: 'Biz' },
    userId: 'u1',
    isOwner: true,
    permissions: mockNormalize(),
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

// Hoisted-safe accessor for normalizePermissions inside the mock factory.
function mockNormalize() {
  return normalizePermissions({});
}

jest.mock('@/lib/booking/eventTypePresets', () => ({
  ...jest.requireActual('@/lib/booking/eventTypePresets'),
  fetchEventTypes: jest.fn(() => Promise.resolve(mockPresets)),
}));

function renderScreen() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <EventTypesScreen />
    </NextIntlClientProvider>,
  );
}

describe('EventTypesScreen row layout (marker badge vs action buttons)', () => {
  it('renders the marker badge without an absolutely-positioned secondaryAction', async () => {
    const { container } = renderScreen();
    expect(await screen.findByText(en.booking.marker.badge)).toBeInTheDocument();
    // Regression: the old layout used ListItem secondaryAction (absolute
    // positioning), which the badge and colour dot slid under.
    expect(container.querySelector('.MuiListItemSecondaryAction-root')).toBeNull();
  });

  it('the badge lives inside the row text block, on its own line', async () => {
    renderScreen();
    const badge = await screen.findByText(en.booking.marker.badge);
    const textRoot = badge.closest('.MuiListItemText-root');
    expect(textRoot).not.toBeNull();
    expect(textRoot).toHaveTextContent('Lagan');
    // The action buttons are OUTSIDE the text block (flex siblings).
    const row = badge.closest('li');
    const moveUp = row?.querySelector(`[aria-label="${en.settings.event_types.move_up}"]`);
    expect(moveUp).not.toBeNull();
    expect(textRoot!.contains(moveUp!)).toBe(false);
  });

  it('booking-kind rows carry no badge', async () => {
    renderScreen();
    await screen.findByText('Wedding');
    const weddingRow = screen.getByText('Wedding').closest('li');
    expect(weddingRow).not.toBeNull();
    expect(weddingRow!.textContent).not.toContain(en.booking.marker.badge);
  });
});
