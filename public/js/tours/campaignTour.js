/**
 * @fileoverview campaignTour.js
 * Shepherd.js tour for the Campaign Center (/oversight/tools/campaigns).
 * Walks through recipient selection, compose area, message types, and sending.
 *
 * @module campaignTour
 */

import { createTour, navButtons, startButtons, finishButtons } from './tourBase.js';

/**
 * Builds and returns the Campaign Center tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildCampaignTour() {
    const tour = createTour();

    const hasTemplates  = !!document.querySelector('.mc-template-row');
    const hasBatches    = !!document.getElementById('mcModeAddTo') &&
                          !document.getElementById('mcModeAddTo').disabled;
    const hasEventDays  = !!document.getElementById('mcEventDay');

    const steps = [];

    steps.push({
        id: 'mc-welcome',
        title: 'Campaign Center',
        text: 'Campaign Center is where you send convention invitations, alerts, and follow-ups to volunteers via email and SMS. The layout has two panels — a <strong>volunteer selector</strong> on the left and a <strong>compose area</strong> on the right.',
        buttons: null,
    });

    steps.push({
        id: 'mc-aside',
        title: 'Volunteer selector',
        text: 'The left panel lists every volunteer. Click a row to add them to your send list, or use <strong>Select all visible</strong> after filtering to add everyone at once.',
        attachTo: { element: '#mcAside', on: 'right' },
        buttons: null,
    });

    steps.push({
        id: 'mc-filters',
        title: 'Filtering the list',
        text: 'Filter by registration status (All / Draft / Completed) and by active year. The search box narrows by name in real time. Any combination of filters works — the selection count updates as you go.',
        attachTo: { element: '.mc-filters', on: 'right' },
        buttons: null,
    });

    steps.push({
        id: 'mc-send-list',
        title: 'Send list',
        text: 'Selected volunteers appear here as chips. The badge next to "Send List" tracks the count. Clear individual recipients with the × on a chip, or use <strong>Clear all</strong> to start over.',
        attachTo: { element: '#mcSendListCard', on: 'bottom' },
        buttons: null,
    });

    steps.push({
        id: 'mc-templates',
        title: 'Templates',
        text: 'Save your most-used messages as templates. Click a template name to load it into the compose area. Use the pencil icon to edit or the trash icon to delete. <strong>New template</strong> opens the editor below the list.',
        attachTo: { element: '#mcTemplatesCard', on: 'bottom' },
        buttons: null,
    });

    steps.push({
        id: 'mc-message-type',
        title: 'Message type',
        text: '<strong>Invitation</strong> sends a shift invite with an RSVP link. <strong>Alert</strong> sends a plain announcement with no response expected. <strong>Follow-up</strong> links to an existing campaign — useful for reminders or second sends.',
        attachTo: { element: '#mcTypeInvitation', on: 'bottom' },
        buttons: null,
    });

    steps.push({
        id: 'mc-mode',
        title: 'New vs. Add to existing',
        text: 'For Invitations, choose <strong>New Campaign</strong> to start fresh or <strong>Add to Existing</strong> to add more volunteers to a campaign already sent. The tracker links these sends together.',
        attachTo: { element: '#mcModeNew', on: 'bottom' },
        buttons: null,
    });

    steps.push({
        id: 'mc-campaign-name',
        title: 'Campaign name',
        text: 'Give each campaign a descriptive name — it appears in the Invitation Tracker and in reminder dropdowns. Hit <strong>Suggest</strong> to auto-generate a name from the selected event and shift.',
        attachTo: { element: '#mcCampaignName', on: 'bottom' },
        buttons: null,
    });

    if (hasEventDays) {
        steps.push({
            id: 'mc-event',
            title: 'Link to an event',
            text: 'Optionally link this campaign to a convention day and shift. This populates the merge fields like <strong>{shiftDate}</strong>, <strong>{shiftStart}</strong>, and <strong>{locationName}</strong> with real data when messages are sent.',
            attachTo: { element: '#mcEventPickerWrap', on: 'top' },
            buttons: null,
        });
    }

    steps.push({
        id: 'mc-merge-chips',
        title: 'Merge fields',
        text: 'These chips insert personalization tokens into the subject or body. <strong>{firstName}</strong> is replaced with each recipient\'s name at send time. The <strong>RSVP Link</strong> chip inserts a unique link for each volunteer.',
        attachTo: { element: '.mc-merge-chip', on: 'bottom' },
        buttons: null,
    });

    steps.push({
        id: 'mc-body',
        title: 'Message body',
        text: 'Write your message here. For email sends, HTML is not supported — keep it plain text. SMS sends are automatically trimmed to fit carrier limits. The preview at send time shows exactly what each volunteer will receive.',
        attachTo: { element: '#mcBody', on: 'top' },
        buttons: null,
    });

    steps.push({
        id: 'mc-send',
        title: 'Sending',
        text: 'The <strong>Send</strong> button activates once you have recipients and a message body. It shows the exact recipient count. After sending, results appear in a log below the compose area — successes, failures, and skip reasons.',
        attachTo: { element: '#mcSendBtn', on: 'top' },
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
}

initCampaignTour();
