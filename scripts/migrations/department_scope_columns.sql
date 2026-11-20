-- =============================================================================
-- department_scope_columns.sql   (multi-department phase 2a, migration 3 of 4)
-- =============================================================================
-- Gives every department-owned table a department_id, in both the dbo and demo
-- schemas, so phase 2c row-level security can filter on it without joins.
-- For each of the 40 tables listed below:
--   1. Adds department_id INT NULL (or keeps the existing placeholder column
--      from addDepartmentId.sql: invitation_batches, locations_tasks,
--      message_templates, oversight_structure, shifts).
--   2. Replaces its default with
--        COALESCE(CAST(SESSION_CONTEXT(N'department_id') AS INT), 1)
--      so new rows take the request's department once phase 2b sets session
--      context, and fall back to department 1 (Parking) until then. Existing
--      INSERTs keep working unchanged. The ", 1" fallback is removed (and the
--      column made NOT NULL) in the hardening step at the end of phase 2.
--   3. Backfills existing rows to department 1.
--   4. Adds a foreign key to departments and an index on department_id.
--
-- Also: volunteer_year_status gains department_id and its primary key becomes
-- (volunteer_id, year, department_id).
--
-- Deliberately NOT here:
--   - lessons_learned: its department_id means "the department this lesson is
--     about" (-> system_variable_lists). It is renamed and gets its own
--     department column together with the code change in phase 2b.
--   - Shared tables (volunteer_in, convention_years, convention_days, sessions,
--     congregations, volunteer_blackouts, magic_login_tokens,
--     volunteer_tour_dismissals, bug_reports, sms_opt_out_log).
--   - Tables missing from a schema are skipped (demo has no map_files).
--
-- LOCAL ONLY (albanyregional3_local). Never run against albanyregional3.
-- Safe to re-run: every step checks the current state first.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. dbo: department_id on every department-owned table
-- -----------------------------------------------------------------------------
DECLARE @tables TABLE (name SYSNAME PRIMARY KEY);
INSERT INTO @tables (name) VALUES
        (N'shifts'),
        (N'schedule_assignments'),
        (N'shift_slot_assignments'),
        (N'shift_alert_schedules'),
        (N'shift_alert_log'),
        (N'shift_rendezvous_points'),
        (N'scheduler_categories'),
        (N'scheduler_category_access'),
        (N'schedule_violations'),
        (N'schedule_violation_runs'),
        (N'schedule_analysis_rules'),
        (N'schedule_publishes'),
        (N'schedule_publish_snapshots'),
        (N'locations_tasks'),
        (N'location_sub_locations'),
        (N'invitation_batches'),
        (N'invitations'),
        (N'invitation_revocation_log'),
        (N'message_templates'),
        (N'campaign_meetings'),
        (N'oversight_structure'),
        (N'attendance'),
        (N'lessons_learned_photos'),
        (N'lessons_learned_reports'),
        (N'published_files'),
        (N'map_files'),
        (N'volunteer_note_reads'),
        (N'volunteer_note_analyses'),
        (N'volunteer_actions'),
        (N'inbound_sms_messages'),
        (N'ai_blackout_suggestions'),
        (N'signs'),
        (N'sign_locations'),
        (N'sign_attachments'),
        (N'sign_traffic_arrows'),
        (N'sign_traffic_arrow_links'),
        (N'parking_counts'),
        (N'capacity_alert_rules'),
        (N'capacity_alert_settings'),
        (N'capacity_alert_log');

DECLARE @schema SYSNAME = N'dbo';
DECLARE @t SYSNAME, @full NVARCHAR(300), @obj INT, @df SYSNAME, @sql NVARCHAR(MAX), @n INT;

