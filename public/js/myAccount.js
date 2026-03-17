/**
 * CACHED MY ACCOUNT CHANGES — FINALIZE-ONCE MODEL
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

  function allLocked() {
    return [...root.querySelectorAll(".accordion-body")].every(
      (s) => s.dataset.editing === "false",
    );
  }

  function updateFinalizeState() {
    finalizeBtn.disabled = !allLocked();
  }

  updateFinalizeState();

  function cacheContact(sec) {
    window.myAccountCache.contact = {
      email: sec.querySelector('[name="email"]')?.value?.trim(),
      phone: sec.querySelector('[name="phone"]')?.value?.trim(),
      smsCapable: sec.querySelector("#sms-yes")?.checked
        ? true
        : sec.querySelector("#sms-no")?.checked
          ? false
          : undefined,
    };
  }

  function cachePersonal(sec) {
    window.myAccountCache.personal = {
      dobirthRaw: sec.querySelector('[name="dobirthRaw"]')?.value || undefined,
      genderRaw: sec.querySelector('[name="genderRaw"]')?.value || undefined,
      staminaRaw: sec.querySelector('[name="staminaRaw"]')?.value || undefined,
    };
  }

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

  function cacheSpiritual(sec) {
    const vals = [...sec.querySelectorAll(".privilege-checkbox")]
      .filter((i) => i.checked)
      .map((i) => i.value);

    window.myAccountCache.spiritual = vals;
  }

  function cacheNotes(sec) {
    window.myAccountCache.notes =
      sec.querySelector('textarea[name="notes"]')?.value || "";
  }

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

  root.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".summary-edit-btn");
    if (!btn) return;

    const sec = btn.closest(".accordion-body");
    const section = btn.dataset.section;

    setTimeout(() => {
      const before = prevState.get(sec);
      const now = sec.dataset.editing === "true";

      if (before && !now) {
        // user clicked SAVE
        cacheSection(sec, section);
        // Auto-collapse the accordion section after saving
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
    }, 20);
  });

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

      finalizeStatus.innerHTML = `
        <div class="alert alert-success">
          Your changes have been saved.
        </div>`;
      finalizeBtn.textContent = "Finalize Changes";
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
});
