-- =============================================================================
-- positions.sql   (multi-department phase 3c)
-- =============================================================================
-- Positions: a department's named bundles of permissions (keys from
-- src/config/permissions.js), and who holds them.
--
--   positions             one row per position per department
--   position_permissions  what each position allows
--   member_positions      who holds which position (must be a member of the
--                         department; removed with the membership)
--
-- All three are department rows under row-level security (rls_department).
-- legacy_role / legacy_extra link the starting positions to today's roles and
-- extra_* columns: until phase 3d the role still decides access, and
-- lib/positions.js keeps member_positions in step with it at sign-in.
--
-- Creates tables only. Fill them with scripts/seedPositions.js afterwards.
-- LOCAL ONLY (albanyregional3_local) until the multi-department branch ships.
-- Safe to re-run.
-- =============================================================================
SET NOCOUNT ON;
GO

-- =============================================================================
-- dbo
-- =============================================================================

-- positions: a department's named bundles of permissions -----------------------
IF OBJECT_ID(N'dbo.positions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.positions (
        id                   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_dbo_positions PRIMARY KEY,
        department_id        INT            NOT NULL
            CONSTRAINT df_dbo_positions_department_id DEFAULT (CAST(SESSION_CONTEXT(N'department_id') AS INT)),
        name                 NVARCHAR(80)   NOT NULL,
        description          NVARCHAR(400)  NULL,
        is_department_admin  BIT            NOT NULL CONSTRAINT df_dbo_positions_is_admin   DEFAULT (0),
        is_default           BIT            NOT NULL CONSTRAINT df_dbo_positions_is_default DEFAULT (0),
        legacy_role          NVARCHAR(40)   NULL,   -- role this position mirrors until phase 3d
        legacy_extra         NVARCHAR(60)   NULL,   -- volunteer_in.extra_* column it mirrors
        crew_id              INT            NULL,   -- crew-scoped positions (phase 4)
        sort_order           INT            NOT NULL CONSTRAINT df_dbo_positions_sort   DEFAULT (0),
        active               BIT            NOT NULL CONSTRAINT df_dbo_positions_active DEFAULT (1),
        created_at           DATETIME2(3)   NOT NULL CONSTRAINT df_dbo_positions_created DEFAULT (SYSUTCDATETIME()),
        updated_at           DATETIME2(3)   NULL,
        CONSTRAINT FK_dbo_positions_department FOREIGN KEY (department_id) REFERENCES dbo.departments (id),
        CONSTRAINT UQ_dbo_positions_name UNIQUE (department_id, name)
    );
    CREATE INDEX IX_dbo_positions_department ON dbo.positions (department_id) INCLUDE (legacy_role, legacy_extra, active);
    PRINT 'dbo: positions created.';
END
ELSE PRINT 'dbo: positions already exists.';

-- position_permissions: what each position allows ----------------------------------
IF OBJECT_ID(N'dbo.position_permissions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.position_permissions (
        position_id     INT           NOT NULL,
        department_id   INT           NOT NULL
            CONSTRAINT df_dbo_pp_department_id DEFAULT (CAST(SESSION_CONTEXT(N'department_id') AS INT)),
        permission_key  NVARCHAR(64)  NOT NULL,   -- src/config/permissions.js key
        CONSTRAINT PK_dbo_position_permissions PRIMARY KEY (position_id, permission_key),
        CONSTRAINT FK_dbo_pp_position   FOREIGN KEY (position_id)   REFERENCES dbo.positions (id) ON DELETE CASCADE,
        CONSTRAINT FK_dbo_pp_department FOREIGN KEY (department_id) REFERENCES dbo.departments (id)
    );
    CREATE INDEX IX_dbo_pp_department ON dbo.position_permissions (department_id);
    PRINT 'dbo: position_permissions created.';
END
ELSE PRINT 'dbo: position_permissions already exists.';