DECLARE table_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT name FROM @tables ORDER BY name;
OPEN table_cursor;
FETCH NEXT FROM table_cursor INTO @t;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @full = QUOTENAME(@schema) + N'.' + QUOTENAME(@t);
    SET @obj = OBJECT_ID(@full, 'U');

    IF @obj IS NULL
        PRINT CONCAT(@schema, N'.', @t, N': table missing — skipped.');
    ELSE
    BEGIN
        -- 1. Column
        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = @obj AND name = N'department_id')
        BEGIN
            SET @sql = N'ALTER TABLE ' + @full + N' ADD department_id INT NULL;';
            EXEC sp_executesql @sql;
            PRINT CONCAT(@schema, N'.', @t, N': added department_id.');
        END

        -- 2. Default: replace anything that is not the session-context default
        SET @df = NULL;
        SELECT @df = dc.name
        FROM sys.default_constraints dc
        JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
        WHERE dc.parent_object_id = @obj AND c.name = N'department_id'
          AND dc.definition NOT LIKE N'%SESSION_CONTEXT%';
        IF @df IS NOT NULL
        BEGIN
            SET @sql = N'ALTER TABLE ' + @full + N' DROP CONSTRAINT ' + QUOTENAME(@df) + N';';
            EXEC sp_executesql @sql;
            SET @df = NULL;
        END
        IF NOT EXISTS (SELECT 1 FROM sys.default_constraints dc
                       JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
                       WHERE dc.parent_object_id = @obj AND c.name = N'department_id')
        BEGIN
            SET @sql = N'ALTER TABLE ' + @full + N' ADD CONSTRAINT ' + QUOTENAME(N'df_' + @t + N'_department_id')
                + N' DEFAULT (COALESCE(CAST(SESSION_CONTEXT(N''department_id'') AS INT), 1)) FOR department_id;';
            EXEC sp_executesql @sql;
            PRINT CONCAT(@schema, N'.', @t, N': session-context default set.');
        END

        -- 3. Backfill
        SET @sql = N'UPDATE ' + @full + N' SET department_id = 1 WHERE department_id IS NULL; SET @n = @@ROWCOUNT;';
        EXEC sp_executesql @sql, N'@n INT OUTPUT', @n = @n OUTPUT;
        IF @n > 0 PRINT CONCAT(@schema, N'.', @t, N': backfilled ', @n, N' rows to department 1.');

        -- 4. Foreign key and index
        IF NOT EXISTS (SELECT 1 FROM sys.foreign_key_columns fkc
                       JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
                       WHERE fkc.parent_object_id = @obj AND c.name = N'department_id')
        BEGIN
            SET @sql = N'ALTER TABLE ' + @full + N' ADD CONSTRAINT ' + QUOTENAME(N'FK_' + @t + N'_department')
                + N' FOREIGN KEY (department_id) REFERENCES ' + QUOTENAME(@schema) + N'.departments (id);';
            EXEC sp_executesql @sql;
        END

        IF NOT EXISTS (SELECT 1 FROM sys.index_columns ic
                       JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
                       WHERE ic.object_id = @obj AND c.name = N'department_id' AND ic.key_ordinal = 1)
        BEGIN
            SET @sql = N'CREATE INDEX ' + QUOTENAME(N'IX_' + @schema + N'_' + @t + N'_department')
                + N' ON ' + @full + N' (department_id);';
            EXEC sp_executesql @sql;
        END
    END

    FETCH NEXT FROM table_cursor INTO @t;
END

CLOSE table_cursor;
DEALLOCATE table_cursor;
PRINT CONCAT(@schema, N': department-owned tables done.');
GO

