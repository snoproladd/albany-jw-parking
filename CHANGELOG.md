# Changelog

All notable changes to this project will be documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [2.60.0] — 2026-06-21

### Added
- **Per-shift Keyman / Keyman Assistant slot control** — two new toggles in the Timelines shift form: **Keyman** and **KM Asst**. When enabled, KM and KA drop zones are prepended to the shift block in the Scheduler. Both toggles are hidden for meeting shifts. KA requires KM — disabling Keyman automatically disables and unchecks KM Asst.
- `has_keyman` and `has_keyman_asst` `BIT` columns added to `dbo.shifts` (migration F; `DEFAULT 1` preserves all existing live slot assignments). Both columns flow through `getShifts`, `createShift`, `updateShift`, `getSchedulerData`, and `getSchedulerReportData` in `dbSync.js`, and through the POST and PUT shift handlers in `oversightRoutes.js`.
- **Leadership slots count toward shift total** — KM and KA slots reduce the volunteer slot budget so Min / Target / Max always reflect total headcount including leadership. Example: min=4, target=6, max=8 with both slots enabled → 1 KM + 1 KA + 2 required + 2 ideal + 2 extra volunteer slots.
- Schedule report suppresses KM and KA rows when the respective shift flag is off, even if a legacy DB assignment exists for that slot.

## [2.59.0] — 2026-06-19

### Added
- **Gender filter (All / Male / Female)** on seven pages: Crew Matrix, Scheduler volunteer pool, Volunteer Account Oversight, Attendance Report, Invitation Tracker, Campaign Center, and Volunteer Application Status. Control style matches each page's existing pattern — btn-group where other filters are btn-groups, select dropdown where they are selects.
- **Campaign Center — Role filter** — select (All / Registered / Desk / Keyman / Overseer+) in the volunteer aside to narrow by role before selecting recipients.
- **Campaign Center — Crew filter** — select (All / Lots & Garages / Signs / Security / Dropoff / Mobile Support / Desk) to target a specific department.
- `gender` column added to six `dbSync.js` query functions: `getActiveVolunteers`, `getCrewMatrix`, `getSchedulerVolunteers`, `getShiftAttendanceData`, `getInvitationsForTracker`. `getVolunteersForMessaging` additionally gains `role` and all six crew assignment columns for Campaign Center filtering.

## [2.58.0] — 2026-06-18

### Added
- **Scheduler Categories** — new `dbo.scheduler_categories` table replaces
  `dbo.event_types`. Each category has a stable `dept_key` machine key
  (never changes), an editable display `name`, a `color`, `is_sensitive`
  flag, `active` flag, and `sort_order`. Eight categories seeded:
  Lots & Garages, Signs, Security, Drop-off/Pickup, Mobile Support
  (sensitivity off by default); Information Desk, Count, Support
  (sensitivity on by default).
- **Schedule sensitivity system** — OVERSEER+ can mark any scheduler
  category as "Restricted" via a lock toggle on the Scheduler Categories
  page. Restricted schedules are hidden from volunteers below OVERSEER
  unless explicitly granted access per category. Access grants are managed
  per category via the Users (👥) button that appears when a category is
  sensitive. Grants stored in `dbo.scheduler_category_access`; loaded into
  `req.session.sensitiveCategories` at login (null = OVERSEER+, array of
  permitted category IDs otherwise).
- **`manageScheduleSensitivity` permission** — new permission in `roles.js`,
  true for OVERSEER and above. Gates the sensitivity toggle and access
  management API routes.
- **`public/styles/scheduler-categories.css`** — styles for the Scheduler
  Categories management page volunteer search dropdown and grantee list.
- **New dbSync.js functions:** `getSchedulerCategories`,
  `createSchedulerCategory`, `updateSchedulerCategory`,
  `toggleSchedulerCategorySensitivity`,
  `getSchedulerCategoryAccessForVolunteer`,
  `getVolunteersForSchedulerCategory`, `grantSchedulerCategoryAccess`,
  `revokeSchedulerCategoryAccess`.
- **4 sensitivity API routes** — `PATCH/GET/POST/DELETE
  /api/scheduler-categories/:id/sensitivity` — all `manageScheduleSensitivity`-gated.

### Changed
- **`dbo.shifts`** — `department` (NVARCHAR) and `event_type_id` (INT FK)
  columns dropped; replaced by `category_id INT FK → dbo.scheduler_categories`.
  All existing shift data backfilled from `department` string via `dept_key`
  match before column drop. Zero unmatched rows.
- **`dbo.event_types`** table dropped entirely. All queries updated to
  `LEFT JOIN dbo.scheduler_categories sc ON sc.id = sh.category_id`.
  `event_type_name` / `event_type_color` kept as output aliases in invitation,
  RSVP, and attendance queries for backward compatibility.
- **All hardcoded department maps removed from `dbSync.js`** — `DEPT_NAMES`,
  `DEPT_ORDER`, `SCHEDULER_DEPT_LABEL` objects deleted; ordering now comes
  from `sc.sort_order`, display names from `sc.name`.
- **`generateShiftCode`** — parameter renamed `department` → `deptKey`. The
  suggest-code route now accepts `category_id` (integer) and derives `dept_key`
  from the DB via `MAX(sc.dept_key)` in the count query.
- **Shift create/update routes** — `event_type_id` + `department` body fields
  replaced by `category_id`. Validation: crew shifts require `category_id`;
  meeting shifts (`is_meeting = true`) pass `null`.
- **Scheduler Categories management page** (formerly "Event Types") at
  `/oversight/tools/timelines/event-types` — updated header, table columns
  (Color, Name + dept_key, Order, Status, Visibility), and edit modal
  (removed Description, added Sort Order and Machine Key for new categories
  only). Sensitivity lock toggle (OVERSEER+) and access management modal
  added inline per category row.
- **Timelines shift form** — `<select id="shiftDepartment">` now populated
  dynamically from `schedulerCategories` (value = `sc.id`, category_id
  integer). Shift save sends `category_id` instead of `department`.
- **Shift cards in Timelines** — badge color and label now come from the
  joined category (`shift.category_color`, `shift.category_name`) rather than
  hardcoded EJS maps.
- **`accountRoutes.js` login** — sets `req.session.sensitiveCategories` from
  `getSchedulerCategoryAccessForVolunteer()`; null for OVERSEER+.

### Removed
- `public/js/departments.js` — dead code, never imported anywhere.
- `getEventTypes`, `createEventType`, `updateEventType` from `dbSync.js`.
- `shifts.department`, `shifts.event_type_id` columns from `dbo.shifts`.
- `dbo.event_types` table.

## [2.57.0] — 2026-06-18

### Added
- **Parking Meeting shift type** — new `is_meeting BIT NOT NULL DEFAULT 0` column on
  `dbo.shifts`. Meeting shifts are crew-agnostic: no department, no schedule assignments,
  no scheduler column. The shift creation form now has a **Parking Meeting** toggle in
  place of the Event Type dropdown. Toggling it on hides the department selector and
  routes the SMS code suggestion to the `MT` prefix path (`FRMT1`, `SAMT2`, etc.).
- **Scheduler meeting column** — when a convention day has meeting shifts, a dedicated
  narrow "Meetings" column appears to the left of the crew columns. Meeting shift blocks
  are positioned on the time axis, show the shift name, time range, and SMS code, and
  carry no dropzones (informational only).
- **Meeting T-15 alerts** — meeting shifts now participate in the T-15 rolling alert.
  Recipients are all volunteers with any crew assignment on the day, **minus** those
  whose crew shift window overlaps the meeting window (they are "scheduled elsewhere"
  and receive their normal crew alert). Implemented via `getMeetingT15Candidates(year,
  today)` in `dbSync.js`; `alertScheduler` runs crew and meeting queries in parallel
  and merges before the time-window filter.
- **`dbo.campaign_meetings` table** — standalone meeting events not tied to a Timelines
  session (e.g. pre-event all-hands). Fields: `year`, `label`, `meeting_date`,
  `start_time`, `end_time`, `description`. Foundation for the planned landing-page
  calendar (unioning convention days + standalone meetings + future event types).
- **Campaign meeting CRUD** — four new `dbSync.js` functions
  (`getCampaignMeetings`, `createCampaignMeeting`, `updateCampaignMeeting`,
  `deleteCampaignMeeting`) and four API routes (`GET/POST/PUT/DELETE
  /api/campaign-meetings`), all `manageShifts`-gated.
- **`generateShiftCode` `isMeeting` param** — passing `true` forces the `MT` dept
  code regardless of department value. The `/api/shifts/suggest-code` endpoint
  accepts `is_meeting=true` and counts existing meeting shifts for the day to
  derive the correct sequence number.

### Changed
- **`event_type_id` made nullable** on `dbo.shifts` — preparatory step toward full
  removal. The column and FK to `dbo.event_types` remain; all JOIN paths in
  `getShifts`, `getShiftsForAlertBurst`, and `getT15CandidateShifts` changed from
  INNER to LEFT JOIN. Meeting shifts (`is_meeting = 1`) carry `event_type_id = NULL`.
- **Shift card badges in Timelines** derive color and label from `department` instead
  of `event_type_color`/`event_type_name`. Department color map added to the EJS
  template; meeting shifts show a teal "Meeting" badge.
- **`getSchedulerData`** returns a `meetings: []` array alongside the `department`
  map; the no-data guard now passes for days with only meeting shifts.
- **`getShiftsForAlertBurst`** and **`getT15CandidateShifts`** explicitly filter
  `sh.is_meeting = 0` so meeting shifts are handled exclusively by the meeting alert path.

### Fixed
- **`generateShiftCode` not imported** in `oversightRoutes.js` — every call to
  `GET /api/shifts/suggest-code` threw `ReferenceError: generateShiftCode is not
  defined`, returned a 500, and was silently swallowed by the client `catch {}` block.
  Shift codes never auto-populated in the add-shift form.
- **`dayCode` removed by bad find/replace** during `generateShiftCode` refactor —
  restored the `const dayCode = DAY[d.getUTCDay()] ?? 'XX'` declaration.

## [2.56.3] — 2026-06-17

### Fixed
- **T-15 alert does not re-fire after shift time edit** — the rolling T-15 dupe
  guard in `getT15CandidateShifts` excludes any volunteer+shift pair already in
  `shift_alert_log`, keyed on `shift_id` with no reference to `start_time`. Editing
  a shift's start time left the old log row in place, permanently blocking the alert.
  The shift `PUT` route now calls `clearT15AlertsForShift` after a successful update,
  resetting the dupe guard so the alert can fire at the new time. Burst alert history
  (`schedule_id NOT NULL`) is unaffected.

## [2.56.2] — 2026-06-17
### Fixed
- **`api/shifts/suggest-code` ReferenceError in prod** — `oversightRoutes.js` was missing
  `import sql from "mssql"`. Every other route in the file delegates DB parameter binding
  to functions in `dbSync.js` (where `sql` is imported), but the SMS code suggestion route
  has an inline `exec()` that references `sql.Date` and `sql.NVarChar(50)` directly.
  Added the missing import.

## [2.56.1] — 2026-06-17

### Fixed
- **Shift alert preview time display** — `fmtShiftTime` in `shiftAlerts.js` was splitting
  the ISO epoch-anchored string returned by mssql for SQL `TIME` columns (e.g.
  `"1970-01-01T12:43:00.000Z"`) by `":"`, producing `Number("1970-01-01T12") = NaN`.
  `NaN >= 12` evaluates to `false`, so every shift showed `12:XX AM` regardless of the
  actual hour. The fix detects the `"T"` sentinel and routes through `new Date().getUTCHours()`
  / `getUTCMinutes()` for ISO strings, keeping the plain `HH:MM:SS` path for NVarChar values.

## [2.56.0] — 2026-06-17

### Added
- **Graphical Reports dashboard** — `public/js/reportsCharts.js` (Chart.js 4 ESM) adds five
  chart-driven tabs to the Oversight Reports page, all lazy-loaded on first activation:
  - **Demographics** (Volunteers) — KPI cards + registration-status donut (from embedded
    volunteer data); age-distribution horizontal bar + spiritual-privilege bar (API).
  - **Target Levels** (Volunteers) — grouped bar of slots needed vs assigned per convention
    day; totals row with overall fill rate.
  - **Staff Usage** (Crews) — horizontal grouped bar comparing roster count vs volunteers
    who appeared in a shift, per department.
  - **Crew Attendance** (Event Day) — stacked bar of attended / no-show per convention day.
  - **Day Staffing** (Event Day) — day picker auto-selects today; crew status cards
    (color-coded short / warn / ok / over with large gap number); grouped bar chart with
    dynamically colored Present bars (teal = covered, amber = close, red = short).
- **Five new report API routes** (all `viewAttendance`-gated, OVERSEER+):
  - `GET /api/reports/scheduling-coverage?year=`
  - `GET /api/reports/attendance-overview?year=`
  - `GET /api/reports/demographics?year=`
  - `GET /api/reports/crew-staffing?year=`
  - `GET /api/reports/day-staffing?dayId=`
- **Three new DB functions** in `lib/dbSync.js`:
  - `getVolunteerDemographics(year)` — age, gender, spiritual privileges per active volunteer.
  - `getCrewStaffingSummary(year)` — roster count + scheduled count per department.
  - `getDayStaffingReport(dayId)` — need / scheduled / attended / gap per department for one day.
- **Reports navigation reorganization** — header dropdown and Oversight Tools page now group
  all reports into three named categories: Volunteers, Crews, Event Day; each entry deep-links
  via `?tab=<id>` query param read on load by `reports.js`.
- **Tab bar styling** — `#reportTabs` gets a dark-navy frosted-glass treatment
  (`rgba(10,35,65,0.88)`) to remain legible over the parking-lot photo background;
  active tab is white with primary-blue text; category labels (`report-tab-category`)
  appear as faint uppercase separators between tab groups.
- **Oversight Tools categorization** — Reports section split into Volunteers / Crews /
  Event Day sub-groups with `.tools-sub-heading` labels and individual cards per report.
