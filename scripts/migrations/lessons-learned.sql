-- ============================================================
-- Migration: lessons-learned.sql
-- Feature:   Lessons Learned — KEYMAN+ submission, OVERSEER+
--            approval / publish workflow, photo attachments,
--            and year-level PDF report generation.
--
-- New tables:
--   dbo.lessons_learned          Main lesson records
--   dbo.lessons_learned_photos   Photo attachments per lesson
--   dbo.lessons_learned_reports  Published PDF metadata per year
--
-- New seeds in dbo.system_variable_lists (category = 'lesson-department'):
--   Parking Operations, Volunteer Management, Crew Assignments,
--   Signs & Navigation, Scheduling, Attendance & Check-in,
--   Equipment & Supplies, Safety & Security, Communications
--
-- Targets both dbo and demo schemas.  GO separates batches.
-- ============================================================

-- ============================================================
-- dbo schema
-- ============================================================

-- ── lessons_learned ──────────────────────────────────────────
IF NOT EXISTS (
    SELECT 1 FROM sys.tables
    WHERE object_id = OBJECT_ID(N'dbo.lessons_learned')
)
BEGIN
    CREATE TABLE dbo.lessons_learned (
        id                INT            IDENTITY(1,1)  NOT NULL
                                         CONSTRAINT PK_lessons_learned PRIMARY KEY,
        year              INT            NOT NULL,
        department_id     INT            NULL
                                         CONSTRAINT FK_ll_dept
                                         REFERENCES dbo.system_variable_lists(id),
        department_other  NVARCHAR(100)  NULL,
        notes             NVARCHAR(MAX)  NOT NULL,
        overseer_comments NVARCHAR(MAX)  NULL,
        submitted_by      INT            NOT NULL
                                         CONSTRAINT FK_ll_submitted_by
                                         REFERENCES dbo.volunteer_in(id),
        submitted_at      DATETIME2(0)   NOT NULL
                                         CONSTRAINT DF_ll_submitted_at
                                         DEFAULT SYSUTCDATETIME(),
        status            NVARCHAR(20)   NOT NULL
                                         CONSTRAINT DF_ll_status  DEFAULT N'submitted'
                                         CONSTRAINT CHK_ll_status
                                         CHECK (status IN (N'submitted', N'approved', N'published')),
        approved_by       INT            NULL
                                         CONSTRAINT FK_ll_approved_by
                                         REFERENCES dbo.volunteer_in(id),
        approved_at       DATETIME2(0)   NULL,
        published_by      INT            NULL
                                         CONSTRAINT FK_ll_published_by
                                         REFERENCES dbo.volunteer_in(id),
        published_at      DATETIME2(0)   NULL
    );
END;
GO

-- ── lessons_learned_photos ────────────────────────────────────
IF NOT EXISTS (
    SELECT 1 FROM sys.tables
    WHERE object_id = OBJECT_ID(N'dbo.lessons_learned_photos')
)
BEGIN
    CREATE TABLE dbo.lessons_learned_photos (
        id                INT            IDENTITY(1,1)  NOT NULL
                                         CONSTRAINT PK_ll_photos PRIMARY KEY,
        lesson_id         INT            NOT NULL
                                         CONSTRAINT FK_llp_lesson
                                         REFERENCES dbo.lessons_learned(id)
                                         ON DELETE CASCADE,
        blob_name         NVARCHAR(500)  NOT NULL,
        original_filename NVARCHAR(260)  NOT NULL,
        uploaded_by       INT            NOT NULL
                                         CONSTRAINT FK_llp_uploaded_by
                                         REFERENCES dbo.volunteer_in(id),
        uploaded_at       DATETIME2(0)   NOT NULL
                                         CONSTRAINT DF_llp_uploaded_at
                                         DEFAULT SYSUTCDATETIME()
    );
END;
GO

-- ── lessons_learned_reports ───────────────────────────────────
IF NOT EXISTS (
    SELECT 1 FROM sys.tables
    WHERE object_id = OBJECT_ID(N'dbo.lessons_learned_reports')
)
BEGIN
    CREATE TABLE dbo.lessons_learned_reports (
        year              INT            NOT NULL
                                         CONSTRAINT PK_ll_reports PRIMARY KEY,
        blob_name         NVARCHAR(500)  NOT NULL,
        share_url         NVARCHAR(2000) NOT NULL,
        published_by      INT            NOT NULL
                                         CONSTRAINT FK_llr_published_by
                                         REFERENCES dbo.volunteer_in(id),
        published_at      DATETIME2(0)   NOT NULL
                                         CONSTRAINT DF_llr_published_at
                                         DEFAULT SYSUTCDATETIME()
    );
END;
GO

