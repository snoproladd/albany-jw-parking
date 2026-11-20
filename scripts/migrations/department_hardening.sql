-- =============================================================================
-- department_hardening.sql   (multi-department phase 2, hardening part 1)
-- =============================================================================
-- In both the dbo and demo schemas:
--   A. Drops the placeholders that conflict with the design (people and
--      Timelines are shared): volunteer_in.department_id,
--      convention_days.department_id, sessions.department_id.
--   (demo.event_types and demo.event_view_sensitivity stay for now:
--    scripts/seedDemo.js still seeds them. They go when the seed is reworked.)
--   C. Makes every remaining department_id column NOT NULL. The default keeps
--      its fallback to department 1 for now — it is removed at the end of
--      phase 2c, once every insert path sets a department.
--   D. Widens the volunteer_note_reads unique key from (volunteer_id, read_by)
--      to (volunteer_id, read_by, department_id).
--
-- Run together with the hardening code change (lib/dbSync.js: the year
-- rollover no longer copies sessions.department_id).
--
-- LOCAL ONLY (albanyregional3_local). Never run against albanyregional3.
-- Safe to re-run: every step checks the current state first.
-- =============================================================================
SET NOCOUNT ON;

DECLARE @schemas TABLE (name SYSNAME COLLATE DATABASE_DEFAULT PRIMARY KEY);
INSERT INTO @schemas (name) VALUES (N'dbo'), (N'demo');

DECLARE @schema SYSNAME, @table SYSNAME, @obj INT, @col INT, @sql NVARCHAR(MAX),
        @name SYSNAME, @kind NVARCHAR(20), @n INT, @full NVARCHAR(300), @blocked BIT;

DECLARE schema_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT name FROM @schemas ORDER BY name;
OPEN schema_cursor;
FETCH NEXT FROM schema_cursor INTO @schema;

