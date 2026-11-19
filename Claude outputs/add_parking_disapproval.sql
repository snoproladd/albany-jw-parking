-- add_parking_disapproval.sql
-- Phase 6b: "Not approved for parking" — parking's own decision, separate
-- from Decently's approval.
--
-- volunteer_in.disapproved_year / disapproved_by / disapproved_at
--   Set from the volunteer's oversight record. While disapproved_year is
--   the active convention year the volunteer stays inactive: Decently
--   imports and recruitment Yes replies will not activate them, and the
--   Decently export skips them. Turning Active back on (with confirmation)
--   clears it. It lapses on its own when a new year starts.
--
-- volunteer_year_status.was_disapproved
--   Recorded by the year rollover, so next year shows who was not approved.
--
-- Targets dbo and demo in one file. Safe to re-run.
-- Run AFTER convention_years.sql (volunteer_year_status must exist).

IF COL_LENGTH('dbo.volunteer_in', 'disapproved_year') IS NULL
    ALTER TABLE dbo.volunteer_in ADD
        disapproved_year INT           NULL,
        disapproved_by   NVARCHAR(100) NULL,
        disapproved_at   DATETIME2(0)  NULL;
GO

IF COL_LENGTH('demo.volunteer_in', 'disapproved_year') IS NULL
    ALTER TABLE demo.volunteer_in ADD
        disapproved_year INT           NULL,
        disapproved_by   NVARCHAR(100) NULL,
        disapproved_at   DATETIME2(0)  NULL;
GO

IF COL_LENGTH('dbo.volunteer_year_status', 'was_disapproved') IS NULL
    ALTER TABLE dbo.volunteer_year_status
        ADD was_disapproved BIT NOT NULL
            CONSTRAINT DF_vys_was_disapproved DEFAULT 0;
GO

IF COL_LENGTH('demo.volunteer_year_status', 'was_disapproved') IS NULL
    ALTER TABLE demo.volunteer_year_status
        ADD was_disapproved BIT NOT NULL
            CONSTRAINT DF_dvys_was_disapproved DEFAULT 0;
GO

-- Verify
SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM   INFORMATION_SCHEMA.COLUMNS
WHERE  (TABLE_NAME = 'volunteer_in'          AND COLUMN_NAME LIKE 'disapproved[_]%')
   OR  (TABLE_NAME = 'volunteer_year_status' AND COLUMN_NAME = 'was_disapproved')
ORDER  BY TABLE_NAME, TABLE_SCHEMA, COLUMN_NAME;
