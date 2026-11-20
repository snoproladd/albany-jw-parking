-- =============================================================================
-- department_rls_enable.sql   (multi-department phase 2c-3)
-- =============================================================================
-- Switches row-level security ON for both schemas. The policies, predicate
-- functions and Volunteer Services department come from department_rls.sql
-- (run that first; it leaves the policies OFF).
--
-- Once this has run, every query needs session context: the app sets it on
-- every batch (lib/sql.js). Admin sessions (sqlcmd, SSMS) see no department
-- rows until they run:
--     EXEC sp_set_session_context N'scope', N'system';
--
-- Quick rollback (per schema):
--     ALTER SECURITY POLICY dbo.rls_department  WITH (STATE = OFF);
--     ALTER SECURITY POLICY demo.rls_department WITH (STATE = OFF);
--
-- In production this is the last step of the multi-department cutover.
-- LOCAL ONLY (albanyregional3_local) until that branch ships. Safe to re-run.
-- =============================================================================
SET NOCOUNT ON;
GO

IF OBJECT_ID(N'dbo.rls_department', N'SP') IS NULL
    PRINT 'dbo.rls_department does not exist - run department_rls.sql first.';
ELSE
BEGIN
    ALTER SECURITY POLICY dbo.rls_department WITH (STATE = ON);
    PRINT 'dbo.rls_department is ON.';
END
GO

IF OBJECT_ID(N'demo.rls_department', N'SP') IS NULL
    PRINT 'demo.rls_department does not exist - run department_rls.sql first.';
ELSE
BEGIN
    ALTER SECURITY POLICY demo.rls_department WITH (STATE = ON);
    PRINT 'demo.rls_department is ON.';
END
GO

-- Verify
SELECT SCHEMA_NAME(schema_id) AS schema_name, name AS policy_name, is_enabled
FROM sys.security_policies
ORDER BY schema_name;
GO

PRINT '=== department_rls_enable.sql complete ===';
GO
