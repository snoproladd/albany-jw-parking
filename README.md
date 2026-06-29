# Albany JW Parking — Volunteer Management Platform

A full-stack web application for managing volunteers, scheduling, messaging,
and attendance for the Albany JW Regional Convention parking team.

<!-- README last updated: v2.73.0 -->

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22+, ES Modules |
| Framework | Express 5 |
| Templating | EJS |
| Database | Azure SQL (MSSQL) — `dbo` schema (prod), `demo` schema (demo) |
| Sessions | Redis / Azure Cache for Redis (Valkey) |
| Auth | Session-based with PBKDF2 password hashing |
| Email | IONOS SMTP via Nodemailer |
| SMS | Twilio Messaging Services |
| Email Validation | Kickbox REST API (native fetch, no SDK) |
| Frontend | Bootstrap 5, vanilla JS (no bundler), agnostic-draggable (UMD), Shepherd.js (CDN, tours) |
| Hosting | Azure App Service (Linux container) |
| CI/CD | GitHub Actions → Azure Container Registry |
| Secrets (prod) | Azure Key Vault via Managed Identity |

---

## Local Development

### Prerequisites

- Node.js 22+
- Access to the Azure SQL database (or a local SQL Server instance)
- A `.env` file (see below)

### Setup

```bash
git clone https://github.com/snoproladd/legendary-waffle.git
cd legendary-waffle
npm install
```

Create a `.env` file in the project root with the variables listed in the
**Environment Variables** section below.

```bash
npm run dev
```

The app starts at `http://localhost:3000`.

### Dev Script

```json
"dev": "nodemon --require ./set-local-env.js index.js"
```

`set-local-env.js` sets `AZURE_KEY_VAULT_URL` for the local environment.
In dev, secrets fall back to `.env` values when Key Vault is unreachable.

---

## Demo Environment

A demo instance runs at `https://demo.albanyjwparking.org` on the same App
Service and database server as production. All data is isolated in a separate
`demo` SQL schema via a contained SQL user (`parking_demo`) whose
`DEFAULT_SCHEMA = demo`.

The routing is transparent — no changes to `dbSync.js` or route handlers.
`AsyncLocalStorage` propagates the demo flag through the request pipeline;
`getSqlPool()` and `query()` route automatically based on the hostname.

To run the demo locally, add `127.0.0.1 parking-demo.local` to your hosts
file and set `DEMO_HOSTNAME=parking-demo.local` in `.env`, then access the
app at `http://parking-demo.local:3000`.

### Demo login credentials

| Email | Role | Password |
|---|---|---|
| `admin@demo.com` | ADMIN | `Demo@2026!` |
| `asstadmin@demo.com` | ASSISTANT_ADMIN | `Demo@2026!` |
| `overseer@demo.com` | OVERSEER | `Demo@2026!` |
| `keyman@demo.com` | KEYMAN | `Demo@2026!` |
| `desk@demo.com` | DESK | `Demo@2026!` |
| `volunteer@demo.com` | REGISTERED | `Demo@2026!` |

To re-seed demo data: `node scripts/seedDemo.js`
To anonymize names/places in the demo DB: run `scripts/anonymizeDemo.sql`

---

## Environment Variables

All secrets are loaded from Azure Key Vault in production. In development,
create a `.env` file at the repo root with the following:

