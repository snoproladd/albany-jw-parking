-- =============================================================================
-- department_default_strict.sql   (multi-department phase 2c-4)
-- =============================================================================
-- Every department_id default was created as
--     COALESCE(CAST(SESSION_CONTEXT(N'department_id') AS INT), 1)
-- so a row inserted without a department quietly landed in department 1.
-- This recreates each such default (both schemas) as
--     CAST(SESSION_CONTEXT(N'department_id') AS INT)
-- The columns are NOT NULL, so an insert without a department now fails.
--
-- The app always sets a department (lib/sql.js + middleware/resolveDepartment.js;
-- signed-out requests get department 1). Admin sessions (sqlcmd, SSMS) that
-- insert rows must set it first:
--     EXEC sp_set_session_context N'department_id', 1;
--
-- Only defaults whose definition still contains the fallback are touched, so
-- this is safe to re-run. Constraint names are kept.
-- LOCAL ONLY (albanyregional3_local) until the multi-department branch ships.
-- =============================================================================
SET NOCOUNT ON;
GO

DECLARE @schema SYSNAME, @table SYSNAME, @constraint SYSNAME, @sql NVARCHAR(MAX), @done INT = 0;

DECLARE df_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT SCHEMA_NAME(t.schema_id), t.name, dc.name
    FROM sys.default_constraints dc
    JOIN sys.tables  t ON t.object_id = dc.parent_object_id
    JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
    WHERE c.name = N'department_id'
      AND SCHEMA_NAME(t.schema_id) IN (N'dbo', N'demo')
      AND dc.definition LIKE N'%SESSION_CONTEXT%'
      AND (dc.definition LIKE N'%,(1))%' OR dc.definition LIKE N'%, (1))%' OR dc.definition LIKE N'%,1)%' OR dc.definition LIKE N'%, 1)%')
    ORDER BY 1, 2;

OPEN df_cursor;
FETCH NEXT FROM df_cursor INTO @schema, @table, @constraint;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @sql = N'ALTER TABLE ' + QUOTENAME(@schema) + N'.' + QUOTENAME(@table)
             + N' DROP CONSTRAINT ' + QUOTENAME(@constraint) + N'; '
             + N'ALTER TABLE ' + QUOTENAME(@schema) + N'.' + QUOTENAME(@table)
             + N' ADD CONSTRAINT ' + QUOTENAME(@constraint)
             + N' DEFAULT (CAST(SESSION_CONTEXT(N''department_id'') AS INT)) FOR department_id;';
    EXEC sp_executesql @sql;
    SET @done += 1;
    FETCH NEXT FROM df_cursor INTO @schema, @table, @constraint;
END
CLOSE df_cursor;
DEALLOCATE df_cursor;

PRINT CONCAT('Recreated ', @done, ' department_id defaults without the fallback.');
GO

-- Verify: every department_id default and its definition (expect no ", 1")
SELECT SCHEMA_NAME(t.schema_id) AS schema_name, t.name AS table_name, dc.name AS constraint_name, dc.definition
FROM sys.default_constraints dc
JOIN sys.tables  t ON t.object_id = dc.parent_object_id
JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE c.name = N'department_id'
ORDER BY 1, 2;

SELECT COUNT(*) AS defaults_still_with_fallback
FROM sys.default_constraints dc
JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE c.name = N'department_id'
  AND dc.definition LIKE N'%SESSION_CONTEXT%'
  AND (dc.definition LIKE N'%,(1))%' OR dc.definition LIKE N'%, (1))%' OR dc.definition LIKE N'%,1)%' OR dc.definition LIKE N'%, 1)%');
GO

PRINT '=== department_default_strict.sql complete ===';
GO
