# Architecture

Project structure and per-feature implementation notes.
See [DEVELOPMENT.md](DEVELOPMENT.md) for setup and [DATABASE.md](DATABASE.md)
for the schema reference.

---

## Project Structure

```
parking/
├── index.js                   # Server entry point, middleware, top-level routes
├── set-local-env.js           # Sets AZURE_KEY_VAULT_URL for local dev
├── nodemon.json               # Dev-mode file-watch configuration
├── Dockerfile                 # Production container build
├── .dockerignore
├── .gitignore
│
├── lib/
│   ├── alertScheduler.js      # Shift-alert scheduling engine (cron-like timer)
│   ├── capacityAlerter.js     # Event-driven capacity threshold engine (edge-triggered SMS alerts)
│   ├── blobStorage.js         # Azure Blob Storage helpers (sign photos, lesson photos, maps-files sync, published file streaming)
│   ├── dbSync.js              # All database query functions
│   ├── graphClient.js         # Microsoft Graph API client (OneDrive listing, download, upload)
│   ├── mapsSync.js            # Background + on-demand sync: SharePoint "Maps" folder -> maps-files blob container
│   ├── messaging.js           # Email + SMS delivery helpers (suppressed in demo context)
│   ├── noteAnalyzer.js        # Azure OpenAI pipeline for volunteer intake note analysis
│   ├── smsInboundAnalyzer.js  # Azure OpenAI pipeline for freeform inbound SMS analysis
│   ├── scheduleAnalyzer.js    # Schedule violation rule engine + AI enhancement layer
│   ├── passwordVer.js         # PBKDF2 hashing + verification
│   ├── publishSchedule.js     # PDF schedule generation + OneDrive upload + Blob Storage delivery
│   ├── publishSignMap.js      # Sign map PDF generation + Blob + OneDrive upload
│   ├── publishLessonsLearned.js  # Lessons Learned PDF generation + parallel Blob/SharePoint upload
│   ├── rvToken.js             # HMAC token generation for public rendezvous detail links
│   ├── sql.js                 # SQL connection pool management + demo pool routing
│   └── volunteerStatus.js     # Profile completeness checks
│
├── middleware/
│   └── demoContext.js         # Demo hostname detection + AsyncLocalStorage context wrap
│
├── routes/
│   ├── accountRoutes.js       # Login, My Account, password change
│   ├── apiRoutes.js           # Internal API endpoints (session touch, etc.)
│   ├── mapsRoutes.js          # Maps resources page — reads synced files from map_files, serves via /maps/file/:blobName (Blob Storage, no SharePoint links)
│   ├── schedulesRoutes.js     # Schedules page — OneDrive PDF listing for published day schedules
│   ├── oversightRoutes.js     # All Oversight Tools routes
│   ├── registrationRoutes.js  # Registration flow (multi-step draft)
│   ├── signsRoutes.js         # Sign Library, Sign Builder, Sign Map — templates, locations, and attachments CRUD
│   ├── countsRoutes.js        # Parking Counter tally page + count report API
│   ├── capacityAlertRoutes.js # Capacity Alerts CRUD (rules + send history)
│   ├── systemVariablesRoutes.js # System Variables management + sub-location CRUD
│   ├── lessonsLearnedRoutes.js  # Lessons Learned management + PDF proxy + batch-publish
│   ├── sitemapRoutes.js       # Public role-filtered sitemap page
│   ├── blackoutRoutes.js      # GET/POST /api/blackouts/:volunteerId (BlackoutTimeline API)
│   ├── smsWebhookRoute.js     # Twilio inbound SMS routing + freeform AI pipeline
│   ├── noteAnalysisRoutes.js  # AI note analysis (analyze, batch, accept action item)
│   ├── constraintRoutes.js    # AI scheduling constraints (pending, apply, delete)
│   ├── scheduleAnalysisRoutes.js # Schedule violation analysis + rules CRUD
│   ├── upgradeRoutes.js       # Account upgrade (email/phone → password)
│   └── validationRoutes.js    # Phone (Twilio) + email (Kickbox) validation
│
├── src/config/
│   ├── azureConfig.js         # Key Vault + SQL connection bootstrap
│   ├── privilegeRules.js      # Registration field incompatibility rules
│   ├── prodedures.js          # Stored procedure definitions
│   ├── roles.js               # RBAC permission matrix + middleware
│   ├── sitemap.json           # Page metadata for the role-filtered sitemap
│   ├── buildings.kml          # Building polygon outlines (Google My Maps KML export)
│   └── mapOverlays.js         # KML parser — returns overlay data for sign map bootstrap
│
├── views/
│   ├── index.ejs              # Home / dashboard page
│   ├── maps.ejs               # Maps resources page (synced files served from Blob Storage; no SharePoint links)
│   ├── schedules.ejs          # Schedules page (OneDrive PDF listing)
│   ├── lessonsLearned.ejs     # Lessons Learned management (KEYMAN+ submit, OVERSEER+ approve/publish)
│   ├── lessonsLearnedPdf.ejs  # Puppeteer PDF render target (secret-auth, Lessons Learned)
│   ├── lessonsLearnedResources.ejs # Lessons Learned resources/download page (OVERSEER+)
│   ├── privacy.ejs            # Privacy policy
│   ├── terms.ejs              # Terms of use
│   ├── sitemap.ejs            # Role-filtered sitemap
│   ├── partials/
│   │   ├── header.ejs         # Shared navigation header
│   │   ├── footer.ejs         # Shared footer + session keepalive
│   │   └── roleGuard.ejs      # Access-denied partial for role checks
│   ├── errors/
│   │   ├── 403.ejs            # Forbidden
│   │   └── 404.ejs            # Not found
│   ├── authentication_and_accounts/
│   │   ├── login.ejs
│   │   ├── conflictGrid.ejs
│   │   ├── myAccount.ejs
│   │   ├── resetPassword.ejs
│   │   ├── chooseContinueOrUpgrade.ejs
│   │   ├── oversightTools.ejs         # Operations hub landing page
│   │   ├── oversightStructure.ejs     # Oversight structure admin tree editor
│   │   ├── oversightPermissions.ejs   # Permission matrix editor
│   │   ├── oversightDecentlyExport.ejs
│   │   ├── adminCreateVolunteer.ejs
│   │   ├── adminRoles.ejs
│   │   ├── adminSendReset.ejs
│   │   ├── volunteerAccountOversight.ejs  # Edit Volunteer page
│   │   ├── attendanceCheckin.ejs
│   │   ├── attendanceReport.ejs
│   │   ├── bugReports.ejs
│   │   ├── campaignCenter.ejs
│   │   ├── crewMatrix.ejs
│   │   ├── decentlyImport.ejs
│   │   ├── invitationTracker.ejs
│   │   ├── inviteRespond.ejs
│   │   ├── locationsAndTasks.ejs     # Locations management (classification, sub-locations)
│   │   ├── counts.ejs                 # Parking Counter — mobile-first tally page
│   │   ├── systemVariables.ejs        # System Variables management (classifications + sub-location types)
│   │   ├── notesReport.ejs            # Notes report (intake notes + inbound SMS)
│   │   ├── contactDirectory.ejs       # Contact Directory report (name/email/phone)
│   │   ├── reports.ejs
│   │   ├── scheduler.ejs
│   │   ├── scheduleRules.ejs          # Admin page: schedule analysis rules CRUD
│   │   ├── rendezvous.ejs             # Rendezvous points landing page (day accordion + RV editor)
│   │   ├── rendezvousDetail.ejs       # Public token-gated RV detail page (no login required)
│   │   ├── schedulerReport.ejs
│   │   ├── shiftAlerts.ejs
│   │   ├── volunteerSchedule.ejs
│   │   ├── signsBuilder.ejs
│   │   ├── signsList.ejs
│   │   ├── signsMap.ejs
│   │   ├── signsMapPrint.ejs
│   │   └── timelines.ejs
│   ├── registration/
│   │   ├── createProfileLaunch.ejs
│   │   ├── emailPass.ejs
│   │   ├── personalInfo.ejs
│   │   ├── congregationInfo.ejs
│   │   ├── spiritualInfo.ejs
│   │   ├── volunteerIn.ejs
│   │   ├── notes.ejs
│   │   ├── nonProfile.ejs
│   │   ├── formSummary.ejs
│   │   └── continueRegistration.ejs
│   └── upgrade/
│       ├── upgradeStart.ejs
│       ├── upgradeName.ejs
│       ├── upgradeSend.ejs
│       └── upgradeSent.ejs
│
├── public/
│   ├── js/                    # Frontend JS modules (one file per page/feature)
│   │   ├── # ── Shared / global ──────────────────────────────
│   │   ├── bfcacheGuard.js            # Prevents bfcache stale-page issues
│   │   ├── cookieConsent.js           # Cookie consent banner
│   │   ├── mobileDropdownSafety.js    # Mobile nav dropdown touch fixes
│   │   ├── navDropdown.js             # Header navigation dropdown behaviour
│   │   ├── scrollToTop.js             # Scroll-to-top button
│   │   ├── sessionKeepAlive.js        # GET /api/session/touch heartbeat
│   │   ├── timeUtils.js               # Shared date/time formatting helpers
│   │   │
│   │   ├── # ── Dashboard ────────────────────────────────────
│   │   ├── dashboardShifts.js         # Home page day-navigator for shifts
│   │   ├── dashboardWeather.js        # Open-Meteo 3-day weather widget
│   │   ├── loginSuccess.js            # Post-login redirect handler
│   │   │
│   │   ├── # ── Registration & account ───────────────────────
│   │   ├── continueRegistration.js
│   │   ├── dobPicker.js               # Date-of-birth input with validation
│   │   ├── email-validation.js        # Kickbox email validation
│   │   ├── emailPass.js               # Email + password registration step
│   │   ├── formListeners.js           # Multi-step form navigation
│   │   ├── formSummary.js             # Registration summary page
│   │   ├── myAccount.js               # My Account page (edit, finalize, password)
│   │   ├── blackoutTimeline.js        # BlackoutTimeline SVG component (all contexts)
│   │   ├── myAccountBlackoutTimeline.js          # Mounts timeline in My Account accordion
│   │   ├── volunteerAccountOversightBlackoutTimeline.js  # Mounts timeline in VOA accordion
│   │   ├── conflictGrid.js            # Master Conflict Grid report page
│   │   ├── nonProfile.js              # Non-profile registration path
│   │   ├── passwords.js               # Password strength + toggle visibility
│   │   ├── phoneVer.js                # Twilio phone verification
│   │   ├── privilegeEnforcer.js       # Registration field incompatibility
│   │   │
│   │   ├── # ── Oversight tools ──────────────────────────────
│   │   ├── adminCreateVolunteer.js    # Admin-created volunteer accounts
│   │   ├── adminRoles.js              # Role management page
│   │   ├── adminSendReset.js          # Send password reset page
│   │   ├── attendanceCheckin.js       # Attendance check-in kiosk
│   │   ├── attendanceReport.js        # Attendance report page
│   │   ├── bugReport.js               # Bug report submission form
│   │   ├── bugReports.js              # Bug reports list/management
│   │   ├── campaignCenter.js          # Campaign messaging centre
│   │   ├── crewMatrix.js              # Crew assignment matrix
│   │   ├── decentlyImport.js          # Decently data import
│   │   ├── invitationTracker.js       # Campaign invitation tracker
│   │   ├── inviteRespond.js           # Invitation RSVP response page
│   │   ├── locationsAndTasks.js       # Locations & tasks management (classification, sub-loc panels)
│   │   ├── counts.js                  # Parking Counter tally logic (heartbeat, submit, alarms, localStorage)
│   │   ├── countReport.js             # Count Report — overview bar + per-garage stacked area charts (module)
│   │   ├── systemVariables.js         # System Variables management page (module)
│   │   ├── lessonsLearned.js          # Lessons Learned management page (submit, review, approve, publish)
│   │   ├── lessonsLearnedResources.js  # Lessons Learned resources page (batch-publish button)
│   │   ├── maps.js                    # Maps page (Blob-backed file listing, Sync Now button for admins)
│   │   ├── schedules.js               # Schedules page (OneDrive PDF listing)
│   │   ├── notesReport.js             # Notes Report: SMS cards, archived panel, AI analysis badges
│   │   ├── oversightStructure.js      # Oversight structure admin tree
│   │   ├── oversightTools.js          # Operations hub page
│   │   ├── permissionMatrix.js        # Permission matrix editor
│   │   ├── reports.js                 # Reports page
│   │   ├── shiftAlerts.js             # Shift alert configuration
│   │   ├── sitemapSearch.js           # Live search/filter for the sitemap
│   │   ├── volunteerAccountOversight.js # Edit Volunteer page
│   │   │
│   │   ├── # ── AI & Analysis ────────────────────────────────
│   │   ├── schedulerNotePanel.js      # Floating intake note panel in scheduler
│   │   ├── schedulerConstraintPanel.js  # AI scheduling constraint suggestions panel
│   │   ├── scheduleViolationsPanel.js # Schedule violations accordion (IIFE, conflict grid)
│   │   ├── scheduleRules.js           # Schedule analysis rules admin CRUD (module)
│   │   ├── conflictGridBlackoutModal.js # Read-only BlackoutTimeline modal for conflict grid (module)
│   │   │
│   │   ├── # ── Scheduler (9-file suite) ─────────────────────
│   │   ├── scheduler.js               # Core scheduler grid + state
│   │   ├── schedulerConflicts.js      # Volunteer conflict detection
│   │   ├── schedulerContextMenu.js    # Right-click context menu
│   │   ├── schedulerDomActions.js     # DOM manipulation helpers
│   │   ├── schedulerDomEvents.js      # Event listener wiring
│   │   ├── schedulerDraggable.js      # Drag-and-drop assignment
│   │   ├── schedulerHistory.js        # Undo/redo history stack
│   │   ├── schedulerReport.js         # Schedule report/PDF page
│   │   ├── schedulerTimeUtils.js      # Scheduler-specific time helpers
│   │   ├── volunteerSchedule.js       # Volunteer schedule report (my-schedule + oversight)
│   │   ├── contactDirectory.js        # Contact Directory: search + sort, no server round-trip
│   │   │
│   │   ├── # ── Rendezvous ───────────────────────────────────
│   │   ├── rendezvous.js              # Shared RV editor/viewer panel (GPS, photo, time guard)
│   │   ├── rendezvousLanding.js       # Rendezvous landing page (day accordion, filters)
│   │   │
│   │   ├── # ── Timelines ────────────────────────────────────
│   │   ├── timelines.js               # Event types / days / sessions / shifts CRUD
│   │   │
│   │   ├── # ── Signs ────────────────────────────────────────
│   │   ├── signsBuilder.js            # Sign template builder
│   │   ├── signsList.js               # Sign library grid
│   │   ├── signsMap.js                # Sign Map — Google Maps + stacked markers + location/attachment editor
│   │   ├── signsMapOverlays.js        # Shared building polygon overlay renderer (used by map + print)
│   │   ├── signsGeofence.js           # Geofencing companion (GPS tracking + proximity alerts)
│   │   ├── signsMapPrint.js           # Print-optimised map (WYSIWYG letter-portrait)
│   │   │
│   │   └── tours/                     # Shepherd.js guided tour modules
│   │       ├── tourBase.js              # Tour factory, button helpers, first-visit prompt system, registerTour API
│   │       ├── attendanceCheckinTour.js
│   │       ├── attendanceReportTour.js
│   │       ├── campaignTour.js
│   │       ├── capacityAlertsTour.js
│   │       ├── conflictGridTour.js
│   │       ├── countsTour.js            # Setup-panel / counting-panel dual path
│   │       ├── createVolunteerTour.js
│   │       ├── crewMatrixTour.js
│   │       ├── decentlyExportTour.js
│   │       ├── decentlyImportTour.js
│   │       ├── invitationTrackerTour.js
│   │       ├── lessonsLearnedTour.js
│   │       ├── locationsTour.js
│   │       ├── mapsTour.js
│   │       ├── myAccountTour.js
│   │       ├── notesReportTour.js
│   │       ├── oversightStructureTour.js
│   │       ├── oversightToolsTour.js
│   │       ├── permissionMatrixTour.js
│   │       ├── rendezvousTour.js
│   │       ├── reportsTour.js
│   │       ├── rolesTour.js
│   │       ├── scheduleRulesTour.js
│   │       ├── schedulerReportTour.js
│   │       ├── schedulerTour.js
│   │       ├── schedulesTour.js
│   │       ├── sendResetTour.js
│   │       ├── shiftAlertsTour.js
│   │       ├── signsBuilderTour.js
│   │       ├── signsListTour.js
│   │       ├── signsMapTour.js
│   │       ├── systemVariablesTour.js
│   │       ├── timelinesTour.js
│   │       ├── volunteerScheduleTour.js # Shared by /my-schedule and /oversight/tools/volunteer-schedule
│   │       └── volunteersTour.js
│   │
│   ├── styles/                # CSS files (one per page/feature)
│   │   ├── styles.css                 # Global / shared styles
│   │   ├── index.css                  # Home / dashboard page
│   │   ├── attendance.css             # Attendance check-in + report
│   │   ├── blackoutTimeline.css       # BlackoutTimeline SVG component
│   │   ├── bugReport.css              # Bug report pages
│   │   ├── campaignCenter.css         # Campaign centre
│   │   ├── conflictGrid.css           # Master Conflict Grid report
│   │   ├── scheduleViolations.css     # Violations accordion + severity groups
│   │   ├── scheduleRules.css          # Schedule analysis rules admin page
│   │   ├── notesReport.css            # Notes report page
│   │   ├── createProfileLaunch.css    # Registration launch page
│   │   ├── crewMatrix.css             # Crew matrix
│   │   ├── invitationTracker.css      # Invitation tracker
│   │   ├── maps.css                   # Maps page
│   │   ├── schedules.css              # Schedules page
│   │   ├── oversightStructure.css     # Oversight structure admin tree
│   │   ├── permissionMatrix.css       # Permission matrix
│   │   ├── rendezvous.css             # Rendezvous editor panel + landing page
│   │   ├── scheduler-categories.css   # Scheduler Categories management page
│   │   ├── reports.css                # Reports page
│   │   ├── contactDirectory.css       # Contact Directory report
│   │   ├── counts.css                 # Parking Counter tally page
│   │   ├── countReport.css            # Garage Capacity report charts
│   │   ├── systemVariables.css        # System Variables management page
│   │   ├── locationsAndTasks.css      # Locations page sub-location expansion panels
│   │   ├── lessonsLearned.css         # Lessons Learned management page
│   │   ├── lessonsLearnedPrint.css    # Lessons Learned PDF render target
│   │   ├── scheduler.css              # Scheduler grid
│   │   ├── schedulerReport.css        # Schedule report / PDF
│   │   ├── shiftAlerts.css            # Shift alerts page
│   │   ├── volunteerSchedule.css      # Volunteer schedule report
│   │   ├── signs.css                  # Sign Library, Builder, Map
│   │   ├── signsPrint.css             # Printable sign map (WYSIWYG page preview + @media print)
│   │   ├── sitemap.css                # Sitemap page
│   │   ├── volunteerAccountOversight.css  # Edit Volunteer page
│   │   ├── CSS_ARCHITECTURE.md        # CSS conventions and architecture notes
│   │   └── fontawesome/               # FontAwesome 6 (self-hosted)
│   │       ├── css/                   # fontawesome.min.css, all.css
│   │       └── webfonts/              # .woff2 font files
│   │
│   ├── css/                   # Additional CSS (loaded separately from styles/)
│   │   └── tours.css                  # Shepherd.js tour styling and z-index rules
│   │
│   ├── images/                # Static images (SVGs, JPGs for dashboard cards)
│   │
│   └── vendor/                # Third-party UMD bundles
│       ├── agnostic-draggable.js      # Drag-and-drop library (scheduler)
│       └── bootstrap/                 # Bootstrap 5 (CSS + JS bundle)
│
├── scripts/
│   ├── anonymizeSeed.js       # Anonymizes + seeds the demo schema with fake data
│   ├── seedDemo.js            # Populates the demo schema with realistic data
│   ├── append-env-secrets.ps1 # Appends Key Vault secrets to .env
│   ├── azure-app-setup.ps1    # Azure App Service provisioning script
│   └── migrations/            # SQL schema migrations (single file targeting both schemas with GO between batches)
│       ├── README.md          # Migration convention docs + migration log
│       ├── inboundSMSMessages.sql     # inbound_sms_messages table
│       ├── ai_blackout_suggestions.sql # ai_blackout_suggestions table
│       ├── schedule_violations.sql    # schedule_violation_runs + schedule_violations tables
│       └── schedule_analysis_rules.sql # schedule_analysis_rules table
│       ├── parking_counts.sql         # parking_counts + extra_parking_count BIT on volunteer_in
│       ├── parking_counts_is_manual.sql # adds is_manual BIT to parking_counts
│       ├── system_variable_lists.sql  # system_variable_lists + location_sub_locations + FK additions
│       ├── lessons-learned.sql        # lessons_learned + lessons_learned_photos + lessons_learned_reports; lesson-department seed
│       ├── lessons-learned-archive.sql # archive schema for removed lessons
│       └── lessons-learned-audience.sql # is_internal / is_committee flags + CK_ll_audience
│
├── docs/
│   └── OVERSIGHT_GUIDE.md     # End-user guide for oversight staff
│
├── .github/workflows/
│   ├── main.yml               # CI/CD: build + push to Azure Container Registry
│   ├── docker-image.yml       # Docker build test
│   └── main_albanyjwparking.yml
│
└── CHANGELOG.md
```

