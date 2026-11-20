-- =============================================================================
-- department_rls.sql   (multi-department phase 2c-1)
-- =============================================================================
-- Row-level security for department separation, in both the dbo and demo
-- schemas. Policies are created with STATE = OFF: nothing changes until they
-- are switched on (phase 2c-3).
--
--   1. Department 2 "Volunteer Services" (runs Decently, sees all volunteers).
--   2. Predicate functions (schema-bound inline TVFs):
--        fn_rls_department(@department_id)
--            visible when scope is system / convention, or the row's
--            department is the session's department.
--        fn_rls_member(@volunteer_id)
--            visible when scope is all_volunteers / convention / system, or
--            the person is a member of the session's department, or the
--            person has no memberships at all (the unassigned pool).
--   3. Security policy <schema>.rls_department:
--        - every table with a department_id that references departments
--          (except department_members): FILTER + BLOCK (after insert,
--          after update) with fn_rls_department;
--        - department_members: BLOCK only (no filter — a predicate that reads
--          its own table is avoided; membership rows carry no personal data,
--          and volunteer_in below hides the people themselves);
--        - volunteer_in: FILTER only with fn_rls_member (a new person must be
--          insertable before their membership exists).
--
-- No session context = no department rows. Admin sessions (sqlcmd, SSMS) are
-- filtered too once the policy is ON; run first:
--     EXEC sp_set_session_context N'scope', N'system';
--
-- The policy is SCHEMABINDING: department_id columns on bound tables can't be
-- altered while it exists. Re-running this file drops and recreates the
-- policy (and leaves it OFF), so re-run it after adding department_id to a
-- new table.
--
-- Switch on / off (per schema):
--     ALTER SECURITY POLICY dbo.rls_department  WITH (STATE = ON);
--     ALTER SECURITY POLICY demo.rls_department WITH (STATE = ON);
--
-- LOCAL ONLY (albanyregional3_local). Never run against albanyregional3.
-- =============================================================================
SET NOCOUNT ON;
GO

-- -----------------------------------------------------------------------------
-- 1. Department 2: Volunteer Services
-- -----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.departments WHERE slug = N'volunteer-services')
BEGIN
    IF EXISTS (SELECT 1 FROM dbo.departments WHERE id = 2)
        INSERT INTO dbo.departments (name, slug, description)
        VALUES (N'Volunteer Services', N'volunteer-services', N'Runs Decently; sees all volunteers');
    ELSE
    BEGIN
        SET IDENTITY_INSERT dbo.departments ON;
        INSERT INTO dbo.departments (id, name, slug, description)
        VALUES (2, N'Volunteer Services', N'volunteer-services', N'Runs Decently; sees all volunteers');
        SET IDENTITY_INSERT dbo.departments OFF;
    END
    PRINT 'dbo: created department Volunteer Services.';
END
ELSE PRINT 'dbo: Volunteer Services already exists — skipped.';

IF NOT EXISTS (SELECT 1 FROM demo.departments WHERE slug = N'volunteer-services')
BEGIN
    IF EXISTS (SELECT 1 FROM demo.departments WHERE id = 2)
        INSERT INTO demo.departments (name, slug, description)
        VALUES (N'Volunteer Services', N'volunteer-services', N'Runs Decently; sees all volunteers');
    ELSE
    BEGIN
        SET IDENTITY_INSERT demo.departments ON;
        INSERT INTO demo.departments (id, name, slug, description)
        VALUES (2, N'Volunteer Services', N'volunteer-services', N'Runs Decently; sees all volunteers');
        SET IDENTITY_INSERT demo.departments OFF;
    END
    PRINT 'demo: created department Volunteer Services.';
END
ELSE PRINT 'demo: Volunteer Services already exists — skipped.';
GO

-- -----------------------------------------------------------------------------
-- 2. Drop existing policies so the functions can be (re)created
-- -----------------------------------------------------------------------------
DROP SECURITY POLICY IF EXISTS dbo.rls_department;
DROP SECURITY POLICY IF EXISTS demo.rls_department;
GO

-- -----------------------------------------------------------------------------
-- 3. Predicate functions
-- -----------------------------------------------------------------------------
CREATE OR ALTER FUNCTION dbo.fn_rls_department (@department_id INT)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
    SELECT 1 AS allowed
    WHERE CAST(SESSION_CONTEXT(N'scope') AS NVARCHAR(20)) IN (N'system', N'convention')
       OR @department_id = CAST(SESSION_CONTEXT(N'department_id') AS INT);
GO

CREATE OR ALTER FUNCTION dbo.fn_rls_member (@volunteer_id INT)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
    SELECT 1 AS allowed
    WHERE CAST(SESSION_CONTEXT(N'scope') AS NVARCHAR(20)) IN (N'all_volunteers', N'convention', N'system')
       OR EXISTS (SELECT 1 FROM dbo.department_members m
                  WHERE m.volunteer_id = @volunteer_id
                    AND m.department_id = CAST(SESSION_CONTEXT(N'department_id') AS INT))
       OR NOT EXISTS (SELECT 1 FROM dbo.department_members m2
                      WHERE m2.volunteer_id = @volunteer_id);
GO

