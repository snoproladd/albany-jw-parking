# CSS Architecture

This document describes the CSS layout strategy for Albany JW Parking.
It exists to prevent regressions in scroll behavior, sticky positioning,
and responsive layout — the areas most likely to break silently.

Read this before editing `styles.css` or any page-specific stylesheet.

---

## 1. File Structure

All CSS lives in `public/styles/`. Every file is loaded via `<link>` tags
in the relevant EJS template — there are no inline styles anywhere.

| File | Purpose |
|---|---|
| `styles.css` | Global layout, scroll ownership, entry-card system, nav, shared components |
| `index.css` | Dashboard / home page |
| `signs.css` | Sign Map (fixed-position map, info sheet, context menu, geofencing FAB, marker overlays) |
| `signsPrint.css` | Print-optimized sign map with WYSIWYG preview and `@media print` rules |
| `scheduler.css` | Drag-and-drop scheduling grid |
| `schedulerReport.css` | Published schedule report layout |
| `conflictGrid.css` | Master Conflict Grid page |
| `crewMatrix.css` | Crew Assignments matrix |
| `campaignCenter.css` | Campaign Center and invitation management |
| `invitationTracker.css` | Invitation Tracker table and filters |
| `attendance.css` | Check-in tool and attendance report |
| `shiftAlerts.css` | Shift Alerts management page |
| `reports.css` | Application Status report |
| `maps.css` | OneDrive-backed maps page |
| `permissionMatrix.css` | Permission Matrix toggle grid |
| `oversightStructure.css` | Oversight Structure configuration |
| `volunteerAccountOversight.css` | Edit Volunteer page |
| `createProfileLaunch.css` | Create Profile landing page |
| `bugReport.css` | Bug report modal |
| `sitemap.css` | Sitemap page |

Page-specific files are self-contained. They do not interact with the
scroll ownership model in `styles.css` unless the page uses `.entry-card`.

---

## 2. CSS Variables

Global design tokens are defined in `:root` inside `styles.css`:

| Variable | Value | Usage |
|---|---|---|
| `--Primary` | `#1e3a8a` | Headers, primary buttons, nav accents |
| `--Secondary` | `#2563eb` | Links, secondary buttons |
| `--Accent` | `#f59e0b` | Warnings, highlights, CTAs |
| `--Background` | `#f9fafb` | Page and card backgrounds |
| `--TextDark` | `#111827` | Body text |
| `--TextLight` | `#ffffff` | Text on dark backgrounds |
| `--fs-h1` through `--fs-body` | `clamp()` values | Fluid typography |

---

## 3. Scroll Ownership Model

This is the most important concept in the stylesheet. Getting it wrong
causes double scrollbars, unreachable content, or broken sticky headers.

There must be **exactly one** scroll container active at any viewport width.

```
┌─────────────────────────────────────────────────────────────┐
│ ≤ 576px  (Mobile phones)                                    │
│                                                             │
│  Scroll owner:  PAGE (body / html)                          │
│                                                             │
│  body           → scrolls                                   │
│  .entry-card    → overflow: visible                         │
│  .card-body     → overflow: visible                         │
│  .card-header   → position: static                          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ ≥ 577px  (Tablets + Desktop)                                │
│                                                             │
│  Scroll owner:  .entry-card                                 │
│                                                             │
│  body           → overflow: hidden                          │
│  .entry-card    → overflow-y: auto  (ONLY scroll container) │
│  .card-body     → overflow: visible                         │
│  .card-header   → position: sticky (relative to card)       │
└─────────────────────────────────────────────────────────────┘
```

A secondary height breakpoint at `min-height: 700px` caps card height
and locks page scroll on tall viewports. Width determines *who* scrolls;
height refines *how tall* the card may be.

- Never allow `body` and a card to scroll at the same time
- Sticky elements must live inside their scroll container
- Mobile = page scroll, Desktop = card scroll

If content becomes unreachable, check scroll ownership first.

---

## 4. Responsive Strategy

### Width breakpoints (primary)

| Breakpoint | Target | Behavior |
|---|---|---|
| ≤ 576px | Mobile phones | Page scroll, no sticky card headers |
| ≤ 767.98px | Phones + small tablets | Smaller buttons, tighter controls; admin roles table collapses to card-per-row |
| ≥ 577px | Tablets & desktop | Card-contained scrolling |

### Height breakpoint (secondary)

| Breakpoint | Purpose |
|---|---|
| min-height: 700px | Caps card height and locks page scroll (does not change who scrolls) |

**Width determines who scrolls. Height refines how tall the card may be.**

---

## 5. Why Media Queries Are "Scattered"

Responsive rules are intentionally distributed instead of fully consolidated.

Some overrides must appear **after** component definitions. Reordering media
queries can silently reintroduce double scroll containers, sticky header
overlap, or unreachable content on mobile.

If you feel the urge to "clean this up":

- ✅ Add comments
- ❌ Do not move media queries casually

---

## 6. Page-Specific CSS Files

Each page or feature area has its own CSS file in `public/styles/`,
loaded alongside `styles.css`. These files are self-contained for their
page's layout and do not interact with the scroll ownership model in
`styles.css` unless the page uses `.entry-card`.

Pages with their own scroll/layout models (e.g. `signs.css` with its
fixed-position map, info sheet, context menu, geofencing FAB/proximity bar,
arrow direction pulse, and stacked marker overlays; `scheduler.css` with its
grid) define those independently. `signsPrint.css` handles the print-optimised
sign map with WYSIWYG page preview and `@media print` rules.

See the file tree in `README.md` for the full list.

---

## 7. Safe vs Unsafe Changes

### ✅ Safe

- Adjust colors, fonts, spacing
- Add new components following existing patterns
- Add new breakpoints below existing ones
- Add comments and documentation
- Add new page-specific CSS files

### ❌ Unsafe (requires full regression testing)

- Reordering media queries in `styles.css`
- Changing `overflow` rules on `body`, `.entry-card`, or `.card-body`
- Making headers sticky outside the card scroll container
- Merging width and height media queries

---

## 8. When Something Breaks

Checklist:

1. Is there more than one scroll container active?
2. Is a sticky element outside its scroll container?
3. Did a media query override apply at the wrong width/height?
4. Does the behavior still match the scroll diagram above?

Fix architecture first — not symptoms.

---

## 9. Final Note

This stylesheet is intentionally boring, explicit, and defensive.
That is a feature.

When in doubt: preserve behavior, document intent, and test breakpoints
deliberately.