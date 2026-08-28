# Decisions — samaroh-web

Contract clarifications and notable implementation decisions, newest first.
(The product spec stays the source of truth; entries here record how this
repo interprets it where the spec leaves web-specific latitude.)

## 2026-08-28 — Non-translatable catalog entries pass through gen-web

- The shared catalog's entry shape gained an optional `"translatable": false`
  flag for data-like values (URIs, technical identifiers) that live only in the
  canonical `en` catalog (a `hi` entry for one is a validation error; see
  `shared/strings/README.md` and samaroh-android ADR-034). `gen-web.mjs` copies
  the `en` value into **every** locale's messages file, so `useTranslations`
  lookups never miss regardless of locale. No web code changes were needed;
  first entries are `menu.about.donate_upi_uri` and `menu.about.source_code_url`
  (currently Android-consumed — the web About page keeps its own repo URL).

## 2026-08-26 — WW-2: Menu, Reports, PWA/outbox, e2e, Vercel

- **Service worker: hand-rolled, not next-pwa/Workbox.** `next-pwa` is not
  maintained against the App Router and Workbox would add a build-time
  dependency for ~60 lines of logic. `public/sw.js` implements exactly the
  spec's web contract (§1.2): network-first navigations with cache fallback
  (read-only offline cache) and cache-first hashed assets. It never touches
  POST/PATCH traffic or cross-origin (Supabase) calls — queued writes are the
  Dexie outbox's job (`src/lib/outbox/`). Registered in production builds only.
- **Offline writes (web scope).** The §8 outbox semantics are mirrored for the
  mutations a user can meaningfully perform offline: booking create/edit/
  cancel/payment/date-blocks, expense entries/parties, inventory *add*
  transactions. Ops carry client UUIDs (idempotent replay), FIFO order, and a
  `base_updated_at` LWW guard; losers become visible `conflict` entries on
  Settings → Sync status, never silent drops. Online-only by design:
  inventory *remove* (needs a live read of open FIFO lots), member/business
  admin, storage uploads and invoice-number assignment (server-side counter).
  Reads stay online-backed (spec: web offline is *read-only cache + queued
  writes*, not a full local database).
- **Reports interpretation (§4.4).** Date filter = booking overlap with the
  range (start-month attribution for revenue); "profit" is cash-basis
  (payments received minus `paid` ledger entries, `received` entries count as
  income); "collection efficiency" clamps early settlements to 0 days;
  CSV export only on web (PDF export remains Android's share flow; the web
  counterpart is `Download CSV` per the shared catalog).
- **Web Settings scope.** Reminders, backup scheduling and dynamic color are
  Android-platform features (DataStore / WorkManager / Material You A12+) and
  are not shown on web. Google account linking renders as a stub row in the
  "not configured" state until a Google OAuth client is provisioned
  (deployment concern, see README → Deploying).
- **Playwright e2e runs hermetically** against a production build started
  without Supabase env vars (guarded client contract). The authenticated
  booking-calendar spec activates only when `E2E_SUPABASE_URL`,
  `E2E_SUPABASE_ANON_KEY`, `E2E_EMAIL`, `E2E_PASSWORD` are provided. CI keeps
  the e2e job separate from the required quality gate (promote once stable).
- **Email sign-up + first-run business creation (web).** The sign-in page gains
  a sign-up mode (Supabase `signUp`; ≥6-char client check mirrors the GoTrue
  default). With email confirmation enabled the app shows a localized
  confirm-email notice and returns to sign-in; duplicate emails are detected
  via the obfuscated empty-`identities` response. After the first
  authenticated session with no visible business, the same screen collects
  business name/type/address/owner and inserts the `businesses` row
  (`owner_user_id = auth.uid()`, per the 002 RLS insert policy) plus the
  active owner `business_members` row (allowed because `is_owner()` checks
  `businesses.owner_user_id` directly) — no schema/RLS change was needed.
  Suggested business types are localized labels stored as free text
  (`business_type` column contract).
