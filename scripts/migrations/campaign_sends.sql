-- =============================================================================
-- campaign_sends.sql   (Invitation Tracker grouped by message, 2026-11-24)
-- =============================================================================
-- Records every Campaign Center send as its own row, so the Invitation Tracker
-- can show each campaign as one card with its sends in order (the original,
-- people added later, each reminder) and who each send went to.
--
--   campaign_sends            one row per press of Send: the message exactly
--                             as written (merge fields not filled in), the
--                             channels, who sent it and when, and the counts.
--                             run_id links the texts and emails it produced in
--                             dbo.message_deliveries (source 'campaign').
--   campaign_send_recipients  one row per person in that send: what they were
--                             sent ('sent', 'email_only') or why not
--                             ('skipped', 'error').
--
-- Backfill: campaigns sent before this script have no send history. For each
-- such campaign, invitations sent within 10 minutes of each other become one
-- send (the first is the original, later ones are "added"), and the most
-- recent reminder of each invitation becomes a reminder send. Backfilled sends
-- are flagged is_backfill = 1: their message is the campaign's saved text, not
-- necessarily the exact text sent, and earlier reminders were never recorded.
-- The backfill only touches campaigns with no sends yet, so it is safe to
-- re-run.
--
-- Department rows under row-level security (rls_department). Run it locally
-- with the system scope set first:
--   EXEC sp_set_session_context @key = N'scope', @value = N'system';
--
-- LOCAL ONLY (albanyregional3_local) until the multi-department branch ships;
-- then part of the production cutover (after message_deliveries.sql).
-- Safe to re-run.
-- =============================================================================
SET NOCOUNT ON;
GO

-- =============================================================================
-- dbo
-- =============================================================================
IF OBJECT_ID(N'dbo.invitation_batches', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.campaign_sends', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.campaign_sends (
        id               INT             IDENTITY(1, 1) NOT NULL,
        department_id    INT             NOT NULL,
        batch_id         INT             NOT NULL,
        kind             VARCHAR(12)     NOT NULL,
        message_subject  NVARCHAR(255)   NULL,
        message_body     NVARCHAR(MAX)   NULL,
        channels         VARCHAR(10)     NULL,
        sent_by          NVARCHAR(100)   NULL,
        sent_at          DATETIME2(3)    NOT NULL CONSTRAINT df_dbo_cs_sent_at DEFAULT (sysutcdatetime()),
        run_id           NVARCHAR(64)    NULL,
        recipient_count  INT             NOT NULL CONSTRAINT df_dbo_cs_recipients DEFAULT (0),
        sent_count       INT             NOT NULL CONSTRAINT df_dbo_cs_sent DEFAULT (0),
        skipped_count    INT             NOT NULL CONSTRAINT df_dbo_cs_skipped DEFAULT (0),
        error_count      INT             NOT NULL CONSTRAINT df_dbo_cs_errors DEFAULT (0),
        is_backfill      BIT             NOT NULL CONSTRAINT df_dbo_cs_backfill DEFAULT (0),
        CONSTRAINT PK_dbo_campaign_sends PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_dbo_cs_department FOREIGN KEY (department_id) REFERENCES dbo.departments (id),
        CONSTRAINT FK_dbo_cs_batch FOREIGN KEY (batch_id) REFERENCES dbo.invitation_batches (id) ON DELETE CASCADE,
        CONSTRAINT CK_dbo_cs_kind CHECK (kind IN ('original', 'added', 'reminder')),
        CONSTRAINT CK_dbo_cs_channels CHECK (channels IS NULL OR channels IN ('email', 'sms', 'both'))
    );

    CREATE INDEX IX_dbo_cs_batch ON dbo.campaign_sends (department_id, batch_id, sent_at);
    CREATE INDEX IX_dbo_cs_run   ON dbo.campaign_sends (run_id) WHERE run_id IS NOT NULL;

    PRINT 'Created dbo.campaign_sends.';