WHILE @@FETCH_STATUS = 0
BEGIN
    -- ── A. Placeholders on shared tables ───────────────────────────────────
    DECLARE @placeholders TABLE (name SYSNAME COLLATE DATABASE_DEFAULT PRIMARY KEY);
    DELETE FROM @placeholders;
    INSERT INTO @placeholders (name) VALUES (N'volunteer_in'), (N'convention_days'), (N'sessions');

    DECLARE ph_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT name FROM @placeholders ORDER BY name;
    OPEN ph_cursor;
    FETCH NEXT FROM ph_cursor INTO @table;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @full = QUOTENAME(@schema) + N'.' + QUOTENAME(@table);
        SET @obj = OBJECT_ID(@full, 'U');
        SET @col = (SELECT column_id FROM sys.columns WHERE object_id = @obj AND name = N'department_id');

        IF @col IS NULL
            PRINT CONCAT(@schema, N'.', @table, N'.department_id already gone — skipped.');
        ELSE
        BEGIN
            DECLARE dep_cursor CURSOR LOCAL FAST_FORWARD FOR
                SELECT N'CONSTRAINT', dc.name FROM sys.default_constraints dc
                 WHERE dc.parent_object_id = @obj AND dc.parent_column_id = @col
                UNION ALL
                SELECT N'CONSTRAINT', fk.name FROM sys.foreign_keys fk
                 JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
                 WHERE fkc.parent_object_id = @obj AND fkc.parent_column_id = @col
                UNION ALL
                SELECT DISTINCT N'INDEX', i.name FROM sys.indexes i
                 JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
                 WHERE i.object_id = @obj AND ic.column_id = @col AND i.is_primary_key = 0;
            OPEN dep_cursor;
            FETCH NEXT FROM dep_cursor INTO @kind, @name;
            WHILE @@FETCH_STATUS = 0
            BEGIN
                SET @sql = CASE @kind
                    WHEN N'INDEX' THEN N'DROP INDEX ' + QUOTENAME(@name) + N' ON ' + @full + N';'
                    ELSE N'ALTER TABLE ' + @full + N' DROP CONSTRAINT ' + QUOTENAME(@name) + N';'
                END;
                EXEC sp_executesql @sql;
                FETCH NEXT FROM dep_cursor INTO @kind, @name;
            END
            CLOSE dep_cursor;
            DEALLOCATE dep_cursor;

            SET @sql = N'ALTER TABLE ' + @full + N' DROP COLUMN department_id;';
            EXEC sp_executesql @sql;
            PRINT CONCAT(@schema, N'.', @table, N'.department_id dropped (shared table).');
        END
        FETCH NEXT FROM ph_cursor INTO @table;
    END
    CLOSE ph_cursor;
    DEALLOCATE ph_cursor;

    -- ── C. NOT NULL on every remaining department_id ──────────────────────
    DECLARE nn_cursor CURSOR LOCAL FAST_FORWARD FOR
        SELECT t.name, t.object_id, c.column_id
        FROM sys.tables t
        JOIN sys.columns c ON c.object_id = t.object_id AND c.name = N'department_id'
        WHERE t.schema_id = SCHEMA_ID(@schema) AND c.is_nullable = 1
        ORDER BY t.name;
    OPEN nn_cursor;
    FETCH NEXT FROM nn_cursor INTO @table, @obj, @col;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @full = QUOTENAME(@schema) + N'.' + QUOTENAME(@table);

        -- Only handle the simple shape this phase created: a default, a
        -- single-column FK to departments and single-column non-unique
        -- indexes. Anything else on the column is left for a human. The
        -- recreated objects get a _dept suffix so they can never collide
        -- with an older constraint name.
        SET @blocked = IIF(EXISTS (
            SELECT 1 FROM sys.indexes i
            JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
            WHERE i.object_id = @obj AND ic.column_id = @col
              AND (i.is_unique = 1 OR i.is_primary_key = 1
                   OR (SELECT COUNT(*) FROM sys.index_columns x
                       WHERE x.object_id = i.object_id AND x.index_id = i.index_id AND x.is_included_column = 0) > 1)
        ) OR EXISTS (
            SELECT 1 FROM sys.foreign_key_columns fkc
            WHERE fkc.parent_object_id = @obj AND fkc.parent_column_id = @col
              AND fkc.referenced_object_id <> OBJECT_ID(QUOTENAME(@schema) + N'.departments')
        ), 1, 0);

        IF @blocked = 1
            PRINT CONCAT(@schema, N'.', @table, N'.department_id: unusual index or key on the column — left nullable, check by hand.');
        ELSE
        BEGIN
            SET @sql = N'UPDATE ' + @full + N' SET department_id = 1 WHERE department_id IS NULL; SET @n = @@ROWCOUNT;';
            EXEC sp_executesql @sql, N'@n INT OUTPUT', @n = @n OUTPUT;
            IF @n > 0 PRINT CONCAT(@schema, N'.', @table, N': backfilled ', @n, N' NULL department(s) to 1.');

            DECLARE dd_cursor CURSOR LOCAL FAST_FORWARD FOR
                SELECT N'CONSTRAINT', dc.name FROM sys.default_constraints dc
                 WHERE dc.parent_object_id = @obj AND dc.parent_column_id = @col
                UNION ALL
                SELECT N'CONSTRAINT', fk.name FROM sys.foreign_keys fk
                 JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
                 WHERE fkc.parent_object_id = @obj AND fkc.parent_column_id = @col
                UNION ALL
                SELECT DISTINCT N'INDEX', i.name FROM sys.indexes i
                 JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
                 WHERE i.object_id = @obj AND ic.column_id = @col;
            OPEN dd_cursor;
            FETCH NEXT FROM dd_cursor INTO @kind, @name;
            WHILE @@FETCH_STATUS = 0
            BEGIN
                SET @sql = CASE @kind
                    WHEN N'INDEX' THEN N'DROP INDEX ' + QUOTENAME(@name) + N' ON ' + @full + N';'
                    ELSE N'ALTER TABLE ' + @full + N' DROP CONSTRAINT ' + QUOTENAME(@name) + N';'
                END;
                EXEC sp_executesql @sql;
                FETCH NEXT FROM dd_cursor INTO @kind, @name;
            END
            CLOSE dd_cursor;
            DEALLOCATE dd_cursor;

            SET @sql = N'ALTER TABLE ' + @full + N' ALTER COLUMN department_id INT NOT NULL;
                         ALTER TABLE ' + @full + N' ADD CONSTRAINT ' + QUOTENAME(N'df_' + @table + N'_dept')
                       + N' DEFAULT (COALESCE(CAST(SESSION_CONTEXT(N''department_id'') AS INT), 1)) FOR department_id;
                         ALTER TABLE ' + @full + N' ADD CONSTRAINT ' + QUOTENAME(N'FK_' + @table + N'_dept')
                       + N' FOREIGN KEY (department_id) REFERENCES ' + QUOTENAME(@schema) + N'.departments (id);
                         CREATE INDEX ' + QUOTENAME(N'IX_' + @schema + N'_' + @table + N'_dept')
                       + N' ON ' + @full + N' (department_id);';
            EXEC sp_executesql @sql;
            PRINT CONCAT(@schema, N'.', @table, N'.department_id is now NOT NULL.');
        END
        FETCH NEXT FROM nn_cursor INTO @table, @obj, @col;
    END
    CLOSE nn_cursor;
    DEALLOCATE nn_cursor;

    -- ── D. volunteer_note_reads: one read per department ──────────────────
    SET @full = QUOTENAME(@schema) + N'.volunteer_note_reads';
    SET @obj = OBJECT_ID(@full, 'U');
    IF @obj IS NOT NULL
    BEGIN
        IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = @obj AND name = N'UQ_volunteer_note_reads_dept')
            PRINT CONCAT(@schema, N'.volunteer_note_reads key already includes department_id — skipped.');
        ELSE
        BEGIN
            -- Drop the old two-column unique key (constraint or index), whatever its name.
            DECLARE uq_cursor CURSOR LOCAL FAST_FORWARD FOR
                SELECT i.name, i.is_unique_constraint FROM sys.indexes i
                WHERE i.object_id = @obj AND i.is_unique = 1 AND i.is_primary_key = 0
                  AND (SELECT COUNT(*) FROM sys.index_columns ic
                       WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0) = 2
                  AND EXISTS (SELECT 1 FROM sys.index_columns ic JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
                              WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND c.name = N'volunteer_id')
                  AND EXISTS (SELECT 1 FROM sys.index_columns ic JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
                              WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND c.name = N'read_by');
            DECLARE @isConstraint BIT;
            OPEN uq_cursor;
            FETCH NEXT FROM uq_cursor INTO @name, @isConstraint;
            WHILE @@FETCH_STATUS = 0
            BEGIN
                SET @sql = CASE WHEN @isConstraint = 1
                    THEN N'ALTER TABLE ' + @full + N' DROP CONSTRAINT ' + QUOTENAME(@name) + N';'
                    ELSE N'DROP INDEX ' + QUOTENAME(@name) + N' ON ' + @full + N';' END;
                EXEC sp_executesql @sql;
                PRINT CONCAT(@schema, N'.volunteer_note_reads: dropped old key ', @name, N'.');
                FETCH NEXT FROM uq_cursor INTO @name, @isConstraint;
            END
            CLOSE uq_cursor;
            DEALLOCATE uq_cursor;

            SET @sql = N'CREATE UNIQUE INDEX UQ_volunteer_note_reads_dept ON ' + @full
                     + N' (volunteer_id, read_by, department_id);';
            EXEC sp_executesql @sql;
            PRINT CONCAT(@schema, N'.volunteer_note_reads key is now (volunteer_id, read_by, department_id).');
        END
    END

    FETCH NEXT FROM schema_cursor INTO @schema;
