-- =============================================================================
-- deleteTestCampaigns.sql   (LOCAL TEST CLEAN-UP ONLY)
-- =============================================================================
-- Deletes every campaign whose name contains "test" (any case), with
-- everything that hangs off it:
--   - its follow-up campaigns (even when their own name has no "test")
--   - their invitations and the revoke / reinstate log of those invitations
--   - their send history (campaign_sends; campaign_send_recipients cascade)
--   - the text / email delivery rows of those sends (message_deliveries)
--
-- PREVIEW BY DEFAULT: without DoDelete=1 it only lists what would go.
--   Preview: sqlcmd -S localhost -d albanyregional3_local -E -i "scripts\deleteTestCampaigns.sql" -v DoDelete=0
--   Delete:  sqlcmd -S localhost -d albanyregional3_local -E -i "scripts\deleteTestCampaigns.sql" -v DoDelete=1
--
-- Refuses to run on any database whose name doesn't end in "_local".
-- Everything is deleted in one transaction: if anything fails (for example a
-- table this script doesn't know about still points at an invitation),
-- nothing is deleted.
-- =============================================================================
SET NOCOUNT ON;
SET XACT_ABORT ON;
EXEC sp_set_session_context @key = N'scope', @value = N'system';

DECLARE @db NVARCHAR(128) = DB_NAME();
IF @db NOT LIKE N'%[_]local'
BEGIN
    RAISERROR('deleteTestCampaigns.sql only runs on a *_local database (this is %s). Nothing done.', 16, 1, @db);
    RETURN;
END

DECLARE @doDelete BIT = $(DoDelete);

-- Campaigns to delete: named "test", plus their follow-ups
DECLARE @batches TABLE (id INT PRIMARY KEY);
INSERT INTO @batches (id)
SELECT id FROM dbo.invitation_batches WHERE name LIKE N'%test%';
INSERT INTO @batches (id)
SELECT c.id
FROM dbo.invitation_batches c
WHERE c.parent_batch_id IN (SELECT id FROM @batches)
  AND c.id NOT IN (SELECT id FROM @batches);

-- ── Preview ──────────────────────────────────────────────────────────────────
SELECT b.id, b.name, b.parent_batch_id, b.year, b.active,
       (SELECT COUNT(*) FROM dbo.invitations i WHERE i.batch_id = b.id) AS invitations,
       (SELECT COUNT(*) FROM dbo.campaign_sends s WHERE s.batch_id = b.id) AS sends
FROM dbo.invitation_batches b
WHERE b.id IN (SELECT id FROM @batches)
ORDER BY COALESCE(b.parent_batch_id, b.id), b.id;

SELECT
    (SELECT COUNT(*) FROM @batches)                                                   AS campaigns,
    (SELECT COUNT(*) FROM dbo.invitations WHERE batch_id IN (SELECT id FROM @batches)) AS invitations,
    (SELECT COUNT(*) FROM dbo.campaign_sends WHERE batch_id IN (SELECT id FROM @batches)) AS sends,
    (SELECT COUNT(*) FROM dbo.message_deliveries d
       WHERE d.source = 'campaign'
         AND d.run_id IN (SELECT run_id FROM dbo.campaign_sends
                          WHERE batch_id IN (SELECT id FROM @batches) AND run_id IS NOT NULL)) AS deliveries;

IF @doDelete = 0
BEGIN
    PRINT 'Preview only. Run again with -v DoDelete=1 to delete the campaigns listed above.';
    RETURN;
END

-- ── Delete ───────────────────────────────────────────────────────────────────
BEGIN TRANSACTION;

DELETE d
FROM dbo.message_deliveries d
WHERE d.source = 'campaign'
  AND d.run_id IN (SELECT run_id FROM dbo.campaign_sends
                   WHERE batch_id IN (SELECT id FROM @batches) AND run_id IS NOT NULL);
PRINT CONCAT('Deleted ', @@ROWCOUNT, ' delivery row(s).');

-- campaign_send_recipients go with their sends (ON DELETE CASCADE)
DELETE FROM dbo.campaign_sends WHERE batch_id IN (SELECT id FROM @batches);
PRINT CONCAT('Deleted ', @@ROWCOUNT, ' send(s).');

IF OBJECT_ID(N'dbo.invitation_revocation_log', N'U') IS NOT NULL
BEGIN
    DELETE FROM dbo.invitation_revocation_log
    WHERE batch_id IN (SELECT id FROM @batches)
       OR invitation_id IN (SELECT id FROM dbo.invitations WHERE batch_id IN (SELECT id FROM @batches));
    PRINT CONCAT('Deleted ', @@ROWCOUNT, ' revoke log row(s).');
END

DELETE FROM dbo.invitations WHERE batch_id IN (SELECT id FROM @batches);
PRINT CONCAT('Deleted ', @@ROWCOUNT, ' invitation(s).');

-- Follow-ups first, then the campaigns they follow
DELETE FROM dbo.invitation_batches
WHERE id IN (SELECT id FROM @batches) AND parent_batch_id IN (SELECT id FROM @batches);
DELETE FROM dbo.invitation_batches WHERE id IN (SELECT id FROM @batches);
PRINT 'Deleted the campaigns.';

COMMIT TRANSACTION;
PRINT '=== deleteTestCampaigns.sql complete ===';
