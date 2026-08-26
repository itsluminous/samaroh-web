# Samaroh Web

The companion web app for **Samaroh** (समारोह) — business management for small venue
businesses (marriage halls, banquet halls, community halls, guest houses). It shares one
Supabase project with the Android app, so data is live-identical across both clients.

## Sections

| Section | Status |
|---|---|
| 📅 Booking — calendar-first booking management, invoice PDF | ✅ |
| 📒 Expenses — party ledger | ✅ |
| 📦 Inventory — stock items & transactions | ✅ |
| ☰ Menu — settings (language/theme/business/sync), reports (9), members, about | ✅ |

## Tech

Next.js 15 (App Router) · TypeScript (strict) · MUI v6 (Material-You-like theme,
light/dark/system) · next-intl (en + hi, generated from the shared string catalog) ·
Supabase (Postgres + Auth + Storage, RLS) · Dexie (offline outbox) · PWA (hand-rolled
service worker) · Jest + React Testing Library · Playwright (e2e).

## Setup

```bash
git clone <repo-url> && cd samaroh-web
git submodule update --init --recursive   # pulls samaroh-shared into shared/
npm install
cp .env.local.example .env.local          # fill in Supabase URL + anon key (optional for dev)
npm run dev
```

The app builds and runs without Supabase env vars (auth is disabled until they are set).
Database schema and seed data live in `shared/supabase/`.

## Development

```bash
npm run gen:i18n     # regenerate messages/ from shared/strings (auto-runs pre dev/build/test)
npm run lint         # ESLint — react/jsx-no-literals is an error (zero hardcoded strings)
npm run type-check   # tsc --noEmit
npm test             # unit tests (Jest + RTL)
npm run build        # production build
npm run legal-check  # legal-hygiene denylist scan
npx playwright test  # e2e (chromium) — builds and starts its own production server
```

See [AGENTS.md](./AGENTS.md) for contribution rules (i18n, legal hygiene, submodule
procedure, ownership map) and [docs/decisions.md](./docs/decisions.md) for notable
implementation decisions.

### End-to-end tests

`npx playwright test` runs hermetically: the Playwright web server builds and starts the
app **without** Supabase env vars, so no test data or cleanup is involved. Covered: shell
navigation in en + hi, settings/language/sync pages, sign-in form, booking page, and an
offline smoke test that reloads the app from the service-worker cache. To also exercise
the signed-in booking calendar, provide `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`,
`E2E_EMAIL`, `E2E_PASSWORD`. In CI the e2e job is separate from the required quality
gate (see `.github/workflows/ci.yml`).

## PWA & offline

- `public/manifest.webmanifest` + icons generated from `shared/brand/logo.svg`
  (`scripts/gen-icons.sh`, requires librsvg; the PNGs are committed).
- `public/sw.js` — hand-rolled service worker (production only): network-first
  navigations with cache fallback = **read-only offline cache**; cache-first for hashed
  build assets; Supabase calls are never intercepted.
- Writes made while offline are queued in an IndexedDB (Dexie) **outbox**
  (`src/lib/outbox/`) and replayed FIFO on reconnect with last-write-wins conflict
  resolution on `updated_at` (spec §8). Pending items, per-item errors and conflicts are
  visible under **Menu → Settings → Sync status**, with a *Sync now* button.

## i18n

Every user-visible string comes from `shared/strings/catalog.{en,hi}.json` via
next-intl. Locale routing is `/{en|hi}/…` with cookie persistence, a switcher in the
app bar, and a full-screen picker under Menu → Settings → Language (each language shown
in its own script). New strings are added in the `samaroh-shared` repo only.

## Deploying (Vercel)

1. **Import the GitHub repo** into Vercel (framework preset: Next.js; the committed
   `vercel.json` only adds service-worker/manifest headers).
2. **Environment variables** (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL` — the Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the Supabase anon (public) key
   Both are optional at build time by design — a build without them yields the
   signed-out shell — but required for a functional deployment.
3. **Git submodule access** — `shared/` is a git submodule. Vercel clones submodules
   over **HTTPS only**:
   - If `samaroh-shared` is **public**: ensure `.gitmodules` uses the
     `https://github.com/...` URL and it just works.
   - If **private**: Vercel cannot clone it with the default GitHub App token. Either
     make the shared repo public, or add a build-time workaround (e.g. a
     `GITHUB_TOKEN` env var plus an `installCommand` that rewrites the submodule URL:
     `git config submodule.shared.url https://$GITHUB_TOKEN@github.com/<org>/samaroh-shared.git
     && git submodule update --init` before `npm ci`).
   - Note: `.gitmodules` currently points at a **local path** (Wave-0 bootstrap);
     re-point it to the GitHub URL before the first Vercel deploy
     (`git submodule set-url shared <github-url>`).
4. Production deploys happen on merge to `main`; every PR gets a preview URL.
