# Samaroh Web

The companion web app for **Samaroh** (समारोह) — business management for small venue
businesses (marriage halls, banquet halls, community halls, guest houses). It shares one
Supabase project with the Android app, so data is live-identical across both clients.

## Sections

| Section | Status |
|---|---|
| 📅 Booking — calendar-first booking management | placeholder (WW-1a) |
| 📒 Expenses — party ledger | placeholder (WW-1b) |
| 📦 Inventory — stock items & transactions | placeholder (WW-1b) |
| ☰ Menu — settings, reports, members, about | placeholder (WW-2) |

## Tech

Next.js 15 (App Router) · TypeScript (strict) · MUI v6 (Material-You-like theme,
light/dark/system) · next-intl (en + hi, generated from the shared string catalog) ·
Supabase (Postgres + Auth + Storage, RLS) · Jest + React Testing Library.

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
npm test             # unit tests (catalog parity, shell render in en + hi)
npm run build        # production build
npm run legal-check  # legal-hygiene denylist scan
```

See [AGENTS.md](./AGENTS.md) for contribution rules (i18n, legal hygiene, submodule
procedure, ownership map).

## i18n

Every user-visible string comes from `shared/strings/catalog.{en,hi}.json` via
next-intl. Locale routing is `/{en|hi}/…` with cookie persistence and a switcher in the
app bar. New strings are added in the `samaroh-shared` repo only.
