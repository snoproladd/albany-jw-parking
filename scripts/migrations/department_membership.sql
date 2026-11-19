-- =============================================================================
-- department_membership.sql   (multi-department phase 2a, migration 1 of 4)
-- =============================================================================
-- Creates department_members (a person's place in one department) and the two
-- new volunteer_in columns, then copies every volunteer into department 1
-- (Parking) in both the dbo and demo schemas.
--
-- COPY FIRST, MOVE LATER: the per-department fields (role, active_current_year,
-- Decently and disapproval fields) are copied, not moved. They stay on
-- volunteer_in and the app keeps reading them until phase 2b switches the code
-- to memberships; department_cleanup.sql (migration 4) drops them afterwards.
-- Column names match volunteer_in exactly to keep that switch mechanical.
--
-- Not copied here, on purpose:
--   - crew_* flags   -> crews become data in phase 4
--   - extra_* flags  -> become positions in phase 3
--   - deleted_status -> deletion is per person, not per department
--
-- LOCAL ONLY (albanyregional3_local). Never run against albanyregional3.
-- Safe to re-run: every step is guarded; the backfill skips existing members.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. dbo.department_members
-- -----------------------------------------------------------------------------
IF OBJECT_ID('dbo.department_members', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.department_members (
        volunteer_id            INT            NOT NULL,
        department_id           INT            NOT NULL,
        role                    NVARCHAR(40)   NULL,
        active_current_year     BIT            NOT NULL CONSTRAINT df_dm_active_current_year DEFAULT (0),
        decently_import         BIT            NOT NULL CONSTRAINT df_dm_decently_import DEFAULT (0),
        decently_imported_time  DATETIME2(7)   NULL,
        decently_exported       BIT            NOT NULL CONSTRAINT df_dm_decently_exported DEFAULT (0),
        decently_exported_time  DATETIME2(7)   NULL,
        disapproved_year        INT            NULL,
        disapproved_by          NVARCHAR(200)  NULL,
        disapproved_at          DATETIME2(6)   NULL,
        joined_at               DATETIME2(7)   NOT NULL CONSTRAINT df_dm_joined_at DEFAULT (sysutcdatetime()),
        CONSTRAINT PK_department_members PRIMARY KEY CLUSTERED (volunteer_id, department_id),
        CONSTRAINT FK_dm_volunteer FOREIGN KEY (volunteer_id) REFERENCES dbo.volunteer_in (id) ON DELETE CASCADE,
        CONSTRAINT FK_dm_department FOREIGN KEY (department_id) REFERENCES dbo.departments (id)
    );

    CREATE INDEX IX_dbo_dm_department ON dbo.department_members (department_id)
        INCLUDE (role, active_current_year);

    PRINT 'Created dbo.department_members.';
END
ELSE
    PRINT 'dbo.department_members already exists — skipped.';
GO

-- -----------------------------------------------------------------------------
-- 2. dbo.volunteer_in: is_convention_admin, last_department_id
-- -----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.volunteer_in') AND name = 'is_convention_admin')
BEGIN ALTER TABLE dbo.volunteer_in ADD is_convention_admin BIT NOT NULL CONSTRAINT df_volunteer_in_is_convention_admin DEFAULT (0); PRINT 'Added dbo.volunteer_in.is_convention_admin.'; END
ELSE PRINT 'dbo.volunteer_in.is_convention_admin already exists — skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.volunteer_in') AND name = 'last_department_id')
BEGIN
    ALTER TABLE dbo.volunteer_in ADD last_department_id INT NULL
        CONSTRAINT FK_volunteer_in_last_department FOREIGN KEY REFERENCES dbo.departments (id);
    PRINT 'Added dbo.volunteer_in.last_department_id.';
END
ELSE PRINT 'dbo.volunteer_in.last_department_id already exists — skipped.';
GO

-- -----------------------------------------------------------------------------
-- 3. Backfill: every dbo volunteer becomes a member of department 1
-- -----------------------------------------------------------------------------
INSERT INTO dbo.department_members (
    volunteer_id, department_id, role, active_current_year,
    decently_import, decently_imported_time, decently_exported, decently_exported_time,
    disapproved_year, disapproved_by, disapproved_at, joined_at
)
SELECT v.id, 1, v.role, ISNULL(v.active_current_year, 0),
       ISNULL(v.decently_import, 0), v.decently_imported_time,
       ISNULL(v.decently_exported, 0), v.decently_exported_time,
       v.disapproved_year, v.disapproved_by, v.disapproved_at,
       COALESCE(v.registration_completed_at, v.last_updated, sysutcdatetime())
FROM dbo.volunteer_in v
WHERE NOT EXISTS (SELECT 1 FROM dbo.department_members m
                  WHERE m.volunteer_id = v.id AND m.department_id = 1);

PRINT CONCAT('dbo: added ', @@ROWCOUNT, ' department 1 memberships.');
GO