-- -----------------------------------------------------------------------------
-- 2. demo: department_id on every department-owned table
-- -----------------------------------------------------------------------------
DECLARE @tables TABLE (name SYSNAME PRIMARY KEY);
INSERT INTO @tables (name) VALUES
        (N'shifts'),
        (N'schedule_assignments'),
        (N'shift_slot_assignments'),
        (N'shift_alert_schedules'),
        (N'shift_alert_log'),
        (N'shift_rendezvous_points'),
        (N'scheduler_categories'),
        (N'scheduler_category_access'),
        (N'schedule_violations'),
        (N'schedule_violation_runs'),
        (N'schedule_analysis_rules'),
        (N'schedule_publishes'),
        (N'schedule_publish_snapshots'),
        (N'locations_tasks'),
        (N'location_sub_locations'),
        (N'invitation_batches'),
        (N'invitations'),
        (N'invitation_revocation_log'),
        (N'message_templates'),
        (N'campaign_meetings'),
        (N'oversight_structure'),
        (N'attendance'),
        (N'lessons_learned_photos'),
        (N'lessons_learned_reports'),
        (N'published_files'),
        (N'map_files'),
        (N'volunteer_note_reads'),
        (N'volunteer_note_analyses'),
        (N'volunteer_actions'),
        (N'inbound_sms_messages'),
        (N'ai_blackout_suggestions'),
        (N'signs'),
        (N'sign_locations'),
        (N'sign_attachments'),
        (N'sign_traffic_arrows'),
        (N'sign_traffic_arrow_links'),
        (N'parking_counts'),
        (N'capacity_alert_rules'),
        (N'capacity_alert_settings'),
        (N'capacity_alert_log');

DECLARE @schema SYSNAME = N'demo';
DECLARE @t SYSNAME, @full NVARCHAR(300), @obj INT, @df SYSNAME, @sql NVARCHAR(MAX), @n INT;

DECLARE table_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT name FROM @tables ORDER BY name;
OPEN table_cursor;
FETCH NEXT FROM table_cursor INTO @t;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @full = QUOTENAME(@schema) + N'.' + QUOTENAME(@t);
    SET @obj = OBJECT_ID(@full, 'U');

    IF @obj IS NULL
        PRINT CONCAT(@schema, N'.', @t, N': table missing — skipped.');
    ELSE
    BEGIN
        -- 1. Column
        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = @obj AND name = N'department_id')
        BEGIN
            SET @sql = N'ALTER TABLE ' + @full + N' ADD department_id INT NULL;';
            EXEC sp_executesql @sql;
            PRINT CONCAT(@schema, N'.', @t, N': added department_id.');
        END

        -- 2. Default: replace anything that is not the session-context default
        SET @df = NULL;
        SELECT @df = dc.name
        FROM sys.default_constraints dc
        JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
        WHERE dc.parent_object_id = @obj AND c.name = N'department_id'
          AND dc.definition NOT LIKE N'%SESSION_CONTEXT%';
        IF @df IS NOT NULL
        BEGIN
            SET @sql = N'ALTER TABLE ' + @full + N' DROP CONSTRAINT ' + QUOTENAME(@df) + N';';
            EXEC sp_executesql @sql;
            SET @df = NULL;
        END
        IF NOT EXISTS (SELECT 1 FROM sys.default_constraints dc
                       JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
                       WHERE dc.parent_object_id = @obj AND c.name = N'department_id')
        BEGIN
            SET @sql = N'ALTER TABLE ' + @full + N' ADD CONSTRAINT ' + QUOTENAME(N'df_' + @t + N'_department_id')
                + N' DEFAULT (COALESCE(CAST(SESSION_CONTEXT(N''department_id'') AS INT), 1)) FOR department_id;';
            EXEC sp_executesql @sql;
            PRINT CONCAT(@schema, N'.', @t, N': session-context default set.');
        END

        -- 3. Backfill
        SET @sql = N'UPDATE ' + @full + N' SET department_id = 1 WHERE department_id IS NULL; SET @n = @@ROWCOUNT;';
        EXEC sp_executesql @sql, N'@n INT OUTPUT', @n = @n OUTPUT;
        IF @n > 0 PRINT CONCAT(@schema, N'.', @t, N': backfilled ', @n, N' rows to department 1.');

        -- 4. Foreign key and index
        IF NOT EXISTS (SELECT 1 FROM sys.foreign_key_columns fkc
                       JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
                       WHERE fkc.parent_object_id = @obj AND c.name = N'department_id')
        BEGIN
            SET @sql = N'ALTER TABLE ' + @full + N' ADD CONSTRAINT ' + QUOTENAME(N'FK_' + @t + N'_department')
                + N' FOREIGN KEY (department_id) REFERENCES ' + QUOTENAME(@schema) + N'.departments (id);';
            EXEC sp_executesql @sql;
        END

        IF NOT EXISTS (SELECT 1 FROM sys.index_columns ic
                       JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
                       WHERE ic.object_id = @obj AND c.name = N'department_id' AND ic.key_ordinal = 1)
        BEGIN
            SET @sql = N'CREATE INDEX ' + QUOTENAME(N'IX_' + @schema + N'_' + @t + N'_department')
                + N' ON ' + @full + N' (department_id);';
            EXEC sp_executesql @sql;
        END
    END

    FETCH NEXT FROM table_cursor INTO @t;
