-- =============================================================================
-- position_grants.sql   (multi-department phase 3d-7a)
-- =============================================================================
-- Per-person permissions and yearly history. Design: project doc
-- claude/phase3d-7-person-permissions-draft.md.
--
--   positions.tier              the position's own tier (1 Basic .. 4 Admin),
--                               filled from legacy_role / legacy_extra; decides
--                               whether its holders' grants expire at year end
--   member_permissions          individual grants on top of positions
--                               (removed with the membership)
--   permission_grant_log        audit trail: grants, revokes, tier-downs,
--                               position changes, expiries
--   member_position_history     who held which position, per closed year
--   member_permission_history   individual grants in force, per closed year
--   oversight_structure_history who held each oversight-structure node, per
--                               closed year
--
-- Every new table is a department row under row-level security
-- (rls_department). Nothing writes to the history tables or grants yet;
-- phases 3d-7c..e use them.
--
-- Needs positions.sql first. LOCAL ONLY (albanyregional3_local) until the
-- multi-department branch ships. Safe to re-run.
-- =============================================================================
SET NOCOUNT ON;
GO

-- Admin session: see and write every department's rows.
EXEC sp_set_session_context N'scope', N'system';
GO

DECLARE @schema SYSNAME, @sql NVARCHAR(MAX), @t SYSNAME;
DECLARE schema_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT name FROM (VALUES (N'dbo'), (N'demo')) s(name);
OPEN schema_cursor;
FETCH NEXT FROM schema_cursor INTO @schema;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF OBJECT_ID(QUOTENAME(@schema) + N'.positions', N'U') IS NULL
    BEGIN
        PRINT CONCAT(@schema, ': positions missing - run positions.sql first.');
        FETCH NEXT FROM schema_cursor INTO @schema;
        CONTINUE;
    END

    -- positions.tier ------------------------------------------------------
    IF COL_LENGTH(QUOTENAME(@schema) + N'.positions', N'tier') IS NULL
    BEGIN
        SET @sql = N'ALTER TABLE ' + QUOTENAME(@schema) + N'.positions ADD tier TINYINT NOT NULL
            CONSTRAINT df_' + @schema + N'_positions_tier DEFAULT (1)
            CONSTRAINT ck_' + @schema + N'_positions_tier CHECK (tier BETWEEN 1 AND 4);';
        EXEC sp_executesql @sql;
        SET @sql = N'UPDATE ' + QUOTENAME(@schema) + N'.positions
            SET tier = CASE
                WHEN legacy_role IN (N''ADMIN'', N''ASSISTANT_ADMIN'') THEN 4
                WHEN legacy_role = N''OVERSEER'' THEN 3
                WHEN legacy_role IN (N''DESK'', N''KEYMAN'', N''COUNTER'') OR legacy_extra IS NOT NULL THEN 2
                ELSE 1 END;';
        EXEC sp_executesql @sql;
        PRINT CONCAT(@schema, ': positions.tier added and filled.');
    END
    ELSE PRINT CONCAT(@schema, ': positions.tier already exists.');

    -- member_permissions -------------------------------------------------
    IF OBJECT_ID(QUOTENAME(@schema) + N'.member_permissions', N'U') IS NULL
    BEGIN
        SET @sql = N'
CREATE TABLE ' + QUOTENAME(@schema) + N'.member_permissions (
    volunteer_id    INT            NOT NULL,
    department_id   INT            NOT NULL
        CONSTRAINT df_' + @schema + N'_mperm_department_id DEFAULT (CAST(SESSION_CONTEXT(N''department_id'') AS INT)),
    permission_key  NVARCHAR(64)   NOT NULL,
    granted_by_id   INT            NULL,
    granted_by      NVARCHAR(200)  NULL,
    granted_at      DATETIME2(3)   NOT NULL CONSTRAINT df_' + @schema + N'_mperm_granted_at DEFAULT (SYSUTCDATETIME()),
    expires_at      DATETIME2(3)   NULL,
    note            NVARCHAR(400)  NULL,
    CONSTRAINT PK_' + @schema + N'_member_permissions PRIMARY KEY (volunteer_id, department_id, permission_key),
    CONSTRAINT FK_' + @schema + N'_mperm_membership FOREIGN KEY (volunteer_id, department_id)
        REFERENCES ' + QUOTENAME(@schema) + N'.department_members (volunteer_id, department_id) ON DELETE CASCADE,
    CONSTRAINT FK_' + @schema + N'_mperm_department FOREIGN KEY (department_id)
        REFERENCES ' + QUOTENAME(@schema) + N'.departments (id)
);
CREATE INDEX IX_' + @schema + N'_mperm_department ON ' + QUOTENAME(@schema) + N'.member_permissions (department_id, permission_key) INCLUDE (expires_at);';
        EXEC sp_executesql @sql;
        PRINT CONCAT(@schema, ': member_permissions created.');
    END
    ELSE PRINT CONCAT(@schema, ': member_permissions already exists.');

    -- permission_grant_log -----------------------------------------------
    IF OBJECT_ID(QUOTENAME(@schema) + N'.permission_grant_log', N'U') IS NULL
    BEGIN
        SET @sql = N'
