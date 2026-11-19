-- convention_years.sql
-- Convention year rollover foundation (Phase 1).
--
--   1. convention_years       — one row per convention year; exactly one
--                               row may be 'active'. Closed years are
--                               read-only in the app.
--   2. volunteer_year_status  — per-volunteer snapshot written when a year
--                               is closed (active flag, recruitment
--                               response, Decently export/import stamps).
--   3. convention_days        — program_start / program_end become NULLable
--                               so the rollover can create days from
--                               calendar dates alone (times set later in
--                               Timelines).
--
-- Targets dbo and demo schemas in one file. Safe to re-run: every step is
-- guarded. Seeds the current year (2026) as 'active' in each schema, using
-- that schema's convention_days for first/last dates, so behavior is
-- unchanged on deploy.

-- ============================================================
-- 1. convention_years
-- ============================================================

IF OBJECT_ID('dbo.convention_years', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.convention_years (
        year        INT           NOT NULL,
        status      NVARCHAR(10)  NOT NULL CONSTRAINT DF_cy_status     DEFAULT 'active',
        first_date  DATE          NULL,
        last_date   DATE          NULL,
        started_by  INT           NULL,
        started_at  DATETIME2(0)  NOT NULL CONSTRAINT DF_cy_started_at DEFAULT SYSUTCDATETIME(),
        closed_by   INT           NULL,
        closed_at   DATETIME2(0)  NULL,
        CONSTRAINT PK_convention_years
            PRIMARY KEY (year),
        CONSTRAINT CK_cy_status
            CHECK (status IN ('active', 'closed')),
        CONSTRAINT CK_cy_dates
            CHECK (first_date IS NULL OR last_date IS NULL OR last_date >= first_date),
        CONSTRAINT FK_cy_started_by
            FOREIGN KEY (started_by) REFERENCES dbo.volunteer_in(id),
        CONSTRAINT FK_cy_closed_by
            FOREIGN KEY (closed_by) REFERENCES dbo.volunteer_in(id)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_cy_one_active'
               AND object_id = OBJECT_ID('dbo.convention_years'))
    CREATE UNIQUE INDEX UX_cy_one_active
        ON dbo.convention_years (status)
        WHERE status = 'active';
GO

IF OBJECT_ID('demo.convention_years', 'U') IS NULL
BEGIN
    CREATE TABLE demo.convention_years (
        year        INT           NOT NULL,
        status      NVARCHAR(10)  NOT NULL CONSTRAINT DF_dcy_status     DEFAULT 'active',
        first_date  DATE          NULL,
        last_date   DATE          NULL,
        started_by  INT           NULL,
        started_at  DATETIME2(0)  NOT NULL CONSTRAINT DF_dcy_started_at DEFAULT SYSUTCDATETIME(),
        closed_by   INT           NULL,
        closed_at   DATETIME2(0)  NULL,
        CONSTRAINT PK_demo_convention_years
            PRIMARY KEY (year),
        CONSTRAINT CK_dcy_status
            CHECK (status IN ('active', 'closed')),
        CONSTRAINT CK_dcy_dates
            CHECK (first_date IS NULL OR last_date IS NULL OR last_date >= first_date),
        CONSTRAINT FK_dcy_started_by
            FOREIGN KEY (started_by) REFERENCES demo.volunteer_in(id),
        CONSTRAINT FK_dcy_closed_by
            FOREIGN KEY (closed_by) REFERENCES demo.volunteer_in(id)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_dcy_one_active'
               AND object_id = OBJECT_ID('demo.convention_years'))
    CREATE UNIQUE INDEX UX_dcy_one_active
        ON demo.convention_years (status)
        WHERE status = 'active';
GO

-- Seed 2026 as the active year (dates taken from existing convention_days).
IF NOT EXISTS (SELECT 1 FROM dbo.convention_years)
    INSERT INTO dbo.convention_years (year, status, first_date, last_date)
    SELECT 2026, 'active', MIN(convention_date), MAX(convention_date)
    FROM dbo.convention_days
    WHERE year = 2026;
GO

IF NOT EXISTS (SELECT 1 FROM demo.convention_years)
    INSERT INTO demo.convention_years (year, status, first_date, last_date)
    SELECT 2026, 'active', MIN(convention_date), MAX(convention_date)
    FROM demo.convention_days
    WHERE year = 2026;
GO

-- ============================================================
-- 2. volunteer_year_status
-- ============================================================

IF OBJECT_ID('dbo.volunteer_year_status', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.volunteer_year_status (
        volunteer_id          INT            NOT NULL,
        year                  INT            NOT NULL,
        was_active            BIT            NOT NULL CONSTRAINT DF_vys_was_active  DEFAULT 0,
        recruitment_response  NVARCHAR(100)  NULL,
        response_other        NVARCHAR(500)  NULL,
        response_batch_id     INT            NULL,
        responded_at          DATETIME2(0)   NULL,
        decently_exported_at  DATETIME2(0)   NULL,
        decently_imported_at  DATETIME2(0)   NULL,
        snapshot_at           DATETIME2(0)   NOT NULL CONSTRAINT DF_vys_snapshot_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_volunteer_year_status
            PRIMARY KEY (volunteer_id, year),
        CONSTRAINT FK_vys_volunteer
            FOREIGN KEY (volunteer_id) REFERENCES dbo.volunteer_in(id),
        CONSTRAINT FK_vys_year
            FOREIGN KEY (year) REFERENCES dbo.convention_years(year),
        CONSTRAINT FK_vys_batch
            FOREIGN KEY (response_batch_id) REFERENCES dbo.invitation_batches(id)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_vys_year'
               AND object_id = OBJECT_ID('dbo.volunteer_year_status'))
    CREATE INDEX IX_vys_year
        ON dbo.volunteer_year_status (year, recruitment_response);
GO

IF OBJECT_ID('demo.volunteer_year_status', 'U') IS NULL
BEGIN
    CREATE TABLE demo.volunteer_year_status (
        volunteer_id          INT            NOT NULL,
        year                  INT            NOT NULL,
        was_active            BIT            NOT NULL CONSTRAINT DF_dvys_was_active  DEFAULT 0,
        recruitment_response  NVARCHAR(100)  NULL,
        response_other        NVARCHAR(500)  NULL,
        response_batch_id     INT            NULL,
        responded_at          DATETIME2(0)   NULL,
        decently_exported_at  DATETIME2(0)   NULL,
        decently_imported_at  DATETIME2(0)   NULL,
        snapshot_at           DATETIME2(0)   NOT NULL CONSTRAINT DF_dvys_snapshot_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_demo_volunteer_year_status
            PRIMARY KEY (volunteer_id, year),
        CONSTRAINT FK_dvys_volunteer
            FOREIGN KEY (volunteer_id) REFERENCES demo.volunteer_in(id),
        CONSTRAINT FK_dvys_year
            FOREIGN KEY (year) REFERENCES demo.convention_years(year),
        CONSTRAINT FK_dvys_batch
            FOREIGN KEY (response_batch_id) REFERENCES demo.invitation_batches(id)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_dvys_year'
               AND object_id = OBJECT_ID('demo.volunteer_year_status'))
    CREATE INDEX IX_dvys_year
        ON demo.volunteer_year_status (year, recruitment_response);
GO

-- ============================================================
-- 3. convention_days: allow days without program times
-- ============================================================

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.convention_days')
             AND name = 'program_start' AND is_nullable = 0)
    ALTER TABLE dbo.convention_days ALTER COLUMN program_start TIME(7) NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.convention_days')
             AND name = 'program_end' AND is_nullable = 0)
    ALTER TABLE dbo.convention_days ALTER COLUMN program_end TIME(7) NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('demo.convention_days')
             AND name = 'program_start' AND is_nullable = 0)
    ALTER TABLE demo.convention_days ALTER COLUMN program_start TIME(7) NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('demo.convention_days')
             AND name = 'program_end' AND is_nullable = 0)
    ALTER TABLE demo.convention_days ALTER COLUMN program_end TIME(7) NULL;
GO

-- ============================================================
-- Verify
-- ============================================================

SELECT 'dbo'  AS schema_name, * FROM dbo.convention_years
UNION ALL
SELECT 'demo' AS schema_name, * FROM demo.convention_years;

SELECT TABLE_SCHEMA, COLUMN_NAME, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'convention_days'
  AND COLUMN_NAME IN ('program_start', 'program_end');
