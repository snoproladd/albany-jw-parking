# Albany JW Parking — Volunteer Management Platform

A full-stack web application that runs the parking operation for a multi-day
regional convention: volunteer registration, shift scheduling, SMS
coordination, attendance, signage logistics, and live capacity tracking.

Built and maintained by a single developer. In production use by real
volunteers during live convention events.

**[Live demo →](https://demo.albanyjwparking.org)** — credentials for each
permission tier are shown on the login page. All demo data is anonymized and
isolated in a separate database schema; outbound email and SMS are suppressed.

---

## What It Does

**Volunteers** register through a multi-step intake flow, set their
availability, view their assigned shifts, and receive SMS reminders before each
one. A passwordless magic-link login (via printed QR code) supports shared
field stations.

**Overseers** build the schedule on a drag-and-drop grid that detects conflicts
in real time — double-bookings, availability blackouts, pre/post-session
overload, understaffing — then publish it as a PDF to SharePoint. An
interactive SVG timeline handles availability editing, snapping to session
boundaries and five-minute intervals.

**Coordinators** run invitation campaigns over email and SMS with RSVP
tracking, check volunteers in at the event, place and map physical signage on a
Google Maps interface with directional traffic arrows and printable field maps,
and log live parking counts from a phone-first tally page that fires threshold
alerts when a garage approaches capacity.

**Everyone** is scoped by an eight-tier role hierarchy with a runtime-editable
permission matrix, so access rules can be adjusted without a deploy.

### Feature Detail

| Area | Capabilities |
|---|---|
| Scheduling | Drag-and-drop grid, auto-routing drops, conflict detection, undo/redo, persisted column layout, PDF publish |
| Availability | Interactive SVG blackout timeline with session-boundary snapping |
| Messaging | Twilio SMS campaigns, T-15 shift alerts, inbound reply routing, email via SMTP |
| Attendance | Check-in kiosk, SMS reply codes, attendance reporting |
| Signage | Sign template library and builder, Google Maps placement, traffic arrows, Street View camera persistence, printable WYSIWYG field maps |
| Capacity | Phone-first tally UI with heartbeat and offline persistence, edge-triggered threshold alerts, stacked-area capacity charts |
| Rendezvous | Per-shift meeting points with GPS and photo, appended to shift alert SMS, public HMAC-gated detail pages |
| Reporting | Conflict grid, slot fill rate, crew attendance, contact directory, garage capacity, lessons-learned PDF workflow |
| Onboarding | Shepherd.js guided tours across 34 pages with per-user dismissal tracking |

### AI Features

Three Azure OpenAI pipelines, each with human confirmation before anything is
applied:

- **Intake note analysis** — summarizes volunteer registration notes into
  categories, action items, and suggested availability blackouts. Results cached
  by SHA-256 hash for staleness detection.
- **Inbound SMS triage** — classifies freeform replies from volunteers, routes
  them into an actionable queue, and alerts overseers.
- **Schedule violation analysis** — a deterministic rule engine runs first;
  the AI layer then enhances each violation with severity, confidence, and a
  suggested fix. Admin-defined scheduling policy rules are injected as mandatory
  context so suggestions cite which rule applied.

A fourth pipeline — free-text interpretation of scheduling constraints — was
built, evaluated in production, and removed in v2.85.0 as redundant with direct
entry. The review-and-apply half was kept.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22+, ES Modules |
| Framework | Express 5 |
| Templating | EJS |
| Database | Azure SQL (MSSQL) — separate schemas for production and demo |
| Sessions | Redis / Azure Cache for Redis (Valkey) |
| Auth | Session-based, PBKDF2 password hashing |
| Frontend | Bootstrap 5, vanilla JS (no bundler), agnostic-draggable, Shepherd.js |
| Integrations | Twilio, Microsoft Graph / SharePoint, Google Maps, Azure OpenAI, Kickbox |
| PDF | Puppeteer |
| Hosting | Azure App Service (Linux container) |
| CI/CD | GitHub Actions → Azure Container Registry |
| Secrets | Azure Key Vault via Managed Identity |

No build step and no frontend framework — one JS module per page, loaded
directly. Every dependency choice is one fewer thing to break during a live
event weekend.

---

## Architecture Highlights

**Demo isolation without a second deployment.** One codebase serves both
environments. `AsyncLocalStorage` propagates a demo flag through the request
pipeline; the connection pool and query layer route on hostname, rewriting
schema prefixes at runtime. Messaging is suppressed in demo context.

**Role hierarchy with runtime overrides.**

```
NON_REGISTERED → COUNTER → REGISTERED → DESK → KEYMAN → OVERSEER → ASSISTANT_ADMIN → ADMIN
```

Defaults live in `src/config/roles.js`; an ADMIN-only permission matrix editor
writes deltas to the database. Individual permissions can also be delegated to
a single volunteer without a role promotion.

**Connection resilience.** Azure kills idle SQL connections at roughly four
minutes. The pool keeps a three-minute keep-alive ping, detects stale pools via
an error handler that forces reconnect, and retries transient failures with
exponential backoff.

**Content Security Policy compliance.** No inline scripts, no inline event
handlers, no inline styles. All JS in `public/js/`, all CSS in
`public/styles/`.

---

## Repository Conventions

- 4-space indentation, ES Modules only, JSDoc on all exported functions
- No logic in EJS templates — data shaping happens in routes before render
- Semantic versioning with a maintained `CHANGELOG.md` (PATCH = fixes,
  MINOR = features, MAJOR = overhauls)
- One SQL migration file per change, targeting both schemas
- Feature branches merged through pull requests

---

## Documentation

| Document | Contents |
|---|---|
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Local setup, environment variables, dev scripts, demo seeding |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Project structure, module conventions, per-feature implementation notes |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Full schema reference and migration conventions |
| [`docs/OVERSIGHT_GUIDE.md`](docs/OVERSIGHT_GUIDE.md) | End-user guide for oversight staff |
| [`CHANGELOG.md`](CHANGELOG.md) | Release history |

---

## License

ISC
