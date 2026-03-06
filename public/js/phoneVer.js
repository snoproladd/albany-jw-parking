// public/js/phoneVer.js
// -----------------------------------------------------------------------------
// Phone verification controller (standalone — no IMask, no bundler)
// - Formats user input into (XXX) XXX-XXXX
// - Phone deliverability check via /validate-phone
// - Duplicate number check (exists flag in API)
// - Confirms re-typed value matches
// - Gated submit button + SMSCapable selection requirement
// - Accessible status output for phone + confirm fields
// -----------------------------------------------------------------------------

(() => {
  "use strict";

  /* ==========================================================================
   * Utilities
   * ======================================================================= */

  /**
   * Extract digits from a string.
   * @param {string} s
   * @returns {string}
   */
  function digitsOnly(s) {
    return s.replace(/\D+/g, "");
  }

  /**
   * Formats a North American 10-digit phone number into (XXX) XXX-XXXX.
   *
   * @param {string} raw
   * @returns {string}
   */
  function formatPhone(raw) {
    const digits = digitsOnly(raw).slice(0, 10);
    const len = digits.length;

    if (len === 0) return "";
    if (len < 4) return `(${digits}`;
    if (len < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  /* ==========================================================================
   * Main initializer (invoked on DOM ready)
   * ======================================================================= */
  document.addEventListener("DOMContentLoaded", initPhoneVerification);

  /**
   * Initializes phone verification, matching, and submission gating.
   * If #phoneVer-form is not present, the script safely no-ops.
   */
  function initPhoneVerification() {
    const csrfToken =
      /** @type {HTMLInputElement | null} */ (
        document.querySelector('input[name="_csrf"]')
      )?.value || "";

    /* DOM ELEMENTS -------------------------------------------------------- */
    const DOM = {
      form: document.querySelector("#phoneVer-form"),

      submitBtn: document.querySelector("#submit-btn"),
      submitStatus: document.querySelector("#submit-status"),

      firstName: document.querySelector("#firstName"),
      lastName: document.querySelector("#lastName"),
      suffix: document.querySelector("#suffix"),

      phone: document.querySelector("#phone"),
      confirm: document.querySelector("#confirm-phone"),

      phoneStatus: document.querySelector("#phone-status"),
      confirmStatus: document.querySelector("#confirm-phone-status"),

      smsRadios: document.querySelectorAll('input[name="SMSCapable"]'),
      smsError: document.getElementById("SMSCapable-error"),

      disableNameFields:
        document.querySelector("#firstName")?.dataset.disable === "true",
    };

    // If form is missing, page doesn’t require phone verification logic.
    if (!DOM.form) return;

    /* STATE --------------------------------------------------------------- */
    const State = {
      phoneDeliverable: false,
      phonesMatch: false,
      aborter: null,
      debounceId: null,
    };

    /* UI HELPERS ---------------------------------------------------------- */

    const UI = {
      /**
       * Remove all status classes and clear innerHTML.
       * @param {HTMLElement} el
       */
      clear(el) {
        el.classList.remove("loading", "success", "error");
        el.innerHTML = "";
      },

      /**
       * Sets a loading state.
       * @param {HTMLElement} el
       * @param {string} [msg="Checking..."]
       */
      loading(el, msg = "Checking...") {
        UI.clear(el);
        el.classList.add("loading");
        el.innerHTML = `
          <span class="spinner-border spinner-border-sm text-secondary" role="status"></span>
          ${msg}
        `;
      },

      /**
       * Success with plain checkmark text.
       * @param {HTMLElement} el
       * @param {string} [msg="✅ OK"]
       */
      success(el, msg = "✅ OK") {
        UI.clear(el);
        el.classList.add("success");
        el.textContent = msg;
      },

      /**
       * Error with a Bootstrap alert wrapper.
       * @param {HTMLElement} el
       * @param {string} [msg="Error."]
       */
      error(el, msg = "Error.") {
        UI.clear(el);
        el.classList.add("error");
        el.innerHTML = `
          <div class="alert alert-danger alert-dismissible fade show" role="alert">
            ❌ ${msg}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
          </div>
        `;
      },

      /**
       * Loading message for the submit-status box.
       * @param {string} msg
       */
      submitLoading(msg) {
        DOM.submitStatus.classList.remove("success", "error");
        DOM.submitStatus.classList.add("loading");
        DOM.submitStatus.innerHTML = `
          <span class="spinner-border spinner-border-sm text-secondary" role="status"></span>
          ${msg}
        `;
      },

      /**
       * Submit success message.
       * @param {string} msg
       */
      submitSuccess(msg) {
        DOM.submitStatus.classList.remove("error");
        DOM.submitStatus.classList.add("success");
        DOM.submitStatus.textContent = msg;
      },

      /**
       * Submit error message.
       * @param {string} msg
       */
      submitError(msg) {
        DOM.submitStatus.classList.remove("success");
        DOM.submitStatus.classList.add("error");
        DOM.submitStatus.innerHTML = `
          <div class="alert alert-danger alert-dismissible fade show" role="alert">
            ❌ ${msg}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
          </div>
        `;
      },

      /**
       * Enables or disables the confirm-phone field.
       * @param {boolean} enable
       */
      toggleConfirmField(enable) {
        DOM.confirm.disabled = !enable;
      },
    };

    /* LOGIC --------------------------------------------------------------- */
    const Logic = {
      /**
       * Returns true if required fields (first, last, phone, confirm) are filled.
       */
      fieldsFilled() {
        const fn = DOM.disableNameFields || DOM.firstName.value.trim() !== "";
        const ln = DOM.disableNameFields || DOM.lastName.value.trim() !== "";

        return fn && ln && DOM.phone.value.trim() && DOM.confirm.value.trim();
      },

      /**
       * Returns true if one of SMSCapable radios is selected.
       */
      radiosSelected() {
        return !!document.querySelector('input[name="SMSCapable"]:checked');
      },

      /**
       * Exact match check of raw digits from phone + confirm.
       */
      numbersMatch() {
        return (
          digitsOnly(DOM.phone.value.trim()) ===
          digitsOnly(DOM.confirm.value.trim())
        );
      },

      /**
       * Handles submit button gating + overall readiness status.
       */
      updateSubmitState() {
        if (DOM.smsError) {
          DOM.smsError.style.display = Logic.radiosSelected()
            ? "none"
            : "block";
        }

        const ready =
          Logic.fieldsFilled() &&
          Logic.numbersMatch() &&
          State.phoneDeliverable &&
          State.phonesMatch &&
          Logic.radiosSelected();

        DOM.submitBtn.disabled = !ready;

        if (ready) {
          UI.submitSuccess("✅ Ready to submit");
        } else {
          UI.submitError(
            "Please complete all required fields, ensure phone numbers match, and select Yes/No for SMSCapable.",
          );
        }
      },

      /**
       * Confirms phone # re-entry matches exactly.
       * Updates confirm-status, gating, and submit state.
       */
      validateConfirmMatch() {
        const p1 = digitsOnly(DOM.phone.value.trim());
        const p2 = digitsOnly(DOM.confirm.value.trim());

        if (!State.phoneDeliverable) {
          State.phonesMatch = false;
          UI.clear(DOM.confirmStatus);
          DOM.confirmStatus.textContent = "Validate your phone first.";
          Logic.updateSubmitState();
          return;
        }

        if (!p2) {
          State.phonesMatch = false;
          UI.clear(DOM.confirmStatus);
          DOM.confirmStatus.textContent = "Please repeat your phone.";
          Logic.updateSubmitState();
          return;
        }

        if (p1 === p2) {
          State.phonesMatch = true;
          UI.success(DOM.confirmStatus, "✅ Phones match");
        } else {
          State.phonesMatch = false;
          UI.error(DOM.confirmStatus, "Phones do not match.");
        }

        Logic.updateSubmitState();
      },

      /**
       * Validates phone using backend API:
       *   GET /validate-phone?phone=<raw>
       *
       * - Checks deliverability
       * - Checks duplicates via `exists` flag in API
       * - Updates confirm availability + status UI
       *
       * @param {string} raw
       */
      async validatePhone(raw) {
        const trimmed = raw.trim();

        UI.loading(DOM.phoneStatus, "Validating phone...");
        UI.submitLoading("Checking...");

        if (State.aborter) State.aborter.abort();
        State.aborter = new AbortController();

        try {
          const url = new URL("/validate-phone", window.location.origin);
          url.searchParams.set("phone", trimmed);

          const resp = await fetch(url, { signal: State.aborter.signal });
          const data = await resp.json().catch(() => ({}));

          // If user typed more while request was in-flight, discard
          if (DOM.phone.value.trim() !== trimmed) return;

          if (!resp.ok) {
            State.phoneDeliverable = false;
            UI.error(
              DOM.phoneStatus,
              data.error || "Server error. Try again later.",
            );
            UI.toggleConfirmField(false);
            State.phonesMatch = false;
            Logic.updateSubmitState();
            return;
          }

          if (data.valid) {
            State.phoneDeliverable = true;
            UI.success(DOM.phoneStatus, `✅ Valid phone (${DOM.phone.value})`);
            UI.toggleConfirmField(true);

            if (data.exists) {
              UI.error(
                DOM.phoneStatus,
                "This phone number is already registered.",
              );
              UI.submitError("Submission failed.");
              UI.toggleConfirmField(false);
              State.phonesMatch = false;
              Logic.updateSubmitState();
              return;
            }
          } else {
            State.phoneDeliverable = false;
            UI.error(
              DOM.phoneStatus,
              data.validation_errors || "Invalid phone number.",
            );
            UI.toggleConfirmField(false);
            State.phonesMatch = false;
          }

          Logic.validateConfirmMatch();
        } catch (err) {
          if (err.name !== "AbortError") {
            State.phoneDeliverable = false;
            UI.error(DOM.phoneStatus, "Error validating phone.");
            UI.toggleConfirmField(false);
            State.phonesMatch = false;
          }
        } finally {
          State.aborter = null;
          Logic.updateSubmitState();
        }
      },
    };

    /* EVENT BINDING -------------------------------------------------------- */
    const Events = {
      init() {
        // User typing in primary phone field
        DOM.phone.addEventListener("input", () => {
          const formatted = formatPhone(DOM.phone.value);
          DOM.phone.value = formatted;

          clearTimeout(State.debounceId);
          const raw = DOM.phone.value;

          // Basic checks before API call
          if (!raw.trim()) {
            State.phoneDeliverable = false;
            UI.toggleConfirmField(false);
            UI.clear(DOM.phoneStatus);
            DOM.phoneStatus.textContent = "Please enter a phone number.";
            State.phonesMatch = false;
            Logic.updateSubmitState();
            return;
          }

          if (digitsOnly(raw).length < 10) {
            State.phoneDeliverable = false;
            UI.toggleConfirmField(false);
            UI.clear(DOM.phoneStatus);
            DOM.phoneStatus.textContent = "Enter at least 10 digits.";
            State.phonesMatch = false;
            Logic.updateSubmitState();
            return;
          }

          UI.submitLoading("Checking...");
          State.debounceId = window.setTimeout(
            () => Logic.validatePhone(raw),
            500,
          );

          Logic.updateSubmitState();
        });

        // Confirm-phone typing
        DOM.confirm.addEventListener("input", () => {
          const formatted = formatPhone(DOM.confirm.value);
          DOM.confirm.value = formatted;
          Logic.validateConfirmMatch();
        });

        // Disable paste for confirm-phone
        DOM.confirm.addEventListener("paste", (e) => {
          e.preventDefault();
          UI.error(
            DOM.confirmStatus,
            "Pasting is disabled. Please retype your phone.",
          );
          Logic.updateSubmitState();
        });

        // First/last name inputs update readiness
        if (DOM.firstName)
          DOM.firstName.addEventListener("input", Logic.updateSubmitState);
        if (DOM.lastName)
          DOM.lastName.addEventListener("input", Logic.updateSubmitState);

        // SMSCapable radios
        DOM.smsRadios.forEach((r) =>
          r.addEventListener("change", Logic.updateSubmitState),
        );
      },
    };

    // INIT
    Events.init();
    Logic.updateSubmitState();

    // Hide sms error initially
    if (DOM.smsError) DOM.smsError.style.display = "none";
  }
})();

