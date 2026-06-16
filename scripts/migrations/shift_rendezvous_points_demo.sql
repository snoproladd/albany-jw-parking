-- Rendezvous points (demo schema): one optional meeting point per schedule assignment.

CREATE TABLE demo.shift_rendezvous_points (
    id                      INT IDENTITY(1,1) PRIMARY KEY,
    schedule_assignment_id  INT             NOT NULL
        REFERENCES demo.schedule_assignments(id) ON DELETE CASCADE,
    description             NVARCHAR(500)   NULL,
    address                 NVARCHAR(500)   NULL,
    latitude                FLOAT           NULL,
    longitude               FLOAT           NULL,
    floor_number            NVARCHAR(20)    NULL,
    photo_blob_name         NVARCHAR(255)   NULL,
    created_by              INT             NOT NULL
        REFERENCES demo.volunteer_in(id),
    updated_by              INT             NOT NULL
        REFERENCES demo.volunteer_in(id),
    created_at              DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at              DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_demo_rendezvous_assignment UNIQUE (schedule_assignment_id)
);