-- =============================================================================
-- demo_neutral_branding_demo.sql
-- -----------------------------------------------------------------------------
-- Purpose:
--   Remove faith-specific wording from data in the DEMO schema only, to match
--   the neutral demo branding in lib/branding.js. Production (dbo) is never
--   touched — there is intentionally no dbo counterpart to this migration.
--
-- How it works:
--   1. AUDIT (before)  — scans every text column of every demo table for a
--                        broad list of faith-related patterns and reports
--                        table / column / match count / sample values.
--   2. REPLACE         — applies a fixed, specific phrase list (below) to every
--                        eligible demo text column. Technical columns (tokens,
--                        hashes, emails, URLs, blob names, phone numbers, SMS
--                        codes) are skipped. Rows where the replacement would
--                        overflow the column length are skipped and reported.
--   3. AUDIT (after)   — re-runs the scan so you can see anything left over.
--                        Leftovers are usually free-text (notes, lessons
--                        learned) worth a manual look rather than a blind
--                        replace.
--
-- Safety:
--   @apply = 0 (default) is a DRY RUN: everything runs inside a transaction
--   that is ROLLED BACK, so you see exactly what would change. Set @apply = 1
--   and run again to COMMIT. Safe to re-run — a second apply finds nothing.
--
-- Run as a login that can UPDATE the demo schema (e.g. your admin login).
-- =============================================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @apply BIT = 0;   -- 0 = dry run (rollback), 1 = commit

-- -----------------------------------------------------------------------------
-- Phrase replacements (applied in ord order; longer / more specific first).
-- Matching follows the column collation (normally case-insensitive).
-- -----------------------------------------------------------------------------
DECLARE @terms TABLE (ord INT PRIMARY KEY, find NVARCHAR(200), repl NVARCHAR(200));
INSERT INTO @terms (ord, find, repl) VALUES
    ( 1, N'Albany Regional Convention of Jehovah''s Witnesses', N'Albany Summer Convention'),
    ( 2, N'Regional Convention of Jehovah''s Witnesses',        N'Summer Convention'),
    ( 3, N'Riverdale JW Regional Convention',                   N'Albany Summer Convention'),
    ( 4, N'Albany JW Regional Convention',                      N'Albany Summer Convention'),
    ( 5, N'JW Regional Convention',                             N'Summer Convention'),
    ( 6, N'Albany JW Convention',                               N'Albany Summer Convention'),
    ( 7, N'Albany JW Parking',                                  N'Volunteer Parking Coordinator'),
    ( 8, N'Millhaven KH of JW',                                 N'Millhaven Community Center'),
    ( 9, N'Millhaven Kingdom Hall',                             N'Millhaven Community Center'),
    (10, N'KH of JW',                                           N'Community Center'),
    (11, N'Kingdom Hall',                                       N'Community Center');

-- -----------------------------------------------------------------------------
-- Audit patterns (report only — never auto-replaced). LIKE syntax.
-- -----------------------------------------------------------------------------
DECLARE @patterns TABLE (pattern NVARCHAR(100));
INSERT INTO @patterns (pattern) VALUES
    (N'%Jehovah%'), (N'% JW %'), (N'JW %'), (N'% JW'), (N'%JW.org%'),
    (N'%Watchtower%'), (N'%Watch Tower%'), (N'%Kingdom Hall%'), (N'% KH %'),
    (N'%congregation%'), (N'%elder%'), (N'%pioneer%'), (N'%ministerial%'),
    (N'%circuit%'), (N'%Bethel%'), (N'%Memorial%'), (N'%field service%'),
    (N'%spiritual%');

-- -----------------------------------------------------------------------------
-- Eligible columns: text columns on demo base tables, excluding technical ones.
-- -----------------------------------------------------------------------------
DECLARE @cols TABLE (tbl SYSNAME, col SYSNAME, max_chars INT);
INSERT INTO @cols (tbl, col, max_chars)
SELECT  t.name,
        c.name,
        CASE WHEN c.max_length = -1 THEN NULL
             WHEN ty.name IN (N'nvarchar', N'nchar') THEN c.max_length / 2
             ELSE c.max_length END
FROM    sys.tables  t
JOIN    sys.schemas s  ON s.schema_id = t.schema_id
JOIN    sys.columns c  ON c.object_id = t.object_id
JOIN    sys.types   ty ON ty.user_type_id = c.user_type_id
WHERE   s.name = N'demo'
  AND   ty.name IN (N'nvarchar', N'varchar', N'nchar', N'char')
  AND   c.is_computed = 0
  AND   c.name NOT LIKE N'%token%'
  AND   c.name NOT LIKE N'%hash%'
  AND   c.name NOT LIKE N'%salt%'
  AND   c.name NOT LIKE N'%password%'
  AND   c.name NOT LIKE N'%email%'
  AND   c.name NOT LIKE N'%url%'
  AND   c.name NOT LIKE N'%blob%'
  AND   c.name NOT LIKE N'%phone%'
  AND   c.name NOT LIKE N'%[_]sid%'
  AND   c.name NOT LIKE N'%sms[_]code%';

DECLARE @audit TABLE (phase NVARCHAR(10), tbl SYSNAME, col SYSNAME, matches INT, sample NVARCHAR(400));
DECLARE @changes TABLE (tbl SYSNAME, col SYSNAME, find NVARCHAR(200), rows_changed INT, rows_skipped_overflow INT);

