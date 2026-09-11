# Decisions — samaroh-web

Contract clarifications and notable implementation decisions, newest first.
(The product spec stays the source of truth; entries here record how this
repo interprets it where the spec leaves web-specific latitude.)

## 2026-09-11 — Checklist rows: pointer-events drag replaces HTML5 dnd; items non-editable

- **HTML5 drag-and-drop replaced with a pointer-events drag on the whole
  row.** The previous editor's HTML5 `draggable` reorder never fires on
  touch browsers (mobile Chrome/Safari generate no `dragstart` from touch
  gestures), so the primary audience couldn't reorder at all. The editor now
  drives `pointerdown/move/up` itself (`ChecklistEditor` +
  `_lib/rowDrag.ts` pure state machine):
  - *touch*: ~400 ms long-press picks the row up; moving beyond an 8 px
    slop before the timer cancels the press, and rows keep
    `touch-action: pan-y`, so normal scrolling works until pickup. After
    pickup a non-passive `touchmove` listener `preventDefault()`s so the
    browser never starts a scroll pan (which would `pointercancel` the
    drag). The long-press context menu is suppressed while a press is live.
  - *mouse/pen*: press-and-move picks up without delay (≥3 px, no hold).
  - *visuals*: the lifted row gets shadow + `scale(1.02)` and follows the
    pointer via `translateY`; neighbors slide out of the way with 150 ms
    transform transitions; the target slot comes from midpoint crossing
    (`targetIndexFor`) and commits on release via `moveChecklistItem`.
  The drag-handle icon and `draggable` attributes are gone — the whole row
  is the handle. Verified for real in Playwright with BOTH input modes:
  mouse press-and-move, and CDP `Input.dispatchTouchEvent` long-press drag
  at a mobile viewport (`e2e/notes-checklist-drag.spec.ts`) — the exact
  case HTML5 dnd failed — plus a quick-swipe negative (no reorder).
- **Checklist items are non-editable once added (owner simplification).**
  Rows are checkbox + plain text + a small remove cross; the single
  "Add item" field at the bottom appends on Enter and keeps focus for the
  next item. To change an item's text: remove and re-add. No new strings —
  the existing `notes.editor.checklist_add` / `checklist_remove` keys cover
  the editor.

## 2026-09-11 — Top bar drops the language switcher; note popup pin-in-create + drag reorder

- **Language switcher removed from the app-bar (Android parity).** The
  Settings section owns language selection: full-screen picker at
  Menu → Settings → Language (each language in its own script), reachable
  from the settings row AND menu search (`language` entry with
  `name_en`/`name_hi` keywords). The redundant top-bar `<Select>`
  (`LocaleSwitcher`) is deleted; the freed toolbar width goes to the
  business-name title, which keeps its shrink-to-fit + ellipsis behavior
  unchanged (`useFitText` measures whatever width the flex row grants).
  The `common.language.*` catalog keys stay (shared contract; Android may
  still use them).
- **Note popup: pin available while creating/editing (ADR-077 parity).**
  The pin toggle in the popup header now also renders in edit/create mode,
  buffered into the save payload (`NoteInput.pinned`) rather than persisted
  immediately; view mode keeps the immediate `onTogglePin`. Re-entering
  edit resyncs the buffer from the note.
- **Checklist drag reorder (edit mode).** Plain HTML5 drag-and-drop on the
  editor's checklist rows (drag-handle affordance, state-carried source
  index, `moveChecklistItem` pure helper) — no library, no new strings; the
  handle icon is decorative (`aria-hidden`) since the drop targets are the
  rows themselves. Keyboard reordering is deliberately out of scope for
  now (Android exposes move-up buttons; web parity for a keyboard path can
  follow if requested).

## 2026-09-11 — Settings permission parity: read-only business profile, discard confirm

- **Business profile is visible to every member, editable only with the
  gate.** Owner / `settings.manage_business` keep the editor form; everyone
  else now gets a READ-ONLY display card (same fields as plain text, no save
  button, no logo-edit hint — write affordances hidden, not disabled,
  matching the Android read-only variant). Previously the card was hidden
  outright for non-editors. The menu-search `business` entry is therefore
  ungated again; the `event_types` entry keeps the manage gate.
