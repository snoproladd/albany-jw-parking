-- =============================================
-- Migration: inbound_sms_messages
-- Logs every inbound freeform SMS received by the Twilio webhook
-- for both the dbo (production) and demo schemas.
--
-- volunteer_id is nullable — unknown callers have no match.
-- AI analysis columns store the result from smsInboundAnalyzer.
-- resolved is toggled by overseers from the messages dashboard.
-- volunteer_actions references this table via source_id when
-- source_type = 'inbound_sms'; no reverse FK is needed here.
-- =============================================

-- ─── dbo schema ──────────────────────────────────────────────────────────────

IF NOT EXISTS (
    SELECT 1
    FROM   sys.tables  t
    JOIN   sys.schemas s ON t.schema_id = s.schema_id
    WHERE  s.name = 'dbo'
    AND    t.name = 'inbound_sms_messages'
)
BEGIN
    CREATE TABLE dbo.inbound_sms_messages (
        id                INT           IDENTITY(1,1) NOT NULL,
        volunteer_id      INT           NULL,
        from_phone        NVARCHAR(50)  NOT NULL,
        raw_body          NVARCHAR(MAX) NOT NULL,
        received_at       DATETIME2     NOT NULL
            CONSTRAINT DF_dbo_ism_received_at DEFAULT GETUTCDATE(),
        ai_summary        NVARCHAR(MAX) NULL,
        ai_category       NVARCHAR(50)  NULL,
        ai_action_items   NVARCHAR(MAX) NULL,
        ai_raw_response   NVARCHAR(MAX) NULL,
        ai_error          NVARCHAR(MAX) NULL,
        prompt_tokens     INT           NULL,
        completion_tokens INT           NULL,
        resolved          BIT           NOT NULL
            CONSTRAINT DF_dbo_ism_resolved DEFAULT 0,

        CONSTRAINT PK_dbo_inbound_sms_messages
            PRIMARY KEY CLUSTERED (id),

        CONSTRAINT FK_dbo_ism_volunteer
            FOREIGN KEY (volunteer_id)
            REFERENCES dbo.volunteer_in (id)
    );

    CREATE NONCLUSTERED INDEX IX_dbo_ism_volunteer_id
        ON dbo.inbound_sms_messages (volunteer_id)
        WHERE volunteer_id IS NOT NULL;

    CREATE NONCLUSTERED INDEX IX_dbo_ism_received_at
        ON dbo.inbound_sms_messages (received_at DESC);

    CREATE NONCLUSTERED INDEX IX_dbo_ism_resolved
        ON dbo.inbound_sms_messages (resolved, received_at DESC);
END
GO

-- ─── demo schema ─────────────────────────────────────────────────────────────

IF NOT EXISTS (
    SELECT 1
    FROM   sys.tables  t
    JOIN   sys.schemas s ON t.schema_id = s.schema_id
    WHERE  s.name = 'demo'
    AND    t.name = 'inbound_sms_messages'
)
BEGIN
    CREATE TABLE demo.inbound_sms_messages (
        id                INT           IDENTITY(1,1) NOT NULL,
        volunteer_id      INT           NULL,
        from_phone        NVARCHAR(50)  NOT NULL,
        raw_body          NVARCHAR(MAX) NOT NULL,
        received_at       DATETIME2     NOT NULL
            CONSTRAINT DF_demo_ism_received_at DEFAULT GETUTCDATE(),
        ai_summary        NVARCHAR(MAX) NULL,
        ai_category       NVARCHAR(50)  NULL,
        ai_action_items   NVARCHAR(MAX) NULL,
        ai_raw_response   NVARCHAR(MAX) NULL,
        ai_error          NVARCHAR(MAX) NULL,
        prompt_tokens     INT           NULL,
        completion_tokens INT           NULL,
        resolved          BIT           NOT NULL
            CONSTRAINT DF_demo_ism_resolved DEFAULT 0,

        CONSTRAINT PK_demo_inbound_sms_messages
            PRIMARY KEY CLUSTERED (id),

        CONSTRAINT FK_demo_ism_volunteer
            FOREIGN KEY (volunteer_id)
            REFERENCES demo.volunteer_in (id)
    );

    CREATE NONCLUSTERED INDEX IX_demo_ism_volunteer_id
        ON demo.inbound_sms_messages (volunteer_id)
        WHERE volunteer_id IS NOT NULL;

    CREATE NONCLUSTERED INDEX IX_demo_ism_received_at
        ON demo.inbound_sms_messages (received_at DESC);

    CREATE NONCLUSTERED INDEX IX_demo_ism_resolved
        ON demo.inbound_sms_messages (resolved, received_at DESC);
END
GO