END

CLOSE schema_cursor;
DEALLOCATE schema_cursor;
GO

-- -----------------------------------------------------------------------------
-- Verify: expect no rows in the first two results
-- -----------------------------------------------------------------------------
PRINT '=== department_id columns still nullable (expect none) ===';
SELECT SCHEMA_NAME(t.schema_id) AS schema_name, t.name AS table_name
FROM sys.tables t JOIN sys.columns c ON c.object_id = t.object_id AND c.name = N'department_id'
WHERE SCHEMA_NAME(t.schema_id) IN (N'dbo', N'demo') AND c.is_nullable = 1
ORDER BY 1, 2;

PRINT '=== placeholders still present on shared tables (expect none) ===';
SELECT SCHEMA_NAME(t.schema_id) AS schema_name, t.name AS table_name
FROM sys.tables t JOIN sys.columns c ON c.object_id = t.object_id AND c.name = N'department_id'
WHERE SCHEMA_NAME(t.schema_id) IN (N'dbo', N'demo')
  AND t.name IN (N'volunteer_in', N'convention_days', N'sessions')
ORDER BY 1, 2;

PRINT '=== department_id columns per schema (all NOT NULL) ===';
SELECT SCHEMA_NAME(t.schema_id) AS schema_name, COUNT(*) AS department_columns
FROM sys.tables t JOIN sys.columns c ON c.object_id = t.object_id AND c.name = N'department_id'
WHERE SCHEMA_NAME(t.schema_id) IN (N'dbo', N'demo')
GROUP BY t.schema_id;

PRINT '=== volunteer_note_reads keys ===';
SELECT SCHEMA_NAME(t.schema_id) AS schema_name, i.name AS index_name
FROM sys.indexes i JOIN sys.tables t ON t.object_id = i.object_id
WHERE t.name = N'volunteer_note_reads' AND i.is_unique = 1 AND i.is_primary_key = 0;
GO

PRINT '=== department_hardening.sql complete ===';
GO
