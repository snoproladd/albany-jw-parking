-- =============================================================================
-- lessons_learned_department.sql   (multi-department phase 2b-3e)
-- =============================================================================
-- Gives Lessons Learned an owning department, in both the dbo and demo
-- schemas:
--   1. Renames lessons_learned.department_id → about_department_id. That
--      column means "the department this lesson is about" and points at a
--      system_variable_lists entry; its foreign key moves with it.
--   2. Adds the real department_id (the owning department), the same way
--      department_scope_columns.sql did for 40 other tables: session-context
--      default falling back to 1, backfill to 1, FK to departments, index.
--   3. lessons_learned_reports: the key becomes (year, department_id) so each
--      department has its own published report per year.
--
-- Run together with the phase 2b-3e code (lib/dbSync.js). The API keeps the
-- field names it used before (department_id / departmentId = "about").
--
-- LOCAL ONLY (albanyregional3_local). Never run against albanyregional3.
-- Safe to re-run: every step checks the current state first.
-- =============================================================================
SET NOCOUNT ON;

DECLARE @schemas TABLE (name SYSNAME PRIMARY KEY);
INSERT INTO @schemas (name) VALUES (N'dbo'), (N'demo');

DECLARE @schema SYSNAME, @obj INT, @sql NVARCHAR(MAX), @n INT, @name SYSNAME,
        @hasAbout BIT, @hasDept BIT, @deptIsAbout BIT, @unsure BIT;

