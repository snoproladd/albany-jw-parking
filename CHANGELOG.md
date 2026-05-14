# Changelog

All notable changes to this project will be documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

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