DECLARE @tbl SYSNAME, @col SYSNAME, @max INT, @sql NVARCHAR(MAX), @n INT, @skip INT, @sample NVARCHAR(400);
DECLARE @find NVARCHAR(200), @repl NVARCHAR(200), @ord INT;

-- Patterns rendered once as a VALUES list (table variables can't be passed
-- into sp_executesql).
DECLARE @pvals NVARCHAR(MAX) = STUFF((
    SELECT N',(N''' + REPLACE(pattern, N'''', N'''''') + N''')'
    FROM @patterns
    FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 1, N'');

-- ----- Audit pass (runs twice: phase 'before', then 'after' inside the txn) ---
DECLARE @phase NVARCHAR(10) = N'before';

AUDIT_PASS:
DECLARE audit_cur CURSOR LOCAL FAST_FORWARD FOR SELECT tbl, col FROM @cols;
OPEN audit_cur;
FETCH NEXT FROM audit_cur INTO @tbl, @col;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @sql = N'SELECT @n = COUNT(*), @sample = LEFT(MAX(CAST(x.' + QUOTENAME(@col) + N' AS NVARCHAR(400))), 400)
                 FROM demo.' + QUOTENAME(@tbl) + N' x
                 WHERE EXISTS (SELECT 1 FROM (VALUES ' + @pvals + N') p(pattern)
                               WHERE x.' + QUOTENAME(@col) + N' LIKE p.pattern);';
    EXEC sp_executesql @sql, N'@n INT OUTPUT, @sample NVARCHAR(400) OUTPUT', @n = @n OUTPUT, @sample = @sample OUTPUT;
    IF @n > 0 INSERT INTO @audit VALUES (@phase, @tbl, @col, @n, @sample);
    FETCH NEXT FROM audit_cur INTO @tbl, @col;
END
CLOSE audit_cur;
DEALLOCATE audit_cur;

IF @phase = N'after' GOTO REPORT;

-- -----------------------------------------------------------------------------
-- Replace pass
-- -----------------------------------------------------------------------------
BEGIN TRANSACTION;

DECLARE col_cur CURSOR LOCAL FAST_FORWARD FOR SELECT tbl, col, max_chars FROM @cols;
OPEN col_cur;
FETCH NEXT FROM col_cur INTO @tbl, @col, @max;
WHILE @@FETCH_STATUS = 0
BEGIN
    DECLARE term_cur CURSOR LOCAL FAST_FORWARD FOR SELECT ord, find, repl FROM @terms ORDER BY ord;
    OPEN term_cur;
    FETCH NEXT FROM term_cur INTO @ord, @find, @repl;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Count rows that would overflow the column, then update the rest.
        SET @skip = 0;
        IF @max IS NOT NULL
        BEGIN
            SET @sql = N'SELECT @skip = COUNT(*) FROM demo.' + QUOTENAME(@tbl) +
                       N' WHERE ' + QUOTENAME(@col) + N' LIKE N''%'' + @find + N''%''' +
                       N' AND LEN(REPLACE(' + QUOTENAME(@col) + N', @find, @repl)) > @max;';
            EXEC sp_executesql @sql, N'@find NVARCHAR(200), @repl NVARCHAR(200), @max INT, @skip INT OUTPUT',
                 @find = @find, @repl = @repl, @max = @max, @skip = @skip OUTPUT;
        END

        SET @sql = N'UPDATE demo.' + QUOTENAME(@tbl) +
                   N' SET ' + QUOTENAME(@col) + N' = REPLACE(' + QUOTENAME(@col) + N', @find, @repl)' +
                   N' WHERE ' + QUOTENAME(@col) + N' LIKE N''%'' + @find + N''%''' +
                   CASE WHEN @max IS NULL THEN N''
                        ELSE N' AND LEN(REPLACE(' + QUOTENAME(@col) + N', @find, @repl)) <= @max' END +
                   N'; SET @n = @@ROWCOUNT;';
        EXEC sp_executesql @sql, N'@find NVARCHAR(200), @repl NVARCHAR(200), @max INT, @n INT OUTPUT',
             @find = @find, @repl = @repl, @max = @max, @n = @n OUTPUT;

        IF @n > 0 OR @skip > 0
            INSERT INTO @changes VALUES (@tbl, @col, @find, @n, @skip);

        FETCH NEXT FROM term_cur INTO @ord, @find, @repl;
    END
    CLOSE term_cur;
    DEALLOCATE term_cur;

    FETCH NEXT FROM col_cur INTO @tbl, @col, @max;
END
CLOSE col_cur;
DEALLOCATE col_cur;

SET @phase = N'after';
GOTO AUDIT_PASS;

REPORT:
-- -----------------------------------------------------------------------------
-- Results
-- -----------------------------------------------------------------------------
SELECT N'1. AUDIT BEFORE' AS report, tbl, col, matches, sample FROM @audit WHERE phase = N'before' ORDER BY tbl, col;
SELECT N'2. CHANGES'      AS report, tbl, col, find, rows_changed, rows_skipped_overflow FROM @changes ORDER BY tbl, col, find;
SELECT N'3. AUDIT AFTER (review manually)' AS report, tbl, col, matches, sample FROM @audit WHERE phase = N'after' ORDER BY tbl, col;

IF @apply = 1
BEGIN
    COMMIT TRANSACTION;
    PRINT N'APPLIED — changes committed to the demo schema.';
END
ELSE
BEGIN
    ROLLBACK TRANSACTION;
    PRINT N'DRY RUN — all changes rolled back. Set @apply = 1 to commit.';
END
