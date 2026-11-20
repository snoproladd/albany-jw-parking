-- =============================================================================
-- volunteer_notes.sql   (multi-department phase 2a, migration 2 of 4)
-- =============================================================================
-- Intake notes become department-specific. Creates volunteer_notes (one row
-- per person per department) and copies today's volunteer_in.notes and
-- note_dismissed* fields into department 1 (Parking), in both the dbo and
-- demo schemas. Also completes the old "volunteer_notes table refactor" TODO.
--
-- COPY FIRST, MOVE LATER: volunteer_in.notes and note_dismissed* stay where
-- they are and the app keeps reading them until phase 2b switches the code;
-- department_cleanup.sql (migration 4) drops them afterwards. Column names and
-- the note_dismissed_at type (DATETIME) match volunteer_in so the switch is
-- mechanical.
--
-- Only volunteers with a non-empty note or a dismissal get a row.
-- note_dismissed_by has no foreign key (as today); one would block deleting a
-- person who once dismissed a note.
--
-- LOCAL ONLY (albanyregional3_local). Never run against albanyregional3.
-- Safe to re-run: every step is guarded; the backfill skips existing rows.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. dbo.volunteer_notes
-- -----------------------------------------------------------------------------
IF OBJECT_ID('dbo.volunteer_notes', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.volunteer_notes (
        volunteer_id       INT             NOT NULL,
        department_id      INT             NOT NULL,
        note               NVARCHAR(2048)  NULL,
        note_dismissed     BIT             NOT NULL CONSTRAINT df_vn_note_dismissed DEFAULT (0),
        note_dismissed_at  DATETIME        NULL,
        note_dismissed_by  INT             NULL,
        updated_at         DATETIME2(7)    NOT NULL CONSTRAINT df_vn_updated_at DEFAULT (sysutcdatetime()),
        CONSTRAINT PK_volunteer_notes PRIMARY KEY CLUSTERED (volunteer_id, department_id),
        CONSTRAINT FK_vn_volunteer FOREIGN KEY (volunteer_id) REFERENCES dbo.volunteer_in (id) ON DELETE CASCADE,
        CONSTRAINT FK_vn_department FOREIGN KEY (department_id) REFERENCES dbo.departments (id)
    );

    CREATE INDEX IX_dbo_vn_department ON dbo.volunteer_notes (department_id)
        INCLUDE (note_dismissed);

    PRINT 'Created dbo.volunteer_notes.';
END
ELSE
    PRINT 'dbo.volunteer_notes already exists — skipped.';
GO

-- -----------------------------------------------------------------------------
-- 2. Backfill dbo: copy intake notes into department 1
-- -----------------------------------------------------------------------------
INSERT INTO dbo.volunteer_notes (
    volunteer_id, department_id, note, note_dismissed, note_dismissed_at, note_dismissed_by, updated_at
)
SELECT v.id, 1, v.notes, ISNULL(v.note_dismissed, 0), v.note_dismissed_at, v.note_dismissed_by,
       COALESCE(v.last_updated, sysutcdatetime())
FROM dbo.volunteer_in v
WHERE (NULLIF(LTRIM(RTRIM(v.notes)), '') IS NOT NULL OR v.note_dismissed = 1)
  AND NOT EXISTS (SELECT 1 FROM dbo.volunteer_notes n
                  WHERE n.volunteer_id = v.id AND n.department_id = 1);

PRINT CONCAT('dbo: copied ', @@ROWCOUNT, ' intake notes into department 1.');
GO

-- -----------------------------------------------------------------------------
-- 3. demo.volunteer_notes
-- -----------------------------------------------------------------------------
IF OBJECT_ID('demo.volunteer_notes', 'U') IS NULL
BEGIN
    CREATE TABLE demo.volunteer_notes (
        volunteer_id       INT             NOT NULL,
        department_id      INT             NOT NULL,
        note               NVARCHAR(2048)  NULL,
        note_dismissed     BIT             NOT NULL CONSTRAINT df_vn_note_dismissed DEFAULT (0),
        note_dismissed_at  DATETIME        NULL,
        note_dismissed_by  INT             NULL,
        updated_at         DATETIME2(7)    NOT NULL CONSTRAINT df_vn_updated_at DEFAULT (sysutcdatetime()),
        CONSTRAINT PK_volunteer_notes PRIMARY KEY CLUSTERED (volunteer_id, department_id),
        CONSTRAINT FK_vn_volunteer FOREIGN KEY (volunteer_id) REFERENCES demo.volunteer_in (id) ON DELETE CASCADE,
        CONSTRAINT FK_vn_department FOREIGN KEY (department_id) REFERENCES demo.departments (id)
    );

    CREATE INDEX IX_demo_vn_department ON demo.volunteer_notes (department_id)
        INCLUDE (note_dismissed);

    PRINT 'Created demo.volunteer_notes.';
END
ELSE
    PRINT 'demo.volunteer_notes already exists — skipped.';
GO

-- -----------------------------------------------------------------------------
-- 4. Backfill demo: copy intake notes into department 1
-- -----------------------------------------------------------------------------
INSERT INTO demo.volunteer_notes (
    volunteer_id, department_id, note, note_dismissed, note_dismissed_at, note_dismissed_by, updated_at
)
SELECT v.id, 1, v.notes, ISNULL(v.note_dismissed, 0), v.note_dismissed_at, v.note_dismissed_by,
       COALESCE(v.last_updated, sysutcdatetime())
FROM demo.volunteer_in v
WHERE (NULLIF(LTRIM(RTRIM(v.notes)), '') IS NOT NULL OR v.note_dismissed = 1)
  AND NOT EXISTS (SELECT 1 FROM demo.volunteer_notes n
                  WHERE n.volunteer_id = v.id AND n.department_id = 1);

PRINT CONCAT('demo: copied ', @@ROWCOUNT, ' intake notes into department 1.');
GO

-- -----------------------------------------------------------------------------
-- 5. Verify: expected_rows = dept1_rows and mismatches = 0
-- -----------------------------------------------------------------------------
SELECT 'dbo' AS schema_name,
       (SELECT COUNT(*) FROM dbo.volunteer_in
         WHERE NULLIF(LTRIM(RTRIM(notes)), '') IS NOT NULL OR note_dismissed = 1) AS expected_rows,
       (SELECT COUNT(*) FROM dbo.volunteer_notes WHERE department_id = 1) AS dept1_rows,
       (SELECT COUNT(*) FROM dbo.volunteer_in v
         JOIN dbo.volunteer_notes n ON n.volunteer_id = v.id AND n.department_id = 1
         WHERE ISNULL(CAST(v.notes AS NVARCHAR(2048)), N'') <> ISNULL(n.note, N'')
            OR ISNULL(v.note_dismissed, 0) <> n.note_dismissed
            OR ISNULL(v.note_dismissed_by, -1) <> ISNULL(n.note_dismissed_by, -1)) AS mismatches
UNION ALL
SELECT 'demo' AS schema_name,
       (SELECT COUNT(*) FROM demo.volunteer_in
         WHERE NULLIF(LTRIM(RTRIM(notes)), '') IS NOT NULL OR note_dismissed = 1) AS expected_rows,
       (SELECT COUNT(*) FROM demo.volunteer_notes WHERE department_id = 1) AS dept1_rows,
       (SELECT COUNT(*) FROM demo.volunteer_in v
         JOIN demo.volunteer_notes n ON n.volunteer_id = v.id AND n.department_id = 1
         WHERE ISNULL(CAST(v.notes AS NVARCHAR(2048)), N'') <> ISNULL(n.note, N'')
            OR ISNULL(v.note_dismissed, 0) <> n.note_dismissed
            OR ISNULL(v.note_dismissed_by, -1) <> ISNULL(n.note_dismissed_by, -1)) AS mismatches;
GO

PRINT '=== volunteer_notes.sql complete ===';
GO
