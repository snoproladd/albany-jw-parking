-- =============================================================================
-- alert_delivery_tracking.sql   (shift reminder / capacity alert delivery, 2026-11-25)
-- =============================================================================
-- Shift reminders, capacity alerts and meet-up (rendezvous) alerts are now
-- recorded in message_deliveries (sources 'shift_reminder', 'capacity_alert',
-- 'rendezvous_alert') and followed through Twilio's status callback, like
-- publish and campaign texts.
--
--   shift_alert_log      no change: its rows find their delivery through
--                        twilio_sid = message_deliveries.provider_sid.
--   capacity_alert_log   run_id: the message_deliveries run of that firing
--                        (one row per firing, one delivery row per person).
--
-- No new tables, so row-level security is unchanged. Runs in the system
-- scope (set below). LOCAL ONLY (albanyregional3_local) until the
-- multi-department branch ships; then part of the production cutover (after
-- message_deliveries.sql). Safe to re-run.
--
-- Production also needs the App Service setting
-- APP_BASE_URL=https://albanyjwparking.org, or these texts are sent
-- untracked (the timed sends have no web request to take the address from).
-- Never set APP_BASE_URL to the production address in a local .env.
-- =============================================================================
SET NOCOUNT ON;
EXEC sp_set_session_context @key = N'scope', @value = N'system';
GO

-- ── dbo ──────────────────────────────────────────────────────────────────────
IF OBJECT_ID(N'dbo.capacity_alert_log', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.capacity_alert_log', N'run_id') IS NULL
BEGIN
    ALTER TABLE dbo.capacity_alert_log ADD run_id NVARCHAR(64) NULL;
    PRINT 'Added dbo.capacity_alert_log.run_id.';
END
ELSE
    PRINT 'dbo.capacity_alert_log.run_id exists or there is no table - skipped.';
GO

-- ── demo ─────────────────────────────────────────────────────────────────────
IF OBJECT_ID(N'demo.capacity_alert_log', N'U') IS NOT NULL
   AND COL_LENGTH(N'demo.capacity_alert_log', N'run_id') IS NULL
BEGIN
    ALTER TABLE demo.capacity_alert_log ADD run_id NVARCHAR(64) NULL;
    PRINT 'Added demo.capacity_alert_log.run_id.';
END
ELSE
    PRINT 'demo.capacity_alert_log.run_id exists or there is no table - skipped.';
GO

-- ── Verify ───────────────────────────────────────────────────────────────────
SELECT s.name AS schema_name, t.name AS table_name,
       CASE WHEN c.name IS NULL THEN 'MISSING' ELSE 'yes' END AS has_run_id
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
LEFT JOIN sys.columns c ON c.object_id = t.object_id AND c.name = N'run_id'
WHERE t.name = N'capacity_alert_log';
GO

PRINT '=== alert_delivery_tracking.sql complete ===';
GO