DECLARE schema_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT name FROM @schemas ORDER BY name;
OPEN schema_cursor;
FETCH NEXT FROM schema_cursor INTO @schema;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @obj = OBJECT_ID(QUOTENAME(@schema) + N'.lessons_learned', 'U');

    IF @obj IS NULL
        PRINT CONCAT(@schema, N'.lessons_learned: table missing — skipped.');
    ELSE
    BEGIN
        SET @hasAbout = IIF(EXISTS (SELECT 1 FROM sys.columns WHERE object_id = @obj AND name = N'about_department_id'), 1, 0);
        SET @hasDept  = IIF(EXISTS (SELECT 1 FROM sys.columns WHERE object_id = @obj AND name = N'department_id'), 1, 0);
        SET @deptIsAbout = IIF(EXISTS (
            SELECT 1
            FROM sys.foreign_key_columns fkc
            JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
            WHERE fkc.parent_object_id = @obj
              AND c.name = N'department_id'
              AND fkc.referenced_object_id = OBJECT_ID(QUOTENAME(@schema) + N'.system_variable_lists')), 1, 0);

        -- 1. Rename the "about" column
        IF @hasAbout = 1
            PRINT CONCAT(@schema, N'.lessons_learned.about_department_id already exists — rename skipped.');
        ELSE IF @hasDept = 1 AND @deptIsAbout = 1
        BEGIN
            SET @name = @schema + N'.lessons_learned.department_id';
            EXEC sp_rename @name, N'about_department_id', N'COLUMN';
            SET @hasDept = 0;
            PRINT CONCAT(@schema, N'.lessons_learned.department_id renamed to about_department_id.');
        END
        ELSE IF @hasDept = 1
            PRINT CONCAT(@schema, N'.lessons_learned.department_id does not point at system_variable_lists — left alone, check by hand.');

        -- Unexpected shape (department_id exists but is not the "about"
        -- column, and nothing was renamed): touch nothing else on this table.
        SET @unsure = IIF(@hasAbout = 0 AND @hasDept = 1, 1, 0);

        -- 2. Owning department
        IF @unsure = 1
            PRINT CONCAT(@schema, N'.lessons_learned: owning department skipped.');
        ELSE IF @hasDept = 0
        BEGIN
            SET @sql = N'ALTER TABLE ' + QUOTENAME(@schema) + N'.lessons_learned ADD department_id INT NULL
                         CONSTRAINT df_lessons_learned_owner_department_id
                         DEFAULT (COALESCE(CAST(SESSION_CONTEXT(N''department_id'') AS INT), 1));';
            EXEC sp_executesql @sql;
            PRINT CONCAT(@schema, N'.lessons_learned: added owning department_id.');
        END

        IF @unsure = 0
        BEGIN
        SET @sql = N'UPDATE ' + QUOTENAME(@schema) + N'.lessons_learned SET department_id = 1 WHERE department_id IS NULL;
                     SET @n = @@ROWCOUNT;';
        EXEC sp_executesql @sql, N'@n INT OUTPUT', @n = @n OUTPUT;
        IF @n > 0 PRINT CONCAT(@schema, N'.lessons_learned: backfilled ', @n, N' lesson(s) to department 1.');

        IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id = @obj AND name = N'FK_lessons_learned_owner_department')
        BEGIN
            SET @sql = N'ALTER TABLE ' + QUOTENAME(@schema) + N'.lessons_learned
                         ADD CONSTRAINT FK_lessons_learned_owner_department
                         FOREIGN KEY (department_id) REFERENCES ' + QUOTENAME(@schema) + N'.departments (id);';
            EXEC sp_executesql @sql;
        END

        SET @name = N'IX_' + @schema + N'_lessons_learned_owner_department';
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = @obj AND name = @name)
        BEGIN
            SET @sql = N'CREATE INDEX ' + QUOTENAME(@name) + N' ON ' + QUOTENAME(@schema) + N'.lessons_learned (department_id);';
            EXEC sp_executesql @sql;
        END
        END
    END

    -- 3. lessons_learned_reports: key (year, department_id)
    SET @obj = OBJECT_ID(QUOTENAME(@schema) + N'.lessons_learned_reports', 'U');
    IF @obj IS NULL
        PRINT CONCAT(@schema, N'.lessons_learned_reports: table missing — skipped.');
    ELSE IF (SELECT COUNT(*) FROM sys.index_columns ic
             JOIN sys.indexes i ON i.object_id = ic.object_id AND i.index_id = ic.index_id
             WHERE i.object_id = @obj AND i.is_primary_key = 1) = 2
        PRINT CONCAT(@schema, N'.lessons_learned_reports key already includes department_id — skipped.');
    ELSE
    BEGIN
        SET @sql = N'UPDATE ' + QUOTENAME(@schema) + N'.lessons_learned_reports SET department_id = 1 WHERE department_id IS NULL;';
        EXEC sp_executesql @sql;

        -- ALTER COLUMN is refused while a default, foreign key or index is
        -- attached to department_id: drop them, change the key, add them back.
        DECLARE dep_cursor CURSOR LOCAL FAST_FORWARD FOR
            SELECT N'CONSTRAINT', dc.name FROM sys.default_constraints dc
             JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
             WHERE dc.parent_object_id = @obj AND c.name = N'department_id'
            UNION ALL
            SELECT N'CONSTRAINT', fk.name FROM sys.foreign_keys fk
             JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
             JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
             WHERE fkc.parent_object_id = @obj AND c.name = N'department_id'
            UNION ALL
            SELECT DISTINCT N'INDEX', i.name FROM sys.indexes i
             JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
             JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
             WHERE i.object_id = @obj AND c.name = N'department_id' AND i.is_primary_key = 0
            UNION ALL
            SELECT N'CONSTRAINT', i.name FROM sys.indexes i
             WHERE i.object_id = @obj AND i.is_primary_key = 1;

        DECLARE @kind NVARCHAR(20);
        OPEN dep_cursor;
        FETCH NEXT FROM dep_cursor INTO @kind, @name;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            SET @sql = CASE @kind
                WHEN N'INDEX' THEN N'DROP INDEX ' + QUOTENAME(@name) + N' ON ' + QUOTENAME(@schema) + N'.lessons_learned_reports;'
                ELSE N'ALTER TABLE ' + QUOTENAME(@schema) + N'.lessons_learned_reports DROP CONSTRAINT ' + QUOTENAME(@name) + N';'
            END;
            EXEC sp_executesql @sql;
            FETCH NEXT FROM dep_cursor INTO @kind, @name;
        END
        CLOSE dep_cursor;
        DEALLOCATE dep_cursor;

        -- NOT NULL first, in its own batch: SQL Server checks the whole
        -- batch before running it, so a primary key in the same batch is
        -- refused while the column is still nullable (Msg 8111; found in
        -- the 2026-11-25 cutover rehearsal on a production copy). Skipped
        -- when the column is already NOT NULL: once row-level security is
        -- on, the policy depends on the column and ALTER COLUMN is refused
        -- (Msg 5074), which matters only when repairing a database that
        -- was migrated earlier.
        IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = @obj AND name = N'department_id' AND is_nullable = 1)
        BEGIN
            SET @sql = N'ALTER TABLE ' + QUOTENAME(@schema) + N'.lessons_learned_reports ALTER COLUMN department_id INT NOT NULL;';
            EXEC sp_executesql @sql;
        END

        SET @sql = N'ALTER TABLE ' + QUOTENAME(@schema) + N'.lessons_learned_reports
                         ADD CONSTRAINT PK_lessons_learned_reports PRIMARY KEY CLUSTERED (year, department_id);
                     ALTER TABLE ' + QUOTENAME(@schema) + N'.lessons_learned_reports
                         ADD CONSTRAINT df_lessons_learned_reports_department_id
                         DEFAULT (COALESCE(CAST(SESSION_CONTEXT(N''department_id'') AS INT), 1)) FOR department_id;
                     ALTER TABLE ' + QUOTENAME(@schema) + N'.lessons_learned_reports
                         ADD CONSTRAINT FK_lessons_learned_reports_department
                         FOREIGN KEY (department_id) REFERENCES ' + QUOTENAME(@schema) + N'.departments (id);';
        EXEC sp_executesql @sql;
        PRINT CONCAT(@schema, N'.lessons_learned_reports key is now (year, department_id).');
    END

    FETCH NEXT FROM schema_cursor INTO @schema;