- **Event-types direct URL shows the no-access state.** Without the manage
  gate the screen used to render a blank page (`null`); it now renders the
  same localized `common.permission.no_access_*` state as `SectionGuard`.
  The settings row stays hidden; RLS remains the enforcement.
- **Outbox discard requires confirmation.** An RLS-rejected (`error`) or
  LWW-lost (`conflict`) queued change exists only on this device, so the
  sync-status Discard button now opens a localized confirmation dialog
  (new `settings.sync.discard_confirm_{title,message}` keys in the shared
  `web-menu` fragment) before dropping the item.

## 2026-09-10 — NOTES section (Keep-style parity) + marker conflict fix

- **Conflict warning counts booking-kind only** (cross-platform parity).
  `findConflicts` takes an optional `isMarkerType(eventType)` predicate;
  the booking screen passes `presetKindForType(presets, …) === 'marker'` on
  the create/edit overlap check AND the restore-path recheck, so marker-kind
  bookings (Lagan/Tilak day indicators — calendar highlights, not hall
  occupancy) never inflate the non-blocking warning count. Without the
  predicate the function keeps its legacy count-everything behavior.
- **Notes module (shared migration 005).** 5th nav entry (`/notes`, label
  from `notes.nav.tab`), gated on the new `notes` permission module
  (view/create/edit/delete — no amounts, so no `view_amounts` key; presets:
  Viewer=view, Staff=+create, Manager=all). Route guarded by
  `SectionGuard module="notes"`; the permission editor renders the notes
  group's labels from the notes fragment (`notes.permission.*`) because its
  `action_delete` means "Delete forever" (Trash purge), not tombstone-delete.
- **Purge = tombstone.** "Delete forever" and the load-time 30-day trash
  sweep set `deleted_at` (sync tombstone, per the 005 header) rather than
  hard-DELETE; both are client-gated on `notes.delete` (RLS-wise they are
  UPDATEs under `notes.edit` — same convention as bookings). The sweep runs
  best-effort on Notes load only for members holding `notes.delete`.
- **Composite-PK outbox support.** `note_tag_links` has no `id` column
  (PK note_id+tag_id, matching the server): the outbox layer gained an
  optional `match` locator (per-column `.eq` filters) for updates and an
  `entityId` override for inserts; replay idempotency rides on the natural
  key's 23505. The guest Dexie store (v3 schema bump adds notes/note_tags/
  note_tag_links) keys that one table by the compound `[note_id+tag_id]`,
  and the local client resolves duplicates/deletes through the same map.
  Untag tombstones the link row; retag clears `deleted_at` on the SAME row.