- **Staffing card styles** in `reportsCharts.css` — `.staffing-card` with four status
  modifiers (`--ok`, `--over`, `--warn`, `--short`), 4px color-coded left border.
- **`.tools-sub-heading`** and **`.ot-nav-group-label`** utility classes in `styles.css`.
- `public/styles/reportsCharts.css` — chart panel layout, KPI cards, loading/error states,
  staffing cards, day picker.

## 2.55.1 — Bug Fixes

### Fixed
- **Shift delete cascade** — deleting a shift now fully removes all child rows in order: `shift_slot_assignments` → `shift_alert_log` → `attendance` → `invitations` → `schedule_assignments` (which cascades `shift_rendezvous_points`) → `shifts`. Previously only `schedule_assignments` was cleaned up first, causing FK constraint errors when a shift had alert log entries.
- **Session delete cascade** — `deleteSession` was previously a bare `DELETE FROM sessions` with no child cleanup, which would fail on any session containing shifts. It now performs the same full cascade through all child tables before removing the session row.
- **Convention day delete cascade** — `deleteConventionDay` now also deletes `invitations` linked to the day before removing shifts and sessions.
- **Timelines delete confirmation text** — all three delete dialogs (day, session, shift) now describe all the data that will be permanently removed.
- **Shift alert "Next Alert" time display** — the "Fires:" line in the preview panel was double-applying the EDT offset (manual subtraction + browser timezone via `toLocaleString` with no `timeZone`), causing the displayed time to be several hours off. Now uses `timeZone: "America/New_York"` directly in `toLocaleString` with no manual offset math.
- **Shift alert fire time AM/PM input** — `localToUtc` in `timeUtils.js` now handles 12-hour AM/PM format ("7:30 PM") in addition to 24-hour ("19:30"), matching the placeholder shown in the fire time input.

## 2.55.0 — Rendezvous Points

### Added
- **Shift rendezvous points** — one optional meeting point per shift + location (schedule assignment), with description, address, GPS coordinates, floor number, and photo.
- **Permission model** — new `editRendezvous` permission: KEYMAN+ can edit fields and upload photos; OVERSEER+ can create and delete records.
- **Rendezvous landing page** (`/oversight/tools/rendezvous`) — day accordion view with event type filter, sorted by convention day. Accessible to KEYMAN+.
- **Scheduler integration** — right-click any shift block header to view/edit/set the rendezvous point. RV data preloads on day change for instant access.
- **Timelines integration** — map-pin button on each assignment badge opens the RV editor panel.
- **T-15 alert integration** — rendezvous details (description, floor, address) are appended to T-15 shift alert SMS messages. A link to a photo detail page is included when a photo exists.
- **Time guard** — editing is warned within 15 minutes of shift start (triggers ad-hoc SMS to assigned volunteers) and locked after 15 minutes into the shift.
- **Public detail page** (`/rv/:id?t=<token>`) — HMAC-gated page showing rendezvous details and photo without login, linked from SMS alerts.
- **Photo storage** — reuses `sign-photos` Azure Blob container with `rv-` prefix. Processed through the same sharp pipeline (resize, JPEG recompress).
- New `shift_rendezvous_points` table with cascade delete from `schedule_assignments`.
- Sitemap entry for Rendezvous Points page.

### Changed
- `getT15CandidateShifts` now LEFT JOINs rendezvous and location data for SMS enrichment.
- Scheduler shift blocks now carry `data-assignment-id` for RV panel integration.
- Day picker options in the scheduler now include `data-date` for convention date access.

## 2.54.0

### Volunteer Schedule Report

- **My Schedule** (`/my-schedule`) — volunteer-facing page (REGISTERED+) shows
  the logged-in user's shift assignments across all convention days. Accessible
  from the My Account dropdown, Resources dropdown, My Account page link, and
  a "Full Schedule" button in the home page Your Shifts card header.
- **Volunteer Schedule** (`/oversight/tools/volunteer-schedule`) — oversight-facing
  page (OVERSEER+) with debounced name search typeahead. Look up any volunteer's
  full schedule. Card added to Oversight Tools page and Operations > Scheduling
  header dropdown.
- Both views share the same EJS template (`volunteerSchedule.ejs`) with a `mode`
  flag, client-side day and crew/department filters, print CSS with per-day page
  breaks, and a Send modal (SMS via Twilio or email via IONOS SMTP).
- New `getVolunteerScheduleReport(volunteerId, year)` in dbSync — two-query
  approach (assignments + KM/KA leaders), results grouped by day.
- API endpoints: `GET /api/volunteers/search?q=` (typeahead),
  `POST /api/volunteer-schedule/:id/send` (SMS/email).
- Sitemap entries for both pages.

### Desk Department

- **New `desk` crew/department** added across the full stack: DB column
  (`crew_desk BIT`), dbSync queries, scheduler, crew matrix, conflict grid,
  timelines, scheduler report, volunteer schedule report, and home page.
- Color: purple `#6610f2` (all CSS files updated with matching stripe, badge,
  toggle, swatch, and filter-button-active rules).
- Migration: `scripts/migrations/addCrewDesk.sql` + `_demo.sql`.

### Scheduler Layout Improvements

- **Minimum column width** (`--sched-col-min: 120px` CSS variable on
  `.scheduler-main`) — prevents location columns from compressing when many
  departments are visible. Grid scrolls horizontally when columns exceed viewport.
- **Frozen time column** — left time labels use `position: sticky; left: 0`
  so they stay visible during horizontal scroll.
- **Right time mirror** — a duplicate time column appears at the right edge
  when horizontal scrolling begins, toggled via scroll listener.
- **Department separation** — stronger 3px centered divider lines between
  department columns (pseudo-element, full-height from dept header through
  data rows), with subtle box-shadow.
- **Dept header color accents** — each department header gets a colored bottom
  border matching its crew color.
- **Fixed-width dropzones** — volunteer slots use `flex: 0 0 calc((100% - 4px) / 3)`
  so exactly 3 fit per row; names truncate with ellipsis.
- **Scroll peek indicators** — floating badges at viewport edges show the name
  of the next off-screen department with directional arrows.

### Files added
- `views/authentication_and_accounts/volunteerSchedule.ejs`
- `public/js/volunteerSchedule.js`
- `public/styles/volunteerSchedule.css`
- `scripts/migrations/addCrewDesk.sql`
- `scripts/migrations/addCrewDesk_demo.sql`

## 2.53.0

### Self-Service Blackout Management (My Account)

- **My Availability accordion** on the My Account page lets volunteers manage
  their own blackout windows — select a convention day, add start/end times
  with an optional reason, and delete entries. No oversight intervention needed.
- Three new API routes scoped to the logged-in volunteer's own data:
  `GET /api/my-account/blackouts`, `POST /api/my-account/blackouts`,
  `DELETE /api/my-account/blackouts/:id` (ownership-enforced).
- New `deleteBlackoutForVolunteer(id, volunteerId)` in dbSync enforces
  ownership via `WHERE id = @id AND volunteer_id = @volunteerId`.
- Accordion body tagged `data-section="blackouts"` to skip the formSummary
  lock loop — blackout CRUD is immediate, not part of the finalize flow.

### Master Conflict Grid (Oversight Report)

- **New report page** at `/oversight/tools/conflict-grid` — volunteers on the
  Y-axis, every shift across all convention days on the X-axis, with cell
  status codes: `X` (assigned), `PC` (personal conflict / blackout overlap),
  `X/PC` (assigned during blackout), `SC` (shift conflict), `SC/PC` (both).
- Shift headers color-coded by department (L&G blue, Signs green, Security red,
  D/P purple, Mobile Support amber) with automatic label disambiguation when
  the same shift name appears for multiple departments on the same day.
- Day columns grouped by convention day with three distinct header colors and
  pastel tints carried through the body cells. Day boundary dividers run the
  full grid height.
- Column hover highlight (translucent blue band), row hover highlight on name
  column, and a live name search input in the sticky corner cell.
- Toggle switches: "Show Personal Conflicts" ↔ "Shift Conflicts Only" and
  "Show All Volunteers" ↔ "Volunteers with Assignments Only" with dynamic
  labels reflecting the current state.
- Card added to Oversight Tools → Reports section (gated on `createAssignments`).
- New `getConflictGridData(year)` in dbSync runs four queries in a single
  `exec()` call: shifts with times as minutes-from-midnight, all active
  volunteers, distinct volunteer→shift assignments, and blackout ranges.

### Files added
- `public/js/myAccountBlackouts.js`
- `public/js/conflictGrid.js`
- `public/styles/conflictGrid.css`
- `views/authentication_and_accounts/conflictGrid.ejs`

## 2.52.0

### Tour System — Universal Button, First-Visit Prompts & DB Persistence

**Universal tour button**
- Moved the tour trigger button from 13 individual page templates into the shared navbar header (`header.ejs`). A single `<li>` with `id="tourTriggerItem"` starts hidden (`d-none`) and is auto-revealed by `tourBase.js` when any tour module loads on the page.
- Removed 14 per-page `#tourTriggerBtn` button instances across 13 EJS templates (timelines had two).
- Button styled for dark navbar: white border at 50% opacity, frosted hover state, high luminance contrast for accessibility.

**First-visit prompt system**
- New `registerTour(tourId, buildFn)` export in `tourBase.js`. Each tour module registers with a stable string key and a builder function.
- On page load, `tourBase.js` fetches the user's dismissal list from `GET /api/tours/status` (cached for the session). If the current page's tour has never been dismissed, a one-step Shepherd prompt highlights the Tour button with four options:
  - **Take the tour** — dismisses the prompt (persisted) and starts the walkthrough
  - **Maybe later** — closes the prompt without persisting (reappears next visit)
  - **Don't show again** — persists dismissal for this tour only
  - **Disable all prompts** — persists `_all` dismissal, suppressing prompts site-wide
- Prompt buttons rendered in a 2×2 CSS grid for clean layout.

**Database persistence**
- New `volunteer_tour_dismissals` table (paired `dbo` and `demo` migrations) with composite PK `(volunteer_id, tour_id)` and FK to `volunteer_in(id)` with `ON DELETE CASCADE`.
- `getTourDismissals(volunteerId)` — returns all dismissed tour IDs for a volunteer.
- `dismissTour(volunteerId, tourId)` — idempotent insert of a dismissal row.
- `GET /api/tours/status` — returns `{ dismissed: [...] }` for the logged-in user; empty array for guests.
- `POST /api/tours/dismiss` — accepts `{ tourId }` with input validation (string, max 50 chars).

**Sitemap integration**
- Added `tourId` field to 16 page entries in `sitemap.json`, linking each page to its tour key for future badge/status display on the sitemap page.

**Tour CSS for Signs pages**
- Added Shepherd CSS and `tours.css` links plus `<script type="module">` tour tags to `signsMap.ejs`, `signsList.ejs`, and `signsBuilder.ejs` (tour JS files to be created in a follow-up).

### Upcoming (queued, not yet applied)
- Updated tour content for schedulerTour, campaignTour, and invitationTrackerTour
- New tour files: signsMapTour.js, signsListTour.js, signsBuilderTour.js
- `registerTour()` calls in all 16 tour modules

## 2.51.0

### Scheduler — Shift Expand, Auto-Routing & Polish

**Shift expand-on-hover**
- Truncated shift blocks (content exceeds grid-row height) show a gradient fade indicator
- Hovering for 750 ms expands the block to reveal all dropzones, floating above adjacent shifts via z-index
- Viewport-aware direction: expands upward when the block is near the bottom of the screen
- Re-validates overflow at hover time — tall blocks with few volunteers never shrink

**Grid lower boundary**
- Calendar grid now extends 90 minutes past the last session end time, giving after-session shifts (egress, signs removal) room to display fully

**Auto-routing drag-and-drop**
- Pills dropped on an occupied slot automatically route to the first empty volunteer slot in the same shift
- Pills dropped on a KM/KA slot the volunteer's role can't fill also redirect to the next volunteer slot
- Shared `_resolveDropTarget()` helper keeps `canDrop` and `onDrop` in sync
- KM/KA slots still fill normally when the slot is empty and the volunteer qualifies

**Blackout badge fix**
- Deleting a blackout now immediately clears the conflict badge from assigned pills — stale `blackoutNote` data and fallback note re-application removed
- No longer requires a page refresh after blackout deletion

**UI polish**
- Crew badges (LGC, SGN, SEC, D/P, MS) use full-saturation colors with white text for better readability at small sizes
- Dropzone slot tiers (required, ideal, extra, KM, KA) use stronger mid-saturation colours for clearer visual differentiation
- Blackout panel: delete button now renders inline with the time range instead of stacking below it

## 2.50.1

### Bug Fix — Time Input Parsing

- **Server-side time normalisation:** added `parseTimeString()` helper in `oversightRoutes.js` that accepts common freeform formats (`7:30 AM`, `14:00`, `2:00 PM`, `08:00:00`) and normalises to `HH:MM` 24-hour
- **Timelines:** applied to all 7 day/session/shift POST and PUT handlers — freeform `type="text"` time values are now normalised before hitting SQL, preventing `Conversion failed when converting date and/or time from character string` errors
- **Shift Alerts:** applied to schedule POST and PUT handlers — validates `fire_time_utc` to prevent silent data corruption when `localToUtc()` receives AM/PM input (previously produced values like `"11:NaN"`)
- Invalid time formats now return a descriptive 400 response instead of a 500 SQL crash

## 2.50.0

### Print Map — Layer Toggles, Facing & Expand

**Layer toggle toolbar**
- Added five layer toggles to the print map toolbar: Arrows, Expand, Facing, Count, Placement ID
- Labels positioned before toggle switches (`form-check-reverse`) for clearer UX
- Each toggle independently controls its layer without affecting others or re-zooming the map

**Four-state placement markers**
- Non-facing compact (Expand OFF): disc with mount icon, count badge, and placement ID badge
- Non-facing expanded (Expand ON): full pill rows with category icons and arrow directions
- Facing collapsed (Facing ON, Expand OFF): radial chevron symbols showing sign bearing directions
- Facing expanded (Facing ON, Expand ON): radial sign pills positioned by bearing, replacing chevrons with actual sign category/direction pills
- Unlinked locations (no arrow links) show a minimal center disc in facing mode

