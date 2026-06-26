-- =============================================
-- Migration: volunteer_note_analyses
-- Creates AI note analysis results table for both dbo and demo schemas.
-- Stores the note text snapshot, LLM query metadata, structured JSON output,
-- and token usage per analysis run. Supports staleness detection via note_hash.
-- =============================================

-- dbo schema
IF NOT EXISTS (
    SELECT 1
    FROM   sys.tables  t
    JOIN   sys.schemas s ON t.schema_id = s.schema_id
    WHERE  s.name = 'dbo'
    AND    t.name = 'volunteer_note_analyses'
)
BEGIN
    CREATE TABLE dbo.volunteer_note_analyses (
        id                  INT           IDENTITY(1,1) NOT NULL,
        volunteer_id        INT           NOT NULL,
        note_text_snapshot  NVARCHAR(MAX) NOT NULL,
        note_hash           NVARCHAR(64)  NOT NULL,
        analyzed_at         DATETIME2     NOT NULL CONSTRAINT DF_dbo_vna_analyzed_at DEFAULT GETUTCDATE(),
        analyzed_by         INT           NOT NULL,
        model               NVARCHAR(100) NOT NULL,
        prompt_tokens       INT           NULL,
        completion_tokens   INT           NULL,
        summary             NVARCHAR(MAX) NULL,
        category            NVARCHAR(50)  NULL,
        action_items        NVARCHAR(MAX) NULL,
        suggested_blackouts NVARCHAR(MAX) NULL,
        flags               NVARCHAR(MAX) NULL,
        raw_response        NVARCHAR(MAX) NULL,
        error               NVARCHAR(MAX) NULL,

        CONSTRAINT PK_dbo_volunteer_note_analyses
            PRIMARY KEY CLUSTERED (id),

        CONSTRAINT FK_dbo_vna_volunteer
            FOREIGN KEY (volunteer_id)
            REFERENCES dbo.volunteer_in (id),

        CONSTRAINT FK_dbo_vna_analyzed_by
            FOREIGN KEY (analyzed_by)
            REFERENCES dbo.volunteer_in (id),

        CONSTRAINT CK_dbo_vna_category CHECK (
            category IS NULL OR category IN (
                'scheduling_constraint',
                'preference',
                'personal_info',
                'data_correction',
                'other'
            )
        )
    );

    CREATE NONCLUSTERED INDEX IX_dbo_vna_volunteer_id
        ON dbo.volunteer_note_analyses (volunteer_id);

    CREATE NONCLUSTERED INDEX IX_dbo_vna_analyzed_at
        ON dbo.volunteer_note_analyses (analyzed_at DESC);
END
GO

-- demo schema
IF NOT EXISTS (
    SELECT 1
    FROM   sys.tables  t
    JOIN   sys.schemas s ON t.schema_id = s.schema_id
    WHERE  s.name = 'demo'
    AND    t.name = 'volunteer_note_analyses'
)
BEGIN
    CREATE TABLE demo.volunteer_note_analyses (
        id                  INT           IDENTITY(1,1) NOT NULL,
        volunteer_id        INT           NOT NULL,
        note_text_snapshot  NVARCHAR(MAX) NOT NULL,
        note_hash           NVARCHAR(64)  NOT NULL,
        analyzed_at         DATETIME2     NOT NULL CONSTRAINT DF_demo_vna_analyzed_at DEFAULT GETUTCDATE(),
        analyzed_by         INT           NOT NULL,
        model               NVARCHAR(100) NOT NULL,
        prompt_tokens       INT           NULL,
        completion_tokens   INT           NULL,
        summary             NVARCHAR(MAX) NULL,
        category            NVARCHAR(50)  NULL,
        action_items        NVARCHAR(MAX) NULL,
        suggested_blackouts NVARCHAR(MAX) NULL,
        flags               NVARCHAR(MAX) NULL,
        raw_response        NVARCHAR(MAX) NULL,
        error               NVARCHAR(MAX) NULL,

        CONSTRAINT PK_demo_volunteer_note_analyses
            PRIMARY KEY CLUSTERED (id),

        CONSTRAINT FK_demo_vna_volunteer
            FOREIGN KEY (volunteer_id)
            REFERENCES demo.volunteer_in (id),

        CONSTRAINT FK_demo_vna_analyzed_by
            FOREIGN KEY (analyzed_by)
            REFERENCES demo.volunteer_in (id),

        CONSTRAINT CK_demo_vna_category CHECK (
            category IS NULL OR category IN (
                'scheduling_constraint',
                'preference',
                'personal_info',
                'data_correction',
                'other'
            )
        )
    );

    CREATE NONCLUSTERED INDEX IX_demo_vna_volunteer_id
        ON demo.volunteer_note_analyses (volunteer_id);

    CREATE NONCLUSTERED INDEX IX_demo_vna_analyzed_at
        ON demo.volunteer_note_analyses (analyzed_at DESC);
END
GO