CREATE OR ALTER FUNCTION demo.fn_rls_department (@department_id INT)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
    SELECT 1 AS allowed
    WHERE CAST(SESSION_CONTEXT(N'scope') AS NVARCHAR(20)) IN (N'system', N'convention')
       OR @department_id = CAST(SESSION_CONTEXT(N'department_id') AS INT);
GO

CREATE OR ALTER FUNCTION demo.fn_rls_member (@volunteer_id INT)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
    SELECT 1 AS allowed
    WHERE CAST(SESSION_CONTEXT(N'scope') AS NVARCHAR(20)) IN (N'all_volunteers', N'convention', N'system')
       OR EXISTS (SELECT 1 FROM demo.department_members m
                  WHERE m.volunteer_id = @volunteer_id
                    AND m.department_id = CAST(SESSION_CONTEXT(N'department_id') AS INT))
       OR NOT EXISTS (SELECT 1 FROM demo.department_members m2
                      WHERE m2.volunteer_id = @volunteer_id);
GO

-- -----------------------------------------------------------------------------
-- 4. Security policies (STATE = OFF)
-- -----------------------------------------------------------------------------
DECLARE @schemas TABLE (name SYSNAME COLLATE DATABASE_DEFAULT PRIMARY KEY);
INSERT INTO @schemas (name) VALUES (N'dbo'), (N'demo');

DECLARE @schema SYSNAME, @sql NVARCHAR(MAX), @clauses NVARCHAR(MAX), @tables INT;

DECLARE schema_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT name FROM @schemas ORDER BY name;
OPEN schema_cursor;
FETCH NEXT FROM schema_cursor INTO @schema;

WHILE @@FETCH_STATUS = 0
BEGIN
    -- Department-owned tables: department_id with a foreign key to departments
    SELECT @clauses = STRING_AGG(CAST(
               N'ADD FILTER PREDICATE ' + QUOTENAME(@schema) + N'.fn_rls_department(department_id) ON ' + QUOTENAME(@schema) + N'.' + QUOTENAME(t.name) + N',' + CHAR(10)
             + N'ADD BLOCK PREDICATE '  + QUOTENAME(@schema) + N'.fn_rls_department(department_id) ON ' + QUOTENAME(@schema) + N'.' + QUOTENAME(t.name) + N' AFTER INSERT,' + CHAR(10)
             + N'ADD BLOCK PREDICATE '  + QUOTENAME(@schema) + N'.fn_rls_department(department_id) ON ' + QUOTENAME(@schema) + N'.' + QUOTENAME(t.name) + N' AFTER UPDATE'
           AS NVARCHAR(MAX)), N',' + CHAR(10)) WITHIN GROUP (ORDER BY t.name),
           @tables = COUNT(*)
    FROM sys.tables t
    JOIN sys.columns c ON c.object_id = t.object_id AND c.name = N'department_id'
    WHERE t.schema_id = SCHEMA_ID(@schema)
      AND t.name <> N'department_members'
      AND EXISTS (SELECT 1 FROM sys.foreign_key_columns fkc
                  WHERE fkc.parent_object_id = t.object_id
                    AND fkc.parent_column_id = c.column_id
                    AND fkc.referenced_object_id = OBJECT_ID(QUOTENAME(@schema) + N'.departments'));

    SET @sql = N'CREATE SECURITY POLICY ' + QUOTENAME(@schema) + N'.rls_department' + CHAR(10)
             + @clauses + N',' + CHAR(10)
             + N'ADD BLOCK PREDICATE ' + QUOTENAME(@schema) + N'.fn_rls_department(department_id) ON ' + QUOTENAME(@schema) + N'.department_members AFTER INSERT,' + CHAR(10)
             + N'ADD BLOCK PREDICATE ' + QUOTENAME(@schema) + N'.fn_rls_department(department_id) ON ' + QUOTENAME(@schema) + N'.department_members AFTER UPDATE,' + CHAR(10)
             + N'ADD FILTER PREDICATE ' + QUOTENAME(@schema) + N'.fn_rls_member(id) ON ' + QUOTENAME(@schema) + N'.volunteer_in' + CHAR(10)
             + N'WITH (STATE = OFF, SCHEMABINDING = ON);';
    EXEC sp_executesql @sql;
    PRINT CONCAT(@schema, N'.rls_department created (OFF): ', @tables, N' department tables + department_members (block) + volunteer_in (filter).');

    FETCH NEXT FROM schema_cursor INTO @schema;
END

CLOSE schema_cursor;
DEALLOCATE schema_cursor;
GO

-- -----------------------------------------------------------------------------
-- Verify
-- -----------------------------------------------------------------------------
SELECT SCHEMA_NAME(p.schema_id) AS schema_name, p.name AS policy_name,
       p.is_enabled,
       SUM(CASE WHEN sp.predicate_type = 0 THEN 1 ELSE 0 END) AS filter_predicates,
       SUM(CASE WHEN sp.predicate_type = 1 THEN 1 ELSE 0 END) AS block_predicates
FROM sys.security_policies p
JOIN sys.security_predicates sp ON sp.object_id = p.object_id
GROUP BY p.schema_id, p.name, p.is_enabled;

SELECT 'dbo' AS schema_name, id, name, slug FROM dbo.departments
UNION ALL
SELECT 'demo', id, name, slug FROM demo.departments
ORDER BY 1, 2;
GO

PRINT '=== department_rls.sql complete ===';
GO