---

## Key Conventions

- **4-space indentation** throughout
- **ES Modules** (`import`/`export`) — no CommonJS
- **JSDoc** on all functions
- **No inline scripts or styles** — all JS in `public/js/`, all CSS in `public/styles/`
- **No EJS logic** — formatting and data shaping done in routes before render
- **CSP compliant** — `style-src` carries `'unsafe-inline'` (required for Google Maps
  internal style writes). All app JS lives in `public/js/`, all CSS in `public/styles/`.
  No inline `<script>` blocks, no inline event handlers. SVG presentation attributes
  (`stroke=`, `fill=`) and CSS custom properties (`style.setProperty`) are used in
  preference to `element.style.x = ...` where the distinction matters.
- **Schedule violation analysis:** `lib/scheduleAnalyzer.js` uses a two-layer model.
  The rule engine runs first (deterministic; violations have `confidence = null`). The
  AI layer receives all rule-engine violations plus schedule context and returns enhanced
  severity/confidence/suggestion/question per violation in a single API call. Results are
  cached by SHA-256 schedule hash; re-analysis is skipped unless `force: true` is passed.
- **AI rules injection:** `schedule_analysis_rules` rows are injected at the TOP of the
  AI system prompt as "MANDATORY SCHEDULING RULES" before all other instructions. Rules
  are prefixed `Rule N:` so AI suggestions can cite which rule applied. Excluded from
  the user-content JSON to prevent duplication.
