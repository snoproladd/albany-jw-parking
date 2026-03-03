// phoneVer.js - standalone, no IMask, no bundler

// CSRF token helper
const csrfToken = document.querySelector('input[name="_csrf"]')?.value;

// Phone helpers
function digitsOnly(s) {
  return s.replace(/\D+/g, "");
}

function formatPhone(raw) {
  const digits = digitsOnly(raw).slice(0, 10);
  const len = digits.length;

  if (len === 0) return "";
  if (len < 4) {
    return `(${digits}`;
  }
  if (len < 7) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

document.addEventListener("DOMContentLoaded", () => {
  // DOM
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

  if (!DOM.form) return;

  // State
  const State = {
    phoneDeliverable: false,
    phonesMatch: false,
    aborter: null,
    debounceId: null,
  };

  // UI helpers
  const UI = {
    clear(el) {
      el.classList.remove("loading", "success", "error");
      el.innerHTML = "";
    },

    // Loading – spinner + text
    loading(el, msg = "Checking...") {
      UI.clear(el);
      el.classList.add("loading");
      el.innerHTML = `
        <span class="spinner-border spinner-border-sm text-secondary" role="status"></span>
        ${msg}
      `;
    },

    success(el, msg = "✅ OK") {
      UI.clear(el);
      el.classList.add("success");
      el.textContent = msg;
    },

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

    submitLoading(msg) {
      DOM.submitStatus.classList.remove("success", "error");
      DOM.submitStatus.classList.add("loading");
      DOM.submitStatus.innerHTML = `
        <span class="spinner-border spinner-border-sm text-secondary" role="status"></span>
        ${msg}
      `;
    },

    submitSuccess(msg) {
      DOM.submitStatus.classList.remove("error");
      DOM.submitStatus.classList.add("success");
      DOM.submitStatus.textContent = msg;
    },

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

    toggleConfirmField(enable) {
      DOM.confirm.disabled = !enable;
    },
  };

  // Logic
  const Logic = {
    fieldsFilled() {
      const fn =
        DOM.disableNameFields || DOM.firstName.value.trim() !== "";
      const ln =
        DOM.disableNameFields || DOM.lastName.value.trim() !== "";
      return (
        fn &&
        ln &&
        DOM.phone.value.trim() &&
        DOM.confirm.value.trim()
      );
    },

    radiosSelected() {
      return !!document.querySelector(
        'input[name="SMSCapable"]:checked'
      );
    },

    numbersMatch() {
      return (
        digitsOnly(DOM.phone.value.trim()) ===
        digitsOnly(DOM.confirm.value.trim())
      );
    },

    updateSubmitState() {
      if (DOM.smsError) {
        DOM.smsError.style.display =
          Logic.radiosSelected() ? "none" : "block";
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
          "Please complete all required fields, ensure phone numbers match, and select Yes/No for SMSCapable."
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

        if (DOM.phone.value.trim() !== trimmed) return;

        if (!resp.ok) {
          State.phoneDeliverable = false;
          UI.error(
            DOM.phoneStatus,
            data.error || "Server error. Try again later."
          );
          UI.toggleConfirmField(false);
          State.phonesMatch = false;
          Logic.updateSubmitState();
          return;
        }

        if (data.valid) {
          State.phoneDeliverable = true;
          UI.success(
            DOM.phoneStatus,
            `✅ Valid phone (${DOM.phone.value})`
          );
          UI.toggleConfirmField(true);

          if (data.exists) {
            UI.error(
              DOM.phoneStatus,
              "This phone number is already registered."
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
            data.validation_errors || "Invalid phone number."
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

  // Events
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
        State.debounceId = setTimeout(
          () => Logic.validatePhone(raw),
          500
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
          "Pasting is disabled. Please retype your phone."
        );
        Logic.updateSubmitState();
      });

      if (DOM.firstName)
        DOM.firstName.addEventListener("input", Logic.updateSubmitState);
      if (DOM.lastName)
        DOM.lastName.addEventListener("input", Logic.updateSubmitState);

      DOM.smsRadios.forEach((r) =>
        r.addEventListener("change", Logic.updateSubmitState)
      );
    },
  };

  // Submit
 

  // INIT
  Events.init();
  Logic.updateSubmitState();
  if (DOM.smsError) DOM.smsError.style.display = "none";
});