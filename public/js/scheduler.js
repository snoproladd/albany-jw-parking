/**
 * @file scheduler.js
 * @description Entry point for the volunteer scheduler page.
 * Wires together the event bus, data/DOM actions, and drag-and-drop
 * initialisation in the correct order after DOMContentLoaded.
 */

import { initDomEvents } from "./schedulerDomEvents.js";
import { initDomActions } from "./schedulerDomActions.js";

document.addEventListener("DOMContentLoaded", async () => {
  initDomEvents();
  await initDomActions();
});
