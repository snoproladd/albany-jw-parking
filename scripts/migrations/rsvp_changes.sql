-- =============================================================================
-- rsvp_changes.sql   (RSVP page: Respond-by date, changed answers, 2026-11-25)
-- =============================================================================
-- invitation_batches.respond_by        optional "Respond by" date of a
--                                      campaign. Volunteers can change their
--                                      answer until then; answers after it are
--                                      still taken (shown as past the date).
-- invitations.previous_response        the answer before the latest change
-- invitations.previous_response_other  its free text, for "Other"
-- invitations.response_changed_at      when the answer last changed
-- invitations.response_change_count    how many times it has changed
-- invitations.response_source          where the current answer came from:
--                                      'link' (RSVP page), 'text' (texted
--                                      YES / NO / MAYBE) or 'oversight' (set
--                                      on Edit Volunteer)
--
-- No new tables, so row-level security is unchanged. Runs in the system
-- scope (set below). LOCAL ONLY (albanyregional3_local) until the
-- multi-department branch ships; then part of the production cutover (after
-- campaign_sends.sql). Safe to re-run.
-- =============================================================================
SET NOCOUNT ON;
EXEC sp_set_session_context @key = N'scope', @value = N'system';
GO

-- ── dbo ──────────────────────────────────────────────────────────────────────
IF OBJECT_ID(N'dbo.invitation_batches', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.invitation_batches', N'respond_by') IS NULL
BEGIN
    ALTER TABLE dbo.invitation_batches ADD respond_by DATE NULL;
    PRINT 'Added dbo.invitation_batches.respond_by.';
END
GO

IF OBJECT_ID(N'dbo.invitations', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.invitations', N'response_changed_at') IS NULL
BEGIN
    ALTER TABLE dbo.invitations ADD
        previous_response       NVARCHAR(50)  NULL,
        previous_response_other NVARCHAR(500) NULL,
        response_changed_at     DATETIME2(3)  NULL,
        response_change_count   INT           NOT NULL CONSTRAINT df_dbo_inv_change_count DEFAULT (0),
        response_source         VARCHAR(10)   NULL
            CONSTRAINT CK_dbo_inv_response_source CHECK (response_source IN ('link', 'text', 'oversight'));
    PRINT 'Added answer-change columns to dbo.invitations.';
END
GO

-- ── demo ──────────────────────────────────────────────────────────────────────
IF OBJECT_ID(N'demo.invitation_batches', N'U') IS NOT NULL
   AND COL_LENGTH(N'demo.invitation_batches', N'respond_by') IS NULL
BEGIN
    ALTER TABLE demo.invitation_batches ADD respond_by DATE NULL;
    PRINT 'Added demo.invitation_batches.respond_by.';
END
GO

IF OBJECT_ID(N'demo.invitations', N'U') IS NOT NULL
   AND COL_LENGTH(N'demo.invitations', N'response_changed_at') IS NULL
BEGIN
    ALTER TABLE demo.invitations ADD
        previous_response       NVARCHAR(50)  NULL,
        previous_response_other NVARCHAR(500) NULL,
        response_changed_at     DATETIME2(3)  NULL,
        response_change_count   INT           NOT NULL CONSTRAINT df_demo_inv_change_count DEFAULT (0),
        response_source         VARCHAR(10)   NULL
            CONSTRAINT CK_demo_inv_response_source CHECK (response_source IN ('link', 'text', 'oversight'));
    PRINT 'Added answer-change columns to demo.invitations.';
END
GO

-- Verify ----------------------------------------------------------------------
SELECT OBJECT_SCHEMA_NAME(object_id) AS schema_name, OBJECT_NAME(object_id) AS table_name, name AS column_name
FROM sys.columns
WHERE name IN (N'respond_by', N'previous_response', N'previous_response_other',
               N'response_changed_at', N'response_change_count', N'response_source')
ORDER BY schema_name, table_name, column_id;
GO

PRINT '=== rsvp_changes.sql complete ===';
GO
