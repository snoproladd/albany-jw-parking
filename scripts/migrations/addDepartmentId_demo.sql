-- =============================================================================
-- addDepartmentId_demo.sql
-- =============================================================================
-- Mirrors addDepartmentId.sql for the demo schema.
-- Run after addDepartmentId.sql against albanyregional3.
-- Safe to re-run — all changes guarded with IF NOT EXISTS checks.
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id WHERE t.name = 'departments' AND s.name = 'demo')
BEGIN
    CREATE TABLE demo.departments (
        id           INT IDENTITY(1,1) NOT NULL,
        name         NVARCHAR(100)     NOT NULL,
        slug         NVARCHAR(50)      NOT NULL,
        description  NVARCHAR(500)     NULL,
        active       BIT               NOT NULL CONSTRAINT df_demo_departments_active DEFAULT (1),
        created_at   DATETIME2(7)      NOT NULL CONSTRAINT df_demo_departments_created_at DEFAULT (sysutcdatetime()),
        CONSTRAINT pk_demo_departments PRIMARY KEY CLUSTERED (id),
        CONSTRAINT uq_demo_departments_slug UNIQUE (slug)
    );
    SET IDENTITY_INSERT demo.departments ON;
    INSERT INTO demo.departments (id, name, slug, description)
    VALUES (1, 'Albany JW Regional Convention Parking', 'parking', 'Volunteer parking team for the Albany JW Regional Convention');
    SET IDENTITY_INSERT demo.departments OFF;
    PRINT 'Created demo.departments and seeded department 1 (parking).';
END
ELSE PRINT 'demo.departments already exists — skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('demo.volunteer_in') AND name = 'department_id')
BEGIN ALTER TABLE demo.volunteer_in ADD department_id INT NULL CONSTRAINT df_demo_volunteer_in_department_id DEFAULT (1); PRINT 'Added department_id to demo.volunteer_in.'; END
ELSE PRINT 'demo.volunteer_in.department_id already exists — skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('demo.locations_tasks') AND name = 'department_id')
BEGIN ALTER TABLE demo.locations_tasks ADD department_id INT NULL CONSTRAINT df_demo_locations_tasks_department_id DEFAULT (1); PRINT 'Added department_id to demo.locations_tasks.'; END
ELSE PRINT 'demo.locations_tasks.department_id already exists — skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('demo.event_types') AND name = 'department_id')
BEGIN ALTER TABLE demo.event_types ADD department_id INT NULL CONSTRAINT df_demo_event_types_department_id DEFAULT (1); PRINT 'Added department_id to demo.event_types.'; END
ELSE PRINT 'demo.event_types.department_id already exists — skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('demo.convention_days') AND name = 'department_id')
BEGIN ALTER TABLE demo.convention_days ADD department_id INT NULL CONSTRAINT df_demo_convention_days_department_id DEFAULT (1); PRINT 'Added department_id to demo.convention_days.'; END
ELSE PRINT 'demo.convention_days.department_id already exists — skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('demo.sessions') AND name = 'department_id')
BEGIN ALTER TABLE demo.sessions ADD department_id INT NULL CONSTRAINT df_demo_sessions_department_id DEFAULT (1); PRINT 'Added department_id to demo.sessions.'; END
ELSE PRINT 'demo.sessions.department_id already exists — skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('demo.shifts') AND name = 'department_id')
BEGIN ALTER TABLE demo.shifts ADD department_id INT NULL CONSTRAINT df_demo_shifts_department_id DEFAULT (1); PRINT 'Added department_id to demo.shifts.'; END
ELSE PRINT 'demo.shifts.department_id already exists — skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('demo.invitation_batches') AND name = 'department_id')
BEGIN ALTER TABLE demo.invitation_batches ADD department_id INT NULL CONSTRAINT df_demo_invitation_batches_department_id DEFAULT (1); PRINT 'Added department_id to demo.invitation_batches.'; END
ELSE PRINT 'demo.invitation_batches.department_id already exists — skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('demo.command_hierarchy') AND name = 'department_id')
BEGIN ALTER TABLE demo.command_hierarchy ADD department_id INT NULL CONSTRAINT df_demo_command_hierarchy_department_id DEFAULT (1); PRINT 'Added department_id to demo.command_hierarchy.'; END
ELSE PRINT 'demo.command_hierarchy.department_id already exists — skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('demo.message_templates') AND name = 'department_id')
BEGIN ALTER TABLE demo.message_templates ADD department_id INT NULL CONSTRAINT df_demo_message_templates_department_id DEFAULT (1); PRINT 'Added department_id to demo.message_templates.'; END
ELSE PRINT 'demo.message_templates.department_id already exists — skipped.';
GO

-- Verify
SELECT t.name AS table_name, c.name AS column_name, c.is_nullable, dc.definition AS default_value
FROM sys.columns c
JOIN sys.tables t  ON t.object_id = c.object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE s.name = 'demo' AND c.name = 'department_id'
ORDER BY t.name;
GO

SELECT * FROM demo.departments;
GO

PRINT '=== addDepartmentId_demo.sql complete ===';
GO
