-- guard_lookup_check.sql  (read-only — changes nothing)
-- Checks getMinYearForRefs() (Phase 5): takes the newest id of each kind
-- of record, resolves each to its convention year with the guard's SQL,
-- and lists the result per kind. Expect one row per kind that has data,
-- each showing a sensible year (2026 for most), and no errors.

DECLARE @refs NVARCHAR(MAX) = (
    SELECT k, id FROM (
        SELECT 'year' AS k, 2026 AS id
        UNION ALL SELECT 'day',           (SELECT MAX(id) FROM dbo.convention_days)
        UNION ALL SELECT 'session',       (SELECT MAX(id) FROM dbo.sessions)
        UNION ALL SELECT 'shift',         (SELECT MAX(id) FROM dbo.shifts)
        UNION ALL SELECT 'assignment',    (SELECT MAX(id) FROM dbo.schedule_assignments)
        UNION ALL SELECT 'location',      (SELECT MAX(id) FROM dbo.locations_tasks)
        UNION ALL SELECT 'subLocation',   (SELECT MAX(id) FROM dbo.location_sub_locations)
        UNION ALL SELECT 'capacityRule',  (SELECT MAX(id) FROM dbo.capacity_alert_rules)
        UNION ALL SELECT 'rendezvous',    (SELECT MAX(id) FROM dbo.shift_rendezvous_points)
        UNION ALL SELECT 'alertSchedule', (SELECT MAX(id) FROM dbo.shift_alert_schedules)
        UNION ALL SELECT 'slot',          (SELECT MAX(id) FROM dbo.shift_slot_assignments)
        UNION ALL SELECT 'blackout',      (SELECT MAX(id) FROM dbo.volunteer_blackouts)
        UNION ALL SELECT 'batch',         (SELECT MAX(id) FROM dbo.invitation_batches)
        UNION ALL SELECT 'invitation',    (SELECT MAX(id) FROM dbo.invitations)
        UNION ALL SELECT 'meeting',       (SELECT MAX(id) FROM dbo.campaign_meetings)
        UNION ALL SELECT 'lesson',        (SELECT MAX(id) FROM dbo.lessons_learned)
    ) x
    WHERE id IS NOT NULL
    FOR JSON PATH
);

WITH r AS (
    SELECT k, id
    FROM   OPENJSON(@refs) WITH (k NVARCHAR(20) '$.k', id INT '$.id')
)
SELECT k, MIN(y) AS resolved_year, COUNT(*) AS rows_found
FROM (
    SELECT r.k, r.id AS y
      FROM r WHERE r.k = 'year'
    UNION ALL
    SELECT r.k, cd.year FROM r
      JOIN dbo.convention_days cd ON cd.id = r.id
     WHERE r.k = 'day'
    UNION ALL
    SELECT r.k, cd.year FROM r
      JOIN dbo.sessions se        ON se.id = r.id
      JOIN dbo.convention_days cd ON cd.id = se.convention_day_id
     WHERE r.k = 'session'
    UNION ALL
    SELECT r.k, cd.year FROM r
      JOIN dbo.shifts sh          ON sh.id = r.id
      JOIN dbo.sessions se        ON se.id = sh.session_id
      JOIN dbo.convention_days cd ON cd.id = se.convention_day_id
     WHERE r.k = 'shift'
    UNION ALL
    SELECT r.k, cd.year FROM r
      JOIN dbo.schedule_assignments sa ON sa.id = r.id
      JOIN dbo.shifts sh               ON sh.id = sa.shift_id
      JOIN dbo.sessions se             ON se.id = sh.session_id
      JOIN dbo.convention_days cd      ON cd.id = se.convention_day_id
     WHERE r.k = 'assignment'
    UNION ALL
    SELECT r.k, lt.year FROM r
      JOIN dbo.locations_tasks lt ON lt.id = r.id
     WHERE r.k = 'location'
    UNION ALL
    SELECT r.k, lt.year FROM r
      JOIN dbo.location_sub_locations sl ON sl.id = r.id
      JOIN dbo.locations_tasks lt        ON lt.id = sl.location_task_id
     WHERE r.k = 'subLocation'
    UNION ALL
    SELECT r.k, lt.year FROM r
      JOIN dbo.capacity_alert_rules car ON car.id = r.id
      JOIN dbo.locations_tasks lt       ON lt.id = car.location_task_id
     WHERE r.k = 'capacityRule'
    UNION ALL
    SELECT r.k, cd.year FROM r
      JOIN dbo.shift_rendezvous_points rp ON rp.id = r.id
      JOIN dbo.schedule_assignments sa    ON sa.id = rp.schedule_assignment_id
      JOIN dbo.shifts sh                  ON sh.id = sa.shift_id
      JOIN dbo.sessions se                ON se.id = sh.session_id
      JOIN dbo.convention_days cd         ON cd.id = se.convention_day_id
     WHERE r.k = 'rendezvous'
    UNION ALL
    SELECT r.k, sas.year FROM r
      JOIN dbo.shift_alert_schedules sas ON sas.id = r.id
     WHERE r.k = 'alertSchedule'
    UNION ALL
    SELECT r.k, cd.year FROM r
      JOIN dbo.shift_slot_assignments ssa ON ssa.id = r.id
      JOIN dbo.convention_days cd         ON cd.id = ssa.convention_day_id
     WHERE r.k = 'slot'
    UNION ALL
    SELECT r.k, cd.year FROM r
      JOIN dbo.volunteer_blackouts vb ON vb.id = r.id
      JOIN dbo.convention_days cd     ON cd.id = vb.convention_day_id
     WHERE r.k = 'blackout'
    UNION ALL
    SELECT r.k, ib.year FROM r
      JOIN dbo.invitation_batches ib ON ib.id = r.id
     WHERE r.k = 'batch'
    UNION ALL
    SELECT r.k, COALESCE(ib.year, cd.year) FROM r
      JOIN dbo.invitations i ON i.id = r.id
      LEFT JOIN dbo.invitation_batches ib ON ib.id = i.batch_id
      LEFT JOIN dbo.convention_days cd    ON cd.id = i.convention_day_id
     WHERE r.k = 'invitation'
    UNION ALL
    SELECT r.k, cm.year FROM r
      JOIN dbo.campaign_meetings cm ON cm.id = r.id
     WHERE r.k = 'meeting'
    UNION ALL
    SELECT r.k, ll.year FROM r
      JOIN dbo.lessons_learned ll ON ll.id = r.id
     WHERE r.k = 'lesson'
) t(k, y)
GROUP BY k ORDER BY k;
