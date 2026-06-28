-- system_variable_lists.sql
-- Adds the system_variable_lists table (vocabulary store for all dynamic
-- config lists), location_sub_locations (named entrances/floors/etc per
-- location), and wires them into locations_tasks and parking_counts.
-- Targets dbo and demo schemas. Apply after parking_counts_is_manual.sql.
--
-- Build: 2.71.0

-- ============================================================
-- 1. system_variable_lists
-- ============================================================

CREATE TABLE dbo.system_variable_lists (
    id            INT IDENTITY(1,1) NOT NULL,
    category      NVARCHAR(50)      NOT NULL,
    display_name  NVARCHAR(100)     NOT NULL,
    parent_id     INT               NULL,
    display_order INT               NOT NULL CONSTRAINT DF_svl_display_order  DEFAULT 0,
    active        BIT               NOT NULL CONSTRAINT DF_svl_active         DEFAULT 1,
    created_at    DATETIME2(0)      NOT NULL CONSTRAINT DF_svl_created_at     DEFAULT GETUTCDATE(),
    CONSTRAINT PK_system_variable_lists
        PRIMARY KEY (id),
    CONSTRAINT FK_svl_parent
        FOREIGN KEY (parent_id) REFERENCES dbo.system_variable_lists(id)
);
GO

CREATE INDEX IX_svl_category ON dbo.system_variable_lists (category, active);
GO

CREATE TABLE demo.system_variable_lists (
    id            INT IDENTITY(1,1) NOT NULL,
    category      NVARCHAR(50)      NOT NULL,
    display_name  NVARCHAR(100)     NOT NULL,
    parent_id     INT               NULL,
    display_order INT               NOT NULL CONSTRAINT DF_dsvl_display_order DEFAULT 0,
    active        BIT               NOT NULL CONSTRAINT DF_dsvl_active        DEFAULT 1,
    created_at    DATETIME2(0)      NOT NULL CONSTRAINT DF_dsvl_created_at    DEFAULT GETUTCDATE(),
    CONSTRAINT PK_demo_system_variable_lists
        PRIMARY KEY (id),
    CONSTRAINT FK_dsvl_parent
        FOREIGN KEY (parent_id) REFERENCES demo.system_variable_lists(id)
);
GO

CREATE INDEX IX_dsvl_category ON demo.system_variable_lists (category, active);
GO

-- ============================================================
-- 2. Add classification_id to locations_tasks
-- ============================================================

ALTER TABLE dbo.locations_tasks
    ADD classification_id INT NULL
        CONSTRAINT FK_lt_classification
            FOREIGN KEY REFERENCES dbo.system_variable_lists(id);
GO

ALTER TABLE demo.locations_tasks
    ADD classification_id INT NULL
        CONSTRAINT FK_dlt_classification
            FOREIGN KEY REFERENCES demo.system_variable_lists(id);
GO

-- ============================================================
-- 3. location_sub_locations
-- ============================================================

CREATE TABLE dbo.location_sub_locations (
    id               INT IDENTITY(1,1) NOT NULL,
    location_task_id INT               NOT NULL,
    name             NVARCHAR(100)     NOT NULL,
    sub_type_id      INT               NULL,
    display_order    INT               NOT NULL CONSTRAINT DF_lsl_display_order DEFAULT 0,
    active           BIT               NOT NULL CONSTRAINT DF_lsl_active        DEFAULT 1,
    created_at       DATETIME2(0)      NOT NULL CONSTRAINT DF_lsl_created_at    DEFAULT GETUTCDATE(),
    CONSTRAINT PK_location_sub_locations
        PRIMARY KEY (id),
    CONSTRAINT FK_lsl_location
        FOREIGN KEY (location_task_id) REFERENCES dbo.locations_tasks(id) ON DELETE CASCADE,
    CONSTRAINT FK_lsl_sub_type
        FOREIGN KEY (sub_type_id)      REFERENCES dbo.system_variable_lists(id)
);
GO

CREATE INDEX IX_lsl_location ON dbo.location_sub_locations (location_task_id, active, display_order);
GO