- **Checklists are one jsonb blob per note** ({id,text,done} array, LWW as a
  unit — 005's documented model); inline card toggles and the popup editor
  both write through `updateNote`. Share uses the Web Share API with a
  clipboard fallback (`notes.action.share_copied` snackbar).

## 2026-08-28 — Amounts visibility (`view_amounts`) masking

- **Schema exception (shared contract).** The per-module `view_amounts` keys
  (booking/expenses/inventory/reports) default to TRUE when absent —
  `normalizePermissions` masks only on explicit `false`; every other action
  stays explicit-true-only. Viewer/Staff/Manager presets leave it true.
- **Masking, not hiding.** Amounts render as the symbol-only mask ₹••• via
  the shared `MaskedAmount` component (screen-reader label
  `auth.permissions.amount_hidden_a11y`, no visible localized string).
  `maskAmount()` covers interpolation sites (chips, snackbars, message
  templates). Surfaces: booking summary card / detail / payment history,
  expenses totals + balances + entry amounts, inventory values + unit prices
  (quantities stay visible). Amount ENTRY forms are not masked — typing an
  amount requires seeing what you type.
- **Beyond the enumerated surfaces (leak-closure).** The agenda/day-chooser
  booking rows' due chip and the WhatsApp reminder's due figure use the same
  mask — leaving them visible would defeat the booking masking entirely. The
  invoice buttons are hidden without `booking.view_amounts` (an invoice IS
  amounts).
- **Reports.** With `reports.view_amounts=false` the reports home lists only
  the amount-free reports (occupancy, collection); direct URLs to money
  reports render the existing localized denied state (`isMoneyReport` in
  `src/lib/reports/types.ts`). As with all permission UI, RLS stays the real
  boundary — masking is UX parity, never security.

## 2026-08-28 — Permission UI sweep: nav visibility, route guards, write gates

- **Nav visibility (§3, Android parity).** Modules without `<module>.view`
  disappear from BOTH the desktop left rail and the mobile bottom nav
  (`AppShell` filters on `useMembership`); Menu is always visible. The locale
  root redirect resolves membership server-side (`resolveLandingHref`) and
  lands on the first visible section in nav order, `/menu` when none.
- **Route guards, not middleware.** Direct-URL access to a viewless section
  renders the localized no-access state (`SectionGuard`, new shared
  `common.permission.no_access_*` keys in the `web-perms` fragment) instead
  of the screen. Guarding stays client-side because permissions live behind
  the same guarded client the screens use (guest mode included); RLS remains
  the real enforcement — the guard is UX parity, never security.
- **Fail-open chrome.** Every degraded mode (Supabase unconfigured, guest
  mode, no session, no business, membership loading) shows the full nav and
  passes guards: the hermetic build/e2e contract requires the app to work
  without Supabase, guests are owners of their local business, and the
  screens already render their own empty states.
- **Write affordances are hidden, not disabled** (matching the Android app
  and the existing masterlist/booking gates): expenses gave/got entry bar
  (`create`), ledger-row edit → plain rows (`edit`), entry delete
  (`delete`), add/edit party + business-related pill (`manage_parties`),
  inventory record-transaction FAB (`create`). The business-related pill is
  the one deliberate "disabled" exception: it doubles as a status display,
  so it stays visible read-only.

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

- **Join step on sign-in (invite acceptance).** `continueAfterAuth` previously
  routed on mere BUSINESS visibility (`businesses` select): a user with no
  visible business always fell through to create-business, so an invited user
  could never join — and once the invited-select RLS lands (shared migration
  004), an invited-but-not-active user WOULD see the business row and be routed
  into an app with no usable access. Routing now decides on MEMBERSHIP: active
  membership or owned business → app; pending invitations (`business_members`
  status `invited`, scoped by RLS to the caller) → a join step listing them;
  else create-business. Accepting activates the caller's own row server-side
  (self-activation policy, shared migration 004) and only a confirmed
  activation (or an already-active row — signup auto-activation race) enters
  the app; a refused activation surfaces `onboarding.join.accept_failed`.
  Mirrors the Android flow (samaroh-android ADR-037); reuses the shared
  `onboarding.join.*` keys.

- **Marker-kind event types (event_types.kind, shared contract).** `kind`
  ('booking' | 'marker'; absent → 'booking') carries through the preset model,
  the seed template (server AND guest Dexie via `buildEventTypeSeedRows`), the
  manage page (pill-row selector + list badge) and the static fallbacks. Web
  interpretation of "month cells show only booking-kind colour/icon when both
  kinds share a date": the month grid draws each booking as its own pill, so a
  MARKER booking's pill is suppressed when EVERY date of its span also has a
  live booking-kind booking (`visibleCalendarBookings`,
  `src/lib/booking/calendar.ts`); partially covered or marker-only spans keep
  their pill, and the day dialog always lists everything. Analytics: the
  event-type breakdown excludes marker-kind bookings from counts and revenue
  (`eventTypeBreakdown(bookings, isMarker)`) with the
  `reports.event_types.marker_note` footnote when any were excluded. Kind
  resolution for stored snapshots: live preset label match → static contract
  key (legacy pre-006 bookings) → 'booking'.

- **Marker bookings carry no payment status (parity with Android).** A
  marker-kind booking shows no total/deposit/paid/due, no payment history and
  no record-payment/invoice actions on the detail drawer; agenda/month rows
  show no due or fully-paid chip; the month summary's Received/Pending
  exclude them by KIND (`monthMoneySummary`, `src/lib/booking/due.ts`) — not
  by amount, so legacy nonzero snapshots stay excluded. The booking form
  hides the amount fields (total/deposit/advance + due preview) while a
  marker-kind preset is selected (typed values persist in state and reappear
  on switching back) and FORCES total/deposit/advance to 0 on save, add and
  edit alike. Money reports need no marker filter beyond the event-type
  breakdown: with amounts forced to 0 and payment recording blocked, markers
  contribute nothing to revenue/dues/collection (unit-verified); occupancy
  and the sources breakdown intentionally keep them (matches the recorded
  Android analytics scope above).

- **Membership resolution hardening (owner report: "no member management").**
  The Members entry was always routed (`/menu/members`) and linked from Menu
  home — but the `isOwner` gate in `useMembership` (a) validated the session
  against the auth server (`auth.getUser()`) on every mount, so a flaky
  network silently hid owner-only UI, and (b) gated on `businesses[0]` (oldest
  created), the wrong business for a user who is also a member of someone
  else's. Now: local-session-first (`auth.getSession()`, no network;
  `getUser()` stays as the guest-local-client fallback — RLS enforces the real
  boundary) and owned-business preference (`find(owner_user_id === uid)` before
  `[0]`), mirrored in the server-side `resolveLandingHref`.