END
ELSE
    PRINT 'dbo.campaign_sends exists or dbo.invitation_batches is missing - skipped.';
GO

IF OBJECT_ID(N'dbo.campaign_sends', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.campaign_send_recipients', N'U') IS NULL
BEGIN
    -- invitation_id and volunteer_id are deliberately not foreign keys: the
    -- invitations of a deleted day or shift are deleted, and the record of
    -- who was sent what should outlive them.
    CREATE TABLE dbo.campaign_send_recipients (
        id               BIGINT          IDENTITY(1, 1) NOT NULL,
        department_id    INT             NOT NULL,
        send_id          INT             NOT NULL,
        volunteer_id     INT             NULL,
        invitation_id    INT             NULL,
        recipient_name   NVARCHAR(200)   NULL,
        channel          VARCHAR(10)     NULL,
        outcome          VARCHAR(12)     NOT NULL,
        reason           NVARCHAR(200)   NULL,
        CONSTRAINT PK_dbo_campaign_send_recipients PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_dbo_csr_send FOREIGN KEY (send_id) REFERENCES dbo.campaign_sends (id) ON DELETE CASCADE,
        CONSTRAINT CK_dbo_csr_outcome CHECK (outcome IN ('sent', 'email_only', 'skipped', 'error')),
        CONSTRAINT CK_dbo_csr_channel CHECK (channel IS NULL OR channel IN ('email', 'sms', 'both'))
    );

    CREATE INDEX IX_dbo_csr_send ON dbo.campaign_send_recipients (send_id) INCLUDE (volunteer_id, outcome);

    PRINT 'Created dbo.campaign_send_recipients.';
END
ELSE
    PRINT 'dbo.campaign_send_recipients exists or dbo.campaign_sends is missing - skipped.';
GO

-- Row-level security: department rows (filter + block) -----------------------
IF OBJECT_ID(N'dbo.campaign_sends', N'U') IS NOT NULL
BEGIN
    IF OBJECT_ID(N'dbo.rls_department', N'SP') IS NULL
        PRINT 'dbo: rls_department missing - run department_rls.sql first.';
    ELSE
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM sys.security_predicates sp
                       WHERE sp.object_id = OBJECT_ID(N'dbo.rls_department')
                         AND sp.target_object_id = OBJECT_ID(N'dbo.campaign_sends'))
        BEGIN
            EXEC (N'ALTER SECURITY POLICY dbo.rls_department
                ADD FILTER PREDICATE dbo.fn_rls_department(department_id) ON dbo.campaign_sends,
                ADD BLOCK PREDICATE dbo.fn_rls_department(department_id) ON dbo.campaign_sends AFTER INSERT,
                ADD BLOCK PREDICATE dbo.fn_rls_department(department_id) ON dbo.campaign_sends AFTER UPDATE;');
            PRINT 'dbo: campaign_sends added to rls_department.';
        END
        IF NOT EXISTS (SELECT 1 FROM sys.security_predicates sp
                       WHERE sp.object_id = OBJECT_ID(N'dbo.rls_department')
                         AND sp.target_object_id = OBJECT_ID(N'dbo.campaign_send_recipients'))
        BEGIN
            EXEC (N'ALTER SECURITY POLICY dbo.rls_department
                ADD FILTER PREDICATE dbo.fn_rls_department(department_id) ON dbo.campaign_send_recipients,
                ADD BLOCK PREDICATE dbo.fn_rls_department(department_id) ON dbo.campaign_send_recipients AFTER INSERT,
                ADD BLOCK PREDICATE dbo.fn_rls_department(department_id) ON dbo.campaign_send_recipients AFTER UPDATE;');
            PRINT 'dbo: campaign_send_recipients added to rls_department.';
        END
    END
END
GO

-- Backfill: campaigns with invitations but no sends yet -----------------------
IF OBJECT_ID(N'dbo.campaign_send_recipients', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.invitations', N'U') IS NOT NULL
BEGIN
    DECLARE @sends INT, @people INT;

    IF OBJECT_ID(N'tempdb..#inv') IS NOT NULL DROP TABLE #inv;

    -- Invitations of campaigns with no sends, grouped into sends: a gap of
    -- more than 10 minutes since the previous invitation starts a new one.
    ;WITH todo AS (
        SELECT i.id, i.batch_id, i.department_id, i.volunteer_id, i.sent_at,
               i.channel, i.sent_by, v.lastName, v.firstName,
               LAG(i.sent_at) OVER (PARTITION BY i.batch_id ORDER BY i.sent_at, i.id) AS prev_at
        FROM dbo.invitations i
        LEFT JOIN dbo.volunteer_in v ON v.id = i.volunteer_id
        WHERE i.batch_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM dbo.campaign_sends cs WHERE cs.batch_id = i.batch_id)
    )
    SELECT id, batch_id, department_id, volunteer_id, sent_at, channel, sent_by,
           CONCAT(lastName, N', ', firstName) AS recipient_name,
           SUM(CASE WHEN prev_at IS NULL OR DATEDIFF(SECOND, prev_at, sent_at) > 600 THEN 1 ELSE 0 END)
               OVER (PARTITION BY batch_id ORDER BY sent_at, id ROWS UNBOUNDED PRECEDING) AS grp
    INTO #inv
    FROM todo;

    BEGIN TRANSACTION;

    -- Original and added sends (run_id is a backfill key used to attach people)
    INSERT INTO dbo.campaign_sends
        (department_id, batch_id, kind, message_subject, message_body, channels,
         sent_by, sent_at, run_id, recipient_count, sent_count, is_backfill)
    SELECT g.department_id, g.batch_id,
           CASE WHEN g.grp = 1 THEN 'original' ELSE 'added' END,
           b.message_subject, b.message_body,
           CASE WHEN g.min_ch = g.max_ch AND g.min_ch IN ('email', 'sms', 'both') THEN g.min_ch ELSE 'both' END,
           g.sent_by, g.sent_at, CONCAT('backfill:', g.batch_id, ':', g.grp), g.n, g.n, 1
    FROM (
        SELECT batch_id, grp, MIN(department_id) AS department_id, MIN(sent_at) AS sent_at,
               MIN(sent_by) AS sent_by, MIN(channel) AS min_ch, MAX(channel) AS max_ch, COUNT(*) AS n
        FROM #inv
        GROUP BY batch_id, grp
    ) g
    JOIN dbo.invitation_batches b ON b.id = g.batch_id;
    SET @sends = @@ROWCOUNT;

    INSERT INTO dbo.campaign_send_recipients
        (department_id, send_id, volunteer_id, invitation_id, recipient_name, channel, outcome)
    SELECT x.department_id, cs.id, x.volunteer_id, x.id, x.recipient_name,
           CASE WHEN x.channel IN ('email', 'sms', 'both') THEN x.channel END, 'sent'
    FROM #inv x
    JOIN dbo.campaign_sends cs ON cs.run_id = CONCAT('backfill:', x.batch_id, ':', x.grp);
    SET @people = @@ROWCOUNT;

    -- Reminder sends: each invitation's last reminder, grouped the same way
    IF OBJECT_ID(N'tempdb..#rem') IS NOT NULL DROP TABLE #rem;
    ;WITH r AS (
        SELECT i.id, i.batch_id, i.department_id, i.volunteer_id,
               i.last_reminded_at, i.last_reminded_channel, i.last_reminded_by,
               x.recipient_name,
               LAG(i.last_reminded_at) OVER (PARTITION BY i.batch_id ORDER BY i.last_reminded_at, i.id) AS prev_at
        FROM dbo.invitations i
        JOIN #inv x ON x.id = i.id
        WHERE i.reminder_count > 0 AND i.last_reminded_at IS NOT NULL
    )
    SELECT id, batch_id, department_id, volunteer_id, last_reminded_at, last_reminded_channel,
           last_reminded_by, recipient_name,
           SUM(CASE WHEN prev_at IS NULL OR DATEDIFF(SECOND, prev_at, last_reminded_at) > 600 THEN 1 ELSE 0 END)
               OVER (PARTITION BY batch_id ORDER BY last_reminded_at, id ROWS UNBOUNDED PRECEDING) AS grp
    INTO #rem
    FROM r;

    INSERT INTO dbo.campaign_sends
        (department_id, batch_id, kind, channels, sent_by, sent_at, run_id,
         recipient_count, sent_count, is_backfill)
    SELECT g.department_id, g.batch_id, 'reminder',
           CASE WHEN g.min_ch = g.max_ch AND g.min_ch IN ('email', 'sms', 'both') THEN g.min_ch ELSE 'both' END,
           g.sent_by, g.sent_at, CONCAT('backfill-reminder:', g.batch_id, ':', g.grp), g.n, g.n, 1
    FROM (
        SELECT batch_id, grp, MIN(department_id) AS department_id, MIN(last_reminded_at) AS sent_at,
               MIN(last_reminded_by) AS sent_by, MIN(last_reminded_channel) AS min_ch,
               MAX(last_reminded_channel) AS max_ch, COUNT(*) AS n
        FROM #rem
        GROUP BY batch_id, grp
    ) g;
    SET @sends += @@ROWCOUNT;

    INSERT INTO dbo.campaign_send_recipients
        (department_id, send_id, volunteer_id, invitation_id, recipient_name, channel, outcome)
    SELECT x.department_id, cs.id, x.volunteer_id, x.id, x.recipient_name,
           CASE WHEN x.last_reminded_channel IN ('email', 'sms', 'both') THEN x.last_reminded_channel END, 'sent'
    FROM #rem x
    JOIN dbo.campaign_sends cs ON cs.run_id = CONCAT('backfill-reminder:', x.batch_id, ':', x.grp);
    SET @people += @@ROWCOUNT;

    -- The backfill keys have done their job
    UPDATE dbo.campaign_sends SET run_id = NULL
    WHERE is_backfill = 1 AND run_id LIKE 'backfill%';

    COMMIT TRANSACTION;

    DROP TABLE #inv;
    DROP TABLE #rem;
    PRINT CONCAT('dbo: backfilled ', @sends, ' send(s) for ', @people, ' recipient row(s).');
END
GO

-- =============================================================================
-- demo
-- =============================================================================
IF SCHEMA_ID(N'demo') IS NOT NULL AND OBJECT_ID(N'demo.invitation_batches', N'U') IS NOT NULL
   AND OBJECT_ID(N'demo.campaign_sends', N'U') IS NULL
BEGIN
    CREATE TABLE demo.campaign_sends (
        id               INT             IDENTITY(1, 1) NOT NULL,
        department_id    INT             NOT NULL,
        batch_id         INT             NOT NULL,
        kind             VARCHAR(12)     NOT NULL,
        message_subject  NVARCHAR(255)   NULL,
        message_body     NVARCHAR(MAX)   NULL,
        channels         VARCHAR(10)     NULL,
        sent_by          NVARCHAR(100)   NULL,
        sent_at          DATETIME2(3)    NOT NULL CONSTRAINT df_demo_cs_sent_at DEFAULT (sysutcdatetime()),
        run_id           NVARCHAR(64)    NULL,
        recipient_count  INT             NOT NULL CONSTRAINT df_demo_cs_recipients DEFAULT (0),
        sent_count       INT             NOT NULL CONSTRAINT df_demo_cs_sent DEFAULT (0),
        skipped_count    INT             NOT NULL CONSTRAINT df_demo_cs_skipped DEFAULT (0),
        error_count      INT             NOT NULL CONSTRAINT df_demo_cs_errors DEFAULT (0),
        is_backfill      BIT             NOT NULL CONSTRAINT df_demo_cs_backfill DEFAULT (0),
        CONSTRAINT PK_demo_campaign_sends PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_demo_cs_department FOREIGN KEY (department_id) REFERENCES demo.departments (id),
        CONSTRAINT FK_demo_cs_batch FOREIGN KEY (batch_id) REFERENCES demo.invitation_batches (id) ON DELETE CASCADE,
        CONSTRAINT CK_demo_cs_kind CHECK (kind IN ('original', 'added', 'reminder')),
        CONSTRAINT CK_demo_cs_channels CHECK (channels IS NULL OR channels IN ('email', 'sms', 'both'))
    );

    CREATE INDEX IX_demo_cs_batch ON demo.campaign_sends (department_id, batch_id, sent_at);
    CREATE INDEX IX_demo_cs_run   ON demo.campaign_sends (run_id) WHERE run_id IS NOT NULL;

    PRINT 'Created demo.campaign_sends.';
END
ELSE
    PRINT 'demo.campaign_sends exists or demo.invitation_batches is missing - skipped.';
GO

IF OBJECT_ID(N'demo.campaign_sends', N'U') IS NOT NULL
   AND OBJECT_ID(N'demo.campaign_send_recipients', N'U') IS NULL
BEGIN
    -- invitation_id and volunteer_id are deliberately not foreign keys: the
    -- invitations of a deleted day or shift are deleted, and the record of
    -- who was sent what should outlive them.
    CREATE TABLE demo.campaign_send_recipients (
        id               BIGINT          IDENTITY(1, 1) NOT NULL,
        department_id    INT             NOT NULL,
        send_id          INT             NOT NULL,
        volunteer_id     INT             NULL,
        invitation_id    INT             NULL,
        recipient_name   NVARCHAR(200)   NULL,
        channel          VARCHAR(10)     NULL,
        outcome          VARCHAR(12)     NOT NULL,
        reason           NVARCHAR(200)   NULL,
        CONSTRAINT PK_demo_campaign_send_recipients PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_demo_csr_send FOREIGN KEY (send_id) REFERENCES demo.campaign_sends (id) ON DELETE CASCADE,
        CONSTRAINT CK_demo_csr_outcome CHECK (outcome IN ('sent', 'email_only', 'skipped', 'error')),
        CONSTRAINT CK_demo_csr_channel CHECK (channel IS NULL OR channel IN ('email', 'sms', 'both'))
    );

    CREATE INDEX IX_demo_csr_send ON demo.campaign_send_recipients (send_id) INCLUDE (volunteer_id, outcome);

    PRINT 'Created demo.campaign_send_recipients.';
END
ELSE
    PRINT 'demo.campaign_send_recipients exists or demo.campaign_sends is missing - skipped.';
GO

-- Row-level security: department rows (filter + block) -----------------------
IF OBJECT_ID(N'demo.campaign_sends', N'U') IS NOT NULL
BEGIN
    IF OBJECT_ID(N'demo.rls_department', N'SP') IS NULL
        PRINT 'demo: rls_department missing - run department_rls.sql first.';
    ELSE
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM sys.security_predicates sp
                       WHERE sp.object_id = OBJECT_ID(N'demo.rls_department')
                         AND sp.target_object_id = OBJECT_ID(N'demo.campaign_sends'))
        BEGIN
            EXEC (N'ALTER SECURITY POLICY demo.rls_department
                ADD FILTER PREDICATE demo.fn_rls_department(department_id) ON demo.campaign_sends,
                ADD BLOCK PREDICATE demo.fn_rls_department(department_id) ON demo.campaign_sends AFTER INSERT,
                ADD BLOCK PREDICATE demo.fn_rls_department(department_id) ON demo.campaign_sends AFTER UPDATE;');
            PRINT 'demo: campaign_sends added to rls_department.';
        END
        IF NOT EXISTS (SELECT 1 FROM sys.security_predicates sp
                       WHERE sp.object_id = OBJECT_ID(N'demo.rls_department')
                         AND sp.target_object_id = OBJECT_ID(N'demo.campaign_send_recipients'))
        BEGIN
            EXEC (N'ALTER SECURITY POLICY demo.rls_department
                ADD FILTER PREDICATE demo.fn_rls_department(department_id) ON demo.campaign_send_recipients,
                ADD BLOCK PREDICATE demo.fn_rls_department(department_id) ON demo.campaign_send_recipients AFTER INSERT,
                ADD BLOCK PREDICATE demo.fn_rls_department(department_id) ON demo.campaign_send_recipients AFTER UPDATE;');
            PRINT 'demo: campaign_send_recipients added to rls_department.';
        END
    END
END
GO

-- Backfill: campaigns with invitations but no sends yet -----------------------
IF OBJECT_ID(N'demo.campaign_send_recipients', N'U') IS NOT NULL
   AND OBJECT_ID(N'demo.invitations', N'U') IS NOT NULL
BEGIN
    DECLARE @sends INT, @people INT;

    IF OBJECT_ID(N'tempdb..#inv') IS NOT NULL DROP TABLE #inv;

    -- Invitations of campaigns with no sends, grouped into sends: a gap of
    -- more than 10 minutes since the previous invitation starts a new one.
    ;WITH todo AS (
        SELECT i.id, i.batch_id, i.department_id, i.volunteer_id, i.sent_at,
               i.channel, i.sent_by, v.lastName, v.firstName,
               LAG(i.sent_at) OVER (PARTITION BY i.batch_id ORDER BY i.sent_at, i.id) AS prev_at
        FROM demo.invitations i
        LEFT JOIN demo.volunteer_in v ON v.id = i.volunteer_id
        WHERE i.batch_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM demo.campaign_sends cs WHERE cs.batch_id = i.batch_id)
    )
    SELECT id, batch_id, department_id, volunteer_id, sent_at, channel, sent_by,
           CONCAT(lastName, N', ', firstName) AS recipient_name,
           SUM(CASE WHEN prev_at IS NULL OR DATEDIFF(SECOND, prev_at, sent_at) > 600 THEN 1 ELSE 0 END)
               OVER (PARTITION BY batch_id ORDER BY sent_at, id ROWS UNBOUNDED PRECEDING) AS grp
    INTO #inv
    FROM todo;

    BEGIN TRANSACTION;

    -- Original and added sends (run_id is a backfill key used to attach people)
    INSERT INTO demo.campaign_sends
        (department_id, batch_id, kind, message_subject, message_body, channels,
         sent_by, sent_at, run_id, recipient_count, sent_count, is_backfill)
    SELECT g.department_id, g.batch_id,
           CASE WHEN g.grp = 1 THEN 'original' ELSE 'added' END,
           b.message_subject, b.message_body,
           CASE WHEN g.min_ch = g.max_ch AND g.min_ch IN ('email', 'sms', 'both') THEN g.min_ch ELSE 'both' END,
           g.sent_by, g.sent_at, CONCAT('backfill:', g.batch_id, ':', g.grp), g.n, g.n, 1
    FROM (
        SELECT batch_id, grp, MIN(department_id) AS department_id, MIN(sent_at) AS sent_at,
               MIN(sent_by) AS sent_by, MIN(channel) AS min_ch, MAX(channel) AS max_ch, COUNT(*) AS n
        FROM #inv
        GROUP BY batch_id, grp
    ) g
    JOIN demo.invitation_batches b ON b.id = g.batch_id;
    SET @sends = @@ROWCOUNT;

    INSERT INTO demo.campaign_send_recipients
        (department_id, send_id, volunteer_id, invitation_id, recipient_name, channel, outcome)
    SELECT x.department_id, cs.id, x.volunteer_id, x.id, x.recipient_name,
           CASE WHEN x.channel IN ('email', 'sms', 'both') THEN x.channel END, 'sent'
    FROM #inv x
    JOIN demo.campaign_sends cs ON cs.run_id = CONCAT('backfill:', x.batch_id, ':', x.grp);
    SET @people = @@ROWCOUNT;

    -- Reminder sends: each invitation's last reminder, grouped the same way
    IF OBJECT_ID(N'tempdb..#rem') IS NOT NULL DROP TABLE #rem;
    ;WITH r AS (
        SELECT i.id, i.batch_id, i.department_id, i.volunteer_id,
               i.last_reminded_at, i.last_reminded_channel, i.last_reminded_by,
               x.recipient_name,
               LAG(i.last_reminded_at) OVER (PARTITION BY i.batch_id ORDER BY i.last_reminded_at, i.id) AS prev_at
        FROM demo.invitations i
        JOIN #inv x ON x.id = i.id
        WHERE i.reminder_count > 0 AND i.last_reminded_at IS NOT NULL
    )
    SELECT id, batch_id, department_id, volunteer_id, last_reminded_at, last_reminded_channel,
           last_reminded_by, recipient_name,
           SUM(CASE WHEN prev_at IS NULL OR DATEDIFF(SECOND, prev_at, last_reminded_at) > 600 THEN 1 ELSE 0 END)
               OVER (PARTITION BY batch_id ORDER BY last_reminded_at, id ROWS UNBOUNDED PRECEDING) AS grp
    INTO #rem
    FROM r;

    INSERT INTO demo.campaign_sends
        (department_id, batch_id, kind, channels, sent_by, sent_at, run_id,
         recipient_count, sent_count, is_backfill)
    SELECT g.department_id, g.batch_id, 'reminder',
           CASE WHEN g.min_ch = g.max_ch AND g.min_ch IN ('email', 'sms', 'both') THEN g.min_ch ELSE 'both' END,
           g.sent_by, g.sent_at, CONCAT('backfill-reminder:', g.batch_id, ':', g.grp), g.n, g.n, 1
    FROM (
        SELECT batch_id, grp, MIN(department_id) AS department_id, MIN(last_reminded_at) AS sent_at,
               MIN(last_reminded_by) AS sent_by, MIN(last_reminded_channel) AS min_ch,
               MAX(last_reminded_channel) AS max_ch, COUNT(*) AS n
        FROM #rem
        GROUP BY batch_id, grp
    ) g;
    SET @sends += @@ROWCOUNT;

    INSERT INTO demo.campaign_send_recipients
        (department_id, send_id, volunteer_id, invitation_id, recipient_name, channel, outcome)
    SELECT x.department_id, cs.id, x.volunteer_id, x.id, x.recipient_name,
           CASE WHEN x.last_reminded_channel IN ('email', 'sms', 'both') THEN x.last_reminded_channel END, 'sent'
    FROM #rem x
    JOIN demo.campaign_sends cs ON cs.run_id = CONCAT('backfill-reminder:', x.batch_id, ':', x.grp);
    SET @people += @@ROWCOUNT;

    -- The backfill keys have done their job
    UPDATE demo.campaign_sends SET run_id = NULL
    WHERE is_backfill = 1 AND run_id LIKE 'backfill%';

    COMMIT TRANSACTION;

    DROP TABLE #inv;
    DROP TABLE #rem;
    PRINT CONCAT('demo: backfilled ', @sends, ' send(s) for ', @people, ' recipient row(s).');
END
GO

-- =============================================================================
-- Verify: tables exist, are under RLS, and how many sends each schema holds
-- =============================================================================
SELECT s.name AS schema_name, t.name AS table_name,
       CASE WHEN EXISTS (SELECT 1 FROM sys.security_predicates sp WHERE sp.target_object_id = t.object_id)
            THEN 'yes' ELSE 'NO' END AS under_rls,
       p.rows AS row_count
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
WHERE t.name IN (N'campaign_sends', N'campaign_send_recipients')
ORDER BY s.name, t.name;
GO

PRINT '=== campaign_sends.sql complete ===';
GO
