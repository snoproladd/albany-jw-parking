# Database Migrations

SQL migration scripts for schema changes to the `albanyregional3` database.

## Convention

Every migration ships as **two files** — one for each schema:

| File | Target |
|---|---|
| `migration_name.sql` | `dbo` schema (production) |
| `migration_name_demo.sql` | `demo` schema (employer demo) |

Always run `dbo` first, then `demo`. Both are safe to re-run — all
`ALTER TABLE` and `CREATE TABLE` statements are guarded with
`IF NOT EXISTS` checks.

## Naming

Use snake_case, descriptive, no version numbers:

```
addDepartmentId.sql
addDepartmentId_demo.sql
addResponseConfig.sql
addResponseConfig_demo.sql
```

## Migration log

| Migration | Date | Description |
|---|---|---|
| `addDepartmentId` | 2026-05-27 | Add `department_id INT NULL DEFAULT(1)` to 9 core tables + create `departments` lookup table. Placeholder for future multi-department support. |
| `addResponseConfig` | 2026-05-27 | Add `response_config` (JSON) to `invitation_batches` and `response_other` to `invitations` for dynamic RSVP. |
| `addCrewDesk` | 2026-06-16 | Add `crew_desk BIT` to `volunteer_in` for Desk department crew assignment. |
| `capacity_alert_last_sent` | 2026-11-25 | **One file for both schemas.** Adds `capacity_alert_rules.last_sent_at DATETIME2(3) NULL`, which the 5-minute resend cooldown (v2.81.0) reads and writes but no migration ever created; without it no capacity alert could fire. Run on production 2026-11-25 (v2.89.2). Safe to re-run. |
| `demo_neutral_branding_demo` | 2026-10-12 | **Demo only, data only** — rewrites faith-specific wording in demo text columns to match `lib/branding.js`. Dry run by default (`@apply = 0`); no `dbo` counterpart by design. |