- **Attachment viewing opens Google Drive directly; guest chips are always
  pending.** Ledger attachment chips with a `drive_file_id` are plain links to
  `https://drive.google.com/file/d/{id}/view` in a new tab (`rel="noopener"`,
  tooltip says it opens in Drive) — no proxy/preview layer, because Drive is
  the authoritative file store (schema §expense_attachments) and the user's
  browser is signed into the owning Google account, which is what authorizes
  the view. Pending chips (`drive_file_id` null) render disabled with a
  localized "not uploaded yet" tooltip. Guest mode falls into the pending path
  by construction: the Dexie store keeps attachment METADATA only (no blobs,
  see `localDb.ts` / `insertAttachments`), so there is never a local object
  URL to show and we deliberately do not build blob storage for it.

- **Cancelled bookings: Restore + permanent Delete replace the dead-end.**
  Previously a cancelled booking's detail drawer offered no way forward (Cancel
  hidden, nothing in its place) while still exposing invoice generation. Now the
  drawer swaps the action set: **Restore booking** (gated on `booking.edit`)
  transitions the status back to **Confirmed** — the pre-cancellation status is
  not stored anywhere (schema freeze: no prior-status column, and adding one is
  a contract change), so Confirmed is the deterministic target; no Android
  decision to the contrary was published in shared/docs at implementation time.
  Restoring checks overlaps afterwards and shows a **non-blocking** snackbar
  warning when the dates meanwhile gained other active bookings (same
  halls-can-host-multiple-events stance as the form's conflict popup); a failed
  overlap check (offline) degrades to the plain "restored" message. **Delete
  permanently** (gated on `booking.delete`) applies the shared soft-delete
  tombstone (`deleted_at`, via the outbox-aware layer — never a hard delete)
  behind a localized confirmation dialog; every read filters
  `deleted_at IS NULL`, so the booking and its payment history leave all views.
  Payment-recording and invoice actions are hidden on cancelled bookings
  (invoice previously leaked through) — an invoice is a live financial
  document (Android parity). New keys live in the `web-booking` shared
  fragment (`booking.card.action_restore_booking`, `restored`,
  `restore_conflict_warning`, `action_delete_booking`, `delete_confirm_*`,
  `deleted`).

- **Inventory units come from the shared catalog (`shared/units.json`).** The
  hardcoded four-entry list in `_lib/units.ts` is replaced by a binding to the
  canonical grouped catalog introduced by the Android track (same
  single-source-of-truth pattern as `shared/event-types.json`): 20 wire values
  across Count/Weight/Liquid/Distance groups plus the special free-text Custom
  entry. Wire values are the exact strings stored in `master_items.unit`; the
  original values (`pcs`, `qty`, `kg`, `litre`) and free-text custom are frozen
  for compatibility, and any stored string matching no wire value renders
  verbatim as a custom unit. The master-item dialog dropdown renders groups in
  file order with localized `ListSubheader` headers and Custom last; all unit
  display surfaces (master list, stock list, item detail, transaction dialog)
  resolve wires through the catalog's `label_key`s (`inventory.masterlist.*`,
  en + hi). Parity with the shared file is enforced by
  `__tests__/inventory-units.test.tsx` (web counterpart of Android's
  UnitCatalogParityTest): group/unit order, unique wires, frozen legacy values,
  and label-key resolution in both generated locale catalogs.

