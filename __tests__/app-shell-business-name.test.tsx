/**
 * Top bar business-name title (Android parity): the AppBar heading shows the
 * ACTIVE business name from membership, falling back to the app name when
 * there is none (signed out, guest without a business). Long names shrink
 * their font-size to fit the available bar space (down to 65% of the h6
 * size) instead of wrapping or hard-truncating; past the floor the ellipsis
 * applies. jsdom has no layout, so the shrink block synthesizes widths:
 * the heading is `barWidth` px wide and text measures `pxPerCharAtBase` px
 * per character at the base font — same approach as the report-amount
 * autoshrink suite.
 */
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../messages/en.json';
import AppShell from '@/components/AppShell';
import { MIN_FIT_SCALE } from '@/lib/hooks/useFitText';
import { emptyPermissions } from '@/lib/permissions/permissions';

const mockUseMembership = jest.fn();
jest.mock('@/lib/permissions/useMembership', () => ({
  useMembership: () => mockUseMembership(),
}));

function membership(overrides: Record<string, unknown> = {}) {
  return {
    supabase: null,
    business: null,
    userId: null,
    isOwner: false,
    permissions: emptyPermissions(),
    loading: false,
    error: null,
    refresh: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  mockUseMembership.mockReturnValue(membership());
});

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

function renderShell() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <AppShell>{null}</AppShell>
    </NextIntlClientProvider>,
  );
}

function withBusiness(name: string) {
  mockUseMembership.mockReturnValue(
    membership({ supabase: {}, business: { id: 'b1', name }, userId: 'u1' }),
  );
}

const heading = () => screen.getByRole('heading', { level: 1 });

// --- Business name render + fallback -----------------------------------------

describe('AppShell top bar title', () => {
  it('shows the active business name as the h1', () => {
    withBusiness('Sharma Tent House');
    renderShell();
    expect(heading()).toHaveTextContent('Sharma Tent House');
    expect(screen.queryByText(en.common.app_name)).not.toBeInTheDocument();
  });

  it('falls back to the app name when there is no business (signed out / guest)', () => {
    renderShell(); // default membership: business null, no supabase
    expect(heading()).toHaveTextContent(en.common.app_name);
  });

  it('falls back to the app name for a blank business name', () => {
    withBusiness('   ');
    renderShell();
    expect(heading()).toHaveTextContent(en.common.app_name);
  });

  it('keeps heading semantics (exactly one level-1 heading in the bar)', () => {
    withBusiness('Sharma Tent House');
    renderShell();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('styles the heading single-line with an ellipsis fallback', () => {
    // Past the 65% shrink floor the residual overflow ellipsizes instead of
    // wrapping — asserted here where getComputedStyle is real.
    withBusiness('Sharma Tent House');
    renderShell();
    expect(heading()).toHaveStyle({
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    });
  });
});

// --- Shrink-to-fit behavior ----------------------------------------------------

describe('AppShell title autoshrink', () => {
  let barWidth = 160; // available heading width in the toolbar
  let baseFontPx = 20; // inherited h6 size
  let pxPerCharAtBase = 8; // text advance per character at the base font

  const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const originalScrollWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth');
  const originalGetComputedStyle = window.getComputedStyle;

  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return barWidth;
      },
    });
    Object.defineProperty(Element.prototype, 'scrollWidth', {
      configurable: true,
      get(this: HTMLElement) {
        // Text width scales with the CURRENT font: the hook resets the inline
        // size before measuring, so measurements always use the base.
        const inline = Number.parseFloat(this.style?.fontSize ?? '');
        const scale = Number.isFinite(inline) ? inline / baseFontPx : 1;
        return Math.round((this.textContent ?? '').length * pxPerCharAtBase * scale);
      },
    });
    window.getComputedStyle = (() =>
      ({ fontSize: `${baseFontPx}px` }) as CSSStyleDeclaration) as typeof window.getComputedStyle;
  });

  afterAll(() => {
    if (originalClientWidth) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
    }
    if (originalScrollWidth) {
      Object.defineProperty(Element.prototype, 'scrollWidth', originalScrollWidth);
    }
    window.getComputedStyle = originalGetComputedStyle;
  });

  beforeEach(() => {
    barWidth = 160;
    baseFontPx = 20;
    pxPerCharAtBase = 8;
  });

  it('shrinks an overflowing name proportionally to fit the bar', () => {
    // 25 chars × 8px = 200px needed, 160px available → 20px × 160/200 = 16px.
    withBusiness('Shri Ganesh Tent & Decor.'); // 25 chars
    renderShell();
    const el = heading();
    expect(el.style.fontSize).toBe('16px');
    // The full name still renders — shrink, not truncation.
    expect(el).toHaveTextContent('Shri Ganesh Tent & Decor.');
  });

  it('leaves a fitting name at its inherited size', () => {
    // 10 chars × 8px = 80px ≤ 160px — no inline font override.
    withBusiness('Sharma Co.'); // 10 chars
    renderShell();
    expect(heading().style.fontSize).toBe('');
  });

  it('never shrinks below the 65% floor (ellipsis takes over past it)', () => {
    // 60 chars × 8px = 480px → raw scale 160/480 = 0.33 → clamped to 0.65.
    withBusiness('Maharaja Shaadi Mandap Tent House and Catering Services Pvt.'.slice(0, 60));
    renderShell();
    expect(heading().style.fontSize).toBe(`${20 * MIN_FIT_SCALE}px`);
  });

  it('applies the same shrink to the fallback app name when the bar is tiny', () => {
    // Fallback path goes through the same fitted heading.
    barWidth = 40; // 7 chars × 8px = 56px needed → raw 0.71 scale → 14.28...px
    renderShell(); // no business → app name "Samaroh"
    const expected = 20 * Math.max(40 / (en.common.app_name.length * 8), MIN_FIT_SCALE);
    expect(heading().style.fontSize).toBe(`${expected}px`);
  });
});