END

CLOSE table_cursor;
DEALLOCATE table_cursor;
PRINT CONCAT(@schema, N': department-owned tables done.');
GO

-- -----------------------------------------------------------------------------
-- 3. dbo.volunteer_year_status: department_id joins the primary key
-- -----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.volunteer_year_status') AND name = 'department_id')
BEGIN
    ALTER TABLE dbo.volunteer_year_status ADD department_id INT NULL;
    PRINT 'Added dbo.volunteer_year_status.department_id.';
END
ELSE PRINT 'dbo.volunteer_year_status.department_id already exists — skipped.';
GO

UPDATE dbo.volunteer_year_status SET department_id = 1 WHERE department_id IS NULL;
GO

DECLARE @pk SYSNAME, @pkcols INT, @sql NVARCHAR(MAX);
SELECT @pk = i.name,
       @pkcols = (SELECT COUNT(*) FROM sys.index_columns ic WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id)
FROM sys.indexes i
WHERE i.object_id = OBJECT_ID('dbo.volunteer_year_status') AND i.is_primary_key = 1;

IF @pkcols = 3
    PRINT 'dbo.volunteer_year_status primary key already includes department_id — skipped.';
ELSE
BEGIN
    -- ALTER COLUMN is refused while a foreign key or default is attached;
    -- drop them here (the next batch adds them back).
    IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id = OBJECT_ID('dbo.volunteer_year_status') AND name = 'FK_volunteer_year_status_department')
        ALTER TABLE dbo.volunteer_year_status DROP CONSTRAINT FK_volunteer_year_status_department;
    IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID('dbo.volunteer_year_status') AND name = 'df_volunteer_year_status_department_id')
        ALTER TABLE dbo.volunteer_year_status DROP CONSTRAINT df_volunteer_year_status_department_id;

    ALTER TABLE dbo.volunteer_year_status ALTER COLUMN department_id INT NOT NULL;
    IF @pk IS NOT NULL
    BEGIN
        SET @sql = N'ALTER TABLE dbo.volunteer_year_status DROP CONSTRAINT ' + QUOTENAME(@pk) + N';';
        EXEC sp_executesql @sql;
    END
    ALTER TABLE dbo.volunteer_year_status
        ADD CONSTRAINT PK_volunteer_year_status PRIMARY KEY CLUSTERED (volunteer_id, year, department_id);
    PRINT 'dbo.volunteer_year_status primary key is now (volunteer_id, year, department_id).';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints dc
               JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
               WHERE dc.parent_object_id = OBJECT_ID('dbo.volunteer_year_status') AND c.name = 'department_id')
    ALTER TABLE dbo.volunteer_year_status ADD CONSTRAINT df_volunteer_year_status_department_id
        DEFAULT (COALESCE(CAST(SESSION_CONTEXT(N'department_id') AS INT), 1)) FOR department_id;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id = OBJECT_ID('dbo.volunteer_year_status') AND name = 'FK_volunteer_year_status_department')
    ALTER TABLE dbo.volunteer_year_status ADD CONSTRAINT FK_volunteer_year_status_department
        FOREIGN KEY (department_id) REFERENCES dbo.departments (id);
