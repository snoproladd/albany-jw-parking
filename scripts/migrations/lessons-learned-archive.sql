-- ============================================================
-- Migration: lessons-learned-archive.sql
-- Feature:   Archive column for lessons_learned.
--
-- Adds archived, archived_by, and archived_at to both schemas.
-- A separate flag (not a status value) so the lesson's
-- submitted/approved/published state is preserved on archive
-- and restored cleanly on unarchive.
-- ============================================================

-- ── dbo schema ───────────────────────────────────────────────

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.lessons_learned')
      AND name = N'archived'
)
BEGIN
    ALTER TABLE dbo.lessons_learned
        ADD archived    BIT        NOT NULL CONSTRAINT DF_ll_archived    DEFAULT 0,
            archived_by INT        NULL
                CONSTRAINT FK_ll_archived_by
                REFERENCES dbo.volunteer_in(id),
            archived_at DATETIME2(0) NULL;
END;
GO

-- ── demo schema ──────────────────────────────────────────────

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'demo.lessons_learned')
      AND name = N'archived'
)
BEGIN
    ALTER TABLE demo.lessons_learned
        ADD archived    BIT        NOT NULL CONSTRAINT DF_demo_ll_archived    DEFAULT 0,
            archived_by INT        NULL
                CONSTRAINT FK_demo_ll_archived_by
                REFERENCES demo.volunteer_in(id),
            archived_at DATETIME2(0) NULL;
END;
GO
