-- rollover_dry_run.sql
-- Dry run of startConventionYear() (Phase 4). Runs the exact rollover batch
-- the app will run, inside an OUTER transaction that is rolled back at the
-- end. The inner COMMIT only lowers @@TRANCOUNT, so NOTHING is saved.
--
-- Edit @datesJson to the 2027 dates you expect to pick, then run the whole
-- script (F5). Read the result grids, top to bottom:
--   1. summary counts (same numbers the prompt will show)
--   2. the 2027 days that would be created and the 2026 day each copies
--   3. sanity checks — every number in grid 3 should be 0
--   4. @@TRANCOUNT after rollback — must be 0

DECLARE @fromYear       INT           = 2026;
DECLARE @toYear         INT           = 2027;
DECLARE @datesJson      NVARCHAR(MAX) = N'["2027-07-02","2027-07-03","2027-07-04"]';
DECLARE @carryLocations BIT           = 1;
DECLARE @carryStructure BIT           = 1;
DECLARE @resetSigns     BIT           = 1;
DECLARE @startedBy      INT           = (SELECT TOP (1) id FROM dbo.volunteer_in WHERE role = 'ADMIN' ORDER BY id);
DECLARE @editedBy       NVARCHAR(100) = N'rollover dry run';

BEGIN TRANSACTION;   -- outer: rolled back below

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- ── Guards ─────────────────────────────────────────────────────────
DECLARE @active INT = (
    SELECT year FROM dbo.convention_years WITH (UPDLOCK, HOLDLOCK)
    WHERE  status = 'active'
);
IF @active IS NULL OR @active <> @fromYear
    THROW 50001, 'The active convention year has changed. Reload the page and try again.', 1;
IF EXISTS (SELECT 1 FROM dbo.convention_years WHERE year = @toYear)
    THROW 50002, 'That convention year has already been started.', 1;

-- ── Picked dates and their matching fromYear day ───────────────────
DECLARE @newDays TABLE (
    convention_date DATE PRIMARY KEY,
    source_day_id   INT NULL,
    new_day_id      INT NULL,
    existed         BIT NOT NULL DEFAULT 0
);
INSERT INTO @newDays (convention_date)
SELECT DISTINCT CAST([value] AS DATE) FROM OPENJSON(@datesJson);

DECLARE @newFirst DATE = (SELECT MIN(convention_date) FROM @newDays);
DECLARE @newLast  DATE = (SELECT MAX(convention_date) FROM @newDays);
DECLARE @oldLast  DATE = (SELECT MAX(convention_date) FROM dbo.convention_days WHERE year = @fromYear);

UPDATE nd
SET    source_day_id = (
           SELECT MIN(cd.id)
           FROM   dbo.convention_days cd
           WHERE  cd.year = @fromYear
             AND  DATEDIFF(DAY, cd.convention_date, @oldLast)
                = DATEDIFF(DAY, nd.convention_date, @newLast)
       ),
       existed = IIF(EXISTS (
           SELECT 1 FROM dbo.convention_days x
           WHERE  x.year = @toYear AND x.convention_date = nd.convention_date
       ), 1, 0)
FROM   @newDays nd;

-- ── 1. Snapshot volunteers ─────────────────────────────────────────
INSERT INTO dbo.volunteer_year_status
    (volunteer_id, year, was_active, recruitment_response, response_other,
     response_batch_id, responded_at, decently_exported_at, decently_imported_at)
SELECT v.id, @fromYear,
       ISNULL(v.active_current_year, 0),
       r.response, r.response_other, r.batch_id, r.responded_at,
       IIF(ISNULL(v.decently_exported, 0) = 1, v.decently_exported_time, NULL),
       IIF(ISNULL(v.decently_import, 0)   = 1, v.decently_imported_time, NULL)
FROM   dbo.volunteer_in v
OUTER APPLY (
    SELECT TOP (1) i.response, i.response_other, i.batch_id, i.responded_at
    FROM   dbo.invitations i
    JOIN   dbo.invitation_batches b ON b.id = i.batch_id
    WHERE  i.volunteer_id = v.id
      AND  b.year = @fromYear
      AND  b.response_needed = 1
      AND  ISNULL(i.revoked, 0) = 0
      AND  i.responded_at IS NOT NULL
    ORDER  BY i.responded_at DESC, i.id DESC
) r
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.volunteer_year_status s
    WHERE  s.volunteer_id = v.id AND s.year = @fromYear
);
DECLARE @volunteersSnapshotted INT = @@ROWCOUNT;

