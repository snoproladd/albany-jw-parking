-- =============================================================================
-- migration_E_demo.sql
-- =============================================================================
-- Mirrors Migration E (scheduler_categories refactor) for the demo schema.
-- Creates demo.scheduler_categories, demo.scheduler_category_access, adds
-- category_id to demo.shifts, and backfills category assignments from the
-- existing department / event_type_id columns.
--
-- Run against albanyregional3.
-- Safe to re-run — all changes guarded with IF NOT EXISTS checks.
-- =============================================================================
PRINT '=== migration_E_demo.sql — start ===';
GO

-- ─── 1. demo.scheduler_categories (create + seed) ────────────────────────────
IF NOT EXISTS (
    SELECT 1
    FROM   sys.tables  t
    JOIN   sys.schemas s ON s.schema_id = t.schema_id
    WHERE  t.name = 'scheduler_categories' AND s.name = 'demo'
)
BEGIN
    CREATE TABLE demo.scheduler_categories (
        id           INT           IDENTITY(1,1) NOT NULL,
        dept_key     NVARCHAR(50)  NOT NULL,
        name         NVARCHAR(100) NOT NULL,
        color        NVARCHAR(7)   NULL,
        is_sensitive BIT           NOT NULL CONSTRAINT df_demo_sc_is_sensitive DEFAULT (0),
        active       BIT           NOT NULL CONSTRAINT df_demo_sc_active       DEFAULT (1),
        sort_order   INT           NOT NULL CONSTRAINT df_demo_sc_sort_order   DEFAULT (0),
        created_at   DATETIME      NOT NULL CONSTRAINT df_demo_sc_created_at   DEFAULT (getdate()),
        CONSTRAINT pk_demo_scheduler_categories     PRIMARY KEY CLUSTERED (id),
        CONSTRAINT uq_demo_scheduler_categories_key UNIQUE (dept_key)
    );

    SET IDENTITY_INSERT demo.scheduler_categories ON;
    INSERT INTO demo.scheduler_categories
        (id, dept_key,           name,                color,     is_sensitive, active, sort_order)
    VALUES
        (1,  'lots_and_garages', 'Lots and Garages',  '#198754', 0, 1, 1),
        (2,  'signs',            'Signs',             '#0d6efd', 0, 1, 2),
        (3,  'security',         'Security',          '#dc3545', 0, 1, 3),
        (4,  'dropoff_pickup',   'Drop-off / Pickup', '#fd7e14', 0, 1, 4),
        (5,  'mobile_support',   'Mobile Support',    '#0dcaf0', 0, 1, 5),
        (6,  'desk',             'Information Desk',  '#6610f2', 0, 1, 6),
        (7,  'count',            'Count',             '#20c997', 0, 1, 7),
        (8,  'support',          'Support',           '#ffc107', 1, 1, 8);
    SET IDENTITY_INSERT demo.scheduler_categories OFF;

    -- Ensure IDENTITY seed advances past inserted rows on next auto-insert.
    DBCC CHECKIDENT ('demo.scheduler_categories', RESEED);

    PRINT 'Created and seeded demo.scheduler_categories (8 rows).';
END
ELSE PRINT 'demo.scheduler_categories already exists — skipped.';
GO

-- ─── 2. demo.scheduler_category_access ───────────────────────────────────────
IF NOT EXISTS (
    SELECT 1
    FROM   sys.tables  t
    JOIN   sys.schemas s ON s.schema_id = t.schema_id
    WHERE  t.name = 'scheduler_category_access' AND s.name = 'demo'
)
BEGIN
    CREATE TABLE demo.scheduler_category_access (
        volunteer_id INT      NOT NULL,
        category_id  INT      NOT NULL,
        granted_by   INT      NOT NULL,
        granted_at   DATETIME NOT NULL CONSTRAINT df_demo_sca_granted_at DEFAULT (getdate()),
        CONSTRAINT pk_demo_scheduler_category_access
            PRIMARY KEY CLUSTERED (volunteer_id, category_id),
        CONSTRAINT FK_demo_sca_volunteer
            FOREIGN KEY (volunteer_id) REFERENCES demo.volunteer_in (id) ON DELETE CASCADE,
        CONSTRAINT FK_demo_sca_category
            FOREIGN KEY (category_id)  REFERENCES demo.scheduler_categories (id) ON DELETE CASCADE,
        CONSTRAINT FK_demo_sca_granted_by
            FOREIGN KEY (granted_by)   REFERENCES demo.volunteer_in (id)
    );
    PRINT 'Created demo.scheduler_category_access.';
