-- =============================================================================
-- addResponseConfig_demo.sql  (demo)
-- =============================================================================
-- Mirrors addResponseConfig.sql for the demo schema.
-- Run after addResponseConfig.sql.
-- Safe to re-run.
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('demo.invitation_batches')
               AND name = 'response_config')
BEGIN
    ALTER TABLE demo.invitation_batches
        ADD response_config NVARCHAR(MAX) NULL;
    PRINT 'Added response_config to demo.invitation_batches.';
END
ELSE PRINT 'demo.invitation_batches.response_config already exists — skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('demo.invitations')
               AND name = 'response_other')
BEGIN
    ALTER TABLE demo.invitations
        ADD response_other NVARCHAR(500) NULL;
    PRINT 'Added response_other to demo.invitations.';
END
ELSE PRINT 'demo.invitations.response_other already exists — skipped.';
GO

-- Verify
SELECT t.name AS table_name, c.name AS column_name, c.max_length, c.is_nullable
FROM sys.columns c
JOIN sys.tables t  ON t.object_id = c.object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
WHERE s.name = 'demo'
  AND c.name IN ('response_config', 'response_other')
ORDER BY t.name, c.name;
GO

PRINT '=== addResponseConfig_demo.sql complete ===';
GO
