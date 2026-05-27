# Changelog

All notable changes to this project will be documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [2.25.0] - 2026-05-27

### Added
- **Dynamic RSVP configuration** — campaign batches now support configurable
  response options instead of the hardcoded yes/no/maybe set.
  - **Response types:** Standard (yes/no/maybe, any subset), Custom (admin-defined
    labels), Poll (question + options).
  - **Free-text "Other"** — any response type can enable an "Other" button that
    reveals a text input; the volunteer's typed answer is stored in
    `invitations.response_other`.
  - **Campaign Center UI** — new response config builder appears below the
    "Response needed" checkbox when creating a campaign. Standard mode shows
    checkboxes to include/exclude yes/no/maybe; Custom and Poll show a textarea
    for options (one per line); Poll adds a question field.
  - **RSVP page** (`/invite/respond/:token`) — buttons rendered dynamically from
    `response_config`. Standard options get their existing icon+color treatment;
    custom/poll options use a generic outlined style. Poll prompt replaces the
    default "Will you be volunteering..." question.
  - **Invitation Tracker** — response column handles custom/poll/other responses.
    "Other" shows a truncated badge with the full text on hover.
  - **`invitation_batches.response_config`** `NVARCHAR(MAX)` — stores JSON config.
    `NULL` = default standard, fully backward-compatible.
  - **`invitations.response_other`** `NVARCHAR(500)` — stores free-text "Other"
    input. `NULL` when not applicable.
- **DB migrations** — `scripts/migrations/` folder established as the canonical
  home for all schema migration scripts. Every migration ships as two paired
  files: `migration_name.sql` (dbo) + `migration_name_demo.sql` (demo).
  `scripts/migrations/README.md` documents the convention and logs all migrations.
  - `addDepartmentId` — adds `department_id INT NULL DEFAULT(1)` to 9 core tables
    and creates a `departments` lookup table. Placeholder for future
    multi-department support. All existing rows and INSERTs unaffected.
  - `addResponseConfig` — adds `response_config` to `invitation_batches` and
    `response_other` to `invitations`.
- **CSP fix** — `db-hierarchy-node` `--depth` CSS custom property moved from
  inline `style=` attribute in `index.ejs` to `data-depth` attribute applied
  via `el.style.setProperty()` in `dashboardShifts.js`.

### Fixed
- `alertScheduler` hoisted to module scope (`let alertScheduler = null`) so
  SIGINT/SIGTERM handlers don't throw `ReferenceError` during rolling App Service
  restarts when the old container receives SIGTERM before `startAlertScheduler()`
  was called. Null guard added to both shutdown handlers.
- `GraphTenantId`, `GraphClientId`, `GraphClientSecret` added to Azure Key Vault
  — eliminates missing-secret startup errors on every container boot.

## [2.24.1] - 2026-05-27

### Fixed
- `alertScheduler` hoisted to module scope with `let alertScheduler = null`
  so SIGINT/SIGTERM handlers no longer throw `ReferenceError` if startup
  fails before `startAlertScheduler()` is called (e.g. during rolling
  App Service restarts triggered by config changes).
- Added null guard (`if (alertScheduler)`) in both shutdown handlers.
- Added `GraphTenantId`, `GraphClientId`, `GraphClientSecret` to Azure
  Key Vault — eliminates missing-secret errors on every startup.

## [2.24.0] - 2026-05-27

### Added
- **Demo environment** — full parallel instance of the app at
  `demo.albanyjwparking.org` sharing the same Azure App Service, codebase,
  and database server, with complete data isolation via a separate SQL schema.
- **`demo` SQL schema** — all 23 production tables mirrored into `demo.*`
  using a dynamic T-SQL script that reads `sys.columns`, `sys.identity_columns`,
  `sys.default_constraints`, and `sys.indexes` to reproduce column types,
  IDENTITY, NOT NULL, DEFAULT constraints, and primary keys exactly.
- **`parking_demo` contained database user** — SQL auth user with
  `DEFAULT_SCHEMA = demo` and `SELECT/INSERT/UPDATE/DELETE` on `schema::demo`.
  No server-level login required (Azure SQL contained user pattern).
- **`AsyncLocalStorage`-based pool routing** (`lib/sql.js`) — `demoStorage`
  ALS instance propagates `{ isDemo: boolean }` through the entire async
  request chain. `getSqlPool()` and `query()` read the store automatically,
  routing all DB calls to the demo pool with zero changes to `dbSync.js` or
  any route handler.
- **`dbo.` → `demo.` SQL rewrite** in `query()` — all explicit `dbo.*`
  references in query strings are rewritten to `demo.*` at runtime when
  `isDemo` is true, handling every `FROM`, `JOIN`, `UPDATE`, `INSERT INTO`,
  and `DELETE` pattern in `dbSync.js` without modifying those queries.
- **`middleware/demoContext.js`** — detects `demo.albanyjwparking.org`
  hostname (configurable via `DEMO_HOSTNAME` env var), stamps `req.isDemo`,
  and wraps the request pipeline in the ALS context. Placed before session
  middleware and all routes so every downstream operation inherits the context.
- **Demo messaging suppression** — `demoStorage` guard added to
  `lib/messaging.js` `sendResetSms()` and `sendResetEmail()`. All Twilio
  and SMTP sends are silently suppressed (logged only) in demo context.
- **`scripts/seedDemo.js`** — full demo data seed script. Connects as
  `parking_demo` and populates all 23 demo tables with:
  - 70 volunteers (real roster structure, anonymized emails, 6 named login
    accounts with working PBKDF2 password hashes)
  - 7 event types, 8 locations/tasks (real MVP Arena / OGS Garage structure
    with addresses and coordinates)
  - 5 convention days, 28 sessions, 51 shifts, 82 schedule assignments
    matching the real scheduling architecture
  - Command hierarchy (5-node tree)
  - 7 congregations, 7 roles, 3 message templates, 1 invitation batch with
    8 invitations
  - Safe to re-run — clears all tables in FK-safe order before inserting
