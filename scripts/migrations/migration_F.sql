-- migration_F.sql
-- Adds has_keyman and has_keyman_asst BIT columns to dbo.shifts.
-- DEFAULT 1 preserves existing scheduler behaviour — KM/KA slots already
-- render for all non-MS shifts in the current UI.

ALTER TABLE dbo.shifts
    ADD has_keyman      BIT NOT NULL CONSTRAINT DF_shifts_has_keyman      DEFAULT 1,
        has_keyman_asst BIT NOT NULL CONSTRAINT DF_shifts_has_keyman_asst DEFAULT 1;
GO