```env
# SQL (Azure SQL)
AZSQLServer=your-server.database.windows.net
AZSQLDb=your-database-name
AZSQLPort=1433

# Session
SESSION_SECRET=a-long-random-string

# Email (IONOS SMTP)
IONOS_SMTP_HOST=smtp.ionos.com
IONOS_SMTP_PORT=587
IONOS_SMTP_USER_INFO=noreply@yourdomain.com
IONOS_SMTP_PASS=your-smtp-password

# SMS (Twilio)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_MSG_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Email Validation (Kickbox)
KICKBOX_API_KEY=your-kickbox-api-key

# Google Maps Platform (Maps JavaScript API)
# Used by the Sign Map page at /signs/map
GOOGLE_MAPS_API_KEY=your-google-maps-api-key

# Redis (local dev — optional, sessions use memory store if absent)
# REDIS_URL=redis://localhost:6379

# Demo environment
DEMO_DB_USER=parking_demo
DEMO_DB_PASSWORD=your-demo-db-password
DEMO_HOSTNAME=parking-demo.local   # or demo.albanyjwparking.org in production

# Azure OpenAI (note analysis, SMS analysis, constraint interpreter, schedule analyzer)
AzureOpenAIEndpoint=https://albany-parking-resource.openai.azure.com/
AzureOpenAIKey=your-key
AzureOpenAIDeployment=gpt-4o

# Azure Key Vault (set automatically by set-local-env.js)
# AZURE_KEY_VAULT_URL=https://ApiStorage.vault.azure.net/
```

> **Note:** `IONOS_SMTP_USER` (used in some legacy paths) is the same value
> as `IONOS_SMTP_USER_INFO`. Both are referenced in different route contexts.

---

## Deployment

Deployment is fully automated via GitHub Actions on push to the `testing` branch.

### Pipeline summary (`main.yml`)

1. Logs in to Azure Container Registry
2. Builds a Docker image from `Dockerfile`
3. Pushes image tagged with commit SHA + `test` + `latest`
4. Azure App Service pulls the new image automatically

### Manual deploy trigger

```bash
git push origin testing
```

Wait ~2 minutes for the CI pipeline and App Service to pull the new image.

### Production secrets

All secrets are stored in **Azure Key Vault** (`ApiStorage`). The App Service
uses a **Managed Identity** (MSI) to authenticate — no credentials are stored
in the container or environment variables in production.

Key Vault secret names map to env vars via `SECRET_MAP` in `src/config/azureConfig.js`.

Demo DB credentials (`DEMO_DB_USER`, `DEMO_DB_PASSWORD`) should also be added
as Key Vault secrets and referenced via App Service Key Vault references.

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
│   ├── blobStorage.js         # Azure Blob Storage helpers (sign photos, lesson photos, published file streaming)
│   ├── dbSync.js              # All database query functions
│   ├── graphClient.js         # Microsoft Graph API client (OneDrive)
│   ├── messaging.js           # Email + SMS delivery helpers (suppressed in demo context)
│   ├── noteAnalyzer.js        # Azure OpenAI pipeline for volunteer intake note analysis
│   ├── smsInboundAnalyzer.js  # Azure OpenAI pipeline for freeform inbound SMS analysis
│   ├── constraintInterpreter.js # AI free-text → structured scheduling blackout suggestion
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
│   ├── mapsRoutes.js          # Maps page — OneDrive file listing with ScribbleMaps integration
│   ├── schedulesRoutes.js     # Schedules page — OneDrive PDF listing for published day schedules
│   ├── oversightRoutes.js     # All Oversight Tools routes
│   ├── registrationRoutes.js  # Registration flow (multi-step draft)
│   ├── signsRoutes.js         # Sign Library, Sign Builder, Sign Map — templates, locations, and attachments CRUD
│   ├── countsRoutes.js        # Parking Counter tally page + count report API
│   ├── systemVariablesRoutes.js # System Variables management + sub-location CRUD
│   ├── lessonsLearnedRoutes.js  # Lessons Learned management + PDF proxy + batch-publish
│   ├── sitemapRoutes.js       # Public role-filtered sitemap page
│   ├── blackoutRoutes.js      # GET/POST /api/blackouts/:volunteerId (BlackoutTimeline API)
│   ├── smsWebhookRoute.js     # Twilio inbound SMS routing + freeform AI pipeline
│   ├── noteAnalysisRoutes.js  # AI note analysis (analyze, batch, accept action item)
│   ├── constraintRoutes.js    # AI scheduling constraints (pending, interpret, apply, delete)
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
│   ├── maps.ejs               # Maps page (OneDrive listing)
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
│   │   ├── maps.js                    # Maps page (OneDrive listing)
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
│   │       ├── tourBase.js            # Tour factory, button helpers, first-visit prompt system, registerTour API
│   │       ├── attandanceCheckinTour.js  # (legacy typo filename, kept for compat)
│   │       ├── attendanceCheckinTour.js
│   │       ├── attendanceReportTour.js
│   │       ├── campaignTour.js
│   │       ├── crewMatrixTour.js
│   │       ├── invitationTrackerTour.js
│   │       ├── locationsTour.js
│   │       ├── oversightToolsTour.js
│   │       ├── reportsTour.js
│   │       ├── rolesTour.js
│   │       ├── schedulerReportTour.js
│   │       ├── schedulerTour.js
│   │       ├── timelinesTour.js
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
│       └── lessons-learned-archive.sql # archive schema for removed lessons
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