-- member_positions: who holds which position -----------------------------------------
IF OBJECT_ID(N'dbo.member_positions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.member_positions (
        volunteer_id   INT            NOT NULL,
        department_id  INT            NOT NULL
            CONSTRAINT df_dbo_mp_department_id DEFAULT (CAST(SESSION_CONTEXT(N'department_id') AS INT)),
        position_id    INT            NOT NULL,
        granted_by     NVARCHAR(200)  NULL,
        granted_at     DATETIME2(3)   NOT NULL CONSTRAINT df_dbo_mp_granted_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_dbo_member_positions PRIMARY KEY (volunteer_id, position_id),
        CONSTRAINT FK_dbo_mp_membership FOREIGN KEY (volunteer_id, department_id)
            REFERENCES dbo.department_members (volunteer_id, department_id) ON DELETE CASCADE,
        CONSTRAINT FK_dbo_mp_position   FOREIGN KEY (position_id) REFERENCES dbo.positions (id) ON DELETE CASCADE,
        CONSTRAINT FK_dbo_mp_department FOREIGN KEY (department_id) REFERENCES dbo.departments (id)
    );
    CREATE INDEX IX_dbo_mp_department ON dbo.member_positions (department_id, volunteer_id);
    CREATE INDEX IX_dbo_mp_position   ON dbo.member_positions (position_id);
    PRINT 'dbo: member_positions created.';
END
ELSE PRINT 'dbo: member_positions already exists.';
GO

-- Row-level security: the three tables are department rows (filter + block) --
DECLARE @t SYSNAME, @sql NVARCHAR(MAX);
DECLARE rls_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT name FROM (VALUES (N'positions'), (N'position_permissions'), (N'member_positions')) x(name);
OPEN rls_cursor;
FETCH NEXT FROM rls_cursor INTO @t;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF OBJECT_ID(N'dbo.rls_department', N'SP') IS NULL
        PRINT 'dbo: rls_department missing - run department_rls.sql first.';
    ELSE IF EXISTS (SELECT 1 FROM sys.security_predicates sp
                    WHERE sp.object_id = OBJECT_ID(N'dbo.rls_department')
                      AND sp.target_object_id = OBJECT_ID(N'dbo.' + @t))
        PRINT CONCAT('dbo: ', @t, ' already in rls_department.');
    ELSE
    BEGIN
        SET @sql = N'ALTER SECURITY POLICY dbo.rls_department' + CHAR(10)
                 + N'ADD FILTER PREDICATE dbo.fn_rls_department(department_id) ON dbo.' + QUOTENAME(@t) + N',' + CHAR(10)
                 + N'ADD BLOCK PREDICATE dbo.fn_rls_department(department_id) ON dbo.' + QUOTENAME(@t) + N' AFTER INSERT,' + CHAR(10)
                 + N'ADD BLOCK PREDICATE dbo.fn_rls_department(department_id) ON dbo.' + QUOTENAME(@t) + N' AFTER UPDATE;';
        EXEC sp_executesql @sql;
        PRINT CONCAT('dbo: ', @t, ' added to rls_department.');
    END
    FETCH NEXT FROM rls_cursor INTO @t;
END
CLOSE rls_cursor;
DEALLOCATE rls_cursor;
GO

-- =============================================================================
-- demo
-- =============================================================================

-- positions: a department's named bundles of permissions -----------------------
IF OBJECT_ID(N'demo.positions', N'U') IS NULL
BEGIN
    CREATE TABLE demo.positions (
        id                   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_demo_positions PRIMARY KEY,
        department_id        INT            NOT NULL
            CONSTRAINT df_demo_positions_department_id DEFAULT (CAST(SESSION_CONTEXT(N'department_id') AS INT)),
        name                 NVARCHAR(80)   NOT NULL,
        description          NVARCHAR(400)  NULL,
        is_department_admin  BIT            NOT NULL CONSTRAINT df_demo_positions_is_admin   DEFAULT (0),
        is_default           BIT            NOT NULL CONSTRAINT df_demo_positions_is_default DEFAULT (0),
        legacy_role          NVARCHAR(40)   NULL,   -- role this position mirrors until phase 3d
        legacy_extra         NVARCHAR(60)   NULL,   -- volunteer_in.extra_* column it mirrors
        crew_id              INT            NULL,   -- crew-scoped positions (phase 4)
        sort_order           INT            NOT NULL CONSTRAINT df_demo_positions_sort   DEFAULT (0),
        active               BIT            NOT NULL CONSTRAINT df_demo_positions_active DEFAULT (1),
        created_at           DATETIME2(3)   NOT NULL CONSTRAINT df_demo_positions_created DEFAULT (SYSUTCDATETIME()),
        updated_at           DATETIME2(3)   NULL,
        CONSTRAINT FK_demo_positions_department FOREIGN KEY (department_id) REFERENCES demo.departments (id),
        CONSTRAINT UQ_demo_positions_name UNIQUE (department_id, name)
    );
    CREATE INDEX IX_demo_positions_department ON demo.positions (department_id) INCLUDE (legacy_role, legacy_extra, active);
    PRINT 'demo: positions created.';