- **`scripts/anonymizeDemo.sql`** — direct SQL `UPDATE` statements replacing
  real volunteer first names, last names, congregation city names, location
  names, addresses, and command hierarchy titles with fictional alternatives
  in the `demo` schema. Safe to re-run.
- **`upgradeInsecureRequests: null`** in Helmet CSP — disables the
  `upgrade-insecure-requests` directive that was forcing HTTPS on all asset
  requests in local HTTP development. No effect in production (Azure terminates
  TLS before Express).
- **New env vars:** `DEMO_DB_USER`, `DEMO_DB_PASSWORD`, `DEMO_HOSTNAME`

### Demo login credentials
| Email | Role | Password |
|---|---|---|
| `admin@demo.com` | ADMIN | `Demo@2026!` |
| `asstadmin@demo.com` | ASSISTANT_ADMIN | `Demo@2026!` |
| `overseer@demo.com` | OVERSEER | `Demo@2026!` |
| `keyman@demo.com` | KEYMAN | `Demo@2026!` |
| `desk@demo.com` | DESK | `Demo@2026!` |
| `volunteer@demo.com` | REGISTERED | `Demo@2026!` |

## [2.23.2] - 2026-05-24

### Changed
- Eliminated all CSP `unsafe-inline` violations across 9 EJS templates
  - Moved 2 inline `<script nonce>` blocks to external JS files:
    `adminCreateVolunteer.js` (new), `adminSendReset.js` (new)
  - Replaced 2 inline `onchange` event handlers with `addEventListener`
    calls in `timelines.js` and `locationsAndTasks.js`
  - Replaced 24 inline `style=` attributes across 7 templates with
    named CSS utility classes in `styles.css`, `attendance.css`,
    and `shiftAlerts.css`
  - Replaced unrenderable `style=` on `<option>` in `oversightTools.ejs`
    with a text-based indent (`&nbsp;&nbsp;↳`)
- Removed phantom direct dependencies `@azure/msal-common` and
  `@azure/msal-node` from `package.json` (neither is imported directly)
- Added `overrides: { "@azure/msal-common": "15.13.3" }` to pin away from
  the broken v15.15.0 npm publish (missing dist `.mjs` files) that caused
  `ERR_MODULE_NOT_FOUND` on startup

  
## [2.23.0] - 2026-05-22

### Fixed
- Added 'DESK' _navRole to oversight dropdown in header to gain access
  to Create Volunteer, Checkin, and Attendance Report

## [2.23.0] - 2026-05-22

### Changed
- Invitation Tracker now collapses to one row per volunteer per campaign
  family. A "family" is a parent batch plus all direct follow-up children.
  The winning row per volunteer is resolved by: responded (non-revoked) first,
  then pending, then revoked, tiebroken by most-recent invitation id. This
  means a follow-up RSVP surfaces correctly when viewing the parent campaign.
- `getInvitationsForTracker` unified into a single family-aware CTE path.
  `family_root_id` (COALESCE(parent_batch_id, batch_id)) is computed and
  returned on every row. Server-side batch/day/response filters removed from
  the tracker page load — all filtering is now client-side so switching
  campaigns requires no page reload.
- Tracker campaign filter resolves child batch selection to the parent family
  root automatically — selecting a follow-up batch shows the merged parent view.
- Campaign center invite-status badges now reflect family-wide RSVP status.
  The `batches/:id/invited` endpoint resolves to the family root before
  querying so a follow-up RSVP correctly badges the volunteer as responded.

### Fixed
- Undeclared `modeFollowupBtn` variable in `campaignCenter.js` caused a
  ReferenceError that crashed the entire DOMContentLoaded handler, silently
  preventing invite-status badges and batch preview from loading when a
  campaign was selected. Fixed by adding the missing `getElementById` declaration.
- Split email/SMS sends that were created as two independent top-level batches
  (Scam Warning batches 7 and 8) caused every volunteer to appear twice in the
  tracker pending count. Fixed in data by setting batch 8 `parent_batch_id = 7`.

## [2.22.0] - 2026-05-22

### Added
- Campaign message types (Invitation, Alert, Follow-up) with logical defaults,
  auto-mode switching, and confirmation modal when defaults are overridden
- {link} merge chip hidden for Alert type
- Message type badge on Invitation Tracker campaign column
- Response required only filter on Invitation Tracker
- Schedulable flag on convention days — unschedulable days hidden from
  Scheduler while remaining available for invitations and timelines
- Report a Bug modal (footer, all authenticated pages, Ctrl+Shift+B)
- Bug Reports admin page (/oversight/tools/bug-reports, ASSISTANT_ADMIN+)
  with inline resolution editing and manual log panel
- bug_reports DB table with full lifecycle tracking

### Fixed
- Reminder send no longer falls through to createInvitation when no
  existing invitation row is found
- Campaign center name filter no longer clears already-selected recipients
- Invitation Tracker pending badge hidden for campaigns with response
  not required
- CSP violations from inline styles on tracker and bug report modal

## [2.21.0] - 2026-05-22

### Added
- Schedulable flag on convention days — unschedulable days (e.g. meeting-only
  days) are hidden from the Scheduler and Scheduler Report day pickers while
  remaining fully available for invitations, timelines, and attendance
- "Meeting only" badge on day cards in Timelines when schedulable is off
- schedulable column added to dbo.convention_days (DEFAULT 1, non-breaking)

## [2.20.0] - 2026-05-22

### Added
- Report a Bug modal available on every authenticated page via footer link (Ctrl+Shift+B shortcut)
- Bug Reports admin page (/oversight/tools/bug-reports, ASSISTANT_ADMIN+) with status filtering and inline resolution editing
- Manual bug log panel on admin page for logging bugs that were caught and fixed without a user submission
- bug_reports DB table tracking full lifecycle: description, steps, page URL, status, solution, files touched, fixed date, resolved by

