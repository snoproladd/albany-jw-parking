-- =============================================
-- Migration: schedule_analysis_rules
-- Admin-defined policy rules that are injected into the schedule
-- analysis AI system prompt on every run. Rules are applied by the
-- AI when assessing violation severity, confidence, and suggestions.
--
-- sort_order controls the order rules appear in the prompt.
-- active = 0 rules are stored but excluded from the prompt.
-- =============================================

-- ─── dbo ─────────────────────────────────────────────────────────────────────

IF NOT EXISTS (
    SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'dbo' AND t.name = 'schedule_analysis_rules'
)
BEGIN
    CREATE TABLE dbo.schedule_analysis_rules (
        id          INT           IDENTITY(1,1) NOT NULL,
        rule_text   NVARCHAR(MAX) NOT NULL,
        sort_order  INT           NOT NULL DEFAULT 0,
        active      BIT           NOT NULL
            CONSTRAINT DF_dbo_sar_active DEFAULT 1,
        created_by  INT           NULL,
        created_at  DATETIME2     NOT NULL
            CONSTRAINT DF_dbo_sar_created_at DEFAULT GETUTCDATE(),
        updated_by  INT           NULL,
        updated_at  DATETIME2     NULL,

        CONSTRAINT PK_dbo_schedule_analysis_rules
            PRIMARY KEY CLUSTERED (id),

        CONSTRAINT FK_dbo_sar_created_by
            FOREIGN KEY (created_by) REFERENCES dbo.volunteer_in (id),

        CONSTRAINT FK_dbo_sar_updated_by
            FOREIGN KEY (updated_by) REFERENCES dbo.volunteer_in (id)
    );

    CREATE NONCLUSTERED INDEX IX_dbo_sar_active_sort
        ON dbo.schedule_analysis_rules (active, sort_order);
END
GO

-- ─── demo ────────────────────────────────────────────────────────────────────

IF NOT EXISTS (
    SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'demo' AND t.name = 'schedule_analysis_rules'
)
BEGIN
    CREATE TABLE demo.schedule_analysis_rules (
        id          INT           IDENTITY(1,1) NOT NULL,
        rule_text   NVARCHAR(MAX) NOT NULL,
        sort_order  INT           NOT NULL DEFAULT 0,
        active      BIT           NOT NULL
            CONSTRAINT DF_demo_sar_active DEFAULT 1,
        created_by  INT           NULL,
        created_at  DATETIME2     NOT NULL
            CONSTRAINT DF_demo_sar_created_at DEFAULT GETUTCDATE(),
        updated_by  INT           NULL,
        updated_at  DATETIME2     NULL,

        CONSTRAINT PK_demo_schedule_analysis_rules
            PRIMARY KEY CLUSTERED (id),

        CONSTRAINT FK_demo_sar_created_by
            FOREIGN KEY (created_by) REFERENCES demo.volunteer_in (id),

        CONSTRAINT FK_demo_sar_updated_by
            FOREIGN KEY (updated_by) REFERENCES demo.volunteer_in (id)
    );

    CREATE NONCLUSTERED INDEX IX_demo_sar_active_sort
        ON demo.schedule_analysis_rules (active, sort_order);
END
GO