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
├── index.js                  # Server entry point, middleware, top-level routes
├── lib/
│   ├── dbSync.js             # All database query functions
│   ├── messaging.js          # Email + SMS delivery helpers (suppressed in demo context)
│   ├── passwordVer.js        # PBKDF2 hashing + verification
│   ├── sql.js                # SQL connection pool management + demo pool routing
│   └── volunteerStatus.js    # Profile completeness checks
├── middleware/
│   └── demoContext.js        # Demo hostname detection + AsyncLocalStorage context wrap
├── routes/
│   ├── accountRoutes.js      # Login, My Account, password change
│   ├── apiRoutes.js          # Internal API endpoints
│   ├── oversightRoutes.js    # All Oversight Tools routes
│   ├── registrationRoutes.js # Registration flow (multi-step draft)
│   ├── mapsRoutes.js         # Maps page — OneDrive file listing with ScribbleMaps integration
│   ├── signsRoutes.js        # Sign Library + Sign Builder pages and CRUD (templates and placements)
│   ├── sitemapRoutes.js      # Public role-filtered sitemap page
│   ├── upgradeRoutes.js      # Account upgrade (email/phone → password)
│   └── validationRoutes.js   # Phone (Twilio) + email (Kickbox) validation
├── src/config/
│   ├── azureConfig.js        # Key Vault + SQL connection bootstrap
│   ├── privilegeRules.js     # Registration field incompatibility rules
│   ├── roles.js              # RBAC permission matrix + middleware
│   └── sitemap.json          # Page metadata for the role-filtered sitemap
├── views/
│   ├── authentication_and_accounts/  # Login, My Account, oversight tools
│   │   └── oversightStructure.ejs      # Oversight structure admin tree editor
│   ├── partials/             # header.ejs, footer.ejs
│   ├── registration/         # Multi-step registration EJS views
│   └── upgrade/              # Account upgrade flow views
├── public/
│   ├── js/                   # Frontend JS modules (one file per page)
│   │   ├── tours/                    # Shepherd.js guided tour modules (one per page)
│   │   │   ├── tourBase.js           # Shared tour factory and button helpers
│   │   │   ├── timelinesTour.js      # Three-path tour: event types, days, sessions
│   │   │   └── …                     # One file per oversight tool page
│   │   ├── dashboardWeather.js       # Open-Meteo 3-day weather widget
│   │   ├── dashboardShifts.js        # Home page day-navigator for shifts
│   │   ├── oversightStructure.js       # Oversight structure admin tree JS
│   │   └── sitemapSearch.js          # Live search/filter for the sitemap page
│   ├── styles/               # CSS files
│   ├── css/                  # Additional CSS (tours, etc.)
│   │   └── tours.css                 # Shepherd.js tour styling and z-index rules
│   │   ├── oversightStructure.css      # Oversight structure admin styles
│   │   └── sitemap.css               # Sitemap page card grid and layout
│   └── vendor/               # Third-party UMD bundles (agnostic-draggable, Bootstrap)
├── scripts/
│   ├── migrations/           # SQL schema migrations (always paired: .sql + _demo.sql)
│   │   ├── README.md         # Migration convention docs + migration log
│   │   ├── addDepartmentId.sql
│   │   ├── addDepartmentId_demo.sql
│   │   ├── addResponseConfig.sql
│   │   └── addResponseConfig_demo.sql
│   ├── seedDemo.js           # Populates the demo schema with realistic fake data
│   ├── anonymizeDemo.sql     # UPDATE statements to replace real names/places in demo
│   ├── setupDemoSchema.sql   # One-time: create demo schema, tables, and DB user
│   └── setupDemoSchema_fix.sql # Patch for tables with string DEFAULT values
├── docs/
│   └── OVERSIGHT_GUIDE.md    # End-user guide for oversight staff
├── CHANGELOG.md
└── Dockerfile
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
- **CSP compliant** — strictly no `unsafe-inline`; no inline `<script>` blocks,
  no inline `style=` attributes, no inline event handlers (`onclick`, `onchange`, etc.).
  All JS lives in `public/js/`, all CSS in `public/styles/`. Scripts load via `<script src>`.
- **MSSQL TIME columns** return as epoch-anchored `Date` objects — always use
  `getUTCHours()`/`getUTCMinutes()`

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
- `volunteer_in` — core volunteer table (registration, contact, role, crews)
- `invitations` — per-volunteer invite records with token, RSVP, batch link,
  and `response_other` (free-text "Other" input for dynamic RSVP)
- `invitation_batches` — campaign metadata; `response_config` (JSON, nullable)
  stores dynamic RSVP configuration (type, options, allowOther, question)
- `convention_days → sessions → shifts` — scheduling hierarchy
  - `shifts.department` — department key for scheduler grid grouping
  - `schedule_assignments.vol_min / vol_max` — flanking `volunteer_need`
    (vol_ideal) for slot sizing and colour-coding
  - `shift_slot_assignments` — live scheduler assignments (volunteer → slot);
    one row per slot, cascades on schedule_assignment delete
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
- `signs` — reusable sign templates (text + arrow direction); soft-deleted via `is_archived`
- `sign_placements` — geographic instances of a sign template (lat/lng, optional heading,
  status: planned/installed/removed, install/remove audit trail). FK to `signs` survives
  template archival.

---

## License

ISC