END
ELSE PRINT 'demo.scheduler_category_access already exists — skipped.';
GO

-- ─── 3. Add category_id column to demo.shifts ────────────────────────────────
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE  object_id = OBJECT_ID('demo.shifts') AND name = 'category_id'
)
BEGIN
    ALTER TABLE demo.shifts ADD category_id INT NULL;
    PRINT 'Added category_id to demo.shifts.';
END
ELSE PRINT 'demo.shifts.category_id already exists — skipped.';
GO

-- ─── 4. FK: demo.shifts.category_id → demo.scheduler_categories ──────────────
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE  name             = 'FK_shifts_scheduler_category'
      AND  parent_object_id = OBJECT_ID('demo.shifts')
)
BEGIN
    ALTER TABLE demo.shifts
        ADD CONSTRAINT FK_shifts_scheduler_category
        FOREIGN KEY (category_id) REFERENCES demo.scheduler_categories (id);
    PRINT 'Added FK_shifts_scheduler_category on demo.shifts.';
END
ELSE PRINT 'FK_shifts_scheduler_category on demo.shifts already exists — skipped.';
GO

-- ─── 5. Backfill demo.shifts.category_id ─────────────────────────────────────
--
-- Pass A: shifts where the department string is already set.
--         Direct dept_key match — covers the majority of rows.
UPDATE sh
SET    sh.category_id = sc.id
FROM   demo.shifts sh
JOIN   demo.scheduler_categories sc ON sc.dept_key = sh.department
WHERE  sh.department  IS NOT NULL
  AND  sh.category_id IS NULL;
PRINT CONCAT('Backfill pass A (department → dept_key direct match): ', @@ROWCOUNT, ' rows updated.');
GO

-- Pass B: NULL-department, non-meeting shifts.
--         Derives the event_type_id → dept_key mapping at runtime from sibling
--         rows that carry both event_type_id and department, so no IDs are
--         hardcoded here.
UPDATE sh
SET    sh.category_id = sc.id
FROM   demo.shifts sh
JOIN (
    SELECT DISTINCT s2.event_type_id, s2.department
    FROM   demo.shifts s2
    WHERE  s2.department    IS NOT NULL
      AND  s2.event_type_id IS NOT NULL
      AND  s2.is_meeting    = 0
) mapping ON mapping.event_type_id = sh.event_type_id
JOIN   demo.scheduler_categories sc ON sc.dept_key = mapping.department
WHERE  sh.department    IS NULL
  AND  sh.is_meeting    = 0
  AND  sh.category_id   IS NULL;
PRINT CONCAT('Backfill pass B (NULL-dept, event_type_id → dept_key mapping): ', @@ROWCOUNT, ' rows updated.');
GO

-- Meeting shifts (is_meeting = 1) intentionally retain category_id = NULL.
-- No action required for pass C.

-- ─── 6. Verify ───────────────────────────────────────────────────────────────
SELECT 'scheduler_categories rows'                  AS check_name, COUNT(*) AS n
FROM   demo.scheduler_categories
UNION ALL
SELECT 'scheduler_category_access rows',            COUNT(*) FROM demo.scheduler_category_access
UNION ALL
SELECT 'shifts: category_id populated',             COUNT(*) FROM demo.shifts WHERE category_id IS NOT NULL
UNION ALL
SELECT 'shifts: category_id NULL (meetings only)',  COUNT(*) FROM demo.shifts WHERE category_id IS NULL;
GO

SELECT
    sh.id,
    sh.label,
    sh.is_meeting,
    sh.department,
    sh.event_type_id,
    sh.category_id,
    sc.dept_key,
    sc.name AS category_name
FROM   demo.shifts sh
LEFT   JOIN demo.scheduler_categories sc ON sc.id = sh.category_id
ORDER  BY sh.is_meeting DESC, sc.sort_order, sh.id;
GO

PRINT '=== migration_E_demo.sql — complete ===';
GO