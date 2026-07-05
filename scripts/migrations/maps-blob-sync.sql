-- ============================================================
-- Migration: maps-blob-sync.sql
-- Feature:   Maps resources page now serves files from Azure Blob
--            Storage instead of live SharePoint/OneDrive links.
--            A background + on-demand sync job (lib/mapsSync.js)
--            copies files from the existing SharePoint folder into
--            the "maps-files" blob container and tracks them here.
--
-- New tables:
--   dbo.map_files    Synced copy of each SharePoint file's metadata,
--                    plus the blob_name used to serve it locally.
--
-- Targets both dbo and demo schemas.  GO separates batches.
-- ============================================================

-- ============================================================
-- dbo schema
-- ============================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.tables
    WHERE object_id = OBJECT_ID(N'dbo.map_files')
)
BEGIN
    CREATE TABLE dbo.map_files (
        id              INT            IDENTITY(1,1)  NOT NULL
                                       CONSTRAINT PK_map_files PRIMARY KEY,
        folder_name     NVARCHAR(255)  NOT NULL,
        file_name       NVARCHAR(255)  NOT NULL,
        blob_name       NVARCHAR(500)  NOT NULL,
        description     NVARCHAR(500)  NULL,
        mime_type       NVARCHAR(100)  NULL,
        size            BIGINT         NULL,
        source_item_id  NVARCHAR(255)  NOT NULL,
        scribble_url    NVARCHAR(1000) NULL,
        embed_url       NVARCHAR(1000) NULL,
        last_modified   DATETIME2(0)   NULL,
        synced_at       DATETIME2(0)   NOT NULL
                                       CONSTRAINT DF_map_files_synced_at
                                       DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_map_files_source_item UNIQUE (source_item_id)
    );
END;
GO

-- ============================================================
-- demo schema
-- ============================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.tables
    WHERE object_id = OBJECT_ID(N'demo.map_files')
)
BEGIN
    CREATE TABLE demo.map_files (
        id              INT            IDENTITY(1,1)  NOT NULL
                                       CONSTRAINT PK_demo_map_files PRIMARY KEY,
        folder_name     NVARCHAR(255)  NOT NULL,
        file_name       NVARCHAR(255)  NOT NULL,
        blob_name       NVARCHAR(500)  NOT NULL,
        description     NVARCHAR(500)  NULL,
        mime_type       NVARCHAR(100)  NULL,
        size            BIGINT         NULL,
        source_item_id  NVARCHAR(255)  NOT NULL,
        scribble_url    NVARCHAR(1000) NULL,
        embed_url       NVARCHAR(1000) NULL,
        last_modified   DATETIME2(0)   NULL,
        synced_at       DATETIME2(0)   NOT NULL
                                       CONSTRAINT DF_demo_map_files_synced_at
                                       DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_demo_map_files_source_item UNIQUE (source_item_id)
    );
END;
GO
