-- =============================================================================
-- capacity_alert_positions.sql   (multi-department phase 3d-5)
-- =============================================================================
-- Capacity alert recipients by position instead of by role.
--
--   capacity_alert_positions   which positions each capacity alert rule
--                              notifies (one row per rule + position)
--
-- A department row under row-level security (rls_department). Rows go away
-- with their rule or their position (ON DELETE CASCADE).
--
-- Fills itself from each existing rule's recipient_role ("this role and up"):
-- the rule gets every active position in its department whose legacy_role is
-- at or above that tier (an unknown tier counts as OVERSEER). The
-- recipient_role column stays, unused, until phase 3d-8 removes roles.
--
-- Needs positions.sql and scripts/seedPositions.js first.
-- LOCAL ONLY (albanyregional3_local) until the multi-department branch ships.
-- Safe to re-run.
-- =============================================================================
SET NOCOUNT ON;
GO

-- Admin session: see and write every department's rows.
EXEC sp_set_session_context N'scope', N'system';
GO

DECLARE @schema SYSNAME, @sql NVARCHAR(MAX);
DECLARE schema_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT name FROM (VALUES (N'dbo'), (N'demo')) s(name);
OPEN schema_cursor;
FETCH NEXT FROM schema_cursor INTO @schema;
WHILE @@FETCH_STATUS = 0
BEGIN
    -- Table ---------------------------------------------------------------
    IF OBJECT_ID(QUOTENAME(@schema) + N'.capacity_alert_rules', N'U') IS NULL
        PRINT CONCAT(@schema, ': capacity_alert_rules missing - skipped.');
    ELSE IF OBJECT_ID(QUOTENAME(@schema) + N'.positions', N'U') IS NULL
        PRINT CONCAT(@schema, ': positions missing - run positions.sql first.');
    ELSE
    BEGIN
        IF OBJECT_ID(QUOTENAME(@schema) + N'.capacity_alert_positions', N'U') IS NULL
        BEGIN
            SET @sql = N'
CREATE TABLE ' + QUOTENAME(@schema) + N'.capacity_alert_positions (
    rule_id        INT NOT NULL,
    position_id    INT NOT NULL,
    department_id  INT NOT NULL
        CONSTRAINT df_' + @schema + N'_cap_department_id DEFAULT (CAST(SESSION_CONTEXT(N''department_id'') AS INT)),
    CONSTRAINT PK_' + @schema + N'_capacity_alert_positions PRIMARY KEY (rule_id, position_id),
    CONSTRAINT FK_' + @schema + N'_cap_rule FOREIGN KEY (rule_id)
        REFERENCES ' + QUOTENAME(@schema) + N'.capacity_alert_rules (id) ON DELETE CASCADE,
    CONSTRAINT FK_' + @schema + N'_cap_position FOREIGN KEY (position_id)
        REFERENCES ' + QUOTENAME(@schema) + N'.positions (id) ON DELETE CASCADE,
    CONSTRAINT FK_' + @schema + N'_cap_department FOREIGN KEY (department_id)
        REFERENCES ' + QUOTENAME(@schema) + N'.departments (id)
);
CREATE INDEX IX_' + @schema + N'_cap_position ON ' + QUOTENAME(@schema) + N'.capacity_alert_positions (position_id);
CREATE INDEX IX_' + @schema + N'_cap_department ON ' + QUOTENAME(@schema) + N'.capacity_alert_positions (department_id);';
            EXEC sp_executesql @sql;
            PRINT CONCAT(@schema, ': capacity_alert_positions created.');
        END
        ELSE PRINT CONCAT(@schema, ': capacity_alert_positions already exists.');

        -- Row-level security ---------------------------------------------
        IF OBJECT_ID(QUOTENAME(@schema) + N'.rls_department', N'SP') IS NULL
            PRINT CONCAT(@schema, ': rls_department missing - run department_rls.sql first.');
        ELSE IF EXISTS (SELECT 1 FROM sys.security_predicates sp
                        WHERE sp.object_id = OBJECT_ID(QUOTENAME(@schema) + N'.rls_department')
                          AND sp.target_object_id = OBJECT_ID(QUOTENAME(@schema) + N'.capacity_alert_positions'))
            PRINT CONCAT(@schema, ': capacity_alert_positions already in rls_department.');
        ELSE
        BEGIN
            SET @sql = N'ALTER SECURITY POLICY ' + QUOTENAME(@schema) + N'.rls_department' + CHAR(10)
                     + N'ADD FILTER PREDICATE ' + QUOTENAME(@schema) + N'.fn_rls_department(department_id) ON '
                     + QUOTENAME(@schema) + N'.capacity_alert_positions,' + CHAR(10)
                     + N'ADD BLOCK PREDICATE ' + QUOTENAME(@schema) + N'.fn_rls_department(department_id) ON '
                     + QUOTENAME(@schema) + N'.capacity_alert_positions AFTER INSERT,' + CHAR(10)
                     + N'ADD BLOCK PREDICATE ' + QUOTENAME(@schema) + N'.fn_rls_department(department_id) ON '
                     + QUOTENAME(@schema) + N'.capacity_alert_positions AFTER UPDATE;';
            EXEC sp_executesql @sql;
            PRINT CONCAT(@schema, ': capacity_alert_positions added to rls_department.');
        END

        -- Fill from recipient_role (only rules that have no positions yet) -
        SET @sql = N'
DECLARE @tiers TABLE (role NVARCHAR(40) PRIMARY KEY, lvl INT NOT NULL);
INSERT INTO @tiers (role, lvl) VALUES
    (N''REGISTERED'', 2), (N''DESK'', 3), (N''KEYMAN'', 4),
    (N''OVERSEER'', 5), (N''ASSISTANT_ADMIN'', 6), (N''ADMIN'', 7);

INSERT INTO ' + QUOTENAME(@schema) + N'.capacity_alert_positions (rule_id, position_id, department_id)
SELECT r.id, p.id, r.department_id
FROM   ' + QUOTENAME(@schema) + N'.capacity_alert_rules r
CROSS APPLY (SELECT COALESCE((SELECT t.lvl FROM @tiers t WHERE t.role = r.recipient_role), 5) AS floor_lvl) f
JOIN   ' + QUOTENAME(@schema) + N'.positions p
  ON   p.department_id = r.department_id
 AND   p.active = 1
JOIN   @tiers pt ON pt.role = p.legacy_role
WHERE  pt.lvl >= f.floor_lvl
  AND  NOT EXISTS (SELECT 1 FROM ' + QUOTENAME(@schema) + N'.capacity_alert_positions x WHERE x.rule_id = r.id);
PRINT CONCAT(''' + @schema + N': '', @@ROWCOUNT, '' rule-position links added.'');';
        EXEC sp_executesql @sql;
    END
    FETCH NEXT FROM schema_cursor INTO @schema;
END
CLOSE schema_cursor;
DEALLOCATE schema_cursor;
GO

PRINT '=== capacity_alert_positions.sql complete ===';
GO
