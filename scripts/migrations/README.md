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
| `demo_neutral_branding_demo` | 2026-10-12 | **Demo only, data only** — rewrites faith-specific wording in demo text columns to match `lib/branding.js`. Dry run by default (`@apply = 0`); no `dbo` counterpart by design. |
| `department_membership` | 2026-11-19 | **`multi-department` branch, local only.** Phase 2a, migration 1 of 4: `department_members` table, `volunteer_in.is_convention_admin` / `last_department_id`, every volunteer copied into department 1. Per-department fields are copied, not moved, until phase 2b. |
| `volunteer_notes` | 2026-11-19 | **`multi-department` branch, local only.** Phase 2a, migration 2 of 4: department-specific `volunteer_notes` table; intake notes and dismissals copied from `volunteer_in` into department 1 (old columns kept until phase 2b). |
| `department_scope_columns` | 2026-11-19 | **`multi-department` branch, local only.** Phase 2a, migration 3 of 4: `department_id` on 40 department-owned tables (FK, index, backfill to 1) with default `COALESCE(SESSION_CONTEXT(N'department_id'), 1)`; `volunteer_year_status` key becomes (volunteer_id, year, department_id). `lessons_learned` deferred to phase 2b. |
| `department_switch_role` | 2026-11-20 | **`multi-department` branch, local only.** Phase 2b-3a: re-copies `volunteer_in.role` into department 1 memberships, then drops `volunteer_in.role` — the role now lives only on `department_members`. Run together with the 2b-3a code. |
| `department_switch_active_decently` | 2026-11-20 | **`multi-department` branch, local only.** Phase 2b-3b: re-copies `active_current_year`, the Decently fields and the disapproval fields into department 1 memberships, then drops them from `volunteer_in`. Run together with the 2b-3b code. |
| `department_switch_notes` | 2026-11-20 | **`multi-department` branch, local only.** Phase 2b-3c: re-copies the intake note and dismissal fields into department 1's `volunteer_notes`, then drops `notes`, `note_dismissed`, `note_dismissed_at` and `note_dismissed_by` from `volunteer_in`. Run together with the 2b-3c code. |
| `lessons_learned_department` | 2026-11-20 | **`multi-department` branch, local only.** Phase 2b-3e: renames `lessons_learned.department_id` (the "about" department, → `system_variable_lists`) to `about_department_id`, adds the owning `department_id` (session-context default, FK, index, backfill to 1), and re-keys `lessons_learned_reports` on (year, department_id). Run together with the 2b-3e code. |
