-- =============================================================================
-- position_edit_log.sql   (multi-department phase 3d-7c)
-- =============================================================================
-- Lets permission_grant_log record changes to positions themselves:
-- adds the action 'position-edit' to ck_<schema>_pgl_action. The row's
-- detail JSON says what happened ("change": create, edit, retire,
-- reactivate) and which permissions were added or removed; volunteer_id is
-- the person who made the change.
--
-- Needs position_grants.sql first. LOCAL ONLY (albanyregional3_local) until
-- the multi-department branch ships. Safe to re-run.
-- =============================================================================
SET NOCOUNT ON;
GO

-- Admin session: see and write every department's rows.
EXEC sp_set_session_context N'scope', N'system';
GO

DECLARE @schema SYSNAME, @sql NVARCHAR(MAX), @ck SYSNAME;
DECLARE schema_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT name FROM (VALUES (N'dbo'), (N'demo')) s(name);
OPEN schema_cursor;
FETCH NEXT FROM schema_cursor INTO @schema;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @ck = N'ck_' + @schema + N'_pgl_action';

    IF OBJECT_ID(QUOTENAME(@schema) + N'.permission_grant_log', N'U') IS NULL
        PRINT CONCAT(@schema, ': permission_grant_log missing - run position_grants.sql first.');
    ELSE IF EXISTS (SELECT 1 FROM sys.check_constraints
                    WHERE name = @ck
                      AND definition LIKE N'%position-edit%')
        PRINT CONCAT(@schema, ': ', @ck, ' already allows position-edit.');
    ELSE
    BEGIN
        IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = @ck)
        BEGIN
            SET @sql = N'ALTER TABLE ' + QUOTENAME(@schema) + N'.permission_grant_log DROP CONSTRAINT ' + QUOTENAME(@ck) + N';';
            EXEC sp_executesql @sql;
        END

        SET @sql = N'ALTER TABLE ' + QUOTENAME(@schema) + N'.permission_grant_log ADD CONSTRAINT ' + QUOTENAME(@ck) + N'
    CHECK (action IN (N''grant'', N''revoke'', N''tier-down'', N''expire'', N''position-add'',
                      N''position-remove'', N''year-reset'', N''position-edit''));';
        EXEC sp_executesql @sql;
        PRINT CONCAT(@schema, ': ', @ck, ' now allows position-edit.');
    END

    FETCH NEXT FROM schema_cursor INTO @schema;
END
CLOSE schema_cursor;
DEALLOCATE schema_cursor;
GO