END

CLOSE schema_cursor;
DEALLOCATE schema_cursor;
GO

-- -----------------------------------------------------------------------------
-- Verify
-- -----------------------------------------------------------------------------
SELECT SCHEMA_NAME(t.schema_id) AS schema_name,
       MAX(CASE WHEN c.name = N'about_department_id' THEN 'yes' END) AS has_about,
       MAX(CASE WHEN c.name = N'department_id' THEN 'yes' END) AS has_owner,
       (SELECT COUNT(*) FROM sys.index_columns ic JOIN sys.indexes i ON i.object_id = ic.object_id AND i.index_id = ic.index_id
         WHERE i.object_id = OBJECT_ID(QUOTENAME(SCHEMA_NAME(t.schema_id)) + N'.lessons_learned_reports') AND i.is_primary_key = 1) AS report_key_columns
FROM sys.tables t
JOIN sys.columns c ON c.object_id = t.object_id
WHERE t.name = N'lessons_learned' AND SCHEMA_NAME(t.schema_id) IN (N'dbo', N'demo')
GROUP BY t.schema_id;

SELECT 'dbo' AS schema_name,
       (SELECT COUNT(*) FROM dbo.lessons_learned) AS lessons,
       (SELECT COUNT(*) FROM dbo.lessons_learned WHERE department_id = 1) AS dept1_lessons,
       (SELECT COUNT(*) FROM dbo.lessons_learned WHERE about_department_id IS NOT NULL) AS with_about
UNION ALL
SELECT 'demo',
       (SELECT COUNT(*) FROM demo.lessons_learned),
       (SELECT COUNT(*) FROM demo.lessons_learned WHERE department_id = 1),
       (SELECT COUNT(*) FROM demo.lessons_learned WHERE about_department_id IS NOT NULL);
GO

PRINT '=== lessons_learned_department.sql complete ===';
GO