CREATE TABLE ' + QUOTENAME(@schema) + N'.permission_grant_log (
    id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_' + @schema + N'_permission_grant_log PRIMARY KEY,
    department_id   INT            NOT NULL
        CONSTRAINT df_' + @schema + N'_pgl_department_id DEFAULT (CAST(SESSION_CONTEXT(N''department_id'') AS INT)),
    volunteer_id    INT            NOT NULL,
    action          NVARCHAR(20)   NOT NULL
        CONSTRAINT ck_' + @schema + N'_pgl_action CHECK (action IN
            (N''grant'', N''revoke'', N''tier-down'', N''expire'', N''position-add'', N''position-remove'', N''year-reset'')),
    permission_key  NVARCHAR(64)   NULL,
    position_id     INT            NULL,
    detail          NVARCHAR(2000) NULL,   -- JSON: what a tier-down moved / kept / removed
    note            NVARCHAR(400)  NULL,
    actor_id        INT            NULL,
    actor_name      NVARCHAR(200)  NULL,
    created_at      DATETIME2(3)   NOT NULL CONSTRAINT df_' + @schema + N'_pgl_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_' + @schema + N'_pgl_department FOREIGN KEY (department_id)
        REFERENCES ' + QUOTENAME(@schema) + N'.departments (id)
);
CREATE INDEX IX_' + @schema + N'_pgl_volunteer ON ' + QUOTENAME(@schema) + N'.permission_grant_log (department_id, volunteer_id, created_at DESC);';
        EXEC sp_executesql @sql;
        PRINT CONCAT(@schema, ': permission_grant_log created.');
    END
    ELSE PRINT CONCAT(@schema, ': permission_grant_log already exists.');

    -- member_position_history --------------------------------------------
    IF OBJECT_ID(QUOTENAME(@schema) + N'.member_position_history', N'U') IS NULL
    BEGIN
        SET @sql = N'
CREATE TABLE ' + QUOTENAME(@schema) + N'.member_position_history (
    year            INT            NOT NULL,
    volunteer_id    INT            NOT NULL,
    department_id   INT            NOT NULL
        CONSTRAINT df_' + @schema + N'_mph_department_id DEFAULT (CAST(SESSION_CONTEXT(N''department_id'') AS INT)),
    position_id     INT            NOT NULL,   -- no FK: history outlives a deleted position
    position_name   NVARCHAR(80)   NOT NULL,
    tier            TINYINT        NOT NULL,
    recorded_at     DATETIME2(3)   NOT NULL CONSTRAINT df_' + @schema + N'_mph_recorded_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_' + @schema + N'_member_position_history PRIMARY KEY (year, volunteer_id, position_id),
    CONSTRAINT FK_' + @schema + N'_mph_department FOREIGN KEY (department_id)
        REFERENCES ' + QUOTENAME(@schema) + N'.departments (id)
);
CREATE INDEX IX_' + @schema + N'_mph_department ON ' + QUOTENAME(@schema) + N'.member_position_history (department_id, year);';
        EXEC sp_executesql @sql;
        PRINT CONCAT(@schema, ': member_position_history created.');
    END
    ELSE PRINT CONCAT(@schema, ': member_position_history already exists.');

    -- member_permission_history ------------------------------------------
    IF OBJECT_ID(QUOTENAME(@schema) + N'.member_permission_history', N'U') IS NULL
    BEGIN
        SET @sql = N'