- **Guest mode (web).** "Continue offline" on the sign-in page sets the
  `samaroh_guest` cookie (middleware lets it through route protection) and
  swaps `createClient()` to a Dexie-backed local client implementing the
  PostgREST query subset the app uses — feature screens run unchanged and no
  data leaves the device. A persistent banner (all app screens, incl.
  reports) states the this-device-only scope with a sign-in CTA. The outbox
  never queues or replays against the local client (queued writes belong to a
  signed-in session). A real session supersedes guest mode; local guest data
  stays on-device and is NOT migrated to the account (revisit post-Wave-2 if
  demanded). Strings live in the shared `web-auth` fragment.
- **Personal parties & report totals (web, mirrors Android).** `parties` gains
  `business_related boolean not null default true` (shared migration
  `004_party_business_flag.sql`). The add-party dialog asks
  "Associated with {business}?" as a yes/no pill (default yes); the flag is
  editable from the party ledger header and personal parties carry a
  "Personal" tag on rows. Personal-party ledger entries are excluded from the
  Expense summary and Profit reports in both directions and surface in a new
  "Personal expenses" report (monthly + by-party, date-range filtered, CSV).
  Every tabular money report now ends in a TOTAL row on screen and in the CSV
  (profit: total income/expense/net). CSV exports switched to
  machine-readable cells: plain decimal rupees with two decimals (no ₹, no
  digit grouping) and unambiguous dates (`yyyy-mm` months, `yyyy-mm-dd`
  dates); the on-screen tables keep locale formatting. **Deploy ordering:**
  the server column only exists once the owner applies migration 004
  (`supabase db push`) — apply it BEFORE deploying this app version, since
  the app selects/writes `business_related`. Reads still normalize a
  missing/null value to `true` (pre-flag guest-mode rows).
- **Booking colors (web, shared contract).** `bookings` gains a nullable
  `color text` column (shared migration `005_booking_color.sql`) holding a
  key from the new `shared/booking-colors.json` 16-swatch palette
  (`{ key, hex, on_hex, label_key }`, all pairs WCAG AA). NULL = default
  themed (purple) look. The booking form shows a "Colour" swatch picker
  (Default + 16, localized aria-labels from `booking.color.*`, selected
  ring). Rendering: calendar pills/spanning bars use the palette hex with
  its `on_hex` text; tentative bookings KEEP the outlined-amber treatment
  regardless of color; agenda rows show a color dot and the detail drawer a
  color-name chip. Unknown keys (newer contract than app) degrade to the
  themed default. **Deploy ordering:** apply migration 005 to the live
  Supabase project (`supabase db push`) BEFORE deploying this app version —
  writes include `color` and would fail against the old schema. Reads are
  tolerant either way: booking selects switched to `select('*')` and a
  normalizer maps an absent/missing `color` to null (also covers legacy
  guest-mode Dexie rows).
- **DB-backed event-type presets (web, shared migration 006).** Event types
  become per-business, user-managed rows in the new `event_types` table
  (plain-text `label`, emoji `icon`, optional `color` booking-palette key,
  `sort_order`, soft delete; RLS: members read, `settings.manage_business`
  writes). The booking form's type dropdown reads the LIVE presets (in
  sort_order) plus the free-text "Custom" option; saving SNAPSHOTS the
  preset's label/icon into `bookings.event_type`/`event_icon`, so renaming or
  deleting a preset never rewrites existing bookings. Type-default colour now
  resolves from the business's presets — label match (caseless, and
  underscore/space-insensitive to bridge legacy pre-006 built-in KEYS like
  `room_booking` to seeded labels) → the preset's colour key → palette hex;
  legacy keys with no matching preset keep their static contract default;
  everything else falls back to the themed purple. Seeding: the migration
  backfills existing businesses (English labels); NEW businesses are seeded
  client-side from `shared/event-types.json` at creation, labels resolved in
  the creator's locale — in the sign-up flow (best effort, never blocks
  sign-up) and in the guest bootstrap (Dexie store v2 adds an `event_types`
  table for full guest parity). Management UI: Menu → Settings → Event types
  (owner or `settings.manage_business`) with add/edit (duplicate-name
  validation, emoji input, shared 16-swatch picker where Default = themed),
  soft delete with a bookings-keep-their-snapshot confirmation, and up/down
  reordering (renumbers `sort_order`). **Deploy ordering:** apply migration
  006 (`supabase db push`) BEFORE deploying this app version. Reads are
  tolerant either way: `fetchEventTypes` returns null on failure and the
  booking form/colour chain degrade to the static `event-types.json`
  template; only the manage page and seeding need the table to exist.
