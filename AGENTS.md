# AGENTS.md — samaroh-web

Instructions for AI agents (and humans) working in this repo. This is the **web app**
(Next.js 15 App Router + TypeScript + MUI v6 + Supabase + next-intl) of the Samaroh
product. The product spec is the single source of truth; contract changes are recorded
in `docs/decisions.md`.

## Hard rules

### 1. i18n — NEVER hardcode a user-visible string
- Every user-visible string comes from the shared catalog
  (`shared/strings/catalog.<locale>.json`) via next-intl.
- To add a string: add the key to **both** locale files in the `samaroh-shared` repo
  (in your feature's namespace, e.g. `booking.*`), commit there, bump the submodule
  here, then run `npm run gen:i18n`.
- Generated `messages/*.json` files are **git-ignored** — never edit or commit them.
- CI enforcement: ESLint `react/jsx-no-literals` is an **error** for `src/**/*.tsx`
  (props are exempt so technical literals like `variant="contained"` work — but
  accessible names such as `aria-label` and Tooltip `title` must still be `t()` values).
- Locale-aware formatting everywhere; Indian digit grouping for ₹ amounts
  (₹1,06,51,161) via the shared amount-formatting conventions — never raw
  `toLocaleString()` calls scattered around.

### 2. Legal hygiene — NEVER name third-party reference products
- Zero references to the third-party products studied as design references — in code,
  comments, strings, docs, README, and **commit messages**.
- Only allowed third-party names: Google (Sign-In/Drive/Calendar), Supabase, WhatsApp
  (as a share target), and OSS library attributions.
- CI runs `scripts/legal-check.sh` (base64-encoded denylist; the script excludes
  itself). Run it locally before every commit: `npm run legal-check`.

### 3. Contract freeze
- The shared repo (`shared/` submodule) — string catalog structure, codegen CLI,
  Supabase schema, permissions schema, event types, brand palette, invoice layout —
  is the frozen Wave-0 contract.
- Additive string keys in your own feature namespace are allowed (documented
  procedure in `shared/strings/README.md`); anything else needs a
  `docs/decisions.md` entry and integrator sign-off.

## Submodule procedure
- `shared/` is a git submodule of the `samaroh-shared` repo.
- Fresh clone: `git submodule update --init --recursive`.
- It is currently registered with a **local path URL**
  (`/Users/kupraki/repo/Samaroh/samaroh-shared`). **TODO: re-point to the GitHub URL**
  (`git submodule set-url shared <github-url>` + commit `.gitmodules`) once the shared
  repo is pushed. Local-path cloning needs `git -c protocol.file.allow=always`.
- To pick up new shared commits: `cd shared && git pull origin main && cd .. &&
  git add shared && git commit` (Conventional Commit, e.g. `chore: bump shared contracts`).

## Commands
| Command | Purpose |
|---|---|
| `npm run gen:i18n` | Generate `messages/{en,hi}.json` from the shared catalog (auto-runs before dev/build/test) |
| `npm run dev` | Dev server |
| `npm run lint` | ESLint (includes the no-literals i18n gate) |
| `npm run type-check` | `tsc --noEmit` (strict) |
| `npm test` | Jest + React Testing Library |
| `npm run build` | Production build — must pass **without** Supabase env vars |
| `npm run legal-check` | Legal-hygiene denylist scan |
| `npx playwright test` | Playwright e2e (chromium) — builds/starts its own prod server WITHOUT Supabase env (hermetic; see playwright.config.ts) |
| `./scripts/gen-icons.sh` | Regenerate PWA icons from `shared/brand/logo.svg` (requires librsvg; PNGs are committed) |

Full local gate (same as CI):
`npm run gen:i18n && npm run lint && npm run type-check && npm test && npm run build && npm run legal-check`

## Supabase env setup
Copy `.env.local.example` → `.env.local` and fill `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` from the Supabase project (schema lives in
`shared/supabase/migrations`). **The app must always build and run without these** —
client creation is guarded (`src/lib/supabase/env.ts` returns null → auth features
degrade gracefully, middleware skips protection). Never remove that guard.

## Architecture map
- `src/i18n/` — next-intl routing (`en`, `hi`; cookie-persisted), request config, navigation helpers.
- `src/middleware.ts` — i18n negotiation + Supabase session refresh + route protection
  (public: `/sign-in`; everything else needs a session when Supabase is configured).
- `src/lib/supabase/` — guarded browser/server client factories.
- `src/theme/theme.ts` — Material-You-like MUI theme from `shared/brand/palette.md`
  (light/dark/system via CSS variables).
- `src/components/AppShell.tsx` — responsive nav: left rail (desktop) / bottom nav (mobile).
- `src/app/[locale]/(app)/{booking,expenses,inventory,menu}/` — the 4 sections.
- `src/app/auth/sign-out/` — non-localized sign-out POST route.

## Ownership map (parallel tracks)
| Track | Scope |
|---|---|
| **WW-0** (done) | This scaffold: app shell, theme, i18n, auth plumbing, CI, tests |
| **WW-1a** | `src/app/[locale]/(app)/booking/` — calendar month grid + invoice PDF (pdf-lib, per `shared/invoice/layout-spec.md`). Owns `booking.*` keys |
| **WW-1b** | `expenses/` + `inventory/` sections. Owns `expenses.*`, `inventory.*` keys |
| **WW-2** (done) | `menu/` (settings incl. language switcher, members, reports), PWA offline outbox (Dexie, `src/lib/outbox/` + `src/lib/permissions/`), Playwright e2e (`e2e/`, CI job), Vercel deploy config. Owns `menu.*`, `settings.*`, `reports.*` keys |

No two concurrent agents edit the same directory. Shared components
(`src/components/`) change via the integrator.

## Offline & PWA (WW-2)
- Mutations must go through the offline-aware data layer
  (`src/lib/outbox/mutate.ts` — `insertWithOutbox`/`updateWithOutbox`): online they
  write straight to Supabase, offline they queue in the Dexie outbox and replay FIFO
  on reconnect with a last-write-wins guard on `updated_at` (spec §8). Creates MUST
  use client-generated UUIDs so replay is idempotent. Never bypass this for the
  booking/expenses/inventory tables.
- The service worker (`public/sw.js`) provides the READ-only offline cache and must
  never intercept non-GET or cross-origin (Supabase) requests. Registered in
  production builds only. Rationale in docs/decisions.md.

## Guest mode ("try without an account")
- Entry: the sign-in page's "continue offline" button sets the `samaroh_guest`
  cookie (`src/lib/guest/guest.ts`) and runs the same create-business form against
  the local store (`src/lib/guest/seed.ts`). The middleware lets guest-cookie
  requests through route protection; a real session supersedes and clears the flag.
- Data layer: `createClient()` (`src/lib/supabase/client.ts`) returns the Dexie-backed
  local client (`src/lib/guest/localClient.ts`) while in guest mode — a PostgREST-subset
  builder over IndexedDB (`src/lib/guest/localDb.ts`), so feature screens work
  unchanged and **no data ever leaves the device**. The auth/sign-up flow must use
  `createRemoteClient()` (never swapped).
- The local client implements only the query surface the app uses (see the header
  comment in `localClient.ts`) — grep call sites before extending it.
- Outbox: the local client is detectable (`isLocalClient`); `mutate.ts` never treats
  it as offline and `replayOutbox` refuses to replay into it (queued items belong to
  a signed-in session and must only land on the server).
- UI: `GuestBanner` (mounted in the `(app)` layout, all screens incl. reports) shows
  a persistent localized this-device-only notice + sign-in CTA. Strings live in the
  shared `web-auth` fragment (`guest.banner.*`).
- Exit: sign-out clears the guest cookie (local data stays in IndexedDB and is
  reused on re-entry); signing in for real also ends guest mode. Guest data is NOT
  migrated to the account (out of scope, see docs/decisions.md).

## Vercel deployment
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (build succeeds
  without them by contract). `vercel.json` only adds SW/manifest headers.
- Vercel clones submodules over HTTPS: `shared/` must point at the public GitHub URL in
  `.gitmodules` (see README → Deploying for the private-repo workaround).

## Conventions
- Conventional Commits, imperative, ≤50-char subject. Commit after every completed
  task. Never force-push. Never push without being asked.
- Run the full local gate before every commit.
- TypeScript strict; no `any` escapes without a comment explaining why.
