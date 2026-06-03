# Changelog

All notable changes to this project will be documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [2.37.0] - 2026-06-03

### Added
- **Separate Take Photo / Upload buttons** in the placement editor.
  "Take Photo" uses `capture="environment"` to go straight to the
  device camera on mobile; "Upload" opens the gallery / file picker.
  Both inputs feed the same upload pipeline. The has-photo state now
  shows "Retake" (camera), "Replace" (gallery), and "Remove".
- **Save Street View as Photo.** A "Save as Photo" button in the
  Street View overlay header (visible to OVERSEER+ / delegated
  `manageSigns` users) captures the user's exact panorama position,
  heading, pitch, and FOV. The server fetches the corresponding image
  from the Google Street View Static API (`pano=` mode so the saved
  view matches exactly what the user sees, regardless of auto-
  calculated approach position) and uploads it to Azure Blob Storage
  via the same pipeline as regular photo uploads.
- **Existing photo as composer background.** The placement composer
  toolbar now shows an "Existing photo" button (when a photo exists)
  alongside Upload. Loads the placement's current
  photo as the background so the sign overlay can be positioned on
  a real field photo.
- **Photo credit line** beneath the "Photo of installed sign" header in
  the editor: "Photo taken by: First Last — dd/mm/yyyy". New DB columns
  `photo_taken_by` and `photo_taken_at` on `sign_placements`.
- **New route** `POST /signs/placements/:id/street-view-photo` —
  accepts `{ panoId, heading, pitch, fov }`, fetches 640×480 JPEG
  from the SV Static API, processes through sharp, and stores in blob.

### Changed
- **Composer toolbar** no longer offers Street View as a background
  source — redundant now that the main Street View overlay has "Save
  as Photo". Background options are now Upload and Existing photo.
- **Street View and Compose buttons** moved from the editor action bar
  to the photo section, beneath the upload/replace controls.

## [2.36.3] - 2026-06-03

### Fixed
- **Mobile: pressing a sign disabled the map and scrolled the page instead
  of panning.** Two independent layers were each claiming one-finger touch:
  - The map had no `gestureHandling` set, so Maps defaulted to `auto`, which
    resolves to `cooperative` on a scrollable page — one finger scrolls the
    document, two fingers pan the map. Set `gestureHandling: "greedy"` so a
    single-finger drag always pans the map.
  - Marker content carried `touch-action: manipulation`, which still lets the
    browser treat a single-finger drag as a page scroll and turns the
    follow-up `touchmove` events non-cancelable before Maps' pan handler can
    run. Changed to `touch-action: none` on `.signs-map-marker` and its
    descendants so the gesture stays cancelable and reaches Maps regardless of
    which part of the marker (full sign body or compact disc) is pressed.
  - Note: `greedy` also enables scroll-wheel zoom on desktop without holding
    Ctrl, which is expected for a dedicated full-page map tool.

## [2.36.2] - 2026-06-02

### Fixed
- **Shift-gate bypass at full zoom after successful drag/rotation.**
  At full detail level, the marker wrapper contains child elements
  (sign text, arrow, travel handle). The capture-phase `pointerdown`
  listener on the wrapper was returning early when the event target was
  the travel handle, allowing Maps to receive the event and start a
  marker drag without Shift. Fixed by removing the early-return for the
  handle — `stopImmediatePropagation` now fires for all non-Shift
  pointerdowns on any part of the marker, including the handle area.
  The handle's own Shift-gated listener still runs correctly when Shift
  is held. Also set `.signs-map-marker-sign { pointer-events: none }` so
  pointer events on the sign body route to the wrapper rather than the
  child element, closing a parallel bypass path at full zoom.

## [2.36.1] - 2026-06-02

### Changed
- **Shift-gate on marker drag and travel-handle rotation (desktop).**
  Marker position drags and travel-direction handle rotations now require
  Shift to be held at the start of the drag. A plain drag on a marker
  (without Shift) falls through to the normal Google Maps pan gesture
  instead of moving the sign. This prevents accidental sign displacement
  when a user is panning the map near a placed sign.
  - Holding Shift while hovering any marker shows a `grab` cursor as a
    visual affordance that Shift+drag is available.
  - Arrow-key nudging is unchanged — no Shift required for fine/coarse nudge.
  - Legend updated to show `Shift+drag marker` and `Shift+drag handle`.
  - Touch devices are unaffected (drag already disabled on touch).

## [2.36.0] - 2026-06-02

### Added — Sign Map Mobile UX Pass

#### Info sheet (bottom card — all devices)
- Tapping or clicking any sign marker or sidebar placement row now opens a
  **bottom info sheet** before the full editor, giving all users a quick-peek
  summary without immediately committing to an edit. The sheet shows the sign
  preview, status badge, mount type, location notes, coordinates, and a photo
  thumbnail (tap to open lightbox). Action buttons provide the full feature set:
  - OVERSEER+: **Edit placement** (primary, blue), quick **status buttons**
    (Planned / Installed / Removed in a 3-column grid), Street View, Get
    directions, Copy coordinates, Delete.
  - View-only (REGISTERED / KEYMAN): Street View, Get directions, Copy
    coordinates, View photo (when a photo exists).
- The sheet slides up from the bottom of the viewport with a spring-eased
  CSS transition. On ≥768px screens it is constrained to a 480px centred card.
- **Swipe-to-dismiss** — drag the pill handle or the header area downward ≥80px
  to close. Short drags snap back. Tapping the backdrop also dismisses.
- **Escape key** cascades in order: Street View → info sheet → deselect marker.
- The sheet is accessible to all roles on all devices.

#### Touch device protection
- **Drag-to-reposition is disabled on touch devices.** `gmpDraggable` is set
  to `false` at marker construction time when `isTouchDevice` is true. A
  post-construction force-disable loop in `initMap` catches any marker built
  before the device flag was confirmed (covers DevTools emulation mid-session).
- The `dragend` listener contains a belt-and-suspenders snap-back: if a drag
  fires on a touch device despite the above (e.g. DevTools switch), the marker
  is immediately snapped back to its stored position and `persistDrag` is not
  called.
- `persistDrag` has a final guard that snaps the marker and returns early if
  `isTouchDevice` is true — the position is never sent to the server.
- `isTouchDevice` is evaluated at page load via
  `window.matchMedia("(pointer: coarse)").matches`.

#### Travel handle — desktop only
- The direction-of-travel drag handle is hidden on coarse-pointer (touch)
  devices via `@media (pointer: coarse) { .signs-map-travel-handle { display: none } }`.
- `attachTravelHandleListeners` returns early when `isTouchDevice` is true.

#### Geolocation — "Use my location"
- A **location crosshairs button** next to "Add placement" triggers `geotagPlacement('new')`,
  which calls `navigator.geolocation.getCurrentPosition` with `enableHighAccuracy: true`
  and drops a pending ghost marker at the GPS fix without requiring a map tap.
  If a ghost marker already exists (the user tapped first), it is repositioned.
- An **"Update to my location"** button in the offcanvas editor coordinate row
  (OVERSEER+, existing placements only) calls `geotagPlacement('existing')`, moves
  the marker visually, and pre-fills the lat/lng inputs. The save still requires
  an explicit click — the position is not auto-persisted.
- Both buttons show a spinner and disabled state while the GPS fix is pending.
- An **accuracy badge** appears below the coordinate inputs for 6 seconds after
  a fix: `GPS fix: ±Nm (Excellent / Good / Fair / Poor)`. Thresholds: ≤5m
  Excellent, ≤15m Good, ≤40m Fair, otherwise Poor.
- Geolocation errors (permission denied, unavailable, timeout) surface as
  inline text in `#editorFeedback`.

#### Sidebar filters — collapse on mobile
- On `<lg` breakpoints the sidebar filter body (`#sidebarFiltersBody`) is
  collapsed by default. A **Filters** toggle button in the card header (hidden
  on `≥lg`) expands/collapses it with an animated chevron — same Bootstrap
  collapse pattern used elsewhere in the app.

#### Coordinate inputs — editable for canManage on touch
- The lat/lng fields in the editor are `readonly` only for view-only users.
  OVERSEER+ users can type coordinates directly (important now that drag is
  disabled on touch). The hint text updates accordingly: desktop shows
  "Drag the marker on the map to reposition", mobile shows
  "Enter coordinates manually, or tap the map to place."

#### Legend updates
- Keyboard shortcut entries (`<li>`) are hidden on `<lg` screens via
  `d-none d-lg-flex`; a "Tap marker → View details & actions" hint is shown
  instead.
- The direction-of-travel legend section is hidden on mobile via
  `d-none d-lg-block / d-none d-lg-flex`.
- Placement list `max-height: 40vh` cap removed on `≤991px` (the list sits
  inside a collapsible section and the page scrolls natively on mobile).

### Fixed
- **Accidental drag corruption** — three markers were displaced by accidental
  drags during mobile DevTools emulation testing before the touch guards were
  in place. The guards prevent any future occurrence; affected placements
  should be corrected via the editor's coordinate inputs or the "Update to my
  location" GPS button.

## [2.35.0] - 2026-06-02

### Added — Phase 2d: Delegated `manageSigns` Permission

#### Extra-permissions system
- New generic delegated-permissions mechanism: `req.session.extraPermissions`
  (string array) is built at login from per-volunteer flag columns on
  `volunteer_in`. `requirePermission()` checks this array as a fallback after
  the role-matrix check, so any permission can be granted to an individual
  volunteer without a role promotion. Adding a future delegated permission
  requires only a new DB column and one line in the login handler — no further
  changes to `requirePermission()`.
- First use: `extra_signs_placement BIT NOT NULL DEFAULT 0` on `volunteer_in`.
  When set, grants `manageSigns` to a REGISTERED volunteer without promoting
  them to OVERSEER.

#### ADMIN/ASSISTANT_ADMIN UI
- A new **Delegated Permissions** section appears in the Assignment & Role
  accordion on the Edit Volunteer page for ADMIN and ASSISTANT_ADMIN users.
- Contains a single **Manage sign placements** toggle (checkbox). When checked,
  the volunteer gains full `manageSigns` access — they can create, edit, drag,
  and delete sign placements on the Sign Map.
- The toggle is disabled (read-only) until the section's **EDIT** button is
  clicked, matching the existing Assignment section pattern.
- OVERSEER users editing a volunteer do not see this section — they can only
  set REGISTERED/KEYMAN role and crew flags as before.
- Server-side guard in `POST /edit-volunteer/assignment`: the
  `extra_signs_placement` value is stripped entirely when the actor is below
  ASSISTANT_ADMIN, so a crafted POST body cannot elevate a volunteer's
  permissions.

#### `dbSync.js`
- `updateVolunteerAssignment` gains a new `extraPerms` parameter
  (`{ extraSignsPlacement?: boolean }`) and writes `extra_signs_placement`
  in the same UPDATE as the role and crew columns.

### Fixed
- **Dashboard dept pill missing color on initial load** (`views/index.ejs`) —
  the server-rendered dept pill was slugified from `shift.dept_name`
  (`"Drop-off / Pickup"` → `db-dept-drop-off---pickup`), while
  `dashboardShifts.js` correctly uses `shift.dept_key`
  (`dropoff_pickup` → `db-dept-dropoff-pickup`). The CSS class never matched
  on first load; only after the first day-navigation (which uses the JS
  renderer) did the color appear. Fixed by switching the EJS slug to use
  `dept_key` to match the JS renderer.

### Legend update (`signsMap.ejs`)
- Added a **Direction of travel arrow** section to the collapsible legend
  explaining the drag handle ("Drag handle → set direction") and the dashed
  unset state ("Dashed arrow → no direction set yet").
- Updated the Esc shortcut description to note the stepped Street View
  dismiss behavior ("second Esc closes Street View first").

---

## [2.34.0] - 2026-06-02

### Added — Sign Map Phase 3b: Direction of Travel Handle

#### Direction-of-travel arrow handle
- Full markers (zoomed in at or above the detail threshold) now display a
  100px direction arrow extending from the marker center. The arrow uses an
  inline SVG with a double-stroke technique — a wider white halo painted
  first, then a cyan (`#00d4ff`) stroke on top — identical to the
  high-contrast approach used in Windows cursor files. The shape reads
  clearly on any map tile color (asphalt, grass, snow, rooftop) without
  needing to know the background.
