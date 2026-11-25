-- =============================================================================
-- capacity_alert_last_sent.sql   (missing column from v2.81.0, 2026-11-25)
-- =============================================================================
-- capacity_alert_rules.last_sent_at   when the rule last fired (UTC).
--
-- v2.81.0 (2026-07-03) added the 5-minute resend cooldown: lib/dbSync.js
-- getActiveCapacityAlertRulesForLocation() reads this column and
-- disarmCapacityAlertRule() sets it. No migration was ever written, so on a
-- database without it every count's rule lookup fails ("Invalid column name
-- 'last_sent_at'", logged as "[capacityAlerter] failed to load rules") and
-- no capacity alert can fire. Found 2026-11-25 on albanyregional3_local
-- (a copy of production), so production very likely needs it too.
--
-- Existing rules start with NULL (no cooldown in force). Both schemas; no
-- new tables, so row-level security is unchanged. Runs in the system scope
-- (set below). Safe to re-run.
-- =============================================================================
SET NOCOUNT ON;
EXEC sp_set_session_context @key = N'scope', @value = N'system';
GO

-- ── dbo ──────────────────────────────────────────────────────────────────────
IF OBJECT_ID(N'dbo.capacity_alert_rules', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.capacity_alert_rules', N'last_sent_at') IS NULL
BEGIN
    ALTER TABLE dbo.capacity_alert_rules ADD last_sent_at DATETIME2(3) NULL;
    PRINT 'Added dbo.capacity_alert_rules.last_sent_at.';
END
ELSE
    PRINT 'dbo.capacity_alert_rules.last_sent_at exists or there is no table - skipped.';
GO

-- ── demo ─────────────────────────────────────────────────────────────────────
IF OBJECT_ID(N'demo.capacity_alert_rules', N'U') IS NOT NULL
   AND COL_LENGTH(N'demo.capacity_alert_rules', N'last_sent_at') IS NULL
BEGIN
    ALTER TABLE demo.capacity_alert_rules ADD last_sent_at DATETIME2(3) NULL;
    PRINT 'Added demo.capacity_alert_rules.last_sent_at.';
END
ELSE
    PRINT 'demo.capacity_alert_rules.last_sent_at exists or there is no table - skipped.';
GO

-- ── Verify ───────────────────────────────────────────────────────────────────
SELECT s.name AS schema_name,
       CASE WHEN c.name IS NULL THEN 'MISSING' ELSE 'yes' END AS has_last_sent_at
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
LEFT JOIN sys.columns c ON c.object_id = t.object_id AND c.name = N'last_sent_at'
WHERE t.name = N'capacity_alert_rules';
GO

PRINT '=== capacity_alert_last_sent.sql complete ===';
GO
