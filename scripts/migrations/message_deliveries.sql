-- =============================================================================
-- message_deliveries.sql   (publish delivery tracking, 2026-11-24)
-- =============================================================================
-- One row per message the app sends that it wants to follow up on. Starts
-- with schedule publishes (source 'publish'); other senders (shift reminders,
-- capacity alerts, campaign invitations) can be added later with no schema
-- change.
--
--   Texts: sent with a Twilio statusCallback; POST /webhook/sms/status updates
--          status / error_code by provider_sid (Twilio's message SID) as
--          Twilio reports queued → sent → delivered, or failed / undelivered.
--   Email: SMTP gives no later status, so the row records 'sent' or 'failed'
--          at send time.
--
-- run_id is the background publish job's id (lib/publishJobs.js), so a test
-- publish (no schedule_publishes row) is still trackable. One run can publish
-- several days and one message covers all of a person's days, so real
-- publishes are linked the other way: schedule_publishes.run_id (added below)
-- names the run each day's publish belonged to.
-- recipient_name / address keep what was used at send time.
--
-- Department rows under row-level security (rls_department). The status
-- webhook runs signed out, i.e. in system scope, so it can update any row.
--
-- LOCAL ONLY (albanyregional3_local) until the multi-department branch ships;
-- then part of the production cutover (after department_rls.sql).
-- Safe to re-run.
-- =============================================================================
SET NOCOUNT ON;
GO

-- =============================================================================
-- dbo
-- =============================================================================
IF OBJECT_ID(N'dbo.message_deliveries', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.message_deliveries (
        id              BIGINT          IDENTITY(1, 1) NOT NULL,
        department_id   INT             NOT NULL,
        source          NVARCHAR(32)    NOT NULL,
        run_id          NVARCHAR(64)    NULL,
        volunteer_id    INT             NULL,
        recipient_name  NVARCHAR(200)   NULL,
        channel         VARCHAR(10)     NOT NULL,
        address         NVARCHAR(320)   NULL,
        provider_sid    VARCHAR(64)     NULL,
        status          VARCHAR(20)     NOT NULL,
        error_code      INT             NULL,
        error_message   NVARCHAR(400)   NULL,
        created_at      DATETIME2(3)    NOT NULL CONSTRAINT df_md_created_at DEFAULT (sysutcdatetime()),
        updated_at      DATETIME2(3)    NOT NULL CONSTRAINT df_md_updated_at DEFAULT (sysutcdatetime()),
        CONSTRAINT PK_message_deliveries PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_md_department FOREIGN KEY (department_id) REFERENCES dbo.departments (id),
        CONSTRAINT FK_md_volunteer  FOREIGN KEY (volunteer_id) REFERENCES dbo.volunteer_in (id) ON DELETE SET NULL,
        CONSTRAINT CK_md_channel CHECK (channel IN ('email', 'sms')),
        CONSTRAINT CK_md_status  CHECK (status IN ('queued', 'accepted', 'sending', 'sent', 'delivered',
                                                   'undelivered', 'failed', 'not_tracked'))
    );

    CREATE INDEX IX_dbo_md_run     ON dbo.message_deliveries (department_id, run_id) INCLUDE (channel, status);
    CREATE UNIQUE INDEX UX_dbo_md_provider_sid ON dbo.message_deliveries (provider_sid)
        WHERE provider_sid IS NOT NULL;

    PRINT 'Created dbo.message_deliveries.';
END
ELSE
    PRINT 'dbo.message_deliveries already exists - skipped.';
GO

-- Earlier draft of this script (run once on 2026-11-24) had a publish_id
-- column; drop it if present (the table is new and empty).
IF COL_LENGTH(N'dbo.message_deliveries', N'publish_id') IS NOT NULL
BEGIN
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_dbo_md_publish' AND object_id = OBJECT_ID(N'dbo.message_deliveries'))
        DROP INDEX IX_dbo_md_publish ON dbo.message_deliveries;
    ALTER TABLE dbo.message_deliveries DROP COLUMN publish_id;
    PRINT 'dbo: dropped message_deliveries.publish_id.';
END
GO

-- schedule_publishes.run_id: the publish job each day's publish belonged to
IF COL_LENGTH(N'dbo.schedule_publishes', N'run_id') IS NULL
BEGIN
    ALTER TABLE dbo.schedule_publishes ADD run_id NVARCHAR(64) NULL;
    PRINT 'dbo: added schedule_publishes.run_id.';
END
ELSE
    PRINT 'dbo: schedule_publishes.run_id already exists - skipped.';
GO

-- Row-level security: department rows (filter + block) -----------------------
IF OBJECT_ID(N'dbo.rls_department', N'SP') IS NULL
    PRINT 'dbo: rls_department missing - run department_rls.sql first.';
ELSE IF EXISTS (SELECT 1 FROM sys.security_predicates sp
                WHERE sp.object_id = OBJECT_ID(N'dbo.rls_department')
                  AND sp.target_object_id = OBJECT_ID(N'dbo.message_deliveries'))
    PRINT 'dbo: message_deliveries already in rls_department.';
ELSE
BEGIN
    EXEC (N'ALTER SECURITY POLICY dbo.rls_department
        ADD FILTER PREDICATE dbo.fn_rls_department(department_id) ON dbo.message_deliveries,
        ADD BLOCK PREDICATE dbo.fn_rls_department(department_id) ON dbo.message_deliveries AFTER INSERT,
        ADD BLOCK PREDICATE dbo.fn_rls_department(department_id) ON dbo.message_deliveries AFTER UPDATE;');
    PRINT 'dbo: message_deliveries added to rls_department.';
END
GO

-- =============================================================================
-- demo
-- =============================================================================
IF SCHEMA_ID(N'demo') IS NOT NULL AND OBJECT_ID(N'demo.message_deliveries', N'U') IS NULL
BEGIN
    CREATE TABLE demo.message_deliveries (
        id              BIGINT          IDENTITY(1, 1) NOT NULL,
        department_id   INT             NOT NULL,
        source          NVARCHAR(32)    NOT NULL,
        run_id          NVARCHAR(64)    NULL,
        volunteer_id    INT             NULL,
        recipient_name  NVARCHAR(200)   NULL,
        channel         VARCHAR(10)     NOT NULL,
        address         NVARCHAR(320)   NULL,
        provider_sid    VARCHAR(64)     NULL,
        status          VARCHAR(20)     NOT NULL,
        error_code      INT             NULL,
        error_message   NVARCHAR(400)   NULL,
        created_at      DATETIME2(3)    NOT NULL CONSTRAINT df_demo_md_created_at DEFAULT (sysutcdatetime()),
        updated_at      DATETIME2(3)    NOT NULL CONSTRAINT df_demo_md_updated_at DEFAULT (sysutcdatetime()),
        CONSTRAINT PK_demo_message_deliveries PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_demo_md_department FOREIGN KEY (department_id) REFERENCES demo.departments (id),
        CONSTRAINT FK_demo_md_volunteer  FOREIGN KEY (volunteer_id) REFERENCES demo.volunteer_in (id) ON DELETE SET NULL,
        CONSTRAINT CK_demo_md_channel CHECK (channel IN ('email', 'sms')),
        CONSTRAINT CK_demo_md_status  CHECK (status IN ('queued', 'accepted', 'sending', 'sent', 'delivered',
                                                        'undelivered', 'failed', 'not_tracked'))
    );

    CREATE INDEX IX_demo_md_run     ON demo.message_deliveries (department_id, run_id) INCLUDE (channel, status);
    CREATE UNIQUE INDEX UX_demo_md_provider_sid ON demo.message_deliveries (provider_sid)
        WHERE provider_sid IS NOT NULL;

    PRINT 'Created demo.message_deliveries.';
END
ELSE
    PRINT 'demo.message_deliveries exists or there is no demo schema - skipped.';
GO

IF COL_LENGTH(N'demo.message_deliveries', N'publish_id') IS NOT NULL
BEGIN
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_demo_md_publish' AND object_id = OBJECT_ID(N'demo.message_deliveries'))
        DROP INDEX IX_demo_md_publish ON demo.message_deliveries;
    ALTER TABLE demo.message_deliveries DROP COLUMN publish_id;
    PRINT 'demo: dropped message_deliveries.publish_id.';
END
GO

IF OBJECT_ID(N'demo.schedule_publishes', N'U') IS NOT NULL AND COL_LENGTH(N'demo.schedule_publishes', N'run_id') IS NULL
BEGIN
    ALTER TABLE demo.schedule_publishes ADD run_id NVARCHAR(64) NULL;
    PRINT 'demo: added schedule_publishes.run_id.';
END
GO

IF OBJECT_ID(N'demo.message_deliveries', N'U') IS NOT NULL
BEGIN
    IF OBJECT_ID(N'demo.rls_department', N'SP') IS NULL
        PRINT 'demo: rls_department missing - run department_rls.sql first.';
    ELSE IF EXISTS (SELECT 1 FROM sys.security_predicates sp
                    WHERE sp.object_id = OBJECT_ID(N'demo.rls_department')
                      AND sp.target_object_id = OBJECT_ID(N'demo.message_deliveries'))
        PRINT 'demo: message_deliveries already in rls_department.';
    ELSE
    BEGIN
        EXEC (N'ALTER SECURITY POLICY demo.rls_department
            ADD FILTER PREDICATE demo.fn_rls_department(department_id) ON demo.message_deliveries,
            ADD BLOCK PREDICATE demo.fn_rls_department(department_id) ON demo.message_deliveries AFTER INSERT,
            ADD BLOCK PREDICATE demo.fn_rls_department(department_id) ON demo.message_deliveries AFTER UPDATE;');
        PRINT 'demo: message_deliveries added to rls_department.';
    END
END
GO

-- =============================================================================
-- Verify: both tables exist and are in their policy
-- =============================================================================
SELECT s.name AS schema_name, t.name AS table_name,
       CASE WHEN EXISTS (SELECT 1 FROM sys.security_predicates sp WHERE sp.target_object_id = t.object_id)
            THEN 'yes' ELSE 'NO' END AS under_rls
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
WHERE t.name = N'message_deliveries';
GO

PRINT '=== message_deliveries.sql complete ===';
GO
