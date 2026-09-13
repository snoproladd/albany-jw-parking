# Database Reference

Schema reference for the Azure SQL database backing Albany JW Parking.
Migrations live in `scripts/migrations/` — one file per change, targeting both
the production and demo schemas, with `GO` between batches.

---

## Database

Azure SQL. Connection pool managed in `lib/sql.js` with:
- Stale-pool detection (error handler nulls `_pool` to force reconnect)
- Keep-alive ping every 3 minutes (prevents Azure's ~4 min idle TCP kill)
- Retry with exponential backoff on transient errors
- **Demo pool** — lazily initialized on first demo request using SQL auth
  (`<demo-db-user>` user). `AsyncLocalStorage` routes all queries automatically;
  `dbo.` prefixes in SQL strings are rewritten to `demo.` at runtime.

Schema highlights:
- `volunteer_in` — core volunteer table (registration, contact, role, crews,
  delegated extra permissions)
  - Crew columns: `crew_lots_garages`, `crew_signs`, `crew_security`,
    `crew_mobile_support`, `crew_dropoff_pickup`, `crew_desk` (all BIT)
  - `extra_signs_placement BIT NOT NULL DEFAULT 0` — grants `manageSigns` to a
    REGISTERED volunteer without a role promotion. Checked at login; stored as
    `'manageSigns'` in `req.session.extraPermissions` (string array). Future
    delegated permissions follow the same pattern: add a column, add one line
    to the login handler.
  - `extra_parking_count BIT NOT NULL DEFAULT 0` — grants `logParkingCount` to a
    REGISTERED volunteer (delegation for convention-day counters). Checked at login;
    stored as `'logParkingCount'` in `req.session.extraPermissions`.
- `invitations` — per-volunteer invite records with token, RSVP, batch link,
  and `response_other` (free-text "Other" input for dynamic RSVP)
- `invitation_batches` — campaign metadata; `response_config` (JSON, nullable)
  stores dynamic RSVP configuration (type, options, allowOther, question)
- `convention_days → sessions → shifts` — scheduling hierarchy
  - `shifts.is_meeting BIT` — crew-agnostic meeting shift; no category,
    no schedule assignments. Appears in a dedicated Meetings column in the
    Scheduler and uses `MT` SMS code prefix. T-15 alerts broadcast to all
    day volunteers not scheduled elsewhere during the meeting window.
  - `shifts.has_keyman / has_keyman_asst BIT` — whether this shift exposes
    a Keyman or Keyman Assistant drop zone in the Scheduler. Both default to
    1. Leadership slots count toward Min/Target/Max; volunteer slot budget is
    reduced accordingly. Not applicable to meeting shifts.
  - `shifts.category_id INT FK → scheduler_categories` — links each crew
    shift to a scheduler category (NULL for meeting shifts). Replaced the
    former `department` (NVARCHAR) and `event_type_id` (INT FK) columns.
  - `schedule_assignments.vol_min / vol_max` — flanking `volunteer_need`
    (vol_ideal) for slot sizing and color-coding
  - `shift_slot_assignments` — live scheduler assignments (volunteer → slot);
    one row per slot, cascades on schedule_assignment delete
- `scheduler_categories` — shift categories replacing `dbo.event_types`.
  Fields: `dept_key` (stable machine key, unique), `name` (editable display
  label), `color` (hex), `is_sensitive BIT` (controls schedule visibility),
  `active BIT`, `sort_order INT`. Eight rows seeded at setup.
- `scheduler_category_access` — per-volunteer access grants for restricted
  (`is_sensitive = 1`) categories. Fields: `volunteer_id FK`, `category_id FK`,
  `granted_by FK`, `granted_at`. Composite PK `(volunteer_id, category_id)`.
  Loaded into `req.session.sensitiveCategories` at login; null for OVERSEER+
  (no filter), array of permitted category IDs for lower roles.
- `campaign_meetings` — standalone meeting events not tied to a Timelines
  session (e.g. pre-event all-hands). Fields: `year`, `label`, `meeting_date`,
  `start_time`, `end_time`, `description`. Foundation for the planned
  landing-page calendar view.
- `oversight_structure` — oversight structure tree (`volunteer_id`, `parent_id`,
  `role_title`, `sort_order`)
- `attendance` — check-in records (walk-ins + invited volunteers)
- `volunteer_blackouts` — per-volunteer unavailable time windows for scheduler
  conflict detection
- `role_permissions` — runtime permission overrides (delta from defaults)
- `sms_opt_out_log` — Twilio webhook opt-out events
- `departments` — lookup table for future multi-department support (id=1 seeded as Albany Parking)
- `bug_reports` — full lifecycle bug tracking with resolution fields
- `schedule_publishes` — audit log for schedule PDF publish events
- `published_files` — generic published file tracking (sign map PDFs, etc.); stores blob name, SharePoint URL, publisher, and timestamp
- `map_files` — synced copy of each Maps resources file, keyed by Graph `source_item_id` (`folder_name`, `file_name`, `blob_name`, `mime_type`, `size`, `scribble_url`, `embed_url`, `last_modified`, `synced_at`); kept current by `lib/mapsSync.js`
- `magic_login_tokens` — passwordless login tokens for shared operational accounts
  (e.g. COUNTER stations), accessed via printed QR code. Fields: `volunteer_id FK`,
  `token_hash CHAR(64)` (SHA-256; raw token is never stored, shown once at
  generation time), `label`, `expires_at` (nullable — null means never expires
  until manually revoked), `revoked_at`, `last_used_at`. Managed via
  `/oversight/tools/magic-links` (ADMIN only); tokens generated via
  `scripts/generateMagicLink.js`.
- `volunteer_note_reads` — per-overseer read records for intake notes. Fields: `volunteer_id FK`, `read_by FK`, `read_at DATETIME`. Unique on `(volunteer_id, read_by)`; MERGE upsert on re-read updates `read_at`.
- `volunteer_actions` — actionable items from intake notes and inbound SMS. Fields: `volunteer_id FK`, `source_type NVARCHAR(50)` (`intake_note` | `inbound_sms`), `source_id` (nullable), `solution_found BIT`, `solution NVARCHAR(MAX)`, solution stamp columns, `completed BIT`, completion stamp columns, `created_by FK`, `created_at`. Three columns on `volunteer_in`: `note_dismissed BIT`, `note_dismissed_at DATETIME`, `note_dismissed_by INT FK`.
- `inbound_sms_messages` — every freeform inbound Twilio SMS: `volunteer_id FK` (nullable), `from_phone`, `raw_body`, `received_at`, AI result columns (`ai_summary`, `ai_category`, `ai_action_items`, `ai_raw_response`, `ai_error`, token counts), `resolved BIT`. Unresolved messages surface in the Notes Report; auto-resolved when all linked AI suggestions are applied.
- `ai_blackout_suggestions` — AI-suggested scheduling blackouts pending overseer approval. `source_type` ∈ {intake_note, inbound_sms, overseer}, `source_id` links to the originating record, `volunteer_id FK`, resolved `convention_day_id + start_mins + end_mins`, `blackout_type`, `applied BIT` + stamp columns. When all suggestions for an SMS message are applied the parent `inbound_sms_messages` row is auto-resolved.
- `volunteer_note_analyses` — AI analysis snapshots for intake notes. Fields: SHA-256 `note_hash` for staleness detection, structured JSON result, token usage, raw response, `volunteer_id FK`.
- `schedule_violation_runs` — one row per schedule analysis pass. `schedule_hash NVARCHAR(64)` (SHA-256 of all assignments + blackouts) enables cache comparison to skip re-analysis when nothing has changed. `triggered_by FK`, `violation_count INT`.
- `schedule_violations` — per-violation rows. `violation_type` ∈ {time_overlap, blackout_violation, pre_session_overload, post_session_overload, understaffed, daily_load, coverage_gap, ai_observation}. `severity` ∈ {critical, high, medium, low, info} (null for rule-engine violations before AI enhancement). `confidence DECIMAL(3,2)` (null for deterministic facts). `ai_question` / `overseer_response` support the targeted Q&A re-analysis loop. `acknowledged BIT`.
- `schedule_analysis_rules` — admin-managed scheduling policy rules injected as mandatory context into the AI system prompt on every analysis run. `rule_text NVARCHAR(MAX)`, `sort_order INT`, `active BIT`. Managed via `/oversight/tools/schedule-rules` (ADMIN only).
- `lessons_learned` — submitted lessons from convention operations. Fields: `year`,
  `department_id FK → system_variable_lists`, `department_other`, `notes NVARCHAR(MAX)`,
  `status` (‘submitted’ | ‘approved’ | ‘published’), `archived BIT`, `submitted_by FK`,
  `approved_by FK`, `published_by FK` with timestamp columns. `is_internal BIT` /
  `is_committee BIT` classify the audience — internal to the department, and/or submitted
  to the committee alongside the following year's operating plan. `CK_ll_audience`
  guarantees at least one is set.
- `lessons_learned_photos` — photo attachments per lesson. Fields: `lesson_id FK
  (ON DELETE CASCADE)`, `blob_name`, `original_filename`, `uploaded_by FK`.
- `lessons_learned_reports` — one row per convention year tracking the consolidated
  published PDF. Fields: `year PK`, `blob_name`, `share_url`, `published_by FK`,
  `published_at`. Upserted on each individual lesson publish and on batch-publish.
- `parking_counts` — volunteer tally records. Fields: `volunteer_id FK`, `location_task_id FK`,
  `convention_day_id FK`, `count INT`, `is_final BIT`, `is_manual BIT`, `sub_location_id INT
  NULL FK → location_sub_locations (ON DELETE SET NULL)`, `recorded_at DATETIME2 DEFAULT
  GETUTCDATE()`. Heartbeats insert `is_final = 0`; taps/manual submits insert `is_final = 1`.
  Report query uses `MAX(count)` per volunteer per 15-minute bucket, then sums across
  volunteers per sub-location.
- `system_variable_lists` — central vocabulary store for dynamic lists. Fields: `category
  NVARCHAR(50)`, `display_name`, `parent_id INT NULL FK → self` (scopes sub-type labels to a
  specific classification), `display_order`, `active BIT`. Seeded categories:
  `location_classification` (Parking Garage, Parking Area, Kingdom Hall, Desk/Station) and
  `location_sub_type` (Entrance, Exit, Aisle universal; Floor/Column → Garage; Desk → KH).
- `location_sub_locations` — named positions within a location. Fields: `location_task_id FK
  (ON DELETE CASCADE)`, `name`, `sub_type_id FK → system_variable_lists`, `display_order`,
  `active BIT`. Deleting a location cascades to its sub-locations; counts that referenced a
  deleted sub-location have `sub_location_id` set to NULL (data preserved).
- `capacity_alert_rules` — dynamic threshold definitions for the Capacity Alerts feature.
  Fields: `location_task_id FK`, `sub_location_id INT NULL FK` (NULL = whole location),
  `threshold_type` (`percent` | `count`), `threshold_value INT`, `direction` (`above` |
  `below`), `recipient_role` (minimum role tier notified), `message_override NVARCHAR(500)
  NULL`, `is_armed BIT` (edge-trigger state — set to 0 on fire, back to 1 once the count
  returns to the safe side), `active BIT`, `created_by FK`. Editing a rule always resets
  `is_armed` to 1.
- `capacity_alert_log` — send-attempt audit log for Capacity Alerts. Fields: `rule_id FK`,
  `location_task_id`, `triggered_count`, `recipient_count`, `status` (`sent` | `failed`),
  `error_msg NVARCHAR(500) NULL`, `sent_at`.
- `volunteer_tour_dismissals` — tracks which guided tour prompts a volunteer has permanently dismissed; composite PK `(volunteer_id, tour_id)`, FK to `volunteer_in(id)`. Special `tour_id = '_all'` disables all first-visit prompts site-wide.
- `shift_rendezvous_points` — one optional meeting point per schedule assignment
  (shift + location pair). Fields: `description`, `address`, `latitude`/`longitude`
  (GPS), `floor_number`, `photo_blob_name` (Azure Blob, `rv-` prefix in `sign-photos`
  container). `UNIQUE` on `schedule_assignment_id`; `ON DELETE CASCADE` from
  `schedule_assignments`. KEYMAN+ can edit fields and upload photos; OVERSEER+ can
  create and delete records (`editRendezvous` permission). Rendezvous details are
  appended to T-15 shift alert SMS messages; a public HMAC-gated detail page
  (`/rv/:id?t=<token>`) is linked when a photo exists.
- `signs` — reusable sign templates (text + optional abbreviation); soft-deleted via `is_archived`
  - `abbreviation` `NVARCHAR(6)` — optional compact label for map markers (auto-generated from sign text when NULL)
- `sign_locations` — physical mounting points (the pin on the map). Multiple signs
  can be attached to one location (stacked signs on a pole, double-sided a-frames, etc.)
  - `latitude`/`longitude` `DECIMAL(10,7)` (≈1cm precision)
  - `mount_type` (`pole` / `cone` / `a-frame` / `existing-structure`, nullable)
  - `front_bearing` `DECIMAL(5,1)` — a-frame only: compass bearing the front face points toward (back = front + 180°)
  - `marker_color` — optional palette key (red, orange, yellow, green, teal, blue, purple, pink) for visual grouping
  - `photo_url` — blob name in Azure Storage `sign-photos` container; served via `GET /signs/locations/:id/photo`
  - `sv_pano_id`, `sv_heading`, `sv_pitch`, `sv_fov` — persisted Street View camera state; restored when the panorama is reopened
  - No status column — effective status is derived from attachments (any installed → installed, otherwise planned/removed)
  - `placement_number` — not a stored column; computed as `DENSE_RANK() OVER (ORDER BY location_id)` in `getSignLocations()`. Gapless sequential IDs (`P1`, `P2`, …) for field cross-referencing
- `sign_attachments` — a sign template mounted on a location, with its own status
  - `location_id` FK → `sign_locations` (ON DELETE CASCADE)
  - `sign_id` FK → `signs`; survives template archival
  - `face` — `NULL` (non-a-frame), `'front'`, or `'back'`
  - `sort_order` — stacking priority (lower = higher on the post); drag-to-reorder in the editor
  - `arrow_direction` — the arrow printed on the physical sign (per-attachment override)
  - `status` (`planned` / `installed` / `removed`) with install/remove audit trail per attachment
- `sign_traffic_arrows` — road-surface directional indicators pointing drivers toward sign locations
  - `bearing` `DECIMAL(5,1)` — compass bearing the arrow points toward
  - `sv_pano_id`, `sv_heading`, `sv_pitch`, `sv_fov` — persisted Street View camera state for arrow-specific approach views
  - `sign_traffic_arrow_links` junction table links arrows to `sign_attachments`
  - Separate from sign markers; placed on the road near intersections
- `traffic_arrow_signs` — links traffic arrows to specific attachments
  - `(arrow_id, attachment_id)` composite PK, both FK with ON DELETE CASCADE
