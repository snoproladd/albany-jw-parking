-- parking_counts_is_manual.sql
-- Adds is_manual BIT to parking_counts (dbo + demo) to distinguish
-- volunteer tap-counter submissions from manually entered counts.
-- Apply after parking_counts.sql.

ALTER TABLE dbo.parking_counts
    ADD is_manual BIT NOT NULL
        CONSTRAINT DF_pc_is_manual DEFAULT 0;
GO

ALTER TABLE demo.parking_counts
    ADD is_manual BIT NOT NULL
        CONSTRAINT DF_dpc_is_manual DEFAULT 0;
GO