-- ── 2. Reset volunteers for the new year ───────────────────────────
UPDATE dbo.volunteer_in
SET    active_current_year = 0,
       decently_exported   = 0,
       decently_import     = 0,
       last_updated        = SYSUTCDATETIME(),
       edited_by           = @editedBy
WHERE  ISNULL(active_current_year, 0) <> 0
   OR  ISNULL(decently_exported, 0)   <> 0
   OR  ISNULL(decently_import, 0)     <> 0;
DECLARE @volunteersReset INT = @@ROWCOUNT;

-- ── 3. Close fromYear, open toYear ─────────────────────────────────
UPDATE dbo.convention_years
SET    status = 'closed', closed_by = @startedBy, closed_at = SYSUTCDATETIME()
WHERE  year = @fromYear;

INSERT INTO dbo.convention_years (year, status, first_date, last_date, started_by)
VALUES (@toYear, 'active', @newFirst, @newLast, @startedBy);

-- ── 4. Convention days ─────────────────────────────────────────────
INSERT INTO dbo.convention_days
    (year, label, convention_date, program_start, program_end, notes, schedulable)
SELECT @toYear,
       COALESCE(src.label, DATENAME(WEEKDAY, nd.convention_date)),
       nd.convention_date, NULL, NULL, NULL,
       COALESCE(src.schedulable, 1)
FROM   @newDays nd
LEFT JOIN dbo.convention_days src ON src.id = nd.source_day_id
WHERE  nd.existed = 0;
DECLARE @daysCreated INT = @@ROWCOUNT;

UPDATE nd
SET    new_day_id = (
           SELECT MIN(cd.id) FROM dbo.convention_days cd
           WHERE  cd.year = @toYear AND cd.convention_date = nd.convention_date
       )
FROM   @newDays nd
WHERE  nd.existed = 0;

-- ── 5. Locations & Tasks ───────────────────────────────────────────
DECLARE @locMap TABLE (old_id INT PRIMARY KEY, new_id INT NOT NULL);
DECLARE @subMap TABLE (old_id INT PRIMARY KEY, new_id INT NOT NULL);
DECLARE @locationsSkipped BIT = IIF(EXISTS (
    SELECT 1 FROM dbo.locations_tasks WHERE year = @toYear
), 1, 0);
DECLARE @capacityRulesCopied INT = 0;

IF @carryLocations = 1 AND @locationsSkipped = 0
BEGIN
    MERGE dbo.locations_tasks AS t
    USING (SELECT * FROM dbo.locations_tasks WHERE year = @fromYear) AS s
    ON 1 = 0
    WHEN NOT MATCHED THEN
        INSERT (year, name, type, description, capacity, address, lat, lng,
                maps_url, active, created_by, department_id, classification_id)
        VALUES (@toYear, s.name, s.type, s.description, s.capacity, s.address,
                s.lat, s.lng, s.maps_url, s.active, s.created_by,
                s.department_id, s.classification_id)
    OUTPUT s.id, inserted.id INTO @locMap (old_id, new_id);

    MERGE dbo.location_sub_locations AS t
    USING (
        SELECT sl.*, m.new_id AS new_location_id
        FROM   dbo.location_sub_locations sl
        JOIN   @locMap m ON m.old_id = sl.location_task_id
    ) AS s
    ON 1 = 0
    WHEN NOT MATCHED THEN
        INSERT (location_task_id, name, sub_type_id, display_order, active)
        VALUES (s.new_location_id, s.name, s.sub_type_id, s.display_order, s.active)
    OUTPUT s.id, inserted.id INTO @subMap (old_id, new_id);

    INSERT INTO dbo.capacity_alert_rules
        (location_task_id, sub_location_id, threshold_type, threshold_value,
         direction, recipient_role, message_override, is_armed, active, created_by)
    SELECT lm.new_id, sm.new_id, r.threshold_type, r.threshold_value,
           r.direction, r.recipient_role, r.message_override, 1, r.active, r.created_by
    FROM   dbo.capacity_alert_rules r
    JOIN   @locMap lm      ON lm.old_id = r.location_task_id
    LEFT JOIN @subMap sm   ON sm.old_id = r.sub_location_id
    WHERE  r.sub_location_id IS NULL OR sm.new_id IS NOT NULL;
    SET @capacityRulesCopied = @@ROWCOUNT;
END
ELSE
BEGIN
    -- Locations not copied now: match any existing toYear locations by
    -- name and type so the structure copy can still re-point assignments.
    INSERT INTO @locMap (old_id, new_id)
    SELECT o.id, MIN(n.id)
    FROM   dbo.locations_tasks o
    JOIN   dbo.locations_tasks n
           ON n.year = @toYear AND n.name = o.name AND n.type = o.type
    WHERE  o.year = @fromYear
    GROUP  BY o.id;
