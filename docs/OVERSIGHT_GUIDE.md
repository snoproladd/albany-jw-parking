# Oversight Guide
### Albany JW Parking — Volunteer Management Platform

This guide covers everything an oversight user needs to manage volunteers,
send invitations, track RSVPs, log attendance, and administer the platform.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
   - [Site Map](#site-map)
   - [Maps](#maps)
   - [Schedules](#schedules)
   - [Signs](#signs)
     - [Sign Library](#sign-library-registered)
     - [Sign Builder](#sign-builder-overseer)
     - [Sign Map](#sign-map-registered--to-view-overseer-to-edit)
2. [My Account](#2-my-account)
3. [Volunteer Management](#3-volunteer-management)
   - [Notes Report](#notes-report-overseer)
   - [Inbound SMS Messages](#inbound-sms-messages-overseer)
   - [SMS Management](#sms-management-assistant_admin)
4. [Communications](#4-communications)
5. [Scheduling](#5-scheduling)
   - [Schedule Analysis](#schedule-analysis-overseer)
   - [Schedule Analysis Rules](#schedule-analysis-rules-admin)
6. [Attendance](#6-attendance)
7. [Reports](#7-reports)
8. [Decently Sync](#8-decently-sync)
9. [Administration](#9-administration-admin-only)
10. [Role Reference](#10-role-reference)

---

## 1. Getting Started

### Logging In

Navigate to the site and enter your email and password. If you have forgotten
your password, contact an admin — they can send a reset link via email or SMS.

### Home Dashboard *(OVERSEER+)*

After logging in you land on the home page, which shows your upcoming shifts
for the next convention day and the oversight structure. If your role is
OVERSEER or above, three additional cards appear below those:

- **Notes Report** — shows the total number of active intake notes, how many
  you personally have not yet read, open action items, and (when non-zero)
  the count of unresolved inbound SMS messages awaiting review. Tap **Open**
  to go to the full Notes Report.

- **Conflict Analysis** — shows how many violations from the most recent
  schedule-analysis run are still unacknowledged. The severity pills beneath
  the count have an **All / Unacked** toggle: **All** shows the full breakdown
  of every violation in the run by severity; **Unacked** filters to violations
  that still need attention. Tap **Open** to go to the Scheduler, where the
  analysis panel lives.

- **Reports** — a chart carousel with three slides: Slot Fill Rate, Crew
  Attendance, and Staff Usage. Use the **‹** and **›** arrows in the card
  header to move between charts; each slide loads on first view and is cached
  for the rest of the session. Tap **Open** to go to the full Reports page.

### Operations Hub

After logging in, click **Operations** in the navigation bar (visible to
all registered volunteers — REGISTERED and above) to open the Operations
dropdown. Categories are collapsible —
click a category header to expand or collapse its tools. Click **All Tools**
at the top to go to the full hub page, which groups every available tool by
category with descriptions. Which tools appear depends on your role — higher
roles see more options.

### Guided Tours

Pages with guided tours show a **Tour** button in the top-right corner of the
navbar. Clicking it launches a step-by-step walkthrough of that page's layout
and features.

**First-visit prompts:** the first time you visit a page that has a tour, a
prompt highlights the Tour button and asks if you'd like a walkthrough. Four
options:

- **Take the tour** — starts the walkthrough immediately
- **Maybe later** — dismisses the prompt for this visit only (it will
  reappear next time)
- **Don't show again** — permanently hides the prompt on this page
- **Disable all prompts** — permanently hides first-visit prompts on
  every page

The Tour button itself is always available in the navbar regardless of prompt
status — you can start a tour at any time by clicking it.

Tours are context-aware — steps that require data to be present (e.g. shift
cards, assignment badges) are skipped automatically when the page is empty,
so the tour is useful whether you're setting things up for the first time or
reviewing a fully built-out schedule.

On the Timelines page, the tour opens each form modal automatically so you
can see every field. The Save and Delete buttons are disabled while a modal
is open in tour mode — Cancel remains active so you can close the form
manually if needed. Nothing is saved during a tour.

### Site Map

A full index of every page on the platform is available at `/sitemap` (also
linked in the footer and as a card at the bottom of the Operations hub).
Pages are filtered to your current access level — you will only see entries
you can actually navigate to. Use the search box at the top to filter by page
name, description, or path. The sitemap is useful for orientation and as a
quick-jump reference when you know the name of a tool but can't remember where
it sits in the navigation.

### Maps

**Path:** Resources → Maps (navigation bar), or `/maps`

Available to all registered volunteers (REGISTERED and above). The Maps page
lists convention-related map files sourced directly from OneDrive, grouped by
category (e.g. Parking Maps, Pedestrian Maps, Sign Placement Maps).

Each tile shows the map name, description, and last-modified date. Two actions
may be available per tile depending on what has been configured:

- **View / Download** — opens the file in OneDrive (PDF viewer or download).
- **Interactive Map** — opens the live ScribbleMaps version in a new tab for
  a zoomable, pannable view of the same map.

If a ScribbleMaps embed has been configured for a file, a small live map
preview appears on the left side of the tile. Clicking the preview also opens
the interactive map in a new tab.

To add or update maps, place files in the appropriate subfolder under
`Documents for Distribution/Maps/` in OneDrive. To link a file to its
ScribbleMaps counterpart, add or update the `_meta.json` sidecar file in
the same subfolder. See the developer notes in `lib/graphClient.js` for the
JSON format.

### Schedules

**Path:** Resources → Schedules (navigation bar), or `/schedules`

Available to all registered volunteers (REGISTERED and above). The Schedules
page lists published convention day shift schedule PDFs sourced from OneDrive,
grouped by subfolder (typically one subfolder per convention day or event).

Each tile shows the file name, description if provided, last-modified date,
and file size. Click **View / Download** to open the PDF in OneDrive.

**Publishing a schedule** — use the **Publish** button on the
[Schedule Report](#schedule-report-overseer) page. This generates the PDF
from the current day's assignments and uploads it to the `Schedules` folder
in OneDrive automatically; the Schedules page reflects the upload immediately
on next load.

**Adding files manually** — place PDFs in a subfolder under
`Documents for Distribution/Schedules/` in OneDrive.

---

### Signs

**Path:** Signs → Sign Library (`/signs`), Sign Builder (`/signs/builder`),
or Sign Map (`/signs/map`); also linked from the Resources dropdown, the
Oversight dropdown, and the Operations hub.

The Sign system tracks the placards placed around the convention area —
things like **PARKING →**, **LOT FULL**, and **OVERFLOW ↗**. Signs are
managed in three layers:

- **Templates** — the reusable sign design (text + optional default arrow).
  Created in the Sign Builder.
- **Locations** — physical mounting points on the map (a pole, cone,
  a-frame, or existing structure). Each location has GPS coordinates,
  notes, and a photo.
- **Attachments** — a sign template mounted on a location. Multiple signs
  can be stacked on one location (e.g. three signs vertically stacked on
  a telephone pole). Each attachment has its own status (planned / installed /
  removed), arrow direction, and stacking priority.

A single template can be attached to many locations — e.g. one "PARKING →"
template might appear at five street corners. A single location can hold
multiple signs (stacked or, for a-frames, on separate front/back faces).

#### Who can do what

| Role             | Sign Library  | Sign Builder    | Sign Map                |
|------------------|---------------|-----------------|-------------------------|
| REGISTERED       | View only     | —               | View only               |
| KEYMAN           | View only     | —               | View only               |
| OVERSEER+        | View + Archive| Create + Edit   | Place / drag / edit / delete |

DESK does not see signs at all — the role is scoped to attendance and
account creation.

#### Sign Library *(REGISTERED+)*

**Path:** Signs → Sign Library, or `/signs`

The library shows a card for each active sign template with a live preview
of the text and arrow, a short description (if one was set), and a count of
how many placements use this template.

- **Search box** — narrows the grid live by matching sign text or description.
- **New sign** button (top-right) — OVERSEER+ only; opens the Sign Builder.
- **Edit** — OVERSEER+ only; opens the Sign Builder pre-loaded with this sign.
- **Archive** — OVERSEER+ only; soft-deletes the template after confirmation.
  Existing placements survive archival and remain in the database; the
  template just stops appearing in the library and in the Sign Map's
  template picker.

#### Sign Builder *(OVERSEER+)*

**Path:** Signs → Sign Builder, or `/signs/builder` (new) / `/signs/builder/:id` (edit)

A single form for creating or editing a sign template. Templates are
direction-agnostic — the arrow direction is set per-placement on the
Sign Map, so one "DROP-OFF / PICKUP" template can serve all directional
variants as separate placements.

- **Live preview** at the top shows exactly what the sign will look like
  as you type.
- **Sign text** — up to 100 characters. Required.
- **Category** — optional. Determines the icon shown on map markers:
  Parking (blue **P**), Accessible (♿ white-on-blue), Drop-off / Pick-up
  (🧳), Info (ⓘ white-on-black), or Warning / Hazard (⚠ black-on-yellow).
- **Abbreviation** — optional compact label (up to 6 characters). No longer
  displayed on the map but retained in the database for reference.
- **Description** — optional notes about when or where this sign is used,
  up to 500 characters. Visible on the library card.
- **Create sign / Save changes** — saves and redirects back to the library.

#### Sign Map *(REGISTERED+ to view, OVERSEER+ to edit)*

**Path:** Signs → Sign Map, or `/signs/map`

A Google Map showing every sign location as a stacked marker. Each marker
displays the signs attached to that location as a vertical column of
sign-preview blocks. The map starts centred on MVP Arena at street-level zoom.

Key convention buildings (MVP Arena, MVP Parking, OGS East Garage) are
highlighted with colored polygon outlines on both the interactive and
print maps. Building outlines are sourced from a KML file and update
without a code change — just drop in a new export from Google My Maps.

**Layout:** sidebar on the left with filters, layer toggles, and the
location list; Google Maps on the right. A printer icon in the sidebar
header opens the printable map view in a new tab. A vertical grip tab
on the left edge of the map opens a slide-out legend panel.

##### Filters & Layers

Two filter controls narrow both the map markers and the sidebar list:

- **Status chips** — All / Planned / Installed / Removed
- **Sign template** — dropdown to see only locations with a specific
  template attached

Below the filters, layer toggle switches control map overlays:

- **Traffic arrows** (on by default) — shows/hides all traffic arrow
  markers on the map.
- **Sign facing** (off by default) — when enabled, locations with
  arrow-linked signs display radial chevron pills indicating which
  direction each group of signs faces. Bearing is derived from linked
  traffic arrows. Hover a single pill to see only the signs facing
  that direction; hover the center disc to see all signs. Each sign
  row in the expanded overlay includes a small directional chevron
  matching its facing bearing. Pills scale smoothly with zoom so they
  track a roughly constant ground distance.
- **Sign count** (on by default) — shows a count badge at 45° (NE)
  of each compact marker indicating how many signs are attached.
- **Placement ID** (on by default) — shows a "P1", "P2", … badge at
  135° (SE) of each marker. These sequential IDs are for
  cross-referencing markers against printed reports or field sheets.
  Numbering is always gapless — if a location is deleted, all later
  IDs shift up.

When **Sign facing** is enabled, the **Sign count** and **Placement ID**
toggles are automatically disabled (dimmed) since facing mode uses its
own per-pill count and the badges would overlap the radial layout.

##### Markers

Each marker renders the attached signs as a vertical stack of sign-preview
blocks (sign text + arrow direction), with status indicated by the border
color of each sign in the stack:

- Orange border = planned
- Green border = installed
- Red border = removed

Empty locations (no attachments yet) show a dashed "empty" placeholder.
Custom marker colors override the default status-based coloring and
apply to the outer marker wrapper.

##### Adding a location *(OVERSEER+)*

1. Click **Add location** in the sidebar.
2. The cursor becomes a crosshair and a hint appears.
3. Click the spot on the map — a blue dashed "New" marker appears and the
   editor slides in from the right.
4. Set the mount type, location notes, then click **Save**.
5. Once saved, the **Attached Signs** section appears — add signs to the
   location using the inline form.

The GPS button next to "Add location" drops a new location at your current
device position without needing to tap the map.

##### Interacting with markers

**Single click** a marker or sidebar row to open a read-only **info sheet**
showing the location's signs, status, mount type, notes, photo, and
coordinates. For OVERSEER+ users an **Edit** button in the info sheet
opens the full editor.

**Double-click** a marker to jump straight to the editor (OVERSEER+).

**Right-click** a marker for a context menu with **Edit** and **Delete**
(OVERSEER+).

**Hover** a traffic arrow marker to see a repeating **direction pulse** —
five ghost arrows flash tail-to-head in orange showing the direction of
travel.

Clicking empty map space deselects the active marker and dismisses all
overlays. **Escape** cascades: dismiss context menu → exit placement mode
→ deselect.

##### Editing a location *(OVERSEER+)*

Open the editor via double-click, the info sheet's Edit button, or the
right-click context menu. The editor has two sections:

**Location fields:**
- Coordinates (lat/lng) with an "Update to my location" GPS button
- Mount type (Pole / Cone / A-frame / Existing structure)
- A-frame bearing (shown only for a-frames — the compass direction the
  front face points toward; back = front + 180°)
- Marker color palette
- Location notes
- Photo section (Take Photo / Upload / Replace / Remove)

**Attached Signs:** a draggable list of all signs mounted on this location,
ordered top-to-bottom by stacking priority. Each attachment row shows:
- **Drag handle** (⋮⋮) — drag to reorder. The new order is saved
  automatically and the map marker updates to match.
- **Sign name + arrow** — the sign text and its per-attachment arrow direction.
- **Face badge** — "FRONT" or "BACK" (only shown for a-frame locations).
- **Status badge** — click to cycle through planned → installed → removed.
  Status changes are saved immediately.
- **× button** — remove the sign from this location (with confirmation).

Click **Add sign to this location** to expand an inline form:
- Sign template picker
- Arrow direction picker (per-attachment; defaults to the template's arrow)
- Face selector (shown only for a-frame mount types)

**Drag to reposition:** drag any marker directly on the map to move it.
All overlays (info sheets, context menus) are automatically hidden during
the drag so the marker is unobstructed. The new coordinates are saved
when you release.

**Delete** removes the location and all its attached signs.

##### View-only mode

REGISTERED and KEYMAN users can see all locations and their attached signs,
but the Add button, drag handles, status cycling, and Save/Delete buttons
are hidden.

##### Printable Map

Click the **printer icon** (🖨) in the sidebar header to open a
print-optimised view in a new tab.

The print page shows a WYSIWYG preview sized for letter-portrait paper
(7 in × 7 in map area). Five layer toggles in the toolbar control what
appears on the map:

- **Arrows** — traffic arrow chevrons and connector lines linking
  arrows to their sign locations
- **Expand** — placement detail level; OFF shows compact disc markers,
  ON shows full sign pills (or radial sign pills when Facing is active)
- **Facing** — placement style; OFF shows linear pill rows, ON shows
  radial chevrons indicating sign bearing direction
- **Count** — attachment count badges on compact markers
- **Placement ID** — P1/P2/… badges on compact markers

Count and Placement ID are auto-disabled when Expand or Facing is active.
Convention buildings are highlighted with the same colored polygon
outlines shown on the interactive map. A legend below the map shows
sign types, status dots, mount types, and location count.

Toolbar controls (Road / Hybrid toggle, status and template filters, fit
button) let you frame the view. Click **Print** to open the browser print
dialog — what you see on screen is what prints.

**Publishing:** OVERSEER+ users see a **Publish** button next to Print.
Clicking it generates a PDF snapshot of the current map view (with the
active filters) and uploads it to both SharePoint and the site's file
storage. A green toast confirms success with a direct SharePoint link.
The published PDF appears automatically on the **Maps** resource page
for all volunteers to download.

##### Legend

A slide-out **Legend** panel sits on the left edge of the map (click
the grip tab to open/close). It shows sign type icons (colored pills),
status dot colors, mount type icons, and a keyboard shortcut reference.

##### Geofencing — proximity tracking *(manageSigns)*

The floating GPS button in the bottom-right corner of the map toggles
continuous location tracking. When active:

- A **blue pulsing dot** shows your live position on the map.
- The map **auto-follows** your position. Panning or zooming manually
  pauses auto-follow for 5 seconds, then it resumes.
- When you come within **75 metres** of a placement, a **proximity bar**
  slides up from the bottom of the screen showing the sign preview,
  your current distance, a photo thumbnail, and one-tap status buttons.
- The **× dismiss button** hides the bar for that placement until you
  leave and re-enter its radius.
- Tap the GPS button again to **stop tracking**.

Geofencing requires the browser's geolocation permission.

##### Coming soon

- **Route visualization** — directed bearings per sign, road-traced
  paths between traffic arrows and sign locations.

---

## 2. My Account

Click your initials in the top-right corner and select **My Account**.

From here you can update your:
- **Contact info** — email, phone, SMS capability, WhatsApp ID
- **Personal info** — date of birth, gender, stamina rating
- **Congregation info** — assigned congregation or visiting details
- **Spiritual info** — privileges (pioneer, elder, ministerial servant, etc.)
- **Additional notes** — anything else the parking team should know
- **Password** — via the Change Password panel inside the Contact section
- **My Availability** — define blackout windows (times you are unavailable)
  for each convention day. The interactive timeline shows all three convention
  days simultaneously. Drag handles to set a window, snap to session boundaries,
  and add an optional reason. The scheduler will avoid placing you in overlapping
  shifts.

You can also view your **Convention Invitations** — a read-only panel showing
all invitations sent to you for the current convention year, including your
RSVP response and the date you responded.

Click **Finalize Changes** after editing to save all sections at once.

---

## 3. Volunteer Management

### Notes Report *(OVERSEER+)*

**Path:** Operations → Volunteer Management → Notes Report, or
`/oversight/tools/notes-report`

Surfaces the free-text intake notes volunteers submit during registration and
provides a structured workflow for acknowledging, actioning, and resolving them.
Inbound SMS messages from volunteers are also surfaced here.

**Four tabs:**

**All Notes** — every volunteer with a non-null intake note. Click any row to
open the detail modal. Opening a note records your read (per-overseer — each
overseer's first click is logged independently; re-reading updates the timestamp).
The modal shows the full note text, a read-by chip list, linked action items, and
a Dismiss button (visible when there are no active action items). Inbound SMS
messages also appear on this tab as separate cards when they arrive.

**Actionable** — action items from both intake notes and inbound SMS messages,
filtered to incomplete items only. Each card shows the volunteer name, note preview,
and a status badge: *Needs review* (null), *Solution found* (true), or *No solution*
(false). Completed items automatically drop off this tab. Click a card to open the
action detail modal where you can set the solution state, enter a solution description,
and mark it complete.

**Solutions Summary** — all action items where a solution has been identified,
grouped by completion state. Filter between All, Pending, and Completed. Mark
actions complete here via the action detail modal.

**Archived** — two sections: dismissed intake notes and resolved inbound SMS messages.
Dismissal is team-level (one overseer dismissing removes the note for everyone). A
note can only be dismissed when it has no active action items. Each dismissed card
shows who dismissed it and when — click **Restore** to return it to All Notes.
Resolved SMS messages appear in the lower section with their AI category badge.

**Creating an action item:**
Open a note from All Notes, then click **Create Action Item**. The action detail
modal opens immediately for you to set the solution state and description.
Multiple action items can exist per volunteer. Use the action detail modal to:
- Set *Solution found* (Yes / No / Not possible / Reset to pending)
- Enter a solution description (shown when Yes is selected)
- Mark the action complete once the solution is implemented
- Delete the action if created in error

**Scheduler integration:**
Volunteer pool pills in the Scheduler show a `NOTE` amber badge when the
volunteer has an active, non-dismissed intake note. Right-click any such pill and
choose **View Note** to open a floating note panel without leaving the Scheduler.
The panel shows the note text, read-by list, action item statuses, a Create Action
button, and a link to the full Notes Report.

---

### Inbound SMS Messages *(OVERSEER+)*

When a volunteer sends a freeform reply to a Twilio SMS (anything other than
a standard check-in code), the message is automatically analyzed by AI and
routed to the Notes Report for oversight review.

**What happens:**
1. The AI summarizes the message, assigns a category (scheduling concern,
   availability, general inquiry, etc.), extracts action items, and suggests
   scheduling blackouts when relevant.
2. A **volunteer action** is created and appears in the **Actionable** tab.
3. Overseers receive an SMS + email notification.

**Resolving an SMS message:**
- Open the message card from **All Notes** to see the raw text, AI summary,
  category, and action items.
- If the AI suggested blackout windows, use the **Scheduling Constraints**
  panel in the Scheduler to review and apply them.
- When all suggested actions are applied the message is **auto-resolved** and
  moves to the Archived tab. You can also manually mark it resolved using the
  **Resolve** button in the detail modal.

> **Note:** SMS replies that match a shift check-in code (≤8 characters)
> continue to be processed by the existing check-in pipeline and are not
> surfaced in the Notes Report.

---

### Edit Volunteer *(OVERSEER+)*

**Path:** Operations → Edit Volunteer

Search for a volunteer by name. Click their row to open their full profile,
which mirrors the My Account layout. You can edit any section and save
changes on their behalf.

The **Assignment & Role** section (collapsed at top) lets you set:
- Their role (REGISTERED or KEYMAN — OVERSEER+ only)
- Crew assignments: Lots & Garages, Signs, Security, Mobile Support, Dropoff & Pickup, Desk

The **Convention Invitations** section (collapsed at bottom) shows all
current-year invitations for this volunteer. Use the Yes / No / Maybe /
Pending buttons to record a verbal RSVP — saves immediately without going
through Finalize. Clicking the active button a second time clears the
response back to Pending. Revoked invitations are shown read-only.

The **Delegated Permissions** section appears inside the Assignment & Role
accordion for ADMIN and ASSISTANT_ADMIN users only. It contains a single
toggle:

- **Manage sign locations** — grants `manageSigns` to this volunteer without
  promoting them to OVERSEER. When enabled, the volunteer can create, edit,
  drag, and delete sign locations and manage attachments on the Sign Map,
  identical to an OVERSEER. The toggle takes effect on their next login.

Click **EDIT** in the Assignment & Role section to enable the toggle, then
**Finalize Changes** to save.

### Create Volunteer *(OVERSEER+)*

**Path:** Operations → Create Volunteer

Fill in name, email, phone, and congregation details. The system checks for
potential duplicates (matching email, phone, or name) before creating the
account and will surface any matches for review.

A temporary password of `lastName + 1914` is set automatically. The volunteer
should change it on first login.

### Role Management *(ASSISTANT_ADMIN+)*

**Path:** Operations → Role Management

View all volunteers and their current roles. Click a volunteer's row to open
the role editor. You can assign any role strictly below your own level.

> **Note:** ASSISTANT_ADMIN cannot modify ADMIN accounts.

### Volunteer Account Oversight *(ASSISTANT_ADMIN+)*

**Path:** Operations → Edit Volunteer (oversight tab)

Filter the volunteer dropdown by **Active / Inactive**, **Male / Female**, or registration status. Filters combine — e.g. Active + Female shows only active female volunteers.

- **Deactivate** — marks a volunteer as inactive for the current year.
  All saved scheduler slot assignments for that volunteer are automatically
  purged on deactivation so they cannot silently re-occupy filled positions
  if reactivated later
- **Delete** — soft-deletes the account (preserves data, removes from active lists)
- **Reinstate** — restores a deleted volunteer to their previous status

### SMS Management *(ASSISTANT_ADMIN+)*

**Path:** Operations → SMS Management, or Operations → Edit Volunteer → SMS tab

View and manage volunteer SMS opt-in and opt-out status. The tab loads lazily
when first activated and can also be reached directly via `/editVolunteer?tab=sms`.

#### Status values
- **Opted In** — volunteer has consented to receive SMS (via RSVP, admin toggle, or UNSTOP reply)
- **Opted Out** — volunteer replied STOP to a Twilio message, or was manually opted out
- **Never** — volunteer has never opted in

#### Filters
Use the **All / Opted In / Opted Out / Never** buttons to narrow the list.
The search box filters by name in real time.

#### Manual toggle
- **Opt Out** — immediately stops SMS delivery to this volunteer (mirrors Twilio STOP)
- **Re-opt In** — restores SMS delivery with source recorded as `admin`

> **Note:** The alert scheduler hard-blocks SMS sends to opted-out volunteers
> regardless of this setting — opt-out is always respected at send time.

---

## 4. Communications

### Campaign Center *(OVERSEER+)*

**Path:** Operations → Campaign Center

The primary tool for sending convention invitations to volunteers.

#### Sending a New Campaign

1. Select **New Campaign** mode.
2. Enter a campaign name and optional subject line.
3. Choose the **Convention Event** — selects the day and shift volunteers are
   being invited to. Only shifts marked as "invitable" in Timelines appear here.
4. Choose the delivery channel: **Email**, **SMS**, or **Both**.
5. Write your message. Use merge fields to personalize:
   - `{{firstName}}` — volunteer's first name
   - `{{lastName}}` — volunteer's last name
   - `{{rsvpLink}}` — the volunteer's unique RSVP link (required for invitations)
6. Select volunteers from the list. Use the filters to narrow by **Active** status, **Gender**, **Role**, or **Crew**, then use the search box to find by name. Filters combine — e.g. Active + Female + Lots & Garages shows only active female L&G volunteers. Selections persist when filters change, so you can build a send list across multiple filter passes.
7. Click **Send**. If any selected volunteers already have an unanswered
   invitation for this event, a warning appears — confirm to re-send or
   deselect them. No confirmation dialog appears for a normal send.

#### Adding to an Existing Campaign

Switch to **Add to Existing** mode. Select a previous campaign batch — the
subject and message pre-fill from that batch. Click **View original message**
next to the batch name to expand the saved subject and body inline — useful
for verifying the wording before adding new recipients. Add volunteers and send.
All new invitations are linked to the same campaign for tracking purposes.

#### Follow-up Mode

Switch to **Follow-up** mode to send a message to volunteers who haven't
responded to a previous campaign. Select the parent campaign and the system
pre-filters to pending/unanswered recipients. When opened from the Invitation
Tracker's **Remind** button, the pending volunteers are also auto-selected.

#### Response Configuration

When **Response needed** is checked, a response config builder appears below it.
Choose one of three types:

- **Standard** — use any combination of Yes, No, and Maybe. All three are
  checked by default. Uncheck any you don't want to offer.
- **Custom** — enter your own response labels, one per line (e.g. "Friday Only",
  "Saturday Only", "All Three Days"). Volunteers see buttons for each option.
- **Poll** — enter a question and options (one per line). The question replaces
  the default "Will you be volunteering..." prompt on the RSVP page.

Any type can also enable **Allow "Other" with free-text input** — adds an
"Other" button that, when clicked, reveals a text field. The volunteer's typed
answer is stored and visible in the Invitation Tracker response column.

If you leave response config at its default (all three standard options, no
Other), no config is stored — existing RSVP links and tracker display are
fully unaffected.

#### Templates

Save and reuse message templates via the Templates panel. Templates can
include merge fields and are available across all campaigns.

---

### Invitation Tracker *(OVERSEER+)*

**Path:** Operations → Invitation Tracker

View all sent invitations for the current year. Filter by:
- **Campaign** — see all invitations from a specific batch
- **Convention Day** — filter to a specific day
- **Response** — Yes, No, Maybe, Pending (custom/poll responses display as badges in the response column)
- **Gender** — Male or Female
- **Show Revoked** — toggle to include/exclude revoked invitations

#### Stat Cards

The six cards (Total Sent, Yes, No, Maybe, Pending, Revoked) update live as you
apply filters — they always reflect deduplicated volunteer counts from the
visible rows, not the raw invitation total. A volunteer who appears in both a
parent campaign row and a follow-up row is counted only once, in the bucket
matching their most definitive response.

> **Note:** The Pending card does not respond to clicks. Filtering the table to
> "pending" only is intentionally disabled because it hides responded rows that
> the deduplication logic needs to correctly classify volunteers — which would
> cause the pending count to inflate.

#### Campaign Families

Follow-up campaigns (child batches) are merged into their parent in the tracker.
When you select a parent campaign in the filter, its follow-up children are
automatically included and each volunteer is shown once with their effective
response across all sends in the family. Selecting a child batch in the dropdown
resolves to the parent family view automatically.

The group note below the campaign dropdown ("Includes N follow-up campaigns")
confirms how many child batches are included in the current view.

> **Tip:** When two separate sends (e.g. email and SMS) were accidentally
> created as independent top-level campaigns with the same name rather than
> as one campaign with both channels, they will appear as separate families
> and volunteers will be counted twice. Fix this in the DB by setting the
> later batch's `parent_batch_id` to the earlier one's id.

#### Campaign-level Actions

When a campaign is selected in the **Campaign** filter:

- **Remind N pending** (amber button, top-right) — opens the Campaign Center
  pre-loaded with the selected campaign and all pending volunteers already
  selected. Pending is calculated across the whole campaign family — a
  volunteer who responded to any send in the family is not counted as pending.
  Only appears when the selected campaign has **Response needed** enabled.
- **Edit campaign** (pencil icon next to the Campaign dropdown, ADMIN only) —
  opens a modal to rename the campaign, edit its saved message, change its
  parent campaign, toggle **Response needed**, or deactivate it.

#### Actions Per Row

- **Revoke** — cancels an invitation. The volunteer's RSVP link will show a
  "no longer active" message if they try to use it.
- **Reinstate** — restores a previously revoked invitation.

#### Add Volunteers

When a campaign is selected, an **Add volunteers to this campaign** button
appears in the filter bar. It opens the Messaging Center in Add to Existing
mode pre-set to that campaign.

---

### Send Reset Link *(ASSISTANT_ADMIN+)*

**Path:** Operations → Send Reset Link

Send a password reset or account completion link to a volunteer via email
or SMS. Two tabs:

- **Draft** — volunteers who haven't completed registration. Sends a resume link.
- **Registered** — completed volunteers who need a password reset.

Each channel (email/SMS) enforces a 24-hour cooldown per volunteer to prevent
accidental spam. The cooldown countdown is shown on each row.

---

## 5. Scheduling

### Timelines *(OVERSEER+)*

**Path:** Operations → Timelines

Manage the convention schedule hierarchy: **Days → Sessions → Shifts**.

#### Convention Days

Click **+ Add Day** to create a new convention day. Each day has a label
(e.g. "Day 1"), date, and program start/end times.

The **Copy Day** button duplicates an entire day including all its sessions,
shifts, and schedule assignments — useful for setting up similar days quickly.

#### Sessions

Expand a day to manage its sessions. Each session has a label (e.g. "Morning"),
order, and start/end time. Sessions group shifts for display purposes.

#### Shifts

Expand a session to manage its shifts. Each shift has:
- **Parking Meeting toggle** — marks the shift as a crew-agnostic meeting (e.g.
  a 6:15 AM keyman briefing). Meeting shifts have no department, appear in a
  dedicated "Meetings" column in the Scheduler, and use the `MT` SMS code prefix.
  Toggling this on hides the department selector and the KM/KA toggles.
- **Label** — display name for the shift
- **Start / End time** — use the native time picker (AM/PM) to avoid ambiguity
- **Scheduler Dept** — which crew column the shift occupies in the Scheduler grid.
  Hidden when the Parking Meeting toggle is on.
- **Keyman / KM Asst toggles** — control whether a Keyman (KM) and/or Keyman
  Assistant (KA) drop zone appear in the Scheduler for this shift. Both default to
  on. KA requires KM — disabling Keyman automatically disables KM Asst. Hidden for
  meeting shifts.
- **Volunteer need** — how many volunteers are required
- **Schedule Assignments** — locations attached to this shift, each with
  **Min**, **Target**, and **Max** volunteer counts. These drive slot
  color-coding in the Scheduler (red = below min, grey = up to target,
  faded = up to max). Meeting shifts have no schedule assignments.
- **Invitable toggle** — the envelope button marks a shift as available for
  invitations in the Messaging Center. Yellow = invitable.

All six forms (Event Type, Convention Day, Copy Day, Session, Shift, Assign
Location) open as Bootstrap modals. The Delete button sits on the far left
of the modal footer, separated from Save and Cancel, to prevent accidental
deletion.

---

### Rendezvous Points *(KEYMAN+)*

**Path:** Operations → Rendezvous Points

A rendezvous point tells volunteers exactly where to meet for a specific shift
at a specific location — description, address, floor number, GPS coordinates,
and an optional photo.

#### Who can do what

| Action | Minimum Role |
|---|---|
| View rendezvous details | REGISTERED |
| Edit fields, upload/clear photo | KEYMAN |
| Create a new rendezvous point | OVERSEER |
| Delete a rendezvous point | OVERSEER |

#### Landing page

The landing page shows an accordion of convention days. Expand a day to see all
shift + location pairs that have a rendezvous point set. Click any card to open
the editor panel. Use the **Filter by shift type** dropdown to narrow the list by department.

A green dot means a rendezvous point is set; grey means none exists yet.

#### Editor panel

The editor panel appears as a floating card and is used on the landing page,
the Scheduler (right-click a shift block header), and the Timelines page
(click the map-pin icon on an assignment badge). It shows:

- **Description** — free text describing the meeting spot
- **Address** — optional street address
- **Floor** — flexible label (e.g. "B1", "G", "2nd")
- **Latitude / Longitude** — enter manually or tap **GPS** to capture your
  phone's current location
- **Photo** — upload an image (camera-capable on mobile). The photo is
  processed and stored in Azure Blob Storage.

KEYMAN users can edit any field and upload or clear the photo, but only
OVERSEER+ can create a new rendezvous point or delete one entirely.

#### Time guard

Editing is unrestricted when a shift starts in more than 15 minutes. Within
the ±15-minute window around shift start, saving prompts a confirmation:

> *"This shift starts in X minutes. Saving will send an update alert to
> all N assigned volunteers. Continue?"*

If confirmed, an ad-hoc SMS is sent to every SMS-eligible volunteer assigned
to that shift + location. After 15 minutes into a shift, editing is locked.

#### SMS integration

Rendezvous details are automatically appended to T-15 shift alert messages.
When a photo exists, the SMS also includes a link to a lightweight detail page
that shows the full info and photo without requiring login.

---

### Scheduler *(OVERSEER+)*

**Path:** Operations → Scheduler

A drag-and-drop interface for assigning volunteers to shift slots across a
convention day.

#### Setup prerequisites

Before the Scheduler can display a grid, each shift in Timelines must have
a **Scheduler Dept** selected from the category dropdown in the shift form.
Shifts without a category (i.e. meeting shifts with **Parking Meeting**
toggled on) are shown in the dedicated Meetings column rather than a crew
column. All other shifts without a category are excluded from the grid.

Schedule assignments on those shifts should also have **Min** and **Max**
set alongside the Target (volunteer need) in Timelines so the slot
color-coding renders correctly.

#### Using the Scheduler

1. Select a **Convention Day** from the sidebar picker.
   The schedule grid loads automatically — rows at 15-minute resolution,
   columns organised by department. Departments with multiple locations
   (e.g. Security at MVP Garage and OGS Parking Garage) display one
   sub-column per location under a shared department header.
2. The **Volunteer Pool** in the sidebar lists all active registered volunteers.
   - Filter by **Rank** to narrow to Registered, Keyman, or Overseer+.
   - Filter by **Department** to show only volunteers with the matching crew flag.
   - Filter by **Gender** to narrow to Male or Female volunteers.
   - Filter by **Sort** to order the pool by last name, rank, or department.
3. **Drag** a name pill from the pool onto any highlighted drop zone in the grid.
   - Drop zones are color-coded: pink = required slots (below vol_min), blue =
     ideal slots (up to vol_target), grey = extra slots (up to vol_max).
   - **KM** slots (deeper blue) require KEYMAN or above. **KA** slots (cyan)
     accept any rank. Both are controlled per-shift via the Keyman / KM Asst
     toggles in Timelines — if a shift has no KM slot, the drop zone does not
     appear and no KM can be assigned to it.
   - Department drop guards automatically reject volunteers who lack the crew
     flag for that department — the zone will not highlight for ineligible drags.
   - **Auto-routing:** dropping a pill on an occupied slot, or on a KM/KA slot
     the volunteer's rank cannot fill, automatically places the volunteer in the
     next available volunteer slot within that same shift. If no empty volunteer
     slots remain, the drop is rejected.
   - **Short shifts:** shift blocks that are too short to display all their drop
     zones show a gradient fade at the bottom. Hover over the block for about one
     second and it expands to reveal the full set of slots. Moving the mouse away
     collapses it back.
4. **Return** a pill to the pool by dragging it back onto the sidebar pool area.
   The slot assignment is deleted from the database immediately.
5. Assignments **persist across sessions** — selecting a day reloads any
   previously saved work automatically.

#### Undo / Redo

Every assignment and unassignment can be reversed:

- **Undo** button (or Ctrl+Z) — reverses the last action, mirroring the change
  in the database.
- **Redo** button (or Ctrl+Y / Ctrl+Shift+Z) — re-applies the last undone action.
- History clears automatically when a different convention day is selected.

### Schedule Report *(OVERSEER+)*

**Path:** Operations → Scheduler → Report button in day banner

A printable per-department schedule report for one convention day. After
assigning volunteers in the Scheduler, click **Report** in the day banner
to open the report in a new tab.

**Layout:**
- Departments appear in alphabetical order, each as its own section, with a
  page break between departments when printed.
- Within each department, shifts appear in time order (earliest first). Each
  location is a column card listing the **KM** (blue), **KA** (teal), and
  regular volunteers sorted alphabetically by last name.
- The **Day** picker in the toolbar switches days without leaving the page.

**Printing / Downloading:**
Click **Print / Save PDF** to open the browser print dialog. Choose
*Save as PDF* in the destination to download a PDF version. The report
hides all browser chrome and navigation when printed.

**Publishing:**
Click **Publish** to generate a PDF of the current schedule, upload it to
OneDrive, and notify all Overseers+ and scheduled volunteers via email and
SMS. Notification links open the PDF directly through the app — no Microsoft
sign-in required. A **Dry run** option uploads the PDF without sending
notifications, useful for verifying layout before a real publish.

---

### Right-click context menu

Right-clicking any **volunteer name pill** opens a context-sensitive menu (see
below). Right-clicking a **shift block header** (the shift name or time label,
not a pill or dropzone) opens a shift-level menu with a single action:

- **View / Edit Rendezvous** — if a rendezvous point is already set for this
  shift + location, opens the editor panel with the current data.
- **Set Rendezvous** — if no rendezvous exists yet, opens the editor panel in
  create mode (OVERSEER+ only).

The rendezvous data is preloaded when you select a convention day, so the menu
knows instantly whether an RV exists.

Right-clicking any volunteer name pill opens a context-sensitive menu.

**When right-clicking a pill inside a shift slot:**
- **Remove from Slot** (red) — immediately unassigns the volunteer and
  records the deletion in the undo stack.
- All pool actions below also appear.

**When right-clicking a pill in the pool (or in a slot):**
- **View / Edit Volunteer** — opens the volunteer's oversight profile in a
  new tab.
- **View Note** — appears only when the volunteer has an active intake note
  (amber `NOTE` badge on their pill). Opens a floating note panel showing
  note text, reads, action statuses, a Create Action button, and a link to
  the full Notes Report.
- **Today's Assignments (N)** — opens a floating panel showing every shift
  the volunteer is currently placed in, grouped by department with times.
  The panel stays open until you click × or press Escape.
- **Highlight on Grid** — pulses a gold outline on every shift block the
  volunteer currently occupies so you can spot them at a glance.
- **Copy Name** — copies the volunteer's display name to the clipboard.
- **Scheduling Constraints (N)** — appears when the volunteer has AI-suggested
  scheduling blackouts pending oversight review (sourced from note analysis or
  an inbound SMS). Opens a floating constraints panel showing each pending
  suggestion with its resolved day, start, and end time. For each suggestion you
  can edit the time fields, click **Apply Blackout** to create the blackout and
  dismiss the suggestion, or click **×** to dismiss it without applying. An
  **Interpret** form at the bottom lets you type free text (e.g. "can't do
  Saturday morning") and have the AI convert it to a structured blackout
  suggestion for review. Applying all suggestions for an SMS message
  automatically marks that message resolved in the Notes Report.
- **Manage Blackouts** — opens a panel showing this volunteer's unavailable
  time windows for the current day. Requires a convention day to be selected
  (the item is disabled with a tooltip otherwise). The add form offers five
  modes selected via radio pills:
  - **Custom** — enter a free-form start and end time.
  - **Session** — select a program session; the blackout spans the full
    session window.
  - **Shift** — select a session then a specific parking shift; the blackout
    spans that shift's time range.
  - **Pre-session** — select a session; the blackout covers the period from
    the earliest shift start up to the session program start (i.e., the
    ingress/arrival window before the program begins).
  - **Full Day** — blocks midnight to midnight, overlapping every possible
    shift on the selected day(s).
  All modes include a **Days** row of toggle pills so a single Add can create
  matching blackouts across multiple convention days at once. The reason field
  is shared and auto-filled for non-Custom modes (editable before saving).
  Delete any existing blackout with the × button. Blackouts are loaded into
  the conflict tracker when a day is selected — the scheduler will warn before
  placing the volunteer into an overlapping slot.
- **Message Volunteer** — not yet active (shown with a "soon" badge).

#### Quick navigation

The scheduler sidebar header includes three icon buttons for fast navigation
between related pages: **Conflict Grid**, **Crew Assignments**, and **Role
Management**. Hover any button to see a tooltip.

---

### Pool pill behaviour

Pool pills **never leave the pool**. Dropping a pill into a shift slot
places a lightweight copy in that slot; the original remains in the pool
and can be dragged to additional non-overlapping shifts. An amber **N×**
badge on a pool pill indicates N active assignments for that volunteer
today.

Pills carry a subtle **gender tint** — a pale blue background for male
volunteers and pale pink for female — for quick visual scanning. The tint
is suppressed by the green **assigned** indicator when both apply. Only
volunteers with `active_current_year = 1` and `registration_status ≠ deleted`
appear in the pool.

### Time-conflict guard

If a volunteer already has an assignment or blackout window that overlaps
the target slot's time range, a **conflict modal** appears describing the
clash. You can choose **Place Anyway** to override, or **Return to Pool**
to cancel the drop.

**Security and Signs** departments are exempt from the drag-level hard block
because overlapping coverage is by design for both (e.g., a Signs volunteer
on morning Ingress and afternoon signs placement). For these departments a
conflict modal still appears — choose **Place Anyway** to confirm the
overlap or **Return to Pool** to cancel. All other departments are blocked
at the drag level and cannot be dropped into a conflicting slot at all.

If a conflict is overridden, the DZ pill displays a `⚠` badge. Right-clicking
that pill lists the specific conflicts under the **Remove from Slot** action
so oversight can see exactly what is clashing.

### Blackout windows

Blackouts mark a volunteer as unavailable for a specific time range on a
convention day. They are managed via **Manage Blackouts** in the right-click
context menu on any volunteer pill. Unlike shift assignments, blackouts have
no associated slot — they exist only to trigger the conflict guard. Adding
or removing a blackout immediately re-evaluates any existing DZ pills for
that volunteer and updates their `⚠` badges live — deleting a blackout
clears the badge instantly without a page refresh.

Blackouts can span multiple convention days in a single action. Select the
desired days using the Days toggle pills in the add form; each selected day
receives its own blackout record. The conflict detector only updates live for
the currently loaded day — blackouts on other days take effect when those
days are loaded.

---

#### Department column controls

The yellow day banner contains a **Columns:** row with one colored pill per
department:

- **Click** a pill to hide that department's columns. The grid collapses those
  columns immediately. Click the pill again (it shows a ⦸ symbol when hidden)
  to restore them.
- **Drag** a pill onto another to swap their column order. Hold and move more
  than a few pixels to enter drag mode; release over the target pill to confirm
  the swap.

---

### Volunteer Schedule *(OVERSEER+)*

**Path:** Operations → Volunteer Schedule

Look up any volunteer's shift assignments across all convention days.

1. Type a volunteer's name in the **search bar** — results appear as you type
   (minimum 2 characters). Click a result to load their schedule.
2. The report shows all days with assignments, each listing the shift name,
   time range, department, location, and role (Keyman, Keyman Asst, or
   Volunteer). KM/KA contact info is shown for non-leadership volunteers.
3. Use the **Day** dropdown to filter to a single convention day.
4. Use the **Crew** filter chips to toggle departments on or off.
5. Click **Print** to open the browser print dialog (each day gets a page break).
6. Click **Send** to deliver the schedule to the volunteer via SMS or email.
   The modal shows which channels are available based on the volunteer's
   contact info on file.

> **Volunteer self-service:** Volunteers with REGISTERED+ access can view their
> own schedule at `/my-schedule` (linked from My Account, Resources, and the
> home page "Full Schedule" button). Same layout, same filters, same print —
> but restricted to their own assignments. They can also send it to themselves.

---

### Scheduler Categories *(ASSISTANT_ADMIN+)*

**Path:** Operations → Timelines → Scheduler Categories button

Manage the categories used to organize shifts in the Scheduler grid and
Timelines views. Each category has:

- **Machine key (`dept_key`)** — a stable internal identifier that never
  changes (e.g. `lots_and_garages`). Set once on creation; not editable.
- **Display name** — the label shown in the UI (e.g. "Lots & Garages").
  Editable at any time.
- **Color** — hex color used for shift badges and scheduler column headers.
- **Sort order** — integer controlling the order categories appear in the
  Scheduler grid (lower = further left).
- **Active / Inactive** — inactive categories are hidden from the shift
  creation dropdown.

Eight categories are seeded at setup. The parking crew categories
(Lots & Garages, Signs, Security, Drop-off/Pickup, Mobile Support) default
to **Open** visibility. Information Desk, Count, and Support default to
**Restricted** visibility.

#### Editing a category *(ASSISTANT_ADMIN+)*

Click the pen icon on any row to open the edit modal. You can change the
display name, color, sort order, and active flag. The machine key is not
shown or editable in the edit modal — it is fixed at creation.

#### Adding a category *(ASSISTANT_ADMIN+)*

Click **Add Category**. The modal shows a **Machine Key** field (required,
unique, letters and underscores only), along with the display name, color,
and sort order. The machine key cannot be changed after creation.

#### Schedule visibility *(OVERSEER+)*

The **Visibility** column shows whether each category's shifts are visible
to all volunteers or restricted to a named list.

- **Open** (grey, unlocked) — all volunteers can see shifts of this category.
- **Restricted** (red, locked) — only OVERSEER+ and volunteers explicitly
  granted access can see shifts of this category.

Click the lock button to toggle between Open and Restricted. The change
takes effect immediately — volunteers below OVERSEER who are not on the
access list will not see restricted shifts on their home page, schedule
report, or any invitation-linked shift context.

#### Managing access grants *(OVERSEER+)*

When a category is Restricted, a **👥 Users** button appears next to the
lock. Click it to open the access management panel for that category:

- **Grant access** — type at least 2 characters in the search field to find
  volunteers by name. Click a name in the dropdown to select them, then
  click **Grant**. The grant takes effect on the volunteer's **next login**.
- **Revoke access** — click the **Revoke** button next to any listed
  volunteer. Revocation takes effect on their next login.

OVERSEER+ always has full access regardless of grants.

> **Note:** Marking a category Restricted hides its shifts from already
> logged-in volunteers at their next page load, but the session-level
> access list (`sensitiveCategories`) is not refreshed mid-session. For
> changes that need to take effect immediately, ask the volunteer to log out
> and back in.

---

### Locations *(OVERSEER+)*

**Path:** Operations → Locations

Define parking locations used in shift schedule assignments. Each location
has a name, optional description, capacity, address, and map URL.

Locations are attached to shifts via the **Schedule Assignments** panel on
each shift in Timelines.

---

### Schedule Analysis *(OVERSEER+)*

The **Schedule Analysis** accordion at the top of the Master Conflict Grid page
runs a two-layer detection pipeline: a deterministic rule engine that flags
known conflict types, followed by an AI layer (GPT-4o) that assesses severity,
confidence, and suggests resolutions for each violation.

#### Running an analysis

Click **Run Analysis** in the accordion header. The analysis runs in the
background and the accordion auto-expands when complete. If the schedule hasn't
changed since the last run, the cached result is returned immediately.

#### Violation types

| Type | Description |
|---|---|
| **Time Overlap** | Two assigned shifts overlap on the same day |
| **Blackout Violation** | Assigned shift overlaps the volunteer's blackout window |
| **Pre-Session Overload** | 2+ pre-session shifts for one volunteer on one day |
| **Post-Session Overload** | 2+ post-session shifts (Security excluded) |
| **Understaffed Slot** | Slot assigned count falls below `vol_min` |
| **AI Observation** | Patterns identified by AI not covered by the rules above |

#### Severity and confidence

- **Severity** — `critical`, `high`, `medium`, `low`, or `info`, assessed by AI.
- **Confidence** — 0–100% indicating how certain the AI is the violation is a
  real problem given context. A 5-minute adjacent shift overlap might score 25%;
  a 2-hour double-booking scores 95%.

Rule-engine violations (time overlap, blackout, etc.) have no confidence score —
they are definite facts. AI-generated observations carry a confidence score.

#### Interacting with violations

Violations are grouped by severity with Critical and High expanded by default.
Click any violation header to expand and see:

- **Description** — plain-English explanation of the conflict.
- **AI suggestion** — a specific proposed resolution, citing which rule applied
  if relevant.
- **AI question** — if context is ambiguous the AI asks a clarifying question.
  Type your response and click **Re-analyze** to get an updated suggestion.
- **Remove from Shift** buttons (for time overlap and blackout violations) —
  removes the volunteer from the named shift directly from the panel and
  refreshes the grid.
- **View Blackouts** — opens the read-only blackout timeline for the volunteer.
- **Acknowledge** — marks the violation as reviewed and moves it to the
  collapsed "N acknowledged" section at the bottom.

#### Add as Rule

When you answer an AI question, an **Add as Rule** button appears. Clicking it:
1. Opens an editable text field pre-filled with your response formatted as a rule.
2. On save, creates a new Schedule Analysis Rule.
3. Automatically re-analyzes all other violations in the current run that share
   the same AI question, applying the new rule immediately.

#### Active Rules

The rules the AI used for this analysis are shown in a collapsible
**Active Rules (N)** section at the top of the accordion. Click **Manage**
to open the Schedule Analysis Rules admin page.

---

### Schedule Analysis Rules *(ADMIN)*

**Path:** Operations → Schedule Analysis Rules, or `/oversight/tools/schedule-rules`

Admin-managed standing policy rules that are injected into the AI system prompt
on every Schedule Analysis run. The AI treats these as authoritative policy when
assessing violations — they directly influence severity ratings and suggestions.

**Example rules:**
- *"A volunteer may only be assigned one pre-session shift per day unless they
  specifically requested otherwise."*
- *"Security volunteers working session-time shifts are exempt from daily
  shift-load concerns."*
- *"Saturday afternoon is highest-priority staffing — understaffed slots here
  should be marked critical."*

#### Managing rules

- **Add** — type a rule in the text box at the bottom and click **Add Rule**.
  Rules take effect on the next analysis run.
- **Edit** — click the pencil icon on any rule to edit it inline. Click **Save**
  to confirm or **Cancel** to discard.
- **Toggle** — click the toggle icon to activate or deactivate a rule without
  deleting it. Inactive rules are shown struck through and are excluded from
  the AI prompt.
- **Reorder** — use the up/down chevron buttons to change the order rules
  appear in the AI prompt. Order matters — earlier rules take precedence when
  the AI weighs conflicting guidance.
- **Delete** — click the trash icon and confirm. Deletion is permanent.

> Rules are also accessible from the Scheduling section of the **Operations**
> header dropdown and from the **Active Rules** section in the analysis accordion.

---

## 6. Attendance

### Check-In Tool *(KEYMAN+)*

**Path:** Operations → Check-In Tool

Used on the day of the convention to record who showed up.

1. Select a **Convention Day** from the dropdown.
2. Select a **Shift** — the volunteer list loads automatically.
3. The table shows all invited volunteers with their RSVP response.
4. Toggle the **Attended** switch for each volunteer who is present.
5. Optionally add a **note** to any row (saved on blur).
6. Use **Walk-In** to add a volunteer who wasn't on the original invite list.
   Search by name and click their row to add them as attended.

The four stat cards (Invited, RSVP Yes, Attended, No-Show) update live as
you mark attendance. Use the search box to find a specific volunteer quickly.

> **Days with no shifts:** For days that have no shift structure defined,
> the shift picker automatically selects "Full Day" and loads all volunteers
> invited to that day.

---

### Attendance Report *(KEYMAN+)*

**Path:** Operations → Attendance Report

View a read-only summary of attendance across all shifts for a convention day.

Select a day to load the accordion. Each shift shows headline stats (Invited,
RSVP Yes, Attended, No-Show) in the header. Expand a shift to see the full
volunteer list with their attendance status and notes.

Use the **filter bar** to narrow across all shifts simultaneously by:
- **Type** — Invited or Walk-In
- **RSVP** — Yes, No, Maybe, Pending
- **Attended** — Attended or Not Recorded
- **Gender** — Male or Female
- **Name search** — fuzzy match on last/first name

---

## 7. Reports

### Volunteer Application Status *(OVERSEER+)*

**Path:** Operations → Reports

A table of all volunteers showing their registration completeness. Volunteers with missing required fields are flagged so oversight can follow up. Filter by **Status** (All / Completed / Draft), **Gender** (All / Male / Female), or search by name or email.

### Master Conflict Grid *(OVERSEER+)*

**Path:** Operations → Master Conflict Grid

A full cross-day view of every volunteer against every shift. Volunteer names
run down the left column (sticky, with a live search filter) and shifts run
across the top, grouped by convention day with color-coded department headers.

Each cell shows a status code:

- **X** — assigned, no conflicts
- **PC** — personal conflict (volunteer has a blackout overlapping this shift)
- **X/PC** — assigned during a blackout window (warning)
- **SC** — shift conflict (volunteer is assigned to overlapping shifts)
- **SC/PC** — both shift and personal conflict

Toggle switches above the grid control visibility:

- **Show Personal Conflicts / Shift Conflicts Only** — hides or shows the
  yellow PC cells for unassigned slots
- **Show All Volunteers / Volunteers with Assignments Only** — expands the
  grid to include every active volunteer, making it easy to spot anyone who
  has not been scheduled

Hover over any column to see it highlighted as a translucent band. Day
boundary dividers and pastel background tints help visually separate the
three convention days.

#### Right-click context menu

Right-clicking any actionable cell opens a context menu with targeted actions.
Plain **X** cells (clean assignment, no conflicts) do not show a context menu.

- **SC cells** (shift conflict) — shows a "Remove from" option for each
  conflicting shift by name and day, so you can pick exactly which assignment
  to remove. Example: *Remove Jacob Ladd from Friday — "Lot A Ingress"*.
- **X/PC cells** (assigned during blackout) — shows "Remove from Shift" and
  "View Volunteer Blackouts".
- **SC/PC cells** — shows both sets of options above.

All removals prompt a confirmation dialog before executing. After confirmation
the grid refreshes automatically to reflect the change.

**View Volunteer Blackouts** opens an interactive read-only availability modal
showing the volunteer's blackout windows for all convention days on the existing
timeline visualization. No navigation away from the page is needed.

#### Schedule Analysis accordion

Above the conflict grid, a collapsible **Schedule Analysis** accordion
summarizes the AI-powered violation analysis for the current schedule.
See [Schedule Analysis](#schedule-analysis-overseer) for full details.

#### Quick navigation

The title bar includes a **→ Scheduler** button for fast navigation between
the conflict grid and the drag-and-drop scheduler.

---

## 8. Decently Sync

### Export to Decently *(ADMIN)*

**Path:** Operations → Export to Decently

Downloads a CSV of all volunteers not yet exported to Decently, then marks
them as exported in the system. Run this after finalizing volunteer registrations
to keep Decently in sync.

### Import from Decently *(ADMIN)*

**Path:** Operations → Import from Decently

Upload an approved volunteer CSV from Decently. The system matches records
by name/email/phone, sets active status for matched volunteers, and flags
new volunteers for review.

---

## 9. Administration *(ADMIN only)*

### Permission Matrix

**Path:** Operations → Permission Matrix

Override the default role permissions at runtime without a code deployment.
Changes take effect on the next login of affected users.

Permissions are grouped by category. Each row shows the permission,
its default value per role, and a toggle to override. Click **Reset**
on any override to restore the factory default.

> Use this sparingly. The defaults are intentionally conservative.
> Major permission changes should still go through `roles.js` in code.

---

### Oversight Structure *(ADMIN)*

**Path:** Operations → Oversight Structure

Define the reporting structure shown on every volunteer's home page dashboard.

#### Building the tree

- Click **Add root node** to create a top-level position (e.g. Head Overseer).
- Use the **+** button on any row to add a child node beneath it.
- Enter a **role title** (e.g. "Area Overseer") in the text field and select
  the volunteer who holds that position from the dropdown. Leave the volunteer
  unassigned to show the title as a placeholder.
- Use **↑ / ↓** to reorder a node among its siblings.
- Use **→ (Indent)** to make a node a child of the previous sibling.
- Use **← (Outdent)** to promote a node up one level (makes it a sibling
  of its current parent).
- Use the red **✕** button to delete a node. Its children are automatically
  promoted to the deleted node's level.
- Click **Save order** when finished. All changes (new nodes, reorders,
  edits, deletions) are persisted in one save operation.

> New nodes are assigned temporary IDs until Save is clicked. If you delete
> an unsaved new node before saving, it is removed without any DB write.

#### What volunteers see

The oversight structure appears as a read-only indented tree in the **Oversight Structure**
card on the home page dashboard. Phone numbers render as tap-to-call links on
mobile. The tree is visible to all authenticated users regardless of role.

---

## 10. Role Reference

| Role | Key Capabilities |
|---|---|
| **NON_REGISTERED** | Submit registration info only |
| **REGISTERED** | View schedules, maps, the Sign Library, and the Sign Map (read-only); edit own account |
| **DESK** | Log attendance; create volunteer accounts |
| **KEYMAN** | View volunteer info; log and view attendance; view Sign Library and Sign Map |
| **OVERSEER** | Edit volunteers; manage shifts and locations; send messages; create campaigns; create and edit sign templates; manage sign locations and attachments on the Sign Map; toggle schedule sensitivity and manage access grants |
| **ASSISTANT_ADMIN** | All OVERSEER capabilities + role management + delete volunteers + access admin console + grant delegated permissions to volunteers + create and edit Scheduler Categories |
| **ADMIN** | Full access including Permission Matrix, Decently Sync, campaign management, granting delegated permissions, and managing Schedule Analysis Rules |

Roles are assigned in **Role Management** (ASSISTANT_ADMIN+). The first ADMIN
must be set directly in the database.

---

## Tips and Gotchas

**RSVP links are unique to each volunteer.** Don't forward someone else's
invite link — the response will be recorded against the wrong person.

**Revoked invitations can be reinstated** as long as the volunteer hasn't
already responded. If they have responded, the response is preserved even
after reinstatement.

**The 24-hour cooldown on Send Reset Link** is per-channel. Email and SMS
have independent cooldowns, so you can send an email and an SMS within the
same day without hitting the limit.

**Walk-ins in the Check-In Tool** are recorded against the shift even if the
volunteer wasn't originally invited. They appear with a "Walk-In" badge in
the Attendance Report.

**Permission changes take effect on next login.** If you change a volunteer's
role or a permission override, the affected user needs to log out and back in
to see the change.

**Soft-deleted volunteers are not gone.** Deleting a volunteer via the oversight
panel sets their status to "deleted" — all their data is preserved and they
can be reinstated at any time.

**Blackouts do not remove existing assignments.** Adding a blackout window for
a volunteer who is already scheduled does not un-assign them — it only prevents
future drops into overlapping slots. Existing assignments will gain a `⚠`
conflict badge so you can review them.

**Re-running analysis after schedule changes:** the analysis caches results by
schedule hash. If you add or remove assignments or blackouts, the next Run
Analysis call detects the change and runs fresh. The "unchanged" indicator in
the accordion header means the grid is identical to the last run — no need to
re-run.

**Conflict overrides are not saved as a flag.** Choosing "Place Anyway" places
the volunteer normally. The `⚠` badge persists as long as the conflict exists
in the tracker, but there is no separate "conflict acknowledged" record in the
database.

**Meeting shift T-15 alerts use a day-broadcast model.** When a meeting shift
fires a T-15 alert, it goes to every volunteer with a crew assignment on that
convention day — *except* those whose crew shift overlaps the meeting window.
Those volunteers are "scheduled elsewhere" and receive their normal crew alert
instead. No individual assignment to the meeting shift is needed; attendance
at the meeting is implied unless the crew shift takes precedence.

**SMS check-in requires a T-15 alert to have fired first.** Volunteers can only
check themselves in via SMS (`CHECK` or their shift code) after the T-15 reminder
has been sent for their shift. If they text in before that, they receive a message
telling them they will be checked in automatically when the T-15 goes out. This
prevents advance check-ins from being recorded hours before the shift.

**Deleting a shift, session, or convention day is permanent and cascades completely.** The confirmation dialog describes everything that will be removed. For a shift this includes: all location assignments, scheduler slot assignments, SMS alert history, attendance records, and invitations. A session additionally removes all shifts under it and their child data. A convention day removes everything under all its sessions. There is no undo — if you need to temporarily hide a shift, consider leaving it in place rather than deleting it.

**Shift alert fire time accepts both 24-hour and 12-hour format.** When creating or editing a shift alert schedule, you can enter the fire time as `19:30` or as `7:30 PM` — both are accepted. The stored value is always converted to UTC automatically. If you see an unexpected time on a schedule card after saving, check that you entered AM or PM correctly when using the 12-hour format.

**Twilio inbound webhook must be set on the Messaging Service, not the phone number.**
If SMS replies stop reaching the server, check the Albany Parking Messaging Service
settings in the Twilio console (Messaging → Messaging Services → Albany Parking →
Settings → Inbound messages → Request URL). The number-level webhook is overridden
by the service and has no effect.

**Inbound SMS from unknown numbers** prompt the system to reply asking for the sender's name and alert overseers automatically. The message is still logged and surfaces in the Notes Report once a volunteer match is established.
