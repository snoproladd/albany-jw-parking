-- =============================================================================
-- convention_time_zone.sql   (convention venue and time zone, 2026-11-25)
-- =============================================================================
-- Each convention year gets its venue and time zone. All time handling in the
-- app follows this zone (lib/conventionTime.js): when shifts start, what
-- "today" is, and how sent-at times are printed in texts, emails and PDFs.
-- Shift and session times stay plain convention clock times.
--
--   convention_years.venue_city        e.g. 'Albany'
--   convention_years.venue_state       e.g. 'NY'
--   convention_years.venue_zip         e.g. '12207'
--   convention_years.time_zone         IANA zone name, e.g. 'America/New_York'
--                                      (default for every existing year)
--   convention_years.time_zone_source  'city' (looked up from the venue),
--                                      'manual' (picked from the list), or NULL
--                                      (never set: the default)
--   convention_years.time_zone_set_by  who last set it (volunteer_in.id)
--   convention_years.time_zone_set_at  when (UTC)
--
-- Set on System Variables (convention admins). The year rollover copies the
-- closing year's venue and zone into the new year.
--
-- convention_years is shared by all departments (no row-level security).
-- Runs in the system scope (set below). LOCAL ONLY (albanyregional3_local)
-- until the multi-department branch ships; then part of the production
-- cutover. Safe to re-run.
-- =============================================================================
SET NOCOUNT ON;
EXEC sp_set_session_context @key = N'scope', @value = N'system';
GO

-- ── dbo ──────────────────────────────────────────────────────────────────────
IF OBJECT_ID(N'dbo.convention_years', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.convention_years', N'time_zone') IS NULL
BEGIN
    ALTER TABLE dbo.convention_years ADD
        venue_city        NVARCHAR(100) NULL,
        venue_state       NVARCHAR(50)  NULL,
        venue_zip         VARCHAR(10)   NULL,
        time_zone         VARCHAR(64)   NOT NULL
            CONSTRAINT DF_cy_time_zone DEFAULT ('America/New_York'),
        time_zone_source  VARCHAR(10)   NULL
            CONSTRAINT CK_cy_time_zone_source CHECK (time_zone_source IN ('city', 'manual')),
        time_zone_set_by  INT           NULL
            CONSTRAINT FK_cy_time_zone_set_by REFERENCES dbo.volunteer_in (id),
        time_zone_set_at  DATETIME2(0)  NULL;
    PRINT 'Added venue and time zone columns to dbo.convention_years.';
END
ELSE
    PRINT 'dbo.convention_years already has time_zone (or no table) - skipped.';
GO

-- ── demo ─────────────────────────────────────────────────────────────────────
IF OBJECT_ID(N'demo.convention_years', N'U') IS NOT NULL
   AND COL_LENGTH(N'demo.convention_years', N'time_zone') IS NULL
BEGIN
    ALTER TABLE demo.convention_years ADD
        venue_city        NVARCHAR(100) NULL,
        venue_state       NVARCHAR(50)  NULL,
        venue_zip         VARCHAR(10)   NULL,
        time_zone         VARCHAR(64)   NOT NULL
            CONSTRAINT DF_demo_cy_time_zone DEFAULT ('America/New_York'),
        time_zone_source  VARCHAR(10)   NULL
            CONSTRAINT CK_demo_cy_time_zone_source CHECK (time_zone_source IN ('city', 'manual')),
        time_zone_set_by  INT           NULL
            CONSTRAINT FK_demo_cy_time_zone_set_by REFERENCES demo.volunteer_in (id),
        time_zone_set_at  DATETIME2(0)  NULL;
    PRINT 'Added venue and time zone columns to demo.convention_years.';
END
ELSE
    PRINT 'demo.convention_years already has time_zone (or no table) - skipped.';
GO

-- ── Verify ───────────────────────────────────────────────────────────────────
SELECT s.name AS schema_name, cy.name AS table_name,
       CASE WHEN COL_LENGTH(s.name + N'.convention_years', N'time_zone') IS NULL THEN 'MISSING' ELSE 'yes' END AS has_time_zone
FROM sys.tables cy
JOIN sys.schemas s ON s.schema_id = cy.schema_id
WHERE cy.name = N'convention_years';
GO

PRINT '=== convention_time_zone.sql complete ===';
GO
