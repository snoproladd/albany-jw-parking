-- =============================================
-- Migration: schedule_violations
-- Two tables:
--   schedule_violation_runs  — one row per analysis pass.
--   schedule_violations      — one row per flagged item.
--
-- schedule_hash lets the analyzer skip a full re-run when assignments
-- and blackouts haven't changed since the last run.
--
-- Rule-engine violations have confidence = NULL (deterministic fact).
-- AI-generated or AI-enhanced violations carry a 0.00–1.00 confidence
-- score reflecting how certain the AI is in its suggestion.
--
-- ai_question / overseer_response support the AI Q&A re-analysis loop.
-- =============================================

-- ─── dbo ─────────────────────────────────────────────────────────────────────

IF NOT EXISTS (
    SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'dbo' AND t.name = 'schedule_violation_runs'
)
BEGIN
    CREATE TABLE dbo.schedule_violation_runs (
        id               INT           IDENTITY(1,1) NOT NULL,
        year             INT           NOT NULL,
        schedule_hash    NVARCHAR(64)  NOT NULL,
        triggered_by     INT           NULL,
        triggered_at     DATETIME2     NOT NULL
            CONSTRAINT DF_dbo_svr_triggered_at DEFAULT GETUTCDATE(),
        violation_count  INT           NOT NULL DEFAULT 0,

        CONSTRAINT PK_dbo_schedule_violation_runs
            PRIMARY KEY CLUSTERED (id),

        CONSTRAINT FK_dbo_svr_triggered_by
            FOREIGN KEY (triggered_by) REFERENCES dbo.volunteer_in (id)
    );

    CREATE NONCLUSTERED INDEX IX_dbo_svr_year_triggered
        ON dbo.schedule_violation_runs (year, triggered_at DESC);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'dbo' AND t.name = 'schedule_violations'
)
BEGIN
    CREATE TABLE dbo.schedule_violations (
        id                INT             IDENTITY(1,1) NOT NULL,
        run_id            INT             NOT NULL,
        volunteer_id      INT             NULL,
        shift_id          INT             NULL,
        shift_id_2        INT             NULL,
        convention_day_id INT             NOT NULL,
        violation_type    NVARCHAR(50)    NOT NULL,
        severity          NVARCHAR(20)    NULL,
        confidence        DECIMAL(3,2)    NULL,
        description       NVARCHAR(MAX)   NOT NULL,
        ai_suggestion     NVARCHAR(MAX)   NULL,
        ai_question       NVARCHAR(MAX)   NULL,
        overseer_response NVARCHAR(MAX)   NULL,
        acknowledged      BIT             NOT NULL
            CONSTRAINT DF_dbo_sv_acknowledged DEFAULT 0,
        acknowledged_by   INT             NULL,
        acknowledged_at   DATETIME2       NULL,

        CONSTRAINT PK_dbo_schedule_violations
            PRIMARY KEY CLUSTERED (id),

        CONSTRAINT FK_dbo_sv_run
            FOREIGN KEY (run_id) REFERENCES dbo.schedule_violation_runs (id),

        CONSTRAINT FK_dbo_sv_volunteer
            FOREIGN KEY (volunteer_id) REFERENCES dbo.volunteer_in (id),

        CONSTRAINT FK_dbo_sv_day
            FOREIGN KEY (convention_day_id) REFERENCES dbo.convention_days (id),

        CONSTRAINT FK_dbo_sv_acknowledged_by
            FOREIGN KEY (acknowledged_by) REFERENCES dbo.volunteer_in (id),

        CONSTRAINT CK_dbo_sv_type CHECK (violation_type IN (
            'time_overlap', 'blackout_violation',
            'pre_session_overload', 'post_session_overload',
            'understaffed', 'daily_load', 'coverage_gap', 'ai_observation'
        )),

        CONSTRAINT CK_dbo_sv_severity CHECK (
            severity IS NULL OR severity IN ('critical', 'high', 'medium', 'low', 'info')
        ),

        CONSTRAINT CK_dbo_sv_confidence CHECK (
            confidence IS NULL OR (confidence >= 0.00 AND confidence <= 1.00)
        )
    );

    CREATE NONCLUSTERED INDEX IX_dbo_sv_run
        ON dbo.schedule_violations (run_id, acknowledged);

    CREATE NONCLUSTERED INDEX IX_dbo_sv_volunteer
        ON dbo.schedule_violations (volunteer_id)
        WHERE volunteer_id IS NOT NULL;