- **Conflict grid context menu:** right-click on `SC`, `X/PC`, or `SC/PC` cells opens a
  positioned context menu. Cells carry full context via `data-*` attributes set during
  render (`data-cg-state`, `data-vol-id`, `data-vol-name`, `data-shift-id`,
  `data-shift-label`, `data-day-id`, `data-day-label`, `data-sc-shifts` JSON). Actions
  call `DELETE /api/conflict-grid/assignment`; `window.cgRefresh()` re-fetches and
  re-renders the grid after each action.
- **BlackoutTimeline read-only:** the existing `BlackoutTimeline` component accepts
  `{ readOnly: true }` to suppress all editing controls. `conflictGridBlackoutModal.js`
  (ES module) mounts it this way and exposes `window.showBlackoutModal(volId, volName)`
  for use by the non-module `conflictGrid.js` IIFE and `scheduleViolationsPanel.js`.
- **Pre/post session detection:** shift midpoint `(start+end)/2` is compared against
  session `min(startMin)` / `max(endMin)` from `getConventionDaysWithSessions()`.
  The `program_start` / `program_end` columns on `convention_days` are display-only
  and must not be used for scheduling logic (historically unreliable).
- **MSSQL TIME columns** return as epoch-anchored `Date` objects — always use
  `getUTCHours()`/`getUTCMinutes()`
