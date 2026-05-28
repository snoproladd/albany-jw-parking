/**
 * @fileoverview rolesTour.js
 * Shepherd.js mini-tour for the Role Management page (/oversight/roles).
 *
 * Covers: the volunteer table, searching, changing a role, saving,
 * and the unapproved volunteers section (added as a step only when present).
 *
 * Auto-initializes on module load. Attach to the page via:
 *   <script src="https://cdn.jsdelivr.net/npm/shepherd.js@15.2.2/dist/shepherd.min.js"></script>
 *   <script type="module" src="/js/tours/rolesTour.js"></script>
 *
 * @module rolesTour
 */

import {
  createTour,
  navButtons,
  startButtons,
  finishButtons,
} from "./tourBase.js";

/**
 * Builds the Role Management tour.
 * Conditionally adds the unapproved volunteers step if that section is present.
 *
 * @returns {Shepherd.Tour}
 */
function buildRolesTour() {
  const tour = createTour();

  tour.addStep({
    id: "welcome",
    title: "Role Management",
    text: "This page lets you change the role any volunteer has in the app — which controls what they can see and do. You can only assign roles <em>below</em> your own level.",
    buttons: startButtons(tour),
  });

  tour.addStep({
    id: "search",
    title: "Search the list",
    text: "Type a name or email address here to filter the table instantly. Useful when you have a large volunteer list and need to find someone quickly.",
    attachTo: { element: "#roleSearch", on: "bottom" },
    buttons: navButtons(tour),
  });

  tour.addStep({
    id: "table",
    title: "The volunteer table",
    text: "Each row shows a volunteer's name, email, and their <strong>Current Role</strong> — color-coded by level. Roles in order from lowest to highest are: Registered, Keyman, Desk, Overseer, Assistant Admin, and Admin.",
    attachTo: { element: "#rolesTable", on: "top" },
    buttons: navButtons(tour),
  });

  tour.addStep({
    id: "change-role",
    title: "Changing a role",
    text: "For volunteers below your own role level, a <strong>Change To</strong> dropdown appears. Select the new role from the dropdown, then click <strong>Save</strong> on that same row. The page will confirm the change.",
    attachTo: { element: "#rolesTable", on: "top" },
    buttons: navButtons(tour),
  });

  // Only add the unapproved step if that section is present on the page
  const hasUnapproved = !!document.getElementById("unapprovedToggle");

  if (hasUnapproved) {
    tour.addStep({
      id: "unapproved",
      title: "Unapproved volunteers",
      text: "This section lists volunteers who haven't finished their registration. You can grant them <strong>DESK</strong> access here, which also marks their registration complete and lets them log in. Use this for team members who need app access right away.",
      attachTo: { element: "#unapprovedToggle", on: "top" },
      buttons: finishButtons(tour),
    });
  } else {
    // Re-target last navButtons step to finishButtons
    const steps = tour.steps;
    const last = steps[steps.length - 1];
    last.updateStepOptions({ buttons: finishButtons(tour) });
  }

  return tour;
}

/**
 * Attaches the tour trigger to #tourTriggerBtn on the Role Management page.
 *
 * @returns {void}
 */
export function initRolesTour() {
  const btn = document.getElementById("tourTriggerBtn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    buildRolesTour().start();
  });
}

initRolesTour();
