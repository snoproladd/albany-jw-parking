-- Traffic arrows (demo schema): standalone directional markers on the road surface.

CREATE TABLE demo.sign_traffic_arrows (
    arrow_id        INT IDENTITY(1,1) PRIMARY KEY,
    latitude        DECIMAL(10,7)   NOT NULL,
    longitude       DECIMAL(10,7)   NOT NULL,
    bearing         DECIMAL(5,1)    NOT NULL DEFAULT 0,
    label           NVARCHAR(100)   NULL,
    color           NVARCHAR(20)    NULL,
    created_by      NVARCHAR(100)   NOT NULL,
    created_at      DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE demo.sign_traffic_arrow_links (
    link_id         INT IDENTITY(1,1) PRIMARY KEY,
    arrow_id        INT NOT NULL
        REFERENCES demo.sign_traffic_arrows(arrow_id) ON DELETE CASCADE,
    attachment_id   INT NOT NULL
        REFERENCES demo.sign_attachments(attachment_id) ON DELETE CASCADE,
    CONSTRAINT UQ_demo_arrow_attachment UNIQUE (arrow_id, attachment_id)
);