- **Events view + day chooser (web, Android parity).** The Booking tab gets a
  month-grid ↔ events-view toggle in the calendar overflow menu (now visible to
  all members; the Block-dates entry inside stays edit-gated). Events view
  replaces the grid + monthly agenda with ONE list of ALL bookings grouped by
  start date, opening anchored on today — scroll up loads the past, scroll down
  the future. Fetching is WINDOWED (`src/lib/booking/agenda.ts`): 50-row pages
  keyed on `start_date` only (works on both PostgREST and the guest Dexie
  client), advancing the cursor to the boundary date inclusively and deduping
  by id so ties across page borders are never lost; a full page of known rows
  turns the cursor strict to guarantee progress. Payments load per page for the
  due/paid chips; a detail-drawer mutation re-reads only the loaded date range
  so the scroll window survives. Rows are background-tinted by the resolved
  booking colour (explicit `bookings.color` → event-type preset default →
  themed primary tint; tentative keeps the distinct amber outline; cancelled
  struck through + dimmed) via the shared `BookingRow`, now also used by the
  monthly agenda and the new day chooser. The chosen view persists per device
  in `localStorage` (`samaroh_booking_view`). Day-tap behaviour changed:
  a date with ANY bookings (even one) opens a chooser dialog listing that
  day's bookings plus a final create-gated "Add new event" row that opens the
  add form prefilled with the date; empty dates still open the form directly
  (routing in `dayTapAction`, §4.1).
- **PDF invoices are emoji-free everywhere (owner decision).** The pdf-lib
  renderer already dropped pictographs from text runs as a font limitation;
  this is now the contract: NO emoji anywhere in the PDF — title, event line,
  names, notes (the shared `invoice/layout-spec.md` is being updated to say
  so; the event icon still renders in the text-receipt variant). `stripEmoji`
  (`src/lib/invoice/pdf.ts`, applied to every drawn run) was widened to also
  drop emoji COMPONENTS that `Extended_Pictographic` alone misses — skin-tone
  modifiers, flag pairs (Regional_Indicator), subdivision-flag tag chars —
  without touching digits, ₹ or Devanagari; the notes-column clamp now
  measures the stripped text it actually draws. Contract test: capture every
  `PDFPage.drawText` run under emoji-laden inputs and assert none contains a
  pictograph (`__tests__/invoice-pdf.test.ts`).
- **Immediate outbox replay on enqueue (web, Android sync-engine parity).**
  Previously a mutation that fell back to the outbox while the browser was
  ONLINE (transient fetch-level failure) sat queued until the next `online`
  event or app load. Now every enqueue through the data layer
  (`insertWithOutbox`/`updateWithOutbox`) schedules a DEBOUNCED (500 ms)
  `replayOutbox` run via `scheduleImmediateReplay` (`src/lib/outbox/outbox.ts`)
  — online only (`navigator.onLine === false` skips; the reconnect listener in
  `OutboxSync` owns that case), guest local client refused, bursts collapse
  into one run, and the existing re-entrancy guard still serialises runs. If
  the network is genuinely down the run stops on the first network error and
  items stay queued (no retry storm — the trigger fires per enqueue, not on a
  timer loop).