- OVERSEER+ users can **drag the handle** to set the direction of travel.
  The arrow rotates live during the drag; the bearing is saved automatically
  on release via a PUT to the placements endpoint. No Save button required.
- Bearing is stored in the existing `heading` column on `sign_placements`
  (repurposed — see below). The in-memory placement and the editor input
  both update live as the handle is dragged.
- **Unset state:** when no direction has been saved, the handle renders as
  a dashed semi-transparent arrow, signalling "drag me to set a direction."
- View-only users (REGISTERED / KEYMAN) see the handle when a direction is
  set, but it is not interactive — they see the bearing without being able
  to change it.
- Tooltip is suppressed while the pointer is over the handle so it does not
  obscure the drag target.

#### `heading` column repurposed as direction of travel
- The `heading` column on `sign_placements` previously held an ambiguous
  "camera facing direction." It now specifically means **direction of travel
  (0–360°, clockwise from north)** — the bearing drivers travel *toward* the
  sign. No schema change was required; all existing NULLs remain valid.
- The offcanvas editor label updated from "Heading (facing direction, 0–360°)"
  to **"Direction of travel (0–360°, optional)"** with new helper text
  explaining that the value drives the map arrow and Street View positioning.
  Users can still type a bearing directly in the input instead of dragging.
- JSDoc updated on `createSignPlacement` and `updateSignPlacement` in
  `dbSync.js` to reflect the new semantic.

#### Street View approach positioning
- `openStreetView()` now offsets the camera **20m behind the sign** along
  the reverse of the travel bearing (`SV_APPROACH_DISTANCE_METERS = 20`),
  placing the viewer where an approaching driver would be standing.
- The panorama POV heading is set to the travel bearing so the camera looks
  forward toward the sign face.
- When no direction of travel is set, behavior falls back to the existing
  placement-coordinate position with a "Rotate to face the sign" hint.
- The Street View header badge now reads `Xdeg direction of travel` to
  clarify what the bearing represents.

#### CSS architecture
- Rotation is driven by a `--travel-bearing` CSS custom property on the
  handle wrapper. JS uses `style.setProperty("--travel-bearing", ...)` rather
  than overwriting `style.transform`, preserving the positioning translate
  that centers the SVG on the marker.
- The whole-map `grabbing` cursor override (`.signs-map-bearing-drag`) is
  applied to `mapRef.getDiv()` during a handle drag so the cursor stays
  consistent even when the pointer moves off the handle during a fast rotation.

### Changed
- `TRAVEL_HANDLE_LENGTH` constant updated from 40px to 100px.

---

## [2.33.0] - 2026-06-02

### Added — Sign Map Phase 3: Street View Modal Overlay

#### Street View overlay
- A new full-screen modal overlay opens when viewing any sign placement in
  Street View. Triggered via the **Street View** button in the offcanvas
  editor (existing placements only) or via **View in Street View** in the
  right-click context menu.
- The overlay is `position: fixed`, `z-index: 1095` — above the offcanvas
  (1080), tooltip (1085), and context menu (1090); below the photo lightbox
  (1100). Fades in/out via a 150ms CSS opacity transition.
- The header bar shows the sign text + arrow glyph, a direction-of-travel
  badge (e.g. `90° direction of travel`), and a close button (×).
- When no direction of travel is set, the header shows a "Rotate to face
  the sign" hint in place of the badge.
- A no-imagery footer bar appears automatically when the panorama's
  `status_changed` event fires with a non-OK status. It offers a
  **"Open in Google Maps"** deep link as a fallback.
- The panorama is destroyed (not just hidden) on close so Google's internal
  event listeners don't leak between sessions.
- Escape key closes the Street View overlay first; a second Escape then
  deselects the map marker (stepped dismiss).
- The Google Maps native Street View pegman control is now enabled on the
  map (`streetViewControl: true`).

#### CSS reset for Street View pane
- `.signs-sv-pane` carries the same `all: revert` CSS reset block as
  `#googleMap` so Bootstrap's global button styles don't corrupt Google's
  Street View navigation controls.

#### `openStreetView()` function
- `openStreetView(placementId)` — creates a `StreetViewPanorama` at the
  placement's coordinates with `pov.heading` from the stored direction of
  travel (or 0 if unset) and `pov.pitch: -5` (slightly downward, natural
  "looking at a sign" angle).
- `closeStreetView()` — removes the overlay and releases the panorama.

---

## [2.32.0] - 2026-06-02
### Added — Sign Map Phase 2c: Tooltip, Context Menu, Lightbox, Legend

#### Hover tooltip
- Hovering over any marker shows a tooltip with the sign preview (text +
  arrow), a status badge (Planned / Installed / Removed), mount type,
  location notes, coordinates, and a thumbnail if a photo has been uploaded.
- Tooltip repositions after the thumbnail loads so it never clips the image.
- Moving the cursor from the marker onto the tooltip keeps it open (200ms
  hide delay); moving away dismisses it.
- Tooltip appended to `<body>` with `position: fixed` to escape the
  `#googleMap` CSS reset block.

#### Right-click context menu
- Right-clicking any placement marker opens a custom context menu with:
  - **Edit** — opens the offcanvas editor (always available).
  - **View photo** — opens the photo lightbox (only when a photo exists).
  - **Mark as Planned / Installed / Removed** — quick status change without
    opening the editor; skips the current status. OVERSEER+ only.
  - **Get directions** — opens Google Maps in a new tab routed to the
    placement coordinates.
  - **Copy coordinates** — writes `lat, lng` to the clipboard.
  - **Delete placement** — triggers the existing delete confirmation flow.
    OVERSEER+ only.
- Menu dismisses on outside click or Escape; positioned to stay within
  viewport bounds.
- Context menu also appended to `<body>` with `position: fixed`.
- Map background right-click suppressed (browser default menu prevented).

#### Photo lightbox
- Clicking **View photo** in the context menu (or editor) opens the full-size
  placement photo in a full-screen overlay.
- Dismiss by clicking the overlay background, the × button, or pressing Escape.

#### Collapsible legend
- A **Legend & Shortcuts** section at the bottom of the sidebar sidebar panel
  (collapsed by default) shows:
  - Status dots (Planned / Installed / Removed) with labels.
  - Marker colour palette swatches.
  - Keyboard shortcut reference (arrow keys = 0.5m nudge,
    Shift+Arrow = 5m nudge, Esc = deselect, Right-click = context menu).
- Bootstrap collapse with an animated chevron toggle button.

#### Listener hygiene
- `attachMarkerHoverListeners()` added — re-attaches `mouseenter`,
  `mouseleave`, and `contextmenu` to the new DOM node whenever `marker.content`
  is replaced (detail-level swap, status change, color change, save from editor,
  bulk color apply). Ensures tooltip and context menu always work after any
  marker rebuild.

### Notes
- Mobile UX gaps noted: context menu long-press is intercepted by Google Maps
  on touch devices; `mouseenter` tooltip never fires on touch. A proper mobile
  pass (bottom sheet or tap-to-peek for view-only users) is deferred to a later
  minor version.

## [2.31.0] - 2026-06-02

### Added — Sign Placement Phase 2c: Map UX + Direction per Placement

#### Compact markers + zoom-based detail swap
- Markers now render as **32px colored discs** with abbreviation text and
  an arrow badge when zoomed out, swapping to the full sign-preview block
  at close zoom. The threshold is adjustable via an on-map control
  (bottom-left pill showing current zoom level and a Detail ≥ input) and
  persists across sessions via `localStorage`.

#### Sign abbreviation system
- New `abbreviation NVARCHAR(6) NULL` column on `signs` table.
- Server-side heuristic (`computeSignAbbreviation`) auto-generates a
  2–3 character abbreviation from sign text (first-letter-of-each-word
  for multi-word, first-three-chars for single-word, digits preserved).
- Sign Builder exposes an optional override field; leaving it blank uses
  the heuristic. Compact map markers display the abbreviation.

#### Per-placement marker colours
- New `marker_color NVARCHAR(20) NULL` column on `sign_placements`.
- Eight-colour preset palette (red, orange, yellow, green, teal, blue,
  purple, pink) with a swatch picker in the offcanvas editor.
- **Bulk apply** button sets colour on every placement of a sign template
  in one click via `PATCH /signs/:id/placements/color`.
- Custom colour overrides the status-based colour on both compact discs
  and full marker borders; status remains visible in the sidebar dot.

#### Arrow direction moved to placements
- New `arrow_direction NVARCHAR(20) NULL` column on `sign_placements`.
- Backfill migration copies each placement's direction from its template.
- Arrow picker added to the map's offcanvas editor (compact 3×4 grid);
  new placements pre-fill from the template's default direction but can
  be overridden before saving.
- Arrow picker **removed from Sign Builder** — templates are now
  direction-agnostic; one "DROP-OFF / PICKUP" template serves all
  directional variants as separate placements.
- `getSignPlacements` and `getSignPlacementById` now read
  `p.arrow_direction` instead of `s.arrow_direction`.

#### Map UX polish
- Sidebar filter section now has a **"Filter placements"** header with
  filter icon and a horizontal rule separating filters from the Add
  Placement action button, making it clear the controls are filters.
- Migrated marker click listener from deprecated `click` to `gmp-click`
  event (suppresses Google Maps deprecation warning and fixes a
  drag-without-DevTools bug in some browser versions).

### Fix

## [2.30.0] - 2026-06-02

### Added — Sign Placement Phase 2b: Photo Upload

Volunteers can now attach a photo to any sign placement to document its
real-world installation, condition, or location context. Photos are stored
in Azure Blob Storage with managed-identity auth, processed for size and
EXIF privacy, and served through an authenticated proxy route.

#### Azure infrastructure
- **New Storage Account** `albanyjwparkingstg` in the `Parking` resource
  group (East US, Standard LRS, StorageV2). Anonymous blob access disabled
  at the account level; minimum TLS 1.2; soft delete enabled (7 days).
- **New blob container** `sign-photos` with private access.
- **RBAC** — App Service managed identity `albanyjwparking` granted
  `Storage Blob Data Contributor` scoped to the storage account (for
  production); developer accounts granted the same role for local dev.
- **Key Vault `ApiStorage`** — new secret `SignPhotosStorageAccount`
  (value: `albanyjwparkingstg`) plumbed into `azureConfig.js`'s
  `SECRET_MAP` and `CONFIG`.

#### New dependencies
- `@azure/storage-blob` — official Azure SDK for blob operations.
- `@azure/identity` upgrade — pinned to `4.5.0` to resolve a downstream
  `@azure/msal-node` / `@azure/msal-common` mismatch that prevented
  startup with the previously-pulled-in `4.13.1`.
- `sharp` — image resize/recompress (downscales to 1600px max, 85%
  JPEG, EXIF metadata stripped for privacy, EXIF orientation honored
  before stripping).
- `multer` — multipart/form-data parser for upload routes.

#### New backend module — `lib/blobStorage.js`
- `uploadSignPhoto(placementId, buffer)` — resize/recompress via sharp,
  upload to `sign-photos` container, return the blob name.
- `streamSignPhotoToResponse(blobName, res)` — stream blob bytes
  directly to an Express response with `Cache-Control: private, max-age=3600`.
- `deleteSignPhoto(blobName)` — best-effort delete via `deleteIfExists`.
- `processImage(buffer)` — exposed for potential reuse; sharp pipeline
  with EXIF rotate → resize → JPEG encode.
- `checkBlobAccess()` — debugging/health helper.
- Uses `DefaultAzureCredential` (managed identity in production, Azure
  CLI credentials locally via `az login`). No connection strings stored
  anywhere; auth is entirely identity-based.

#### New backend routes (`routes/signsRoutes.js`)
- **`POST /signs/placements/:placementId/photo`** *(manageSigns)* —
  Multipart upload accepting any image type sharp handles (jpeg, png,
  webp, heic, gif, avif, tiff). 12 MB hard cap on input; processed
  output is typically 200-500 KB. Replaces any existing photo and
  best-effort deletes the old blob.
- **`GET /signs/placements/:placementId/photo`** *(viewSigns)* —
  Auth-gated proxy that streams the blob's bytes. Photo URLs are
  never exposed directly to the browser; the proxy looks up the
  blob name from the DB row at request time.
