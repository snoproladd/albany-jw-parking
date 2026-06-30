// public/js/myAccount.js
/**
 * CACHED MY ACCOUNT CHANGES — FINALIZE-ONCE MODEL
 *
 * Manages accordion section edit/save caching, finalize submit,
 * change-password panel visibility tied to contact edit mode,
 * and beforeunload unsaved-changes guard.
 */
window.myAccountCache = {};

document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("formSummaryRoot");
  const finalizeBtn = document.getElementById("finalize-changes");
  const finalizeStatus = document.getElementById("finalize-status");
  if (!root || !finalizeBtn || !finalizeStatus) return;

  const prevState = new WeakMap();
  root.querySelectorAll(".accordion-body").forEach((sec) => {
    prevState.set(sec, sec.dataset.editing === "true");
  });

  /** @type {boolean} True after a successful finalize — suppresses beforeunload. */
  let hasFinalized = false;

  /** @type {boolean} True once any section has been saved into cache. */
  let hasCachedChanges = false;

  /**
   * @type {boolean} True while the password form POST is in flight.
   * Suppresses the beforeunload guard so the redirect doesn't trigger it.
   */
  let isSavingPassword = false;

  // -----------------------------------------------------------------------
  // Accordion helpers
  // -----------------------------------------------------------------------

  /**
   * Returns true when every EDITABLE accordion section is out of edit mode.
   *
   * Read-only sections (e.g. Blackouts, Convention Invitations) live in
   * their own `.accordion-body` but contain no `.summary-edit-btn`, so they
   * never get a `data-editing` attribute and would otherwise keep the
   * Finalize button disabled forever. Only consider sections that have an
   * edit button.
   *
   * @returns {boolean}
   */
  function allLocked() {
    const editableSections = [
      ...root.querySelectorAll(".summary-edit-btn"),
    ].map((btn) => btn.closest(".accordion-body"));
    return editableSections.every((s) => s?.dataset.editing === "false");
  }

  /**
   * Syncs the Finalize button enabled state with accordion edit state.
   * @returns {void}
   */
  function updateFinalizeState() {
    finalizeBtn.disabled = !allLocked();
  }

  updateFinalizeState();

  // -----------------------------------------------------------------------
  // Section cache helpers
  // -----------------------------------------------------------------------

  /**
   * Cache the Contact section's current field values into
   * `window.myAccountCache.contact`. Reads the SMS-capable radios and the
   * shift-alert opt-in checkbox so the finalize POST has the full picture.
   *
   * @param {HTMLElement} sec
   * @returns {void}
   */
  function cacheContact(sec) {
    const shiftAlertsBox = /** @type {HTMLInputElement | null} */ (
      sec.querySelector('[name="smsShiftAlertsOptIn"]')
    );
    window.myAccountCache.contact = {
      email: sec.querySelector('[name="email"]')?.value?.trim(),
      phone: sec.querySelector('[name="phone"]')?.value?.trim(),
      smsCapable: sec.querySelector("#sms-yes")?.checked
        ? true
        : sec.querySelector("#sms-no")?.checked
          ? false
          : undefined,
      // Checkbox: send explicit true/false so the server distinguishes
      // "user opted out" from "field absent" (which would leave the DB alone).
      smsShiftAlertsOptIn: shiftAlertsBox ? shiftAlertsBox.checked : undefined,
    };
  }

  /** @param {HTMLElement} sec */
  function cachePersonal(sec) {
    window.myAccountCache.personal = {
      dobirthRaw: sec.querySelector('[name="dobirthRaw"]')?.value || undefined,
      genderRaw: sec.querySelector('[name="genderRaw"]')?.value || undefined,
      staminaRaw: sec.querySelector('[name="staminaRaw"]')?.value || undefined,
    };
  }

  /** @param {HTMLElement} sec */
  function cacheCongregation(sec) {
    window.myAccountCache.congregation = {
      congAssigned: sec.querySelector('input[name="congAssigned"]:checked')
        ?.value,
      congregation: sec.querySelector('[name="congregation"]')?.value,
      congregationOtherCity: sec.querySelector('[name="congregationOtherCity"]')
        ?.value,
      congregationOtherState: sec.querySelector(
        '[name="congregationOtherState"]',
      )?.value,
      congregationOtherLang: sec.querySelector('[name="congregationOtherLang"]')
        ?.value,
      extraAttend: sec.querySelector('input[name="extraAttend"]:checked')
        ?.value,
    };
  }

  /** @param {HTMLElement} sec */
  function cacheSpiritual(sec) {
    const vals = [...sec.querySelectorAll(".privilege-checkbox")]
      .filter((i) => i.checked)
      .map((i) => i.value);
    window.myAccountCache.spiritual = vals;
  }

  /** @param {HTMLElement} sec */
  function cacheNotes(sec) {
    window.myAccountCache.notes =
      sec.querySelector('textarea[name="notes"]')?.value || "";
  }

  /**
   * Cache a section's values by name.
   * @param {HTMLElement} sec
   * @param {string} section
   * @returns {void}
   */
  function cacheSection(sec, section) {
    switch (section) {
      case "contact":
        cacheContact(sec);
        break;
      case "personal":
        cachePersonal(sec);
        break;
      case "congregation":
        cacheCongregation(sec);
        break;
      case "spiritual":
        cacheSpiritual(sec);
        break;
      case "notes":
        cacheNotes(sec);
        break;
    }
  }

  // -----------------------------------------------------------------------
  // Accordion edit/save click handler
  // -----------------------------------------------------------------------

  root.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".summary-edit-btn");
    if (!btn) return;

    const sec = btn.closest(".accordion-body");
    const section = btn.dataset.section;

    setTimeout(() => {
      const before = prevState.get(sec);
      const now = sec.dataset.editing === "true";

      if (before && !now) {
        // User clicked SAVE — cache section and mark dirty
        cacheSection(sec, section);
        hasCachedChanges = true;

        // Auto-collapse after saving
        const collapseEl = sec.closest(".accordion-collapse");
        if (collapseEl) {
          const bsCollapse = bootstrap.Collapse.getOrCreateInstance(
            collapseEl,
            { toggle: false },
          );
          bsCollapse.hide();
        }
      }

      prevState.set(sec, now);
      updateFinalizeState();

      // Keep password button visibility in sync with contact edit state
      syncPasswordButtonVisibility();
    }, 20);
  });

  // -----------------------------------------------------------------------
  // Unsaved-changes guard
  // -----------------------------------------------------------------------

  /**
   * Returns true if there are unsaved account-section changes the user
   * hasn't finalized yet. Password saves are excluded — they use their own
   * POST redirect and set isSavingPassword to suppress this guard.
   * @returns {boolean}
   */
  function userHasUnsavedChanges() {
    if (hasFinalized) return false;
    if (isSavingPassword) return false;
    if (!allLocked()) return true;
    if (hasCachedChanges) return true;
    return false;
  }

  window.addEventListener("beforeunload", (event) => {
    if (window.__suppressBeforeUnload) return;
    if (!userHasUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = "";
  });

  // -----------------------------------------------------------------------
  // Return Home button
  // -----------------------------------------------------------------------

  const returnHomeBtn = document.getElementById("return-home");
  if (returnHomeBtn) {
    returnHomeBtn.addEventListener("click", (e) => {
      if (userHasUnsavedChanges()) {
        const leave = confirm(
          "You have unsaved changes. Are you sure you want to leave this page?",
        );
        if (!leave) {
          e.preventDefault();
          return;
        }
      }
      window.location.href = "/";
    });
  }

  // -----------------------------------------------------------------------
  // Finalize handler
  // -----------------------------------------------------------------------

  /**
   * POST cached section changes to the server.
   * @async
   * @returns {Promise<void>}
   */
  finalizeBtn.addEventListener("click", async () => {
    finalizeStatus.innerHTML = "";

    if (!allLocked()) {
      finalizeStatus.innerHTML = `
                <div class="alert alert-warning">
                    Please save all sections before finalizing.
                </div>`;
      return;
    }

    finalizeBtn.disabled = true;
    finalizeBtn.textContent = "Saving...";

    const csrf = document.querySelector('input[name="_csrf"]')?.value || "";

    try {
      const res = await fetch("/my-account/finalize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify(window.myAccountCache),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        finalizeStatus.innerHTML = `
                    <div class="alert alert-danger">
                        ${data.message || "Failed to finalize changes."}
                    </div>`;
        finalizeBtn.disabled = false;
        finalizeBtn.textContent = "Finalize Changes";
        return;
      }

      // Mark clean — no more beforeunload warning
      hasFinalized = true;
      hasCachedChanges = false;

      finalizeStatus.innerHTML = `
                <div class="alert alert-success">
                    Your changes have been saved.
                </div>`;
      finalizeBtn.textContent = "Finalize Changes";
      finalizeBtn.disabled = true;
    } catch (err) {
      console.error(err);
      finalizeStatus.innerHTML = `
                <div class="alert alert-danger">
                    Server error. Try again.
                </div>`;
      finalizeBtn.disabled = false;
      finalizeBtn.textContent = "Finalize Changes";
    }
  });

  // -----------------------------------------------------------------------
  // Change Password panel
  // -----------------------------------------------------------------------

  initChangePasswordPanel();
  initIndividualPasswordToggles();
  initPasswordChangeValidation();

  /**
   * Keeps the "Change Password" button hidden/shown based on whether the
   * contact accordion section is currently in edit mode.
   * @returns {void}
   */
  /**
   * Keeps the "Change Password" button hidden/shown based on whether the
   * contact accordion section is currently in edit mode.
   * @returns {void}
   */
  function syncPasswordButtonVisibility() {
    /** @type {HTMLButtonElement | null} */
    const togglePanelBtn = document.querySelector("#show-password-panel");
    /** @type {HTMLElement | null} */
    const passwordEditBlock = document.querySelector("#password-edit-block");

    if (!togglePanelBtn) return;

    // Find the contact section's accordion-body by walking up from its edit button
    const contactEditBtn = root.querySelector(
      '.summary-edit-btn[data-section="contact"]',
    );
    const contactBody = contactEditBtn?.closest(".accordion-body") ?? null;
    const contactIsEditing = contactBody?.dataset.editing === "true";

    if (!contactIsEditing) {
      togglePanelBtn.classList.add("d-none");
      if (passwordEditBlock) {
        passwordEditBlock.classList.add("d-none");
        togglePanelBtn.setAttribute("aria-expanded", "false");
        passwordEditBlock.setAttribute("aria-hidden", "true");
      }
    } else {
      togglePanelBtn.classList.remove("d-none");
    }
  }
  /**
   * Wires the "Change Password" toggle button and suppresses the
   * beforeunload guard when the password form is submitted.
   * @returns {void}
   */
  /**
   * Wires the "Change Password" toggle button and suppresses the
   * beforeunload guard when the password form is submitted.
   * @returns {void}
   */
  function initChangePasswordPanel() {
    /** @type {HTMLButtonElement | null} */
    const togglePanelBtn = document.querySelector("#show-password-panel");
    /** @type {HTMLElement | null} */
    const passwordEditBlock = document.querySelector("#password-edit-block");

    if (!togglePanelBtn || !passwordEditBlock) return;

    // Start hidden — only visible when contact section is in edit mode
    togglePanelBtn.classList.add("d-none");

    let isOpen = false;

    togglePanelBtn.setAttribute("aria-expanded", "false");
    passwordEditBlock.setAttribute("aria-hidden", "true");

    togglePanelBtn.addEventListener("click", () => {
      isOpen = !isOpen;
      passwordEditBlock.classList.toggle("d-none", !isOpen);
      passwordEditBlock.setAttribute("aria-hidden", String(!isOpen));
      togglePanelBtn.setAttribute("aria-expanded", String(isOpen));

      if (isOpen) {
        const firstInput = passwordEditBlock.querySelector(
          'input[type="password"]',
        );
        if (firstInput) firstInput.focus();
      }
    });

    // Suppress beforeunload on both the submit button click AND form submit.
    // Belt-and-suspenders: click fires before submit, submit fires before
    // beforeunload. Either one sets the flag in time.
    const passwordForm = passwordEditBlock.querySelector("form");
    const saveBtn = passwordEditBlock.querySelector("button[type='submit']");

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        isSavingPassword = true;
        window.__suppressBeforeUnload = true;

      });
    }

    if (passwordForm) {
      passwordForm.addEventListener("submit", () => {
        isSavingPassword = true;
        window.__suppressBeforeUnload = true;
      });
    }
  }

  /**
   * Enables per-field password reveal toggle buttons inside the
   * change-password panel. Matches buttons via [data-pw-toggle="inputId"].
   * @returns {void}
   */
  function initIndividualPasswordToggles() {
    /** @type {NodeListOf<HTMLButtonElement>} */
    const toggleButtons = document.querySelectorAll("button[data-pw-toggle]");
    if (!toggleButtons.length) return;

    toggleButtons.forEach((btn) => {
      const targetId = btn.getAttribute("data-pw-toggle");
      if (!targetId) return;

      /** @type {HTMLInputElement | null} */
      const input = document.getElementById(targetId);
      if (!input) return;

      btn.addEventListener("click", () => {
        const isCurrentlyText = input.type === "text";
        const newType = isCurrentlyText ? "password" : "text";
        input.type = newType;

        const icon = btn.querySelector("i");
        if (icon) {
          icon.classList.toggle("fa-eye", newType === "password");
          icon.classList.toggle("fa-eye-slash", newType === "text");
        }

        btn.setAttribute("aria-pressed", String(newType === "text"));
      });
    });
  }

  /**
   * Live password match validation for the change-password panel.
   * Enables/disables the Save button based on field match state.
   * @returns {void}
   */
  function initPasswordChangeValidation() {
    /** @type {HTMLInputElement | null} */
    const newPwd = document.querySelector("#newPassword");
    /** @type {HTMLInputElement | null} */
    const confPwd = document.querySelector("#confirmPassword");
    /** @type {HTMLElement | null} */
    const statusDiv = document.querySelector("#pw-change-status");
    /** @type {HTMLButtonElement | null} */
    const saveBtn = document.querySelector(
      "#password-edit-block button[type='submit']",
    );

    if (!newPwd || !confPwd || !statusDiv || !saveBtn) return;

    statusDiv.setAttribute("role", "status");
    statusDiv.setAttribute("aria-live", "polite");

    function clearStatus() {
      statusDiv.classList.remove("loading", "success", "error");
      statusDiv.innerHTML = "";
    }

    function setSuccess(msg = "✅ Passwords match") {
      clearStatus();
      statusDiv.classList.add("success");
      statusDiv.textContent = msg;
    }

    function setError(msg = "Passwords do not match.") {
      clearStatus();
      statusDiv.classList.add("error");
      statusDiv.textContent = msg;
    }

    function validate() {
      const pwd = newPwd.value.trim();
      const conf = confPwd.value.trim();

      if (!pwd && !conf) {
        clearStatus();
        saveBtn.disabled = false;
        return;
      }

      if (pwd && !conf) {
        clearStatus();
        saveBtn.disabled = true;
        return;
      }

      if (pwd === conf) {
        setSuccess();
        saveBtn.disabled = false;
      } else {
        setError();
        saveBtn.disabled = true;
      }
    }

    newPwd.addEventListener("input", validate);
    confPwd.addEventListener("input", validate);
  }
});
