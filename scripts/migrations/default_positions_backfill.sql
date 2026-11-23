-- =============================================================================
-- default_positions_backfill.sql   (multi-department phase 3d-8, step 1)
-- =============================================================================
-- Gives the department's default (Volunteer) position to every member who
-- has finished registering (volunteer_in.registration_status = 'completed')
-- and holds no active position in that department.
--
-- Why: memberships created by self-registration have role NULL. The role
-- sync (3c..3d-7c) and the default-position check (3d-7d) only looked at the
-- role, so those volunteers got no position and, since phase 3d, only the
-- account-level permissions (edit own profile). lib/positions.js
-- ensureDefaultPosition() now uses the registration status; this script
-- fixes everyone at once instead of waiting for their next sign-in.
--
-- Each added row is logged in permission_grant_log as 'position-add' with
-- actor_name 'default position backfill'. Prints the count per schema.
--
-- LOCAL ONLY (albanyregional3_local) until the multi-department branch
-- ships. Safe to re-run: a second run adds nothing.
-- =============================================================================
SET NOCOUNT ON;
GO

-- Admin session: see and write every department's rows.
EXEC sp_set_session_context N'scope', N'system';
GO

DECLARE @schema SYSNAME, @sql NVARCHAR(MAX), @added INT;
DECLARE schema_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT name FROM (VALUES (N'dbo'), (N'demo')) s(name);
OPEN schema_cursor;
FETCH NEXT FROM schema_cursor INTO @schema;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF OBJECT_ID(QUOTENAME(@schema) + N'.member_positions', N'U') IS NULL
        OR OBJECT_ID(QUOTENAME(@schema) + N'.permission_grant_log', N'U') IS NULL
    BEGIN
        PRINT CONCAT(@schema, ': positions tables missing - run positions.sql and position_grants.sql first.');
    END
    ELSE
    BEGIN
        SET @sql = N'
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @addedRows TABLE (volunteer_id INT, department_id INT, position_id INT);

INSERT INTO ' + QUOTENAME(@schema) + N'.member_positions (volunteer_id, department_id, position_id, granted_by)
OUTPUT inserted.volunteer_id, inserted.department_id, inserted.position_id INTO @addedRows
SELECT m.volunteer_id, m.department_id, p.id, N''default position backfill''
FROM   ' + QUOTENAME(@schema) + N'.department_members m
JOIN   ' + QUOTENAME(@schema) + N'.volunteer_in v
       ON v.id = m.volunteer_id AND v.registration_status = ''completed''
JOIN   ' + QUOTENAME(@schema) + N'.positions p
       ON p.department_id = m.department_id AND p.is_default = 1 AND p.active = 1
WHERE  NOT EXISTS (SELECT 1
                   FROM ' + QUOTENAME(@schema) + N'.member_positions mp
                   JOIN ' + QUOTENAME(@schema) + N'.positions hp ON hp.id = mp.position_id AND hp.active = 1
                   WHERE mp.volunteer_id = m.volunteer_id AND mp.department_id = m.department_id);

INSERT INTO ' + QUOTENAME(@schema) + N'.permission_grant_log
       (department_id, volunteer_id, action, position_id, actor_name)
SELECT department_id, volunteer_id, N''position-add'', position_id, N''default position backfill''
FROM   @addedRows;

COMMIT TRANSACTION;

SELECT @addedOut = COUNT(*) FROM @addedRows;';
        EXEC sp_executesql @sql, N'@addedOut INT OUTPUT', @addedOut = @added OUTPUT;
        PRINT CONCAT(@schema, ': default position given to ', @added, ' member(s).');
    END

    FETCH NEXT FROM schema_cursor INTO @schema;
END
CLOSE schema_cursor;
DEALLOCATE schema_cursor;
GO
