# Albany JW Parking — Volunteer Management Platform

A full-stack web application for managing volunteers, scheduling, messaging,
and attendance for the Albany JW Regional Convention parking team.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24, ES Modules |
| Framework | Express 5 |
| Templating | EJS |
| Database | Azure SQL (MSSQL) |
| Sessions | Redis / Azure Cache for Redis (Valkey) |
| Auth | Session-based with PBKDF2 password hashing |
| Email | IONOS SMTP via Nodemailer |
| SMS | Twilio Messaging Services |
| Email Validation | Kickbox REST API (native fetch, no SDK) |
| Frontend | Bootstrap 5, vanilla JS (no bundler) |
| Hosting | Azure App Service (Linux container) |
| CI/CD | GitHub Actions → Azure Container Registry |
| Secrets (prod) | Azure Key Vault via Managed Identity |

---

## Local Development

### Prerequisites

- Node.js 24+
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

---

## Project Structure

```
parking/
├── index.js                  # Server entry point, middleware, top-level routes
├── lib/
│   ├── dbSync.js             # All database query functions
│   ├── messaging.js          # Email + SMS delivery helpers
│   ├── passwordVer.js        # PBKDF2 hashing + verification
│   ├── sql.js                # SQL connection pool management
│   └── volunteerStatus.js    # Profile completeness checks
├── routes/
│   ├── accountRoutes.js      # Login, My Account, password change
│   ├── apiRoutes.js          # Internal API endpoints
│   ├── oversightRoutes.js    # All Oversight Tools routes
│   ├── registrationRoutes.js # Registration flow (multi-step draft)
│   ├── upgradeRoutes.js      # Account upgrade (email/phone → password)
│   └── validationRoutes.js   # Phone (Twilio) + email (Kickbox) validation
├── src/config/
│   ├── azureConfig.js        # Key Vault + SQL connection bootstrap
│   ├── privilegeRules.js     # Registration field incompatibility rules
│   └── roles.js              # RBAC permission matrix + middleware
├── views/
│   ├── authentication_and_accounts/  # Login, My Account, oversight tools
│   ├── partials/             # header.ejs, footer.ejs
│   ├── registration/         # Multi-step registration EJS views
│   └── upgrade/              # Account upgrade flow views
├── public/
│   ├── js/                   # Frontend JS modules (one file per page)
│   └── styles/               # CSS files
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
- **CSP compliant** — no `unsafe-inline`; scripts use nonce, data via `type="application/json"` blocks
- **MSSQL TIME columns** return as epoch-anchored `Date` objects — always use `getUTCHours()`/`getUTCMinutes()`

---

## Database

Azure SQL. Connection pool managed in `lib/sql.js` with:
- Stale-pool detection (error handler nulls `_pool` to force reconnect)
- Keep-alive ping every 3 minutes (prevents Azure's ~4 min idle TCP kill)
- Retry with exponential backoff on transient errors

Schema highlights:
- `volunteer_in` — core volunteer table (registration, contact, role, crews)
- `invitations` — per-volunteer invite records with token, RSVP, batch link
- `invitation_batches` — campaign metadata
- `convention_days → sessions → shifts` — scheduling hierarchy
- `attendance` — check-in records (walk-ins + invited volunteers)
- `role_permissions` — runtime permission overrides (delta from defaults)
- `sms_opt_out_log` — Twilio webhook opt-out events

---

## License

ISC