END

-- ── 6. Session / shift structure ───────────────────────────────────
DECLARE @sessMap  TABLE (old_id INT PRIMARY KEY, new_id INT NOT NULL);
DECLARE @shiftMap TABLE (old_id INT PRIMARY KEY, new_id INT NOT NULL);
DECLARE @asgMap   TABLE (old_id INT PRIMARY KEY, new_id INT NOT NULL);
DECLARE @assignmentsSkipped   INT = 0;
DECLARE @rendezvousCopied     INT = 0;
DECLARE @alertSchedulesCopied INT = 0;

IF @carryStructure = 1
BEGIN
    MERGE dbo.sessions AS t
    USING (
        SELECT se.*, nd.new_day_id
        FROM   dbo.sessions se
        JOIN   @newDays nd ON nd.source_day_id = se.convention_day_id
        WHERE  nd.existed = 0
    ) AS s
    ON 1 = 0
    WHEN NOT MATCHED THEN
        INSERT (convention_day_id, label, session_order, start_time, end_time,
                notes, department_id)
        VALUES (s.new_day_id, s.label, s.session_order, s.start_time, s.end_time,
                s.notes, s.department_id)
    OUTPUT s.id, inserted.id INTO @sessMap (old_id, new_id);

    MERGE dbo.shifts AS t
    USING (
        SELECT sh.*, m.new_id AS new_session_id
        FROM   dbo.shifts sh
        JOIN   @sessMap m ON m.old_id = sh.session_id
    ) AS s
    ON 1 = 0
    WHEN NOT MATCHED THEN
        INSERT (session_id, label, start_time, end_time, volunteer_need, notes,
                invitable, sms_code, department_id, is_meeting, category_id,
                has_keyman, has_keyman_asst)
        VALUES (s.new_session_id, s.label, s.start_time, s.end_time,
                s.volunteer_need, s.notes, s.invitable, s.sms_code,
                s.department_id, s.is_meeting, s.category_id,
                s.has_keyman, s.has_keyman_asst)
    OUTPUT s.id, inserted.id INTO @shiftMap (old_id, new_id);

    MERGE dbo.schedule_assignments AS t
    USING (
        SELECT sa.*, sm.new_id AS new_shift_id, lm.new_id AS new_location_id
        FROM   dbo.schedule_assignments sa
        JOIN   @shiftMap sm ON sm.old_id = sa.shift_id
        JOIN   @locMap   lm ON lm.old_id = sa.location_task_id
    ) AS s
    ON 1 = 0
    WHEN NOT MATCHED THEN
        INSERT (shift_id, location_task_id, notes, volunteer_need, vol_min, vol_max)
        VALUES (s.new_shift_id, s.new_location_id, s.notes, s.volunteer_need,
                s.vol_min, s.vol_max)
    OUTPUT s.id, inserted.id INTO @asgMap (old_id, new_id);

    SET @assignmentsSkipped = (
        SELECT COUNT(*)
        FROM   dbo.schedule_assignments sa
        JOIN   @shiftMap sm ON sm.old_id = sa.shift_id
        WHERE  NOT EXISTS (SELECT 1 FROM @asgMap a WHERE a.old_id = sa.id)
    );

    INSERT INTO dbo.shift_rendezvous_points
        (schedule_assignment_id, description, address, latitude, longitude,
         floor_number, photo_blob_name, created_by, updated_by)
    SELECT am.new_id, rp.description, rp.address, rp.latitude, rp.longitude,
           rp.floor_number, rp.photo_blob_name, rp.created_by, @startedBy
    FROM   dbo.shift_rendezvous_points rp
    JOIN   @asgMap am ON am.old_id = rp.schedule_assignment_id;
    SET @rendezvousCopied = @@ROWCOUNT;

    IF @oldLast IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM dbo.shift_alert_schedules WHERE year = @toYear)
    BEGIN
        INSERT INTO dbo.shift_alert_schedules
            (year, name, fire_date, fire_time_utc, alert_category, departments,
             include_null_dept, message_override, active, created_by)
        SELECT @toYear, name,
               DATEADD(DAY, DATEDIFF(DAY, @oldLast, @newLast), fire_date),
               fire_time_utc, alert_category, departments,
               include_null_dept, message_override, active, created_by
        FROM   dbo.shift_alert_schedules
        WHERE  year = @fromYear;
        SET @alertSchedulesCopied = @@ROWCOUNT;
    END
