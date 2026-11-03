-- ─── Migration: capacity alert global kill switch (single-row settings) ───
-- Read and written by getCapacityAlertKillSwitch() / setCapacityAlertKillSwitch()
-- in lib/dbSync.js.

CREATE TABLE demo.capacity_alert_settings (
    id                      INT        NOT NULL,
    kill_switch_enabled     BIT        NOT NULL
        CONSTRAINT DF_capacity_alert_settings_enabled DEFAULT 0,
    kill_switch_enabled_by  INT        NULL,
    kill_switch_enabled_at  DATETIME2  NULL,
    CONSTRAINT PK_capacity_alert_settings PRIMARY KEY (id),
    CONSTRAINT CK_capacity_alert_settings_single_row CHECK (id = 1),
    CONSTRAINT FK_capacity_alert_settings_enabled_by
        FOREIGN KEY (kill_switch_enabled_by) REFERENCES demo.volunteer_in (id)
);

-- Seeded with the kill switch ON so that applying this migration does not
-- suddenly start sending alerts. Turn it off from the Capacity Alerts page
-- when you are ready.
INSERT INTO demo.capacity_alert_settings (id, kill_switch_enabled, kill_switch_enabled_at)
VALUES (1, 1, SYSUTCDATETIME());

-- Verify
SELECT * FROM demo.capacity_alert_settings;