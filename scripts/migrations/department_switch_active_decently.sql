-- =============================================================================
-- department_switch_active_decently.sql   (multi-department phase 2b-3b)
-- =============================================================================
-- Moves the per-department status fields to department_members for good, in
-- both the dbo and demo schemas:
--     active_current_year
--     decently_import, decently_imported_time
--     decently_exported, decently_exported_time
--     disapproved_year, disapproved_by, disapproved_at
--
--   1. Re-copies them from volunteer_in into each volunteer's department 1
--      membership (catches every change made since department_membership.sql).
--   2. Drops them from volunteer_in, plus anything attached to them
--      (defaults, check constraints, foreign keys, indexes, statistics).
--
-- Run together with the phase 2b-3b code (lib/dbSync.js, scripts/seedDemo.js).
-- Dropping the columns makes any missed reference fail loudly ("Invalid
-- column name ...") instead of reading a stale copy.
--
-- LOCAL ONLY (albanyregional3_local). Never run against albanyregional3.
-- Safe to re-run: once the columns are gone every step reports "skipped".
-- =============================================================================
SET NOCOUNT ON;

DECLARE @schemas TABLE (name SYSNAME PRIMARY KEY);
INSERT INTO @schemas (name) VALUES (N'dbo'), (N'demo');

-- COLLATE DATABASE_DEFAULT: in a partially contained database the system
-- catalog (sys.columns.name) uses the fixed catalog collation
-- Latin1_General_100_CI_AS_KS_WS_SC, while this table variable gets the
-- database's own collation; the joins below collate explicitly.
DECLARE @columns TABLE (name SYSNAME COLLATE DATABASE_DEFAULT PRIMARY KEY);
INSERT INTO @columns (name) VALUES
    (N'active_current_year'),
    (N'decently_import'), (N'decently_imported_time'),
    (N'decently_exported'), (N'decently_exported_time'),
    (N'disapproved_year'), (N'disapproved_by'), (N'disapproved_at');

DECLARE @schema SYSNAME, @obj INT, @col INT, @colName SYSNAME, @sql NVARCHAR(MAX),
        @n INT, @name SYSNAME, @kind NVARCHAR(20), @present INT;

DECLARE schema_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT name FROM @schemas ORDER BY name;
OPEN schema_cursor;
FETCH NEXT FROM schema_cursor INTO @schema;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @obj = OBJECT_ID(QUOTENAME(@schema) + N'.volunteer_in', 'U');
    SET @present = (SELECT COUNT(*) FROM sys.columns c JOIN @columns k ON k.name = c.name COLLATE DATABASE_DEFAULT
                    WHERE c.object_id = @obj);

    IF @present = 0
        PRINT CONCAT(@schema, N'.volunteer_in status columns already dropped — skipped.');
    ELSE IF @present < 8
        PRINT CONCAT(@schema, N'.volunteer_in: only ', @present, N' of 8 status columns left — re-copy skipped, dropping the rest.');
    ELSE
    BEGIN
        -- 1. Re-copy into the department 1 membership
        SET @sql = N'UPDATE m SET
                         m.active_current_year    = ISNULL(v.active_current_year, 0),
                         m.decently_import        = ISNULL(v.decently_import, 0),
                         m.decently_imported_time = v.decently_imported_time,
                         m.decently_exported      = ISNULL(v.decently_exported, 0),
                         m.decently_exported_time = v.decently_exported_time,
                         m.disapproved_year       = v.disapproved_year,
                         m.disapproved_by         = v.disapproved_by,
                         m.disapproved_at         = v.disapproved_at
                     FROM ' + QUOTENAME(@schema) + N'.department_members m
                     JOIN ' + QUOTENAME(@schema) + N'.volunteer_in v ON v.id = m.volunteer_id
                     WHERE m.department_id = 1
                       AND (   m.active_current_year <> ISNULL(v.active_current_year, 0)
                            OR m.decently_import     <> ISNULL(v.decently_import, 0)
                            OR m.decently_exported   <> ISNULL(v.decently_exported, 0)
                            OR ISNULL(m.decently_imported_time, ''19000101'') <> ISNULL(v.decently_imported_time, ''19000101'')
                            OR ISNULL(m.decently_exported_time, ''19000101'') <> ISNULL(v.decently_exported_time, ''19000101'')
                            OR ISNULL(m.disapproved_year, -1) <> ISNULL(v.disapproved_year, -1)
                            OR ISNULL(m.disapproved_by, N'''') <> ISNULL(v.disapproved_by, N'''')
                            OR ISNULL(m.disapproved_at, ''19000101'') <> ISNULL(v.disapproved_at, ''19000101''));
                     SET @n = @@ROWCOUNT;';
        EXEC sp_executesql @sql, N'@n INT OUTPUT', @n = @n OUTPUT;
        PRINT CONCAT(@schema, N': re-copied status fields for ', @n, N' department 1 membership(s).');
    END

    -- 2. Drop each remaining column and everything attached to it
    DECLARE col_cursor CURSOR LOCAL FAST_FORWARD FOR
        SELECT c.name, c.column_id FROM sys.columns c JOIN @columns k ON k.name = c.name COLLATE DATABASE_DEFAULT
        WHERE c.object_id = @obj ORDER BY c.name;
    OPEN col_cursor;
    FETCH NEXT FROM col_cursor INTO @colName, @col;

    WHILE @@FETCH_STATUS = 0
    BEGIN
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
            SELECT DISTINCT N'INDEX', i.name FROM sys.indexes i
             JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
             WHERE i.object_id = @obj AND ic.column_id = @col AND i.is_primary_key = 0
            UNION ALL
            SELECT DISTINCT N'STATISTICS', st.name FROM sys.stats st
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

        SET @sql = N'ALTER TABLE ' + QUOTENAME(@schema) + N'.volunteer_in DROP COLUMN ' + QUOTENAME(@colName) + N';';
        EXEC sp_executesql @sql;
        PRINT CONCAT(@schema, N'.volunteer_in.', @colName, N' dropped.');

        FETCH NEXT FROM col_cursor INTO @colName, @col;
    END
    CLOSE col_cursor;
    DEALLOCATE col_cursor;

    FETCH NEXT FROM schema_cursor INTO @schema;
END

CLOSE schema_cursor;
DEALLOCATE schema_cursor;
GO

-- -----------------------------------------------------------------------------
-- Verify: no status columns left on volunteer_in; membership counts
-- -----------------------------------------------------------------------------
SELECT SCHEMA_NAME(t.schema_id) AS schema_name, COUNT(c.column_id) AS status_columns_left
FROM sys.tables t
LEFT JOIN sys.columns c ON c.object_id = t.object_id
     AND c.name IN (N'active_current_year', N'decently_import', N'decently_imported_time',
                    N'decently_exported', N'decently_exported_time',
                    N'disapproved_year', N'disapproved_by', N'disapproved_at')
WHERE t.name = N'volunteer_in' AND SCHEMA_NAME(t.schema_id) IN (N'dbo', N'demo')
GROUP BY t.schema_id;

SELECT 'dbo' AS schema_name,
       (SELECT COUNT(*) FROM dbo.department_members WHERE department_id = 1) AS dept1_members,
       (SELECT COUNT(*) FROM dbo.department_members WHERE department_id = 1 AND active_current_year = 1) AS active,
       (SELECT COUNT(*) FROM dbo.department_members WHERE department_id = 1 AND decently_import = 1) AS decently_imported,
       (SELECT COUNT(*) FROM dbo.department_members WHERE department_id = 1 AND disapproved_year IS NOT NULL) AS disapproved
UNION ALL
SELECT 'demo',
       (SELECT COUNT(*) FROM demo.department_members WHERE department_id = 1),
       (SELECT COUNT(*) FROM demo.department_members WHERE department_id = 1 AND active_current_year = 1),
       (SELECT COUNT(*) FROM demo.department_members WHERE department_id = 1 AND decently_import = 1),
       (SELECT COUNT(*) FROM demo.department_members WHERE department_id = 1 AND disapproved_year IS NOT NULL);
GO

PRINT '=== department_switch_active_decently.sql complete ===';
GO