END

-- ── 7. Signs back to planned ───────────────────────────────────────
DECLARE @signsReset INT = 0;
IF @resetSigns = 1
BEGIN
    UPDATE dbo.sign_attachments
    SET    status = 'planned', installed_by = NULL, installed_at = NULL, removed_at = NULL
    WHERE  status <> 'planned';
    SET @signsReset = @@ROWCOUNT;
END

COMMIT TRANSACTION;

SELECT
    @volunteersSnapshotted                                    AS volunteersSnapshotted,
    @volunteersReset                                          AS volunteersReset,
    @daysCreated                                              AS daysCreated,
    (SELECT COUNT(*) FROM @newDays WHERE existed = 1)         AS daysAlreadyExisted,
    (SELECT COUNT(DISTINCT se.convention_day_id)
       FROM @sessMap m JOIN dbo.sessions se ON se.id = m.new_id) AS daysWithStructure,
    IIF(@carryLocations = 1 AND @locationsSkipped = 0,
        (SELECT COUNT(*) FROM @locMap), 0)                    AS locationsCopied,
    CAST(IIF(@carryLocations = 1, @locationsSkipped, 0) AS BIT) AS locationsSkipped,
    (SELECT COUNT(*) FROM @subMap)                            AS subLocationsCopied,
    @capacityRulesCopied                                      AS capacityRulesCopied,
    (SELECT COUNT(*) FROM @sessMap)                           AS sessionsCopied,
    (SELECT COUNT(*) FROM @shiftMap)                          AS shiftsCopied,
    (SELECT COUNT(*) FROM @asgMap)                            AS assignmentsCopied,
    @assignmentsSkipped                                       AS assignmentsSkipped,
    @rendezvousCopied                                         AS rendezvousCopied,
    @alertSchedulesCopied                                     AS alertSchedulesCopied,
    @signsReset                                               AS signsReset;
-- ── Grid 2: days that would be created ────────────────────────────
SELECT nd.convention_date AS new_date, DATENAME(WEEKDAY, nd.convention_date) AS weekday,
       nd.label AS new_label, src.convention_date AS copies_from, src.label AS from_label,
       (SELECT COUNT(*) FROM dbo.sessions se WHERE se.convention_day_id = nd.id) AS sessions
FROM   dbo.convention_days nd
LEFT JOIN dbo.convention_days src
       ON src.year = @fromYear
      AND DATEDIFF(DAY, src.convention_date, (SELECT MAX(convention_date) FROM dbo.convention_days WHERE year = @fromYear))
        = DATEDIFF(DAY, nd.convention_date,  (SELECT MAX(convention_date) FROM dbo.convention_days WHERE year = @toYear))
WHERE  nd.year = @toYear
ORDER  BY nd.convention_date;

-- ── Grid 3: sanity checks (all should be 0) ───────────────────────
SELECT
    (SELECT COUNT(*) FROM dbo.schedule_assignments sa
       JOIN dbo.shifts sh ON sh.id = sa.shift_id
       JOIN dbo.sessions se ON se.id = sh.session_id
       JOIN dbo.convention_days cd ON cd.id = se.convention_day_id
       JOIN dbo.locations_tasks lt ON lt.id = sa.location_task_id
      WHERE cd.year = @toYear AND lt.year <> @toYear)            AS assignments_pointing_at_old_year,
    (SELECT COUNT(*) FROM dbo.capacity_alert_rules r
       JOIN dbo.locations_tasks lt ON lt.id = r.location_task_id
       LEFT JOIN dbo.location_sub_locations sl ON sl.id = r.sub_location_id
      WHERE lt.year = @toYear AND sl.id IS NOT NULL AND sl.location_task_id <> lt.id)
                                                                  AS rules_with_mismatched_sub_location,
    (SELECT COUNT(*) FROM dbo.convention_years WHERE status = 'active') - 1
                                                                  AS extra_active_years,
    (SELECT COUNT(*) FROM dbo.volunteer_in WHERE ISNULL(active_current_year, 0) <> 0)
                                                                  AS volunteers_still_active;

ROLLBACK TRANSACTION;

-- ── Grid 4: confirm nothing was kept ──────────────────────────────
SELECT @@TRANCOUNT AS open_transactions,
       (SELECT status FROM dbo.convention_years WHERE year = @fromYear) AS status_2026_should_be_active,
       (SELECT COUNT(*) FROM dbo.convention_years WHERE year = @toYear) AS rows_2027_should_be_0;