GO

-- -----------------------------------------------------------------------------
-- 4. demo.volunteer_year_status: department_id joins the primary key
-- -----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('demo.volunteer_year_status') AND name = 'department_id')
BEGIN
    ALTER TABLE demo.volunteer_year_status ADD department_id INT NULL;
    PRINT 'Added demo.volunteer_year_status.department_id.';
END
ELSE PRINT 'demo.volunteer_year_status.department_id already exists — skipped.';
GO

UPDATE demo.volunteer_year_status SET department_id = 1 WHERE department_id IS NULL;
GO

DECLARE @pk SYSNAME, @pkcols INT, @sql NVARCHAR(MAX);
SELECT @pk = i.name,
       @pkcols = (SELECT COUNT(*) FROM sys.index_columns ic WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id)
FROM sys.indexes i
WHERE i.object_id = OBJECT_ID('demo.volunteer_year_status') AND i.is_primary_key = 1;

IF @pkcols = 3
    PRINT 'demo.volunteer_year_status primary key already includes department_id — skipped.';
ELSE
BEGIN
    -- ALTER COLUMN is refused while a foreign key or default is attached;
    -- drop them here (the next batch adds them back).
    IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id = OBJECT_ID('demo.volunteer_year_status') AND name = 'FK_volunteer_year_status_department')
        ALTER TABLE demo.volunteer_year_status DROP CONSTRAINT FK_volunteer_year_status_department;
    IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID('demo.volunteer_year_status') AND name = 'df_volunteer_year_status_department_id')
        ALTER TABLE demo.volunteer_year_status DROP CONSTRAINT df_volunteer_year_status_department_id;

    ALTER TABLE demo.volunteer_year_status ALTER COLUMN department_id INT NOT NULL;
    IF @pk IS NOT NULL
    BEGIN
        SET @sql = N'ALTER TABLE demo.volunteer_year_status DROP CONSTRAINT ' + QUOTENAME(@pk) + N';';
        EXEC sp_executesql @sql;
    END
    ALTER TABLE demo.volunteer_year_status
        ADD CONSTRAINT PK_volunteer_year_status PRIMARY KEY CLUSTERED (volunteer_id, year, department_id);
    PRINT 'demo.volunteer_year_status primary key is now (volunteer_id, year, department_id).';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints dc
               JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
               WHERE dc.parent_object_id = OBJECT_ID('demo.volunteer_year_status') AND c.name = 'department_id')
    ALTER TABLE demo.volunteer_year_status ADD CONSTRAINT df_volunteer_year_status_department_id
        DEFAULT (COALESCE(CAST(SESSION_CONTEXT(N'department_id') AS INT), 1)) FOR department_id;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id = OBJECT_ID('demo.volunteer_year_status') AND name = 'FK_volunteer_year_status_department')
    ALTER TABLE demo.volunteer_year_status ADD CONSTRAINT FK_volunteer_year_status_department
        FOREIGN KEY (department_id) REFERENCES demo.departments (id);
GO

-- -----------------------------------------------------------------------------
-- 5. Verify
-- -----------------------------------------------------------------------------
PRINT '=== Problems (expect no rows) ===';
SELECT 'dbo' AS schema_name, t.name AS table_name,
       CASE WHEN c.column_id IS NULL THEN 'NO COLUMN' ELSE 'ok' END AS department_id,
       dc.definition AS default_value,
       CASE WHEN fk.parent_object_id IS NULL THEN 'no' ELSE 'yes' END AS has_fk