CREATE TABLE ' + QUOTENAME(@schema) + N'.member_permission_history (
    year            INT            NOT NULL,
    volunteer_id    INT            NOT NULL,
    department_id   INT            NOT NULL
        CONSTRAINT df_' + @schema + N'_mprh_department_id DEFAULT (CAST(SESSION_CONTEXT(N''department_id'') AS INT)),
    permission_key  NVARCHAR(64)   NOT NULL,
    note            NVARCHAR(400)  NULL,
    recorded_at     DATETIME2(3)   NOT NULL CONSTRAINT df_' + @schema + N'_mprh_recorded_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_' + @schema + N'_member_permission_history PRIMARY KEY (year, volunteer_id, department_id, permission_key),
    CONSTRAINT FK_' + @schema + N'_mprh_department FOREIGN KEY (department_id)
        REFERENCES ' + QUOTENAME(@schema) + N'.departments (id)
);';
        EXEC sp_executesql @sql;
        PRINT CONCAT(@schema, ': member_permission_history created.');
    END
    ELSE PRINT CONCAT(@schema, ': member_permission_history already exists.');

    -- oversight_structure_history ----------------------------------------
    IF OBJECT_ID(QUOTENAME(@schema) + N'.oversight_structure', N'U') IS NULL
        PRINT CONCAT(@schema, ': oversight_structure missing - oversight_structure_history skipped.');
    ELSE IF OBJECT_ID(QUOTENAME(@schema) + N'.oversight_structure_history', N'U') IS NULL
    BEGIN
        SET @sql = N'
CREATE TABLE ' + QUOTENAME(@schema) + N'.oversight_structure_history (
    year            INT            NOT NULL,
    node_id         INT            NOT NULL,   -- oversight_structure.id (no FK: nodes can be deleted)
    department_id   INT            NOT NULL
        CONSTRAINT df_' + @schema + N'_osh_department_id DEFAULT (CAST(SESSION_CONTEXT(N''department_id'') AS INT)),
    role_title      NVARCHAR(200)  NULL,
    volunteer_id    INT            NULL,
    recorded_at     DATETIME2(3)   NOT NULL CONSTRAINT df_' + @schema + N'_osh_recorded_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_' + @schema + N'_oversight_structure_history PRIMARY KEY (year, node_id),
    CONSTRAINT FK_' + @schema + N'_osh_department FOREIGN KEY (department_id)
        REFERENCES ' + QUOTENAME(@schema) + N'.departments (id)
);';
        EXEC sp_executesql @sql;
        PRINT CONCAT(@schema, ': oversight_structure_history created.');
    END
    ELSE PRINT CONCAT(@schema, ': oversight_structure_history already exists.');

    -- Row-level security on every new table ------------------------------
    IF OBJECT_ID(QUOTENAME(@schema) + N'.rls_department', N'SP') IS NULL
        PRINT CONCAT(@schema, ': rls_department missing - run department_rls.sql first.');
    ELSE
    BEGIN
        DECLARE rls_cursor CURSOR LOCAL FAST_FORWARD FOR
            SELECT name FROM (VALUES (N'member_permissions'), (N'permission_grant_log'),
                                     (N'member_position_history'), (N'member_permission_history'),
                                     (N'oversight_structure_history')) x(name);
        OPEN rls_cursor;
        FETCH NEXT FROM rls_cursor INTO @t;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            IF OBJECT_ID(QUOTENAME(@schema) + N'.' + QUOTENAME(@t), N'U') IS NULL
                PRINT CONCAT(@schema, ': ', @t, ' missing - not added to rls_department.');
            ELSE IF EXISTS (SELECT 1 FROM sys.security_predicates sp
                            WHERE sp.object_id = OBJECT_ID(QUOTENAME(@schema) + N'.rls_department')
                              AND sp.target_object_id = OBJECT_ID(QUOTENAME(@schema) + N'.' + QUOTENAME(@t)))
                PRINT CONCAT(@schema, ': ', @t, ' already in rls_department.');
            ELSE
            BEGIN
                SET @sql = N'ALTER SECURITY POLICY ' + QUOTENAME(@schema) + N'.rls_department' + CHAR(10)
                         + N'ADD FILTER PREDICATE ' + QUOTENAME(@schema) + N'.fn_rls_department(department_id) ON '
                         + QUOTENAME(@schema) + N'.' + QUOTENAME(@t) + N',' + CHAR(10)
                         + N'ADD BLOCK PREDICATE ' + QUOTENAME(@schema) + N'.fn_rls_department(department_id) ON '
                         + QUOTENAME(@schema) + N'.' + QUOTENAME(@t) + N' AFTER INSERT,' + CHAR(10)
                         + N'ADD BLOCK PREDICATE ' + QUOTENAME(@schema) + N'.fn_rls_department(department_id) ON '
                         + QUOTENAME(@schema) + N'.' + QUOTENAME(@t) + N' AFTER UPDATE;';
                EXEC sp_executesql @sql;
                PRINT CONCAT(@schema, ': ', @t, ' added to rls_department.');
            END
            FETCH NEXT FROM rls_cursor INTO @t;
        END
        CLOSE rls_cursor;
        DEALLOCATE rls_cursor;
    END

    FETCH NEXT FROM schema_cursor INTO @schema;
END
CLOSE schema_cursor;
DEALLOCATE schema_cursor;
GO

PRINT '=== position_grants.sql complete ===';
GO
