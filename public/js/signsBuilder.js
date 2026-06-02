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
   * Compute the auto-suggested abbreviation for a sign text. Mirrors the
   * server-side helper in lib/dbSync.js — keep these two in sync, since
   * the server falls back to its own copy when the override is NULL.
   *
   * @param {string} text
   * @returns {string} Uppercase abbreviation, or '' for empty input.
   */
  function computeSignAbbreviation(text) {
    if (!text || typeof text !== "string") return "";
    const cleaned = text
      .trim()
      .replace(/[^\w\s&-]/g, " ")
      .replace(/[-_/]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return "";

    const STOP_WORDS = new Set(["the", "a", "an", "of", "&"]);
    const words = cleaned
      .split(" ")
      .filter((w) => w && !STOP_WORDS.has(w.toLowerCase()));
    if (words.length === 0) return "";

    if (words.length === 1) {
      const w = words[0];
      if (w.length <= 3) return w.toUpperCase();
      const m = w.match(/^([A-Za-z]+)(\d+)$/);
      if (m) return (m[1][0] + m[2]).toUpperCase().substring(0, 3);
      return w.substring(0, 3).toUpperCase();
    }

    const parts = words.map((w) => (/^\d+$/.test(w) ? w : w[0]));
    return parts.join("").toUpperCase().substring(0, 3);
  }

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
   * Refresh the abbreviation input's placeholder with the current
   * auto-suggestion. If the user hasn't manually overridden it, also
   * push the suggestion into the value so the field reflects what
   * will be saved. The data-user-override attr is toggled to '1' the
   * moment the user types in the field — from that point on, sign-text
   * changes only update the placeholder, not the value.
   */
  function refreshAbbreviationSuggestion() {
    const textInput = document.getElementById("signTextInput");
    const abbrInput = document.getElementById("signAbbreviationInput");
    if (!textInput || !abbrInput) return;

    const suggestion = computeSignAbbreviation(textInput.value);
    abbrInput.placeholder = suggestion || "auto";

    if (abbrInput.getAttribute("data-user-override") !== "1") {
      // Don't write into the value — that'd send the suggestion to the
      // server as an override. Leaving value empty causes the server to
      // store NULL, which falls back to the heuristic on read.
      abbrInput.value = "";
    }
  }

  /**
   * Wire the text input to update the preview and refresh the
   * abbreviation suggestion on every keystroke.
   */
  function initTextInput() {
    const textInput = document.getElementById("signTextInput");
    if (!textInput) return;
    textInput.addEventListener("input", () => {
      updatePreview();
      refreshAbbreviationSuggestion();
    });
  }

  /**
   * Wire the abbreviation input. Typing in it flips the user-override
   * flag so future sign-text changes don't clobber the value. Clearing
   * the field flips it back so the suggestion resumes.
   */
  function initAbbreviationInput() {
    const abbrInput = document.getElementById("signAbbreviationInput");
    if (!abbrInput) return;

    abbrInput.addEventListener("input", () => {
      // Force uppercase to match the server's normalisation and the
      // map's visual style; no point letting the user type lowercase
      // when it'll be uppercased on save anyway.
      const upper = abbrInput.value.toUpperCase();
      if (upper !== abbrInput.value) abbrInput.value = upper;

      abbrInput.setAttribute(
        "data-user-override",
        abbrInput.value.trim() ? "1" : "0",
      );
    });

    // Seed the placeholder from current sign text on page load.
    refreshAbbreviationSuggestion();
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
      const abbrInput = document.getElementById("signAbbreviationInput");

      const signText = (textInput?.value || "").trim();
      const arrowDirection = arrowInput?.value || null;
      const description = (descInput?.value || "").trim();
      // Only send a real override; an empty string tells the server to
      // clear any prior override and revert to the heuristic.
      const abbreviation = (abbrInput?.value || "").trim().toUpperCase();

      if (!signText) {
        setFeedback("Sign text is required.", "error");
        textInput?.focus();
        return;
      }
      if (abbreviation.length > 6) {
        setFeedback("Abbreviation must be 6 characters or fewer.", "error");
        abbrInput?.focus();
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
            abbreviation: abbreviation || null,
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
    initAbbreviationInput();
    initSaveButton();
  });
})();
