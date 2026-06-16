/**
 * @fileoverview oversightToolsTour.js
 * Shepherd.js tour for the Oversight Tools hub (/oversight/tools).
 * Walks overseers through the layout, sidebar navigation, and tool card sections.
 *
 * @module oversightToolsTour
 */

import {
  createTour,
  navButtons,
  startButtons,
  finishButtons,
  registerTour,
} from "./tourBase.js";

/**
 * Builds and returns the Oversight Tools hub tour.
 *
 * @returns {Shepherd.Tour}
 */
function buildOversightToolsTour() {
    const tour = createTour();

    const hasSidebar   = !!document.querySelector('.ot-sidebar');
    const hasMobileNav = !!document.getElementById('otMobileNav');
    const hasCards     = !!document.querySelector('.admin-tool-card');
    const hasSection   = !!document.querySelector('.tools-group-heading');

    const steps = [];

    steps.push({
        id: 'ot-welcome',
        title: 'Oversight Tools',
        text: 'This is your central hub. Every administrative tool is grouped here by function — communications, volunteer management, scheduling, attendance, and more. What you see depends on your role.',
        buttons: null,
    });

    if (hasSidebar) {
        steps.push({
            id: 'ot-sidebar',
            title: 'Section navigation',
            text: 'On desktop, this sidebar lets you jump directly to any section. Click a label to scroll there instantly without hunting through the page.',
            attachTo: { element: '.ot-sidebar', on: 'right' },
            buttons: null,
        });
    }

    if (hasMobileNav) {
        steps.push({
            id: 'ot-mobile-nav',
            title: 'Mobile navigation',
            text: 'On smaller screens, use this dropdown to jump to a section — the sidebar is hidden to save space.',
            attachTo: { element: '#otMobileNav', on: 'bottom' },
            buttons: null,
        });
    }

    if (hasSection) {
        steps.push({
            id: 'ot-section-heading',
            title: 'Sections',
            text: 'Each section groups related tools. Sections you don\'t have permission to use are hidden entirely — what you see here is exactly what you can access.',
            attachTo: { element: '.tools-group-heading', on: 'bottom' },
            buttons: null,
        });
    }

    if (hasCards) {
        steps.push({
            id: 'ot-tool-card',
            title: 'Tool cards',
            text: 'Each card describes what a tool does and has an <strong>Open</strong> button to launch it. The icon color gives you a quick visual cue for the tool\'s category.',
            attachTo: { element: '.admin-tool-card', on: 'right' },
            buttons: null,
        });

        steps.push({
            id: 'ot-open-btn',
            title: 'Opening a tool',
            text: 'Click <strong>Open</strong> on any card to go straight to that tool. Use your browser\'s back button or the <strong>Oversight Tools</strong> link inside each tool to return here.',
            attachTo: { element: '.admin-tool-btn', on: 'bottom' },
            buttons: null,
        });
    }

    steps.push({
        id: 'ot-finish',
        title: 'You\'re all set',
        text: 'Each tool has its own guided tour — look for the <strong>Take a tour</strong> button in the top-right corner of any page to walk through it step by step.',
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
 * Attaches the tour to #tourTriggerBtn on the Oversight Tools hub.
 *
 * @returns {void}
 */
export function initOversightToolsTour() {
    const btn = document.getElementById('tourTriggerBtn');
    if (!btn) return;
    btn.addEventListener('click', () => buildOversightToolsTour().start());
    registerTour("oversightTools", buildOversightToolsTour);
}

initOversightToolsTour();