FROM sys.tables t
LEFT JOIN sys.columns c ON c.object_id = t.object_id AND c.name = 'department_id'
LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
LEFT JOIN sys.foreign_key_columns fk ON fk.parent_object_id = c.object_id AND fk.parent_column_id = c.column_id
WHERE SCHEMA_NAME(t.schema_id) = 'dbo'
  AND t.name IN ('shifts', 'schedule_assignments', 'shift_slot_assignments', 'shift_alert_schedules', 'shift_alert_log', 'shift_rendezvous_points', 'scheduler_categories', 'scheduler_category_access', 'schedule_violations', 'schedule_violation_runs', 'schedule_analysis_rules', 'schedule_publishes', 'schedule_publish_snapshots', 'locations_tasks', 'location_sub_locations', 'invitation_batches', 'invitations', 'invitation_revocation_log', 'message_templates', 'campaign_meetings', 'oversight_structure', 'attendance', 'lessons_learned_photos', 'lessons_learned_reports', 'published_files', 'map_files', 'volunteer_note_reads', 'volunteer_note_analyses', 'volunteer_actions', 'inbound_sms_messages', 'ai_blackout_suggestions', 'signs', 'sign_locations', 'sign_attachments', 'sign_traffic_arrows', 'sign_traffic_arrow_links', 'parking_counts', 'capacity_alert_rules', 'capacity_alert_settings', 'capacity_alert_log', 'volunteer_year_status')
  AND (c.column_id IS NULL OR fk.parent_object_id IS NULL OR dc.definition NOT LIKE '%SESSION_CONTEXT%')
UNION ALL
SELECT 'demo' AS schema_name, t.name AS table_name,
       CASE WHEN c.column_id IS NULL THEN 'NO COLUMN' ELSE 'ok' END AS department_id,
       dc.definition AS default_value,
       CASE WHEN fk.parent_object_id IS NULL THEN 'no' ELSE 'yes' END AS has_fk
FROM sys.tables t
LEFT JOIN sys.columns c ON c.object_id = t.object_id AND c.name = 'department_id'
LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
LEFT JOIN sys.foreign_key_columns fk ON fk.parent_object_id = c.object_id AND fk.parent_column_id = c.column_id
WHERE SCHEMA_NAME(t.schema_id) = 'demo'
  AND t.name IN ('shifts', 'schedule_assignments', 'shift_slot_assignments', 'shift_alert_schedules', 'shift_alert_log', 'shift_rendezvous_points', 'scheduler_categories', 'scheduler_category_access', 'schedule_violations', 'schedule_violation_runs', 'schedule_analysis_rules', 'schedule_publishes', 'schedule_publish_snapshots', 'locations_tasks', 'location_sub_locations', 'invitation_batches', 'invitations', 'invitation_revocation_log', 'message_templates', 'campaign_meetings', 'oversight_structure', 'attendance', 'lessons_learned_photos', 'lessons_learned_reports', 'published_files', 'map_files', 'volunteer_note_reads', 'volunteer_note_analyses', 'volunteer_actions', 'inbound_sms_messages', 'ai_blackout_suggestions', 'signs', 'sign_locations', 'sign_attachments', 'sign_traffic_arrows', 'sign_traffic_arrow_links', 'parking_counts', 'capacity_alert_rules', 'capacity_alert_settings', 'capacity_alert_log', 'volunteer_year_status')
  AND (c.column_id IS NULL OR fk.parent_object_id IS NULL OR dc.definition NOT LIKE '%SESSION_CONTEXT%');
GO

PRINT '=== Tables with the session-context default, per schema ===';
SELECT SCHEMA_NAME(t.schema_id) AS schema_name, COUNT(*) AS tables_scoped
FROM sys.default_constraints dc
JOIN sys.tables t ON t.object_id = dc.parent_object_id
JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE c.name = 'department_id' AND dc.definition LIKE '%SESSION_CONTEXT%'
GROUP BY t.schema_id;
GO

PRINT '=== department_scope_columns.sql complete ===';
GO
