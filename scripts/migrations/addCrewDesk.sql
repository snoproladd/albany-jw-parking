-- addCrewDesk.sql
-- Add crew_desk BIT column to volunteer_in for Desk department crew assignment.
-- Safe to re-run.

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME   = 'volunteer_in'
      AND COLUMN_NAME  = 'crew_desk'
)
BEGIN
    ALTER TABLE dbo.volunteer_in ADD crew_desk BIT NOT NULL DEFAULT 0;
    PRINT 'Added dbo.volunteer_in.crew_desk';
END
ELSE
BEGIN
    PRINT 'dbo.volunteer_in.crew_desk already exists — skipping.';
END
