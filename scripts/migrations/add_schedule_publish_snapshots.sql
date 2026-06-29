-- ============================================================
-- Migration: schedule_publish_snapshots
--
-- 1. Adds published_at to schedule_publishes (if missing) so
--    the publish history endpoint has a reliable timestamp.
-- 2. Creates schedule_publish_snapshots to capture the exact
--    assignment state at each publish, enabling differential
--    notification mode to compare current vs prior state.
--
-- Target: both dbo and demo schemas.
-- ============================================================

-- ── dbo: published_at ────────────────────────────────────────
IF NOT EXISTS (
    SELECT 1
    FROM   sys.columns
    WHERE  object_id = OBJECT_ID('dbo.schedule_publishes')
      AND  name      = 'published_at'
)
BEGIN
    ALTER TABLE dbo.schedule_publishes
        ADD published_at DATETIME2
            CONSTRAINT DF_sp_published_at DEFAULT SYSUTCDATETIME();
END
GO

-- ── demo: published_at ───────────────────────────────────────
IF NOT EXISTS (
    SELECT 1
    FROM   sys.columns
    WHERE  object_id = OBJECT_ID('demo.schedule_publishes')
      AND  name      = 'published_at'
)
BEGIN
    ALTER TABLE demo.schedule_publishes
        ADD published_at DATETIME2
            CONSTRAINT DF_demo_sp_published_at DEFAULT SYSUTCDATETIME();
END
GO

-- ── dbo: schedule_publish_snapshots ─────────────────────────
IF NOT EXISTS (
    SELECT 1
    FROM   sys.tables
    WHERE  name      = 'schedule_publish_snapshots'
      AND  schema_id = SCHEMA_ID('dbo')
)
BEGIN
    CREATE TABLE dbo.schedule_publish_snapshots (
        id               INT          IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_sps PRIMARY KEY,
        publish_id       INT          NOT NULL
            CONSTRAINT FK_sps_publish
                REFERENCES dbo.schedule_publishes (id),
        volunteer_id     INT          NOT NULL,
        shift_id         INT          NOT NULL,
        location_task_id INT          NOT NULL,
        slot_type        NVARCHAR(50) NULL
    );

    CREATE INDEX IX_sps_publish_id
        ON dbo.schedule_publish_snapshots (publish_id);

    CREATE INDEX IX_sps_volunteer_id
        ON dbo.schedule_publish_snapshots (volunteer_id);
END
GO

-- ── demo: schedule_publish_snapshots ────────────────────────
IF NOT EXISTS (
    SELECT 1
    FROM   sys.tables
    WHERE  name      = 'schedule_publish_snapshots'
      AND  schema_id = SCHEMA_ID('demo')
)
BEGIN
    CREATE TABLE demo.schedule_publish_snapshots (
        id               INT          IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_demo_sps PRIMARY KEY,
        publish_id       INT          NOT NULL
            CONSTRAINT FK_demo_sps_publish
                REFERENCES demo.schedule_publishes (id),
        volunteer_id     INT          NOT NULL,
        shift_id         INT          NOT NULL,
        location_task_id INT          NOT NULL,
        slot_type        NVARCHAR(50) NULL
    );

    CREATE INDEX IX_demo_sps_publish_id
        ON demo.schedule_publish_snapshots (publish_id);

    CREATE INDEX IX_demo_sps_volunteer_id
        ON demo.schedule_publish_snapshots (volunteer_id);
END
GO
