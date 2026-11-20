-- =============================================================================
-- department_short_names.sql   (multi-department phase 2c-3)
-- =============================================================================
-- Department names are shown in the navbar department switcher, so they must
-- be short. Renames department 1 ("Albany JW Regional Convention Parking" /
-- "Albany Summer Convention Parking") to "Parking" in both schemas. The long
-- wording stays in the description column.
--
-- LOCAL ONLY (albanyregional3_local) until the multi-department branch ships.
-- Safe to re-run. departments has no row-level security.
-- =============================================================================
SET NOCOUNT ON;
GO

UPDATE dbo.departments  SET name = N'Parking' WHERE slug = N'parking' AND name <> N'Parking';
PRINT CONCAT('dbo: renamed ', @@ROWCOUNT, ' department(s) to Parking.');
GO

UPDATE demo.departments SET name = N'Parking' WHERE slug = N'parking' AND name <> N'Parking';
PRINT CONCAT('demo: renamed ', @@ROWCOUNT, ' department(s) to Parking.');
GO

SELECT 'dbo' AS schema_name, id, name, slug, description FROM dbo.departments
UNION ALL
SELECT 'demo', id, name, slug, description FROM demo.departments
ORDER BY 1, 2;
GO
