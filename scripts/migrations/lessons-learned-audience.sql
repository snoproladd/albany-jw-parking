-- ============================================================
-- Migration: lessons-learned-audience.sql
-- Feature:   Audience flags for lessons_learned.
--
-- is_internal  → internal to the department
-- is_committee → submitted to the committee alongside the
--                following year's operating plan
--
-- A lesson may be either or both, never neither — enforced by
-- CK_ll_audience so no code path can produce an unroutable
-- lesson. Existing rows default to internal.
-- ============================================================

-- ── dbo schema ───────────────────────────────────────────────

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.lessons_learned')
      AND name = N'is_internal'
)
BEGIN
    ALTER TABLE dbo.lessons_learned
        ADD is_internal  BIT NOT NULL CONSTRAINT DF_ll_is_internal  DEFAULT 1,
            is_committee BIT NOT NULL CONSTRAINT DF_ll_is_committee DEFAULT 0;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_ll_audience'
      AND parent_object_id = OBJECT_ID(N'dbo.lessons_learned')
)
BEGIN
    ALTER TABLE dbo.lessons_learned
        ADD CONSTRAINT CK_ll_audience
            CHECK (is_internal = 1 OR is_committee = 1);
END;
GO

-- ── demo schema ──────────────────────────────────────────────

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'demo.lessons_learned')
      AND name = N'is_internal'
)
BEGIN
    ALTER TABLE demo.lessons_learned
        ADD is_internal  BIT NOT NULL CONSTRAINT DF_demo_ll_is_internal  DEFAULT 1,
            is_committee BIT NOT NULL CONSTRAINT DF_demo_ll_is_committee DEFAULT 0;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_demo_ll_audience'
      AND parent_object_id = OBJECT_ID(N'demo.lessons_learned')
)
BEGIN
    ALTER TABLE demo.lessons_learned
        ADD CONSTRAINT CK_demo_ll_audience
            CHECK (is_internal = 1 OR is_committee = 1);
END;
GO