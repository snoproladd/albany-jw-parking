-- migration_F_demo.sql
-- Adds has_keyman and has_keyman_asst BIT columns to demo.shifts.

ALTER TABLE demo.shifts
    ADD has_keyman      BIT NOT NULL CONSTRAINT DF_demo_shifts_has_keyman      DEFAULT 1,
        has_keyman_asst BIT NOT NULL CONSTRAINT DF_demo_shifts_has_keyman_asst DEFAULT 1;
GO