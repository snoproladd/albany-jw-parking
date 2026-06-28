-- parking_counts.sql
-- Adds the parking_counts table for the Parking Counter feature (2.63.0).
-- Also adds extra_parking_count BIT to volunteer_in to enable per-volunteer
-- logParkingCount permission delegation (same pattern as extra_signs_placement).
--
-- Run against albanyregional3. Targets both dbo and demo schemas.
-- Each batch is separated by GO so SSMS / sqlcmd executes them independently.

-- ============================================================
-- 1. Add extra_parking_count to volunteer_in
-- ============================================================

ALTER TABLE dbo.volunteer_in
    ADD extra_parking_count BIT NOT NULL
        CONSTRAINT DF_vi_extra_parking_count DEFAULT 0;
GO

ALTER TABLE demo.volunteer_in
    ADD extra_parking_count BIT NOT NULL
        CONSTRAINT DF_dvi_extra_parking_count DEFAULT 0;
GO

-- ============================================================
-- 2. Create parking_counts table
-- ============================================================

CREATE TABLE dbo.parking_counts (
    id                INT IDENTITY(1,1) NOT NULL,
    volunteer_id      INT               NOT NULL,
    location_task_id  INT               NOT NULL,
    convention_day_id INT               NOT NULL,
    count             INT               NOT NULL CONSTRAINT DF_pc_count       DEFAULT 0,
    recorded_at       DATETIME2(0)      NOT NULL CONSTRAINT DF_pc_recorded_at DEFAULT GETUTCDATE(),
    is_final          BIT               NOT NULL CONSTRAINT DF_pc_is_final    DEFAULT 0,
    CONSTRAINT PK_parking_counts PRIMARY KEY (id),
    CONSTRAINT FK_parking_counts_volunteer
        FOREIGN KEY (volunteer_id)      REFERENCES dbo.volunteer_in(id)     ON DELETE CASCADE,
    CONSTRAINT FK_parking_counts_location
        FOREIGN KEY (location_task_id)  REFERENCES dbo.locations_tasks(id),
    CONSTRAINT FK_parking_counts_day
        FOREIGN KEY (convention_day_id) REFERENCES dbo.convention_days(id)
);
GO

CREATE TABLE demo.parking_counts (
    id                INT IDENTITY(1,1) NOT NULL,
    volunteer_id      INT               NOT NULL,
    location_task_id  INT               NOT NULL,
    convention_day_id INT               NOT NULL,
    count             INT               NOT NULL CONSTRAINT DF_dpc_count       DEFAULT 0,
    recorded_at       DATETIME2(0)      NOT NULL CONSTRAINT DF_dpc_recorded_at DEFAULT GETUTCDATE(),
    is_final          BIT               NOT NULL CONSTRAINT DF_dpc_is_final    DEFAULT 0,
    CONSTRAINT PK_demo_parking_counts PRIMARY KEY (id),
    CONSTRAINT FK_demo_parking_counts_volunteer
        FOREIGN KEY (volunteer_id)      REFERENCES demo.volunteer_in(id)     ON DELETE CASCADE,
    CONSTRAINT FK_demo_parking_counts_location
        FOREIGN KEY (location_task_id)  REFERENCES demo.locations_tasks(id),
    CONSTRAINT FK_demo_parking_counts_day
        FOREIGN KEY (convention_day_id) REFERENCES demo.convention_days(id)
);
GO

-- ============================================================
-- 3. Indexes
-- ============================================================

-- Primary report access pattern: filter by day, order by time.
CREATE INDEX IX_parking_counts_day_time
    ON dbo.parking_counts (convention_day_id, recorded_at);
GO

CREATE INDEX IX_dpc_day_time
    ON demo.parking_counts (convention_day_id, recorded_at);
GO

-- Per-volunteer history lookup.
CREATE INDEX IX_parking_counts_volunteer
    ON dbo.parking_counts (volunteer_id, convention_day_id);
GO

CREATE INDEX IX_dpc_volunteer
    ON demo.parking_counts (volunteer_id, convention_day_id);
GO
