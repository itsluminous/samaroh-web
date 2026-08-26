import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright e2e (chromium). The suite runs against a PRODUCTION build
 * started WITHOUT Supabase env vars (the app degrades gracefully by
 * contract), so tests are hermetic — no network, no test-data cleanup.
 * A production server is required for the offline smoke test: the service
 * worker (public/sw.js) only registers in production builds.
 *
 * Optional authenticated mode: set E2E_SUPABASE_URL / E2E_SUPABASE_ANON_KEY /
 * E2E_EMAIL / E2E_PASSWORD to also exercise the signed-in booking calendar
 * (see e2e/booking.spec.ts). CI runs the hermetic mode only.
 */
const PORT = 3111;
const supabaseUrl = process.env.E2E_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.E2E_SUPABASE_ANON_KEY ?? '';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/en/sign-in`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      // Empty values override .env.local (process env wins in Next.js), so a
      // developer's local Supabase project never leaks into the e2e run
      // unless explicitly opted in via the E2E_* variables.
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
    },
  },
});
