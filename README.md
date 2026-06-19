# Albany JW Parking — Volunteer Management Platform

A full-stack web application for managing volunteers, scheduling, messaging,
and attendance for the Albany JW Regional Convention parking team.

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
AZSQLDB=your-database-name
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
│   ├── blobStorage.js         # Azure Blob Storage helpers (sign photos)
│   ├── dbSync.js              # All database query functions
│   ├── graphClient.js         # Microsoft Graph API client (OneDrive)
│   ├── messaging.js           # Email + SMS delivery helpers (suppressed in demo context)
│   ├── passwordVer.js         # PBKDF2 hashing + verification
│   ├── publishSchedule.js     # PDF schedule generation + OneDrive upload
│   ├── publishSignMap.js      # Sign map PDF generation + Blob + OneDrive upload
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
│   ├── oversightRoutes.js     # All Oversight Tools routes
│   ├── registrationRoutes.js  # Registration flow (multi-step draft)
│   ├── signsRoutes.js         # Sign Library, Sign Builder, Sign Map — templates, locations, and attachments CRUD
│   ├── sitemapRoutes.js       # Public role-filtered sitemap page
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
│   │   ├── locationsAndTasks.ejs
│   │   ├── reports.ejs
│   │   ├── scheduler.ejs
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
│   │   ├── myAccountBlackouts.js      # Self-service blackout management (My Account)
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
│   │   ├── locationsAndTasks.js       # Locations & tasks management
│   │   ├── maps.js                    # Maps page (OneDrive listing)
│   │   ├── oversightStructure.js      # Oversight structure admin tree
│   │   ├── oversightTools.js          # Operations hub page
│   │   ├── permissionMatrix.js        # Permission matrix editor
│   │   ├── reports.js                 # Reports page
│   │   ├── shiftAlerts.js             # Shift alert configuration
│   │   ├── sitemapSearch.js           # Live search/filter for the sitemap
│   │   ├── volunteerAccountOversight.js # Edit Volunteer page
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
│   │   ├── bugReport.css              # Bug report pages
│   │   ├── campaignCenter.css         # Campaign centre
│   │   ├── conflictGrid.css           # Master Conflict Grid report
│   │   ├── createProfileLaunch.css    # Registration launch page
│   │   ├── crewMatrix.css             # Crew matrix
│   │   ├── invitationTracker.css      # Invitation tracker
│   │   ├── maps.css                   # Maps page
│   │   ├── oversightStructure.css     # Oversight structure admin tree
│   │   ├── permissionMatrix.css       # Permission matrix
│   │   ├── rendezvous.css             # Rendezvous editor panel + landing page
│   │   ├── scheduler-categories.css   # Scheduler Categories management page
│   │   ├── reports.css                # Reports page
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
│   └── migrations/            # SQL schema migrations (always paired: .sql + _demo.sql)
│       ├── README.md          # Migration convention docs + migration log
│       ├── addDepartmentId.sql / _demo.sql
│       ├── addResponseConfig.sql / _demo.sql
│       └── shift_rendezvous_points.sql / _demo.sql
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
  preference to `element.style.x = ...` where the distinction matters (e.g. the
  travel-direction handle uses `--travel-bearing` so the positioning transform is never
  clobbered by bearing updates).
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
  Placement ID) mirror the main map’s layer system. Four-state placement markers: compact
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
- **Gender / role / crew filters (2.59.0):** Male / Female / All gender filter added to seven pages (Crew Matrix, Scheduler pool, Volunteer Account Oversight, Attendance Report, Invitation Tracker, Campaign Center, Application Status). Campaign Center aside also gains Role and Crew selects. Backed by `gender`, `role`, and crew columns added to the relevant `dbSync.js` query functions; no schema changes required.
- **Scheduler Categories (2.58.0):** `dbo.scheduler_categories` replaces
  `dbo.event_types` and the `shifts.department` / `shifts.event_type_id` columns.
  `shifts.category_id INT FK` is the sole link. Sensitivity flag (`is_sensitive`)
  on each category gates visibility below OVERSEER; `req.session.sensitiveCategories`
  (null = all access, array = permitted IDs) is set at login via
  `getSchedulerCategoryAccessForVolunteer()`. The Scheduler Categories management
  page (at `/oversight/tools/timelines/event-types`) shows sensitivity toggle and
  access management panel for OVERSEER+. All hardcoded department maps (`DEPT_NAMES`,
  `DEPT_ORDER`, `SCHEDULER_DEPT_LABEL`) removed from `dbSync.js` — ordering from
  `sc.sort_order`, labels from `sc.name`.
- **Parking Meeting shifts (2.57.0):** `is_meeting BIT` on `dbo.shifts` marks a
  shift as crew-agnostic — no category, no schedule assignments. The Scheduler
  renders a dedicated narrow "Meetings" column when any meeting shifts exist on
  the day. T-15 alerts use a day-broadcast model: `getMeetingT15Candidates` returns
  all volunteers with crew assignments on the day minus those whose crew shift
  overlaps the meeting window. `dbo.campaign_meetings` holds standalone meeting
  events outside the Timelines hierarchy, surfaced via `/api/campaign-meetings`.
- **Volunteer Schedule Report (2.54.0):** `/my-schedule` (REGISTERED+, own assignments)
  and `/oversight/tools/volunteer-schedule` (OVERSEER+, search any volunteer). Shared EJS
  template with day/crew filters, print CSS, and SMS/email send modal.

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
- `invitations` — per-volunteer invite records with token, RSVP, batch link,
  and `response_other` (free-text "Other" input for dynamic RSVP)
- `invitation_batches` — campaign metadata; `response_config` (JSON, nullable)
  stores dynamic RSVP configuration (type, options, allowOther, question)
- `convention_days → sessions → shifts` — scheduling hierarchy
  - `shifts.is_meeting BIT` — crew-agnostic meeting shift; no category,
    no schedule assignments. Appears in a dedicated Meetings column in the
    Scheduler and uses `MT` SMS code prefix. T-15 alerts broadcast to all
    day volunteers not scheduled elsewhere during the meeting window.
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
  - `bearing` `DECIMAL(5,1)` — direction traffic flows (0–360°)
  - Separate from sign markers; placed on the road near intersections
- `traffic_arrow_signs` — links traffic arrows to specific attachments
  - `(arrow_id, attachment_id)` composite PK, both FK with ON DELETE CASCADE

---

## License

ISC