### Fixed
- Reminder flow: isReminder=true no longer falls through to createInvitation when no existing invitation row is found for a volunteer — skips with a reason instead
- Campaign center: name/search filter no longer clears already-selected recipients from the send list
---
## [2.19.0] — 2026-05-22
### Added
- **JSON-driven sitemap** — new public page at `/sitemap` listing all app pages, filtered server-side to the visitor's current role and permissions. Guests see only public pages; logged-in users see every page their role can reach. No unaccessible paths are sent to the client.
- **`src/config/sitemap.json`** — single source of truth for all page metadata (title, path, description, icon, `minRole`, `permission`). Adding a new page requires only a new JSON entry — no HTML, no route changes.
- **Live search** (`public/js/sitemapSearch.js`) — filters cards and hides empty group sections in real time as you type. Shows a "no results" message when nothing matches.
- **Footer link** — Sitemap added to the footer link row alongside Privacy Policy and Terms of Service.
- **Oversight Tools card** — Sitemap card added at the bottom of the Oversight Tools hub, visible to all KEYMAN+ users.
- **New files:** `src/config/sitemap.json`, `routes/sitemapRoutes.js`, `views/sitemap.ejs`, `public/js/sitemapSearch.js`, `public/styles/sitemap.css`.

---

## [2.18.1] — 2026-05-21
### Fixed
- **SMS check-in: wrong `convention_day_id` written to attendance** — `getVolunteerShiftByCode`
  and `getVolunteerActiveShiftToday` return `convention_day_id` via the sessions chain, which
  can differ from the scheduler assignment day when old test days exist in the DB. Added
  `getSchedulerDayForVolunteerShift()` to `dbSync.js` (queries `shift_slot_assignments`) and
  used it in both SMS handler paths in `index.js` so attendance rows are always written with
  the day the scheduler actually placed the volunteer on.
- **SMS check-in: Twilio inbound webhook never reached server** — the Albany Parking
  Messaging Service in Twilio had its inbound Request URL set to the placeholder
  `https://yourdomain.com/api/sms/webhook`. Number-level webhook settings are overridden
  by the Messaging Service, so all volunteer replies were silently dropped. Updated to the
  correct application URL.
- **SMS check-in: T-15 guard missing from both inbound paths** — `CHECK` and shift-code
  reply handlers in `index.js` now call `hasT15AlertBeenSent()` before writing attendance.
  If no T-15 has been sent for the shift, the volunteer receives a message explaining they
  will be checked in automatically when the T-15 goes out.
- **Scheduler KM/KA pill check-in badge overlapping name** — the `.pill-badge-row` is now
  `position: absolute` inside KM and KA dropzones, floating as a small corner overlay
  instead of pushing the volunteer name out of view in the compact 44×34px slot.
  (`scheduler.css`)

---
## [2.18.0]
### Added
- **`public/js/timeUtils.js`** — new shared ES module centralising all time
  parse/format/input utilities. Exports: `EDT_OFFSET_HOURS` (single tz knob),
  `parseLocalTime`, `formatTimeDisplay`, `fmtTimeInput`, `localToUtc`,
  `utcToLocal`, `utcToEdtCard`, `utcToEdtDisplay`, `bindTimeInput`,
  `validateTimeInput`. Both `timelines.js` and `shiftAlerts.js` now import
  from this module; duplicate implementations removed from both files.
- **Department field on shift form** (`timelines.ejs`, `timelines.js`) — new
  required Department select (Lots & Garages / Signs / Security / Drop-off &
  Pickup / Mobile Support) in the Add/Edit Shift form. `department` is now
  included in the shift create/update payload. This fixes the scheduler
  "no scheduler data for this day" error caused by `getSchedulerData()`
  filtering `WHERE sh.department IS NOT NULL` — all UI-created shifts had
  `NULL` because the form never provided a value.
- **Inline time-input validation** — invalid time fields now highlight red
  (`is-invalid`) with a Bootstrap `invalid-feedback` message on blur, and
  submission is blocked until corrected. `invalid-feedback` divs added to
  all 9 time inputs across `timelines.ejs` and `shiftAlerts.ejs`.

### Changed
- `timelines.js`, `shiftAlerts.js` script tags changed to `type="module"`
  to support ES module imports from `timeUtils.js`.
- `shiftAlerts.js`: `lots_garages` department key corrected to
  `lots_and_garages` to match the scheduler and crew matrix.
- Save handlers across all four Timelines forms (day, copy-day, session,
  shift) now call `validateTimeInput()` instead of `parseTimeInput()`;
  error message updated to "Please correct the highlighted time fields."

---
## [2.17.0] = 2026-05-21
### Added
- Cookie consent banner (viewport-fixed, slide-up/down transition) with
  Accept All, Essential Only, and Manage Preferences options; choice
  persisted in localStorage
- `/privacy` — Privacy Policy page
- `/terms` — Terms of Service page (friendly, volunteer tone)
- Footer links to Privacy Policy and Terms of Service
- Cookie consent styles added to styles.css for global coverage

---

## [2.16.0] — 2026-05-19
### Added
- **Volunteer home page dashboard** — authenticated users now see a personalized
  dashboard instead of the generic landing page.
  - Full-page fixed parking background image with frosted-glass cards.
  - **Greeting pill** — frosted glass card showing a time-aware greeting
    (Good morning / afternoon / evening) and the next upcoming convention day
    in amber text.
  - **Live weather widget** (`public/js/dashboardWeather.js`) — fetches current
    conditions and a 3-day hi/lo forecast for Albany, NY from the Open-Meteo
    API (free, no API key, CORS-enabled). Displays current temp, feels-like,
    wind, and a compact 3-day forecast row with WMO weather-code icons. Sits
    inline with the greeting on desktop, stacks below on mobile.
  - **Your Shifts card** — shows the volunteer's slot assignments for the
    current (or next upcoming) convention day. Each shift shows the shift name,
    time range, location, department pill, and role badge (KM/KA). KM and KA
    contact rows appear below each shift with tap-to-call phone links.
  - **Day navigator** (`public/js/dashboardShifts.js`) — prev/next buttons in
    the Shifts card header let volunteers browse all convention days. Fetches
    via `GET /api/dashboard/shifts?dayId=N` without a page reload. Day label
    updates inline; buttons disable at the first/last day boundary.
  - **Chain of Command card** — read-only indented tree showing the reporting
    hierarchy configured by admins. Phone numbers are tap-to-call links.