- **Sign Map architecture (2.41.0+):** locations → attachments model. Each map marker
  represents a physical mounting point with one or more attached signs rendered as a
  vertical stack. `gmpDraggable: true` with Shift-gate via `attachLocationShiftGate` /
  `attachArrowShiftGate` helpers (capture-phase `pointerdown`, blocks unless
  `Shift` held at zoom ≥ `MIN_ZOOM_FOR_DRAG`). Compact markers (zoom < 19) show
  mount-type FontAwesome icons with count badge (45° NE); hover-to-expand with 250/150 ms
  debounce (desktop only) via `bindHoverCollapse` helper + map-level `mousemove` safety
  net. Click-after-drag suppression (300 ms threshold) prevents accidental editor opens.
  Traffic arrows anchor at the tip (`transform-origin: 50% 9.375%`).
- **Map layers (2.49.0):** four toggleable layers in the sidebar (Filters & Layers):
  Traffic arrows (on by default), Sign facing (off), Sign count (on), Placement ID (on).
  Count and Placement ID toggles are auto-disabled when Sign facing is active (facing
  mode has its own per-pill counts). Layer state is tracked in `layerState` and exposed
  via `signsMapApi.toggleLayer()` / `isLayerVisible()`.
- **Sign facing (2.49.0):** when enabled, location markers at zoom ≥ 17 display radial
  chevron pills indicating which direction each group of signs faces (bearing derived
  from linked traffic arrows). The 110×110 facing layout uses `margin-bottom: -55px` +
  `transform: none` for anchor centering (the inherited `translateY(-50%)` is neutralized).
  The wrapper is `pointer-events: none` with `auto` on pills, center disc, and hover
  overlay to prevent neighbor occlusion. Pill offsets scale smoothly with zoom via the
  `--facing-zoom-scale` CSS custom property (`2^(zoom − 19)`, clamped `[0.5, 1.0]`).
  Group-level hover: hovering a pill shows only that bearing's signs; hovering the center
  disc shows all. Each sign row includes an inline facing chevron.
