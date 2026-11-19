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
To preview what the seed will clear first: `node scripts/seedDemo.js --plan`

The seed's volunteer roster is fictional (made-up names, shifted birth dates).
It seeds the current calendar year, or `DEMO_YEAR` if set, and moves the
dates to the same weekdays.

---

## Environment Variables

All secrets are loaded from Azure Key Vault in production. In development,
create a `.env` file at the repo root with the following:

```env
# SQL (Azure SQL)
AZSQLServer=your-server.database.windows.net
AZSQLDB=your-database-name
AZSQLPort=1433

# SQL login instead of Azure auth — for a server outside Azure, such as a
# local SQL Server 2025 Express copy (see "Local SQL Server" below).
# Leave SQL_AUTH unset to use Azure auth (the default).
# SQL_AUTH=sql
# SQL_USER=parking_dev
# SQL_PASSWORD=your-local-password
# SQL_INSTANCE=SQLEXPRESS        # only if not listening on a fixed port
# SQL_TRUST_SERVER_CERT=1        # accept a local server's self-signed certificate
# SQL_ENCRYPT=0                  # only if the server can't do TLS at all (not needed for Express)

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

# SharePoint folder for published files (optional). {year} becomes the
# active convention year. Default:
# GRAPH_FOLDER_PATH={year} Convention Parking/Documents for Distribution

# Azure Key Vault (set automatically by set-local-env.js)
# AZURE_KEY_VAULT_URL=https://<your-key-vault>.vault.azure.net/
```

> **Note:** `IONOS_SMTP_USER` (used in some legacy paths) is the same value
> as `IONOS_SMTP_USER_INFO`. Both are referenced in different route contexts.

---

## Local SQL Server (branch work)

The `multi-department` branch must never run migrations against the Azure
database, so it uses a local SQL Server 2025 Express copy — the same edition
planned for the personal server. Run the PowerShell below in PowerShell 7 as
administrator.

1. **Install SQL Server 2025 Express.** Choose *Custom*, not *Basic* (Basic is
   Windows authentication only). Pick *Database Engine Services*, keep the
   `SQLEXPRESS` instance name, choose *Mixed Mode* and *Add Current User*.
   Install the tools too:

   ```powershell
   winget install Microsoft.Sqlcmd
   dotnet tool install -g microsoft.sqlpackage
   ```

   If `SqlPackage /Version` says to install or update .NET, set
   `DOTNET_ROLL_FORWARD=Major` as a user environment variable and reopen
   PowerShell.

2. **Turn on TCP/IP on port 1433.** In SQL Server Configuration Manager
   (`SQLServerManager17.msc`) enable TCP/IP, then on *IP Addresses → IPAll*
   **clear *TCP Dynamic Ports*** and set *TCP Port* to `1433`. Express leaves
   dynamic ports on, and the server then listens on a random port (connections
   to 1433 are "actively refused"). The same change from PowerShell:

   ```powershell
   $inst = Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server' | Where-Object PSChildName -like 'MSSQL*.SQLEXPRESS'
   $ipAll = Join-Path $inst.PSPath 'MSSQLServer\SuperSocketNetLib\Tcp\IPAll'
   Set-ItemProperty $ipAll -Name TcpDynamicPorts -Value ''
   Set-ItemProperty $ipAll -Name TcpPort -Value '1433'
   Restart-Service 'MSSQL$SQLEXPRESS' -Force
   ```

   `-Force` is needed because the PolyBase and Launchpad services depend on SQL
   Server. The app uses neither; setting them to *Manual* startup is fine.
   Check the port with
   `Get-ChildItem 'C:\Program Files\Microsoft SQL Server\MSSQL*.SQLEXPRESS\MSSQL\Log\ERRORLOG' | Get-Content | Select-String 'listening'`.

3. **Allow contained users** — the demo login is a contained database user:

   ```powershell
   sqlcmd -S localhost,1433 -E -C -Q "EXEC sp_configure 'contained database authentication', 1; RECONFIGURE;"
   ```

4. **Export the Azure database** to a `.bacpac`. This only reads from Azure.
   Keep the file **outside the repo** (it holds real volunteer data). Pass a
   connection string — `/SourceServerName` with `/UniversalAuthentication`
   fails with "Cannot set the AccessToken property if 'Integrated Security'…":

   ```powershell
   SqlPackage /Action:Export `
       /SourceConnectionString:"Server=tcp:<server>.database.windows.net,1433;Initial Catalog=<database>;Authentication=Active Directory Interactive;Encrypt=True;" `
       /TargetFile:C:\SqlBackups\<database>.bacpac
   ```

   Use `Authentication=Active Directory Default` instead to sign in with the
   Azure CLI login.

5. **Import it locally** under a name that can't be mistaken for production
   (Windows authentication):

   ```powershell
   SqlPackage /Action:Import `
       /SourceFile:C:\SqlBackups\<database>.bacpac `
       /TargetConnectionString:"Server=localhost,1433;Database=<database>_local;Integrated Security=True;TrustServerCertificate=True"
   ```

   This brings both the `dbo` and `demo` schemas, with containment `PARTIAL`.
   Users created `FROM EXTERNAL PROVIDER` (Entra and managed-identity users)
   are imported as users without logins; they can't sign in locally and need
   no cleanup.

6. **Set the demo user's password.** A bacpac doesn't carry passwords, so set
   the contained demo user's password to the `DEMO_DB_PASSWORD` in `.env`:

   ```sql
   USE [<database>_local];
   ALTER USER [<demo-db-user>] WITH PASSWORD = 'value-of-DEMO_DB_PASSWORD';
   ```

7. **Create a login for the app** (development only; `db_owner` lets migrations run):

   ```sql
   CREATE LOGIN parking_dev WITH PASSWORD = 'your-local-password', DEFAULT_DATABASE = [<database>_local];
   USE [<database>_local];
   CREATE USER parking_dev FOR LOGIN parking_dev;
   ALTER ROLE db_owner ADD MEMBER parking_dev;
   ```

   If the app later fails with "Login failed for user 'parking_dev'", the
   ERRORLOG gives the reason; for a password mismatch, run `ALTER LOGIN
   parking_dev WITH PASSWORD = '…'` with the value from `.env`.

8. **Point `.env` at it.** Back up the Azure `.env` **outside the repo** first
   (only `.env` itself is git-ignored), e.g.
   `Copy-Item .env C:\SqlBackups\.env.azure`. Then set:

   ```env
   AZSQLServer=localhost
   AZSQLDB=<database>_local
   AZSQLPort=1433
   SQL_AUTH=sql
   SQL_USER=parking_dev
   SQL_PASSWORD=your-local-password
   SQL_TRUST_SERVER_CERT=1
   ```

   To go back to Azure: `Copy-Item C:\SqlBackups\.env.azure .env -Force`.

9. **Demo site locally.** The demo pool connects on the first request to
   `DEMO_HOSTNAME`, so that name must resolve to this machine (admin PowerShell):

   ```powershell
   Add-Content -Path C:\Windows\System32\drivers\etc\hosts -Value "`r`n127.0.0.1  parking-demo.local"
   ipconfig /flushdns
   ```

   Then open `http://parking-demo.local:3000`; the console logs
   `[DEMO] Pool connected.`

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
