/**
 * @fileoverview invitationTrackerTour.js
 * Shepherd.js tour for the Invitation Tracker (/oversight/tools/campaigns/tracker).
 * Walks through the stat cards, filters, campaign cards, sends and actions.
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

  const firstCard = document.querySelector(".it-campaign");
  const hasRemind = !!document.querySelector(".it-remind-btn");
  const hasEdit = !!document.querySelector(".it-campaign .it-edit-btn");
  const hasRevoke = !!document.querySelector(".it-revoke-btn");

  const steps = [];

  steps.push({
    id: "it-stats",
    title: "Summary stats",
    text: "A snapshot of everyone in view: total invited, Yes / No / Maybe, Pending (no reply yet) and Revoked. Each person is counted once, and the counts follow the filters below.",
    attachTo: { element: ".it-stat-card", on: "bottom" },
    buttons: null,
  });

  steps.push({
    id: "it-campaign-filter",
    title: "Campaign filter",
    text: "Show just one campaign. Choosing a follow-up (↳) shows its whole campaign, since follow-ups live inside the campaign they follow.",
    attachTo: { element: "#itBatchFilter", on: "bottom" },
    buttons: null,
  });

  steps.push({
    id: "it-response-filter",
    title: "Response filter",
    text: "Show only people with a given answer. Cards without anyone matching are hidden, and each card shows how many of its people match.",
    attachTo: { element: "#itResponseFilter", on: "bottom" },
    buttons: null,
  });

  steps.push({
    id: "it-search",
    title: "Name search",
    text: "Type part of a name to find someone. When only a few campaigns match, they open on their <strong>People</strong> list.",
    attachTo: { element: "#itSearch", on: "bottom" },
    buttons: null,
  });

  if (firstCard) {
    steps.push({
      id: "it-card",
      title: "One card per campaign",
      text: "Each campaign is one card, with its follow-ups inside it. The bar shows how everyone has answered; the line under it gives the counts.",
      attachTo: { element: ".it-campaign", on: "top" },
      buttons: null,
    });

    steps.push({
      id: "it-toggle",
      title: "Sends and people",
      text: "Open a card to see its <strong>Sends</strong>: the original message, people added later, every reminder and follow-up, in order. Open a send to read exactly what went out and see who got it, with text and email delivery. <strong>People</strong> lists everyone once with their answer.",
      attachTo: { element: ".it-toggle", on: "bottom" },
      buttons: null,
    });
  }

  if (hasRemind) {
    steps.push({
      id: "it-remind",
      title: "Remind pending",
      text: "Opens Campaign Center with everyone who hasn't answered already selected, ready to send a reminder. The reminder shows up as its own send on this card.",
      attachTo: { element: ".it-remind-btn", on: "left" },
      buttons: null,
    });
  }

  if (firstCard) {
    steps.push({
      id: "it-add",
      title: "Add people",
      text: "Opens Campaign Center on this campaign so you can send it to more volunteers without writing the message again.",
      attachTo: { element: ".it-add-btn", on: "left" },
      buttons: null,
    });
  }

  if (hasEdit) {
    steps.push({
      id: "it-edit-campaign",
      title: "Edit campaign",
      text: "Rename the campaign, change its saved message, parent link, <strong>Response needed</strong> or <strong>Recruitment</strong>, or deactivate it. Changing the saved message only affects future sends: each send keeps the text it went out with.",
      attachTo: { element: ".it-campaign .it-edit-btn", on: "left" },
      buttons: null,
    });
  }

  if (hasRevoke) {
    steps.push({
      id: "it-revoke",
      title: "Remind, revoke or reinstate",
      text: "The <strong>bell</strong> (people who haven't answered) opens Campaign Center with just that person selected for a reminder. The <strong>ban icon</strong> revokes someone's invitation so their RSVP link stops working; the <strong>rotate-left icon</strong> brings it back. Check <strong>Show revoked</strong> to see revoked people.",
      attachTo: { element: ".it-revoke-btn", on: "left" },
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