- **Placement IDs (2.49.0):** each location receives a user-facing ID (`P1`, `P2`, …)
  computed as `DENSE_RANK() OVER (ORDER BY location_id)` in `getSignLocations()` — no
  stored column; numbering is always gapless and shifts on delete. Badges render at 135°
  (SE) from marker center on compact, full, and facing markers.
- **Overlay labels:** building/landmark polygon labels (`signsMapOverlays.js`) render at
  `zIndex: -100000`, well below all sign and arrow markers.
- **Printable sign map** (`/signs/map/print`): WYSIWYG page preview at letter-portrait
  proportions (7 in × 7 in map area). Five layer toggles (Arrows, Expand, Facing, Count,
  Placement ID) mirror the main map's layer system. Four-state placement markers: compact
  disc (Expand OFF), full pill rows (Expand ON), radial chevrons (Facing ON), radial sign
  pills by bearing (Facing + Expand ON). Traffic arrow chevrons, connector polylines
  (arrow ↔ location), and building polygon overlays render on the print map. Legend shows
  sign types (colored pills), status dots, and location count. `@media print` hides
  toolbar/nav and fills the page. OVERSEER+ users can publish a PDF snapshot to SharePoint
  and Blob Storage via the toolbar Publish button. Files: `signsMapPrint.ejs`,
  `signsMapPrint.js`, `signsPrint.css`, `publishSignMap.js`.
