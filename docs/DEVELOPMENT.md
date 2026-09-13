# Development Guide

Local setup, configuration, and deployment for Albany JW Parking.
See [ARCHITECTURE.md](ARCHITECTURE.md) for project structure and
[DATABASE.md](DATABASE.md) for the schema reference.

---

## Local Development

### Prerequisites

- Node.js 22+
- Access to the Azure SQL database (or a local SQL Server instance)
- A `.env` file (see below)

### Setup

```bash
git clone https://github.com/snoproladd/albany-jw-parking.git
cd albany-jw-parking
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

### Demo Environment

A demo instance runs at https://demo.albanyjwparking.org. All data is isolated
in a separate `demo` SQL schema via a contained SQL user (`<demo-db-user>`) whose
`DEFAULT_SCHEMA = demo`. Routing is transparent — `AsyncLocalStorage` propagates
the demo flag through the request pipeline; `getSqlPool()` and `query()` route
automatically based on hostname. Outbound email and SMS are suppressed in demo context.

Demo credentials are displayed on the demo login page.

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
DEMO_DB_USER=<demo-db-user>
DEMO_DB_PASSWORD=your-demo-db-password
DEMO_HOSTNAME=parking-demo.local   # or demo.albanyjwparking.org in production

# Azure OpenAI (note analysis, SMS analysis, schedule analyzer)
AzureOpenAIEndpoint=https://<your-openai-resource>.openai.azure.com/
AzureOpenAIKey=your-key
AzureOpenAIDeployment=gpt-4o

# Azure Key Vault (set automatically by set-local-env.js)
# AZURE_KEY_VAULT_URL=https://<your-key-vault>.vault.azure.net/
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

All secrets are stored in **Azure Key Vault** (`<your-key-vault>`). The App Service
uses a **Managed Identity** (MSI) to authenticate — no credentials are stored
in the container or environment variables in production.

Key Vault secret names map to env vars via `SECRET_MAP` in `src/config/azureConfig.js`.

Demo DB credentials (`DEMO_DB_USER`, `DEMO_DB_PASSWORD`) should also be added
as Key Vault secrets and referenced via App Service Key Vault references.