**Traffic arrows on print map**
- Static SVG chevron markers rendered at each traffic arrow position
- `translateY(44px)` anchoring keeps arrow tips at geographic points across zoom levels
- Toggled independently via the Arrows layer switch

**Connector lines (both maps)**
- Polylines drawn from each traffic arrow to its linked sign locations (`#6f42c1`, 35% opacity)
- Print map: drawn once at init, toggled with the Arrows layer
- Main map: drawn at init, toggled with the Arrows layer, rebuilt on arrow link/unlink/drag/delete

**Badge interference fixes**
- Print map: count and placement ID badges auto-hidden when Expand is ON (toggles disabled)
- Main map: removed placement ID badge from `buildMarkerContent` (full/hover view) so it no longer overlaps expanded sign pills during hover; badge remains on compact markers

**Facing radius for print**
- Chevron pill radius reduced from 34px to 20px for tighter print layout
- Expanded radial pills use 30px radius to accommodate pill width

**Route data passed to print**
- `arrows` array now passed from the print route handler to the template and bootstrap JSON
- `attachmentLookup` and `getAttachmentBearingMap` enable facing and connector features

**Template filter fix (EJS)**
- Fixed broken `signs.forEach` loop in print toolbar that had stray legend HTML instead of `<option>` elements

## 2.49.0

### Signs Map — Hover, Layers & Placement IDs

**Hover collapse fix**
- Consolidated three divergent collapse bindings into a single `bindHoverCollapse` helper
- Added map-level `mousemove` safety net that catches stuck-expanded markers when `mouseleave` fails after content swaps
- Fixed re-hover regression where `mouseenter` cancel clobbered the expand timer

**Group-level hover (sign facing)**
- Each facing pill now expands to show only its own group's signs, not the full location
- Center disc hover still shows all signs
- Expanded overlay rows include a leading chevron rotated to the sign's facing bearing

**Facing layout fixes**
- Fixed marker anchor drift: neutralized inherited `translateY(-50%)` with `transform: none`; centering now uses `margin-bottom: -55px` only
- Fixed neighbor occlusion: facing wrapper is `pointer-events: none`; only pills, center disc, and overlay restore `pointer-events: auto`
- Pill radius reduced from 42px to 34px to keep pills inside the 110×110 border-box event-delivery zone
- Added `--facing-zoom-scale` CSS custom property driven by `zoom_changed`; pill offsets scale smoothly so they track a constant ground distance instead of drifting apart when zoomed out
- Removed duplicate `.signs-facing-center` CSS block

**Overlay label z-index**
- Overlay building labels dropped to `zIndex: -100000` so they render behind all sign and arrow markers

**Placement IDs**
- Added `placement_number` (dense rank by `location_id`) computed in the `getSignLocations` query — gapless, shifts on delete, no migration needed
- `P1`, `P2`, … badges on full, compact, and facing markers at 135° (SE) from center
- Sign count badge repositioned to 45° (NE) from center
- Both toggleable via new sidebar layer switches (Sign count, Placement ID)
- Facing mode auto-disables count/placement toggles since badges don't apply

**Misc**
- Added `insertPublishedFile` export to dbSync.js (matched to existing `published_files` table schema)

## 2.48.0 — Map Layer Toggles, Sidebar Restructure & Sign Facing Indicators

### Added
- **Layer toggle system.** New "Filters & Layers" section in the sidebar
  with toggle switches for Traffic Arrows and Sign Facing layers. Layers
  are independently togglable; arrow placement mode auto-enables the
  arrow layer if toggled off.
- **Sign facing indicators.** When the "Sign facing" layer is enabled,
  locations with arrow-linked signs display radial chevron pills showing
  which direction each group of signs faces. Bearing is derived from
  linked traffic arrows (arrow bearing − 180°). Nearby bearings (±15°)
  cluster into the same group. Visible at zoom ≥ 17 as compact directional
  pills; hovering expands to show category icons and directional arrows.
- **Legend overlay on map.** The legend moved from the sidebar to a
  slide-out panel on the left edge of the map canvas. A vertical grip
  tab toggles the panel open/closed.
- **`buildFacingHoverContent()`** — lightweight hover overlay builder
  showing category icons and directional arrows (no sign text) for
  facing-expanded markers.
- **`buildLocationContent()`** — unified dispatcher that selects the
  appropriate marker builder based on facing layer state and zoom level.
- **`facingDetailForZoom()`**, **`groupAttachmentsByFacing()`**,
  **`buildFacingGroup()`**, **`buildFacingCenter()`**,
  **`buildFacingSymbolContent()`** — radial layout system for sign
  facing indicators.
- **Cached bearing map** — reverse lookup from attachment ID to arrow
  bearings, invalidated on link add/remove for efficient facing layout
  rebuilds.

### Changed
- **Sidebar restructured.** Replaced the three-panel accordion (Filters /
  Layers / Legend) with flat titled sections: "Filters & Layers" combines
  status/template filters with layer toggles; "Add to Map" is a distinct
  titled section for location and arrow placement buttons.
- **Sidebar body padding** removed from the card body; each section
  manages its own padding via `.signs-sidebar-section`.
- **Location list** padding adjusted to match the new section-based layout.
- **Legend inline styles replaced** with CSS classes
  (`.signs-legend-arrow-icon`, `.signs-legend-mount-icon`).
- **Zoom-change handler** now tracks both `currentDetailLevel` and
  `currentFacingLevel`, triggering marker rebuilds when either threshold
  is crossed (17 for facing symbols, 19 for full detail).
- **Hover-expand system** extended to work on facing-symbol markers at
  all zoom levels (not just compact mode below zoom 19).

### Known Issues
- Facing hover overlay shows all signs for a location rather than only
  the signs linked to the hovered directional group — planned for 2.49.0.
- The 110×110 px facing layout hitbox can overlap nearby traffic arrow
  markers at close spacing — z-index refinement planned.

## 2.47.0 — Sign Map Publish to SharePoint + Blob Storage

### Added
- **Publish sign map as PDF.** OVERSEER+ users can click the "Publish"
  button on the print view toolbar to generate a PDF snapshot of the
  current sign map. The PDF is uploaded in parallel to both Azure Blob
  Storage (`published-files` container) and SharePoint / OneDrive
  (`Maps/Sign Maps` subfolder), then recorded in a new `published_files`
  database table. The SharePoint copy appears automatically on the Maps
  resource page for all volunteers.
- **Publish toast notification.** A green toast with "Published!" and a
  direct SharePoint link appears on success, replacing the previous
  multi-line alert dialog.
- **`published_files` table.** Generic audit table tracking published
  file type, filename, blob name, SharePoint URL, publisher, and
  timestamp. Supports future file types beyond sign maps.
- **`lib/publishSignMap.js`** — Puppeteer-based PDF generation +
  dual-destination upload orchestrator.
- **Blob Storage published-files container** — `uploadPublishedFile()`
  and `streamPublishedFileToResponse()` functions in `blobStorage.js`.
- **Map type query parameter** — the print view now accepts `?mapType=`
  to set Road or Hybrid on load (used by the Puppeteer internal render).
- **`window.signsMapReady` signal** — set by `signsMapPrint.js` after
  tiles load and markers are placed, consumed by Puppeteer's
  `waitForFunction()` to know when the page is ready for PDF capture.

### Changed
- **`signsRouter` factory** now accepts `serverPort` and `graphConfig`
  dependencies for the publish pipeline.
- **Puppeteer request interception** spoofs the `Referer` header on
  Google Maps API requests so the API key's HTTP referrer restrictions
  are satisfied when rendering from `127.0.0.1`.

## 2.46.0 — Print Mount Icons & Building Overlays

### Added
- **Print marker mount-type icons.** Each print marker now shows a small
  FontAwesome icon (cone, a-frame, existing-structure) below the pill grid,
  visually indicating the physical mounting method. A "Mount Types" section
  was added to the print legend alongside the existing Sign Types and Status
  sections.
- **Print marker anchor fix.** Print markers now use `transform: none`,
  letting AdvancedMarkerElement's native center-bottom anchor place the
  mount-type icon at the exact geographic point. Previous percentage- and
  pixel-based transforms caused vertical drift across zoom levels.
- **Building polygon overlays.** Three convention-area buildings (MVP Arena,
  MVP Parking, OGS East Garage) are highlighted with semi-transparent
  colored polygon outlines on both the interactive and print sign maps.
  Outlines are traced in Google My Maps, exported as KML, and parsed
  per-request from `src/config/buildings.kml`. Colors and IDs are mapped
  via `OVERLAY_STYLES` in `src/config/mapOverlays.js`.
- **Shared overlay renderer** (`public/js/signsMapOverlays.js`). Both
  `signsMap.js` and `signsMapPrint.js` call `window.signsMapOverlays.render()`
  after map initialisation. Labels use `collisionBehavior:
  OPTIONAL_AND_HIDES_LOWER_PRIORITY` to yield to sign markers when space
  is tight.

### Changed
- Print legend grid expanded from 3 to 4 columns to accommodate the new
  Mount Types section.
- `signsRoutes.js` now imports `getMapOverlays()` and passes the parsed
  overlay array in bootstrap JSON for both map routes.

### New Files
- `src/config/buildings.kml` — KML polygon data exported from Google My Maps.
- `src/config/mapOverlays.js` — KML parser with style lookup.
- `public/js/signsMapOverlays.js` — shared polygon + label renderer.

## 2.45.0 — Street View