- **Sign categories:** `sign_category` column on `signs` (parking / accessible / dropoff /
  info / warning). Each category maps to a FontAwesome icon and color treatment on map
  markers, print markers, library cards, and the builder preview. Category picker in the
  Sign Builder form.
- **Scheduler (2.54.0):** 9-file ES module suite under `public/js/scheduler*.js`.
  Drag-and-drop grid built on `agnostic-draggable` (UMD). Key behaviors:
  - **Auto-routing:** `_resolveDropTarget()` in `schedulerDraggable.js` redirects drops on
    occupied slots or unqualified KM/KA slots to the first empty volunteer DZ in the same
    shift. Shared by `canDrop` (accept gate) and `onDrop` (placement). KM/KA fill normally
    when the slot is empty and the volunteer qualifies.
  - **Expand-on-hover:** shift blocks whose content overflows their grid-row height show a
    gradient fade indicator (`sched-shift-truncated`). After a 750 ms hover delay the block
    expands to reveal all dropzones, floating above adjacent shifts (`z-index: 10`).
    Viewport-aware: expands upward (`sched-shift-expanded-up`, absolutely-positioned DZ area)
    when the block would spill below the viewport. `_getBlockContentHeight()` measures
    header + time + `dzArea.scrollHeight`; re-validates at hover time so tall blocks with few
    DZs never shrink.
  - **Grid bounds:** `latest` is `Math.max(shiftLatest, sessionLatest + 90)` — the grid
    always extends 90 minutes past the last session to accommodate after-session shifts.
  - **Horizontal scroll (2.54.0):** location columns use `minmax(var(--sched-col-min), 1fr)`
    (default 120px, set on `.scheduler-main`). When columns exceed viewport width the grid
    scrolls horizontally with the left time column frozen (`position: sticky; left: 0`) and
    a mirrored right time column that appears on scroll. Department dividers use centered
    pseudo-element lines with box-shadow. Scroll peek badges show the next off-screen
    department name with directional arrows.
  - **Fixed-width dropzones (2.54.0):** volunteer slots are `flex: 0 0 calc((100% - 4px) / 3)`,
    always 3 per row with ellipsis-truncated names.
  - **Persisted column layout (2.82.0):** `scheduler_column_prefs` JSON column on
    `volunteer_in`; `GET`/`PUT /api/scheduler/column-prefs` load/save the volunteer's
    department column order and hide/show state from the "Columns:" toggle pills in
    the day banner, across day changes, sessions, and machines. Previously reset
    every time a day was picked.
  - **Day-independent toolbar (2.82.0):** Report link and Publish button live in the
    persistent sidebar header (not the per-day banner), since neither actually depends
    on the currently-loaded day — Report has its own day-picker, Publish lists every
    convention day in its modal. `GET /oversight/tools/scheduler/report` defaults to
    today's convention day (or the first schedulable day) when no `dayId` is given.
  - **Auto-select today (2.82.0):** on page load, `scheduler.js` checks the embedded
    `schedulerConventionDaysJson` data for a day matching today's date and selects it
    automatically, same as a manual pick. Runs once on load only.
