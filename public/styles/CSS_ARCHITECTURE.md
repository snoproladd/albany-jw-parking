CSS Architecture — Albany JW Parking
File: styles.css
Status: Stable, production‑tested
Last major refactor: Responsive scroll model + breakpoint cleanup

1. Design Goals
This stylesheet prioritizes:

Predictable scrolling behavior across mobile, tablet, and desktop
Single scroll container at any time
Sticky headers and sticky action bars that never trap content
Minimal responsive overrides, applied intentionally and documented

Visual organization is secondary to correct cascade order.

2. High‑Level File Structure
The file is organized logically using comment headers.
Not all sections are physically grouped — order is intentional.
BASE / GLOBAL
  Fonts, variables, body, typography, utilities

CARD SYSTEMS
  Entry cards (forms, login, registration)
  Summary cards

COMPONENTS
  Accordion, buttons, validation, inputs

NAVIGATION
  Frosted glass navbar, nav buttons, avatar

FLOWS & MODALS
  Upgrade flow, summary confirmation modals

RESPONSIVE RULES
  Width- and height-based media queries
  (distributed to preserve cascade order)

PRINT
  Print-only overrides

ADMIN CONSOLE
  #rolesTable — scoped table styles
  Tighter row padding at ≥ 768px
  Block/card layout at < 768px (no scroll ownership impact)

⚠️ Do not reorder sections without re-testing breakpoints.

3. Scroll Ownership Model (Critical)
At any given viewport, there must be exactly ONE scroll container.
Mobile — ≤ 576px
Scroll owner: PAGE (body / html)

body           → scrolls
.entry-card    → overflow: visible
.card-body     → overflow: visible
.card-header   → position: static

Tablet & Desktop — ≥ 577px
Scroll owner: .entry-card

body           → overflow: hidden
.entry-card    → overflow-y: auto   (ONLY scroll container)
.card-body     → overflow: visible
.card-header   → position: sticky (relative to card)

Rules that must never be violated:

Never allow body and a card to scroll at the same time
Sticky elements must live inside their scroll container
Mobile = page scroll, Desktop = card scroll

If content becomes unreachable, check scroll ownership first.

4. Responsive Strategy
Width breakpoints (primary)

≤ 576px → Mobile phones
Page scroll, no sticky card headers
≤ 767.98px → Phones + small tablets
Smaller buttons / tighter controls
Admin roles table collapses to card-per-row layout
≥ 577px → Tablets & desktop
Card-contained scrolling

Height breakpoint (secondary)

min-height: 700px
Used only to cap card height and lock page scroll
(does not change who scrolls)

Width determines who scrolls.
Height refines how tall the card may be.

5. Why Media Queries Are “Scattered”
Responsive rules are intentionally distributed instead of fully consolidated.
Reason:

Some overrides must appear after component definitions
Reordering media queries can silently reintroduce:

double scroll containers
sticky header overlap
unreachable content on mobile



If you feel the urge to “clean this up”:

✅ Add comments
❌ Do not move media queries casually


6. Safe vs Unsafe Changes
✅ Safe

Adjust colors, fonts, spacing
Add new components following existing patterns
Add new breakpoints below existing ones
Add comments and documentation

❌ Unsafe (requires full regression testing)

Reordering media queries
Changing overflow rules on body, .entry-card, or .card-body
Making headers sticky outside the card scroll container
Merging width and height media queries


7. When Something Breaks
Use this checklist:

Is there more than one scroll container active?
Is a sticky element outside its scroll container?
Did a media query override apply at the wrong width/height?
Does the behavior still match the scroll diagram above?

Fix architecture first — not symptoms.

8. Final Note
This stylesheet is intentionally boring, explicit, and defensive.
That is a feature.
When in doubt:

Preserve behavior, document intent, and test breakpoints deliberately.