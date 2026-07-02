-- ============================================================
-- Migration: magic_login_tokens
--
-- Adds dbo.magic_login_tokens (+ demo mirror) to support
-- passwordless "magic link" logins for shared operational
-- accounts (e.g. the COUNTER account) via printed QR code.
--
-- Tokens are stored as SHA-256 hashes only -- the raw token is
-- generated once, shown to the admin, and never persisted, so a
-- database leak does not expose a usable credential.
--
-- Target: both dbo and demo schemas.
-- ============================================================

-- ── dbo: magic_login_tokens ──────────────────────────────────
IF NOT EXISTS (
    SELECT 1
    FROM   sys.tables
    WHERE  name      = 'magic_login_tokens'
      AND  schema_id = SCHEMA_ID('dbo')
)
BEGIN
    CREATE TABLE dbo.magic_login_tokens (
        id           INT           IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_mlt PRIMARY KEY,
        volunteer_id INT           NOT NULL
            CONSTRAINT FK_mlt_volunteer
                REFERENCES dbo.volunteer_in (id),
        token_hash   CHAR(64)      NOT NULL
            CONSTRAINT UQ_mlt_token_hash UNIQUE,
        label        NVARCHAR(100) NULL,
        created_at   DATETIME2     NOT NULL
            CONSTRAINT DF_mlt_created_at DEFAULT SYSUTCDATETIME(),
        expires_at   DATETIME2     NULL,
        revoked_at   DATETIME2     NULL,
        last_used_at DATETIME2     NULL
    );

    CREATE INDEX IX_mlt_volunteer_id
        ON dbo.magic_login_tokens (volunteer_id);
END
GO

-- ── demo: magic_login_tokens ─────────────────────────────────
IF NOT EXISTS (
    SELECT 1
    FROM   sys.tables
    WHERE  name      = 'magic_login_tokens'
      AND  schema_id = SCHEMA_ID('demo')
)
BEGIN
    CREATE TABLE demo.magic_login_tokens (
        id           INT           IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_demo_mlt PRIMARY KEY,
        volunteer_id INT           NOT NULL
            CONSTRAINT FK_demo_mlt_volunteer
                REFERENCES demo.volunteer_in (id),
        token_hash   CHAR(64)      NOT NULL
            CONSTRAINT UQ_demo_mlt_token_hash UNIQUE,
        label        NVARCHAR(100) NULL,
        created_at   DATETIME2     NOT NULL
            CONSTRAINT DF_demo_mlt_created_at DEFAULT SYSUTCDATETIME(),
        expires_at   DATETIME2     NULL,
        revoked_at   DATETIME2     NULL,
        last_used_at DATETIME2     NULL
    );

    CREATE INDEX IX_demo_mlt_volunteer_id
        ON demo.magic_login_tokens (volunteer_id);
END
GO