-- ── Seed lesson-department vocabulary (dbo) ───────────────────
IF NOT EXISTS (
    SELECT 1 FROM dbo.system_variable_lists
    WHERE category = N'lesson-department'
)
BEGIN
    INSERT INTO dbo.system_variable_lists (category, display_name, parent_id, display_order)
    VALUES
        (N'lesson-department', N'Parking Operations',    NULL, 10),
        (N'lesson-department', N'Volunteer Management',  NULL, 20),
        (N'lesson-department', N'Crew Assignments',      NULL, 30),
        (N'lesson-department', N'Signs & Navigation',    NULL, 40),
        (N'lesson-department', N'Scheduling',            NULL, 50),
        (N'lesson-department', N'Attendance & Check-in', NULL, 60),
        (N'lesson-department', N'Equipment & Supplies',  NULL, 70),
        (N'lesson-department', N'Safety & Security',     NULL, 80),
        (N'lesson-department', N'Communications',        NULL, 90);
END;
GO

-- ============================================================
-- demo schema
-- ============================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.tables
    WHERE object_id = OBJECT_ID(N'demo.lessons_learned')
)
BEGIN
    CREATE TABLE demo.lessons_learned (
        id                INT            IDENTITY(1,1)  NOT NULL
                                         CONSTRAINT PK_demo_lessons_learned PRIMARY KEY,
        year              INT            NOT NULL,
        department_id     INT            NULL
                                         CONSTRAINT FK_demo_ll_dept
                                         REFERENCES demo.system_variable_lists(id),
        department_other  NVARCHAR(100)  NULL,
        notes             NVARCHAR(MAX)  NOT NULL,
        overseer_comments NVARCHAR(MAX)  NULL,
        submitted_by      INT            NOT NULL
                                         CONSTRAINT FK_demo_ll_submitted_by
                                         REFERENCES demo.volunteer_in(id),
        submitted_at      DATETIME2(0)   NOT NULL
                                         CONSTRAINT DF_demo_ll_submitted_at
                                         DEFAULT SYSUTCDATETIME(),
        status            NVARCHAR(20)   NOT NULL
                                         CONSTRAINT DF_demo_ll_status  DEFAULT N'submitted'
                                         CONSTRAINT CHK_demo_ll_status
                                         CHECK (status IN (N'submitted', N'approved', N'published')),
        approved_by       INT            NULL
                                         CONSTRAINT FK_demo_ll_approved_by
                                         REFERENCES demo.volunteer_in(id),
        approved_at       DATETIME2(0)   NULL,
        published_by      INT            NULL
                                         CONSTRAINT FK_demo_ll_published_by
                                         REFERENCES demo.volunteer_in(id),
        published_at      DATETIME2(0)   NULL
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.tables
    WHERE object_id = OBJECT_ID(N'demo.lessons_learned_photos')
)
BEGIN
    CREATE TABLE demo.lessons_learned_photos (
        id                INT            IDENTITY(1,1)  NOT NULL
                                         CONSTRAINT PK_demo_ll_photos PRIMARY KEY,
        lesson_id         INT            NOT NULL
                                         CONSTRAINT FK_demo_llp_lesson
                                         REFERENCES demo.lessons_learned(id)
                                         ON DELETE CASCADE,
        blob_name         NVARCHAR(500)  NOT NULL,
        original_filename NVARCHAR(260)  NOT NULL,
        uploaded_by       INT            NOT NULL
                                         CONSTRAINT FK_demo_llp_uploaded_by
                                         REFERENCES demo.volunteer_in(id),
        uploaded_at       DATETIME2(0)   NOT NULL
                                         CONSTRAINT DF_demo_llp_uploaded_at
                                         DEFAULT SYSUTCDATETIME()
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.tables
    WHERE object_id = OBJECT_ID(N'demo.lessons_learned_reports')
)
BEGIN
    CREATE TABLE demo.lessons_learned_reports (
        year              INT            NOT NULL
                                         CONSTRAINT PK_demo_ll_reports PRIMARY KEY,
        blob_name         NVARCHAR(500)  NOT NULL,
        share_url         NVARCHAR(2000) NOT NULL,
        published_by      INT            NOT NULL
                                         CONSTRAINT FK_demo_llr_published_by
                                         REFERENCES demo.volunteer_in(id),
        published_at      DATETIME2(0)   NOT NULL
                                         CONSTRAINT DF_demo_llr_published_at
                                         DEFAULT SYSUTCDATETIME()
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM demo.system_variable_lists
    WHERE category = N'lesson-department'
)
BEGIN
    INSERT INTO demo.system_variable_lists (category, display_name, parent_id, display_order)
    VALUES
        (N'lesson-department', N'Parking Operations',    NULL, 10),
        (N'lesson-department', N'Volunteer Management',  NULL, 20),
        (N'lesson-department', N'Crew Assignments',      NULL, 30),
        (N'lesson-department', N'Signs & Navigation',    NULL, 40),
        (N'lesson-department', N'Scheduling',            NULL, 50),
        (N'lesson-department', N'Attendance & Check-in', NULL, 60),
        (N'lesson-department', N'Equipment & Supplies',  NULL, 70),
        (N'lesson-department', N'Safety & Security',     NULL, 80),
        (N'lesson-department', N'Communications',        NULL, 90);
END;
GO