- **Rendezvous points (2.55.0):** one optional meeting point per schedule assignment
  (shift + location). Managed via a shared floating panel (`rendezvous.js`) accessible
  from three surfaces: the Rendezvous landing page (`/oversight/tools/rendezvous`),
  right-click on shift block headers in the Scheduler, and the map-pin button on
  assignment badges in Timelines. GPS capture via `navigator.geolocation`, photo upload
  via multer → sharp → Azure Blob (`rv-{saId}-{ts}.jpg`). Time guard logic mirrors
  `alertScheduler.js` EDT offset: free editing >15 min before start, warn+alert within
  ±15 min of start (sends ad-hoc SMS to assigned volunteers), hard lock >15 min after
  start. T-15 SMS alerts LEFT JOIN rendezvous data and append inline text
  (description/floor/address) plus a link to the public HMAC-gated detail page when a
  photo exists. Permission key: `editRendezvous` (KEYMAN+ create/edit; delete and
  "Apply to Other Shifts" remain `manageShifts`, OVERSEER+).
  RV data is preloaded per day in the scheduler via `preloadRendezvousForDay()` on the
  `scheduler:dayChange` event.
- **Rendezvous “Apply to Other Shifts” (2.78.0):** copies an existing rendezvous
  point's description, address, floor, and GPS coordinates to other schedule
  assignments at the same location, across any shift type or day. Photos are
  intentionally never copied — clearing a photo deletes the underlying blob, so
  sharing a blob reference across records would risk breaking other rendezvous
  points' photos. `GET /api/rendezvous/:id/apply-candidates` lists other
  assignments at the location (flagging ones that already have their own
  rendezvous point); `POST /api/rendezvous/:id/apply-to` applies the copy,
  creating a new record or updating an existing one per target (existing
  photos on a target are left untouched). Gated at `manageShifts` (OVERSEER+).
- **Guided tours (near-universal, 2.78.0):** Shepherd.js first-visit tours now
  cover 34 pages — effectively every Oversight Tool and most volunteer-facing
  pages. `tourBase.js` provides the shared factory, button helpers, and
  `registerTour(tourId, buildFn)` API; `volunteer_tour_dismissals` tracks
  per-volunteer, per-tour dismissal state (see Database section). Multi-tab
  pages (Shift Alerts, Notes Report) use an `activateTab()` helper so a tour
  step can switch tabs and wait for `shown.bs.tab` before attaching, regardless
  of which tab was active when the tour started. One page is intentionally
  excluded: Continue Registration, a pre-login page with no header/nav, so
  `#tourTriggerBtn` never exists there. Parking Counter respects its
  phone-first, high-focus field-use context with a short, state-aware tour
  rather than skipping it entirely — it detects whether the setup panel or the
  active counting panel is showing and builds a different, deliberately brief
  path for each.
- **Blackout Timeline (2.65.0):** Interactive SVG blackout editor replacing the old
  day-picker/add-form in the scheduler, My Account, and Volunteer Account Oversight
  pages. Three stacked per-day tracks always visible; shared session bar switches to
  the active day. Drag handles snap to session boundaries, 5-minute intervals, and
  endpoints. Cursor overlay shows time tooltip and glowing ruler graduation; session
  boundaries glow when the handle aligns with one. Add-lock prevents a second range
  before saving. Scheduler uses a centered full-width overlay (light theme); accordion
  pages use an inline light theme with card expansion at xxl so the 1228px SVG fits
  without scroll. `GET/POST /api/blackouts/:volunteerId` (OVERSEER+, self, or
  createAssignments).
- **AI Note Analysis (2.64.0):** Azure OpenAI (GPT-4o) pipeline for volunteer intake
  notes. `lib/noteAnalyzer.js` calls the Azure OpenAI API and returns a structured
  result: summary, category, action item suggestions with priority, and scheduling
  blackout suggestions with type/day/time hints. Results persisted in
  `volunteer_note_analyses` with SHA-256 hash-based staleness detection.
  `routes/noteAnalysisRoutes.js` exposes four JSON endpoints (on-demand analyze,
  batch analyze, get result, accept action item). Notes Report modal gains an
  "Analyze" button and full results panel; "Analyze All" batch button in toolbar
  (ASSISTANT_ADMIN+). `schedulerNotePanel.js` shows a compact read-only AI summary
  line between "Read by" and "Action Items." All suggestions require human
  confirmation before applying. Azure credentials in Key Vault:
  `AzureOpenAIEndpoint`, `AzureOpenAIKey`, `AzureOpenAIDeployment`.
- **Shift alert templates (2.75.0):** SMS templates per alert category support
  these placeholders: `{firstName}`, `{shiftType}`, `{shiftLabel}`, `{time}`,
  `{date}`, `{code}`, `{shifts}`, `{rendezvous}`. The `all_upcoming` category
  groups all of a volunteer's upcoming shifts into a single message and
  expects `{shifts}` to render the bullet list (one line per shift). The
  `{code}` placeholder only registers attendance check-in when a reply
  follows a T-15 alert — earlier alerts fall through to the freeform
  pipeline (`smsWebhookRoute.js` `hasT15AlertBeenSent` gate). The default
  templates use ASCII bullets and plain `'` apostrophes so messages stay in
  GSM-7 encoding (2 segments per typical aggregate burst instead of 5 in
  UCS-2). `sendRows` in `lib/alertScheduler.js` is the single send pipeline
  used by both the scheduled tick and the manual Send Now route; it
  branches on `all_upcoming` to aggregate, otherwise sends per-row.
