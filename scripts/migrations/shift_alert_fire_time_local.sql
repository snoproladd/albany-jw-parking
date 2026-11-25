-- =============================================================================
-- shift_alert_fire_time_local.sql   (Shift Alerts fire time in convention time, 2026-11-25)
-- =============================================================================
-- Burst shift alerts (Next Day, Same Day, All Upcoming) now keep their fire
-- time as a convention clock time on fire_date, the same as shift times. The
-- app turns it into a real moment in the convention's time zone
-- (convention_years.time_zone, lib/conventionTime.js), so daylight saving and
-- venues in other zones are handled.
--
--   shift_alert_schedules.fire_time_local  TIME(0) NULL
--       The time the admin typed, in convention time, e.g. 19:00.
--
-- The old fire_time_utc column stays (NULL on every save from now on) so a
-- rollback still has its data; drop it once 3.0 has shipped.
--
-- Existing rows: the old page took the typed time as Eastern summer time and
-- added 4 hours without moving the date. So fire_time_local = fire_time_utc
-- minus 4 hours, on the same fire_date, gives back exactly what was typed.
-- (That also fixes times of 8:00 PM or later, which used to fire a day early.)
-- Only rows with no fire_time_local yet are filled.
--
-- Runs in the system scope (set below) so row-level security lets it see
-- every department's schedules. LOCAL ONLY (albanyregional3_local) until the
-- multi-department branch ships; then part of the production cutover, after
-- convention_time_zone.sql. Safe to re-run.
-- =============================================================================
SET NOCOUNT ON;
EXEC sp_set_session_context @key = N'scope', @value = N'system';
GO

-- ── dbo: column ──────────────────────────────────────────────────────────────
IF OBJECT_ID(N'dbo.shift_alert_schedules', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.shift_alert_schedules', N'fire_time_local') IS NULL
BEGIN
    ALTER TABLE dbo.shift_alert_schedules ADD fire_time_local TIME(0) NULL;
    PRINT 'Added fire_time_local to dbo.shift_alert_schedules.';
END
ELSE
    PRINT 'dbo.shift_alert_schedules already has fire_time_local (or no table) - skipped.';
GO

-- ── dbo: fill from the old column ────────────────────────────────────────────
IF COL_LENGTH(N'dbo.shift_alert_schedules', N'fire_time_local') IS NOT NULL
BEGIN
    UPDATE dbo.shift_alert_schedules
    SET    fire_time_local = CAST(DATEADD(HOUR, -4, CAST(fire_time_utc AS TIME(0))) AS TIME(0))
    WHERE  fire_time_local IS NULL
      AND  fire_time_utc IS NOT NULL;
    PRINT CONCAT('dbo: filled fire_time_local on ', @@ROWCOUNT, ' schedule(s).');
END
GO

-- ── demo: column ─────────────────────────────────────────────────────────────
IF OBJECT_ID(N'demo.shift_alert_schedules', N'U') IS NOT NULL
   AND COL_LENGTH(N'demo.shift_alert_schedules', N'fire_time_local') IS NULL
BEGIN
    ALTER TABLE demo.shift_alert_schedules ADD fire_time_local TIME(0) NULL;
    PRINT 'Added fire_time_local to demo.shift_alert_schedules.';
END
ELSE
    PRINT 'demo.shift_alert_schedules already has fire_time_local (or no table) - skipped.';
GO

-- ── demo: fill from the old column ───────────────────────────────────────────
IF COL_LENGTH(N'demo.shift_alert_schedules', N'fire_time_local') IS NOT NULL
BEGIN
    UPDATE demo.shift_alert_schedules
    SET    fire_time_local = CAST(DATEADD(HOUR, -4, CAST(fire_time_utc AS TIME(0))) AS TIME(0))
    WHERE  fire_time_local IS NULL
      AND  fire_time_utc IS NOT NULL;
    PRINT CONCAT('demo: filled fire_time_local on ', @@ROWCOUNT, ' schedule(s).');
END
GO

-- ── Verify ───────────────────────────────────────────────────────────────────
SELECT id, year, name, fire_date, fire_time_utc, fire_time_local, active
FROM   dbo.shift_alert_schedules
WHERE  alert_category <> 't15min'
ORDER BY year, fire_date, fire_time_local;
GO

PRINT '=== shift_alert_fire_time_local.sql complete ===';
GO
