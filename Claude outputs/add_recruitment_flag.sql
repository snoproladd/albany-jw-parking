-- add_recruitment_flag.sql
-- Phase 6: mark campaigns as recruitment campaigns, and record when each
-- volunteer's registration was completed.
--
-- invitation_batches.is_recruitment — when 1, Yes / Maybe replies to the
-- campaign feed the Decently export, and the year rollover records each
-- volunteer's latest reply to these campaigns as their recruitment
-- response for that year.
--
-- volunteer_in.registration_completed_at — stamped the first time a
-- registration becomes 'completed' (self sign-up, oversight Finalize, or
-- Assign Desk Role). Existing volunteers stay NULL, i.e. "joined in an
-- earlier year". The Decently export includes anyone who joined since the
-- active year started even without a recruitment reply.
--
-- Targets dbo and demo in one file. Safe to re-run.

IF COL_LENGTH('dbo.invitation_batches', 'is_recruitment') IS NULL
    ALTER TABLE dbo.invitation_batches
        ADD is_recruitment BIT NOT NULL
            CONSTRAINT DF_ib_is_recruitment DEFAULT 0;
GO

IF COL_LENGTH('demo.invitation_batches', 'is_recruitment') IS NULL
    ALTER TABLE demo.invitation_batches
        ADD is_recruitment BIT NOT NULL
            CONSTRAINT DF_dib_is_recruitment DEFAULT 0;
GO

IF COL_LENGTH('dbo.volunteer_in', 'registration_completed_at') IS NULL
    ALTER TABLE dbo.volunteer_in ADD registration_completed_at DATETIME2(0) NULL;
GO

IF COL_LENGTH('demo.volunteer_in', 'registration_completed_at') IS NULL
    ALTER TABLE demo.volunteer_in ADD registration_completed_at DATETIME2(0) NULL;
GO

-- Verify
SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM   INFORMATION_SCHEMA.COLUMNS
WHERE  (TABLE_NAME = 'invitation_batches' AND COLUMN_NAME = 'is_recruitment')
   OR  (TABLE_NAME = 'volunteer_in'       AND COLUMN_NAME = 'registration_completed_at')
ORDER  BY TABLE_NAME, TABLE_SCHEMA;

-- 2026 campaigns that asked for a response, newest first: pick the ones
-- that were recruitment and flag them in the Campaign Tracker (Edit
-- Campaign), or with an UPDATE by id.
SELECT id, name, message_type, created_at,
       (SELECT COUNT(*) FROM dbo.invitations i WHERE i.batch_id = b.id) AS sent,
       (SELECT COUNT(*) FROM dbo.invitations i
         WHERE i.batch_id = b.id AND LOWER(i.response) IN ('yes', 'maybe')) AS yes_or_maybe
FROM   dbo.invitation_batches b
WHERE  year = 2026 AND response_needed = 1 AND active = 1
ORDER  BY created_at DESC;