## Role Hierarchy

Roles are stored as a single column on the `volunteer_in` table.
Higher roles inherit all permissions of roles below them.

```
NON_REGISTERED → REGISTERED → DESK → KEYMAN → OVERSEER → ASSISTANT_ADMIN → ADMIN
```

The permission matrix lives in `src/config/roles.js` and can be overridden
at runtime via the Permission Matrix tool (ADMIN only).

The first ADMIN must be granted directly in the database.

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
  photo exists. Permission key: `editRendezvous` (KEYMAN+ edit, OVERSEER+ create/delete).
  RV data is preloaded per day in the scheduler via `preloadRendezvousForDay()` on the
  `scheduler:dayChange` event.
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
- **Inbound SMS routing (2.66.0):** freeform volunteer SMS replies are analyzed by AI
  (`lib/smsInboundAnalyzer.js`) and routed to the Notes Report as actionable items.
  Decision tree: unknown callers → name-request reply + overseer alert; check-in codes
  (≤8 chars) → existing pipeline with length guard; freeform → async AI pipeline after
  TwiML response. Pipeline: analyze → log to `inbound_sms_messages` → create
  `volunteer_action (source_type='inbound_sms')` → notify overseers via SMS + email.
- **AI Scheduling Constraints (2.67.0):** AI-suggested blackouts from note analysis and
  inbound SMS are persisted as `ai_blackout_suggestions` rows rather than transient JSON.
  `lib/constraintInterpreter.js` handles overseer free-text interpretation. The scheduler
  constraint panel (`schedulerConstraintPanel.js`) lets overseers review, edit, and apply
  suggestions directly from the pool pill context menu. Applying all suggestions for an
  SMS message auto-resolves it in the Notes Report.
- **Lessons Learned (2.73.0+):** `/oversight/tools/lessons-learned` (KEYMAN+) — three-state
  workflow: submitted → approved → published. On publish, Puppeteer renders all published
  lessons for the year to PDF, uploads to Azure Blob + SharePoint via Microsoft Graph,
  and upserts `lessons_learned_reports`. Photo attachments in the `lessons-learned`
  Blob container. `POST /api/lessons-learned/batch-publish` regenerates the PDF
  without changing lesson status. Published PDF accessible at `/lessons-learned`
  (OVERSEER+) via authenticated proxy `GET /lessons-learned/pdf/:blobName`.
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

---

## Database