- **`DELETE /signs/placements/:placementId/photo`** *(manageSigns)* —
  Removes both the blob (best-effort) and the DB column. Returns
  success even if the DB column was already null (idempotent).

The existing `DELETE /signs/placements/:placementId` route now also
best-effort deletes the photo blob before removing the row, preventing
orphan blobs from accumulating when placements are deleted outright.

#### New DB layer functions (`lib/dbSync.js`)
- `setSignPlacementPhoto(placementId, blobName)` — updates `photo_url`
  to the new blob name and touches `updated_at`.
- `clearSignPlacementPhoto(placementId)` — sets `photo_url` back to
  NULL when a photo is removed.

The existing `photo_url` column was repurposed (no schema change): it
now stores just the blob name (e.g. `42-1748812345.jpg`), not a full
URL. The proxy route assembles the URL at request time so no blob
endpoints leak into rendered HTML.

#### UI — Photo section in offcanvas placement editor
- **No-photo state:** dashed-border drop zone with a camera icon
  ("Add photo — Drop an image or click to choose").
- **Has-photo state:** thumbnail (up to 280px tall, full width of
  panel), with **Replace** and **Remove** buttons below.
- **Uploading state:** spinner with "Uploading and processing…" label.
- **Error state:** inline red text under the section.
- **Drag-and-drop** — drop a photo file from the OS file manager onto
  the drop zone; visual feedback (blue border) while dragging.
- **Cache-busting** — a session-scoped counter is appended as a query
  string to the proxy URL so replaced photos show immediately without
  a full page reload (the proxy itself sets `Cache-Control: max-age=3600`
  so unchanged photos still cache efficiently).
- **View-only mode** (REGISTERED / KEYMAN) — thumbnail visible when
  a photo exists; no upload/replace/delete controls; a "No photo for
  this placement" message appears in lieu of the drop zone when empty.

#### `azureConfig.js`
- `SIGN_PHOTOS_STORAGE_ACCOUNT` added to `SECRET_MAP` (maps to Key
  Vault secret `SignPhotosStorageAccount`) and to the `CONFIG` object
  with `.env` fallback. Boot log now reports `signPhotosConfigured: boolean`.

#### `.env` (developer setup)
  A new variable for local development:
  env

## [2.29.1] - 2026-06-02

A polish + bugfix release on top of 2.29.0's Sign Placement System. No schema
changes, no new features — purely cleanup of the map UX and the surrounding
CSP / config plumbing surfaced once real users started clicking around.

### Added
- **Custom Google Maps Map ID** (`6261df670165b61fc3ae73a4`) wired into
  `signsMap.js`, replacing the placeholder `DEMO_MAP_ID`. Configured via
  Cloud Console with POI categories (business, restaurants, gas stations,
  banks, etc.) hidden, keeping the convention-area map clean.
- **Keyboard nudging** for selected sign placements on `/signs/map`:
  - Click a marker → it gets a yellow halo with a pulsing dashed ring,
    visible until deselected.
  - **Arrow keys** nudge ~0.5m per press (fine adjustment).
  - **Shift+Arrow** nudges ~5m per press (coarse positioning).
  - **Esc** or clicking the map background deselects.
  - Each nudge debounces a 400ms PUT save to the server; in-flight saves
    serialize so rapid keypresses can't race.
  - Editor inputs (`#editorLat` / `#editorLng`) update live when the
    nudged placement is the one being edited.
  - Selection survives the offcanvas editor open/close cycle.
  - Selection survives drag operations — the marker stays keyboard-active
    immediately after release without needing a fresh click.
  - View-only roles (REGISTERED / KEYMAN) can't nudge — `canManage`
    short-circuits the handler.

### Changed
- **`GOOGLE_MAPS_API_KEY`** plumbed through `src/config/azureConfig.js`
  (`SECRET_MAP` entry mapping the Key Vault secret `GoogleMapsApiKey`,
  plus the `CONFIG` object with `.env` fallback). Startup log now reports
  `googleMapsConfigured: boolean` so it's obvious whether the key is
  reaching the server.
- **Map defaults to roadmap** instead of hybrid/satellite — vector-map
  satellite tiles render with washed-out colors under custom Cloud Console
  styles; the Map / Satellite toggle is still available for users who want
  satellite manually.