- **Item photos render from Google Drive; web photo upload is disabled**
  (2026-09-07, counterpart of Android ADR-063). The owner deleted the Supabase
  `inventory-images` Storage bucket — Storage serving and upload are dead. Item
  photos live in the owner's Drive with anyone-with-link sharing (the Android
  repair pass is enabling the existing 33), and `master_items.drive_image_id`
  is the **authoritative** cross-device photo reference (`image_path` was
  later dropped from the server schema entirely — see the 2026-09-08 entry).
  - **Rendering** (`src/lib/images/drive.ts` + the shared
    `ItemPhotoAvatar` used by the stock list, item detail and master list):
    thumbnails load from `https://drive.google.com/thumbnail?id={id}&sz=w320`.
    Endpoint verified against a real anyone-with-link file: it 303-redirects
    to `https://lh3.googleusercontent.com/d/{id}=w320` and serves image bytes
    with no cookies, so it renders in a plain `<img>`; a NOT-link-shared file
    redirects to a Google sign-in HTML page instead (the `<img>` errors). The
    lh3 URL is kept as a one-step `onError` fallback (same backend, but the
    direct host is known to rate-limit independently); a second error — or a
    row without `drive_image_id` — lands on the existing icon placeholder.
    This mirrors Android's own-token → public-link → placeholder ladder for
    the anonymous-web case. Full view initially opened
    `https://drive.google.com/file/d/{id}/view` in a new tab — superseded by
    the in-app lightbox (owner feedback, see the 2026-09-08 lightbox entry
    below); the Drive view page survives as the lightbox's full-res link and
    error fallback. The frozen `get_current_inventory` RPC does
    not return `drive_image_id`, so the stock query merges it from
    `master_items` client-side rather than touching the shared schema.
  - **Upload disabled**: Storage upload is gone and web has no Drive OAuth,
    so the master-item dialog's photo picker is removed and replaced by the
    current photo (from Drive) plus a localized hint
    (`inventory.master.photo_mobile_hint`, "Add photos from the mobile
    app") — honest UX instead of a broken picker. `createMasterItem` /
    `updateMasterItem` no longer take or touch photo columns (Android owns
    `drive_image_id`; a web edit must never clobber it). The
    photo section stays mounted as the insertion point for a future
    **server-side** upload flow (an API route holding Drive credentials).
    (`src/lib/images/compress.ts` was initially kept as that flow's client
    half, then deleted — see the 2026-09-08 entry.)

- **Image-architecture convergence: `image_path` off the schema, dead
  compress module deleted** (2026-09-08, counterpart of Android ADR-065;
  shared cc89bb2). The Android track dropped `master_items.image_path` from
  the server schema (it survives only as a device-local Room column) and
  reduced Storage to a logos-only baseline (`inventory-images` and
  `booking-invoices` buckets removed from `003_storage.sql`). Web never read
  or wrote `image_path` or those buckets, so this pass only removed the last
  dead artifact and refreshed comments:
  - **`src/lib/images/compress.ts` + `__tests__/image-compress.test.ts`
    deleted.** The module was unused by app code (its test was the sole
    caller) and was "kept as the client half of a future server-side upload
    flow" — but any such flow uploads through an API route that holds Drive
    credentials, and a server can (and should) own compression/cropping to
    enforce the ≤320px-square-WebP convention regardless of client; the
    Android app already defines that convention. Dead code with a live test
    suite costs maintenance for a hypothetical; git history keeps it if the
    flow ever lands.
  - **The one Storage exception stays: business logos.** Web is
    display-only — `fetchLogoPng` (`src/lib/invoice/client.ts`) downloads
    `logos/{businesses.logo_path}` (PNG only) to embed as the invoice PDF
    header; there is no logo upload UI on web (upload is Android-only). The
    guest local client stubs `storage.download` with an error so guest
    invoices render without a logo.

- **Item-photo tap opens an in-app lightbox, not a Drive tab** (2026-09-08,
  owner feedback: tapping an inventory image must render in the app, not
  bounce to drive.google.com). `ItemPhotoAvatar` (stock list, item detail,
  master list — all `expandable`) now opens `ItemPhotoLightbox`: a dark-
  backdrop dialog that loads the photo large via the **same public-endpoint
  ladder** as the thumbnail, just bigger —
  `drive.google.com/thumbnail?id={id}&sz=w1600` → lh3 `=w1600` on `<img>`
  error (`DRIVE_LIGHTBOX_WIDTH` in `src/lib/images/drive.ts`). Spinner while
  the large variant loads; both hosts failing (e.g. not link-shared yet)
  shows a localized message (`inventory.image.load_failed`) with a small
  "Open in Drive" link as the graceful fallback, and a subtle
  `inventory.image.open_in_drive` link stays under the image for
  full-res/download (Drive's viewer serves the original; web has no auth to
  proxy it). Close = button, backdrop click, or Esc. The dialog stops click
  propagation because the avatar sits inside row `ListItemButton`s that
  navigate. **Expense bill chips are intentionally unchanged**: the party
  ledger keeps opening `file/d/{id}/view` in a new tab (see the attachment-
  viewing entry above) — bills are *documents* authorized by the viewer's own
  Google session, not anyone-with-link images, so the public thumbnail
  endpoints the lightbox depends on would 403 there; owner feedback was
  scoped to inventory photos.

- **Expense-attachment picker removed — display + remove only on web**
  (2026-09-08, cleanup wave; the expenses counterpart of the item-photo
  decision above). The entry dialog's Camera/Gallery/PDF pills only ever
  inserted METADATA rows (`drive_file_id: null`) — web has no Drive upload
  path, so the picked bytes were silently discarded and the chips stayed
  "Upload pending" forever: a data-loss trap worse than honest absence. The
  picker (and the `insertAttachments` metadata insert in `_lib/queries.ts`)
  is deleted and replaced by the localized hint
  `expenses.entry.attachments_mobile_hint` ("Attach bills from the mobile
  app"). Existing attachments still render as chips — pending badge for rows
  the Android app has not uploaded yet — and can still be removed (a
  legitimate metadata tombstone). The future fix stays the reserved
  server-side Drive upload route (an API route holding Drive credentials),
  same as item photos.

- **Sign-out wipes the Dexie outbox** (2026-09-08, web mirror of Android
  ADR-040). Queued writes belong to the session that made them: leaving them
  behind lets a later account (or the same user in a different business) on
  the same browser replay them — RLS rejects cross-business rows, but only
  after producing confusing error entries in Sync status. Both sign-out
  triggers (app-bar icon and the menu identity row's confirmed sign-out) now
  run `clearOutbox()` (outbox + last-sync marker, `src/lib/outbox/outbox.ts`)
  before posting to `/auth/sign-out`. The identity row's confirm dialog
  already warns with the pending count — confirming now means "discard them",
  which the wipe makes true. **Guest-mode local data intentionally
  survives**: the guest contract keeps it on-device for re-entry, and the
  guest client never queues into the outbox anyway.

- **Manual invoice numbers in the booking form** (2026-09-08, parity with
  Android ADR-020 #4). Optional text field: unique per business
  (`invoiceNumberExists` in `src/lib/booking/repo.ts`, tombstoned bookings
  excluded; a duplicate blocks the save with
  `booking.form.invoice_number_duplicate`), frozen read-only once
  `bookings.invoice_number` is set — manually or by the first-invoice
  allocator, which keeps returning an existing number without consuming a
  counter value. Blank leaves `null` so the allocator assigns
  `{prefix}-{YYYY}-{counter}` on first invoice as before. The uniqueness
  check is best-effort like the overlap check (offline it cannot run; the
  invoice flow itself is online-only on web).

- **Booking-form field visibility prefs** (2026-09-08, parity with Android
  ADR-020 #5). Device-local booleans decide whether the booking form shows
  the security deposit (default OFF — Android's opt-in default now applies
  on web too), source chips and event times (both default ON). Stored in
  localStorage (`src/lib/booking/formFieldPrefs.ts`, key names mirror the
  Android DataStore keys), edited from Settings → "Booking form fields"
  (three switches). Hidden fields keep their loaded values on save — editing
  a booking with a deposit while the field is hidden never zeroes it.

- **Tentative bookings render 👤** (2026-09-08, parity with Android ADR-020
  #3). `displayIcon` (`src/lib/booking/displayIcon.ts`) returns 👤 for
  tentative bookings regardless of event type; the booking-title and
  calendar-pill helpers use it, covering agenda rows, day chooser, card and
  detail titles and month-grid pills. Presentation-only: the stored
  `event_icon` is untouched (confirming reverts automatically), and invoice
  PDFs/receipts and WhatsApp messages keep the stored icon — the same scope
  Android applies.

- **Cleanup wave 2026-09-08** (audit-driven; no contract changes).
  - `PlaceholderScreen` (WW-0 scaffold, zero references) and the unused
    `dexie-react-hooks` dependency deleted. `@emotion/cache` stays pinned in
    package.json: it is a direct peer dependency of `@mui/material-nextjs`'
    AppRouterCacheProvider, not an unused dep.
  - The About page reads its source-code URL from the shared catalog
    (`menu.about.source_code_url_web`, non-translatable data key — ADR-034
    pattern) instead of a hardcoded constant; Android's About keeps using
    `menu.about.source_code_url`.
  - "Delete permanently" on cancelled bookings is now an OUTLINED error
    button, matching the ADR-054 addendum spec (was `variant="text"`, a
    cosmetic drift from the Android M3 treatment).
  - Test-layout convention documented in AGENTS.md: component/integration
    suites live in the root `__tests__/`; pure-logic unit tests may colocate
    under `src/**/__tests__/`. Existing files already match — no moves.

- **Business logo on web is read-only** (2026-09-08, owner feedback: the web
  business profile had no image). The Settings → business profile card shows
  the logo fetched from the private `logos` bucket via the same
  `fetchLogoPng` helper the invoice header uses
  (`src/app/[locale]/(app)/menu/_components/BusinessLogoAvatar.tsx`), with a
  business-name-initials placeholder when absent. The web app deliberately
  has **no logo upload path** — capture/crop lives in the Android app and the
  bucket write policy is scoped to it — so the card pairs the preview with
  the localized `settings.business.logo_mobile_hint` ("change it from the
  mobile app", the `inventory.master.photo_mobile_hint` pattern). Guest mode:
  the local client has no storage, so guests always see the placeholder +
  hint.

- **List sorting parity** (2026-09-08, Android-parity feature). The Inventory
  stock list and the Expenses party list get a sort control (`SwapVert` icon
  + menu, `src/components/SortMenuButton.tsx`) with three orders — default
  **last updated** (newest first: a party's most recent entry `created_at`, a
  stock item's last transaction), Name A to Z, Name Z to A. Labels reuse the
  cross-platform `common.sort.*` keys (`open`/`last_updated`/`name_asc`/
  `name_desc`) added to the shared `designsystem` fragment by the Android
  track; the web `ListSortOrder` values are deliberately the key leaf names.
  Interpretations: the choice is a **device-local UI pref** persisted per
  list in localStorage (`samaroh_inventory_stock_sort`,
  `samaroh_expenses_party_sort` — same contract as the booking view toggle),
  never synced; zero-stock items stay grouped dimmed at the END with the
  chosen order applied *within* each group (so "last updated" never lets a
  recently-emptied item jump above in-stock rows); search filtering is
  orthogonal to the sort choice. Undated rows (no entries / never transacted)
  sort last under "last updated", ties fall back to A to Z (`src/lib/listSort.ts`).

- **Inventory transaction edit/delete = full FIFO replay** (2026-09-08,
  Android-parity feature). The item-detail transaction rows get a three-dots
  menu — Edit gated on `inventory.edit`, Delete on `inventory.delete` (§3
  hidden-not-disabled). Because every FIFO-derived column downstream of a
  mutated row becomes stale, an edit/delete **replays the item's whole live
  history chronologically** (`replayFifo` in `src/lib/inventory/fifo.ts`:
  `transaction_date` ascending, id as the deterministic tie-break) and
  rewrites every add lot's `remaining_quantity` plus every remove's derived
  cost-per-unit (`unit_price`), persisting only changed columns through the
  outbox-aware `updateWithOutbox` path — so offline queues and guest Dexie
  work unchanged, and a delete is the usual `deleted_at` tombstone (applied
  AFTER the sibling rewrites, so a mid-way failure leaves the delete
  unapplied rather than the history inconsistent). A mutation whose replay
  would make some historical remove exceed the stock available at its point
  in time is **rejected before anything persists**
  (`HistoricalNegativeStockError` → the localized
  `inventory.item.txn_history_negative`). Editable fields: quantity, unit
  price (adds only — removes derive theirs), notes; dates stay fixed.
  Interpretation: replay reads the item's current live rows at mutation time
  (last-write-wins with concurrent editors, same §8 posture as other web
  writes). Keys live in the web `web-expinv` fragment
  (`inventory.item.txn_*`) — the Android track had not published row-menu
  keys at implementation time; fold into cross-platform keys if/when it does.

- **Item-detail Add/Remove bottom bar** (2026-09-08, expenses-parity layout).
  The header Add/Remove buttons became a fixed bottom bar styled like the
  party ledger's gave/got bar, but in the **inventory palette** —
  Add = `primary` (the section's FAB color), Remove = `secondary` — NOT the
  expenses red/green, which encode money direction, not stock direction. The
  bar is gated on `inventory.create`, matching the stock-list FAB.

- **Responsive section FABs** (2026-09-08). The expenses add-party and
  inventory record-transaction FABs are icon-only (circular) below the
  shell's `md` boundary and extended (icon + text) at `md` and up
  (`src/components/ResponsiveGlassFab.tsx`), keeping the GlassFab glass
  styling and the aria-label in both modes.

- **Report amount autoshrink** (2026-09-08). Report-table number cells that
  would wrap instead shrink their font-size per cell to fit one line
  (`AutoShrinkText` in `menu/_components/`: scrollWidth-vs-clientWidth
  measurement re-run via ResizeObserver, floored at 9px), totals rows
  included. "Number cell" is detected by content — digits/₹/• and **no
  letters in any script** — so month labels, names, the TOTAL label and
  quantity-with-unit cells keep wrapping normally.

- **Marker rows never show a status chip** (2026-09-08, cross-platform parity
  rule). Marker-kind bookings must not show the 'Confirmed' status chip/text
  in the day chooser dialog, the month agenda and the events view rows —
  status is meaningless for a Lagan/Tilak day marker. The web's shared
  `BookingRow` already satisfied this (markers render no right-side chip at
  all since the no-payment-status change); this batch locks the rule in with
  surface-level regression tests (`__tests__/marker-row-status.test.tsx`)
  covering all three surfaces. Cancelled stays the one exception (chip +
  strikethrough). Scope note: the detail drawer's status chip is untouched —
  the rule targets row surfaces only, matching the Android item.

- **Notes feedback batch** (2026-09-10). Four interpretations:
  1. *Compact color picker.* `ColorSwatchPicker` gains a `compact` variant
     (22px dots, selected ring, one horizontally scrollable row) used by the
     note editor and the booking form; the event-type preset dialog keeps
     the standard wrapping grid. The vertical space freed in the note editor
     goes to the body field (minRows 3 → 6).
  2. *Tag type-ahead.* The note editor's tag field no longer lists all tags
     on focus: suggestions appear only while typing (200 ms debounce), with
     a "Create "{name}"" option whenever the typed name isn't an exact
     case-insensitive match; chosen tags are removable chips
     (`notes.picker.tags_create` / `tags_remove`, cross-platform keys).
  3. *Blank checklist items + empty notes (phantom "pills" bug).* Root cause
     of the owner-reported empty outlined pills on the mobile grid: blank
     checklist items in the jsonb render as empty rows, and the create flow
     inserts the row BEFORE the editor opens, so an abandoned create lingers
     as an empty outlined card. Fix: `sanitizeChecklist` drops blank items
     on the read path (`normalizeNote`) and the save path
     (`createNote`/`updateNote`); blank-NAMED tags are dropped on fetch; and
     closing/cancelling/saving a brand-new note with no content discards it
     (tombstone purge — Keep parity). Server-side cleanup of existing bad
     rows is owned by the Android track.
  4. *Tag management.* Manage-tags dialog behind an edit affordance next to
     the drawer's Tags header (gated on `notes.edit`, per the permission
     description "manage tags"): rename with case-insensitive duplicate
     validation; delete behind a confirmation stating the linked-note count.
     Delete = tombstone the tag AND its live links (`deleteTag`); notes stay
     unchanged; a grid scoped to the deleted tag falls back to the main list.
  Also fixed: the mobile notes drawer ignored the fixed app bar (zIndex
  drawer+1 paints over the drawer paper), hiding the top entries — the
  temporary drawer now opens with a `<Toolbar />` spacer, the same
  convention as the shell's permanent rail.
