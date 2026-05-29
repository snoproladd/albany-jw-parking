-- =============================================================================
-- addDepartmentId.sql
-- =============================================================================
-- Adds a nullable department_id INT column (DEFAULT 1) to the core tables
-- that define organizational scope. Nullable + DEFAULT 1 means:
--   - All existing rows silently belong to department 1 (Albany Parking)
--   - All existing INSERT statements continue to work without modification
--   - Future multi-department use just needs to pass the correct value
--
-- A departments lookup table is created first so department_id has something
-- to reference. FK constraint is intentionally omitted for now — we don't
-- want cascading deletes or constraint errors while the column is just a
-- placeholder. Add the FK when multi-department is actually built out.
--
-- Run once against albanyregional3 as admin user.
-- Safe to re-run — all changes are guarded with IF NOT EXISTS checks.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Create departments lookup table
-- -----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables t
               JOIN sys.schemas s ON s.schema_id = t.schema_id
               WHERE t.name = 'departments' AND s.name = 'dbo')
BEGIN
    CREATE TABLE dbo.departments (
        id           INT IDENTITY(1,1) NOT NULL,
        name         NVARCHAR(100)     NOT NULL,
        slug         NVARCHAR(50)      NOT NULL,
        description  NVARCHAR(500)     NULL,
        active       BIT               NOT NULL CONSTRAINT df_departments_active DEFAULT (1),
        created_at   DATETIME2(7)      NOT NULL CONSTRAINT df_departments_created_at DEFAULT (sysutcdatetime()),
        CONSTRAINT pk_departments PRIMARY KEY CLUSTERED (id),
        CONSTRAINT uq_departments_slug UNIQUE (slug)
    );

    SET IDENTITY_INSERT dbo.departments ON;
    INSERT INTO dbo.departments (id, name, slug, description)
    VALUES (1, 'Albany JW Regional Convention Parking', 'parking',
            'Volunteer parking team for the Albany JW Regional Convention');
    SET IDENTITY_INSERT dbo.departments OFF;

    PRINT 'Created dbo.departments and seeded department 1 (parking).';
END
ELSE
    PRINT 'dbo.departments already exists — skipped.';
GO

-- -----------------------------------------------------------------------------
-- 2. Add department_id to core tables
-- -----------------------------------------------------------------------------

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.volunteer_in') AND name = 'department_id')
BEGIN ALTER TABLE dbo.volunteer_in ADD department_id INT NULL CONSTRAINT df_volunteer_in_department_id DEFAULT (1); PRINT 'Added department_id to dbo.volunteer_in.'; END
ELSE PRINT 'dbo.volunteer_in.department_id already exists — skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.locations_tasks') AND name = 'department_id')
BEGIN ALTER TABLE dbo.locations_tasks ADD department_id INT NULL CONSTRAINT df_locations_tasks_department_id DEFAULT (1); PRINT 'Added department_id to dbo.locations_tasks.'; END
ELSE PRINT 'dbo.locations_tasks.department_id already exists — skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.event_types') AND name = 'department_id')
BEGIN ALTER TABLE dbo.event_types ADD department_id INT NULL CONSTRAINT df_event_types_department_id DEFAULT (1); PRINT 'Added department_id to dbo.event_types.'; END
ELSE PRINT 'dbo.event_types.department_id already exists — skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.convention_days') AND name = 'department_id')
BEGIN ALTER TABLE dbo.convention_days ADD department_id INT NULL CONSTRAINT df_convention_days_department_id DEFAULT (1); PRINT 'Added department_id to dbo.convention_days.'; END
ELSE PRINT 'dbo.convention_days.department_id already exists — skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.sessions') AND name = 'department_id')
BEGIN ALTER TABLE dbo.sessions ADD department_id INT NULL CONSTRAINT df_sessions_department_id DEFAULT (1); PRINT 'Added department_id to dbo.sessions.'; END
ELSE PRINT 'dbo.sessions.department_id already exists — skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.shifts') AND name = 'department_id')
BEGIN ALTER TABLE dbo.shifts ADD department_id INT NULL CONSTRAINT df_shifts_department_id DEFAULT (1); PRINT 'Added department_id to dbo.shifts.'; END
ELSE PRINT 'dbo.shifts.department_id already exists — skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.invitation_batches') AND name = 'department_id')
BEGIN ALTER TABLE dbo.invitation_batches ADD department_id INT NULL CONSTRAINT df_invitation_batches_department_id DEFAULT (1); PRINT 'Added department_id to dbo.invitation_batches.'; END
ELSE PRINT 'dbo.invitation_batches.department_id already exists — skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.oversightstructure') AND name = 'department_id')
BEGIN ALTER TABLE dbo.oversight structureADD department_id INT NULL CONSTRAINT df_oversightstructure_department_id DEFAULT (1); PRINT 'Added department_id to dbo.oversightstructure.'; END
ELSE PRINT 'dbo.oversightstructure.department_id already exists — skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.message_templates') AND name = 'department_id')
BEGIN ALTER TABLE dbo.message_templates ADD department_id INT NULL CONSTRAINT df_message_templates_department_id DEFAULT (1); PRINT 'Added department_id to dbo.message_templates.'; END
ELSE PRINT 'dbo.message_templates.department_id already exists — skipped.';
GO

-- -----------------------------------------------------------------------------
-- 3. Verify
-- -----------------------------------------------------------------------------
SELECT t.name AS table_name, c.name AS column_name, c.is_nullable, dc.definition AS default_value
FROM sys.columns c
JOIN sys.tables t  ON t.object_id = c.object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE s.name = 'dbo' AND c.name = 'department_id'
ORDER BY t.name;
GO

SELECT * FROM dbo.departments;
GO

PRINT '=== addDepartmentId.sql complete ===';
GO
