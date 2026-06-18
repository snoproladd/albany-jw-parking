-- ─── Migration: add is_meeting flag to demo.shifts ────────────────────────

-- 1. Add the flag
ALTER TABLE demo.shifts
    ADD is_meeting BIT NOT NULL DEFAULT 0;
GO

-- 2. Make event_type_id nullable
ALTER TABLE demo.shifts
    ALTER COLUMN event_type_id INT NULL;
GO

-- 3. Backfill existing meeting shift(s)
UPDATE demo.shifts
SET    is_meeting = 1
WHERE  department IS NULL
  AND  event_type_id IN (
           SELECT id FROM demo.event_types
           WHERE  LOWER(name) LIKE '%meeting%'
       );
GO

-- 4. Fix the SMS code on that shift (FRXX1 → FRMT1)
UPDATE demo.shifts
SET    sms_code = 'FRMT1'
WHERE  is_meeting = 1
  AND  sms_code   = 'FRXX1';
GO

-- Verify
SELECT id, label, department, is_meeting, sms_code
FROM   demo.shifts
WHERE  is_meeting = 1
    OR department IS NULL
ORDER BY id;