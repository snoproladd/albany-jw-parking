/**
 * @fileoverview campaignTour.js
 * Shepherd.js tour for the Campaign Center (/oversight/tools/campaigns).
 * Walks through the volunteer list and the page's five steps.
 *
 * @module campaignTour
 */

import {
  createTour,
  navButtons,
  startButtons,
  finishButtons,
  registerTour,
} from "./tourBase.js";

/**
 * Builds and returns the Campaign Center tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildCampaignTour() {
    const tour = createTour();

    const hasEventDays = !!document.getElementById('mcEventDay')?.offsetParent;
    // Only shown for choices that ask for a reply.
    const hasRecruit = !!document.getElementById('mcIsRecruitment')?.offsetParent;

    const steps = [];

    steps.push({
        id: 'mc-welcome',
        title: 'Campaign Center',
        text: 'Send invitations, reminders, follow-ups and announcements to volunteers by email and text. Work down the five numbered steps on the right; the <strong>volunteer list</strong> on the left feeds step 3.',
        buttons: null,
    });

    steps.push({
        id: 'mc-aside',
        title: 'Volunteer list',
        text: 'Click a row to add someone, or filter and use <strong>Select all visible</strong>. A text icon means the person can get texts; a crossed-out one means they haven\'t agreed to texts.',
        attachTo: { element: '#mcAside', on: 'right' },
        buttons: null,
    });

    steps.push({
        id: 'mc-purpose',
        title: '1. What are you sending?',
        text: '<strong>New invitation</strong> asks people to reply. <strong>Add people</strong> sends a campaign to more people. <strong>Reminder</strong> re-sends to everyone who hasn\'t answered (they\'re selected for you). <strong>Follow-up</strong> is a new message linked to a campaign. <strong>Announcement</strong> needs no reply. The fields below change to match.',
        attachTo: { element: '#mcStepPurpose', on: 'bottom' },
        buttons: null,
    });

    if (hasRecruit) {
        steps.push({
            id: 'mc-recruitment',
            title: 'Recruitment campaign',
            text: 'Check this when the campaign asks volunteers whether they\'ll serve this year. Yes and Maybe replies put the volunteer on this year\'s Decently export; Maybes stay off scheduling lists until they reply Yes.',
            attachTo: { element: '#mcIsRecruitment', on: 'right' },
            buttons: null,
        });
    }

    if (hasEventDays) {
        steps.push({
            id: 'mc-event',
            title: '2. Which event?',
            text: 'Optionally link a day and shift. That fills in fields like <strong>{shiftDate}</strong>, <strong>{shiftStart}</strong> and <strong>{locationName}</strong>, which only appear in step 4 once an event is linked. Reminders and Add people use their campaign\'s event.',
            attachTo: { element: '#mcStepEvent', on: 'top' },
            buttons: null,
        });
    }

    steps.push({
        id: 'mc-send-list',
        title: '3. Who gets it?',
        text: 'Everyone selected, as chips. Remove someone with the × on their chip, or <strong>Clear all</strong>.',
        attachTo: { element: '#mcSendListCard', on: 'bottom' },
        buttons: null,
    });

    steps.push({
        id: 'mc-message',
        title: '4. Message',
        text: 'Start from a template or write your own, and choose Email, Text or both. The chips insert fields such as <strong>{firstName}</strong> and the <strong>RSVP link</strong>. With Text on, the line under the message shows its length and how many texts it takes; emoji and curly quotes cut each text from 160 to 70 characters.',
        attachTo: { element: '#mcComposeCard', on: 'top' },
        buttons: null,
    });

    steps.push({
        id: 'mc-review',
        title: '5. Review and send',
        text: 'The preview is the message the first person on the list will get, filled in. The counts say who gets an email, who gets a text, and who can\'t be reached. <strong>Send</strong> shows how many people will get it; results appear below, and the send shows up in the Invitation Tracker.',
        attachTo: { element: '#mcStepReview', on: 'top' },
        buttons: null,
    });

    steps.forEach((step, i) => {
        const isFirst = i === 0;
        const isLast  = i === steps.length - 1;
        step.buttons = isFirst ? startButtons(tour) : isLast ? finishButtons(tour) : navButtons(tour);
        tour.addStep(step);
    });

    return tour;
}

/**
 * Attaches the tour to #tourTriggerBtn on the Campaign Center page.
 *
 * @returns {void}
 */
export function initCampaignTour() {
    const btn = document.getElementById('tourTriggerBtn');
    if (!btn) return;
    btn.addEventListener('click', () => buildCampaignTour().start());
    registerTour("campaign", buildCampaignTour);
}

initCampaignTour();
