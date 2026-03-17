// public/js/phoneVer.js
// -----------------------------------------------------------------------------
// Phone verification controller (standalone — no IMask, no bundler)
// - Formats user input into (XXX) XXX-XXXX
// - Phone deliverability check via /validate-phone
// - Duplicate number check (exists flag in API) for registration flow
// - Confirms re-typed value matches (registration flow)
// - Gated submit button + SMSCapable selection requirement (registration flow)
// - Accessible status output for phone + confirm fields
// - My Account: single-field phone validation (unchanged phone is allowed)
// -----------------------------------------------------------------------------

(() => {
  "use strict";

  /* ========================================================================== */
  /* Utilities                                                                  */
  /* ========================================================================== */

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

  /* ========================================================================== */
  /* DOMContentLoaded Bootstrap                                                */
  /* ========================================================================== */

  document.addEventListener("DOMContentLoaded", () => {
    initPhoneVerification(); // registration flow (#phoneSection form)
    initMyAccountPhoneValidation(); // My Account flow (/my-account/update/contact)
  });
  /**
   * Registration Flow: #phoneSection form
   * - Validates phone using /validate-phone
   * - Checks duplicates
   * - Confirms confirmPhone
   * - Gated by SMSCapable radios
   */
  function initPhoneVerification() {
    /** @type {HTMLInputElement | null} */
    const csrfInput = document.querySelector('input[name="_csrf"]');
    const csrfToken = csrfInput?.value || "";

    const DOM = {
      /** @type {HTMLFormElement | null} */
      form: document.querySelector("#phoneSection"),

      /** @type {HTMLButtonElement | null} */
      submitBtn: document.querySelector("#submitBtn"),
      /** @type {HTMLElement | null} */
      submitStatus: document.querySelector("#submitStatus"),

      /** @type {HTMLInputElement | null} */
      firstName: document.querySelector("#firstName"),
      /** @type {HTMLInputElement | null} */
      lastName: document.querySelector("#lastName"),
      /** @type {HTMLInputElement | null} */
      suffix: document.querySelector("#suffix"),

      /** @type {HTMLInputElement | null} */
      phone: document.querySelector("#phone"),
      /** @type {HTMLInputElement | null} */
      confirm: document.querySelector("#confirmPhone"),

      /** @type {HTMLElement | null} */
      phoneStatus: document.querySelector("#phoneStatus"),
      /** @type {HTMLElement | null} */
      confirmStatus: document.querySelector("#confirmPhoneStatus"),

      /** @type {NodeListOf<HTMLInputElement>} */
      smsRadios: document.querySelectorAll('input[name="SMSCapable"]'),
      /** @type {HTMLElement | null} */
      smsError: document.getElementById("SMSCapableError"),

      /** @type {boolean} */
      disableNameFields:
        document.querySelector("#firstName")?.dataset.disable === "true",
    };

    if (
      !DOM.form ||
      !DOM.submitBtn ||
      !DOM.submitStatus ||
      !DOM.phone ||
      !DOM.confirm ||
      !DOM.phoneStatus ||
      !DOM.confirmStatus
    ) {
      return;
    }

    const State = {
      /** @type {boolean} */
      phoneDeliverable: false,
      /** @type {boolean} */
      phonesMatch: false,
      /** @type {AbortController | null} */
      aborter: null,
      /** @type {number | undefined} */
      debounceId: undefined,
    };

    const UI = {
      /**
       * Clear status element.
       * @param {HTMLElement} el
       */
      clear(el) {
        el.classList.remove("loading", "success", "error");
        el.innerHTML = "";
      },

      /**
       * Loading state.
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
       * Success state.
       * @param {HTMLElement} el
       * @param {string} [msg="✅ OK"]
       */
      success(el, msg = "✅ OK") {
        UI.clear(el);
        el.classList.add("success");
        el.textContent = msg;
      },

      /**
       * Error state.
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
       * Submit loading state.
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
       * Submit success state.
       * @param {string} msg
       */
      submitSuccess(msg) {
        DOM.submitStatus.classList.remove("error");
        DOM.submitStatus.classList.add("success");
        DOM.submitStatus.textContent = msg;
      },

      /**
       * Submit error state.
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
       * Enable or disable confirm field.
       * @param {boolean} enable
       */
      toggleConfirmField(enable) {
        DOM.confirm.disabled = !enable;
      },
    };

    const Logic = {
      /**
       * @returns {boolean}
       */
      fieldsFilled() {
        const fn = DOM.disableNameFields || !!DOM.firstName?.value.trim();
        const ln = DOM.disableNameFields || !!DOM.lastName?.value.trim();
        return (
          fn && ln && !!DOM.phone.value.trim() && !!DOM.confirm.value.trim()
        );
      },

      /**
       * @returns {boolean}
       */
      radiosSelected() {
        return !!document.querySelector('input[name="SMSCapable"]:checked');
      },

      /**
       * @returns {boolean}
       */
      numbersMatch() {
        return (
          digitsOnly(DOM.phone.value.trim()) ===
          digitsOnly(DOM.confirm.value.trim())
        );
      },

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
            "Please complete all required fields.",
          );
        }
      },

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
       * Validate phone using /validate-phone.
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

          const resp = await fetch(url.toString(), {
            signal: State.aborter.signal,
          });
          /** @type {{valid?:boolean,exists?:boolean,validation_errors?:string,error?:string}} */
          const data = await resp.json().catch(() => ({}));

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
          if (/** @type {any} */ (err).name !== "AbortError") {
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

    const Events = {
      init() {
        DOM.phone.addEventListener("input", () => {
          const formatted = formatPhone(DOM.phone.value);
          DOM.phone.value = formatted;

          clearTimeout(State.debounceId);
          const raw = DOM.phone.value;

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

        DOM.confirm.addEventListener("input", () => {
          const formatted = formatPhone(DOM.confirm.value);
          DOM.confirm.value = formatted;
          Logic.validateConfirmMatch();
        });

        DOM.confirm.addEventListener("paste", (e) => {
          e.preventDefault();
          UI.error(
            DOM.confirmStatus,
            "Pasting is disabled. Please retype your phone.",
          );
          Logic.updateSubmitState();
        });

        DOM.firstName?.addEventListener("input", Logic.updateSubmitState);
        DOM.lastName?.addEventListener("input", Logic.updateSubmitState);

        DOM.smsRadios.forEach((r) =>
          r.addEventListener("change", Logic.updateSubmitState),
        );
      },
    };

    Events.init();
    Logic.updateSubmitState();
    if (DOM.smsError) DOM.smsError.style.display = "none";
  }

  /**
   * My Account Flow: /my-account/update/contact
   * - Single phone field
   * - Allows unchanged phone
   * - Uses /validate-phone + exists flag
   * - Sets dataset.validPhone for gating
   */
  function initMyAccountPhoneValidation() {
    /** @type {HTMLFormElement | null} */
    const form = document.querySelector(
      'form[action="/my-account/update/contact"]',
    );
    /** @type {HTMLInputElement | null} */
    const phoneInput = document.querySelector("#phone");
    /** @type {HTMLElement | null} */
    const phoneStatus = document.querySelector("#phoneStatus");

    if (!form || !phoneInput || !phoneStatus) return;

    const originalDigits = digitsOnly(phoneInput.dataset.currentPhone || "");
    /** @type {number | undefined} */
    let debounceId;

    function clearStatus() {
      phoneStatus.classList.remove("loading", "success", "error");
      phoneStatus.innerHTML = "";
    }

    /**
     * @param {string} [msg="Checking phone…"]
     */
    function setStatusLoading(msg = "Checking phone…") {
      phoneStatus.classList.remove("success", "error");
      phoneStatus.classList.add("loading");
      phoneStatus.innerHTML = `
        <span class="spinner-border spinner-border-sm text-secondary" role="status"></span>
        ${msg}
      `;
    }

    /**
     * @param {string} [msg="✓ Phone looks good"]
     */
    function setStatusSuccess(msg = "✓ Phone looks good") {
      phoneStatus.classList.remove("loading", "error");
      phoneStatus.classList.add("success");
      phoneStatus.textContent = msg;
    }

    /**
     * @param {string} [msg="Invalid phone"]
     */
    function setStatusError(msg = "Invalid phone") {
      phoneStatus.classList.remove("loading", "success");
      phoneStatus.classList.add("error");
      phoneStatus.innerHTML = `
        <div class="alert alert-danger alert-dismissible fade show" role="alert">
          ❌ ${msg}
          <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>`;
    }

    /**
     * Validate My Account phone.
     * @param {string} raw
     */
    async function validateMyAccountPhone(raw) {
      const phone = raw.trim();
      const digits = digitsOnly(phone);

      if (!digits) {
        clearStatus();
        phoneInput.dataset.validPhone = "false";
        return;
      }

      if (digits === originalDigits) {
        setStatusSuccess("✓ Phone unchanged");
        phoneInput.dataset.validPhone = "true";
        return;
      }

      if (digits.length < 10) {
        setStatusError("Enter at least 10 digits.");
        phoneInput.dataset.validPhone = "false";
        return;
      }

      setStatusLoading();

      try {
        const url = new URL("/validate-phone", window.location.origin);
        url.searchParams.set("phone", phone);

        const resp = await fetch(url.toString());
        /** @type {{valid?:boolean,exists?:boolean,formatted?:string,validation_errors?:string,error?:string}} */
        const data = await resp.json().catch(() => ({}));

        if (phoneInput.value.trim() !== raw.trim()) return;

        if (!resp.ok || !data.valid) {
          setStatusError(
            data.validation_errors || data.error || "Phone not valid.",
          );
          phoneInput.dataset.validPhone = "false";
          return;
        }

        if (data.formatted) {
          phoneInput.value = data.formatted;
        }

        if (data.exists && digits !== originalDigits) {
          setStatusError("Another account already uses this phone number.");
          phoneInput.dataset.validPhone = "false";
          return;
        }

        setStatusSuccess();
        phoneInput.dataset.validPhone = "true";
      } catch (err) {
        console.error("MyAccount phone validation error:", err);
        setStatusError("Phone validation failed. Try again.");
        phoneInput.dataset.validPhone = "false";
      }
    }

    phoneInput.addEventListener("input", () => {
      clearTimeout(debounceId);

      const formatted = formatPhone(phoneInput.value);
      phoneInput.value = formatted;
      const raw = phoneInput.value;

      if (!raw.trim()) {
        clearStatus();
        phoneInput.dataset.validPhone = "false";
        return;
      }

      debounceId = window.setTimeout(() => {
        void validateMyAccountPhone(raw);
      }, 500);
    });
  }
})();