-- -----------------------------------------------------------------------------
-- 4. demo.department_members
-- -----------------------------------------------------------------------------
IF OBJECT_ID('demo.department_members', 'U') IS NULL
BEGIN
    CREATE TABLE demo.department_members (
        volunteer_id            INT            NOT NULL,
        department_id           INT            NOT NULL,
        role                    NVARCHAR(40)   NULL,
        active_current_year     BIT            NOT NULL CONSTRAINT df_dm_active_current_year DEFAULT (0),
        decently_import         BIT            NOT NULL CONSTRAINT df_dm_decently_import DEFAULT (0),
        decently_imported_time  DATETIME2(7)   NULL,
        decently_exported       BIT            NOT NULL CONSTRAINT df_dm_decently_exported DEFAULT (0),
        decently_exported_time  DATETIME2(7)   NULL,
        disapproved_year        INT            NULL,
        disapproved_by          NVARCHAR(200)  NULL,
        disapproved_at          DATETIME2(6)   NULL,
        joined_at               DATETIME2(7)   NOT NULL CONSTRAINT df_dm_joined_at DEFAULT (sysutcdatetime()),
        CONSTRAINT PK_department_members PRIMARY KEY CLUSTERED (volunteer_id, department_id),
        CONSTRAINT FK_dm_volunteer FOREIGN KEY (volunteer_id) REFERENCES demo.volunteer_in (id) ON DELETE CASCADE,
        CONSTRAINT FK_dm_department FOREIGN KEY (department_id) REFERENCES demo.departments (id)
    );

    CREATE INDEX IX_demo_dm_department ON demo.department_members (department_id)
        INCLUDE (role, active_current_year);

    PRINT 'Created demo.department_members.';
END
ELSE
    PRINT 'demo.department_members already exists — skipped.';
GO

-- -----------------------------------------------------------------------------
-- 5. demo.volunteer_in: is_convention_admin, last_department_id
-- -----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('demo.volunteer_in') AND name = 'is_convention_admin')
BEGIN ALTER TABLE demo.volunteer_in ADD is_convention_admin BIT NOT NULL CONSTRAINT df_volunteer_in_is_convention_admin DEFAULT (0); PRINT 'Added demo.volunteer_in.is_convention_admin.'; END
ELSE PRINT 'demo.volunteer_in.is_convention_admin already exists — skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('demo.volunteer_in') AND name = 'last_department_id')
BEGIN
    ALTER TABLE demo.volunteer_in ADD last_department_id INT NULL
        CONSTRAINT FK_volunteer_in_last_department FOREIGN KEY REFERENCES demo.departments (id);
    PRINT 'Added demo.volunteer_in.last_department_id.';
END
ELSE PRINT 'demo.volunteer_in.last_department_id already exists — skipped.';
GO

-- -----------------------------------------------------------------------------
-- 6. Backfill: every demo volunteer becomes a member of department 1
-- -----------------------------------------------------------------------------
INSERT INTO demo.department_members (
    volunteer_id, department_id, role, active_current_year,
    decently_import, decently_imported_time, decently_exported, decently_exported_time,
    disapproved_year, disapproved_by, disapproved_at, joined_at
)
SELECT v.id, 1, v.role, ISNULL(v.active_current_year, 0),
       ISNULL(v.decently_import, 0), v.decently_imported_time,
       ISNULL(v.decently_exported, 0), v.decently_exported_time,
       v.disapproved_year, v.disapproved_by, v.disapproved_at,
       COALESCE(v.registration_completed_at, v.last_updated, sysutcdatetime())
FROM demo.volunteer_in v
WHERE NOT EXISTS (SELECT 1 FROM demo.department_members m
                  WHERE m.volunteer_id = v.id AND m.department_id = 1);

PRINT CONCAT('demo: added ', @@ROWCOUNT, ' department 1 memberships.');
GO

-- -----------------------------------------------------------------------------
-- 7. Verify: membership must mirror volunteer_in exactly (mismatches = 0)
-- -----------------------------------------------------------------------------
SELECT 'dbo' AS schema_name,
       (SELECT COUNT(*) FROM dbo.volunteer_in) AS volunteers,
       (SELECT COUNT(*) FROM dbo.department_members WHERE department_id = 1) AS dept1_members,
       (SELECT COUNT(*) FROM dbo.volunteer_in v JOIN dbo.department_members m ON m.volunteer_id = v.id AND m.department_id = 1
         WHERE ISNULL(v.role, N'') <> ISNULL(m.role, N'')
            OR ISNULL(v.active_current_year, 0) <> m.active_current_year
            OR ISNULL(v.decently_import, 0) <> m.decently_import
            OR ISNULL(v.decently_exported, 0) <> m.decently_exported
            OR ISNULL(v.disapproved_year, -1) <> ISNULL(m.disapproved_year, -1)) AS mismatches
UNION ALL
SELECT 'demo',
       (SELECT COUNT(*) FROM demo.volunteer_in),
       (SELECT COUNT(*) FROM demo.department_members WHERE department_id = 1),
       (SELECT COUNT(*) FROM demo.volunteer_in v JOIN demo.department_members m ON m.volunteer_id = v.id AND m.department_id = 1
         WHERE ISNULL(v.role, N'') <> ISNULL(m.role, N'')
            OR ISNULL(v.active_current_year, 0) <> m.active_current_year
            OR ISNULL(v.decently_import, 0) <> m.decently_import
            OR ISNULL(v.decently_exported, 0) <> m.decently_exported
            OR ISNULL(v.disapproved_year, -1) <> ISNULL(m.disapproved_year, -1));
GO

PRINT '=== department_membership.sql complete ===';
GO