END
GO

-- ─── demo ────────────────────────────────────────────────────────────────────

IF NOT EXISTS (
    SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'demo' AND t.name = 'schedule_violation_runs'
)
BEGIN
    CREATE TABLE demo.schedule_violation_runs (
        id               INT           IDENTITY(1,1) NOT NULL,
        year             INT           NOT NULL,
        schedule_hash    NVARCHAR(64)  NOT NULL,
        triggered_by     INT           NULL,
        triggered_at     DATETIME2     NOT NULL
            CONSTRAINT DF_demo_svr_triggered_at DEFAULT GETUTCDATE(),
        violation_count  INT           NOT NULL DEFAULT 0,

        CONSTRAINT PK_demo_schedule_violation_runs
            PRIMARY KEY CLUSTERED (id),

        CONSTRAINT FK_demo_svr_triggered_by
            FOREIGN KEY (triggered_by) REFERENCES demo.volunteer_in (id)
    );

    CREATE NONCLUSTERED INDEX IX_demo_svr_year_triggered
        ON demo.schedule_violation_runs (year, triggered_at DESC);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'demo' AND t.name = 'schedule_violations'
)
BEGIN
    CREATE TABLE demo.schedule_violations (
        id                INT             IDENTITY(1,1) NOT NULL,
        run_id            INT             NOT NULL,
        volunteer_id      INT             NULL,
        shift_id          INT             NULL,
        shift_id_2        INT             NULL,
        convention_day_id INT             NOT NULL,
        violation_type    NVARCHAR(50)    NOT NULL,
        severity          NVARCHAR(20)    NULL,
        confidence        DECIMAL(3,2)    NULL,
        description       NVARCHAR(MAX)   NOT NULL,
        ai_suggestion     NVARCHAR(MAX)   NULL,
        ai_question       NVARCHAR(MAX)   NULL,
        overseer_response NVARCHAR(MAX)   NULL,
        acknowledged      BIT             NOT NULL
            CONSTRAINT DF_demo_sv_acknowledged DEFAULT 0,
        acknowledged_by   INT             NULL,
        acknowledged_at   DATETIME2       NULL,

        CONSTRAINT PK_demo_schedule_violations
            PRIMARY KEY CLUSTERED (id),

        CONSTRAINT FK_demo_sv_run
            FOREIGN KEY (run_id) REFERENCES demo.schedule_violation_runs (id),

        CONSTRAINT FK_demo_sv_volunteer
            FOREIGN KEY (volunteer_id) REFERENCES demo.volunteer_in (id),

        CONSTRAINT FK_demo_sv_day
            FOREIGN KEY (convention_day_id) REFERENCES demo.convention_days (id),

        CONSTRAINT FK_demo_sv_acknowledged_by
            FOREIGN KEY (acknowledged_by) REFERENCES demo.volunteer_in (id),

        CONSTRAINT CK_demo_sv_type CHECK (violation_type IN (
            'time_overlap', 'blackout_violation',
            'pre_session_overload', 'post_session_overload',
            'understaffed', 'daily_load', 'coverage_gap', 'ai_observation'
        )),

        CONSTRAINT CK_demo_sv_severity CHECK (
            severity IS NULL OR severity IN ('critical', 'high', 'medium', 'low', 'info')
        ),

        CONSTRAINT CK_demo_sv_confidence CHECK (
            confidence IS NULL OR (confidence >= 0.00 AND confidence <= 1.00)
        )
    );

    CREATE NONCLUSTERED INDEX IX_demo_sv_run
        ON demo.schedule_violations (run_id, acknowledged);

    CREATE NONCLUSTERED INDEX IX_demo_sv_volunteer
        ON demo.schedule_violations (volunteer_id)
        WHERE volunteer_id IS NOT NULL;
END
GO