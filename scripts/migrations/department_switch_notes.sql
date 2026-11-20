-- =============================================================================
-- department_switch_notes.sql   (multi-department phase 2b-3c)
-- =============================================================================
-- Moves the intake note to volunteer_notes for good, in both the dbo and demo
-- schemas:
--     notes, note_dismissed, note_dismissed_at, note_dismissed_by
--
--   1. Re-copies them from volunteer_in into department 1's volunteer_notes
--      (updates existing rows; adds rows for notes written since
--      volunteer_notes.sql).
--   2. Drops them from volunteer_in, plus anything attached to them.
--
-- Run together with the phase 2b-3c code (lib/dbSync.js). Dropping the
-- columns makes any missed reference fail loudly instead of reading a stale
-- copy.
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
    (N'notes'), (N'note_dismissed'), (N'note_dismissed_at'), (N'note_dismissed_by');

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
        PRINT CONCAT(@schema, N'.volunteer_in note columns already dropped — skipped.');
    ELSE IF @present < 4
        PRINT CONCAT(@schema, N'.volunteer_in: only ', @present, N' of 4 note columns left — re-copy skipped, dropping the rest.');
    ELSE
    BEGIN
        -- 1. Re-copy into department 1's volunteer_notes
        SET @sql = N'UPDATE n SET
                         n.note              = v.notes,
                         n.note_dismissed    = ISNULL(v.note_dismissed, 0),
                         n.note_dismissed_at = v.note_dismissed_at,
                         n.note_dismissed_by = v.note_dismissed_by,
                         n.updated_at        = SYSUTCDATETIME()
                     FROM ' + QUOTENAME(@schema) + N'.volunteer_notes n
                     JOIN ' + QUOTENAME(@schema) + N'.volunteer_in v ON v.id = n.volunteer_id
                     WHERE n.department_id = 1
                       AND (   ISNULL(n.note, N'''') <> ISNULL(CAST(v.notes AS NVARCHAR(2048)), N'''')
                            OR n.note_dismissed <> ISNULL(v.note_dismissed, 0)
                            OR ISNULL(n.note_dismissed_at, ''19000101'') <> ISNULL(v.note_dismissed_at, ''19000101'')
                            OR ISNULL(n.note_dismissed_by, -1) <> ISNULL(v.note_dismissed_by, -1));
                     SET @n = @@ROWCOUNT;';
        EXEC sp_executesql @sql, N'@n INT OUTPUT', @n = @n OUTPUT;
        PRINT CONCAT(@schema, N': re-copied ', @n, N' changed note(s) into department 1.');

        SET @sql = N'INSERT INTO ' + QUOTENAME(@schema) + N'.volunteer_notes
                         (volunteer_id, department_id, note, note_dismissed, note_dismissed_at, note_dismissed_by)
                     SELECT v.id, 1, v.notes, ISNULL(v.note_dismissed, 0), v.note_dismissed_at, v.note_dismissed_by
                     FROM ' + QUOTENAME(@schema) + N'.volunteer_in v
                     WHERE (NULLIF(LTRIM(RTRIM(v.notes)), '''') IS NOT NULL OR v.note_dismissed = 1)
                       AND NOT EXISTS (SELECT 1 FROM ' + QUOTENAME(@schema) + N'.volunteer_notes n
                                       WHERE n.volunteer_id = v.id AND n.department_id = 1);
                     SET @n = @@ROWCOUNT;';
        EXEC sp_executesql @sql, N'@n INT OUTPUT', @n = @n OUTPUT;
        PRINT CONCAT(@schema, N': added ', @n, N' note(s) written since volunteer_notes.sql.');
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
-- Verify: no note columns left on volunteer_in; note counts
-- -----------------------------------------------------------------------------
SELECT SCHEMA_NAME(t.schema_id) AS schema_name, COUNT(c.column_id) AS note_columns_left
FROM sys.tables t
LEFT JOIN sys.columns c ON c.object_id = t.object_id
     AND c.name IN (N'notes', N'note_dismissed', N'note_dismissed_at', N'note_dismissed_by')
WHERE t.name = N'volunteer_in' AND SCHEMA_NAME(t.schema_id) IN (N'dbo', N'demo')
GROUP BY t.schema_id;

SELECT 'dbo' AS schema_name,
       (SELECT COUNT(*) FROM dbo.volunteer_notes WHERE department_id = 1) AS dept1_notes,
       (SELECT COUNT(*) FROM dbo.volunteer_notes WHERE department_id = 1 AND note_dismissed = 1) AS dismissed
UNION ALL
SELECT 'demo',
       (SELECT COUNT(*) FROM demo.volunteer_notes WHERE department_id = 1),
       (SELECT COUNT(*) FROM demo.volunteer_notes WHERE department_id = 1 AND note_dismissed = 1);
GO

PRINT '=== department_switch_notes.sql complete ===';
GO