- **Chain of Command admin page** — new page at `/oversight/tools/hierarchy`
  (ADMIN only, `manageCampaigns` permission).
  - Visual tree editor: add root nodes, add children, edit role title and
    assigned volunteer inline, delete nodes (children promoted to parent level).
  - Up / Down buttons reorder within siblings; Indent (→) / Outdent (←)
    buttons change the parent relationship.
  - **Save order** bulk-saves all changes via `POST /oversight/tools/hierarchy/save`.
  - New nodes get temporary negative IDs; a sequential add-then-save flow
    resolves real IDs before the bulk update.
  - New files: `views/authentication_and_accounts/commandHierarchy.ejs`,
    `public/js/commandHierarchy.js`, `public/styles/commandHierarchy.css`.
- **New DB table:** `dbo.command_hierarchy` (`id`, `volunteer_id`, `parent_id`,
  `role_title`, `sort_order`) — stores the chain of command tree.
- **New `dbSync.js` functions:** `getVolunteerDashboardDay`, `getVolunteerShiftsForDay`,
  `getCommandHierarchy`, `addHierarchyNode`, `saveHierarchyOrder`, `deleteHierarchyNode`.
- **New API endpoints:**
  - `GET /api/dashboard/shifts?dayId=N` — volunteer's slot assignments for one day
  - `POST /oversight/tools/hierarchy/save` — bulk save hierarchy order
  - `POST /oversight/tools/hierarchy/add` — add a single hierarchy node
  - `DELETE /oversight/tools/hierarchy/:id` — delete a node
- **Chain of Command** added to Oversight Tools hub (Administration section)
  and the Oversight nav dropdown Administration collapse.
- **CSP** updated to allow `https://api.open-meteo.com` in `connect-src`.

### Changed
- **Landing page (logged-out):** Feature tiles are now clickable links.
  Logged-in users redirected to `/my-account`; logged-out users to `/login`.
  Lock badges hidden for logged-in users. Create Profile button hidden when
  already authenticated.
- **Home page route** moved to `index.js` (before the registration router)
  so it can inject dashboard data for authenticated users without touching
  `registrationRoutes.js`.
- **`getVolunteerShiftsForDay`** return now includes `dept_key` alongside
  `dept_name` so the client-side JS can apply department colour pills.

---

## [2.15.0] — 2026-05-19
### Added
- **Volunteer blackout windows** — oversight staff can now define unavailable
  time windows for individual volunteers on a convention day. Blackouts are
  managed via the **Manage Blackouts** option in the scheduler right-click
  context menu on any volunteer pill.
  - New DB table `dbo.volunteer_blackouts` (`volunteer_id`, `convention_day_id`,
    `start_mins`, `end_mins`, `reason`, `created_by`, `created_at`).
  - New `dbSync.js` functions: `getBlackoutsForDay`, `getBlackoutsForVolunteer`,
    `createBlackout`, `deleteBlackout`.
  - New API routes: `GET /api/scheduler/blackouts/:dayId`,
    `POST /api/scheduler/blackouts`, `DELETE /api/scheduler/blackouts/:id`.
  - Blackouts load into the conflict tracker on day change, blocking drops
    into overlapping shift slots.
- **Scheduling conflict modal** — dropping a volunteer into an overlapping
  shift now shows a Bootstrap modal describing the conflict (existing
  assignment or blackout window) with **Place Anyway** / **Return to Pool**
  options. Security department bypasses the modal but still badges silently.
- **Conflict badges on DZ pills** — pills placed with a known conflict display
  a `⚠` warning badge. Conflicts are also listed in the right-click context
  menu under the Remove from Slot action.
- **`getConflicts` + `untrackBlackout` + `getBlackouts`** added to
  `schedulerConflicts.js` to support the above.

### Changed
- **Scheduler name pills** — first names are now abbreviated to an initial on
  DZ slot pills (e.g. `J. Smith`). Volunteers with a suffix always show the
  suffix for disambiguation (`J. Smith Jr.`). Pool pills retain the full name.
- **Oversight nav dropdown** — categories are now collapsible with animated
  chevrons. Dark background styling improved with better contrast on item text
  and icons. Uses `data-bs-auto-close="outside"` so clicking a category
  toggle does not close the dropdown.
- **Oversight Tools page sidebar** — frosted-glass background, branded active
  state, and improved readability against the hero image.

### Fixed
- **Full UI consistency pass** across all oversight tool pages:
  - All pages now share a consistent card-on-image layout.
  - Back button standardised to `← Oversight Tools` with `fa-arrow-left`
    icon, placed in the card header top-right on every tool page.
  - Attendance Check-In and Attendance Report wrapped in outer card.
  - Invitation Tracker wrapped in outer card; stats calculation correctly
    ordered before header render.
  - Campaign Center `mc-main` given explicit `background: var(--bs-body-bg)`
    so the hero image no longer bleeds through between cards.
  - Timelines and Event Types card header converted to flex layout; bottom
    back button removed; `data-authed="true"` added to body tag.
  - Decently Export card header converted to flex layout; bottom back button
    removed.
  - Permission Matrix: `styles.css` added (was missing), duplicate
    `permissionMatrix.css` link removed, back button moved to card header,
    EJS syntax error (`deleteVolunteer` missing trailing comma) fixed.
  - Reports page back button label updated to `← Oversight Tools`.

---

