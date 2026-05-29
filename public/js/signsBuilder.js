/**
 * @file public/js/signsBuilder.js
 * @description Client-side behavior for the Sign Builder page.
 *
 * Responsibilities:
 *   - Live preview of sign text + arrow as the user types or clicks
 *   - Arrow direction picker (single-select, toggleable, with "no arrow")
 *   - AJAX submit to POST /signs (new) or PUT /signs/:id (edit)
 *   - Redirect to /signs on success; inline error feedback on failure
 *
 * No inline event handlers — CSP forbids them.
 */

(() => {
  "use strict";

  /**
   * Unicode glyph for each arrow direction token.
   * `destination` is handled separately because it renders as a
   * FontAwesome icon, not a Unicode character.
   */
  const ARROW_GLYPHS = {
    up: "\u2191",
    down: "\u2193",
    left: "\u2190",
    right: "\u2192",
    "up-left": "\u2196",
    "up-right": "\u2197",
    "down-left": "\u2199",
    "down-right": "\u2198",
    "up-then-left": "\u21B0",
    "up-then-right": "\u21B1",
  };

  /** HTML used to render the destination pin in the preview. */
  const DESTINATION_HTML =
    '<i class="fa-solid fa-location-dot" aria-hidden="true"></i>';

  /**
   * Read the CSRF token from the meta tag.
   * @returns {string}
   */
  function getCsrfToken() {
    const el = document.querySelector('meta[name="csrf-token"]');
    return el ? el.getAttribute("content") || "" : "";
  }

/**
     * Update the live preview based on the current text input
     * and arrow direction hidden input. The destination pin is
     * rendered as a FontAwesome icon (innerHTML); all other arrow
     * directions render as a Unicode character (textContent).
     */
    function updatePreview() {
        const textInput  = document.getElementById("signTextInput");
        const arrowInput = document.getElementById("arrowDirectionInput");
        const previewT   = document.getElementById("previewText");
        const previewA   = document.getElementById("previewArrow");

        if (!textInput || !arrowInput || !previewT || !previewA) return;

        const text  = textInput.value.trim();
        const arrow = arrowInput.value;

        previewT.textContent = text || "YOUR TEXT";

        if (arrow === "destination") {
            previewA.innerHTML = DESTINATION_HTML;
        } else if (arrow && ARROW_GLYPHS[arrow]) {
            previewA.textContent = ARROW_GLYPHS[arrow];
        } else {
            previewA.textContent = "";
        }
    }

  /**
   * Mark the active arrow button in the picker so the selection is
   * visible. Removes the active class from all buttons first.
   * @param {string} dir
   */
  function syncArrowButtons(dir) {
    const buttons = document.querySelectorAll(".arrow-btn");
    buttons.forEach((btn) => {
      const btnDir = btn.getAttribute("data-arrow") || "";
      btn.classList.toggle("active", btnDir === dir);
    });
  }

  /**
   * Wire the text input to update the preview on every keystroke.
   */
  function initTextInput() {
    const textInput = document.getElementById("signTextInput");
    if (!textInput) return;
    textInput.addEventListener("input", updatePreview);
  }

  /**
   * Wire the arrow picker buttons. Clicking a button sets the hidden
   * input value, updates the preview, and re-syncs the active state.
   * Clicking the currently-active direction clears it back to no arrow.
   */
  function initArrowPicker() {
    const arrowInput = document.getElementById("arrowDirectionInput");
    const buttons = document.querySelectorAll(".arrow-btn");
    if (!arrowInput) return;

    // Apply initial state from server-rendered value
    syncArrowButtons(arrowInput.value);
    updatePreview();

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const dir = btn.getAttribute("data-arrow") || "";

        // Toggle off when clicking the already-active direction
        if (dir && dir === arrowInput.value) {
          arrowInput.value = "";
        } else {
          arrowInput.value = dir;
        }

        syncArrowButtons(arrowInput.value);
        updatePreview();
      });
    });
  }

  /**
   * Display a transient feedback message next to the save button.
   * @param {string} message
   * @param {'success'|'error'|'info'} kind
   */
  function setFeedback(message, kind) {
    const el = document.getElementById("signSaveFeedback");
    if (!el) return;

    const color =
      kind === "success"
        ? "text-success"
        : kind === "error"
          ? "text-danger"
          : "text-muted";

    el.className = `small ${color}`;
    el.textContent = message;
  }

  /**
   * Wire the save button. Sends POST for new signs and PUT for
   * existing ones, then redirects to the library on success.
   */
  function initSaveButton() {
    const saveBtn = document.getElementById("signSaveBtn");
    const root = document.getElementById("signsBuilderRoot");
    if (!saveBtn || !root) return;

    const existingId = root.getAttribute("data-sign-id");
    const isEdit = !!existingId;

    saveBtn.addEventListener("click", async () => {
      const textInput = document.getElementById("signTextInput");
      const arrowInput = document.getElementById("arrowDirectionInput");
      const descInput = document.getElementById("signDescriptionInput");

      const signText = (textInput?.value || "").trim();
      const arrowDirection = arrowInput?.value || null;
      const description = (descInput?.value || "").trim();

      if (!signText) {
        setFeedback("Sign text is required.", "error");
        textInput?.focus();
        return;
      }

      saveBtn.disabled = true;
      const originalLabel = saveBtn.innerHTML;
      saveBtn.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin me-1"></i>Saving…';
      setFeedback("", "info");

      const url = isEdit ? `/signs/${existingId}` : "/signs";
      const method = isEdit ? "PUT" : "POST";

      try {
        const res = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            "CSRF-Token": getCsrfToken(),
          },
          body: JSON.stringify({
            signText,
            arrowDirection: arrowDirection || null,
            description: description || null,
          }),
        });
        const data = await res.json();

        if (data && data.success) {
          setFeedback("Saved — redirecting…", "success");
          window.setTimeout(() => {
            window.location.href = "/signs";
          }, 600);
        } else {
          setFeedback(data?.error || "Save failed.", "error");
          saveBtn.disabled = false;
          saveBtn.innerHTML = originalLabel;
        }
      } catch (err) {
        console.error("Save sign error:", err);
        setFeedback("Network error — please try again.", "error");
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalLabel;
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initTextInput();
    initArrowPicker();
    initSaveButton();
  });
})();