Azure SQL. Connection pool managed in `lib/sql.js` with:
- Stale-pool detection (error handler nulls `_pool` to force reconnect)
- Keep-alive ping every 3 minutes (prevents Azure's ~4 min idle TCP kill)
- Retry with exponential backoff on transient errors
- **Demo pool** — lazily initialized on first demo request using SQL auth
  (`parking_demo` user). `AsyncLocalStorage` routes all queries automatically;
  `dbo.` prefixes in SQL strings are rewritten to `demo.` at runtime.

Schema highlights:
- `volunteer_in` — core volunteer table (registration, contact, role, crews,
  delegated extra permissions)
  - Crew columns: `crew_lots_garages`, `crew_signs`, `crew_security`,
    `crew_mobile_support`, `crew_dropoff_pickup`, `crew_desk` (all BIT)
  - `extra_signs_placement BIT NOT NULL DEFAULT 0` — grants `manageSigns` to a
    REGISTERED volunteer without a role promotion. Checked at login; stored as
    `'manageSigns'` in `req.session.extraPermissions` (string array). Future
    delegated permissions follow the same pattern: add a column, add one line
    to the login handler.
  - `extra_parking_count BIT NOT NULL DEFAULT 0` — grants `logParkingCount` to a
    REGISTERED volunteer (delegation for convention-day counters). Checked at login;
    stored as `'logParkingCount'` in `req.session.extraPermissions`.
- `invitations` — per-volunteer invite records with token, RSVP, batch link,
  and `response_other` (free-text "Other" input for dynamic RSVP)
- `invitation_batches` — campaign metadata; `response_config` (JSON, nullable)
  stores dynamic RSVP configuration (type, options, allowOther, question)
- `convention_days → sessions → shifts` — scheduling hierarchy
  - `shifts.is_meeting BIT` — crew-agnostic meeting shift; no category,
    no schedule assignments. Appears in a dedicated Meetings column in the
    Scheduler and uses `MT` SMS code prefix. T-15 alerts broadcast to all
    day volunteers not scheduled elsewhere during the meeting window.
  - `shifts.has_keyman / has_keyman_asst BIT` — whether this shift exposes
    a Keyman or Keyman Assistant drop zone in the Scheduler. Both default to
    1. Leadership slots count toward Min/Target/Max; volunteer slot budget is
    reduced accordingly. Not applicable to meeting shifts.
  - `shifts.category_id INT FK → scheduler_categories` — links each crew
    shift to a scheduler category (NULL for meeting shifts). Replaced the
    former `department` (NVARCHAR) and `event_type_id` (INT FK) columns.
  - `schedule_assignments.vol_min / vol_max` — flanking `volunteer_need`
    (vol_ideal) for slot sizing and color-coding
  - `shift_slot_assignments` — live scheduler assignments (volunteer → slot);
    one row per slot, cascades on schedule_assignment delete
- `scheduler_categories` — shift categories replacing `dbo.event_types`.
  Fields: `dept_key` (stable machine key, unique), `name` (editable display
  label), `color` (hex), `is_sensitive BIT` (controls schedule visibility),
  `active BIT`, `sort_order INT`. Eight rows seeded at setup.
- `scheduler_category_access` — per-volunteer access grants for restricted
  (`is_sensitive = 1`) categories. Fields: `volunteer_id FK`, `category_id FK`,
  `granted_by FK`, `granted_at`. Composite PK `(volunteer_id, category_id)`.
  Loaded into `req.session.sensitiveCategories` at login; null for OVERSEER+
  (no filter), array of permitted category IDs for lower roles.
- `campaign_meetings` — standalone meeting events not tied to a Timelines
  session (e.g. pre-event all-hands). Fields: `year`, `label`, `meeting_date`,
  `start_time`, `end_time`, `description`. Foundation for the planned
  landing-page calendar view.
- `oversight_structure` — oversight structure tree (`volunteer_id`, `parent_id`,
  `role_title`, `sort_order`)
- `attendance` — check-in records (walk-ins + invited volunteers)
- `volunteer_blackouts` — per-volunteer unavailable time windows for scheduler
  conflict detection
- `role_permissions` — runtime permission overrides (delta from defaults)
- `sms_opt_out_log` — Twilio webhook opt-out events
- `departments` — lookup table for future multi-department support (id=1 seeded as Albany Parking)
- `bug_reports` — full lifecycle bug tracking with resolution fields
- `schedule_publishes` — audit log for schedule PDF publish events
- `published_files` — generic published file tracking (sign map PDFs, etc.); stores blob name, SharePoint URL, publisher, and timestamp
- `volunteer_note_reads` — per-overseer read records for intake notes. Fields: `volunteer_id FK`, `read_by FK`, `read_at DATETIME`. Unique on `(volunteer_id, read_by)`; MERGE upsert on re-read updates `read_at`.
- `volunteer_actions` — actionable items from intake notes and inbound SMS. Fields: `volunteer_id FK`, `source_type NVARCHAR(50)` (`intake_note` | `inbound_sms`), `source_id` (nullable), `solution_found BIT`, `solution NVARCHAR(MAX)`, solution stamp columns, `completed BIT`, completion stamp columns, `created_by FK`, `created_at`. Three columns on `volunteer_in`: `note_dismissed BIT`, `note_dismissed_at DATETIME`, `note_dismissed_by INT FK`.
- `inbound_sms_messages` — every freeform inbound Twilio SMS: `volunteer_id FK` (nullable), `from_phone`, `raw_body`, `received_at`, AI result columns (`ai_summary`, `ai_category`, `ai_action_items`, `ai_raw_response`, `ai_error`, token counts), `resolved BIT`. Unresolved messages surface in the Notes Report; auto-resolved when all linked AI suggestions are applied.
- `ai_blackout_suggestions` — AI-suggested scheduling blackouts pending overseer approval. `source_type` ∈ {intake_note, inbound_sms, overseer}, `source_id` links to the originating record, `volunteer_id FK`, resolved `convention_day_id + start_mins + end_mins`, `blackout_type`, `applied BIT` + stamp columns. When all suggestions for an SMS message are applied the parent `inbound_sms_messages` row is auto-resolved.
- `volunteer_note_analyses` — AI analysis snapshots for intake notes. Fields: SHA-256 `note_hash` for staleness detection, structured JSON result, token usage, raw response, `volunteer_id FK`.
- `schedule_violation_runs` — one row per schedule analysis pass. `schedule_hash NVARCHAR(64)` (SHA-256 of all assignments + blackouts) enables cache comparison to skip re-analysis when nothing has changed. `triggered_by FK`, `violation_count INT`.
- `schedule_violations` — per-violation rows. `violation_type` ∈ {time_overlap, blackout_violation, pre_session_overload, post_session_overload, understaffed, daily_load, coverage_gap, ai_observation}. `severity` ∈ {critical, high, medium, low, info} (null for rule-engine violations before AI enhancement). `confidence DECIMAL(3,2)` (null for deterministic facts). `ai_question` / `overseer_response` support the targeted Q&A re-analysis loop. `acknowledged BIT`.
- `schedule_analysis_rules` — admin-managed scheduling policy rules injected as mandatory context into the AI system prompt on every analysis run. `rule_text NVARCHAR(MAX)`, `sort_order INT`, `active BIT`. Managed via `/oversight/tools/schedule-rules` (ADMIN only).
- `lessons_learned` — submitted lessons from convention operations. Fields: `year`,
  `department_id FK → system_variable_lists`, `department_other`, `notes NVARCHAR(MAX)`,
  `status` (‘submitted’ | ‘approved’ | ‘published’), `archived BIT`, `submitted_by FK`,
  `approved_by FK`, `published_by FK` with timestamp columns.
- `lessons_learned_photos` — photo attachments per lesson. Fields: `lesson_id FK
  (ON DELETE CASCADE)`, `blob_name`, `original_filename`, `uploaded_by FK`.
- `lessons_learned_reports` — one row per convention year tracking the consolidated
  published PDF. Fields: `year PK`, `blob_name`, `share_url`, `published_by FK`,
  `published_at`. Upserted on each individual lesson publish and on batch-publish.
- `parking_counts` — volunteer tally records. Fields: `volunteer_id FK`, `location_task_id FK`,
  `convention_day_id FK`, `count INT`, `is_final BIT`, `is_manual BIT`, `sub_location_id INT
  NULL FK → location_sub_locations (ON DELETE SET NULL)`, `recorded_at DATETIME2 DEFAULT
  GETUTCDATE()`. Heartbeats insert `is_final = 0`; taps/manual submits insert `is_final = 1`.
  Report query uses `MAX(count)` per volunteer per 15-minute bucket, then sums across
  volunteers per sub-location.
- `system_variable_lists` — central vocabulary store for dynamic lists. Fields: `category
  NVARCHAR(50)`, `display_name`, `parent_id INT NULL FK → self` (scopes sub-type labels to a
  specific classification), `display_order`, `active BIT`. Seeded categories:
  `location_classification` (Parking Garage, Parking Area, Kingdom Hall, Desk/Station) and
  `location_sub_type` (Entrance, Exit, Aisle universal; Floor/Column → Garage; Desk → KH).
- `location_sub_locations` — named positions within a location. Fields: `location_task_id FK
  (ON DELETE CASCADE)`, `name`, `sub_type_id FK → system_variable_lists`, `display_order`,
  `active BIT`. Deleting a location cascades to its sub-locations; counts that referenced a
  deleted sub-location have `sub_location_id` set to NULL (data preserved).
- `volunteer_tour_dismissals` — tracks which guided tour prompts a volunteer has permanently dismissed; composite PK `(volunteer_id, tour_id)`, FK to `volunteer_in(id)`. Special `tour_id = '_all'` disables all first-visit prompts site-wide.
- `shift_rendezvous_points` — one optional meeting point per schedule assignment
  (shift + location pair). Fields: `description`, `address`, `latitude`/`longitude`
  (GPS), `floor_number`, `photo_blob_name` (Azure Blob, `rv-` prefix in `sign-photos`
  container). `UNIQUE` on `schedule_assignment_id`; `ON DELETE CASCADE` from
  `schedule_assignments`. KEYMAN+ can edit fields and upload photos; OVERSEER+ can
  create and delete records (`editRendezvous` permission). Rendezvous details are
  appended to T-15 shift alert SMS messages; a public HMAC-gated detail page
  (`/rv/:id?t=<token>`) is linked when a photo exists.
- `signs` — reusable sign templates (text + optional abbreviation); soft-deleted via `is_archived`
  - `abbreviation` `NVARCHAR(6)` — optional compact label for map markers (auto-generated from sign text when NULL)
- `sign_locations` — physical mounting points (the pin on the map). Multiple signs
  can be attached to one location (stacked signs on a pole, double-sided a-frames, etc.)
  - `latitude`/`longitude` `DECIMAL(10,7)` (≈1cm precision)
  - `mount_type` (`pole` / `cone` / `a-frame` / `existing-structure`, nullable)
  - `front_bearing` `DECIMAL(5,1)` — a-frame only: compass bearing the front face points toward (back = front + 180°)
  - `marker_color` — optional palette key (red, orange, yellow, green, teal, blue, purple, pink) for visual grouping
  - `photo_url` — blob name in Azure Storage `sign-photos` container; served via `GET /signs/locations/:id/photo`
  - `sv_pano_id`, `sv_heading`, `sv_pitch`, `sv_fov` — persisted Street View camera state; restored when the panorama is reopened
  - No status column — effective status is derived from attachments (any installed → installed, otherwise planned/removed)
  - `placement_number` — not a stored column; computed as `DENSE_RANK() OVER (ORDER BY location_id)` in `getSignLocations()`. Gapless sequential IDs (`P1`, `P2`, …) for field cross-referencing
- `sign_attachments` — a sign template mounted on a location, with its own status
  - `location_id` FK → `sign_locations` (ON DELETE CASCADE)
  - `sign_id` FK → `signs`; survives template archival
  - `face` — `NULL` (non-a-frame), `'front'`, or `'back'`
  - `sort_order` — stacking priority (lower = higher on the post); drag-to-reorder in the editor
  - `arrow_direction` — the arrow printed on the physical sign (per-attachment override)
  - `status` (`planned` / `installed` / `removed`) with install/remove audit trail per attachment
- `sign_traffic_arrows` — road-surface directional indicators pointing drivers toward sign locations
  - `bearing` `DECIMAL(5,1)` — compass bearing the arrow points toward
  - `sv_pano_id`, `sv_heading`, `sv_pitch`, `sv_fov` — persisted Street View camera state for arrow-specific approach views
  - `sign_traffic_arrow_links` junction table links arrows to `sign_attachments`
  - Separate from sign markers; placed on the road near intersections
- `traffic_arrow_signs` — links traffic arrows to specific attachments
  - `(arrow_id, attachment_id)` composite PK, both FK with ON DELETE CASCADE

---

## License

ISC