- **Template picker dropdowns** (both the sidebar status filter and the
  offcanvas editor's "Sign template" select) now show the arrow direction
  Unicode glyph and `(#id)` suffix beside each `sign_text`. Resolves
  the "six identical PARKING entries" problem when one template name has
  multiple arrow variants. Description appears as `— text` when set.
- **`style-src` CSP**: dropped the per-request nonce from the `style-src`
  directive in `index.js`. When both `'unsafe-inline'` and a nonce are
  present, browsers ignore `'unsafe-inline'` — which broke Google Maps'
  internal inline-style writes. The nonce was redundant since
  `'unsafe-inline'` was already permitted; removed it to restore inline-
  style fallback for libraries that depend on it. Nonce stays on
  `script-src` (where it actually matters for security).
- **`script-src` CSP**: added `'wasm-unsafe-eval'` to allow the Google
  Maps vector renderer to compile WebAssembly. Required for any vector
  map with a `mapId` set. Scope is limited to WebAssembly only — does
  NOT enable general `eval()` or `new Function()`.
- **`connect-src` CSP**: added `data:` (both prod and dev) so the Maps
  worker can fetch its embedded data-URI pixel resources.

### Fixed
- **Google Maps control rendering** — global `button` styles from
  `styles.css` (padding, box-shadow, `box-sizing: border-box`) were
  leaking into Google's internal control DOM, producing pill-shaped
  zoom buttons and visually corrupted icons. Added an aggressive CSS
  reset scoped to `#googleMap` (including `all: revert`,
  `box-sizing: content-box`, and selector specificity that beats global
  `button { ... }` rules without `!important`).
- **Doubled bottom-right map controls** — vector maps enable several
  controls by default that raster maps don't, including a "Map camera
  controls" button that appears above the zoom stack. Suppressed via
  explicit per-control options: `cameraControl: false`,
  `panControl: false`, `rotateControl: false`, `scaleControl: false`,
  `fullscreenControl: false`. The result is a clean Map/Satellite toggle
  top-left and a zoom +/- stack bottom-right, nothing else.
- **Offcanvas editor z-index** — the site navbar sits at `z-index: 1050`,
  above Bootstrap's default offcanvas `z-index: 1045`, causing the navbar
  to bleed through the editor panel. Bumped `.signs-placement-offcanvas`
  to 1080 and `.offcanvas-backdrop.show` to 1075.
- **Crosshair cursor in placing mode** — Google Maps writes inline
  cursor styles to `.gm-style`, overriding the class-level
  `.signs-map-placing { cursor: crosshair }` rule. Broadened the
  selector to target `.gm-style` and its direct children, winning the
  specificity battle without `!important`.
- **Keyboard nudging after a drag** — `document.addEventListener("keydown", ...)`
  was on the bubble phase, but Google Maps' internal DOM captures
  keyboard events on its container and stops their propagation, so the
  handler never fired until the user clicked elsewhere to move focus.
  Switched to the **capture phase** (`useCapture: true`) so the handler
  runs on the way down the tree, before Maps swallows the event. Now
  arrow keys work immediately after a drag without needing a sidebar click.
- **Drag-then-deselect race** — the map background's "click → deselect"
  handler was firing on the synthetic click that some browsers emit
  immediately after `dragend`, clearing the selection that the dragend
  handler had just re-set. Added a 300ms timestamp guard on the map-click
  handler that suppresses deselection during the post-drag window.

### Notes
- The Google Cloud Console style for the new Map ID must be **published**
  (not just saved as a draft) for changes to propagate. Propagation can
  take a few minutes; incognito + DevTools "Disable cache" bypasses any
  client-side caching during testing.
- The Map ID associated style currently has Roadmap as the base. Switching
  to Satellite/Hybrid as the base later requires a re-publish of the
  associated style; the code defaults to `roadmap` mapTypeId regardless.

## [2.29.0] - 2026-06-01

A major new feature area: the **Sign Placement System** for managing the
directional placards placed around the convention area (parking, lot status,
overflow routing, etc.). This release covers both Phase 1 (templates + library)
and Phase 2 (satellite-map placement). Phase 3 will add a bearing-tracked
Street View overlay; Phase 2b will add photo upload via Azure Blob Storage.

### Added — Schema
- **`signs` table** — reusable sign templates (`sign_text`, `arrow_direction`,
  optional `description`, audit columns, `is_archived` BIT for soft delete).
- **`sign_placements` table** — geographic instances of a template with
  `latitude`/`longitude` (`DECIMAL(10,7)`, ~1cm precision), nullable `heading`
  (compass bearing the sign faces — for the Phase 3 Street View overlay),
  `location_notes`, `status` (`planned`/`installed`/`removed`),
  `mount_type` (`cone`/`a-frame`/`existing-structure`, nullable), optional
  `photo_url`, and full install/remove audit trail.
- **`arrow_direction` allowed values** — `up`, `down`, `left`, `right`,
  `up-left`, `up-right`, `down-left`, `down-right`, `up-then-left`,
  `up-then-right`, `destination`, or null. Enforced via CHECK constraint.
- **`mount_type` allowed values** — `cone`, `a-frame`, `existing-structure`,
  or null. Enforced via CHECK constraint.
- FK from `sign_placements.sign_id` to `signs.sign_id` survives template
  archival so historical placements remain valid.

### Added — RBAC
- **`viewSigns`** — REGISTERED, KEYMAN, OVERSEER, ASSISTANT_ADMIN, ADMIN.
- **`manageSigns`** — OVERSEER, ASSISTANT_ADMIN, ADMIN.
- DESK explicitly does not see signs (scoped to attendance and account creation).

### Added — Sign Library *(`/signs`, REGISTERED+)*
- Card grid showing each template's preview (text + arrow + destination pin),
  description, and placement count.
- Live search/filter across sign text and description.
- Edit and Archive buttons surface only for users with `manageSigns`.
- Archiving a template is a soft delete — existing placements survive and the
  template stops appearing in the library or the map's template picker.

### Added — Sign Builder *(`/signs/builder` and `/signs/builder/:id`, OVERSEER+)*
- Live preview that updates as the user types and clicks arrow buttons.
- 4-row arrow picker grid:
  - Row 1: ↖ ↑ ↗ (up-left, up, up-right)
  - Row 2: ← ⊘ → (left, no-arrow, right)
  - Row 3: ↙ ↓ ↘ (down-left, down, down-right)
  - Row 4: ↰ ↱ 📍 (up-then-left, up-then-right, destination pin)
- The destination pin is rendered as a FontAwesome `fa-location-dot` icon
  (not Unicode) for consistent cross-platform appearance.
- Clicking the active arrow a second time deselects it.
- AJAX save to POST `/signs` (new) or PUT `/signs/:id` (edit); redirects to
  the library on success.

### Added — Sign Map *(`/signs/map`, REGISTERED+ view, OVERSEER+ edit)*
- Google Maps satellite + hybrid view of all non-archived placements as
  `AdvancedMarkerElement` DOM markers rendering the actual sign preview block.
- Status-coded marker borders: gray (planned), green (installed), red (removed).
- **Click-to-place** workflow — OVERSEER+ clicks "Add placement", clicks the
  map to drop a pin, then picks a template in the offcanvas editor.
- **Drag-to-reposition** — dragging a marker autosaves the new coords on
  drag-end; rejected saves snap the marker back.
- **Offcanvas editor** (slides in from the right) — edit status, mount type,
  heading (0–360°, optional), location notes; or delete. Read-only audit line
  showing `created_by` / `installed_by`.
- **Filters** — status chips (All / Planned / Installed / Removed) and
  template dropdown filter the markers and the sidebar list in tandem.
- **Sidebar placement list** synced to current filters; clicking a row
  opens the editor for that placement.
- View-only mode for REGISTERED / KEYMAN — drag disabled, no edit/delete.
- Graceful fallback when `GOOGLE_MAPS_API_KEY` is not configured — page
  loads with a warning panel in place of the map.
- Bootstrap JSON loaded via `<script type="application/json">` (CSP-safe;
  no inline JS, no API key in static HTML).

### Added — Routes (`routes/signsRoutes.js`)
- GET `/signs`, GET `/signs/builder`, GET `/signs/builder/:id`,
  GET `/signs/map` — render pages.
- POST `/signs`, PUT `/signs/:id`, DELETE `/signs/:id` — template CRUD (JSON).
- GET `/signs/:id/placements`, POST `/signs/:id/placements`,
  PUT `/signs/placements/:id`, PATCH `/signs/placements/:id/status`,
  DELETE `/signs/placements/:id` — placement CRUD (JSON).
- The `signsRouter` factory accepts `googleMapsApiKey` and `defaultMapCenter`
  dependencies from `index.js`.

### Added — DB layer (`lib/dbSync.js`)
- New SIGNS section: `getSigns`, `getSignById`, `createSign`, `updateSign`,
  `archiveSign`, `getSignPlacements` (filters by signId / status; excludes
  archived templates by default), `getSignPlacementById`,
  `createSignPlacement`, `updateSignPlacement`,
  `updateSignPlacementStatus` (auto-syncs `installed_by` / `installed_at` /
  `removed_at` audit columns based on the destination status),
  `deleteSignPlacement`.

### Added — Config
- **`src/config/azureConfig.js`** — `GOOGLE_MAPS_API_KEY` added to
  `SECRET_MAP` (mapped from Key Vault secret `GoogleMapsApiKey`) and to
  the `CONFIG` object with `.env` fallback. Boot log now reports
  `googleMapsConfigured: boolean`.
- **`index.js`** — passes `config.GOOGLE_MAPS_API_KEY` and a
  `defaultMapCenter` (MVP Arena: lat 42.6485, lng -73.7490, zoom 17) to
  the `signsRouter` factory.

### Added — Navigation
- **Sitemap** (`src/config/sitemap.json`) — new "Signs" group containing
  Sign Library, Sign Builder, and Sign Map entries with appropriate
  `permission` gates.
- **Header — Resources dropdown** — Sign Library link added below Maps,
  gated by `viewSigns`.
- **Header — Oversight dropdown** — new "Signs" category between Reports
  and Scheduling with Sign Library and Sign Builder links, conditional on
  the appropriate permission.
- **Oversight Tools page** — Signs section between Reports and Scheduling
  with Sign Library and Sign Builder cards. Mobile section-jump dropdown
  and desktop sidebar both updated.

### Changed — CSP (`index.js`)
- `script-src` adds `https://maps.googleapis.com` and `https://maps.gstatic.com`.
- `img-src` adds `blob:`, `https://maps.googleapis.com`, `https://maps.gstatic.com`,
  `https://*.googleapis.com`, `https://*.gstatic.com`, and
  `https://streetviewpixels-pa.googleapis.com`.
- `connect-src` (dev) adds the same Maps origins. Prod already permits
  `https:` broadly so no production change is required.
- New `worker-src: 'self' blob:` directive — Google Maps uses blob-URL
  Web Workers internally.

### Fixed
- **`signsBuilder.ejs` content swap** — the file was initially created with
  the contents of `signsList.ejs`, which caused
  `ReferenceError: signs is not defined` on every visit to `/signs/builder`.
  Replaced with the correct sign builder markup.
- **`signsBuilder.js` IIFE typo** — final-line `};)();` was a syntax error
  that prevented the entire script from running, leaving the live preview
  and arrow picker non-functional. Fixed to `})();`.

### New files
- `routes/signsRoutes.js`
- `views/authentication_and_accounts/signsList.ejs`
- `views/authentication_and_accounts/signsBuilder.ejs`
- `views/authentication_and_accounts/signsMap.ejs`
- `public/js/signsList.js`
- `public/js/signsBuilder.js`
- `public/js/signsMap.js`
- `public/styles/signs.css`

## [2.28.0] - 2026-05-29

### Added
- **Maps page** — new authenticated page at `/maps` (REGISTERED+, `viewMaps` permission).
  - Fetches subfolder structure from OneDrive via Microsoft Graph API and renders
    each subfolder as a section heading with file tiles beneath it.
  - Each tile shows the filename, OneDrive file description, last-modified date,
    and file size. View/Download button links to the OneDrive file.
  - **ScribbleMaps integration** — each subfolder can contain a `_meta.json` sidecar
    file mapping filenames to `scribbleUrl` and `embedUrl` entries. Files with a
    `scribbleUrl` get an Interactive Map button. Files with an `embedUrl` render a
    live map preview panel on the left side of the tile (iframe scaled to 120px
    via `position: absolute` + `transform: scale(0.333)`); clicking the preview
    opens the ScribbleMaps link in a new tab.
  - `_meta.json` content fetched via Graph `/drive/items/{id}/content` endpoint
    (bearer token auth — works correctly with service principal app-only tokens).
  - Empty subfolders are silently hidden (no heading rendered).
  - Graceful error state if OneDrive is unreachable.
- **`listOneDriveFolder()`** added to `lib/graphClient.js` — lists immediate
  subfolders of a given drive path and returns them as `DriveFolderSection[]`,
  each containing `DriveFileItem[]` with `scribbleUrl` and `embedUrl` merged
  from `_meta.json`.
- **`routes/mapsRoutes.js`** — new router factory wired into `index.js`.
- **`views/maps.ejs`**, **`public/styles/maps.css`**, **`public/js/maps.js`** — new files.
- **Maps entry in `sitemap.json`** — Resources group, `minRole: REGISTERED`,
  `permission: viewMaps`.
- **CSP `frame-src`** updated to allow `https://www.scribblemaps.com` and
  `https://widgets.scribblemaps.com`.

### Changed
- Tile grid column breakpoints changed from `col-sm-6` to `col-lg-6` so tiles
  with embed previews stay full-width on narrow viewports.

## [2.27.1] - 2026-05-29

### Fixed
- **Oversight structure rename refactor — completed.** Cleans up the
  collateral damage from the prior global find/replace of "hierarchy" /
  "command hierarchy" / "chain of command" → "oversight structure".
  - **SQL table name** in every oversight structure query was mangled as
    `dbo.oversight structure` (literal space, broken syntax). Every CRUD
    operation against the oversight structure tree was failing at the DB
    layer. Fixed 5 query call sites in `dbSync.js` to use the new
    snake_case `dbo.oversight_structure` (also covered for the `demo.`
    schema via the automatic `dbo.` → `demo.` rewrite in `lib/sql.js`).
  - **Broken CSS rule** `.db-oversight structure {` (literal space in the
    selector — invalid CSS) silently never applied. The dashboard oversight
    tree was missing its parent container styles entirely. Fixed to
    `.db-oversightstructure {` in `index.css`.
  - **Two runtime bugs in `views/index.ejs`** in the dashboard oversight
    card: `typeof oversight_structure` checked a variable that doesn't exist
    (the actual variable was `oversightstructure`, so the empty-state check
    always evaluated as defined and fell through), and `oversightructure.forEach`
    was a typo (missing `s`) that threw `ReferenceError` for every logged-in
    user viewing the dashboard. Both fixed.
  - **Numerous missing spaces** from the original find/replace concatenating
    "oversight structure" against the next word (`oversight structurenode`,
    `oversight structureAPI`, `oversight structureGET error:`,
    `oversight structuredelete error:`, `No oversight structureconfigured yet.`,
    etc.). Fixed across `oversightRoutes.js`, `oversightStructure.js`,
    `oversightStructure.ejs`, `oversightTools.ejs`, `index.ejs`,
    `sitemap.json`, `README.md`, `OVERSIGHT_GUIDE.md`.
  - **Stale "chain of command" comments** in `oversightStructure.css`,
    `index.css`, `oversightStructure.js`, `views/index.ejs`, and `README.md`
    (3 places in the project-structure tree) all updated to refer to oversight
    structure.
  - **RBAC concept un-polluted.** The original global rename wrongly caught
    `RBAC role hierarchy` (a separate concept from the parking-team org
    structure) in six places. Reverted in `roles.js` (file-header JSDoc +
    `ROLE_HIERARCHY` JSDoc), `oversightRoutes.js` (one comment in the
    role-assignment handler), `README.md` (database section: scheduling
    hierarchy), `OVERSIGHT_GUIDE.md` (Timelines section: schedule hierarchy,
    plus two missing-space lines under the Oversight Structure section), and
    `CHANGELOG.md` (the Pre-2.1.0 RBAC entry). The `ROLE_HIERARCHY` constant
    itself and the `roleHierarchy` template variable in `adminRoles.ejs` were
    already correctly preserved.

### Changed
- **Renamed three `dbSync.js` functions** to drop the legacy "Hierarchy" naming:
  - `addHierarchyNode` → `addOversightStructureNode`
  - `saveHierarchyOrder` → `saveOversightStructureOrder`
  - `deleteHierarchyNode` → `deleteOversightStructureNode`
  - All import and call sites in `oversightRoutes.js` updated accordingly.
- **Renamed variable `rawHierarchy`** → `rawOversightStructure` in
  `index.js`, `oversightRoutes.js`, and
  `views/authentication_and_accounts/oversightStructure.ejs`.
- **Renamed template variable `oversightstructure`** → `oversightStructure`
  (proper camelCase) in `index.js` and `views/index.ejs` (3 use sites).
- Added missing JSDoc to `deleteOversightStructureNode` per project convention.

### Removed
- **Duplicate oversight structure route block** in `oversightRoutes.js`.
  The file contained two complete sets of identical routes
  (`GET /oversight/tools/oversightstructure`, `POST /add`, `POST /save`,
  `DELETE /:id`) around line 4329 and again around line 5530. Express matches
  in registration order, so the first set was active and the second was dead
  code. The first set had materially worse code: no temp-id filtering in `/save`,
  no type coercion, mangled error labels, and was additionally broken by the
  rename (still called the removed `saveHierarchyOrder`). The second block was
  kept — it has proper `Array.isArray` validation, filters to positive IDs
  before saving (so unsaved temp nodes are correctly skipped), coerces all
  values via `Number()`, and ships full `@requires` JSDoc tags.

## [2.27.0] - 2026-05-28

### Added
- **Guided tour system** — Shepherd.js v15.2.2 mini-tours added to all 13
  oversight tool pages. Each page has a **Take a tour** button (top-right
  of the page header) that launches a step-by-step walkthrough tailored to
  that page's content and state.
  - Tours are context-aware: steps are conditionally included based on
    what is present on the page (e.g. the Timelines sessions tour skips
    shift and assignment steps when no shifts exist yet).
  - **Modal-integrated tour steps** — form modals on the Timelines page
    open programmatically during the tour so overseers can see every field.
    Modal save/delete buttons are neutralized during tour preview via the
    `.tour-preview` class (Cancel remains active).
  - **Three-tier z-index stack** ensures tours work correctly alongside
    Bootstrap modals: Shepherd overlay (9999), tour-preview modal (10000),
    Shepherd tooltip (10001).
  - `tourBase.js` — shared factory for `createTour()` and standard button
    sets (`startButtons`, `navButtons`, `finishButtons`).
  - Tour files: `volunteersTour.js`, `rolesTour.js`, `timelinesTour.js`
    (three sub-paths: event types, days, sessions+shifts), `schedulerTour.js`,
    `schedulerReportTour.js`, `oversightToolsTour.js`, `campaignTour.js`,
    `invitationTrackerTour.js`, `attendanceCheckinTour.js`,
    `attendanceReportTour.js`, `locationsTour.js`, `crewMatrixTour.js`,
    `reportsTour.js`.
- **Timelines — modal forms** — all six inline card panels on the Timelines
  page converted to Bootstrap modals:
  - Event Type (`#etFormPanel`) — `modal-lg`, secondary header
  - Convention Day (`#dayFormPanel`) — `modal-xl`, warning header
  - Copy Day (`#copyDayFormPanel`) — `modal-xl`, info header
  - Session (`#sessionFormPanel`) — `modal-lg`, secondary header
  - Shift (`#shiftFormPanel`) — `modal-xl`, primary header
  - Assign Location (`#assignFormPanel`) — `modal-lg`, success header
  - All modals position Delete on the far left of the footer (`me-auto`),
    separated from Save/Cancel. Cancel closes via `data-bs-dismiss`.
- **`public/css/tours.css`** — all tour and modal z-index rules:
  - `.shepherd-element.ajwp-tour-step` — step container at z-index 10001
  - `body.shepherd-has-active-tour .modal` — tour-active modals at 10000
  - `body.shepherd-has-active-tour .modal-backdrop` — suppressed during tours
  - `.modal.tour-preview .modal-footer .btn:not([data-bs-dismiss])` —
    disables Save/Delete buttons in tour-preview modals

### Changed
- `timelines.js` — all eight `openPanel()` callers updated to pass a focus
  element as the second argument; focus fires via `shown.bs.modal` event
  instead of immediately after the call.
- Shepherd CSS and `tours.css` added to all 13 tour-enabled pages.

## [2.26.0] - 2026-05-27

### Added
- **SMS opt-in/out management** — new SMS Management tab on the Volunteer
  Account Oversight page (`/editVolunteer?tab=sms`), visible to ASSISTANT_ADMIN+.
  - Filterable table of all volunteers with SMS status (Opted In / Opted Out / Never),
    opt-in timestamp and source, opt-out timestamp.
  - Manual toggle buttons — opt a volunteer out or re-opt them in without going
    through the Twilio STOP/UNSTOP flow. Mirrors the Twilio webhook behavior:
    opt-out sets `sms_opted_in = 0`, re-opt-in sets `sms_opted_in = 1` with
    `source = 'admin'`.
  - Search by name + filter by status. Tab loads data lazily on first activation.
  - Auto-activates when navigated to via `?tab=sms` query param.
- **SMS Management card** on Oversight Tools hub (Volunteer Management section,
  ASSISTANT_ADMIN+) linking directly to `/editVolunteer?tab=sms`.
- **Campaign Center soft warning** — when SMS channel is selected and one or
  more recipients have opted out, a confirmation dialog shows the count before
  sending. Does not block the send — just informs.
- **`getVolunteersForSmsManagement()`** — new `dbSync.js` function returning
  all active volunteers with full SMS status columns.
- **`setVolunteerSmsOptOutManual()`** — new `dbSync.js` function for oversight
  manual opt-in/out toggle.
- **`sms_opted_out`** added to `getVolunteersForMessaging()` return and
  `data-sms-opted-out` attribute on Campaign Center volunteer list items.
- New routes: `GET /oversight/tools/sms-management`,
  `POST /oversight/tools/sms-management/toggle`.
  
## [2.25.0] - 2026-05-27

### Added
- **Dynamic RSVP configuration** — campaign batches now support configurable
  response options instead of the hardcoded yes/no/maybe set.
  - **Response types:** Standard (yes/no/maybe, any subset), Custom (admin-defined
    labels), Poll (question + options).
  - **Free-text "Other"** — any response type can enable an "Other" button that
    reveals a text input; the volunteer's typed answer is stored in
    `invitations.response_other`.
  - **Campaign Center UI** — new response config builder appears below the
    "Response needed" checkbox when creating a campaign. Standard mode shows
    checkboxes to include/exclude yes/no/maybe; Custom and Poll show a textarea
    for options (one per line); Poll adds a question field.
  - **RSVP page** (`/invite/respond/:token`) — buttons rendered dynamically from
    `response_config`. Standard options get their existing icon+color treatment;
    custom/poll options use a generic outlined style. Poll prompt replaces the
    default "Will you be volunteering..." question.
  - **Invitation Tracker** — response column handles custom/poll/other responses.
    "Other" shows a truncated badge with the full text on hover.
  - **`invitation_batches.response_config`** `NVARCHAR(MAX)` — stores JSON config.
    `NULL` = default standard, fully backward-compatible.
  - **`invitations.response_other`** `NVARCHAR(500)` — stores free-text "Other"
    input. `NULL` when not applicable.
- **DB migrations** — `scripts/migrations/` folder established as the canonical
  home for all schema migration scripts. Every migration ships as two paired
  files: `migration_name.sql` (dbo) + `migration_name_demo.sql` (demo).
  `scripts/migrations/README.md` documents the convention and logs all migrations.
  - `addDepartmentId` — adds `department_id INT NULL DEFAULT(1)` to 9 core tables
    and creates a `departments` lookup table. Placeholder for future
    multi-department support. All existing rows and INSERTs unaffected.
  - `addResponseConfig` — adds `response_config` to `invitation_batches` and
    `response_other` to `invitations`.
- **CSP fix** — `db-oversightstructure-node` `--depth` CSS custom property moved from
  inline `style=` attribute in `index.ejs` to `data-depth` attribute applied
  via `el.style.setProperty()` in `dashboardShifts.js`.

### Fixed
- `alertScheduler` hoisted to module scope (`let alertScheduler = null`) so
  SIGINT/SIGTERM handlers don't throw `ReferenceError` during rolling App Service
  restarts when the old container receives SIGTERM before `startAlertScheduler()`
  was called. Null guard added to both shutdown handlers.
- `GraphTenantId`, `GraphClientId`, `GraphClientSecret` added to Azure Key Vault
  — eliminates missing-secret startup errors on every container boot.

## [2.24.1] - 2026-05-27

### Fixed
- `alertScheduler` hoisted to module scope with `let alertScheduler = null`
  so SIGINT/SIGTERM handlers no longer throw `ReferenceError` if startup
  fails before `startAlertScheduler()` is called (e.g. during rolling
  App Service restarts triggered by config changes).
- Added null guard (`if (alertScheduler)`) in both shutdown handlers.
- Added `GraphTenantId`, `GraphClientId`, `GraphClientSecret` to Azure
  Key Vault — eliminates missing-secret errors on every startup.

## [2.24.0] - 2026-05-27

### Added
- **Demo environment** — full parallel instance of the app at
  `demo.albanyjwparking.org` sharing the same Azure App Service, codebase,
  and database server, with complete data isolation via a separate SQL schema.
- **`demo` SQL schema** — all 23 production tables mirrored into `demo.*`
  using a dynamic T-SQL script that reads `sys.columns`, `sys.identity_columns`,
  `sys.default_constraints`, and `sys.indexes` to reproduce column types,
  IDENTITY, NOT NULL, DEFAULT constraints, and primary keys exactly.
- **`parking_demo` contained database user** — SQL auth user with
  `DEFAULT_SCHEMA = demo` and `SELECT/INSERT/UPDATE/DELETE` on `schema::demo`.
  No server-level login required (Azure SQL contained user pattern).
- **`AsyncLocalStorage`-based pool routing** (`lib/sql.js`) — `demoStorage`
  ALS instance propagates `{ isDemo: boolean }` through the entire async
  request chain. `getSqlPool()` and `query()` read the store automatically,
  routing all DB calls to the demo pool with zero changes to `dbSync.js` or
  any route handler.
- **`dbo.` → `demo.` SQL rewrite** in `query()` — all explicit `dbo.*`
  references in query strings are rewritten to `demo.*` at runtime when
  `isDemo` is true, handling every `FROM`, `JOIN`, `UPDATE`, `INSERT INTO`,
  and `DELETE` pattern in `dbSync.js` without modifying those queries.
- **`middleware/demoContext.js`** — detects `demo.albanyjwparking.org`
  hostname (configurable via `DEMO_HOSTNAME` env var), stamps `req.isDemo`,
  and wraps the request pipeline in the ALS context. Placed before session
  middleware and all routes so every downstream operation inherits the context.
- **Demo messaging suppression** — `demoStorage` guard added to
  `lib/messaging.js` `sendResetSms()` and `sendResetEmail()`. All Twilio
  and SMTP sends are silently suppressed (logged only) in demo context.
- **`scripts/seedDemo.js`** — full demo data seed script. Connects as
  `parking_demo` and populates all 23 demo tables with:
  - 70 volunteers (real roster structure, anonymized emails, 6 named login
    accounts with working PBKDF2 password hashes)
  - 7 event types, 8 locations/tasks (real MVP Arena / OGS Garage structure
    with addresses and coordinates)
  - 5 convention days, 28 sessions, 51 shifts, 82 schedule assignments
    matching the real scheduling architecture
  - Oversight structure (5-node tree)
  - 7 congregations, 7 roles, 3 message templates, 1 invitation batch with
    8 invitations
  - Safe to re-run — clears all tables in FK-safe order before inserting
- **`scripts/anonymizeDemo.sql`** — direct SQL `UPDATE` statements replacing
  real volunteer first names, last names, congregation city names, location
  names, addresses, and oversight structure titles with fictional alternatives
  in the `demo` schema. Safe to re-run.
- **`upgradeInsecureRequests: null`** in Helmet CSP — disables the
  `upgrade-insecure-requests` directive that was forcing HTTPS on all asset
  requests in local HTTP development. No effect in production (Azure terminates
  TLS before Express).
- **New env vars:** `DEMO_DB_USER`, `DEMO_DB_PASSWORD`, `DEMO_HOSTNAME`

### Demo login credentials
| Email | Role | Password |
|---|---|---|
| `admin@demo.com` | ADMIN | `Demo@2026!` |
| `asstadmin@demo.com` | ASSISTANT_ADMIN | `Demo@2026!` |
| `overseer@demo.com` | OVERSEER | `Demo@2026!` |
| `keyman@demo.com` | KEYMAN | `Demo@2026!` |
| `desk@demo.com` | DESK | `Demo@2026!` |
| `volunteer@demo.com` | REGISTERED | `Demo@2026!` |

## [2.23.2] - 2026-05-24

### Changed
- Eliminated all CSP `unsafe-inline` violations across 9 EJS templates
  - Moved 2 inline `<script nonce>` blocks to external JS files:
    `adminCreateVolunteer.js` (new), `adminSendReset.js` (new)
  - Replaced 2 inline `onchange` event handlers with `addEventListener`
    calls in `timelines.js` and `locationsAndTasks.js`
  - Replaced 24 inline `style=` attributes across 7 templates with
    named CSS utility classes in `styles.css`, `attendance.css`,
    and `shiftAlerts.css`
  - Replaced unrenderable `style=` on `<option>` in `oversightTools.ejs`
    with a text-based indent (`&nbsp;&nbsp;↳`)
- Removed phantom direct dependencies `@azure/msal-common` and
  `@azure/msal-node` from `package.json` (neither is imported directly)
- Added `overrides: { "@azure/msal-common": "15.13.3" }` to pin away from
  the broken v15.15.0 npm publish (missing dist `.mjs` files) that caused
  `ERR_MODULE_NOT_FOUND` on startup

  
## [2.23.0] - 2026-05-22

### Fixed
- Added 'DESK' _navRole to oversight dropdown in header to gain access
  to Create Volunteer, Checkin, and Attendance Report

## [2.23.0] - 2026-05-22

### Changed
- Invitation Tracker now collapses to one row per volunteer per campaign
  family. A "family" is a parent batch plus all direct follow-up children.
  The winning row per volunteer is resolved by: responded (non-revoked) first,
  then pending, then revoked, tiebroken by most-recent invitation id. This
  means a follow-up RSVP surfaces correctly when viewing the parent campaign.
- `getInvitationsForTracker` unified into a single family-aware CTE path.
  `family_root_id` (COALESCE(parent_batch_id, batch_id)) is computed and
  returned on every row. Server-side batch/day/response filters removed from
  the tracker page load — all filtering is now client-side so switching
  campaigns requires no page reload.
- Tracker campaign filter resolves child batch selection to the parent family
  root automatically — selecting a follow-up batch shows the merged parent view.
- Campaign center invite-status badges now reflect family-wide RSVP status.
  The `batches/:id/invited` endpoint resolves to the family root before
  querying so a follow-up RSVP correctly badges the volunteer as responded.

### Fixed
- Undeclared `modeFollowupBtn` variable in `campaignCenter.js` caused a
  ReferenceError that crashed the entire DOMContentLoaded handler, silently
  preventing invite-status badges and batch preview from loading when a
  campaign was selected. Fixed by adding the missing `getElementById` declaration.
- Split email/SMS sends that were created as two independent top-level batches
  (Scam Warning batches 7 and 8) caused every volunteer to appear twice in the
  tracker pending count. Fixed in data by setting batch 8 `parent_batch_id = 7`.

## [2.22.0] - 2026-05-22

### Added
- Campaign message types (Invitation, Alert, Follow-up) with logical defaults,
  auto-mode switching, and confirmation modal when defaults are overridden
- {link} merge chip hidden for Alert type
- Message type badge on Invitation Tracker campaign column
- Response required only filter on Invitation Tracker
- Schedulable flag on convention days — unschedulable days hidden from
  Scheduler while remaining available for invitations and timelines
- Report a Bug modal (footer, all authenticated pages, Ctrl+Shift+B)
- Bug Reports admin page (/oversight/tools/bug-reports, ASSISTANT_ADMIN+)
  with inline resolution editing and manual log panel
- bug_reports DB table with full lifecycle tracking

### Fixed
- Reminder send no longer falls through to createInvitation when no
  existing invitation row is found
- Campaign center name filter no longer clears already-selected recipients
- Invitation Tracker pending badge hidden for campaigns with response
  not required
- CSP violations from inline styles on tracker and bug report modal

## [2.21.0] - 2026-05-22

### Added
- Schedulable flag on convention days — unschedulable days (e.g. meeting-only
  days) are hidden from the Scheduler and Scheduler Report day pickers while
  remaining fully available for invitations, timelines, and attendance
- "Meeting only" badge on day cards in Timelines when schedulable is off
- schedulable column added to dbo.convention_days (DEFAULT 1, non-breaking)

## [2.20.0] - 2026-05-22

### Added
- Report a Bug modal available on every authenticated page via footer link (Ctrl+Shift+B shortcut)
- Bug Reports admin page (/oversight/tools/bug-reports, ASSISTANT_ADMIN+) with status filtering and inline resolution editing
- Manual bug log panel on admin page for logging bugs that were caught and fixed without a user submission
- bug_reports DB table tracking full lifecycle: description, steps, page URL, status, solution, files touched, fixed date, resolved by

### Fixed
- Reminder flow: isReminder=true no longer falls through to createInvitation when no existing invitation row is found for a volunteer — skips with a reason instead
- Campaign center: name/search filter no longer clears already-selected recipients from the send list
---
## [2.19.0] — 2026-05-22
### Added
- **JSON-driven sitemap** — new public page at `/sitemap` listing all app pages, filtered server-side to the visitor's current role and permissions. Guests see only public pages; logged-in users see every page their role can reach. No unaccessible paths are sent to the client.
- **`src/config/sitemap.json`** — single source of truth for all page metadata (title, path, description, icon, `minRole`, `permission`). Adding a new page requires only a new JSON entry — no HTML, no route changes.
- **Live search** (`public/js/sitemapSearch.js`) — filters cards and hides empty group sections in real time as you type. Shows a "no results" message when nothing matches.
- **Footer link** — Sitemap added to the footer link row alongside Privacy Policy and Terms of Service.
- **Oversight Tools card** — Sitemap card added at the bottom of the Oversight Tools hub, visible to all KEYMAN+ users.
- **New files:** `src/config/sitemap.json`, `routes/sitemapRoutes.js`, `views/sitemap.ejs`, `public/js/sitemapSearch.js`, `public/styles/sitemap.css`.

---

## [2.18.1] — 2026-05-21
### Fixed
- **SMS check-in: wrong `convention_day_id` written to attendance** — `getVolunteerShiftByCode`
  and `getVolunteerActiveShiftToday` return `convention_day_id` via the sessions chain, which
  can differ from the scheduler assignment day when old test days exist in the DB. Added
  `getSchedulerDayForVolunteerShift()` to `dbSync.js` (queries `shift_slot_assignments`) and
  used it in both SMS handler paths in `index.js` so attendance rows are always written with
  the day the scheduler actually placed the volunteer on.
- **SMS check-in: Twilio inbound webhook never reached server** — the Albany Parking
  Messaging Service in Twilio had its inbound Request URL set to the placeholder
  `https://yourdomain.com/api/sms/webhook`. Number-level webhook settings are overridden
  by the Messaging Service, so all volunteer replies were silently dropped. Updated to the
  correct application URL.
- **SMS check-in: T-15 guard missing from both inbound paths** — `CHECK` and shift-code
  reply handlers in `index.js` now call `hasT15AlertBeenSent()` before writing attendance.
  If no T-15 has been sent for the shift, the volunteer receives a message explaining they
  will be checked in automatically when the T-15 goes out.
- **Scheduler KM/KA pill check-in badge overlapping name** — the `.pill-badge-row` is now
  `position: absolute` inside KM and KA dropzones, floating as a small corner overlay
  instead of pushing the volunteer name out of view in the compact 44×34px slot.
  (`scheduler.css`)

---
## [2.18.0]
### Added
- **`public/js/timeUtils.js`** — new shared ES module centralising all time
  parse/format/input utilities. Exports: `EDT_OFFSET_HOURS` (single tz knob),
  `parseLocalTime`, `formatTimeDisplay`, `fmtTimeInput`, `localToUtc`,
  `utcToLocal`, `utcToEdtCard`, `utcToEdtDisplay`, `bindTimeInput`,
  `validateTimeInput`. Both `timelines.js` and `shiftAlerts.js` now import
  from this module; duplicate implementations removed from both files.
- **Department field on shift form** (`timelines.ejs`, `timelines.js`) — new
  required Department select (Lots & Garages / Signs / Security / Drop-off &
  Pickup / Mobile Support) in the Add/Edit Shift form. `department` is now
  included in the shift create/update payload. This fixes the scheduler
  "no scheduler data for this day" error caused by `getSchedulerData()`
  filtering `WHERE sh.department IS NOT NULL` — all UI-created shifts had
  `NULL` because the form never provided a value.
- **Inline time-input validation** — invalid time fields now highlight red
  (`is-invalid`) with a Bootstrap `invalid-feedback` message on blur, and
  submission is blocked until corrected. `invalid-feedback` divs added to
  all 9 time inputs across `timelines.ejs` and `shiftAlerts.ejs`.

### Changed
- `timelines.js`, `shiftAlerts.js` script tags changed to `type="module"`
  to support ES module imports from `timeUtils.js`.
- `shiftAlerts.js`: `lots_garages` department key corrected to
  `lots_and_garages` to match the scheduler and crew matrix.
- Save handlers across all four Timelines forms (day, copy-day, session,
  shift) now call `validateTimeInput()` instead of `parseTimeInput()`;
  error message updated to "Please correct the highlighted time fields."

---
## [2.17.0] = 2026-05-21
### Added
- Cookie consent banner (viewport-fixed, slide-up/down transition) with
  Accept All, Essential Only, and Manage Preferences options; choice
  persisted in localStorage
- `/privacy` — Privacy Policy page
- `/terms` — Terms of Service page (friendly, volunteer tone)
- Footer links to Privacy Policy and Terms of Service
- Cookie consent styles added to styles.css for global coverage

---

## [2.16.0] — 2026-05-19
### Added
- **Volunteer home page dashboard** — authenticated users now see a personalized
  dashboard instead of the generic landing page.
  - Full-page fixed parking background image with frosted-glass cards.
  - **Greeting pill** — frosted glass card showing a time-aware greeting
    (Good morning / afternoon / evening) and the next upcoming convention day
    in amber text.
  - **Live weather widget** (`public/js/dashboardWeather.js`) — fetches current
    conditions and a 3-day hi/lo forecast for Albany, NY from the Open-Meteo
    API (free, no API key, CORS-enabled). Displays current temp, feels-like,
    wind, and a compact 3-day forecast row with WMO weather-code icons. Sits
    inline with the greeting on desktop, stacks below on mobile.
  - **Your Shifts card** — shows the volunteer's slot assignments for the
    current (or next upcoming) convention day. Each shift shows the shift name,
    time range, location, department pill, and role badge (KM/KA). KM and KA
    contact rows appear below each shift with tap-to-call phone links.
  - **Day navigator** (`public/js/dashboardShifts.js`) — prev/next buttons in
    the Shifts card header let volunteers browse all convention days. Fetches
    via `GET /api/dashboard/shifts?dayId=N` without a page reload. Day label
    updates inline; buttons disable at the first/last day boundary.
  - **Oversight Structure card** — read-only indented tree showing the reporting
    oversight structureconfigured by admins. Phone numbers are tap-to-call links.
- **Oversight Structure admin page** — new page at `/oversight/tools/oversightstructure`
  (ADMIN only, `manageCampaigns` permission).
  - Visual tree editor: add root nodes, add children, edit role title and
    assigned volunteer inline, delete nodes (children promoted to parent level).
  - Up / Down buttons reorder within siblings; Indent (→) / Outdent (←)
    buttons change the parent relationship.
  - **Save order** bulk-saves all changes via `POST /oversight/tools/oversightstructure/save`.
  - New nodes get temporary negative IDs; a sequential add-then-save flow
    resolves real IDs before the bulk update.
  - New files: `views/authentication_and_accounts/oversightStructure.ejs`,
    `public/js/oversightStructure.js`, `public/styles/oversightStructure.css`.
- **New DB table:** `dbo.oversightstructure` (`id`, `volunteer_id`, `parent_id`,
  `role_title`, `sort_order`) — stores the oversight structure tree.
- **New `dbSync.js` functions:** `getVolunteerDashboardDay`, `getVolunteerShiftsForDay`,
  `getOversightStructure`, `addHierarchyNode`, `saveHierarchyOrder`, `deleteHierarchyNode`.
- **New API endpoints:**
  - `GET /api/dashboard/shifts?dayId=N` — volunteer's slot assignments for one day
  - `POST /oversight/tools/oversightstructure/save` — bulk save oversight structureorder
  - `POST /oversight/tools/oversightstructure/add` — add a single oversight structurenode
  - `DELETE /oversight/tools/oversightstructure/:id` — delete a node
- **Oversight Structure** added to Oversight Tools hub (Administration section)
  and the Oversight nav dropdown Administration collapse.
- **CSP** updated to allow `https://api.open-meteo.com` in `connect-src`.

### Changed
- **Landing page (logged-out):** Feature tiles are now clickable links.
  Logged-in users redirected to `/my-account`; logged-out users to `/login`.
  Lock badges hidden for logged-in users. Create Profile button hidden when
  already authenticated.
- **Home page route** moved to `index.js` (before the registration router)
  so it can inject dashboard data for authenticated users without touching
  `registrationRoutes.js`.
- **`getVolunteerShiftsForDay`** return now includes `dept_key` alongside
  `dept_name` so the client-side JS can apply department colour pills.

---

## [2.15.0] — 2026-05-19
### Added
- **Volunteer blackout windows** — oversight staff can now define unavailable
  time windows for individual volunteers on a convention day. Blackouts are
  managed via the **Manage Blackouts** option in the scheduler right-click
  context menu on any volunteer pill.
  - New DB table `dbo.volunteer_blackouts` (`volunteer_id`, `convention_day_id`,
    `start_mins`, `end_mins`, `reason`, `created_by`, `created_at`).
  - New `dbSync.js` functions: `getBlackoutsForDay`, `getBlackoutsForVolunteer`,
    `createBlackout`, `deleteBlackout`.
  - New API routes: `GET /api/scheduler/blackouts/:dayId`,
    `POST /api/scheduler/blackouts`, `DELETE /api/scheduler/blackouts/:id`.
  - Blackouts load into the conflict tracker on day change, blocking drops
    into overlapping shift slots.
- **Scheduling conflict modal** — dropping a volunteer into an overlapping
  shift now shows a Bootstrap modal describing the conflict (existing
  assignment or blackout window) with **Place Anyway** / **Return to Pool**
  options. Security department bypasses the modal but still badges silently.
- **Conflict badges on DZ pills** — pills placed with a known conflict display
  a `⚠` warning badge. Conflicts are also listed in the right-click context
  menu under the Remove from Slot action.
- **`getConflicts` + `untrackBlackout` + `getBlackouts`** added to
  `schedulerConflicts.js` to support the above.

### Changed
- **Scheduler name pills** — first names are now abbreviated to an initial on
  DZ slot pills (e.g. `J. Smith`). Volunteers with a suffix always show the
  suffix for disambiguation (`J. Smith Jr.`). Pool pills retain the full name.
- **Oversight nav dropdown** — categories are now collapsible with animated
  chevrons. Dark background styling improved with better contrast on item text
  and icons. Uses `data-bs-auto-close="outside"` so clicking a category
  toggle does not close the dropdown.
- **Oversight Tools page sidebar** — frosted-glass background, branded active
  state, and improved readability against the hero image.

### Fixed
- **Full UI consistency pass** across all oversight tool pages:
  - All pages now share a consistent card-on-image layout.
  - Back button standardised to `← Oversight Tools` with `fa-arrow-left`
    icon, placed in the card header top-right on every tool page.
  - Attendance Check-In and Attendance Report wrapped in outer card.
  - Invitation Tracker wrapped in outer card; stats calculation correctly
    ordered before header render.
  - Campaign Center `mc-main` given explicit `background: var(--bs-body-bg)`
    so the hero image no longer bleeds through between cards.
  - Timelines and Event Types card header converted to flex layout; bottom
    back button removed; `data-authed="true"` added to body tag.
  - Decently Export card header converted to flex layout; bottom back button
    removed.
  - Permission Matrix: `styles.css` added (was missing), duplicate
    `permissionMatrix.css` link removed, back button moved to card header,
    EJS syntax error (`deleteVolunteer` missing trailing comma) fixed.
  - Reports page back button label updated to `← Oversight Tools`.

---

## [2.14.0] — 2026-05-19
### Added
- **Edit Volunteer — RSVP override panel**: A new "Convention Invitations"
  accordion section on the Edit Volunteer page shows all current-year
  invitations for the selected volunteer. Each row has a four-button toggle
  (Yes / No / Maybe / Pending) that saves immediately via AJAX — does not
  go through the Finalize flow. Clicking the active button a second time
  clears the response back to Pending. Revoked invitations are shown
  read-only. Intended for recording verbal RSVPs given directly to oversight
  staff on convention day.
- **New DB function** `setInvitationResponseById(invitationId, response)` —
  updates `response`, `responded_at`, and `last_updated` directly by
  invitation ID. Passing `null` clears the response back to pending.
- **New route** `POST /edit-volunteer/set-rsvp` — requires `editVolunteerInfo`
  permission (OVERSEER+).

---
## [2.13.0] — 2026-05-15
### Added
- **Shift alert scheduler** — `lib/alertScheduler.js` fully wired into `index.js`.
  `startAlertScheduler` called on startup with Twilio credentials and year; `alertScheduler.stop()`
  hooked into `SIGINT`/`SIGTERM` shutdown handlers. Fixed `initTwilio` missing `()` call
  that was preventing Twilio from initializing.
- **Inbound SMS webhook** — extended `/api/sms/webhook` to handle volunteer replies beyond
  STOP/UNSTOP/HELP. Shift code replies (e.g. `FRIN`) confirm the volunteer's RSVP and,
  if the shift is today, mark them as attended. `CHECK` replies mark the volunteer attended
  on their nearest shift today without requiring a code.
- **New `dbSync.js` functions** for inbound SMS handling: `findVolunteerIdByPhone`,
  `getVolunteerShiftByCode`, `getVolunteerActiveShiftToday`, `confirmShiftRsvpBySms`.
- **Timelines — SMS code field** — `sms_code` is now visible and editable in the shift
  edit form. Displayed as a dark monospace badge on the shift card when set.
- **Timelines — Invitable checkbox in shift form** — the Invitable toggle is now a labeled
  checkbox inside the shift edit form, making it discoverable without relying on the
  icon-only card button. `invitable` added to `updateShift` in `dbSync.js` and the
  `PUT /oversight/tools/timelines/shifts/:id` route.

---

## [2.12.0] — 2026-05-15
### Changed
- **Renamed: Messaging Center → Campaign Center**: The tool formerly known as
  Messaging Center is now Campaign Center. Route prefix changed from
  `/oversight/tools/messaging` to `/oversight/tools/campaigns`. Files renamed:
  `campaignCenter.ejs`, `campaignCenter.js`, `campaignCenter.css`.
  Rationale: preserves the "Messaging" namespace for a planned future
  live two-way SMS tool.
- **Campaign Center — send flow**: Removed the initial "Send to N recipients?"
  `confirm()` dialog. The send button already displays the recipient count, making
  the extra prompt redundant. The double-send warning (for volunteers with an
  existing unanswered invite for the same event) is retained.
- **Campaign Center — reminder update prompt**: Replaced the post-send
  "Update campaign message?" `confirm()` dialog with an inline button rendered
  inside the results card. The send flow no longer blocks on a third sequential
  modal dialog after a successful reminder.
- **Campaign Center — original message preview**: Added a "View original message"
  toggle link to the batch preview line in Add to Existing mode. Expands inline
  to show the saved subject and body for the selected campaign without leaving
  the page. Collapses and resets automatically when a different campaign is selected.
- **Campaign Center — Add to Existing auto-select**: Pending volunteers are now
  only auto-selected when the page is opened from the Invitation Tracker reminder
  flow (`?batchId=`). Manually selecting a campaign in Add to Existing mode shows
  invitation-status badges on the volunteer list without auto-selecting anyone.
- **Campaign Center — campaign dropdown oversightstructure**: Both the "Add to Existing"
  and "Follow-up to" `<select>` elements now prefix child/follow-up campaigns
  with `↳`, matching the formatting already used in the Invitation Tracker
  campaign filter.
- **Invitation Tracker — pending stat card**: Added `cursor: default` to clarify
  the card is not clickable. Filtering to "pending" is intentionally disabled
  because it breaks the volunteer-deduplication logic that keeps stat card counts
  accurate when a volunteer appears in both a parent and a follow-up campaign row.

---

## [2.11.1] — 2026-05-15
### Fixed
- **Campaign Center — "Response needed" hidden on load**: `mcResponseNeededWrap`
  carried `d-none` in its initial class but `setCampaignMode("new")` was never
  called during init, so the checkbox never appeared in New Campaign mode unless
  the user clicked away to another mode and back.
- **Invitation Tracker — Edit Campaign button broken**: The button was rendered
  with `id="iteditcampaignbtn"` (all lowercase) in the EJS but the JS referenced
  `getElementById("itEditCampaignBtn")` (camelCase), making the entire
  edit-campaign flow silently non-functional.
- **Campaign Center — wrong send hint in Follow-up mode**: The `!hasName` branch
  in `updateSendButton()` fell through to the Add to Existing hint text
  ("Select an existing campaign") when in Follow-up mode. Now shows
  "Select a parent campaign" or "Enter a campaign name" depending on what
  is actually missing.
- **Campaign Center — orphaned JSDoc block**: Removed a stale JSDoc comment
  above `setCampaignMode()` left from before Follow-up mode was added; it
  described only the two-mode `'new' | 'add_to'` signature.

---

## [2.11.0] — 2026-05-13
### Added
- **Schedule Publish** — new Publish button on the schedule report page
  (`schedulerReport.ejs`, `schedulerReport.js`).
  - Generates a PDF of the current report via **Puppeteer** (headless Chrome)
    using an internal secret-protected render route
    (`GET /internal/pdf/report?dayId=N&secret=TOKEN`) that bypasses session
    auth so Puppeteer can load the page without a cookie.
  - Uploads the PDF to **SharePoint / OneDrive** via Microsoft Graph API
    (client-credentials flow, `Files.ReadWrite.All` application permission).
    Always overwrites the same filename so re-publishing keeps one canonical
    copy in the distribution folder.
  - Sends **email + SMS** notifications (via existing Twilio / IONOS
    infrastructure) to all OVERSEER+ volunteers and every volunteer
    scheduled for that day. Scheduled volunteers receive a personalised
    message listing their shift assignments; oversight-only recipients
    receive the link. Lists are merged and deduplicated so no one gets two
    messages.
  - Publish result (SharePoint URL, email count, SMS count) is recorded in
    the new `dbo.schedule_publishes` table.
  - Confirmation modal with spinner, success state (clickable SharePoint
    link + send counts), and error state.
  - Permission: `accessAdminConsole` (ASSISTANT_ADMIN+).
- **New files**:
  - `lib/graphClient.js` — Graph API token cache + OneDrive file upload
  - `lib/publishSchedule.js` — PDF generation, upload, notification, DB
    record orchestration; exports `PDF_SECRET` (startup random)
  - `scripts/azure-app-setup.ps1` — PowerShell script to create the Azure
    App Registration, add `Files.ReadWrite.All` permission, grant admin
    consent, and create a client secret
  - `scripts/append-env-secrets.ps1` — idempotent upsert of Graph secrets
    into the `.env` file
- **New DB table**: `dbo.schedule_publishes` (run migration manually).
- **New DB functions** (`dbSync.js`):
  - `getPublishNotificationData(dayId)` — merged OVERSEER+ + scheduled
    volunteer list with shift assignments for notification personalisation
  - `recordSchedulePublish(data)` — inserts publish audit record
- **New routes** (`oversightRoutes.js`):
  - `GET  /internal/pdf/report` — secret-protected Puppeteer render
  - `POST /oversight/tools/scheduler/publish` — full publish pipeline
- **Config**: `serverPort` and `graphConfig` added to `oversightRouter`
  factory; `index.js` passes `PORT` and Graph secrets from Key Vault.
### Changed
- `package.json` engines lowered from `>=24.0.0` to `>=22.0.0` to match
  the current LTS version in use.
- `.dockerignore` now excludes `scripts/` folder.

---

## [2.10.1] — 2026-05-13
### Fixed
- **Schedule report — blank first print page** (`schedulerReport.css`): the
  `page-break-before` rule used `.report-dept:not(:first-child)`, which
  matched every department because `.report-page-header` is the actual
  first child of `.report-container`. Changed to the adjacent-sibling
  selector `.report-dept + .report-dept` so only the second and later
  departments get a forced page break.
- **Schedule report — print / save PDF button** (`schedulerReport.js`): the
  `onclick` and `onchange` inline handlers on the print button and day
  picker were blocked by CSP. Moved both to `schedulerReport.js` with
  `id="report-print-btn"` and `id="report-day-picker"`.
- **Schedule report — phone numbers**: KM and KA rows now display the
  volunteer’s phone number right-aligned on the same line
  (`schedulerReport.ejs`, `schedulerReport.css`, `dbSync.js`).
- **Scheduler time bands**: all bands showing as one colour because
  gap-detection found no gaps between back-to-back sessions. Now uses
  session label keywords (Pre / Morning / Lunch / Afternoon / Post) for
  colour classification; gap-detection kept as fallback
  (`schedulerDomActions.js`).
- **Scheduler time-band dividers**: midpoint dividers now placed at the
  boundary between contiguous same-class sessions (Morning A→B,
  Afternoon A→B) instead of splitting each session at its midpoint.
- **Context menu contact rows** (`schedulerContextMenu.js`): phone taps
  open the dialer; email taps open the mail client. Contact section only
  renders when the volunteer has at least one of the two.

---

## [2.10.0] — 2026-05-13
### Added
- **Right-click context menu** on all volunteer name pills in the scheduler.
  Context-sensitive: pills in a DZ show **Remove from Slot** at the top;
  both pool and DZ pills show:
  - **View / Edit Volunteer** — opens the oversight profile in a new tab.
  - **Today's Assignments (N)** — floating panel listing every shift the
    volunteer is currently placed in, grouped by department with times.
  - **Highlight on Grid** — pulses a gold outline on all shift blocks the
    volunteer occupies (4 flashes).
  - **Copy Name** — copies the display name to the clipboard.
  - **Manage Blackouts** / **Message Volunteer** — greyed stubs with a
    "soon" badge; architecture ready for both.
- **Pool pills stay in pool permanently.** Dropping a pill into a slot now
  places a lightweight DOM clone in the DZ; the original pool pill remains
  visible and draggable. The same volunteer can be assigned to any number
  of non-overlapping shifts without disappearing from the pool.
- **Time-conflict guard** (`schedulerConflicts.js`) — prevents assigning
  a volunteer to two overlapping shifts. Security department is exempt
  (overlapping coverage shifts by design). The conflict map is also the
  planned extension point for individual blackout windows.
- **Pool pill assignment badge** — an amber **N×** badge appears on a
  pool pill when that volunteer holds N active assignments; disappears
  when all slots are vacated.
- **Drag animation fix** — removing the physical pill-move on drop
  eliminates the visual snap/jump that was visible especially in the
  wide Lots & Garages grid.

### New files
- `public/js/schedulerConflicts.js`
- `public/js/schedulerContextMenu.js`

---

## [2.9.0] — 2026-05-13
### Added
- **Schedule Report** — new printable/downloadable report page at
  `/oversight/tools/scheduler/report?dayId=N`. Accessible via a **Report**
  button in the scheduler day banner (opens in a new tab).
  - One section per department (Lots & Garages, Signs, Security,
    Drop-off/Pickup, Mobile Support), each starting a new print page.
  - Shifts displayed as sub-sections with time range; each location rendered
    as a column card showing KM (blue), KA (teal), and regular volunteers.
  - Day picker in the toolbar lets the user switch days without leaving the
    report. **Print / Save PDF** button opens the browser print dialog.
  - Faithful to the crew-schedule format used in prior-year workbooks.
- **Scheduler: time-band label classification** — session bands are now
  coloured by label keyword ("Pre", "Morning", "Lunch", "Afternoon",
  "Post") rather than gap-detection. Falls back to gap-detection for
  sessions whose labels don’t match any keyword.
- **Scheduler: midpoint dividers** — a dashed line appears between
  contiguous same-class sessions (Morning A → Morning B,
  Afternoon A → Afternoon B) marking the song-and-announcements break.
- **Scheduler: KM/KA role badges** — pills dropped into KM or KA slots
  display a small inline badge (pure CSS `::after`).

### New files
- `public/styles/schedulerReport.css`
- `views/authentication_and_accounts/schedulerReport.ejs`

---

## [2.8.0] — 2026-05-13
### Added
- **Scheduler: live slot persistence** — every drag-drop saves immediately to
  the new `shift_slot_assignments` table. Dropping a pill back to the pool
  deletes the record. Assignments reload automatically when a day is selected,
  pre-populating the grid with any previously saved work.
- **Scheduler: undo / redo** — Undo and Redo buttons appear in the day banner
  (with FontAwesome rotate icons). Ctrl+Z undoes the last assignment or
  unassignment; Ctrl+Y / Ctrl+Shift+Z redoes it. Each undo/redo mirrors the
  DB operation (DELETE or re-INSERT) so the database always reflects the
  current visual state. History clears automatically on day change.
- **Scheduler: occupied-slot guard** — a dropzone that already contains a pill
  now rejects further drops, preventing double-assignments to the same slot.
- **New DB table:** `dbo.shift_slot_assignments` — stores one row per
  volunteer-slot pairing with `schedule_assignment_id`, `convention_day_id`,
  `volunteer_id`, `slot_type` (keyman / keyman_asst / volunteer), and
  `slot_index`. Unique constraint on `(schedule_assignment_id, slot_type,
  slot_index)`. Cascades on `schedule_assignments` delete.
- **New API endpoints:**
  - `GET  /api/scheduler/slots/:dayId` — all saved assignments for a day
  - `POST /api/scheduler/slots` — persist a new slot assignment
  - `DELETE /api/scheduler/slots/:id` — remove a slot assignment
- **New frontend module:** `schedulerHistory.js` — undo/redo command stack,
  API save/delete helpers, and `silentlyPlacePill` for initial grid population.

---

## [2.7.0] — 2026-05-13
### Added
- **Scheduler: multi-location sub-columns** — departments with multiple
  locations (Lots & Garages, Security, Dropoff/Pickup) now render one
  sub-column per location within the department. A spanning dept-name
  header sits above individual location sub-headers. Single-location
  departments (Signs, Mobile Support) are unaffected.
- **Scheduler: department visibility toggles** — the day banner now
  contains a labeled row of colored pill buttons (one per department).
  Click a pill to collapse that department's columns to zero width;
  click again to restore. Hidden departments show a ⦸ indicator so they
  remain discoverable and clickable.
- **Scheduler: column reorder by drag** — drag any department toggle pill
  onto another to swap their column order. Uses pointer events (not the
  HTML5 drag API) to avoid conflicts with agnostic-draggable.
- **Timelines: Min / Target / Max assignment fields** — the schedule
  assignment form now has three numeric inputs (Min, Target, Max) instead
  of a single "Volunteers Needed" field. All three are stored on
  `schedule_assignments.vol_min`, `volunteer_need` (vol_ideal), and
  `vol_max`. Assignment badges in the shift card display as
  `(min / target / max)`.

### Fixed
- Scheduler dropzones no longer resize when a name pill is dropped or
  removed — dropzones now have a fixed 34px height.
- Dropped name pills wrap text over two lines and hide crew badges
  (badges are useful in the pool but noise once assigned).
- Department toggle `is-hidden` class renamed to `dept-hidden` to avoid
  conflict with the global `styles.css` rule `.is-hidden { display: none
  !important }` that was silently nuking the toggle buttons.

---

## [2.6.0] — 2026-05-12
### Added
- **Drag-and-drop Scheduler** — new page at `/oversight/tools/scheduler`
  (OVERSEER+ via `createAssignments` permission). Sidebar shows a live
  volunteer pool filtered by rank and/or department. Selecting a convention
  day loads a time-based calendar grid (15-minute row resolution) organised
  by department columns. Name pills drag from the pool into shift slot
  dropzones; dropping back onto the pool returns them.
- **Drop guards** — role check (keyman/keyman-asst slots enforce minimum
  role level) and department check (volunteers only accepted into departments
  their crew flags permit).
- `agnostic-draggable` UMD bundle added to `public/vendor/` as the drag
  library underpinning the scheduler.
- **New DB columns:** `shifts.department NVARCHAR(50)` (department key for
  grid grouping) and `schedule_assignments.vol_min / vol_max INT` (flanking
  the existing `volunteer_need` as vol_ideal).
- **New API endpoints:**
  - `GET /api/scheduler/volunteers` — active registered volunteer pool
  - `GET /api/scheduler/:dayId` — full shift/dept/location payload shaped
    for the frontend grid builder
- **New frontend modules:** `scheduler.js`, `schedulerDomActions.js`,
  `schedulerDomEvents.js`, `schedulerDraggable.js`, `schedulerTimeUtils.js`,
  `departments.js`, `scheduler.css`
- Scheduler card added to the Oversight Tools hub under Scheduling.

---

## [2.5.3] — 2026-05-11
### Added
- External service watchdog — periodic background checks verify Twilio (every 5 min)
  and SMTP (every 10 min) connectivity. Resets cached clients on failure so the next
  real request triggers a clean re-initialization rather than reusing a broken client.
  Both intervals use `.unref()` to avoid blocking graceful shutdown.
- `resetSmsClient()` exported from `lib/messaging.js` so the watchdog can null the
  cached Twilio SMS client independently of the main `index.js` client.

### Fixed
- `initTwilio()` now throws a descriptive error when `TWILIO_ACCOUNT_SID` or
  `TWILIO_AUTH_TOKEN` are missing, instead of passing `undefined` to the Twilio SDK
  and receiving a cryptic "username is required" failure.
- Root cause of phone verification outage identified — stale container had cached
  empty credentials from before Key Vault secrets were accessible. Restart resolved;
  watchdog prevents silent recurrence.

---

## [2.5.2] — 2026-05-06
### Fixed
- Follow-up campaigns now automatically inherit the parent batch's `convention_day_id`,
  `session_id`, and `shift_id` when no event is selected in the Messaging Center.
  Previously, follow-up invitation rows were stored with NULL event context, causing
  them to be excluded from attendance check-in.
- Retroactive DB patch applied to batch 3 ("Meeting date omission") to inherit
  `convention_day_id = 15` from parent batch 2 ("Training · May 23").
- Attendance check-in deduplication — volunteers invited via multiple campaigns
  to the same shift no longer appear as duplicate rows. `ROW_NUMBER()` CTE picks
  the most relevant invitation (responded first, then most recent) per volunteer.

---

## [2.5.1] — 2026-05-06
### Added
- RSVP history accordion panel on My Account — shows current-year invitations
  with convention day, shift, last date sent, RSVP response, and responded-on date.
  Panel is hidden when no invitations exist. All formatting done server-side.

### Changed
- `package.json` description updated to reflect actual app purpose.

### Removed
- `kickbox`, `jq`, `build`, `docker`, `netstat`, `bind` npm packages — all were
  unused ghost dependencies responsible for the majority of audit vulnerabilities.
- `types/kickbox.d.ts` — no longer needed.

### Fixed
- `npm audit` reduced from 33 vulnerabilities to 2 low-severity (residual `csurf`
  dependency, no fix available without a major refactor).

---

## [2.5.0] — 2026-04
> Details not fully captured. Known to include home page / landing page changes
> and additional feature work. Jake bumped from 2.4.1.

---

## [2.4.1] — 2026-04
### Fixed
- Invitation Tracker 500 error — `canManageCampaigns` missing from route render
  object and incorrect casing in `invitationTracker.ejs`.
- Decently export incorrect filter — removed erroneous `AND accountType = 'registered'`
  from `getDecentlyExportRows()` in `dbSync.js`.

---

## [2.4.0] — 2026-04
> Minor bump applied by Jake to bundle home page integration with prior fixes.
> Superseded the planned 2.2.1 patch release.

---

## [2.2.0] — 2026-04-20
### Added
- **Messaging campaigns** — parent-child batch linking via `parent_batch_id`,
  `response_needed` flag, Follow-up mode in Messaging Center.
- **Invitation Tracker** — admin campaign edit modal, stat cards and Remind button
  recompute live from filtered rows.
- **Permission system** — `manageCampaigns` (ADMIN), `createCampaign` (OVERSEER+),
  `deleteVolunteer` (ASSISTANT_ADMIN+) added to `roles.js`. Grouped Permission
  Matrix UI with human-readable labels.
- **Volunteer soft-delete / reinstatement** — `registration_status = 'deleted'`,
  `deleted_status`, `deleted_at`/`deleted_by` audit columns. Confirmation modal
  and active/inactive/deleted filter controls in volunteer oversight.
- **App versioning** — version injected into all views via `res.locals.appVersion`
  using `createRequire`; displayed in footer.

### Fixed
- Draft promotion bug — `promoteIfComplete()` now called after finalize saves.
- Reports page CSP violation — inline `window.REPORT_DATA` script converted to
  `type="application/json"` data block.

### Changed
- Footer restyled — navy background matching navbar.
- My Account dropdown moved to right-aligned `navbar-nav ms-auto`.

---

## [2.1.0] — 2026-04-16
### Added
- **Messaging Center** — bulk invitation campaigns, batch name auto-suggest,
  template builder with merge fields, double-send warning, results log.
- **Invitation Tracker** — filter by campaign/day/response, inline revoke/reinstate,
  stat cards including revoked count.
- **RSVP page** — event context block (date, time, shift type, location), revoked
  state screen, SMS opt-in consent.
- **Invitable shifts** — per-shift toggle in Timelines (yellow button + badge).
- **Twilio SMS webhook** — handles STOP/UNSTOP/HELP, logs to `sms_opt_out_log`,
  updates volunteer opt-out flags on `volunteer_in`.
- **SMS opt-in** — stamped on RSVP response submission.

---

## [Pre-2.1.0] — 2026-03 to 2026-04
> Versioning was not yet in place. The following work was completed before the
> versioning system was introduced.

### Infrastructure
- Azure SQL connection pool stale-reference fix — `_pool` nulled in error handler,
  keep-alive ping every 3 minutes (self-cancels on pool supersession or failure).
- Docker image migrated to `node:24-bookworm-slim`; CI runner updated to Node 24.
- Azure Key Vault secret loading parallelized — cold start time reduced.
- SSH host key generation switched from RSA 4096 to ed25519.

### Features
- **RBAC system** — role hierarchy, permission matrix (`roles.js`), `requirePermission()`
  middleware, `canAssignRole()` enforcement.
- **Assignment & Role section** — OVERSEER+ can set volunteer role and crew
  assignments (Lots & Garages, Signs, Security, Mobile Support, Dropoff & Pickup).
- **Oversight Tools hub** — rebranded from Admin Tools, grouped by section.
- **Decently Export/Import** — CSV export with export tracking, import with
  active-status sync.
- **Send Links page** — draft/registered tabs, per-channel 24hr cooldown.
- **Create Volunteer** — admin tool with duplicate detection, congregation picker.
- **Locations page** — location management at `/oversight/tools/locationsAndTasks`.
- **Timelines** — convention days, sessions, shifts, schedule assignments, copy day.
- **Attendance** — check-in tool and report page (DB, routes, views, JS all complete).
- **Session keepalive** — `sessionKeepAlive.js` pings `/api/session/touch` on a
  rolling timer for authenticated users.
- **Registration flow** — full draft-based lifecycle, continue-registration,
  account upgrade, `bfcache` guard.