CREATE TABLE demo.location_sub_locations (
    id               INT IDENTITY(1,1) NOT NULL,
    location_task_id INT               NOT NULL,
    name             NVARCHAR(100)     NOT NULL,
    sub_type_id      INT               NULL,
    display_order    INT               NOT NULL CONSTRAINT DF_dlsl_display_order DEFAULT 0,
    active           BIT               NOT NULL CONSTRAINT DF_dlsl_active        DEFAULT 1,
    created_at       DATETIME2(0)      NOT NULL CONSTRAINT DF_dlsl_created_at    DEFAULT GETUTCDATE(),
    CONSTRAINT PK_demo_location_sub_locations
        PRIMARY KEY (id),
    CONSTRAINT FK_dlsl_location
        FOREIGN KEY (location_task_id) REFERENCES demo.locations_tasks(id) ON DELETE CASCADE,
    CONSTRAINT FK_dlsl_sub_type
        FOREIGN KEY (sub_type_id)      REFERENCES demo.system_variable_lists(id)
);
GO

CREATE INDEX IX_dlsl_location ON demo.location_sub_locations (location_task_id, active, display_order);
GO

-- ============================================================
-- 4. Add sub_location_id to parking_counts
-- ============================================================

ALTER TABLE dbo.parking_counts
    ADD sub_location_id INT NULL
        CONSTRAINT FK_pc_sub_location
            FOREIGN KEY REFERENCES dbo.location_sub_locations(id) ON DELETE SET NULL;
GO

ALTER TABLE demo.parking_counts
    ADD sub_location_id INT NULL
        CONSTRAINT FK_dpc_sub_location
            FOREIGN KEY REFERENCES demo.location_sub_locations(id) ON DELETE SET NULL;
GO

-- ============================================================
-- 5. Seed: dbo.system_variable_lists
-- ============================================================

-- Location classifications
INSERT INTO dbo.system_variable_lists (category, display_name, display_order) VALUES
    ('location_classification', 'Parking Garage',  1),
    ('location_classification', 'Parking Area',    2),
    ('location_classification', 'Kingdom Hall',    3),
    ('location_classification', 'Desk / Station',  4);
GO

-- Universal sub-location types (no parent — apply to any classification)
INSERT INTO dbo.system_variable_lists (category, display_name, parent_id, display_order) VALUES
    ('location_sub_type', 'Entrance', NULL, 1),
    ('location_sub_type', 'Exit',     NULL, 2),
    ('location_sub_type', 'Aisle',    NULL, 3);
GO

-- Parking Garage-specific sub-types
INSERT INTO dbo.system_variable_lists (category, display_name, parent_id, display_order)
SELECT 'location_sub_type', 'Floor',  id, 4
FROM   dbo.system_variable_lists
WHERE  category = 'location_classification' AND display_name = 'Parking Garage';
GO

INSERT INTO dbo.system_variable_lists (category, display_name, parent_id, display_order)
SELECT 'location_sub_type', 'Column', id, 5
FROM   dbo.system_variable_lists
WHERE  category = 'location_classification' AND display_name = 'Parking Garage';
GO

-- Kingdom Hall-specific sub-types
INSERT INTO dbo.system_variable_lists (category, display_name, parent_id, display_order)
SELECT 'location_sub_type', 'Desk', id, 6
FROM   dbo.system_variable_lists
WHERE  category = 'location_classification' AND display_name = 'Kingdom Hall';
GO

-- ============================================================
-- 6. Seed: demo.system_variable_lists
-- ============================================================

INSERT INTO demo.system_variable_lists (category, display_name, display_order) VALUES
    ('location_classification', 'Parking Garage',  1),
    ('location_classification', 'Parking Area',    2),
    ('location_classification', 'Kingdom Hall',    3),
    ('location_classification', 'Desk / Station',  4);
GO

INSERT INTO demo.system_variable_lists (category, display_name, parent_id, display_order) VALUES
    ('location_sub_type', 'Entrance', NULL, 1),
    ('location_sub_type', 'Exit',     NULL, 2),
    ('location_sub_type', 'Aisle',    NULL, 3);
GO

INSERT INTO demo.system_variable_lists (category, display_name, parent_id, display_order)
SELECT 'location_sub_type', 'Floor',  id, 4
FROM   demo.system_variable_lists
WHERE  category = 'location_classification' AND display_name = 'Parking Garage';
GO

INSERT INTO demo.system_variable_lists (category, display_name, parent_id, display_order)
SELECT 'location_sub_type', 'Column', id, 5
FROM   demo.system_variable_lists
WHERE  category = 'location_classification' AND display_name = 'Parking Garage';
GO

INSERT INTO demo.system_variable_lists (category, display_name, parent_id, display_order)
SELECT 'location_sub_type', 'Desk', id, 6
FROM   demo.system_variable_lists
WHERE  category = 'location_classification' AND display_name = 'Kingdom Hall';
GO
