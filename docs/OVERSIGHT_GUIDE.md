# Oversight Guide
### Albany JW Parking — Volunteer Management Platform

This guide covers everything an oversight user needs to manage volunteers,
send invitations, track RSVPs, log attendance, and administer the platform.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
   - [Site Map](#site-map)
   - [Maps](#maps)
   - [Signs](#signs)
     - [Sign Library](#sign-library-registered)
     - [Sign Builder](#sign-builder-overseer)
     - [Sign Map](#sign-map-registered--to-view-overseer-to-edit)
2. [My Account](#2-my-account)
3. [Volunteer Management](#3-volunteer-management)
   - [SMS Management](#sms-management-assistant_admin)
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

- **Status chips** — All / Planned / Installed / Removed (derived from
  each location's attachments — a location with any installed attachment
  shows as "installed")
- **Sign template** — dropdown to see only locations that have a specific
  template attached

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

##### Geofencing — proximity tracking *(OVERSEER+)*

The floating GPS button in the bottom-right of the map toggles continuous
location tracking. When active:

- A **blue pulsing dot** shows your live position on the map.
- When you come within **~250 feet** of a sign location, a **proximity bar**
  slides up showing the location's signs, live distance in feet, a photo
  thumbnail (tap to expand), and one-tap **Planned / Installed / Removed**
  status buttons that update all attachments at once.
- The **× dismiss button** hides the bar for that location until you leave
  and re-enter its radius or a different location becomes nearest.
- Tap the GPS button again to **stop tracking**.

Geofencing requires the browser's geolocation permission.

##### Coming soon

- **Route visualization** — directed bearings per sign, road-traced
  paths between traffic arrows and sign locations.

**Marker detail levels** (shipped):

- **Zoomed out (below zoom 19):** compact 32px colored discs showing a
  mount-type icon (cone, a-frame, or telephone pole) with a count badge
  (45° NE) and placement ID badge (135° SE). Hovering a compact marker
  for 250 ms expands it to the full sign stack (desktop only); moving
  away collapses it after 150 ms. Status or custom color determines the
  disc background.
- **Zoomed in (zoom 19+):** full sign-preview blocks with text, arrow,
  and a mount-type label below the stack.

The zoom threshold defaults to 19 and is adjustable via the control pill
at the bottom-left of the map (shows current zoom level and a Detail ≥
input). The preference persists across sessions.

**Marker colors:** by default, markers are colored by status (gray =
planned, green = installed, faded red = removed). OVERSEER+ users can
assign a custom color from a palette of eight (red, orange, yellow,
green, teal, blue, purple, pink) via the offcanvas editor. A "Bulk
apply" button sets the chosen color on every placement of the same
template in one click.

**Layout:** sidebar on the left with a "Filter placements" section and
the placement list; Google Maps on the right. The map starts centered
on MVP Arena at street-level zoom.

##### Adding a placement *(OVERSEER+)*

1. Click **Add placement** in the sidebar.
2. The cursor turns into a crosshair and a hint appears: "Click anywhere
   on the map to drop a placement."
3. Click the spot on the map where the sign should go.
4. A blue dashed **NEW** marker appears and the editor slides in from
   the right.
5. Pick the sign template from the dropdown, set the arrow direction
   (pre-filled from the template's default but overridable), status,
   mount type (Cone / A-frame / Existing structure), heading, and
   location notes, then click **Save**.

You can fine-tune the location at any point during this process by
dragging the blue **NEW** marker around on the map — the lat/lng in the
editor updates automatically.

##### Editing an existing placement *(OVERSEER+)*

- **Click any marker** on the map (or any row in the sidebar list) to
  open the editor offcanvas.
- Edit any field: arrow direction, status (planned/installed/removed),
  mount type, heading, location notes.
- **Photo section:** two buttons — **Take Photo** (opens the device
  camera directly on mobile) and **Upload** (opens the gallery or file
  picker). When a photo already exists, **Retake** and **Replace**
  appear alongside **Remove**.
- **Shift+drag a marker** to a new spot on the map — hold Shift first,
  then drag. The new coordinates are saved automatically when you let go.
  If the server rejects the change (for any reason), the marker snaps back
  to its original spot. A plain drag without Shift pans the map instead
  of moving the sign — this is intentional to prevent accidental repositioning.
- **Delete** removes only the placement; the sign template itself remains.

Status changes auto-sync the installation audit trail — marking a placement
as "installed" stamps your email and the timestamp; marking it "removed"
records the removal timestamp; reverting to "planned" clears both.

##### View-only mode

REGISTERED and KEYMAN users can open the page and see all placements, but:

- The "Add placement" button is hidden.
- Markers are not draggable.
- The editor shows the same fields but no Save or Delete buttons.

##### Direction of travel handle *(OVERSEER+)*

Every full marker (zoomed in at or above the detail threshold) shows a
direction-of-travel arrow extending from its center. The arrow points in
the direction drivers travel *toward* the sign — not the direction the sign
faces, and not the direction the camera should look. From this one value the
app automatically positions Street View behind the sign and points the
camera forward.

- **Shift+drag the handle** to set the bearing — hold Shift first, then
  drag. The arrow rotates live as you drag; the value is saved automatically
  when you release. A plain drag without Shift does nothing, preventing
  accidental bearing changes. You can also type a bearing directly into
  the **Direction of travel** field in the offcanvas editor.
- **Unset state:** the arrow appears dashed and semi-transparent to signal
  that no direction has been recorded yet.
- **View-only users** can see the arrow when a direction is set but cannot
  drag it.
- The handle is only visible on full markers (zoomed in). Compact disc
  markers (zoomed out) do not show the arrow.

##### Street View

Street View is available on both **locations** and **traffic arrows**.
Open it from the single-click info sheet ("Street View" button), the
right-click context menu, or — for locations — from the editor's action
buttons.

The overlay is full-screen and covers the map. The header bar shows the
sign names (or arrow label), a bearing badge when a bearing is available,
the appropriate save button (OVERSEER+ only), and a × close button.

**From a location:** when a direction of travel (front bearing) is set,
the camera is automatically positioned **~20 m behind the sign** along
the approach path and pointed forward — so you see the sign the way a
driver approaching it would. When no bearing is set, the panorama opens
at the location's coordinates facing north with a hint to rotate
manually. If a previous Street View position was saved (via "Save as
Photo"), the panorama restores to that exact frame instead.

**From a traffic arrow:** the camera uses the **arrow's own bearing**
for the approach direction, targeting the linked location's coordinates
(or the arrow's own coordinates if it has no links). This means
different arrows pointing to the same location produce different
approach views. If a previous view was saved (via "Save View"), the
panorama restores to that exact frame instead.

**Save as Photo** *(locations only, OVERSEER+):* navigate the panorama
to the vantage point you want — the auto-calculated position may land
across the street or at a bad angle depending on where Google's coverage
was captured, so use the navigation controls to walk to a better spot if
needed. When the view is right, click **Save as Photo**. The server
fetches a matching static image from the Google Street View Static API
and stores it as the location's photo. The panorama position is also
saved — the next time Street View is opened for this location it
reopens at the exact frame and camera angle rather than recalculating
from the bearing.

**Save View** *(arrows only, OVERSEER+):* persists the current panorama
position (pano ID, heading, pitch, zoom) on the arrow without capturing
a photo. The next time anyone opens Street View from this arrow it
restores to the saved view instead of computing an approach position
from the arrow's bearing.

If no Street View imagery is available, a footer bar appears with an
**Open in Google Maps** link as a fallback.

**Keyboard:** Escape closes the Street View overlay. A second Escape
deselects the map marker.

##### Placement Composer *(OVERSEER+)*

Click **Compose photo** in the offcanvas editor to open the placement
composer — a full-screen overlay for creating a realistic mockup of
what the sign will look like when installed. The composer lets you pick
a background, position and resize the sign overlay on top of it, then
save the result as the placement's photo.

**Choosing a background:** two options in the toolbar:

- **Upload image** — use your own photo (e.g. a picture of the
  location taken from your phone).
- **Existing photo** — loads the placement's current photo as the
  background. Only appears when the placement already has a photo.
  Useful for compositing the sign onto a real field photo you already
  captured via Take Photo or Save as Photo.

To use a Street View snapshot as the composer background, first save
it as the placement's photo using the **Save as Photo** button in the
Street View overlay, then open the composer and click **Existing photo**.

**Positioning the sign:** once a background is loaded, the sign preview
appears on the canvas. Drag it to the correct position. Use the corner
handles to resize. The mount type selector in the toolbar (Cone /
A-frame / Sign only) changes the frame drawn around the sign.

**Saving:** click **Save as photo** to flatten the composite into a
JPEG and store it as the placement's photo. If the placement already
has a photo, it is replaced.

##### Hover tooltip

Hover over any marker to see a tooltip showing the sign text and arrow,
a status badge, mount type, location notes, coordinates, and a photo
thumbnail if one has been uploaded. Moving the cursor onto the tooltip
keeps it open so you can read long notes.

##### Right-click context menu

Right-clicking any marker opens a quick-action menu:

- **Edit** — opens the offcanvas editor.
- **View photo** — opens the full-size photo in a lightbox overlay (only
  appears when a photo exists).
- **Mark as Planned / Installed / Removed** — changes status without
  opening the editor. The current status is omitted from the list.
  OVERSEER+ only.
- **Get directions** — opens Google Maps in a new tab routed to the
  placement coordinates.
- **Copy coordinates** — copies `lat, lng` to the clipboard.
- **Delete placement** — triggers the standard delete confirmation.
  OVERSEER+ only.

##### Geofencing — proximity tracking *(manageSigns)*

The floating GPS button in the bottom-right corner of the map toggles
continuous location tracking. When active:

- A **blue pulsing dot** shows your live position on the map.
- The map **auto-follows** your position. Panning or zooming manually
  pauses auto-follow for 5 seconds, then it resumes.
- When you come within **75 metres** of a placement, a **proximity bar**
  slides up from the bottom of the screen showing:
  - The sign preview (text + arrow direction).
  - Your current distance, updating in real time.
  - A photo thumbnail if the placement has one (tap to expand, tap the
    chevron to collapse).
  - Three status buttons — **Planned**, **Installed**, **Removed** —
    for one-tap status changes without opening the editor.
- The **× dismiss button** hides the bar for that placement until you
  leave and re-enter its radius, or until a different placement becomes
  nearest. Dismissed placements are remembered for the duration of the
  tracking session.
- Tap the GPS button again to **stop tracking**. The blue dot and
  proximity bar are removed, and all dismiss history is cleared.

Geofencing requires the browser's geolocation permission. On first
activation you may see a browser prompt — allow it so the GPS can track
your position. If permission is denied, tracking stops automatically.

Dismiss the menu by clicking anywhere outside it or pressing Escape.

##### Legend & Shortcuts

A collapsible **Legend & Shortcuts** section sits at the bottom of the
left sidebar (collapsed by default — click the chevron to expand).
It shows sign type icons (colored pills matching the map markers),
status dot colors, and a keyboard shortcut reference card.

Key shortcuts (OVERSEER+, desktop):

| Action | Gesture |
|---|---|
| Nudge selected marker 0.5 m | Arrow keys |
| Nudge selected marker 5 m | Shift + Arrow keys |
| Move marker on map | Shift + drag marker |
| Rotate direction of travel | Shift + drag handle |
| Deselect / close overlay | Esc |
| Context menu | Right-click marker |

##### Using the Sign Map on a phone or tablet

The Sign Map is fully usable on mobile. A few differences from desktop:

- **Tap a marker** (or tap a row in the placement list) to open the
  **info sheet** — a card that slides up from the bottom of the screen
  with the sign details and action buttons. Swipe the card down to close
  it, or tap the backdrop behind it.
- **Drag-to-reposition is not available on touch.** To move a sign, tap
  the marker, tap **Edit placement** in the info sheet, then use the
  **Update to my location** GPS button (if you're standing at the new
  spot) or type the new coordinates directly into the Latitude / Longitude
  fields, then tap **Save**.
- **The direction-of-travel handle** is not shown on touch devices — set
  the bearing by typing a value into the **Direction of travel** field in
  the editor instead.
- **Filters** are collapsed by default on small screens. Tap the
  **Filters** button in the sidebar header to expand them.

##### "Use my location" GPS button

A crosshairs button (📍) sits next to **Add placement** in the sidebar.
Tapping it requests your device's GPS location and drops a new placement
marker at that spot — no need to tap the map. The editor opens automatically.

In the editor for an existing placement, an **Update to my location**
button appears below the coordinate fields. Tapping it moves the marker
to your current GPS position and updates the lat/lng inputs. Nothing is
saved until you tap **Save**.

After a GPS fix, an accuracy hint appears below the coordinates for a few
seconds (e.g. `GPS fix: ±8 m (Good)`). GPS accuracy inside parking
structures or near tall buildings can be poor — check the reading before
saving if precision matters.

If location permission is denied, check your browser or device settings
and try again.

##### Coming soon

- **Live proximity alerts** — when the page is open on a phone, get an
  in-app ping when you drive within ~50m of a placement (Phase 4,
  web-only — true background geofencing requires the eventual native
  mobile app).

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
  for each convention day. Select a day, enter a start and end time, add an
  optional reason, and click Add. The scheduler will avoid placing you in
  overlapping shifts. You can delete any blackout you have created.

You can also view your **Convention Invitations** — a read-only panel showing
all invitations sent to you for the current convention year, including your
RSVP response and the date you responded.

Click **Finalize Changes** after editing to save all sections at once.

---

## 3. Volunteer Management

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

Filter volunteers by status: **Active**, **Inactive**, or **Deleted**.

- **Deactivate** — marks a volunteer as inactive for the current year
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
- **Event Type** — category (Ingress, Egress, Security, etc.)
- **Label** — display name for the shift
- **Start / End time**
- **Volunteer need** — how many volunteers are required
- **Schedule Assignments** — locations attached to this shift, each with
  **Min**, **Target**, and **Max** volunteer counts. These drive slot
  color-coding in the Scheduler (red = below min, grey = up to target,
  faded = up to max).
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
the editor panel. Use the **Filter by shift type** dropdown to narrow the list
by event type (Ingress, Egress, etc.).

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

- **Rendezvous points (2.55.0):** one optional meeting point per schedule assignment
  (shift + location). Managed via a shared floating panel (`rendezvous.js`) accessible
  from three surfaces: the Rendezvous landing page (`/oversight/tools/rendezvous`),
  right-click on shift block headers in the Scheduler, and the map-pin button on
  assignment badges in Timelines. GPS capture via `navigator.geolocation`, photo upload
  via multer → sharp → Azure Blob (`rv-{saId}-{ts}.jpg`). Time guard logic mirrors
  `alertScheduler.js` EDT offset: free editing >15 min before start, warn+alert within
  ±15 min of start (sends ad-hoc SMS to assigned volunteers), hard lock >15 min after
  start. T-15 SMS alerts LEFT JOIN rendezvous data and append inline text
  (description/floor/address) plus a link to the public HMAC-gated detail page when a
  photo exists. Permission key: `editRendezvous` (KEYMAN+ edit, OVERSEER+ create/delete).
  RV data is preloaded per day in the scheduler via `preloadRendezvousForDay()` on the
  `scheduler:dayChange` event.
- **Volunteer Schedule Report (2.54.0):**

**Path:** Operations → Scheduler

A drag-and-drop interface for assigning volunteers to shift slots across a
convention day.

#### Setup prerequisites

Before the Scheduler can display a grid, each shift in Timelines must have
its **Department** column set (via direct DB edit or a future UI field) to
one of the six department keys: `lots_and_garages`, `signs`, `security`,
`dropoff_pickup`, `mobile_support`, `desk`. Shifts without a department are excluded
from the grid.

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
   - Filter by **Sort** to order the pool by last name, rank, or department.
3. **Drag** a name pill from the pool onto any highlighted drop zone in the grid.
   - Drop zones are color-coded: pink = required slots (below vol_min), blue =
     ideal slots (up to vol_target), grey = extra slots (up to vol_max).
   - **KM** slots (deeper blue) require KEYMAN or above. **KA** slots (cyan)
     accept any rank.
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
- Each department (Lots & Garages, Signs, Security, Drop-off/Pickup,
  Mobile Support, Desk) renders as its own section, with a page break between
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
- **View / Edit Volunteer** — opens the volunteer’s oversight profile in a
  new tab.
- **Today’s Assignments (N)** — opens a floating panel showing every shift
  the volunteer is currently placed in, grouped by department with times.
  The panel stays open until you click × or press Escape.
- **Highlight on Grid** — pulses a gold outline on every shift block the
  volunteer currently occupies so you can spot them at a glance.
- **Copy Name** — copies the volunteer’s display name to the clipboard.
- **Manage Blackouts** — opens a panel showing this volunteer's unavailable
  time windows for the current day. Add a blackout with a start time, end
  time, and optional reason. Delete any existing blackout with the × button.
  Blackouts are loaded into the conflict tracker when a day is selected — the
  scheduler will warn before placing the volunteer into an overlapping slot.
- **Message Volunteer** — not yet active (shown with a "soon" badge).

### Pool pill behaviour

Pool pills **never leave the pool**. Dropping a pill into a shift slot
places a lightweight copy in that slot; the original remains in the pool
and can be dragged to additional non-overlapping shifts. An amber **N×**
badge on a pool pill indicates N active assignments for that volunteer
today.

### Time-conflict guard

If a volunteer already has an assignment or blackout window that overlaps
the target slot's time range, a **conflict modal** appears describing the
clash. You can choose **Place Anyway** to override, or **Return to Pool**
to cancel the drop. Security department drops bypass the modal but still
badge the pill silently with a `⚠` warning icon.

If a conflict is overridden or a security overlap exists, the DZ pill
displays a `⚠` badge. Right-clicking that pill lists the specific conflicts
under the **Remove from Slot** action so oversight can see exactly what
is clashing.

### Blackout windows

Blackouts mark a volunteer as unavailable for a specific time range on a
convention day. They are managed via **Manage Blackouts** in the right-click
context menu on any volunteer pill. Unlike shift assignments, blackouts have
no associated slot — they exist only to trigger the conflict guard. Adding
or removing a blackout immediately re-evaluates any existing DZ pills for
that volunteer and updates their `⚠` badges live — deleting a blackout
clears the badge instantly without a page refresh.

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

### Event Types *(ADMIN)*

**Path:** Operations → Event Types

Manage the categories used to label shifts (Ingress, Egress, Mobile Support,
etc.). Each event type has a name, optional description, and a color used
as a dot indicator in the Timelines and Attendance views.

---

### Locations *(OVERSEER+)*

**Path:** Operations → Locations

Define parking locations used in shift schedule assignments. Each location
has a name, optional description, capacity, address, and map URL.

Locations are attached to shifts via the **Schedule Assignments** panel on
each shift in Timelines.

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
- **Name search** — fuzzy match on last/first name

---

## 7. Reports

### Volunteer Application Status *(OVERSEER+)*

**Path:** Operations → Reports

A table of all volunteers showing their registration completeness. Volunteers
with missing required fields are flagged so oversight can follow up.

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
| **OVERSEER** | Edit volunteers; manage shifts and locations; send messages; create campaigns; create and edit sign templates; manage sign locations and attachments on the Sign Map |
| **ASSISTANT_ADMIN** | All OVERSEER capabilities + role management + delete volunteers + access admin console + grant delegated permissions to volunteers |
| **ADMIN** | Full access including Permission Matrix, Decently Sync, campaign management, and granting delegated permissions |

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

**Conflict overrides are not saved as a flag.** Choosing "Place Anyway" places
the volunteer normally. The `⚠` badge persists as long as the conflict exists
in the tracker, but there is no separate "conflict acknowledged" record in the
database.

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
