-- =============================================================================
-- addResponseConfig.sql  (dbo)
-- =============================================================================
-- Adds dynamic RSVP configuration to invitation_batches and a free-text
-- response field to invitations.
--
-- New columns:
--   invitation_batches.response_config  NVARCHAR(MAX) NULL
--     JSON shape:
--       { "type": "standard", "options": ["yes","no","maybe"], "allowOther": false }
--       { "type": "custom",   "options": ["Friday","Saturday","All Days"], "allowOther": true }
--       { "type": "poll",     "question": "Shirt size?", "options": ["S","M","L","XL"], "allowOther": false }
--     NULL = use default standard (yes/no/maybe), fully backward-compatible.
--
--   invitations.response_other  NVARCHAR(500) NULL
--     Stores free-text "Other" input when allowOther is true.
--     NULL when not applicable.
--
-- Run against albanyregional3 as admin user.
-- Safe to re-run.
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.invitation_batches')
               AND name = 'response_config')
BEGIN
    ALTER TABLE dbo.invitation_batches
        ADD response_config NVARCHAR(MAX) NULL;
    PRINT 'Added response_config to dbo.invitation_batches.';
END
ELSE PRINT 'dbo.invitation_batches.response_config already exists — skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.invitations')
               AND name = 'response_other')
BEGIN
    ALTER TABLE dbo.invitations
        ADD response_other NVARCHAR(500) NULL;
    PRINT 'Added response_other to dbo.invitations.';
END
ELSE PRINT 'dbo.invitations.response_other already exists — skipped.';
GO

-- Verify
SELECT t.name AS table_name, c.name AS column_name, c.max_length, c.is_nullable
FROM sys.columns c
JOIN sys.tables t  ON t.object_id = c.object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
WHERE s.name = 'dbo'
  AND c.name IN ('response_config', 'response_other')
ORDER BY t.name, c.name;
GO

PRINT '=== addResponseConfig.sql complete ===';
GO
