import IMask from "imask";

/**
 * phoneVer.js
 * Optimized hybrid‑module architecture (Option C)
 *
 * Structure:
 *   const DOM        – All element lookups
 *   const State      – Reactive-ish data store
 *   const UI         – All UI rendering helpers
 *   const IMaskSetup – Mask initialization
 *   const Logic      – Validation & matching
 *   const Events     – Listeners that glue everything together
 *   const Submit     – AJAX form submission
 *
 * Maintains 100% identical behavior as before.
 */

const csrfToken =
  document.querySelector('input[name="_csrf"]')?.value;

document.addEventListener("DOMContentLoaded", () => {
  // ─────────────────────────────────────────────
  // MODULE: DOM (all element references, no logic)
  // ─────────────────────────────────────────────
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

  if (!DOM.form) {
    console.warn("phoneVer form not found on this page");
    return;
  }

  // ─────────────────────────────────────────────
  // MODULE: State (centralized reactive-ish store)
  // ─────────────────────────────────────────────
  const State = {
    phoneDeliverable: false,
    phonesMatch: false,
    aborter: null,
    debounceId: null,
    digitsOnly: (s) => s.replace(/\D+/g, ""),
  };

  // ─────────────────────────────────────────────
  // MODULE: UI (all rendering helpers)
  // ─────────────────────────────────────────────
  const UI = {
    clear(el) {
      el.classList.remove("loading", "success", "error");
      el.innerHTML = "";
    },

    loading(el, msg = "Checking...") {
      UI.clear(el);
      el.classList.add("loading");
      el.innerHTML = `
        <span class="spinner-border spinner-border-sm text-secondary"></span>
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
        <span class="spinner-border spinner-border-sm text-secondary"></span>
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

  // ─────────────────────────────────────────────
  // MODULE: IMask setup
  // ─────────────────────────────────────────────
  const IMaskSetup = {
    init() {
      const opts = { mask: "(000) 000-0000", lazy: false };

      if (DOM.phone && !DOM.phone._imask) {
        DOM.phone._imask = IMask(DOM.phone, opts);
      }
      if (DOM.confirm && !DOM.confirm._imask) {
        DOM.confirm._imask = IMask(DOM.confirm, opts);
      }
    },
  };

  // ─────────────────────────────────────────────
  // MODULE: Core Logic
  // ─────────────────────────────────────────────
  const Logic = {
    fieldsFilled() {
      const fn = DOM.disableNameFields || DOM.firstName.value.trim() !== "";
      const ln = DOM.disableNameFields || DOM.lastName.value.trim() !== "";
      return fn && ln && DOM.phone.value.trim() && DOM.confirm.value.trim();
    },

    radiosSelected() {
      return !!document.querySelector('input[name="SMSCapable"]:checked');
    },

    numbersMatch() {
      return (
        State.digitsOnly(DOM.phone.value.trim()) ===
        State.digitsOnly(DOM.confirm.value.trim())
      );
    },

    updateSubmitState() {
      if (DOM.smsError) {
        DOM.smsError.style.display = Logic.radiosSelected() ? "none" : "block";
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
      const p1 = State.digitsOnly(DOM.phone.value.trim());
      const p2 = State.digitsOnly(DOM.confirm.value.trim());

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

        const valid = !!data.valid;
        const reason = data.validation_errors || "";

        if (valid) {
          State.phoneDeliverable = true;
          UI.success(
            DOM.phoneStatus,
            `✅ Valid phone (${DOM.phone.value})`
          );
          UI.toggleConfirmField(true);

          if (data.exists) {
            UI.error(
              DOM.phoneStatus,
              "Duplicate record found. Please check your details."
            );
            UI.submitError(
              "Duplicate record exists. Please check your details."
            );
            UI.toggleConfirmField(false);
            State.phonesMatch = false;
            Logic.updateSubmitState();
            return;
          }
        } else {
          State.phoneDeliverable = false;
          UI.error(DOM.phoneStatus, reason || "Invalid phone number.");
          UI.toggleConfirmField(false);
          State.phonesMatch = false;
        }

        Logic.validateConfirmMatch();
      } catch (err) {
        if (err.name === "AbortError") return;

        State.phoneDeliverable = false;
        UI.error(
          DOM.phoneStatus,
          "Error validating phone. Please try again later."
        );
        UI.toggleConfirmField(false);
        State.phonesMatch = false;
      } finally {
        State.aborter = null;
        Logic.updateSubmitState();
      }
    },
  };

  // ─────────────────────────────────────────────
  // MODULE: Events (bind listeners cleanly)
  // ─────────────────────────────────────────────
  const Events = {
    init() {
      DOM.phone.addEventListener("input", () => {
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

        if (State.digitsOnly(raw).length < 10) {
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

  // ─────────────────────────────────────────────
  // MODULE: Submit (AJAX submission)
  // ─────────────────────────────────────────────
  const Submit = {
    init() {
      DOM.form.addEventListener("submit", async (e) => {
        e.preventDefault();
        Logic.validateConfirmMatch();

        const smsChosen = Logic.radiosSelected();

        if (
          !(
            State.phoneDeliverable &&
            State.phonesMatch &&
            smsChosen &&
            Logic.fieldsFilled()
          )
        ) {
          if (!State.phoneDeliverable)
            UI.error(DOM.phoneStatus, "Please enter a valid phone.");
          if (!State.phonesMatch)
            UI.error(DOM.confirmStatus, "Phones do not match.");
          if (!smsChosen && DOM.smsError)
            DOM.smsError.style.display = "block";

          UI.submitError(
            "Please complete all required fields and ensure phone numbers match."
          );
          Logic.updateSubmitState();
          return;
        }

        DOM.submitBtn.disabled = true;
        UI.submitLoading("Submitting...");

        const payload = {
          firstName: DOM.firstName.value.trim(),
          lastName: DOM.lastName.value.trim(),
          suffix: DOM.suffix.value.trim(),
          phone: DOM.phone.value.trim(),
          SMSCapable:
            document.querySelector('input[name="SMSCapable"]:checked')?.value ===
            "yes",
        };

        try {
          const resp = await fetch("/submit-volunteerInfo", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": csrfToken
            },
            body: JSON.stringify(payload),
            credentials: "include"
          });


          let data;
          const contentType = resp.headers.get("content-type") || "";

          if (contentType.includes("application/json")) {
            data = await resp.json();
          } else {
            const text = await resp.text();
            throw new Error(text || "Invalid server response");
          }
          if (!data.success) {
            UI.submitError(data.message || "Submission failed.");
            return;
          }

          UI.submitSuccess("Info updated successfully!");
          setTimeout(() => {
            window.location.href = "/personalInfo";
          }, 1000);
        } catch (err) {
          UI.submitError("Server error. Please try again later.");
          console.error(err);
        }
      });
    },
  };

  // ─────────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────────
  IMaskSetup.init();
  Events.init();
  Submit.init();

  Logic.updateSubmitState();
  if (DOM.smsError) DOM.smsError.style.display = "none";
});