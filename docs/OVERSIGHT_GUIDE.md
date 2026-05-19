# Oversight Guide
### Albany JW Parking — Volunteer Management Platform

This guide covers everything an oversight user needs to manage volunteers,
send invitations, track RSVPs, log attendance, and administer the platform.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [My Account](#2-my-account)
3. [Volunteer Management](#3-volunteer-management)
4. [Communications](#4-communications)
5. [Scheduling](#5-scheduling)
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

### Oversight Tools Hub

After logging in, click **Oversight Tools** in the navigation bar (visible to
KEYMAN and above). The hub groups all available tools by category. Which tools
appear depends on your role — higher roles see more options.

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

You can also view your **Convention Invitations** — a read-only panel showing
all invitations sent to you for the current convention year, including your
RSVP response and the date you responded.

Click **Finalize Changes** after editing to save all sections at once.

---

## 3. Volunteer Management

### Edit Volunteer *(OVERSEER+)*

**Path:** Oversight Tools → Edit Volunteer

Search for a volunteer by name. Click their row to open their full profile,
which mirrors the My Account layout. You can edit any section and save
changes on their behalf.

The **Assignment & Role** section (collapsed at top) lets you set:
- Their role (REGISTERED or KEYMAN — OVERSEER+ only)
- Crew assignments: Lots & Garages, Signs, Security, Mobile Support, Dropoff & Pickup

The **Convention Invitations** section (collapsed at bottom) shows all
current-year invitations for this volunteer. Use the Yes / No / Maybe /
Pending buttons to record a verbal RSVP — saves immediately without going
through Finalize. Clicking the active button a second time clears the
response back to Pending. Revoked invitations are shown read-only.

### Create Volunteer *(OVERSEER+)*

**Path:** Oversight Tools → Create Volunteer

Fill in name, email, phone, and congregation details. The system checks for
potential duplicates (matching email, phone, or name) before creating the
account and will surface any matches for review.

A temporary password of `lastName + 1914` is set automatically. The volunteer
should change it on first login.

### Role Management *(ASSISTANT_ADMIN+)*

**Path:** Oversight Tools → Role Management

View all volunteers and their current roles. Click a volunteer's row to open
the role editor. You can assign any role strictly below your own level.

> **Note:** ASSISTANT_ADMIN cannot modify ADMIN accounts.

### Volunteer Account Oversight *(ASSISTANT_ADMIN+)*

**Path:** Oversight Tools → Edit Volunteer (oversight tab)

Filter volunteers by status: **Active**, **Inactive**, or **Deleted**.

- **Deactivate** — marks a volunteer as inactive for the current year
- **Delete** — soft-deletes the account (preserves data, removes from active lists)
- **Reinstate** — restores a deleted volunteer to their previous status

---

## 4. Communications

### Campaign Center *(OVERSEER+)*

**Path:** Oversight Tools → Campaign Center

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
6. Select volunteers from the list. Use the search and filter to narrow by
   name, active status, or SMS capability.
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

#### Templates

Save and reuse message templates via the Templates panel. Templates can
include merge fields and are available across all campaigns.

---

### Invitation Tracker *(OVERSEER+)*

**Path:** Oversight Tools → Invitation Tracker

View all sent invitations for the current year. Filter by:
- **Campaign** — see all invitations from a specific batch
- **Convention Day** — filter to a specific day
- **Response** — Yes, No, Maybe, Pending
- **Show Revoked** — toggle to include/exclude revoked invitations

#### Stat Cards

The six cards (Total Sent, Yes, No, Maybe, Pending, Revoked) update live as you
apply filters — they always reflect deduplicated volunteer counts from the
visible rows, not the raw invitation total. A volunteer who appears in both a
parent campaign row and a follow-up row is counted only once, in the bucket
matching their most definitive response.

> **Note:** The Pending card does not respond to clicks. Filtering the table to
> “pending” only is intentionally disabled because it hides responded rows that
> the deduplication logic needs to correctly classify volunteers — which would
> cause the pending count to inflate.

#### Campaign-level Actions

When a campaign is selected in the **Campaign** filter:

- **Remind N pending** (amber button, top-right) — opens the Campaign Center
  pre-loaded with the selected campaign and all pending volunteers already
  selected. The original message pre-fills the compose area so you can send a
  nudge with minimal editing. Only appears when the selected campaign has
  **Response needed** enabled.
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

**Path:** Oversight Tools → Send Reset Link

Send a password reset or account completion link to a volunteer via email
or SMS. Two tabs:

- **Draft** — volunteers who haven't completed registration. Sends a resume link.
- **Registered** — completed volunteers who need a password reset.

Each channel (email/SMS) enforces a 24-hour cooldown per volunteer to prevent
accidental spam. The cooldown countdown is shown on each row.

---

## 5. Scheduling

### Timelines *(OVERSEER+)*

**Path:** Oversight Tools → Timelines

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
- **Event Type** — category (Ingress, Egress, Security, etc.)
- **Label** — display name for the shift
- **Start / End time**
- **Volunteer need** — how many volunteers are required
- **Schedule Assignments** — locations attached to this shift, each with
  **Min**, **Target**, and **Max** volunteer counts. These drive slot
  colour-coding in the Scheduler (red = below min, grey = up to target,
  faded = up to max).
- **Invitable toggle** — the envelope button marks a shift as available for
  invitations in the Messaging Center. Yellow = invitable.

---

### Scheduler *(OVERSEER+)*

**Path:** Oversight Tools → Scheduler

A drag-and-drop interface for assigning volunteers to shift slots across a
convention day.

#### Setup prerequisites

Before the Scheduler can display a grid, each shift in Timelines must have
its **Department** column set (via direct DB edit or a future UI field) to
one of the five department keys: `lots_and_garages`, `signs`, `security`,
`dropoff_pickup`, `mobile_support`. Shifts without a department are excluded
from the grid.

Schedule assignments on those shifts should also have **Min** and **Max**
set alongside the Target (volunteer need) in Timelines so the slot
colour-coding renders correctly.

#### Using the Scheduler

1. Select a **Convention Day** from the sidebar picker.
   The schedule grid loads automatically — rows at 15-minute resolution,
   columns organised by department. Departments with multiple locations
   (e.g. Security at MVP Garage and OGS Parking Garage) display one
   sub-column per location under a shared department header.
2. The **Volunteer Pool** in the sidebar lists all active registered volunteers.
   - Filter by **Rank** to narrow to Registered, Keyman, or Overseer+.
   - Filter by **Department** to show only volunteers with the matching crew flag.
   - Filter by **Sort** to order the pool by last name, rank, or department.
3. **Drag** a name pill from the pool onto any highlighted drop zone in the grid.
   - Drop zones are colour-coded: red = required slots (below vol_min), grey =
     ideal slots (up to vol_target), faded = extra slots (up to vol_max).
   - **KM** slots (blue) require KEYMAN or above. **KA** slots (teal) accept
     any rank.
   - Department drop guards automatically reject volunteers who lack the crew
     flag for that department — the zone will not highlight for ineligible drags.
   - A slot that already has a volunteer assigned will reject further drops.
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

**Path:** Oversight Tools → Scheduler → Report button in day banner

A printable per-department schedule report for one convention day. After
assigning volunteers in the Scheduler, click **Report** in the day banner
to open the report in a new tab.

**Layout:**
- Each department (Lots & Garages, Signs, Security, Drop-off/Pickup,
  Mobile Support) renders as its own section, with a page break between
  departments when printed.
- Within each department, shifts appear as sub-sections showing the time
  range. Each location is a column card listing the **KM** (blue),
  **KA** (teal), and regular volunteers in order.
- The **Day** picker in the toolbar switches days without leaving the page.

**Printing / Downloading:**
Click **Print / Save PDF** to open the browser print dialog. Choose
*Save as PDF* in the destination to download a PDF version. The report
hides all browser chrome and navigation when printed.

---

### Right-click context menu

Right-clicking any volunteer name pill opens a context-sensitive menu.

**When right-clicking a pill inside a shift slot:**
- **Remove from Slot** (red) — immediately unassigns the volunteer and
  records the deletion in the undo stack.
- All pool actions below also appear.

**When right-clicking a pill in the pool (or in a slot):**
- **View / Edit Volunteer** — opens the volunteer’s oversight profile in a
  new tab.
- **Today’s Assignments (N)** — opens a floating panel showing every shift
  the volunteer is currently placed in, grouped by department with times.
  The panel stays open until you click × or press Escape.
- **Highlight on Grid** — pulses a gold outline on every shift block the
  volunteer currently occupies so you can spot them at a glance.
- **Copy Name** — copies the volunteer’s display name to the clipboard.
- **Manage Blackouts** / **Message Volunteer** — not yet active (shown
  with a “soon” badge).

### Pool pill behaviour

Pool pills **never leave the pool**. Dropping a pill into a shift slot
places a lightweight copy in that slot; the original remains in the pool
and can be dragged to additional non-overlapping shifts. An amber **N×**
badge on a pool pill indicates N active assignments for that volunteer
today.

### Time-conflict guard

If a volunteer is already assigned to a shift whose time window overlaps
the target slot, the slot will not accept the drop (it won’t highlight
yellow). Security shifts are exempt because their coverage windows
overlap by design.

---

#### Department column controls

The yellow day banner contains a **Columns:** row with one colored pill per
department:

- **Click** a pill to hide that department’s columns. The grid collapses those
  columns immediately. Click the pill again (it shows a ⦸ symbol when hidden)
  to restore them.
- **Drag** a pill onto another to swap their column order. Hold and move more
  than a few pixels to enter drag mode; release over the target pill to confirm
  the swap.

---

### Event Types *(ADMIN)*

**Path:** Oversight Tools → Event Types

Manage the categories used to label shifts (Ingress, Egress, Mobile Support,
etc.). Each event type has a name, optional description, and a color used
as a dot indicator in the Timelines and Attendance views.

---

### Locations *(OVERSEER+)*

**Path:** Oversight Tools → Locations

Define parking locations used in shift schedule assignments. Each location
has a name, optional description, capacity, address, and map URL.

Locations are attached to shifts via the **Schedule Assignments** panel on
each shift in Timelines.

---

## 6. Attendance

### Check-In Tool *(KEYMAN+)*

**Path:** Oversight Tools → Check-In Tool

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

**Path:** Oversight Tools → Attendance Report

View a read-only summary of attendance across all shifts for a convention day.

Select a day to load the accordion. Each shift shows headline stats (Invited,
RSVP Yes, Attended, No-Show) in the header. Expand a shift to see the full
volunteer list with their attendance status and notes.

Use the **filter bar** to narrow across all shifts simultaneously by:
- **Type** — Invited or Walk-In
- **RSVP** — Yes, No, Maybe, Pending
- **Attended** — Attended or Not Recorded
- **Name search** — fuzzy match on last/first name

---

## 7. Reports

### Volunteer Application Status *(OVERSEER+)*

**Path:** Oversight Tools → Reports

A table of all volunteers showing their registration completeness. Volunteers
with missing required fields are flagged so oversight can follow up.

---

## 8. Decently Sync

### Export to Decently *(ADMIN)*

**Path:** Oversight Tools → Export to Decently

Downloads a CSV of all volunteers not yet exported to Decently, then marks
them as exported in the system. Run this after finalizing volunteer registrations
to keep Decently in sync.

### Import from Decently *(ADMIN)*

**Path:** Oversight Tools → Import from Decently

Upload an approved volunteer CSV from Decently. The system matches records
by name/email/phone, sets active status for matched volunteers, and flags
new volunteers for review.

---

## 9. Administration *(ADMIN only)*

### Permission Matrix

**Path:** Oversight Tools → Permission Matrix

Override the default role permissions at runtime without a code deployment.
Changes take effect on the next login of affected users.

Permissions are grouped by category. Each row shows the permission,
its default value per role, and a toggle to override. Click **Reset**
on any override to restore the factory default.

> Use this sparingly. The defaults are intentionally conservative.
> Major permission changes should still go through `roles.js` in code.

---

## 10. Role Reference

| Role | Key Capabilities |
|---|---|
| **NON_REGISTERED** | Submit registration info only |
| **REGISTERED** | View schedules and maps; edit own account |
| **DESK** | Log attendance; create volunteer accounts |
| **KEYMAN** | View volunteer info; log and view attendance |
| **OVERSEER** | Edit volunteers; manage shifts and locations; send messages; create campaigns |
| **ASSISTANT_ADMIN** | All OVERSEER capabilities + role management + delete volunteers + access admin console |
| **ADMIN** | Full access including Permission Matrix, Decently Sync, and campaign management |

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