- **Inbound SMS routing (2.66.0):** freeform volunteer SMS replies are analyzed by AI
  (`lib/smsInboundAnalyzer.js`) and routed to the Notes Report as actionable items.
  Decision tree: unknown callers → name-request reply + overseer alert; check-in codes
  (≤8 chars) → existing pipeline with length guard; freeform → async AI pipeline after
  TwiML response. Pipeline: analyze → log to `inbound_sms_messages` → create
  `volunteer_action (source_type='inbound_sms')` → notify overseers via SMS + email.
- **AI Scheduling Constraints (2.67.0):** AI-suggested blackouts from note analysis and
  inbound SMS are persisted as `ai_blackout_suggestions` rows rather than transient JSON.
  The scheduler constraint panel (`schedulerConstraintPanel.js`) lets overseers review,
  edit, apply, and dismiss suggestions directly from the pool pill context menu. Applying
  all suggestions for an SMS message auto-resolves it in the Notes Report.
  As of 2.85.0 the panel is review-and-apply only — overseer free-text AI interpretation
  (`lib/constraintInterpreter.js`) was removed as redundant with direct blackout entry.
- **Lessons Learned (2.73.0+):** `/oversight/tools/lessons-learned` (KEYMAN+) — three-state
  workflow: submitted → approved → published, reversible in both directions via
  `POST /api/lessons-learned/:id/unpublish` and `/unapprove` (2.84.0+). On publish,
  Puppeteer renders all published lessons for the year to PDF, uploads to Azure Blob +
  SharePoint via Microsoft Graph, and upserts `lessons_learned_reports`. Photo attachments
  in the `lessons-learned` Blob container. `POST /api/lessons-learned/publish-selected`
  bulk-promotes checked lessons with a single PDF regeneration (2.84.0+);
  `POST /api/lessons-learned/batch-publish` regenerates the PDF without changing lesson
  status. `DELETE /api/lessons-learned/:id` (OVERSEER+) deletes photo blobs before the
  row, since the FK cascade destroys the blob names. Audience flags `is_internal` /
  `is_committee` classify each lesson, filterable from the toolbar (2.84.0+). Published
  PDF accessible at `/lessons-learned` (OVERSEER+) via authenticated proxy
  `GET /lessons-learned/pdf/:year` — keyed by year rather than blob name because the
  App Service front end normalizes `%2F` before Express route matching.
- **Parking Counter (2.70.0+):** `/counts` (logParkingCount permission — OVERSEER+ by default,
  delegatable via `extra_parking_count BIT` on `volunteer_in`). Phone-first tally UI with
  60-second heartbeat, quarter-hour alarm, Web Audio API beep, Wake Lock, localStorage
  persistence, and `navigator.sendBeacon` fallback on page hide. The Garage Capacity report
  (`/oversight/tools/reports?tab=garage-capacity`) shows an overview bar chart (latest count
  vs. capacity, colour-coded by utilisation) and per-garage stacked area charts with one fill
  band per sub-location (entrance/floor/etc.) summing to a bold total line. Auto-refreshes
  every 60 seconds silently; pauses when the page is hidden and catches up on restore.
- **System Variables (2.71.0+):** `system_variable_lists` stores vocabulary lists used
  throughout the app (location classifications, sub-location types). Self-referential
  `parent_id` FK scopes sub-type labels to specific classifications. `location_sub_locations`
  holds named sub-locations per parking location (Entrances, Floors, etc.) with cascade-delete
  from the parent location and `ON DELETE SET NULL` on `parking_counts.sub_location_id` so
  count data is preserved when a sub-location is removed. Managed via
  `/oversight/tools/system-variables` (ASSISTANT_ADMIN+).
- **Overseer Dashboard Widgets (2.69.0):** Three frosted-glass glimpse cards
  on the home dashboard, visible to OVERSEER+ only. Notes Report card: total
  active notes / unread by me / pending actions / pending SMS — all derived
  client-side from existing endpoints, no new SQL. Conflict Analysis card:
  unacknowledged count with a severity-pill **All / Unacked** toggle (the
  stored `violation_count` total was removed; it diverges from pill counts after
  acknowledgements). Reports carousel: Slot Fill Rate / Crew Attendance / Staff
  Usage via `‹/›` header arrows, lazy fetch + per-slide cache. `public/js/
  dashboardOversight.js` (new module); `can` + `PERMISSIONS` imported in
  `index.js` for the `canViewOversightWidgets` render gate.
- **Notes Report (2.62.0+, updated 2.66.0):** `/oversight/tools/notes-report` (OVERSEER+).
  Four tabs: All Notes (intake notes + inbound SMS cards; click-to-read tracking),
  Actionable (unified `volunteer_actions` from all sources), Solutions Summary, Archived
  (dismissed intake notes + resolved SMS messages in two labeled sections).
- **Contact Directory (2.79.0):** `/oversight/tools/contacts` (KEYMAN+, `viewVolunteerInfo`).
  Name/email/phone table for every volunteer with a completed registration, sourced from
  `getVolunteersForMessaging()` — no dedicated query. Client-side search and column sort
  in `contactDirectory.js`; no server round-trip. Print button only renders server-side
  for `printUserData` (OVERSEER+), so KEYMAN gets view-only.
