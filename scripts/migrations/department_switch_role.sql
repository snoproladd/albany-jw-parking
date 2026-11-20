-- =============================================================================
-- department_switch_role.sql   (multi-department phase 2b-3a)
-- =============================================================================
-- Moves the role to department_members for good, in both the dbo and demo
-- schemas:
--   1. Re-copies volunteer_in.role into each volunteer's department 1
--      membership (catches any change made since department_membership.sql).
--   2. Drops volunteer_in.role, plus anything attached to it (defaults,
--      foreign keys, check constraints, indexes, statistics).
--
-- Run together with the phase 2b-3a code (lib/dbSync.js, routes/
-- accountRoutes.js, scripts/seedDemo.js): from then on the role is read and
-- written only on department_members. Dropping the column makes any missed
-- reference fail loudly ("Invalid column name 'role'") instead of reading a
-- stale copy.
--
-- LOCAL ONLY (albanyregional3_local). Never run against albanyregional3.
-- Safe to re-run: once the column is gone every step reports "skipped".
-- =============================================================================
SET NOCOUNT ON;

DECLARE @schemas TABLE (name SYSNAME PRIMARY KEY);
INSERT INTO @schemas (name) VALUES (N'dbo'), (N'demo');

DECLARE @schema SYSNAME, @obj INT, @col INT, @sql NVARCHAR(MAX), @n INT, @name SYSNAME, @kind NVARCHAR(20);

DECLARE schema_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT name FROM @schemas ORDER BY name;
OPEN schema_cursor;
FETCH NEXT FROM schema_cursor INTO @schema;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @obj = OBJECT_ID(QUOTENAME(@schema) + N'.volunteer_in', 'U');
    SET @col = (SELECT column_id FROM sys.columns WHERE object_id = @obj AND name = N'role');

    IF @col IS NULL
        PRINT CONCAT(@schema, N'.volunteer_in.role already dropped — skipped.');
    ELSE
    BEGIN
        -- 1. Re-copy into the department 1 membership
        SET @sql = N'UPDATE m SET m.role = v.role
                     FROM ' + QUOTENAME(@schema) + N'.department_members m
                     JOIN ' + QUOTENAME(@schema) + N'.volunteer_in v ON v.id = m.volunteer_id
                     WHERE m.department_id = 1
                       AND ISNULL(m.role, N'''') <> ISNULL(v.role, N'''');
                     SET @n = @@ROWCOUNT;';
        EXEC sp_executesql @sql, N'@n INT OUTPUT', @n = @n OUTPUT;
        PRINT CONCAT(@schema, N': re-copied ', @n, N' changed role(s) into department 1 memberships.');

        -- Anyone still without a department 1 membership gets one
        SET @sql = N'INSERT INTO ' + QUOTENAME(@schema) + N'.department_members (volunteer_id, department_id, role, active_current_year)
                     SELECT v.id, 1, v.role, ISNULL(v.active_current_year, 0)
                     FROM ' + QUOTENAME(@schema) + N'.volunteer_in v
                     WHERE NOT EXISTS (SELECT 1 FROM ' + QUOTENAME(@schema) + N'.department_members m
                                       WHERE m.volunteer_id = v.id AND m.department_id = 1);
                     SET @n = @@ROWCOUNT;';
        EXEC sp_executesql @sql, N'@n INT OUTPUT', @n = @n OUTPUT;
        IF @n > 0 PRINT CONCAT(@schema, N': added ', @n, N' missing department 1 membership(s).');

        -- 2. Drop everything attached to the column, then the column
        DECLARE dep_cursor CURSOR LOCAL FAST_FORWARD FOR
            SELECT N'CONSTRAINT', dc.name FROM sys.default_constraints dc
             WHERE dc.parent_object_id = @obj AND dc.parent_column_id = @col
            UNION ALL
            SELECT N'CONSTRAINT', cc.name FROM sys.check_constraints cc
             WHERE cc.parent_object_id = @obj AND cc.parent_column_id = @col
            UNION ALL
            SELECT N'CONSTRAINT', fk.name FROM sys.foreign_keys fk
             JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
             WHERE fkc.parent_object_id = @obj AND fkc.parent_column_id = @col
            UNION ALL
            SELECT N'INDEX', i.name FROM sys.indexes i
             JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
             WHERE i.object_id = @obj AND ic.column_id = @col AND i.is_primary_key = 0
            UNION ALL
            SELECT N'STATISTICS', st.name FROM sys.stats st
             JOIN sys.stats_columns sc ON sc.object_id = st.object_id AND sc.stats_id = st.stats_id
             WHERE st.object_id = @obj AND sc.column_id = @col AND st.user_created = 1;

        OPEN dep_cursor;
        FETCH NEXT FROM dep_cursor INTO @kind, @name;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            SET @sql = CASE @kind
                WHEN N'INDEX'      THEN N'DROP INDEX ' + QUOTENAME(@name) + N' ON ' + QUOTENAME(@schema) + N'.volunteer_in;'
                WHEN N'STATISTICS' THEN N'DROP STATISTICS ' + QUOTENAME(@schema) + N'.volunteer_in.' + QUOTENAME(@name) + N';'
                ELSE N'ALTER TABLE ' + QUOTENAME(@schema) + N'.volunteer_in DROP CONSTRAINT ' + QUOTENAME(@name) + N';'
            END;
            EXEC sp_executesql @sql;
            PRINT CONCAT(@schema, N'.volunteer_in: dropped ', LOWER(@kind), N' ', @name, N'.');
            FETCH NEXT FROM dep_cursor INTO @kind, @name;
        END
        CLOSE dep_cursor;
        DEALLOCATE dep_cursor;

        SET @sql = N'ALTER TABLE ' + QUOTENAME(@schema) + N'.volunteer_in DROP COLUMN role;';
        EXEC sp_executesql @sql;
        PRINT CONCAT(@schema, N'.volunteer_in.role dropped.');
    END

    FETCH NEXT FROM schema_cursor INTO @schema;
END

CLOSE schema_cursor;
DEALLOCATE schema_cursor;
GO

-- -----------------------------------------------------------------------------
-- Verify: no role column left; every volunteer has a department 1 membership
-- -----------------------------------------------------------------------------
SELECT s.name AS schema_name,
       CASE WHEN c.column_id IS NULL THEN 'dropped' ELSE 'STILL THERE' END AS volunteer_in_role
FROM sys.schemas s
LEFT JOIN sys.columns c ON c.object_id = OBJECT_ID(QUOTENAME(s.name) + N'.volunteer_in') AND c.name = N'role'
WHERE s.name IN (N'dbo', N'demo');

SELECT 'dbo' AS schema_name,
       (SELECT COUNT(*) FROM dbo.volunteer_in) AS volunteers,
       (SELECT COUNT(*) FROM dbo.department_members WHERE department_id = 1) AS dept1_members,
       (SELECT COUNT(*) FROM dbo.department_members WHERE department_id = 1 AND role IS NOT NULL) AS with_role
UNION ALL
SELECT 'demo',
       (SELECT COUNT(*) FROM demo.volunteer_in),
       (SELECT COUNT(*) FROM demo.department_members WHERE department_id = 1),
       (SELECT COUNT(*) FROM demo.department_members WHERE department_id = 1 AND role IS NOT NULL);
GO

PRINT '=== department_switch_role.sql complete ===';
GO