## [2.14.0] — 2026-05-19
### Added
- **Edit Volunteer — RSVP override panel**: A new "Convention Invitations"
  accordion section on the Edit Volunteer page shows all current-year
  invitations for the selected volunteer. Each row has a four-button toggle
  (Yes / No / Maybe / Pending) that saves immediately via AJAX — does not
  go through the Finalize flow. Clicking the active button a second time
  clears the response back to Pending. Revoked invitations are shown
  read-only. Intended for recording verbal RSVPs given directly to oversight
  staff on convention day.
- **New DB function** `setInvitationResponseById(invitationId, response)` —
  updates `response`, `responded_at`, and `last_updated` directly by
  invitation ID. Passing `null` clears the response back to pending.
- **New route** `POST /edit-volunteer/set-rsvp` — requires `editVolunteerInfo`
  permission (OVERSEER+).

---
## [2.13.0] — 2026-05-15
### Added
- **Shift alert scheduler** — `lib/alertScheduler.js` fully wired into `index.js`.
  `startAlertScheduler` called on startup with Twilio credentials and year; `alertScheduler.stop()`
  hooked into `SIGINT`/`SIGTERM` shutdown handlers. Fixed `initTwilio` missing `()` call
  that was preventing Twilio from initializing.
- **Inbound SMS webhook** — extended `/api/sms/webhook` to handle volunteer replies beyond
  STOP/UNSTOP/HELP. Shift code replies (e.g. `FRIN`) confirm the volunteer's RSVP and,
  if the shift is today, mark them as attended. `CHECK` replies mark the volunteer attended
  on their nearest shift today without requiring a code.
- **New `dbSync.js` functions** for inbound SMS handling: `findVolunteerIdByPhone`,
  `getVolunteerShiftByCode`, `getVolunteerActiveShiftToday`, `confirmShiftRsvpBySms`.
- **Timelines — SMS code field** — `sms_code` is now visible and editable in the shift
  edit form. Displayed as a dark monospace badge on the shift card when set.
- **Timelines — Invitable checkbox in shift form** — the Invitable toggle is now a labeled
  checkbox inside the shift edit form, making it discoverable without relying on the
  icon-only card button. `invitable` added to `updateShift` in `dbSync.js` and the
  `PUT /oversight/tools/timelines/shifts/:id` route.

---

## [2.12.0] — 2026-05-15
### Changed
- **Renamed: Messaging Center → Campaign Center**: The tool formerly known as
  Messaging Center is now Campaign Center. Route prefix changed from
  `/oversight/tools/messaging` to `/oversight/tools/campaigns`. Files renamed:
  `campaignCenter.ejs`, `campaignCenter.js`, `campaignCenter.css`.
  Rationale: preserves the "Messaging" namespace for a planned future
  live two-way SMS tool.
- **Campaign Center — send flow**: Removed the initial "Send to N recipients?"
  `confirm()` dialog. The send button already displays the recipient count, making
  the extra prompt redundant. The double-send warning (for volunteers with an
  existing unanswered invite for the same event) is retained.
- **Campaign Center — reminder update prompt**: Replaced the post-send
  "Update campaign message?" `confirm()` dialog with an inline button rendered
  inside the results card. The send flow no longer blocks on a third sequential
  modal dialog after a successful reminder.
- **Campaign Center — original message preview**: Added a "View original message"
  toggle link to the batch preview line in Add to Existing mode. Expands inline
  to show the saved subject and body for the selected campaign without leaving
  the page. Collapses and resets automatically when a different campaign is selected.
- **Campaign Center — Add to Existing auto-select**: Pending volunteers are now
  only auto-selected when the page is opened from the Invitation Tracker reminder
  flow (`?batchId=`). Manually selecting a campaign in Add to Existing mode shows
  invitation-status badges on the volunteer list without auto-selecting anyone.
- **Campaign Center — campaign dropdown hierarchy**: Both the "Add to Existing"
  and "Follow-up to" `<select>` elements now prefix child/follow-up campaigns
  with `↳`, matching the formatting already used in the Invitation Tracker
  campaign filter.
- **Invitation Tracker — pending stat card**: Added `cursor: default` to clarify
  the card is not clickable. Filtering to "pending" is intentionally disabled
  because it breaks the volunteer-deduplication logic that keeps stat card counts
  accurate when a volunteer appears in both a parent and a follow-up campaign row.

---

## [2.11.1] — 2026-05-15
### Fixed
- **Campaign Center — "Response needed" hidden on load**: `mcResponseNeededWrap`
  carried `d-none` in its initial class but `setCampaignMode("new")` was never
  called during init, so the checkbox never appeared in New Campaign mode unless
  the user clicked away to another mode and back.
- **Invitation Tracker — Edit Campaign button broken**: The button was rendered
  with `id="iteditcampaignbtn"` (all lowercase) in the EJS but the JS referenced
  `getElementById("itEditCampaignBtn")` (camelCase), making the entire
  edit-campaign flow silently non-functional.
- **Campaign Center — wrong send hint in Follow-up mode**: The `!hasName` branch
  in `updateSendButton()` fell through to the Add to Existing hint text
  ("Select an existing campaign") when in Follow-up mode. Now shows
  "Select a parent campaign" or "Enter a campaign name" depending on what
  is actually missing.
- **Campaign Center — orphaned JSDoc block**: Removed a stale JSDoc comment
  above `setCampaignMode()` left from before Follow-up mode was added; it
  described only the two-mode `'new' | 'add_to'` signature.

---

## [2.11.0] — 2026-05-13
### Added
- **Schedule Publish** — new Publish button on the schedule report page
  (`schedulerReport.ejs`, `schedulerReport.js`).
  - Generates a PDF of the current report via **Puppeteer** (headless Chrome)
    using an internal secret-protected render route
    (`GET /internal/pdf/report?dayId=N&secret=TOKEN`) that bypasses session
    auth so Puppeteer can load the page without a cookie.
  - Uploads the PDF to **SharePoint / OneDrive** via Microsoft Graph API
    (client-credentials flow, `Files.ReadWrite.All` application permission).
    Always overwrites the same filename so re-publishing keeps one canonical
    copy in the distribution folder.
  - Sends **email + SMS** notifications (via existing Twilio / IONOS
    infrastructure) to all OVERSEER+ volunteers and every volunteer
    scheduled for that day. Scheduled volunteers receive a personalised
    message listing their shift assignments; oversight-only recipients
    receive the link. Lists are merged and deduplicated so no one gets two
    messages.
  - Publish result (SharePoint URL, email count, SMS count) is recorded in
    the new `dbo.schedule_publishes` table.
  - Confirmation modal with spinner, success state (clickable SharePoint
    link + send counts), and error state.
  - Permission: `accessAdminConsole` (ASSISTANT_ADMIN+).
