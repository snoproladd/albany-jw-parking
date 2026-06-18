-- ─── Migration: standalone meeting table for Campaign Center ─────────────

CREATE TABLE dbo.campaign_meetings (
    id              INT           IDENTITY(1,1) NOT NULL,
    year            INT           NOT NULL,
    label           NVARCHAR(100) NOT NULL,
    meeting_date    DATE          NOT NULL,
    start_time      NVARCHAR(8)   NOT NULL,   -- HH:MM:SS, matches shifts pattern
    end_time        NVARCHAR(8)   NOT NULL,
    description     NVARCHAR(500) NULL,
    created_at      DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_campaign_meetings PRIMARY KEY (id)
);

CREATE INDEX IX_campaign_meetings_year
    ON dbo.campaign_meetings (year, meeting_date);

-- Verify
SELECT * FROM dbo.campaign_meetings;