END
ELSE PRINT 'demo: positions already exists.';

-- position_permissions: what each position allows ----------------------------------
IF OBJECT_ID(N'demo.position_permissions', N'U') IS NULL
BEGIN
    CREATE TABLE demo.position_permissions (
        position_id     INT           NOT NULL,
        department_id   INT           NOT NULL
            CONSTRAINT df_demo_pp_department_id DEFAULT (CAST(SESSION_CONTEXT(N'department_id') AS INT)),
        permission_key  NVARCHAR(64)  NOT NULL,   -- src/config/permissions.js key
        CONSTRAINT PK_demo_position_permissions PRIMARY KEY (position_id, permission_key),
        CONSTRAINT FK_demo_pp_position   FOREIGN KEY (position_id)   REFERENCES demo.positions (id) ON DELETE CASCADE,
        CONSTRAINT FK_demo_pp_department FOREIGN KEY (department_id) REFERENCES demo.departments (id)
    );
    CREATE INDEX IX_demo_pp_department ON demo.position_permissions (department_id);
    PRINT 'demo: position_permissions created.';
END
ELSE PRINT 'demo: position_permissions already exists.';

-- member_positions: who holds which position -----------------------------------------
IF OBJECT_ID(N'demo.member_positions', N'U') IS NULL
BEGIN
    CREATE TABLE demo.member_positions (
        volunteer_id   INT            NOT NULL,
        department_id  INT            NOT NULL
            CONSTRAINT df_demo_mp_department_id DEFAULT (CAST(SESSION_CONTEXT(N'department_id') AS INT)),
        position_id    INT            NOT NULL,
        granted_by     NVARCHAR(200)  NULL,
        granted_at     DATETIME2(3)   NOT NULL CONSTRAINT df_demo_mp_granted_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_demo_member_positions PRIMARY KEY (volunteer_id, position_id),
        CONSTRAINT FK_demo_mp_membership FOREIGN KEY (volunteer_id, department_id)
            REFERENCES demo.department_members (volunteer_id, department_id) ON DELETE CASCADE,
        CONSTRAINT FK_demo_mp_position   FOREIGN KEY (position_id) REFERENCES demo.positions (id) ON DELETE CASCADE,
        CONSTRAINT FK_demo_mp_department FOREIGN KEY (department_id) REFERENCES demo.departments (id)
    );
    CREATE INDEX IX_demo_mp_department ON demo.member_positions (department_id, volunteer_id);
    CREATE INDEX IX_demo_mp_position   ON demo.member_positions (position_id);
    PRINT 'demo: member_positions created.';
END
ELSE PRINT 'demo: member_positions already exists.';
GO

-- Row-level security: the three tables are department rows (filter + block) --
DECLARE @t SYSNAME, @sql NVARCHAR(MAX);
DECLARE rls_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT name FROM (VALUES (N'positions'), (N'position_permissions'), (N'member_positions')) x(name);
OPEN rls_cursor;
FETCH NEXT FROM rls_cursor INTO @t;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF OBJECT_ID(N'demo.rls_department', N'SP') IS NULL
        PRINT 'demo: rls_department missing - run department_rls.sql first.';
    ELSE IF EXISTS (SELECT 1 FROM sys.security_predicates sp
                    WHERE sp.object_id = OBJECT_ID(N'demo.rls_department')
                      AND sp.target_object_id = OBJECT_ID(N'demo.' + @t))
        PRINT CONCAT('demo: ', @t, ' already in rls_department.');
    ELSE
    BEGIN
        SET @sql = N'ALTER SECURITY POLICY demo.rls_department' + CHAR(10)
                 + N'ADD FILTER PREDICATE demo.fn_rls_department(department_id) ON demo.' + QUOTENAME(@t) + N',' + CHAR(10)
                 + N'ADD BLOCK PREDICATE demo.fn_rls_department(department_id) ON demo.' + QUOTENAME(@t) + N' AFTER INSERT,' + CHAR(10)
                 + N'ADD BLOCK PREDICATE demo.fn_rls_department(department_id) ON demo.' + QUOTENAME(@t) + N' AFTER UPDATE;';
        EXEC sp_executesql @sql;
        PRINT CONCAT('demo: ', @t, ' added to rls_department.');
    END
    FETCH NEXT FROM rls_cursor INTO @t;
END
CLOSE rls_cursor;
DEALLOCATE rls_cursor;
GO

PRINT '=== positions.sql complete ===';
GO