- **New files**:
  - `lib/graphClient.js` — Graph API token cache + OneDrive file upload
  - `lib/publishSchedule.js` — PDF generation, upload, notification, DB
    record orchestration; exports `PDF_SECRET` (startup random)
  - `scripts/azure-app-setup.ps1` — PowerShell script to create the Azure
    App Registration, add `Files.ReadWrite.All` permission, grant admin
    consent, and create a client secret
  - `scripts/append-env-secrets.ps1` — idempotent upsert of Graph secrets
    into the `.env` file
- **New DB table**: `dbo.schedule_publishes` (run migration manually).
- **New DB functions** (`dbSync.js`):
  - `getPublishNotificationData(dayId)` — merged OVERSEER+ + scheduled
    volunteer list with shift assignments for notification personalisation
  - `recordSchedulePublish(data)` — inserts publish audit record
- **New routes** (`oversightRoutes.js`):
  - `GET  /internal/pdf/report` — secret-protected Puppeteer render
  - `POST /oversight/tools/scheduler/publish` — full publish pipeline
- **Config**: `serverPort` and `graphConfig` added to `oversightRouter`
  factory; `index.js` passes `PORT` and Graph secrets from Key Vault.
### Changed
- `package.json` engines lowered from `>=24.0.0` to `>=22.0.0` to match
  the current LTS version in use.
- `.dockerignore` now excludes `scripts/` folder.

---

## [2.10.1] — 2026-05-13
### Fixed
- **Schedule report — blank first print page** (`schedulerReport.css`): the
  `page-break-before` rule used `.report-dept:not(:first-child)`, which
  matched every department because `.report-page-header` is the actual
  first child of `.report-container`. Changed to the adjacent-sibling
  selector `.report-dept + .report-dept` so only the second and later
  departments get a forced page break.
- **Schedule report — print / save PDF button** (`schedulerReport.js`): the
  `onclick` and `onchange` inline handlers on the print button and day
  picker were blocked by CSP. Moved both to `schedulerReport.js` with
  `id="report-print-btn"` and `id="report-day-picker"`.
- **Schedule report — phone numbers**: KM and KA rows now display the
  volunteer’s phone number right-aligned on the same line
  (`schedulerReport.ejs`, `schedulerReport.css`, `dbSync.js`).
- **Scheduler time bands**: all bands showing as one colour because
  gap-detection found no gaps between back-to-back sessions. Now uses
  session label keywords (Pre / Morning / Lunch / Afternoon / Post) for
  colour classification; gap-detection kept as fallback
  (`schedulerDomActions.js`).
- **Scheduler time-band dividers**: midpoint dividers now placed at the
  boundary between contiguous same-class sessions (Morning A→B,
  Afternoon A→B) instead of splitting each session at its midpoint.
- **Context menu contact rows** (`schedulerContextMenu.js`): phone taps
  open the dialer; email taps open the mail client. Contact section only
  renders when the volunteer has at least one of the two.

---

## [2.10.0] — 2026-05-13
### Added
- **Right-click context menu** on all volunteer name pills in the scheduler.
  Context-sensitive: pills in a DZ show **Remove from Slot** at the top;
  both pool and DZ pills show:
  - **View / Edit Volunteer** — opens the oversight profile in a new tab.
  - **Today's Assignments (N)** — floating panel listing every shift the
    volunteer is currently placed in, grouped by department with times.
  - **Highlight on Grid** — pulses a gold outline on all shift blocks the
    volunteer occupies (4 flashes).
  - **Copy Name** — copies the display name to the clipboard.
  - **Manage Blackouts** / **Message Volunteer** — greyed stubs with a
    "soon" badge; architecture ready for both.
- **Pool pills stay in pool permanently.** Dropping a pill into a slot now
  places a lightweight DOM clone in the DZ; the original pool pill remains
  visible and draggable. The same volunteer can be assigned to any number
  of non-overlapping shifts without disappearing from the pool.
- **Time-conflict guard** (`schedulerConflicts.js`) — prevents assigning
  a volunteer to two overlapping shifts. Security department is exempt
  (overlapping coverage shifts by design). The conflict map is also the
  planned extension point for individual blackout windows.
- **Pool pill assignment badge** — an amber **N×** badge appears on a
  pool pill when that volunteer holds N active assignments; disappears
  when all slots are vacated.
- **Drag animation fix** — removing the physical pill-move on drop
  eliminates the visual snap/jump that was visible especially in the
  wide Lots & Garages grid.

### New files
- `public/js/schedulerConflicts.js`
- `public/js/schedulerContextMenu.js`

---

## [2.9.0] — 2026-05-13
### Added
- **Schedule Report** — new printable/downloadable report page at
  `/oversight/tools/scheduler/report?dayId=N`. Accessible via a **Report**
  button in the scheduler day banner (opens in a new tab).
  - One section per department (Lots & Garages, Signs, Security,
    Drop-off/Pickup, Mobile Support), each starting a new print page.
  - Shifts displayed as sub-sections with time range; each location rendered
    as a column card showing KM (blue), KA (teal), and regular volunteers.
  - Day picker in the toolbar lets the user switch days without leaving the
    report. **Print / Save PDF** button opens the browser print dialog.
  - Faithful to the crew-schedule format used in prior-year workbooks.
