/**
 * @file inviteRespond.js
 * @description Client-side logic for the public RSVP invite response page.
 *
 * Responsibilities:
 *  - Apply event type dot colors (CSP-safe via data-color → JS).
 *  - Intercept RSVP button clicks to stamp SMS opt-in before form submit
 *    when the invite was delivered via SMS or both channels.
 */

document.addEventListener("DOMContentLoaded", () => {
  // =========================================================
  // Dot colors (CSP-safe)
  // =========================================================

  /**
   * Apply data-color attribute values as inline background-color.
   * @returns {void}
   */
  function applyDotColors() {
    document.querySelectorAll("[data-color]").forEach((el) => {
      el.style.backgroundColor = el.dataset.color;
    });
  }

  applyDotColors();

  // =========================================================
  // RSVP button intercept + SMS opt-in
  // =========================================================

  const form = document.getElementById("rsvpForm");
  const responseInput = document.getElementById("rsvpResponse");
  const channelEl = document.getElementById("rsvpChannel");
  const tokenEl = document.getElementById("rsvpToken");
  const csrfEl = document.getElementById("rsvpCsrf");

  if (!form || !responseInput) return;

  const channel = channelEl?.value || "";
  const isSms = channel === "sms" || channel === "both";

  /**
   * Attempt to stamp the SMS opt-in on the volunteer record.
   * Fire-and-forget — we never block form submission on this.
   * @returns {Promise<void>}
   */
  async function stampSmsOptIn() {
    const token = tokenEl?.value;
    const csrf = csrfEl?.value;
    if (!token || !csrf) return;

    try {
      await fetch(`/invite/opt-in/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({}),
      });
    } catch (err) {
      // Non-fatal — log only, do not block submission
      console.warn("[inviteRespond] opt-in stamp failed:", err);
    }
  }

  /**
   * Wire each RSVP button to set the hidden response value,
   * optionally stamp SMS opt-in, then submit the form.
   */
  document.querySelectorAll(".rsvp-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const response = btn.dataset.response;
      if (!response) return;

      // Disable all buttons to prevent double-submit
      document.querySelectorAll(".rsvp-btn").forEach((b) => {
        b.disabled = true;
      });
      btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Saving…`;

      responseInput.value = response;

      // Stamp opt-in for SMS invites before submitting
      if (isSms) await stampSmsOptIn();

      form.submit();
    });
  });
});