### Added
- **Street View overlay** for sign locations and traffic arrows.
  - Single-click info sheet and right-click context menu both offer a "Street View" button on locations and arrows.
  - Locations: camera approaches from 20 m behind the sign using `front_bearing`; restores saved panorama state if previously saved.
  - Arrows: camera uses the arrow's own bearing for approach direction, targeting the linked location's coordinates (or the arrow's own if unlinked); restores saved arrow panorama state if available.
  - "Save as Photo" (locations only, canManage): captures a static image from Google Street View Static API and saves it as the location photo, persisting the camera state for future restoration.
  - "Save View" (arrows only, canManage): persists the panorama camera state (panoId, heading, pitch, fov) on the arrow without capturing a photo.
  - Escape key dismisses the overlay (checked before existing Escape cascade).
  - No-imagery detection with fallback link to Google Maps.
  - Full CSS for the overlay was already in place from pre-2.40 work; no style changes needed.
- **DB: `sv_pano_id`, `sv_heading`, `sv_pitch`, `sv_fov`** columns on both `sign_locations` and `sign_traffic_arrows`.
- **Route: `POST /signs/locations/:locationId/street-view-photo`** — server-side Google SV Static API fetch, blob upload, and DB persist.
- **Route: `PATCH /signs/arrows/:arrowId/street-view-state`** — persist arrow panorama camera state.
- **`setTrafficArrowSvState()`** in dbSync for arrow SV persistence.
- **`setSignLocationPhoto()`** now accepts optional `svState` parameter; `clearSignLocationPhoto()` clears SV columns.

### Migrations
- `sign_locations_sv_state.sql` / `sign_locations_sv_state_demo.sql`
- `sign_arrows_sv_state.sql` / `sign_arrows_sv_state_demo.sql`

## [2.44.0] - 2026-06-09

### Added
- **Sign categories.** New `sign_category` column on `signs` table with five
  values: `parking` (blue **P**, blue border), `accessible` (♿, white-on-blue
  inverted), `dropoff` (🧳 person-walking-luggage), `info` (ⓘ, white-on-black
  inverted), and `warning` (⚠, black-on-yellow inverted). Category icons
  appear on map markers, print markers, the sign library, and the builder
  preview. Category picker dropdown added to the Sign Builder form.
- **Sign types legend.** Both the interactive map sidebar legend and the print
  map legend now include a "Sign types" section showing colored icon pills
  for each category.
- **Arrow link highlight.** Hovering or selecting an arrow highlights only the
  specific linked signs at each location (per-attachment targeting via
  `data-attachment-id`). Non-linked signs at the same location are hidden
  during the highlight. Replaced the old whole-marker glow with individual
  sign card scale + cyan glow treatment.

### Changed
- **Status colors.** Planned → orange (`#e67700`), installed → vivid green
  (`#2b8a3e`), removed → solid red (`#dc3545`). Applied consistently across
  full-size markers, compact markers, legend dots, inline JS borders, and
  print legend dots.
- **Print markers.** Each attachment rendered as a compact icon + arrow pill
  in a 2-column grid (replacing the single top-sign abbreviation). Category
  colors applied per pill.
- **Print legend.** Removed abbreviation-based Sign Key section and Marker
  Colors section. Added static Sign Types section with colored pills.
  Location count retained.
- **Sign preview text.** Removed `max-width: 20ch` truncation on map markers
  so full sign names display.

### Removed
- **Marker color picker** from the location editor (swatches UI removed).
- **Marker colors legend** from both the interactive map sidebar and print
  map legends.
- **Sign ID numbers** from all template filter dropdowns (interactive map,
  print map, and add-sign dropdown in the location editor).

### Fixed
- **Arrow rotation after editor save.** `refreshArrowMarker` now re-calls
  `attachArrowShiftGate` on the new content element, restoring the rotation
  handle listener that was lost when `marker.content` was replaced.
- **`getSignById` SQL error.** Added missing `INNER JOIN dbo.signs s2` to
  the attachment sub-query (fixes `s2.sign_text could not be bound`).
- **`placement_count` alias.** Renamed the `attachment_count` SQL alias in
  `getSigns` to `placement_count` to match what `signsList.ejs` reads.
- **`createSign` / `updateSign` duplication.** Restored the `createSign`
  function with its INSERT statement after it was accidentally overwritten
  with a copy of `updateSign`.

## [2.43.0] - 2026-06-09

### Added
- **Sign Map: click interaction overhaul.** Single click on a location or
  arrow marker opens a read-only info sheet (slide-up panel); double-click
  opens the editor (OVERSEER+); right-click opens a context menu with Edit
  and Delete (OVERSEER+). Clicking empty map space deselects the active
  marker and dismisses all overlays. Sidebar list rows now open the info
  sheet instead of the editor. Escape key cascades: dismiss context menu →
  exit placement mode → deselect all.
- **Context menu.** Floating right-click menu on location and arrow markers
  with Edit and Delete actions (OVERSEER+). Positioned at cursor, dismissed
  on click-away, scroll, or Escape. Appended to `document.body` to avoid
  Google Maps' `all: revert` CSS reset.
- **Geofencing reinstated.** `signsGeofence.js` rewritten for the
  locations/attachments data model. `window.signsMapApi` re-exposed from
  `signsMap.js` with `getLocations`, `findLocation`, `deriveStatus`,
  `selectMarker`, `quickSetLocationStatus`, `canManage`, and `getMapRef`.
  Proximity distance displayed in feet. `quickSetLocationStatus` sets all
  attachments on a location to the chosen status in one tap. FAB placed in
  Google Maps control stack with inline styles. Auto-follow removed to
  prevent vector-tile style corruption on pan.
- **Arrow direction pulse.** Hovering any traffic arrow marker fires a
  repeating approach-light animation: five ghost arrows pulse tail-to-head
  in bright orange, ending with a glow on the real arrow. Repeats until the
  cursor leaves. Single-clicking an unlinked arrow also triggers the pulse.
  Linked arrows show the info sheet on click instead.
- **`selectMarker` `noPan` option.** Geofence proximity detection selects
  markers without panning, preventing vector-tile reloads that corrupt
  cloud-based map styling.

### Changed
- **Mount type icons** in map markers switched from hand-drawn SVGs to
  FontAwesome icons (`fa-signs-post`, `fa-triangle-exclamation`, `fa-tent`,
  `fa-building`), matching the sidebar legend.
- **Marker click handlers** switched from `marker.addListener("click")`
  (Maps API synthetic event) to `marker.element.addEventListener("click")`
  (native DOM on the persistent host element). Survives both post-drag
  click suppression and `marker.content` swaps on zoom transitions. A
  no-op `marker.addListener("click", () => {})` keeps markers clickable
  in the Maps API so clicks don't fall through to the map.

### Fixed
- **Proximity bar race condition.** `hideProximityBar` now uses a tracked
  `transitionend` handler that `showProximityBar` explicitly cancels,
  preventing a stale listener from re-adding `d-none` after a rapid
  hide → show sequence.
- **Duplicate geofence CSS.** Removed ~290 lines of duplicate FAB, blue dot,
  and proximity bar styles that were injected mid-rule during an earlier
  edit, breaking the `.signs-composer-status` rule.

## [2.42.0] - 2026-06-09

### Changed — Sign Map: arrow geometry, cursors, and interaction zones

- **Arrow tip pinning.** Arrow rotation moved from CSS `transform: rotate()`
  on the wrapper to SVG `<g transform="rotate(B, cx, cy)">` inside the
  viewBox. The wrapper stays a stable 40×64 / 20×20 layout box so the
  GMP-ADVANCED-MARKER element no longer dynamically resizes to the rotated
  bounding box — `translate(-50%, -100%)` percentages are now constant.
  `translateY(58px)` (full) / `translateY(16px)` (compact) bridges the tip
  to the bottom-center anchor. SVG `overflow: visible` prevents clipping
  when the rotated tail extends beyond the viewBox.
- **Interactive zones.** Arrow markers now use explicit hit zones instead of
  relying on the SVG shape. A `.signs-arrow-zones` container rotates with
  the arrow visual and holds two children: a 50px body zone at the arrow
  midpoint (move/hover target) and the 36px rotation handle at the tip.
  The SVG remains `pointer-events: none`. Zones survive all rotations
  with predictable hit areas.
- **Cursor system overhaul.** Custom `--cursor-rotate` CSS variable (SVG
  data URI with white outline for satellite-tile visibility). Cursor rules:
  normal = default; placement mode = crosshair (CSS class, not inline
  style); Shift+hover on location markers = move; Shift+hover on arrow
  body zone = move; Shift+hover on rotation handle = rotation cursor.
  Active rotation and active drag cursors forced on `body *` to override
  Google Maps' internal `.gm-style` cursor styles.
- **Arrow placement crosshair.** `enterArrowPlacingMode` now uses CSS
  class `.signs-map-placing-arrow` (matching the `.signs-map-placing`
  pattern) instead of `mapRef.getDiv().style.cursor`, fixing the cursor
  being overridden by Google Maps' internal `.gm-style` divs.
- **Rotation handle hover hint.** `.signs-map-shift-held .signs-arrow-handle:hover`
  shows a cyan border circle with a rotation icon background-image (SVG).
- **Drag guard overhaul.** Replaced `stopImmediatePropagation` shift-gate
  with dynamic `gmpDraggable` toggling via `updateDraggableState()`.
  All markers start `gmpDraggable: false`; toggled to `true` only when
  Shift is held and zoom ≥ `MIN_ZOOM_FOR_DRAG`. Called from keydown/keyup,
  `zoom_changed`, and `window blur`. `attachLocationShiftGate` is now a
  no-op; `attachArrowShiftGate` reduced to rotation-only interception.
- **Rotation zoom guard.** Arrow rotation now requires
  `canDragAtCurrentZoom()` — blocked at low zoom levels.
- **Click handler.** Markers use `marker.addListener("click")` (Maps API
  method) for reliable click tracking after drag operations.
- **`lastDragEndTime` on rotation end.** Suppresses accidental click
  immediately after completing a rotation.
- **Bearing input removed.** The heading number field is removed from the
  arrow editor — the rotation handle is the primary UX. `saveArrowEditor`
  reads `arrow.bearing` directly from in-memory state.
- **Initial detail level.** `addMarkerForLocation` and `addMarkerForArrow`
  now respect `currentDetailLevel` at creation, building compact content
  when the page loads below zoom 19 instead of always building full-detail.

### Fixed

- **Hover-expand collapse.** Compact location markers that expand on hover
  now collapse reliably when the mouse leaves. The `mouseleave` listener
  is bound to the persistent GMP host element (`gmp-advanced-marker`) via
  `content.parentElement`, not the swapped content element. A content swap
  under a stationary cursor suppresses `mouseenter` on the new element, so
  a `mouseleave` bound to it would never fire until re-entry. The host is
  never replaced, so its hover tracking is continuous. Dataset guard
  `hoverCollapseBound` prevents duplicate binding across expand/collapse
  cycles.

### Added

- **Per-sign highlight on arrow link hover.** Hovering a linked-sign row
  in the arrow editor or browsing the link picker highlights the specific
  sign card on the map with `signs-map-marker-sign-highlighted` (cyan
  border + glow). If the target sign is on a compact marker, it is
  temporarily expanded. Markers expanded for link highlighting are tracked
  separately (`linkExpandedMarkers` Set) and collapsed on clear. Map pans
  to the sign only if outside the current viewport.
- **Arrow hover → linked signs glow.** Hovering an arrow marker on the
  map highlights all associated sign cards via `highlightArrowLinks()`.
  Listeners attached to `marker.element` (persistent GMP host) so they
  survive content swaps.
- **Bootstrap dropdown link picker.** Replaced the native `<select>` in
  the arrow link form with a Bootstrap dropdown menu. Each item fires
  `mouseenter` → `highlightLinkedSign` for live feedback as you browse.
  Click to link, dropdown auto-closes. Items sorted by distance
  (closest first) and filtered to within 300 ft of the arrow. Distance
  badge shown on each item. Empty state messages distinguish "all linked"
  from "none within range." Location IDs removed from display.
- **`approxDistanceFt` utility.** Flat-earth approximation for short
  distances; used by the link picker to sort and filter candidates.
- **`data-attachment-id`** attribute added to sign cards in
  `buildMarkerContent` for per-sign DOM targeting.

## [2.41.0] - 2026-06-08

### Changed — Sign Map UX refinements
- **Arrow tip as reference point.** Traffic arrow markers now anchor at the
  arrow tip instead of the element center. Rotation pivots around the tip.
  Full arrows offset by `translateY(26px)`, compact arrows by `translateY(6px)`.
  CSS `transform-origin` set to `50% 9.375%` (full) and `50% 20%` (compact).
- **Mount-type icons on compact markers.** Zoomed-out disc markers now show
  an inline SVG icon for the mount type (cone, a-frame, existing-structure /
  telephone pole) instead of the first sign's abbreviation. A count badge
  appears for 1+ attachments. Locations with no mount type show a bullet
  fallback.
- **Mount-type label on full markers.** Zoomed-in sign stacks now display a
  small icon + text label (e.g. "Cone", "A-frame") below the sign stack.
- **Hover-to-expand compact markers.** At zoom < 19, hovering a compact disc
  temporarily expands it to the full sign stack after a 250 ms debounce.
  Collapse after mouse leave with a 150 ms grace period. Desktop only (no-op
  on coarse-pointer devices).
- **Click-after-drag suppression.** Marker clicks (location and arrow) are
  suppressed for 300 ms after a drag or map pan ends, preventing accidental
  editor opens on pointer release.

### Fixed
- **Shift-gate consolidation.** Replaced seven copy-pasted inline
  `pointerdown` shift-gate blocks with two centralised helpers:
  `attachLocationShiftGate(content)` and `attachArrowShiftGate(content, arrowId)`.
  Fixes sporadic shift-gate failures caused by content-swap paths that missed
  re-attaching the listener (hover expand/collapse, detail level change,
  `refreshMarker`).
- **Duplicate JSDoc blocks** cleaned up in `addMarkerForLocation`,
  `buildArrowMarkerContent`, `addMarkerForArrow`, and
  `buildCompactLocationContent`.

## [2.40.0] - 2026-06-05

### Changed — Sign Map overhaul (location-based architecture)
- **New data model.** Replaced the flat `sign_placements` table with three
  entities: `sign_locations` (physical mounting points), `sign_attachments`
  (signs mounted on a location with per-attachment status and stacking order),
  and `traffic_arrows` / `traffic_arrow_signs` (road-surface directional
  indicators linked to specific attachments — Phase 3 tables, created now).
  *SQL migration required: `scripts/migrations/sign_overhaul.sql` (dbo) and
  `sign_overhaul_demo.sql` (demo). Drops `sign_placements`; all existing
  placement data and photos are removed.*
- **Stacked sign markers.** Map markers now render as a vertical stack of
  sign-preview blocks, one per attachment sorted by `sort_order`. Empty
  locations show a dashed placeholder. Per-attachment status colors
  (border tint) are visible within the stack.
- **Location-based sidebar.** The sidebar list groups by location with
  nested sign rows showing sign name, arrow direction, and status badge.
  Mount type and location notes shown as a sub-line.
- **Offcanvas editor redesigned** for location + attachment management:
  location fields (coordinates, mount type, a-frame bearing, marker color,
  notes, photo) at the top, followed by a draggable attachment list with
  status cycling (click badge to cycle planned → installed → removed),
  remove buttons, and an inline "Add sign" form with template picker,
  arrow direction picker, and face selector (for a-frames).
- **Drag-to-reorder attachments** in the editor. Reorder persists via
  `PUT /signs/locations/:id/attachments/reorder` (single CASE UPDATE).
- **Hide overlays on drag.** Moving a location hides all context menus,
  info sheets, and tooltips so only the pin is visible during repositioning.
- **Print map updated** for the new data model. Markers show the top sign's
  abbreviation + arrow; legend maps abbreviations to full sign names.

### Added
- **Printable sign map (Phase 1).** New route `GET /signs/map/print` renders
  a WYSIWYG print-optimised view with a 7 in × 7 in square map on a
  letter-portrait page preview. Users pan/zoom to frame their view, then
  print — what they see is what they get. Toolbar with Road/Hybrid toggle,
  status + template filters, fit-to-markers button, and print button.
  Legend below the map with sign key, status dots, and color swatches.
  Print button added to the main sign map sidebar header.
  New files: `signsMapPrint.ejs`, `signsMapPrint.js`, `signsPrint.css`.
- `pole` added to valid mount types.
- New API routes: `POST/PUT/DELETE /signs/locations`, attachment CRUD under
  `/signs/locations/:id/attachments` and `/signs/attachments/:id`, reorder
  via `/signs/locations/:id/attachments/reorder`, location photos via
  `/signs/locations/:id/photo`.

### Removed
- `sign_placements` table and all placement-specific API routes.
- Geofence FAB, proximity bar, Street View overlay, and placement composer
  (temporarily removed — will return in later phases adapted to the new
  location-based model).

## [2.39.0] - 2026-06-04

### Added
- **Sign Map geofencing (Phase 4).** `manageSigns` users see a floating GPS
  button (bottom-right of the map) that toggles continuous location tracking.
  When active, a blue pulsing dot shows the user's live position and the map
  auto-follows. When the user comes within 75 m of a sign placement, a
  proximity bar slides up from the bottom of the screen showing the sign
  preview, live distance readout, a photo thumbnail (tap to expand), and
  one-tap Planned / Installed / Removed status buttons. Dismissing a
  placement suppresses it for the remainder of the tracking session.
  Auto-follow pauses for 5 s when the user manually pans or zooms.
  New file: `public/js/signsGeofence.js`.
- **`window.signsMapApi`** — `signsMap.js` now exposes a minimal API object
  (`getPlacements`, `findPlacement`, `selectMarker`, `quickSetStatus`,
  `canManage`, `getMapRef`) so companion modules can interact with the map
  without reaching into the IIFE's private scope.

### Fixed
- **Travel-handle rotation no longer opens the info sheet** — `lastDragEndAt`
  is now set on travel-handle `pointerup`, matching the existing position-drag
  guard so the synthetic click after pointer release is suppressed.

## [2.38.0] - 2026-06-03

### Added
- **Street View camera position persistence.** After a Street View snapshot
  is saved as a placement's photo, the panorama ID, heading, pitch, and FOV
  are stored in four new nullable columns on `sign_placements` (`sv_pano_id`,
  `sv_heading`, `sv_pitch`, `sv_fov`). The next time Street View is opened
  for that placement it restores the exact panorama and camera angle instead
  of recalculating the approach position from scratch. Falls back to the
  computed approach when no snapshot state has been saved.
  *SQL migration required: `ALTER TABLE dbo.sign_placements ADD sv_pano_id
  NVARCHAR(100) NULL, sv_heading DECIMAL(6,2) NULL, sv_pitch DECIMAL(6,2)
  NULL, sv_fov DECIMAL(6,2) NULL;`*
- **Operations hub accessible to `viewSigns` users.** `GET /oversight/tools`
  gate lowered from `editVolunteerInfo` → `viewSigns`, opening the hub to
  REGISTERED volunteers (and anyone with the delegated `manageSigns`
  permission). The Operations nav dropdown gate was widened to match.
- **Sign Map card** added to the Operations hub Signs section; **Sign Map
  link** added to the Operations nav dropdown.
- **`public/styles/volunteerAccountOversight.css`** — new stylesheet for the
  Edit Volunteer page. Accordion sections in edit mode (`data-editing="true"`)
  receive a blue left-accent shadow and a light background tint. Unchecked
  checkboxes gain a darker border so they are clearly visible against the
  background. Active text inputs and selects gain a primary-color border.
  Locked-mode form controls are slightly muted to reinforce read-only state.

### Changed
- **Oversight Tools renamed to Operations** across the hub page title, h1,
  and nav dropdown label.
- **Sitemap page title** now wrapped in a frosted-glass backdrop
  (`rgba(0,0,0,0.45)` with `backdrop-filter: blur`). Section heading text
  changed to white with a dark text-shadow so both read over the hero photo.

### Fixed
- **Canvas compositing aspect ratio.** `composerSave()` called
  `ctx.drawImage(bgImg, 0, 0, W, H)`, which ignores the CSS
  `object-fit: contain` on `.signs-composer-bg` and stretches the
  background to fill the full stage, displacing the sign overlay relative
  to the photo content. Fixed by computing the `object-fit: contain` render
  rectangle (`scale = min(stageW/nW, stageH/nH)`, centered), sizing the
  canvas to the image content area only, drawing the background without
  stretch, and subtracting the letterbox offset from the sign coordinates.
  The saved JPEG now matches the photo's native aspect ratio and the sign
  appears exactly where it was positioned on screen.

## [2.37.0] - 2026-06-03

### Added
- **Separate Take Photo / Upload buttons** in the placement editor.
  "Take Photo" uses `capture="environment"` to go straight to the
  device camera on mobile; "Upload" opens the gallery / file picker.
  Both inputs feed the same upload pipeline. The has-photo state now
  shows "Retake" (camera), "Replace" (gallery), and "Remove".
- **Save Street View as Photo.** A "Save as Photo" button in the
  Street View overlay header (visible to OVERSEER+ / delegated
  `manageSigns` users) captures the user's exact panorama position,
  heading, pitch, and FOV. The server fetches the corresponding image
  from the Google Street View Static API (`pano=` mode so the saved
  view matches exactly what the user sees, regardless of auto-
  calculated approach position) and uploads it to Azure Blob Storage
  via the same pipeline as regular photo uploads.
- **Existing photo as composer background.** The placement composer
  toolbar now shows an "Existing photo" button (when a photo exists)
  alongside Upload. Loads the placement's current
  photo as the background so the sign overlay can be positioned on
  a real field photo.
- **Photo credit line** beneath the "Photo of installed sign" header in
  the editor: "Photo taken by: First Last — dd/mm/yyyy". New DB columns
  `photo_taken_by` and `photo_taken_at` on `sign_placements`.
- **New route** `POST /signs/placements/:id/street-view-photo` —
  accepts `{ panoId, heading, pitch, fov }`, fetches 640×480 JPEG
  from the SV Static API, processes through sharp, and stores in blob.

### Changed
- **Composer toolbar** no longer offers Street View as a background
  source — redundant now that the main Street View overlay has "Save
  as Photo". Background options are now Upload and Existing photo.
- **Street View and Compose buttons** moved from the editor action bar
  to the photo section, beneath the upload/replace controls.

## [2.36.3] - 2026-06-03

### Fixed
- **Mobile: pressing a sign disabled the map and scrolled the page instead
  of panning.** Two independent layers were each claiming one-finger touch:
  - The map had no `gestureHandling` set, so Maps defaulted to `auto`, which
    resolves to `cooperative` on a scrollable page — one finger scrolls the
    document, two fingers pan the map. Set `gestureHandling: "greedy"` so a
    single-finger drag always pans the map.
  - Marker content carried `touch-action: manipulation`, which still lets the
    browser treat a single-finger drag as a page scroll and turns the
    follow-up `touchmove` events non-cancelable before Maps' pan handler can
    run. Changed to `touch-action: none` on `.signs-map-marker` and its
    descendants so the gesture stays cancelable and reaches Maps regardless of
    which part of the marker (full sign body or compact disc) is pressed.
  - Note: `greedy` also enables scroll-wheel zoom on desktop without holding
    Ctrl, which is expected for a dedicated full-page map tool.

## [2.36.2] - 2026-06-02

### Fixed
- **Shift-gate bypass at full zoom after successful drag/rotation.**
  At full detail level, the marker wrapper contains child elements
  (sign text, arrow, travel handle). The capture-phase `pointerdown`
  listener on the wrapper was returning early when the event target was
  the travel handle, allowing Maps to receive the event and start a
  marker drag without Shift. Fixed by removing the early-return for the
  handle — `stopImmediatePropagation` now fires for all non-Shift
  pointerdowns on any part of the marker, including the handle area.
  The handle's own Shift-gated listener still runs correctly when Shift
  is held. Also set `.signs-map-marker-sign { pointer-events: none }` so
  pointer events on the sign body route to the wrapper rather than the
  child element, closing a parallel bypass path at full zoom.

## [2.36.1] - 2026-06-02

### Changed
- **Shift-gate on marker drag and travel-handle rotation (desktop).**
  Marker position drags and travel-direction handle rotations now require
  Shift to be held at the start of the drag. A plain drag on a marker
  (without Shift) falls through to the normal Google Maps pan gesture
  instead of moving the sign. This prevents accidental sign displacement
  when a user is panning the map near a placed sign.
  - Holding Shift while hovering any marker shows a `grab` cursor as a
    visual affordance that Shift+drag is available.
  - Arrow-key nudging is unchanged — no Shift required for fine/coarse nudge.
  - Legend updated to show `Shift+drag marker` and `Shift+drag handle`.
  - Touch devices are unaffected (drag already disabled on touch).

## [2.36.0] - 2026-06-02

### Added — Sign Map Mobile UX Pass

#### Info sheet (bottom card — all devices)
- Tapping or clicking any sign marker or sidebar placement row now opens a
  **bottom info sheet** before the full editor, giving all users a quick-peek
  summary without immediately committing to an edit. The sheet shows the sign
  preview, status badge, mount type, location notes, coordinates, and a photo
  thumbnail (tap to open lightbox). Action buttons provide the full feature set:
  - OVERSEER+: **Edit placement** (primary, blue), quick **status buttons**
    (Planned / Installed / Removed in a 3-column grid), Street View, Get
    directions, Copy coordinates, Delete.
  - View-only (REGISTERED / KEYMAN): Street View, Get directions, Copy
    coordinates, View photo (when a photo exists).
- The sheet slides up from the bottom of the viewport with a spring-eased
  CSS transition. On ≥768px screens it is constrained to a 480px centred card.
- **Swipe-to-dismiss** — drag the pill handle or the header area downward ≥80px
  to close. Short drags snap back. Tapping the backdrop also dismisses.
- **Escape key** cascades in order: Street View → info sheet → deselect marker.
- The sheet is accessible to all roles on all devices.

#### Touch device protection
- **Drag-to-reposition is disabled on touch devices.** `gmpDraggable` is set
  to `false` at marker construction time when `isTouchDevice` is true. A
  post-construction force-disable loop in `initMap` catches any marker built
  before the device flag was confirmed (covers DevTools emulation mid-session).
- The `dragend` listener contains a belt-and-suspenders snap-back: if a drag
  fires on a touch device despite the above (e.g. DevTools switch), the marker
  is immediately snapped back to its stored position and `persistDrag` is not
  called.
- `persistDrag` has a final guard that snaps the marker and returns early if
  `isTouchDevice` is true — the position is never sent to the server.
- `isTouchDevice` is evaluated at page load via
  `window.matchMedia("(pointer: coarse)").matches`.

#### Travel handle — desktop only
- The direction-of-travel drag handle is hidden on coarse-pointer (touch)
  devices via `@media (pointer: coarse) { .signs-map-travel-handle { display: none } }`.
- `attachTravelHandleListeners` returns early when `isTouchDevice` is true.

#### Geolocation — "Use my location"
- A **location crosshairs button** next to "Add placement" triggers `geotagPlacement('new')`,
  which calls `navigator.geolocation.getCurrentPosition` with `enableHighAccuracy: true`
  and drops a pending ghost marker at the GPS fix without requiring a map tap.
  If a ghost marker already exists (the user tapped first), it is repositioned.
- An **"Update to my location"** button in the offcanvas editor coordinate row
  (OVERSEER+, existing placements only) calls `geotagPlacement('existing')`, moves
  the marker visually, and pre-fills the lat/lng inputs. The save still requires
  an explicit click — the position is not auto-persisted.
- Both buttons show a spinner and disabled state while the GPS fix is pending.
- An **accuracy badge** appears below the coordinate inputs for 6 seconds after
  a fix: `GPS fix: ±Nm (Excellent / Good / Fair / Poor)`. Thresholds: ≤5m
  Excellent, ≤15m Good, ≤40m Fair, otherwise Poor.
- Geolocation errors (permission denied, unavailable, timeout) surface as
  inline text in `#editorFeedback`.

#### Sidebar filters — collapse on mobile
- On `<lg` breakpoints the sidebar filter body (`#sidebarFiltersBody`) is
  collapsed by default. A **Filters** toggle button in the card header (hidden
  on `≥lg`) expands/collapses it with an animated chevron — same Bootstrap
  collapse pattern used elsewhere in the app.

#### Coordinate inputs — editable for canManage on touch
- The lat/lng fields in the editor are `readonly` only for view-only users.
  OVERSEER+ users can type coordinates directly (important now that drag is
  disabled on touch). The hint text updates accordingly: desktop shows
  "Drag the marker on the map to reposition", mobile shows
  "Enter coordinates manually, or tap the map to place."

#### Legend updates
- Keyboard shortcut entries (`<li>`) are hidden on `<lg` screens via
  `d-none d-lg-flex`; a "Tap marker → View details & actions" hint is shown
  instead.
- The direction-of-travel legend section is hidden on mobile via
  `d-none d-lg-block / d-none d-lg-flex`.
- Placement list `max-height: 40vh` cap removed on `≤991px` (the list sits
  inside a collapsible section and the page scrolls natively on mobile).

### Fixed
- **Accidental drag corruption** — three markers were displaced by accidental
  drags during mobile DevTools emulation testing before the touch guards were
  in place. The guards prevent any future occurrence; affected placements
  should be corrected via the editor's coordinate inputs or the "Update to my
  location" GPS button.

## [2.35.0] - 2026-06-02

### Added — Phase 2d: Delegated `manageSigns` Permission

#### Extra-permissions system
- New generic delegated-permissions mechanism: `req.session.extraPermissions`
  (string array) is built at login from per-volunteer flag columns on
  `volunteer_in`. `requirePermission()` checks this array as a fallback after
  the role-matrix check, so any permission can be granted to an individual
  volunteer without a role promotion. Adding a future delegated permission
  requires only a new DB column and one line in the login handler — no further
  changes to `requirePermission()`.
- First use: `extra_signs_placement BIT NOT NULL DEFAULT 0` on `volunteer_in`.
  When set, grants `manageSigns` to a REGISTERED volunteer without promoting
  them to OVERSEER.

#### ADMIN/ASSISTANT_ADMIN UI
- A new **Delegated Permissions** section appears in the Assignment & Role
  accordion on the Edit Volunteer page for ADMIN and ASSISTANT_ADMIN users.
- Contains a single **Manage sign placements** toggle (checkbox). When checked,
  the volunteer gains full `manageSigns` access — they can create, edit, drag,
  and delete sign placements on the Sign Map.
- The toggle is disabled (read-only) until the section's **EDIT** button is
  clicked, matching the existing Assignment section pattern.
- OVERSEER users editing a volunteer do not see this section — they can only
  set REGISTERED/KEYMAN role and crew flags as before.
- Server-side guard in `POST /edit-volunteer/assignment`: the
  `extra_signs_placement` value is stripped entirely when the actor is below
  ASSISTANT_ADMIN, so a crafted POST body cannot elevate a volunteer's
  permissions.

#### `dbSync.js`
- `updateVolunteerAssignment` gains a new `extraPerms` parameter
  (`{ extraSignsPlacement?: boolean }`) and writes `extra_signs_placement`
  in the same UPDATE as the role and crew columns.

### Fixed
- **Dashboard dept pill missing color on initial load** (`views/index.ejs`) —
  the server-rendered dept pill was slugified from `shift.dept_name`
  (`"Drop-off / Pickup"` → `db-dept-drop-off---pickup`), while
  `dashboardShifts.js` correctly uses `shift.dept_key`
  (`dropoff_pickup` → `db-dept-dropoff-pickup`). The CSS class never matched
  on first load; only after the first day-navigation (which uses the JS
  renderer) did the color appear. Fixed by switching the EJS slug to use
  `dept_key` to match the JS renderer.

### Legend update (`signsMap.ejs`)
- Added a **Direction of travel arrow** section to the collapsible legend
  explaining the drag handle ("Drag handle → set direction") and the dashed
  unset state ("Dashed arrow → no direction set yet").
- Updated the Esc shortcut description to note the stepped Street View
  dismiss behavior ("second Esc closes Street View first").

---

## [2.34.0] - 2026-06-02

### Added — Sign Map Phase 3b: Direction of Travel Handle

#### Direction-of-travel arrow handle
- Full markers (zoomed in at or above the detail threshold) now display a
  100px direction arrow extending from the marker center. The arrow uses an
  inline SVG with a double-stroke technique — a wider white halo painted
  first, then a cyan (`#00d4ff`) stroke on top — identical to the
  high-contrast approach used in Windows cursor files. The shape reads
  clearly on any map tile color (asphalt, grass, snow, rooftop) without
  needing to know the background.
- OVERSEER+ users can **drag the handle** to set the direction of travel.
  The arrow rotates live during the drag; the bearing is saved automatically
  on release via a PUT to the placements endpoint. No Save button required.
- Bearing is stored in the existing `heading` column on `sign_placements`
  (repurposed — see below). The in-memory placement and the editor input
  both update live as the handle is dragged.
- **Unset state:** when no direction has been saved, the handle renders as
  a dashed semi-transparent arrow, signalling "drag me to set a direction."
- View-only users (REGISTERED / KEYMAN) see the handle when a direction is
  set, but it is not interactive — they see the bearing without being able
  to change it.
- Tooltip is suppressed while the pointer is over the handle so it does not
  obscure the drag target.

#### `heading` column repurposed as direction of travel
- The `heading` column on `sign_placements` previously held an ambiguous
  "camera facing direction." It now specifically means **direction of travel
  (0–360°, clockwise from north)** — the bearing drivers travel *toward* the
  sign. No schema change was required; all existing NULLs remain valid.
- The offcanvas editor label updated from "Heading (facing direction, 0–360°)"
  to **"Direction of travel (0–360°, optional)"** with new helper text
  explaining that the value drives the map arrow and Street View positioning.
  Users can still type a bearing directly in the input instead of dragging.
- JSDoc updated on `createSignPlacement` and `updateSignPlacement` in
  `dbSync.js` to reflect the new semantic.

#### Street View approach positioning
- `openStreetView()` now offsets the camera **20m behind the sign** along
  the reverse of the travel bearing (`SV_APPROACH_DISTANCE_METERS = 20`),
  placing the viewer where an approaching driver would be standing.
- The panorama POV heading is set to the travel bearing so the camera looks
  forward toward the sign face.
- When no direction of travel is set, behavior falls back to the existing
  placement-coordinate position with a "Rotate to face the sign" hint.
- The Street View header badge now reads `Xdeg direction of travel` to
  clarify what the bearing represents.

#### CSS architecture
- Rotation is driven by a `--travel-bearing` CSS custom property on the
  handle wrapper. JS uses `style.setProperty("--travel-bearing", ...)` rather
  than overwriting `style.transform`, preserving the positioning translate
  that centers the SVG on the marker.
- The whole-map `grabbing` cursor override (`.signs-map-bearing-drag`) is
  applied to `mapRef.getDiv()` during a handle drag so the cursor stays
  consistent even when the pointer moves off the handle during a fast rotation.

### Changed
- `TRAVEL_HANDLE_LENGTH` constant updated from 40px to 100px.

---

## [2.33.0] - 2026-06-02

### Added — Sign Map Phase 3: Street View Modal Overlay

#### Street View overlay
- A new full-screen modal overlay opens when viewing any sign placement in
  Street View. Triggered via the **Street View** button in the offcanvas
  editor (existing placements only) or via **View in Street View** in the
  right-click context menu.
- The overlay is `position: fixed`, `z-index: 1095` — above the offcanvas
  (1080), tooltip (1085), and context menu (1090); below the photo lightbox
  (1100). Fades in/out via a 150ms CSS opacity transition.
- The header bar shows the sign text + arrow glyph, a direction-of-travel
  badge (e.g. `90° direction of travel`), and a close button (×).
- When no direction of travel is set, the header shows a "Rotate to face
  the sign" hint in place of the badge.
- A no-imagery footer bar appears automatically when the panorama's
  `status_changed` event fires with a non-OK status. It offers a
  **"Open in Google Maps"** deep link as a fallback.
- The panorama is destroyed (not just hidden) on close so Google's internal
  event listeners don't leak between sessions.
- Escape key closes the Street View overlay first; a second Escape then
  deselects the map marker (stepped dismiss).
- The Google Maps native Street View pegman control is now enabled on the
  map (`streetViewControl: true`).

#### CSS reset for Street View pane
- `.signs-sv-pane` carries the same `all: revert` CSS reset block as
  `#googleMap` so Bootstrap's global button styles don't corrupt Google's
  Street View navigation controls.

#### `openStreetView()` function
- `openStreetView(placementId)` — creates a `StreetViewPanorama` at the
  placement's coordinates with `pov.heading` from the stored direction of
  travel (or 0 if unset) and `pov.pitch: -5` (slightly downward, natural
  "looking at a sign" angle).
- `closeStreetView()` — removes the overlay and releases the panorama.

---

## [2.32.0] - 2026-06-02
### Added — Sign Map Phase 2c: Tooltip, Context Menu, Lightbox, Legend

#### Hover tooltip
- Hovering over any marker shows a tooltip with the sign preview (text +
  arrow), a status badge (Planned / Installed / Removed), mount type,
  location notes, coordinates, and a thumbnail if a photo has been uploaded.
- Tooltip repositions after the thumbnail loads so it never clips the image.
- Moving the cursor from the marker onto the tooltip keeps it open (200ms
  hide delay); moving away dismisses it.
- Tooltip appended to `<body>` with `position: fixed` to escape the
  `#googleMap` CSS reset block.

#### Right-click context menu
- Right-clicking any placement marker opens a custom context menu with:
  - **Edit** — opens the offcanvas editor (always available).
  - **View photo** — opens the photo lightbox (only when a photo exists).
  - **Mark as Planned / Installed / Removed** — quick status change without
    opening the editor; skips the current status. OVERSEER+ only.
  - **Get directions** — opens Google Maps in a new tab routed to the
    placement coordinates.
  - **Copy coordinates** — writes `lat, lng` to the clipboard.
  - **Delete placement** — triggers the existing delete confirmation flow.
    OVERSEER+ only.
- Menu dismisses on outside click or Escape; positioned to stay within
  viewport bounds.
- Context menu also appended to `<body>` with `position: fixed`.
- Map background right-click suppressed (browser default menu prevented).

#### Photo lightbox
- Clicking **View photo** in the context menu (or editor) opens the full-size
  placement photo in a full-screen overlay.
- Dismiss by clicking the overlay background, the × button, or pressing Escape.

#### Collapsible legend
- A **Legend & Shortcuts** section at the bottom of the sidebar sidebar panel
  (collapsed by default) shows:
  - Status dots (Planned / Installed / Removed) with labels.
  - Marker color palette swatches.
  - Keyboard shortcut reference (arrow keys = 0.5m nudge,
    Shift+Arrow = 5m nudge, Esc = deselect, Right-click = context menu).
- Bootstrap collapse with an animated chevron toggle button.

#### Listener hygiene
- `attachMarkerHoverListeners()` added — re-attaches `mouseenter`,
  `mouseleave`, and `contextmenu` to the new DOM node whenever `marker.content`
  is replaced (detail-level swap, status change, color change, save from editor,
  bulk color apply). Ensures tooltip and context menu always work after any
  marker rebuild.

### Notes
- Mobile UX gaps noted: context menu long-press is intercepted by Google Maps
  on touch devices; `mouseenter` tooltip never fires on touch. A proper mobile
  pass (bottom sheet or tap-to-peek for view-only users) is deferred to a later
  minor version.

## [2.31.0] - 2026-06-02

### Added — Sign Placement Phase 2c: Map UX + Direction per Placement

#### Compact markers + zoom-based detail swap
- Markers now render as **32px colored discs** with abbreviation text and
  an arrow badge when zoomed out, swapping to the full sign-preview block
  at close zoom. The threshold is adjustable via an on-map control
  (bottom-left pill showing current zoom level and a Detail ≥ input) and
  persists across sessions via `localStorage`.

#### Sign abbreviation system
- New `abbreviation NVARCHAR(6) NULL` column on `signs` table.
- Server-side heuristic (`computeSignAbbreviation`) auto-generates a
  2–3 character abbreviation from sign text (first-letter-of-each-word
  for multi-word, first-three-chars for single-word, digits preserved).
- Sign Builder exposes an optional override field; leaving it blank uses
  the heuristic. Compact map markers display the abbreviation.

#### Per-placement marker colors
- New `marker_color NVARCHAR(20) NULL` column on `sign_placements`.
- Eight-color preset palette (red, orange, yellow, green, teal, blue,
  purple, pink) with a swatch picker in the offcanvas editor.
- **Bulk apply** button sets color on every placement of a sign template
  in one click via `PATCH /signs/:id/placements/color`.
- Custom color overrides the status-based color on both compact discs
  and full marker borders; status remains visible in the sidebar dot.

#### Arrow direction moved to placements
- New `arrow_direction NVARCHAR(20) NULL` column on `sign_placements`.
- Backfill migration copies each placement's direction from its template.
- Arrow picker added to the map's offcanvas editor (compact 3×4 grid);
  new placements pre-fill from the template's default direction but can
  be overridden before saving.
- Arrow picker **removed from Sign Builder** — templates are now
  direction-agnostic; one "DROP-OFF / PICKUP" template serves all
  directional variants as separate placements.
- `getSignPlacements` and `getSignPlacementById` now read
  `p.arrow_direction` instead of `s.arrow_direction`.

#### Map UX polish
- Sidebar filter section now has a **"Filter placements"** header with
  filter icon and a horizontal rule separating filters from the Add
  Placement action button, making it clear the controls are filters.
- Migrated marker click listener from deprecated `click` to `gmp-click`
  event (suppresses Google Maps deprecation warning and fixes a
  drag-without-DevTools bug in some browser versions).

### Fix

## [2.30.0] - 2026-06-02

### Added — Sign Placement Phase 2b: Photo Upload

Volunteers can now attach a photo to any sign placement to document its
real-world installation, condition, or location context. Photos are stored
in Azure Blob Storage with managed-identity auth, processed for size and
EXIF privacy, and served through an authenticated proxy route.

#### Azure infrastructure
- **New Storage Account** `albanyjwparkingstg` in the `Parking` resource
  group (East US, Standard LRS, StorageV2). Anonymous blob access disabled
  at the account level; minimum TLS 1.2; soft delete enabled (7 days).
- **New blob container** `sign-photos` with private access.
- **RBAC** — App Service managed identity `albanyjwparking` granted
  `Storage Blob Data Contributor` scoped to the storage account (for
  production); developer accounts granted the same role for local dev.
- **Key Vault `ApiStorage`** — new secret `SignPhotosStorageAccount`
  (value: `albanyjwparkingstg`) plumbed into `azureConfig.js`'s
  `SECRET_MAP` and `CONFIG`.

#### New dependencies
- `@azure/storage-blob` — official Azure SDK for blob operations.
- `@azure/identity` upgrade — pinned to `4.5.0` to resolve a downstream
  `@azure/msal-node` / `@azure/msal-common` mismatch that prevented
  startup with the previously-pulled-in `4.13.1`.
- `sharp` — image resize/recompress (downscales to 1600px max, 85%
  JPEG, EXIF metadata stripped for privacy, EXIF orientation honored
  before stripping).
- `multer` — multipart/form-data parser for upload routes.

#### New backend module — `lib/blobStorage.js`
- `uploadSignPhoto(placementId, buffer)` — resize/recompress via sharp,
  upload to `sign-photos` container, return the blob name.
- `streamSignPhotoToResponse(blobName, res)` — stream blob bytes
  directly to an Express response with `Cache-Control: private, max-age=3600`.
- `deleteSignPhoto(blobName)` — best-effort delete via `deleteIfExists`.
- `processImage(buffer)` — exposed for potential reuse; sharp pipeline
  with EXIF rotate → resize → JPEG encode.
- `checkBlobAccess()` — debugging/health helper.
- Uses `DefaultAzureCredential` (managed identity in production, Azure
  CLI credentials locally via `az login`). No connection strings stored
  anywhere; auth is entirely identity-based.

#### New backend routes (`routes/signsRoutes.js`)
- **`POST /signs/placements/:placementId/photo`** *(manageSigns)* —
  Multipart upload accepting any image type sharp handles (jpeg, png,
  webp, heic, gif, avif, tiff). 12 MB hard cap on input; processed
  output is typically 200-500 KB. Replaces any existing photo and
  best-effort deletes the old blob.
- **`GET /signs/placements/:placementId/photo`** *(viewSigns)* —
  Auth-gated proxy that streams the blob's bytes. Photo URLs are
  never exposed directly to the browser; the proxy looks up the
  blob name from the DB row at request time.
- **`DELETE /signs/placements/:placementId/photo`** *(manageSigns)* —
  Removes both the blob (best-effort) and the DB column. Returns
  success even if the DB column was already null (idempotent).

The existing `DELETE /signs/placements/:placementId` route now also
best-effort deletes the photo blob before removing the row, preventing
orphan blobs from accumulating when placements are deleted outright.

#### New DB layer functions (`lib/dbSync.js`)
- `setSignPlacementPhoto(placementId, blobName)` — updates `photo_url`
  to the new blob name and touches `updated_at`.
- `clearSignPlacementPhoto(placementId)` — sets `photo_url` back to
  NULL when a photo is removed.

The existing `photo_url` column was repurposed (no schema change): it
now stores just the blob name (e.g. `42-1748812345.jpg`), not a full
URL. The proxy route assembles the URL at request time so no blob
endpoints leak into rendered HTML.

#### UI — Photo section in offcanvas placement editor
- **No-photo state:** dashed-border drop zone with a camera icon
  ("Add photo — Drop an image or click to choose").
- **Has-photo state:** thumbnail (up to 280px tall, full width of
  panel), with **Replace** and **Remove** buttons below.
- **Uploading state:** spinner with "Uploading and processing…" label.
- **Error state:** inline red text under the section.
- **Drag-and-drop** — drop a photo file from the OS file manager onto
  the drop zone; visual feedback (blue border) while dragging.
- **Cache-busting** — a session-scoped counter is appended as a query
  string to the proxy URL so replaced photos show immediately without
  a full page reload (the proxy itself sets `Cache-Control: max-age=3600`
  so unchanged photos still cache efficiently).
- **View-only mode** (REGISTERED / KEYMAN) — thumbnail visible when
  a photo exists; no upload/replace/delete controls; a "No photo for
  this placement" message appears in lieu of the drop zone when empty.

#### `azureConfig.js`
- `SIGN_PHOTOS_STORAGE_ACCOUNT` added to `SECRET_MAP` (maps to Key
  Vault secret `SignPhotosStorageAccount`) and to the `CONFIG` object
  with `.env` fallback. Boot log now reports `signPhotosConfigured: boolean`.

#### `.env` (developer setup)
  A new variable for local development:
  env

## [2.29.1] - 2026-06-02

A polish + bugfix release on top of 2.29.0's Sign Placement System. No schema
changes, no new features — purely cleanup of the map UX and the surrounding
CSP / config plumbing surfaced once real users started clicking around.

### Added
- **Custom Google Maps Map ID** (`6261df670165b61fc3ae73a4`) wired into
  `signsMap.js`, replacing the placeholder `DEMO_MAP_ID`. Configured via
  Cloud Console with POI categories (business, restaurants, gas stations,
  banks, etc.) hidden, keeping the convention-area map clean.
- **Keyboard nudging** for selected sign placements on `/signs/map`:
  - Click a marker → it gets a yellow halo with a pulsing dashed ring,
    visible until deselected.
  - **Arrow keys** nudge ~0.5m per press (fine adjustment).
  - **Shift+Arrow** nudges ~5m per press (coarse positioning).
  - **Esc** or clicking the map background deselects.
  - Each nudge debounces a 400ms PUT save to the server; in-flight saves
    serialize so rapid keypresses can't race.
  - Editor inputs (`#editorLat` / `#editorLng`) update live when the
    nudged placement is the one being edited.
  - Selection survives the offcanvas editor open/close cycle.
  - Selection survives drag operations — the marker stays keyboard-active
    immediately after release without needing a fresh click.
  - View-only roles (REGISTERED / KEYMAN) can't nudge — `canManage`
    short-circuits the handler.

### Changed
- **`GOOGLE_MAPS_API_KEY`** plumbed through `src/config/azureConfig.js`
  (`SECRET_MAP` entry mapping the Key Vault secret `GoogleMapsApiKey`,
  plus the `CONFIG` object with `.env` fallback). Startup log now reports
  `googleMapsConfigured: boolean` so it's obvious whether the key is
  reaching the server.
- **Map defaults to roadmap** instead of hybrid/satellite — vector-map
  satellite tiles render with washed-out colors under custom Cloud Console
  styles; the Map / Satellite toggle is still available for users who want
  satellite manually.
- **Template picker dropdowns** (both the sidebar status filter and the
  offcanvas editor's "Sign template" select) now show the arrow direction
  Unicode glyph and `(#id)` suffix beside each `sign_text`. Resolves
  the "six identical PARKING entries" problem when one template name has
  multiple arrow variants. Description appears as `— text` when set.
- **`style-src` CSP**: dropped the per-request nonce from the `style-src`
  directive in `index.js`. When both `'unsafe-inline'` and a nonce are
  present, browsers ignore `'unsafe-inline'` — which broke Google Maps'
  internal inline-style writes. The nonce was redundant since
  `'unsafe-inline'` was already permitted; removed it to restore inline-
  style fallback for libraries that depend on it. Nonce stays on
  `script-src` (where it actually matters for security).
- **`script-src` CSP**: added `'wasm-unsafe-eval'` to allow the Google
  Maps vector renderer to compile WebAssembly. Required for any vector
  map with a `mapId` set. Scope is limited to WebAssembly only — does
  NOT enable general `eval()` or `new Function()`.
- **`connect-src` CSP**: added `data:` (both prod and dev) so the Maps
  worker can fetch its embedded data-URI pixel resources.

### Fixed
- **Google Maps control rendering** — global `button` styles from
  `styles.css` (padding, box-shadow, `box-sizing: border-box`) were
  leaking into Google's internal control DOM, producing pill-shaped
  zoom buttons and visually corrupted icons. Added an aggressive CSS
  reset scoped to `#googleMap` (including `all: revert`,
  `box-sizing: content-box`, and selector specificity that beats global
  `button { ... }` rules without `!important`).
- **Doubled bottom-right map controls** — vector maps enable several
  controls by default that raster maps don't, including a "Map camera
  controls" button that appears above the zoom stack. Suppressed via
  explicit per-control options: `cameraControl: false`,
  `panControl: false`, `rotateControl: false`, `scaleControl: false`,
  `fullscreenControl: false`. The result is a clean Map/Satellite toggle
  top-left and a zoom +/- stack bottom-right, nothing else.
- **Offcanvas editor z-index** — the site navbar sits at `z-index: 1050`,
  above Bootstrap's default offcanvas `z-index: 1045`, causing the navbar
  to bleed through the editor panel. Bumped `.signs-placement-offcanvas`
  to 1080 and `.offcanvas-backdrop.show` to 1075.
- **Crosshair cursor in placing mode** — Google Maps writes inline
  cursor styles to `.gm-style`, overriding the class-level
  `.signs-map-placing { cursor: crosshair }` rule. Broadened the
  selector to target `.gm-style` and its direct children, winning the
  specificity battle without `!important`.
- **Keyboard nudging after a drag** — `document.addEventListener("keydown", ...)`
  was on the bubble phase, but Google Maps' internal DOM captures
  keyboard events on its container and stops their propagation, so the
  handler never fired until the user clicked elsewhere to move focus.
  Switched to the **capture phase** (`useCapture: true`) so the handler
  runs on the way down the tree, before Maps swallows the event. Now
  arrow keys work immediately after a drag without needing a sidebar click.
- **Drag-then-deselect race** — the map background's "click → deselect"
  handler was firing on the synthetic click that some browsers emit
  immediately after `dragend`, clearing the selection that the dragend
  handler had just re-set. Added a 300ms timestamp guard on the map-click
  handler that suppresses deselection during the post-drag window.

### Notes
- The Google Cloud Console style for the new Map ID must be **published**
  (not just saved as a draft) for changes to propagate. Propagation can
  take a few minutes; incognito + DevTools "Disable cache" bypasses any
  client-side caching during testing.
- The Map ID associated style currently has Roadmap as the base. Switching
  to Satellite/Hybrid as the base later requires a re-publish of the
  associated style; the code defaults to `roadmap` mapTypeId regardless.

## [2.29.0] - 2026-06-01

A major new feature area: the **Sign Placement System** for managing the
directional placards placed around the convention area (parking, lot status,
overflow routing, etc.). This release covers both Phase 1 (templates + library)
and Phase 2 (satellite-map placement). Phase 3 will add a bearing-tracked
Street View overlay; Phase 2b will add photo upload via Azure Blob Storage.

### Added — Schema
- **`signs` table** — reusable sign templates (`sign_text`, `arrow_direction`,
  optional `description`, audit columns, `is_archived` BIT for soft delete).
- **`sign_placements` table** — geographic instances of a template with
  `latitude`/`longitude` (`DECIMAL(10,7)`, ~1cm precision), nullable `heading`
  (compass bearing the sign faces — for the Phase 3 Street View overlay),
  `location_notes`, `status` (`planned`/`installed`/`removed`),
  `mount_type` (`cone`/`a-frame`/`existing-structure`, nullable), optional
  `photo_url`, and full install/remove audit trail.
- **`arrow_direction` allowed values** — `up`, `down`, `left`, `right`,
  `up-left`, `up-right`, `down-left`, `down-right`, `up-then-left`,
  `up-then-right`, `destination`, or null. Enforced via CHECK constraint.
- **`mount_type` allowed values** — `cone`, `a-frame`, `existing-structure`,
  or null. Enforced via CHECK constraint.
- FK from `sign_placements.sign_id` to `signs.sign_id` survives template
  archival so historical placements remain valid.

### Added — RBAC
- **`viewSigns`** — REGISTERED, KEYMAN, OVERSEER, ASSISTANT_ADMIN, ADMIN.
- **`manageSigns`** — OVERSEER, ASSISTANT_ADMIN, ADMIN.
- DESK explicitly does not see signs (scoped to attendance and account creation).

### Added — Sign Library *(`/signs`, REGISTERED+)*
- Card grid showing each template's preview (text + arrow + destination pin),
  description, and placement count.
- Live search/filter across sign text and description.
- Edit and Archive buttons surface only for users with `manageSigns`.
- Archiving a template is a soft delete — existing placements survive and the
  template stops appearing in the library or the map's template picker.

### Added — Sign Builder *(`/signs/builder` and `/signs/builder/:id`, OVERSEER+)*
- Live preview that updates as the user types and clicks arrow buttons.
- 4-row arrow picker grid:
  - Row 1: ↖ ↑ ↗ (up-left, up, up-right)
  - Row 2: ← ⊘ → (left, no-arrow, right)
  - Row 3: ↙ ↓ ↘ (down-left, down, down-right)
  - Row 4: ↰ ↱ 📍 (up-then-left, up-then-right, destination pin)
- The destination pin is rendered as a FontAwesome `fa-location-dot` icon
  (not Unicode) for consistent cross-platform appearance.
- Clicking the active arrow a second time deselects it.
- AJAX save to POST `/signs` (new) or PUT `/signs/:id` (edit); redirects to
  the library on success.

### Added — Sign Map *(`/signs/map`, REGISTERED+ view, OVERSEER+ edit)*
- Google Maps satellite + hybrid view of all non-archived placements as
  `AdvancedMarkerElement` DOM markers rendering the actual sign preview block.
- Status-coded marker borders: gray (planned), green (installed), red (removed).
- **Click-to-place** workflow — OVERSEER+ clicks "Add placement", clicks the
  map to drop a pin, then picks a template in the offcanvas editor.
- **Drag-to-reposition** — dragging a marker autosaves the new coords on
  drag-end; rejected saves snap the marker back.
- **Offcanvas editor** (slides in from the right) — edit status, mount type,
  heading (0–360°, optional), location notes; or delete. Read-only audit line
  showing `created_by` / `installed_by`.
- **Filters** — status chips (All / Planned / Installed / Removed) and
  template dropdown filter the markers and the sidebar list in tandem.
- **Sidebar placement list** synced to current filters; clicking a row
  opens the editor for that placement.
- View-only mode for REGISTERED / KEYMAN — drag disabled, no edit/delete.
- Graceful fallback when `GOOGLE_MAPS_API_KEY` is not configured — page
  loads with a warning panel in place of the map.
- Bootstrap JSON loaded via `<script type="application/json">` (CSP-safe;
  no inline JS, no API key in static HTML).

### Added — Routes (`routes/signsRoutes.js`)
- GET `/signs`, GET `/signs/builder`, GET `/signs/builder/:id`,
  GET `/signs/map` — render pages.
- POST `/signs`, PUT `/signs/:id`, DELETE `/signs/:id` — template CRUD (JSON).
- GET `/signs/:id/placements`, POST `/signs/:id/placements`,
  PUT `/signs/placements/:id`, PATCH `/signs/placements/:id/status`,
  DELETE `/signs/placements/:id` — placement CRUD (JSON).
- The `signsRouter` factory accepts `googleMapsApiKey` and `defaultMapCenter`
  dependencies from `index.js`.

### Added — DB layer (`lib/dbSync.js`)
- New SIGNS section: `getSigns`, `getSignById`, `createSign`, `updateSign`,
  `archiveSign`, `getSignPlacements` (filters by signId / status; excludes
  archived templates by default), `getSignPlacementById`,
  `createSignPlacement`, `updateSignPlacement`,
  `updateSignPlacementStatus` (auto-syncs `installed_by` / `installed_at` /
  `removed_at` audit columns based on the destination status),
  `deleteSignPlacement`.

### Added — Config
- **`src/config/azureConfig.js`** — `GOOGLE_MAPS_API_KEY` added to
  `SECRET_MAP` (mapped from Key Vault secret `GoogleMapsApiKey`) and to
  the `CONFIG` object with `.env` fallback. Boot log now reports
  `googleMapsConfigured: boolean`.
- **`index.js`** — passes `config.GOOGLE_MAPS_API_KEY` and a
  `defaultMapCenter` (MVP Arena: lat 42.6485, lng -73.7490, zoom 17) to
  the `signsRouter` factory.

### Added — Navigation
- **Sitemap** (`src/config/sitemap.json`) — new "Signs" group containing
  Sign Library, Sign Builder, and Sign Map entries with appropriate
  `permission` gates.
- **Header — Resources dropdown** — Sign Library link added below Maps,
  gated by `viewSigns`.
- **Header — Oversight dropdown** — new "Signs" category between Reports
  and Scheduling with Sign Library and Sign Builder links, conditional on
  the appropriate permission.
- **Oversight Tools page** — Signs section between Reports and Scheduling
  with Sign Library and Sign Builder cards. Mobile section-jump dropdown
  and desktop sidebar both updated.

### Changed — CSP (`index.js`)
- `script-src` adds `https://maps.googleapis.com` and `https://maps.gstatic.com`.
- `img-src` adds `blob:`, `https://maps.googleapis.com`, `https://maps.gstatic.com`,
  `https://*.googleapis.com`, `https://*.gstatic.com`, and
  `https://streetviewpixels-pa.googleapis.com`.
- `connect-src` (dev) adds the same Maps origins. Prod already permits
  `https:` broadly so no production change is required.
- New `worker-src: 'self' blob:` directive — Google Maps uses blob-URL
  Web Workers internally.

### Fixed
- **`signsBuilder.ejs` content swap** — the file was initially created with
  the contents of `signsList.ejs`, which caused
  `ReferenceError: signs is not defined` on every visit to `/signs/builder`.
  Replaced with the correct sign builder markup.
- **`signsBuilder.js` IIFE typo** — final-line `};)();` was a syntax error
  that prevented the entire script from running, leaving the live preview
  and arrow picker non-functional. Fixed to `})();`.

### New files
- `routes/signsRoutes.js`
- `views/authentication_and_accounts/signsList.ejs`
- `views/authentication_and_accounts/signsBuilder.ejs`
- `views/authentication_and_accounts/signsMap.ejs`
- `public/js/signsList.js`
- `public/js/signsBuilder.js`
- `public/js/signsMap.js`
- `public/styles/signs.css`

## [2.28.0] - 2026-05-29

### Added
- **Maps page** — new authenticated page at `/maps` (REGISTERED+, `viewMaps` permission).
  - Fetches subfolder structure from OneDrive via Microsoft Graph API and renders
    each subfolder as a section heading with file tiles beneath it.
  - Each tile shows the filename, OneDrive file description, last-modified date,
    and file size. View/Download button links to the OneDrive file.
  - **ScribbleMaps integration** — each subfolder can contain a `_meta.json` sidecar
    file mapping filenames to `scribbleUrl` and `embedUrl` entries. Files with a
    `scribbleUrl` get an Interactive Map button. Files with an `embedUrl` render a
    live map preview panel on the left side of the tile (iframe scaled to 120px
    via `position: absolute` + `transform: scale(0.333)`); clicking the preview
    opens the ScribbleMaps link in a new tab.
  - `_meta.json` content fetched via Graph `/drive/items/{id}/content` endpoint
    (bearer token auth — works correctly with service principal app-only tokens).
  - Empty subfolders are silently hidden (no heading rendered).
  - Graceful error state if OneDrive is unreachable.
- **`listOneDriveFolder()`** added to `lib/graphClient.js` — lists immediate
  subfolders of a given drive path and returns them as `DriveFolderSection[]`,
  each containing `DriveFileItem[]` with `scribbleUrl` and `embedUrl` merged
  from `_meta.json`.
- **`routes/mapsRoutes.js`** — new router factory wired into `index.js`.
- **`views/maps.ejs`**, **`public/styles/maps.css`**, **`public/js/maps.js`** — new files.
- **Maps entry in `sitemap.json`** — Resources group, `minRole: REGISTERED`,
  `permission: viewMaps`.
- **CSP `frame-src`** updated to allow `https://www.scribblemaps.com` and
  `https://widgets.scribblemaps.com`.

### Changed
- Tile grid column breakpoints changed from `col-sm-6` to `col-lg-6` so tiles
  with embed previews stay full-width on narrow viewports.

## [2.27.1] - 2026-05-29

### Fixed
- **Oversight structure rename refactor — completed.** Cleans up the
  collateral damage from the prior global find/replace of "hierarchy" /
  "command hierarchy" / "chain of command" → "oversight structure".
  - **SQL table name** in every oversight structure query was mangled as
    `dbo.oversight structure` (literal space, broken syntax). Every CRUD
    operation against the oversight structure tree was failing at the DB
    layer. Fixed 5 query call sites in `dbSync.js` to use the new
    snake_case `dbo.oversight_structure` (also covered for the `demo.`
    schema via the automatic `dbo.` → `demo.` rewrite in `lib/sql.js`).
  - **Broken CSS rule** `.db-oversight structure {` (literal space in the
    selector — invalid CSS) silently never applied. The dashboard oversight
    tree was missing its parent container styles entirely. Fixed to
    `.db-oversightstructure {` in `index.css`.
  - **Two runtime bugs in `views/index.ejs`** in the dashboard oversight
    card: `typeof oversight_structure` checked a variable that doesn't exist
    (the actual variable was `oversightstructure`, so the empty-state check
    always evaluated as defined and fell through), and `oversightructure.forEach`
    was a typo (missing `s`) that threw `ReferenceError` for every logged-in
    user viewing the dashboard. Both fixed.
  - **Numerous missing spaces** from the original find/replace concatenating
    "oversight structure" against the next word (`oversight structurenode`,
    `oversight structureAPI`, `oversight structureGET error:`,
    `oversight structuredelete error:`, `No oversight structureconfigured yet.`,
    etc.). Fixed across `oversightRoutes.js`, `oversightStructure.js`,
    `oversightStructure.ejs`, `oversightTools.ejs`, `index.ejs`,
    `sitemap.json`, `README.md`, `OVERSIGHT_GUIDE.md`.
  - **Stale "chain of command" comments** in `oversightStructure.css`,
    `index.css`, `oversightStructure.js`, `views/index.ejs`, and `README.md`
    (3 places in the project-structure tree) all updated to refer to oversight
    structure.
  - **RBAC concept un-polluted.** The original global rename wrongly caught
    `RBAC role hierarchy` (a separate concept from the parking-team org
    structure) in six places. Reverted in `roles.js` (file-header JSDoc +
    `ROLE_HIERARCHY` JSDoc), `oversightRoutes.js` (one comment in the
    role-assignment handler), `README.md` (database section: scheduling
    hierarchy), `OVERSIGHT_GUIDE.md` (Timelines section: schedule hierarchy,
    plus two missing-space lines under the Oversight Structure section), and
    `CHANGELOG.md` (the Pre-2.1.0 RBAC entry). The `ROLE_HIERARCHY` constant
    itself and the `roleHierarchy` template variable in `adminRoles.ejs` were
    already correctly preserved.

### Changed
- **Renamed three `dbSync.js` functions** to drop the legacy "Hierarchy" naming:
  - `addHierarchyNode` → `addOversightStructureNode`
  - `saveHierarchyOrder` → `saveOversightStructureOrder`
  - `deleteHierarchyNode` → `deleteOversightStructureNode`
  - All import and call sites in `oversightRoutes.js` updated accordingly.
- **Renamed variable `rawHierarchy`** → `rawOversightStructure` in
  `index.js`, `oversightRoutes.js`, and
  `views/authentication_and_accounts/oversightStructure.ejs`.
- **Renamed template variable `oversightstructure`** → `oversightStructure`
  (proper camelCase) in `index.js` and `views/index.ejs` (3 use sites).
- Added missing JSDoc to `deleteOversightStructureNode` per project convention.

### Removed
- **Duplicate oversight structure route block** in `oversightRoutes.js`.
  The file contained two complete sets of identical routes
  (`GET /oversight/tools/oversightstructure`, `POST /add`, `POST /save`,
  `DELETE /:id`) around line 4329 and again around line 5530. Express matches
  in registration order, so the first set was active and the second was dead
  code. The first set had materially worse code: no temp-id filtering in `/save`,
  no type coercion, mangled error labels, and was additionally broken by the
  rename (still called the removed `saveHierarchyOrder`). The second block was
  kept — it has proper `Array.isArray` validation, filters to positive IDs
  before saving (so unsaved temp nodes are correctly skipped), coerces all
  values via `Number()`, and ships full `@requires` JSDoc tags.

## [2.27.0] - 2026-05-28

### Added
- **Guided tour system** — Shepherd.js v15.2.2 mini-tours added to all 13
  oversight tool pages. Each page has a **Take a tour** button (top-right
  of the page header) that launches a step-by-step walkthrough tailored to
  that page's content and state.
  - Tours are context-aware: steps are conditionally included based on
    what is present on the page (e.g. the Timelines sessions tour skips
    shift and assignment steps when no shifts exist yet).
  - **Modal-integrated tour steps** — form modals on the Timelines page
    open programmatically during the tour so overseers can see every field.
    Modal save/delete buttons are neutralized during tour preview via the
    `.tour-preview` class (Cancel remains active).
  - **Three-tier z-index stack** ensures tours work correctly alongside
    Bootstrap modals: Shepherd overlay (9999), tour-preview modal (10000),
    Shepherd tooltip (10001).
  - `tourBase.js` — shared factory for `createTour()` and standard button
    sets (`startButtons`, `navButtons`, `finishButtons`).
  - Tour files: `volunteersTour.js`, `rolesTour.js`, `timelinesTour.js`
    (three sub-paths: event types, days, sessions+shifts), `schedulerTour.js`,
    `schedulerReportTour.js`, `oversightToolsTour.js`, `campaignTour.js`,
    `invitationTrackerTour.js`, `attendanceCheckinTour.js`,
    `attendanceReportTour.js`, `locationsTour.js`, `crewMatrixTour.js`,
    `reportsTour.js`.
- **Timelines — modal forms** — all six inline card panels on the Timelines
  page converted to Bootstrap modals:
  - Event Type (`#etFormPanel`) — `modal-lg`, secondary header
  - Convention Day (`#dayFormPanel`) — `modal-xl`, warning header
  - Copy Day (`#copyDayFormPanel`) — `modal-xl`, info header
  - Session (`#sessionFormPanel`) — `modal-lg`, secondary header
  - Shift (`#shiftFormPanel`) — `modal-xl`, primary header
  - Assign Location (`#assignFormPanel`) — `modal-lg`, success header
  - All modals position Delete on the far left of the footer (`me-auto`),
    separated from Save/Cancel. Cancel closes via `data-bs-dismiss`.
- **`public/css/tours.css`** — all tour and modal z-index rules:
  - `.shepherd-element.ajwp-tour-step` — step container at z-index 10001
  - `body.shepherd-has-active-tour .modal` — tour-active modals at 10000
  - `body.shepherd-has-active-tour .modal-backdrop` — suppressed during tours
  - `.modal.tour-preview .modal-footer .btn:not([data-bs-dismiss])` —
    disables Save/Delete buttons in tour-preview modals

### Changed
- `timelines.js` — all eight `openPanel()` callers updated to pass a focus
  element as the second argument; focus fires via `shown.bs.modal` event
  instead of immediately after the call.
- Shepherd CSS and `tours.css` added to all 13 tour-enabled pages.

## [2.26.0] - 2026-05-27

### Added
- **SMS opt-in/out management** — new SMS Management tab on the Volunteer
  Account Oversight page (`/editVolunteer?tab=sms`), visible to ASSISTANT_ADMIN+.
  - Filterable table of all volunteers with SMS status (Opted In / Opted Out / Never),
    opt-in timestamp and source, opt-out timestamp.
  - Manual toggle buttons — opt a volunteer out or re-opt them in without going
    through the Twilio STOP/UNSTOP flow. Mirrors the Twilio webhook behavior:
    opt-out sets `sms_opted_in = 0`, re-opt-in sets `sms_opted_in = 1` with
    `source = 'admin'`.
  - Search by name + filter by status. Tab loads data lazily on first activation.
  - Auto-activates when navigated to via `?tab=sms` query param.
- **SMS Management card** on Oversight Tools hub (Volunteer Management section,
  ASSISTANT_ADMIN+) linking directly to `/editVolunteer?tab=sms`.
- **Campaign Center soft warning** — when SMS channel is selected and one or
  more recipients have opted out, a confirmation dialog shows the count before
  sending. Does not block the send — just informs.
- **`getVolunteersForSmsManagement()`** — new `dbSync.js` function returning
  all active volunteers with full SMS status columns.
- **`setVolunteerSmsOptOutManual()`** — new `dbSync.js` function for oversight
  manual opt-in/out toggle.
- **`sms_opted_out`** added to `getVolunteersForMessaging()` return and
  `data-sms-opted-out` attribute on Campaign Center volunteer list items.
- New routes: `GET /oversight/tools/sms-management`,
  `POST /oversight/tools/sms-management/toggle`.
  
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
- **CSP fix** — `db-oversightstructure-node` `--depth` CSS custom property moved from
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
  - Oversight structure (5-node tree)
  - 7 congregations, 7 roles, 3 message templates, 1 invitation batch with
    8 invitations
  - Safe to re-run — clears all tables in FK-safe order before inserting
- **`scripts/anonymizeDemo.sql`** — direct SQL `UPDATE` statements replacing
  real volunteer first names, last names, congregation city names, location
  names, addresses, and oversight structure titles with fictional alternatives
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
  - **Oversight Structure card** — read-only indented tree showing the reporting
    oversight structureconfigured by admins. Phone numbers are tap-to-call links.
- **Oversight Structure admin page** — new page at `/oversight/tools/oversightstructure`
  (ADMIN only, `manageCampaigns` permission).
  - Visual tree editor: add root nodes, add children, edit role title and
    assigned volunteer inline, delete nodes (children promoted to parent level).
  - Up / Down buttons reorder within siblings; Indent (→) / Outdent (←)
    buttons change the parent relationship.
  - **Save order** bulk-saves all changes via `POST /oversight/tools/oversightstructure/save`.
  - New nodes get temporary negative IDs; a sequential add-then-save flow
    resolves real IDs before the bulk update.
  - New files: `views/authentication_and_accounts/oversightStructure.ejs`,
    `public/js/oversightStructure.js`, `public/styles/oversightStructure.css`.
- **New DB table:** `dbo.oversightstructure` (`id`, `volunteer_id`, `parent_id`,
  `role_title`, `sort_order`) — stores the oversight structure tree.
- **New `dbSync.js` functions:** `getVolunteerDashboardDay`, `getVolunteerShiftsForDay`,
  `getOversightStructure`, `addHierarchyNode`, `saveHierarchyOrder`, `deleteHierarchyNode`.
- **New API endpoints:**
  - `GET /api/dashboard/shifts?dayId=N` — volunteer's slot assignments for one day
  - `POST /oversight/tools/oversightstructure/save` — bulk save oversight structureorder
  - `POST /oversight/tools/oversightstructure/add` — add a single oversight structurenode
  - `DELETE /oversight/tools/oversightstructure/:id` — delete a node
- **Oversight Structure** added to Oversight Tools hub (Administration section)
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
  `dept_name` so the client-side JS can apply department color pills.

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
- **Campaign Center — campaign dropdown oversightstructure**: Both the "Add to Existing"
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
- **Scheduler time bands**: all bands showing as one color because
  gap-detection found no gaps between back-to-back sessions. Now uses
  session label keywords (Pre / Morning / Lunch / Afternoon / Post) for
  color classification; gap-detection kept as fallback
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
  colored by label keyword ("Pre", "Morning", "Lunch", "Afternoon",
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