- **Scheduler: time-band label classification** — session bands are now
  coloured by label keyword ("Pre", "Morning", "Lunch", "Afternoon",
  "Post") rather than gap-detection. Falls back to gap-detection for
  sessions whose labels don’t match any keyword.
- **Scheduler: midpoint dividers** — a dashed line appears between
  contiguous same-class sessions (Morning A → Morning B,
  Afternoon A → Afternoon B) marking the song-and-announcements break.
- **Scheduler: KM/KA role badges** — pills dropped into KM or KA slots
  display a small inline badge (pure CSS `::after`).

### New files
- `public/styles/schedulerReport.css`
- `views/authentication_and_accounts/schedulerReport.ejs`

---

## [2.8.0] — 2026-05-13
### Added
- **Scheduler: live slot persistence** — every drag-drop saves immediately to
  the new `shift_slot_assignments` table. Dropping a pill back to the pool
  deletes the record. Assignments reload automatically when a day is selected,
  pre-populating the grid with any previously saved work.
- **Scheduler: undo / redo** — Undo and Redo buttons appear in the day banner
  (with FontAwesome rotate icons). Ctrl+Z undoes the last assignment or
  unassignment; Ctrl+Y / Ctrl+Shift+Z redoes it. Each undo/redo mirrors the
  DB operation (DELETE or re-INSERT) so the database always reflects the
  current visual state. History clears automatically on day change.
- **Scheduler: occupied-slot guard** — a dropzone that already contains a pill
  now rejects further drops, preventing double-assignments to the same slot.
- **New DB table:** `dbo.shift_slot_assignments` — stores one row per
  volunteer-slot pairing with `schedule_assignment_id`, `convention_day_id`,
  `volunteer_id`, `slot_type` (keyman / keyman_asst / volunteer), and
  `slot_index`. Unique constraint on `(schedule_assignment_id, slot_type,
  slot_index)`. Cascades on `schedule_assignments` delete.
- **New API endpoints:**
  - `GET  /api/scheduler/slots/:dayId` — all saved assignments for a day
  - `POST /api/scheduler/slots` — persist a new slot assignment
  - `DELETE /api/scheduler/slots/:id` — remove a slot assignment
- **New frontend module:** `schedulerHistory.js` — undo/redo command stack,
  API save/delete helpers, and `silentlyPlacePill` for initial grid population.

---

## [2.7.0] — 2026-05-13
### Added
- **Scheduler: multi-location sub-columns** — departments with multiple
  locations (Lots & Garages, Security, Dropoff/Pickup) now render one
  sub-column per location within the department. A spanning dept-name
  header sits above individual location sub-headers. Single-location
  departments (Signs, Mobile Support) are unaffected.
- **Scheduler: department visibility toggles** — the day banner now
  contains a labeled row of colored pill buttons (one per department).
  Click a pill to collapse that department's columns to zero width;
  click again to restore. Hidden departments show a ⦸ indicator so they
  remain discoverable and clickable.
- **Scheduler: column reorder by drag** — drag any department toggle pill
  onto another to swap their column order. Uses pointer events (not the
  HTML5 drag API) to avoid conflicts with agnostic-draggable.
- **Timelines: Min / Target / Max assignment fields** — the schedule
  assignment form now has three numeric inputs (Min, Target, Max) instead
  of a single "Volunteers Needed" field. All three are stored on
  `schedule_assignments.vol_min`, `volunteer_need` (vol_ideal), and
  `vol_max`. Assignment badges in the shift card display as
  `(min / target / max)`.

### Fixed
- Scheduler dropzones no longer resize when a name pill is dropped or
  removed — dropzones now have a fixed 34px height.
- Dropped name pills wrap text over two lines and hide crew badges
  (badges are useful in the pool but noise once assigned).
- Department toggle `is-hidden` class renamed to `dept-hidden` to avoid
  conflict with the global `styles.css` rule `.is-hidden { display: none
  !important }` that was silently nuking the toggle buttons.

---

## [2.6.0] — 2026-05-12
### Added
- **Drag-and-drop Scheduler** — new page at `/oversight/tools/scheduler`
  (OVERSEER+ via `createAssignments` permission). Sidebar shows a live
  volunteer pool filtered by rank and/or department. Selecting a convention
  day loads a time-based calendar grid (15-minute row resolution) organised
  by department columns. Name pills drag from the pool into shift slot
  dropzones; dropping back onto the pool returns them.
- **Drop guards** — role check (keyman/keyman-asst slots enforce minimum
  role level) and department check (volunteers only accepted into departments
  their crew flags permit).
- `agnostic-draggable` UMD bundle added to `public/vendor/` as the drag
  library underpinning the scheduler.
- **New DB columns:** `shifts.department NVARCHAR(50)` (department key for
  grid grouping) and `schedule_assignments.vol_min / vol_max INT` (flanking
  the existing `volunteer_need` as vol_ideal).
- **New API endpoints:**
  - `GET /api/scheduler/volunteers` — active registered volunteer pool
  - `GET /api/scheduler/:dayId` — full shift/dept/location payload shaped
    for the frontend grid builder
- **New frontend modules:** `scheduler.js`, `schedulerDomActions.js`,
  `schedulerDomEvents.js`, `schedulerDraggable.js`, `schedulerTimeUtils.js`,
  `departments.js`, `scheduler.css`
- Scheduler card added to the Oversight Tools hub under Scheduling.

---

## [2.5.3] — 2026-05-11
### Added
- External service watchdog — periodic background checks verify Twilio (every 5 min)
  and SMTP (every 10 min) connectivity. Resets cached clients on failure so the next
  real request triggers a clean re-initialization rather than reusing a broken client.
  Both intervals use `.unref()` to avoid blocking graceful shutdown.
- `resetSmsClient()` exported from `lib/messaging.js` so the watchdog can null the
  cached Twilio SMS client independently of the main `index.js` client.

### Fixed
- `initTwilio()` now throws a descriptive error when `TWILIO_ACCOUNT_SID` or
  `TWILIO_AUTH_TOKEN` are missing, instead of passing `undefined` to the Twilio SDK
  and receiving a cryptic "username is required" failure.
