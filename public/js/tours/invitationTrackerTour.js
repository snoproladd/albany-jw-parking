/**
 * @fileoverview invitationTrackerTour.js
 * Shepherd.js tour for the Invitation Tracker (/oversight/tools/campaigns/tracker).
 * Walks through stat cards, filters, the table, and row-level actions.
 *
 * @module invitationTrackerTour
 */

import {
  createTour,
  navButtons,
  startButtons,
  finishButtons,
  registerTour,
} from "./tourBase.js";

/**
 * Builds and returns the Invitation Tracker tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildInvitationTrackerTour() {
  const tour = createTour();

  const hasRows = !!document.querySelector(".it-row");
  const hasRevoke = !!document.querySelector(".it-revoke-btn");
  const hasReinstate = !!document.querySelector(".it-reinstate-btn");
  const hasAddBtn =
    !!document.getElementById("itAddVolunteersBtn") &&
    !document
      .getElementById("itAddVolunteersWrap")
      ?.classList.contains("d-none");

  const steps = [];

  steps.push({
    id: "it-campaign-filter",
    title: "Campaign filter",
    text: "Narrow to a specific campaign. Follow-up campaigns (↳) are merged into their parent — selecting either shows the combined family view with each volunteer shown once using their most definitive response. The group note below confirms how many child sends are included.",
    attachTo: { element: "#itBatchFilter", on: "bottom" },
    buttons: null,
  });

  steps.push({
    id: "it-stats",
    title: "Summary stats",
    text: "These cards give you an instant snapshot: total sent, Yes / No / Maybe responses, Pending (no reply yet), and Revoked. The counts update live as you apply filters below.",
    attachTo: { element: ".it-stat-card", on: "bottom" },
    buttons: null,
  });

  steps.push({
    id: "it-campaign-filter",
    title: "Campaign filter",
    text: "Narrow to a specific campaign send. Follow-up campaigns are indented with an arrow (↳) to show their parent. Selecting a campaign here also enables the <strong>Add volunteers</strong> shortcut.",
    attachTo: { element: "#itBatchFilter", on: "bottom" },
    buttons: null,
  });

  steps.push({
    id: "it-day-filter",
    title: "Convention day filter",
    text: "Filter by the convention day linked to the campaign — useful when you've sent invitations for multiple days and want to see responses for one at a time.",
    attachTo: { element: "#itDayFilter", on: "bottom" },
    buttons: null,
  });

  steps.push({
    id: "it-response-filter",
    title: "Response filter",
    text: "Show only a specific response status. <strong>Pending</strong> is the most useful filter during the convention build-up — it shows everyone who hasn't replied yet so you can decide who to follow up with.",
    attachTo: { element: "#itResponseFilter", on: "bottom" },
    buttons: null,
  });

  steps.push({
    id: "it-search",
    title: "Name search",
    text: "Type any part of a volunteer's last or first name to filter the table instantly. Works alongside all other filters.",
    attachTo: { element: "#itSearch", on: "bottom" },
    buttons: null,
  });

  if (hasRows) {
    steps.push({
      id: "it-table",
      title: "Invitation table",
      text: "Each row shows the volunteer, which campaign they were sent, the linked event and shift, delivery channel (email/SMS), send date, reminder history, and their response. Rows are filterable but not paginated — all records load at once.",
      attachTo: { element: "#itTable", on: "top" },
      buttons: null,
    });
  }

  if (hasRevoke) {
    steps.push({
      id: "it-revoke",
      title: "Revoking an invitation",
      text: "The <strong>ban icon</strong> revokes an invitation — the volunteer's RSVP link is deactivated and the row is marked revoked. This is useful when someone is removed from a shift after already being invited.",
      attachTo: { element: ".it-revoke-btn", on: "left" },
      buttons: null,
    });
  }

  if (hasReinstate) {
    steps.push({
      id: "it-reinstate",
      title: "Reinstating an invitation",
      text: "The <strong>rotate-left icon</strong> reinstates a revoked invitation, reactivating the RSVP link. Show revoked rows by checking <strong>Show revoked</strong> in the filter bar.",
      attachTo: { element: ".it-reinstate-btn", on: "left" },
      buttons: null,
    });
  }

  const hasRemindBtn =
    !!document.getElementById("itRemindBtn") &&
    !document.getElementById("itRemindBtn")?.closest(".d-none");
  const hasEditBtn = !!document.getElementById("itEditCampaignBtn");

  if (hasRemindBtn) {
    steps.push({
      id: "it-remind",
      title: "Remind pending volunteers",
      text: "When a campaign with <strong>Response needed</strong> is selected, this amber button opens Campaign Center with all pending volunteers pre-selected — ready to send a follow-up. Pending count is calculated across the whole campaign family.",
      attachTo: { element: "#itRemindBtn", on: "left" },
      buttons: null,
    });
  }

  if (hasEditBtn) {
    steps.push({
      id: "it-edit-campaign",
      title: "Edit campaign",
      text: "The pencil icon opens a modal to rename the campaign, edit its saved message, change its parent link, toggle <strong>Response needed</strong>, or deactivate it. Admin only.",
      attachTo: { element: "#itEditCampaignBtn", on: "left" },
      buttons: null,
    });
  }

  if (hasAddBtn) {
    steps.push({
      id: "it-add-volunteers",
      title: "Add more volunteers",
      text: "With a campaign selected, this button takes you directly to Campaign Center with that campaign pre-selected in <strong>Add to Existing</strong> mode — so you can send to additional volunteers without re-composing the message.",
      attachTo: { element: "#itAddVolunteersBtn", on: "top" },
      buttons: null,
    });
  }

  steps.forEach((step, i) => {
    const isFirst = i === 0;
    const isLast = i === steps.length - 1;
    step.buttons = isFirst
      ? startButtons(tour)
      : isLast
        ? finishButtons(tour)
        : navButtons(tour);
    tour.addStep(step);
  });

  return tour;
}

/**
 * Attaches the tour to #tourTriggerBtn on the Invitation Tracker page.
 *
 * @returns {void}
 */
export function initInvitationTrackerTour() {
  const btn = document.getElementById("tourTriggerBtn");
  if (!btn) return;
  btn.addEventListener("click", () => buildInvitationTrackerTour().start());
  registerTour("invitationTracker", buildInvitationTrackerTour);
}

initInvitationTrackerTour();
