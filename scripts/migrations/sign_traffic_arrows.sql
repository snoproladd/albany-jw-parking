-- Traffic arrows: standalone directional markers on the road surface.
-- Each arrow links to one or more sign_attachments via sign_traffic_arrow_links.

CREATE TABLE dbo.sign_traffic_arrows (
    arrow_id        INT IDENTITY(1,1) PRIMARY KEY,
    latitude        DECIMAL(10,7)   NOT NULL,
    longitude       DECIMAL(10,7)   NOT NULL,
    bearing         DECIMAL(5,1)    NOT NULL DEFAULT 0,
    label           NVARCHAR(100)   NULL,
    color           NVARCHAR(20)    NULL,
    created_by      NVARCHAR(100)   NOT NULL,
    created_at      DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.sign_traffic_arrow_links (
    link_id         INT IDENTITY(1,1) PRIMARY KEY,
    arrow_id        INT NOT NULL
        REFERENCES dbo.sign_traffic_arrows(arrow_id) ON DELETE CASCADE,
    attachment_id   INT NOT NULL
        REFERENCES dbo.sign_attachments(attachment_id) ON DELETE CASCADE,
    CONSTRAINT UQ_arrow_attachment UNIQUE (arrow_id, attachment_id)
);