- Root cause of phone verification outage identified — stale container had cached
  empty credentials from before Key Vault secrets were accessible. Restart resolved;
  watchdog prevents silent recurrence.

---

## [2.5.2] — 2026-05-06
### Fixed
- Follow-up campaigns now automatically inherit the parent batch's `convention_day_id`,
  `session_id`, and `shift_id` when no event is selected in the Messaging Center.
  Previously, follow-up invitation rows were stored with NULL event context, causing
  them to be excluded from attendance check-in.
- Retroactive DB patch applied to batch 3 ("Meeting date omission") to inherit
  `convention_day_id = 15` from parent batch 2 ("Training · May 23").
- Attendance check-in deduplication — volunteers invited via multiple campaigns
  to the same shift no longer appear as duplicate rows. `ROW_NUMBER()` CTE picks
  the most relevant invitation (responded first, then most recent) per volunteer.

---

## [2.5.1] — 2026-05-06
### Added
- RSVP history accordion panel on My Account — shows current-year invitations
  with convention day, shift, last date sent, RSVP response, and responded-on date.
  Panel is hidden when no invitations exist. All formatting done server-side.

### Changed
- `package.json` description updated to reflect actual app purpose.

### Removed
- `kickbox`, `jq`, `build`, `docker`, `netstat`, `bind` npm packages — all were
  unused ghost dependencies responsible for the majority of audit vulnerabilities.
- `types/kickbox.d.ts` — no longer needed.

### Fixed
- `npm audit` reduced from 33 vulnerabilities to 2 low-severity (residual `csurf`
  dependency, no fix available without a major refactor).

---

## [2.5.0] — 2026-04
> Details not fully captured. Known to include home page / landing page changes
> and additional feature work. Jake bumped from 2.4.1.

---

## [2.4.1] — 2026-04
### Fixed
- Invitation Tracker 500 error — `canManageCampaigns` missing from route render
  object and incorrect casing in `invitationTracker.ejs`.
- Decently export incorrect filter — removed erroneous `AND accountType = 'registered'`
  from `getDecentlyExportRows()` in `dbSync.js`.

---

## [2.4.0] — 2026-04
> Minor bump applied by Jake to bundle home page integration with prior fixes.
> Superseded the planned 2.2.1 patch release.

---

## [2.2.0] — 2026-04-20
### Added
- **Messaging campaigns** — parent-child batch linking via `parent_batch_id`,
  `response_needed` flag, Follow-up mode in Messaging Center.
- **Invitation Tracker** — admin campaign edit modal, stat cards and Remind button
  recompute live from filtered rows.
- **Permission system** — `manageCampaigns` (ADMIN), `createCampaign` (OVERSEER+),
  `deleteVolunteer` (ASSISTANT_ADMIN+) added to `roles.js`. Grouped Permission
  Matrix UI with human-readable labels.
- **Volunteer soft-delete / reinstatement** — `registration_status = 'deleted'`,
  `deleted_status`, `deleted_at`/`deleted_by` audit columns. Confirmation modal
  and active/inactive/deleted filter controls in volunteer oversight.
- **App versioning** — version injected into all views via `res.locals.appVersion`
  using `createRequire`; displayed in footer.

### Fixed
- Draft promotion bug — `promoteIfComplete()` now called after finalize saves.
- Reports page CSP violation — inline `window.REPORT_DATA` script converted to
  `type="application/json"` data block.

### Changed
- Footer restyled — navy background matching navbar.
- My Account dropdown moved to right-aligned `navbar-nav ms-auto`.

---

## [2.1.0] — 2026-04-16
### Added
- **Messaging Center** — bulk invitation campaigns, batch name auto-suggest,
  template builder with merge fields, double-send warning, results log.
- **Invitation Tracker** — filter by campaign/day/response, inline revoke/reinstate,
  stat cards including revoked count.
- **RSVP page** — event context block (date, time, shift type, location), revoked
  state screen, SMS opt-in consent.
- **Invitable shifts** — per-shift toggle in Timelines (yellow button + badge).
- **Twilio SMS webhook** — handles STOP/UNSTOP/HELP, logs to `sms_opt_out_log`,
  updates volunteer opt-out flags on `volunteer_in`.
- **SMS opt-in** — stamped on RSVP response submission.

---

## [Pre-2.1.0] — 2026-03 to 2026-04
> Versioning was not yet in place. The following work was completed before the
> versioning system was introduced.

### Infrastructure
- Azure SQL connection pool stale-reference fix — `_pool` nulled in error handler,
  keep-alive ping every 3 minutes (self-cancels on pool supersession or failure).
- Docker image migrated to `node:24-bookworm-slim`; CI runner updated to Node 24.
- Azure Key Vault secret loading parallelized — cold start time reduced.
- SSH host key generation switched from RSA 4096 to ed25519.

### Features
- **RBAC system** — role hierarchy, permission matrix (`roles.js`), `requirePermission()`
  middleware, `canAssignRole()` enforcement.
- **Assignment & Role section** — OVERSEER+ can set volunteer role and crew
  assignments (Lots & Garages, Signs, Security, Mobile Support, Dropoff & Pickup).
- **Oversight Tools hub** — rebranded from Admin Tools, grouped by section.
- **Decently Export/Import** — CSV export with export tracking, import with
  active-status sync.
- **Send Links page** — draft/registered tabs, per-channel 24hr cooldown.
- **Create Volunteer** — admin tool with duplicate detection, congregation picker.
- **Locations page** — location management at `/oversight/tools/locationsAndTasks`.
- **Timelines** — convention days, sessions, shifts, schedule assignments, copy day.
- **Attendance** — check-in tool and report page (DB, routes, views, JS all complete).
- **Session keepalive** — `sessionKeepAlive.js` pings `/api/session/touch` on a
  rolling timer for authenticated users.
- **Registration flow** — full draft-based lifecycle, continue-registration,
  account upgrade, `bfcache` guard.
