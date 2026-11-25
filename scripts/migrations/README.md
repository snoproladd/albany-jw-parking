# Database Migrations

SQL migration scripts for schema changes to the `albanyregional3` database.

## Convention

New migrations ship as **one file that targets both schemas** — `dbo`
(production) first, then `demo` (employer demo) — with `GO` between batches.
Every `ALTER TABLE`, `CREATE TABLE` and data backfill is guarded
(`IF NOT EXISTS` / `NOT EXISTS`), so a file is safe to re-run.

Older migrations ship as two files (`migration_name.sql` for `dbo`,
`migration_name_demo.sql` for `demo`); run `dbo` first, then `demo`.

Migrations for the `multi-department` branch run **only against the local
SQL Server copy** (`albanyregional3_local`, see `docs/DEVELOPMENT.md` →
"Local SQL Server"), never against `albanyregional3`, until that branch
ships.

## Naming

Use snake_case, descriptive, no version numbers:

```
department_membership.sql
addResponseConfig.sql
addResponseConfig_demo.sql
```

## Migration log

| Migration | Date | Description |
|---|---|---|
| `addDepartmentId` | 2026-05-27 | Add `department_id INT NULL DEFAULT(1)` to 9 core tables + create `departments` lookup table. Placeholder for future multi-department support. Corrected 2026-11-19 to one file covering both schemas (typo fixed, `event_types` removed); `addDepartmentId_demo.sql` removed. |
| `addResponseConfig` | 2026-05-27 | Add `response_config` (JSON) to `invitation_batches` and `response_other` to `invitations` for dynamic RSVP. |
| `addCrewDesk` | 2026-06-16 | Add `crew_desk BIT` to `volunteer_in` for Desk department crew assignment. |
| `capacity_alert_last_sent` | 2026-11-25 | **One file for both schemas.** Adds `capacity_alert_rules.last_sent_at DATETIME2(3) NULL`, which the 5-minute resend cooldown (v2.81.0) reads and writes but no migration ever created; without it no capacity alert could fire. Run on production 2026-11-25 (v2.89.2). Safe to re-run. |
| `demo_neutral_branding_demo` | 2026-10-12 | **Demo only, data only** — rewrites faith-specific wording in demo text columns to match `lib/branding.js`. Dry run by default (`@apply = 0`); no `dbo` counterpart by design. |
| `department_membership` | 2026-11-19 | **`multi-department` branch, local only.** Phase 2a, migration 1 of 4: `department_members` table, `volunteer_in.is_convention_admin` / `last_department_id`, every volunteer copied into department 1. Per-department fields are copied, not moved, until phase 2b. |
| `volunteer_notes` | 2026-11-19 | **`multi-department` branch, local only.** Phase 2a, migration 2 of 4: department-specific `volunteer_notes` table; intake notes and dismissals copied from `volunteer_in` into department 1 (old columns kept until phase 2b). |
| `department_scope_columns` | 2026-11-19 | **`multi-department` branch, local only.** Phase 2a, migration 3 of 4: `department_id` on 40 department-owned tables (FK, index, backfill to 1) with default `COALESCE(SESSION_CONTEXT(N'department_id'), 1)`; `volunteer_year_status` key becomes (volunteer_id, year, department_id). `lessons_learned` deferred to phase 2b. |
| `department_switch_role` | 2026-11-20 | **`multi-department` branch, local only.** Phase 2b-3a: re-copies `volunteer_in.role` into department 1 memberships, then drops `volunteer_in.role` — the role now lives only on `department_members`. Run together with the 2b-3a code. |
| `department_switch_active_decently` | 2026-11-20 | **`multi-department` branch, local only.** Phase 2b-3b: re-copies `active_current_year`, the Decently fields and the disapproval fields into department 1 memberships, then drops them from `volunteer_in`. Run together with the 2b-3b code. |
| `department_switch_notes` | 2026-11-20 | **`multi-department` branch, local only.** Phase 2b-3c: re-copies the intake note and dismissal fields into department 1's `volunteer_notes`, then drops `notes`, `note_dismissed`, `note_dismissed_at` and `note_dismissed_by` from `volunteer_in`. Run together with the 2b-3c code. |
| `lessons_learned_department` | 2026-11-20 | **`multi-department` branch, local only.** Phase 2b-3e: renames `lessons_learned.department_id` (the "about" department, → `system_variable_lists`) to `about_department_id`, adds the owning `department_id` (session-context default, FK, index, backfill to 1), and re-keys `lessons_learned_reports` on (year, department_id). Run together with the 2b-3e code. |
| `department_hardening` | 2026-11-20 | **`multi-department` branch, local only.** Phase 2 hardening part 1: drops the `department_id` placeholders from the shared tables `volunteer_in`, `convention_days` and `sessions`; makes every remaining `department_id` NOT NULL (default still falls back to 1 until the end of 2c); widens the `volunteer_note_reads` unique key to (volunteer_id, read_by, department_id). `demo.event_types` stays until `seedDemo.js` is reworked. |
| `department_rls` | 2026-11-20 | **`multi-department` branch, local only.** Phase 2c-1: department 2 "Volunteer Services"; predicate functions `fn_rls_department` / `fn_rls_member`; security policy `rls_department` per schema (filter + block on every department table, block on `department_members`, filter on `volunteer_in`), created **OFF**. Re-run after adding `department_id` to a new table (it recreates the policy OFF). |
| `department_rls_enable` | 2026-11-20 | **`multi-department` branch, local only.** Phase 2c-3: switches `rls_department` ON in both schemas (rollback lines in the file header). Admin sessions then need `EXEC sp_set_session_context N'scope', N'system';` to see department rows. In production this is the last step of the cutover. |
| `department_short_names` | 2026-11-20 | **`multi-department` branch, local only.** Phase 2c-3: renames department 1 to "Parking" in both schemas (the name is shown in the navbar department switcher; the long wording stays in `description`). |
| `department_default_strict` | 2026-11-20 | **`multi-department` branch, local only.** Phase 2c-4: recreates every `department_id` default as `CAST(SESSION_CONTEXT(N'department_id') AS INT)` with no fallback to 1, so an insert without a department fails on NOT NULL instead of landing in department 1. Run together with the 2c-4 code (dbSync filters lose their fallback; signed-out requests get department 1 from `resolveDepartment.js`). |
| `positions` | 2026-11-23 | **`multi-department` branch, local only.** Phase 3c: `positions`, `position_permissions`, `member_positions` (both schemas, added to `rls_department`). Tables only — then run `node --env-file=.env scripts/seedPositions.js` (and `--demo`) to create each department's starting positions from today's roles and saved Permission Matrix changes, and `scripts/verifyPositions.js` to check them. |
| `capacity_alert_positions` | 2026-11-23 | **`multi-department` branch, local only.** Phase 3d-5: `capacity_alert_positions` (rule → position, both schemas, added to `rls_department`); filled from each rule's `recipient_role` (that tier and up). Capacity alerts now notify the positions ticked on each rule; `recipient_role` stays unused until 3d-8. Run after `positions` and `seedPositions.js`. |
| `position_grants` | 2026-11-23 | **`multi-department` branch, local only.** Phase 3d-7a: `positions.tier` (filled from `legacy_role` / `legacy_extra`), `member_permissions` (individual grants, optional expiry), `permission_grant_log`, and the yearly history tables `member_position_history`, `member_permission_history`, `oversight_structure_history` (both schemas, added to `rls_department`). **Run before starting the 3d-7a code**: sign-in and the freshness check read `member_permissions`. |
| `position_edit_log` | 2026-11-23 | **`multi-department` branch, local only.** Phase 3d-7c: adds the action `position-edit` to `permission_grant_log` (both schemas), so creating, editing, retiring and reactivating a position on the Positions page is logged. Run before using the position editor. |
| `default_positions_backfill` | 2026-11-23 | **`multi-department` branch, local only.** Phase 3d-8 step 1: gives the default Volunteer position to every member with a completed registration who holds no position (both schemas; logged as `position-add`). Fixes self-registered volunteers, whose membership role is NULL and who were missed by the role sync and the 3d-7d default-position check. Safe to re-run. |
| `message_deliveries` | 2026-11-24 | **`multi-department` branch, local only.** Delivery tracking: `message_deliveries` (one row per text or email the app follows up on; Twilio status callbacks update texts) and `schedule_publishes.run_id` (both schemas, added to `rls_department`). Used by schedule publishes and, from `campaign_sends`, Campaign Center sends. |
| `campaign_sends` | 2026-11-24 | **`multi-department` branch, local only.** Invitation Tracker send history: `campaign_sends` (one row per Campaign Center send, with the message as written) and `campaign_send_recipients` (who each send went to, or why not), both schemas, added to `rls_department`. Backfills campaigns sent earlier from `invitations` (flagged `is_backfill`). Run after `message_deliveries`, with the system scope set. Safe to re-run. |
| `rsvp_changes` | 2026-11-25 | **`multi-department` branch, local only.** RSVP page: `invitation_batches.respond_by` (optional Respond-by date) and, on `invitations`, the previous answer, when and how often it changed, and where the answer came from (`link`, `text`, `oversight`). Both schemas; no new tables. Run after `campaign_sends`. Safe to re-run. |
| `alert_delivery_tracking` | 2026-11-25 | **`multi-department` branch, local only.** Delivery tracking for shift reminders, capacity alerts and meet-up alerts: adds `capacity_alert_log.run_id` (both schemas; no new tables). Shift reminders link to `message_deliveries` through `shift_alert_log.twilio_sid`. Run after `message_deliveries`. Production also needs the App Service setting `APP_BASE_URL=https://albanyjwparking.org`. Safe to re-run. |
| `capacity_alert_last_sent` | 2026-11-25 | **Missing column from v2.81.0.** Adds `capacity_alert_rules.last_sent_at` (both schemas), which the 5-minute resend cooldown reads and writes but no migration ever created. Without it every count's rule lookup fails and no capacity alert fires. Needed on production too (check first: `SELECT COL_LENGTH('dbo.capacity_alert_rules', 'last_sent_at');` returns NULL when missing). Safe to re-run. |
