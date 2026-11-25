/**
 * @file inviteRespond.js
 * @description Client-side logic for the public RSVP page
 * (views/authentication_and_accounts/inviteRespond.ejs).
 *
 * Responsibilities:
 *  - Apply event type dot colors (CSP-safe via data-color → JS).
 *  - Submit the chosen answer when an answer button is pressed, and stop a
 *    second press while it saves.
 *  - "Other": show the text box, and require text before submitting.
 *
 * Text consent for invitations sent by text is recorded by the server when
 * the answer is saved (index.js, POST /invite/respond/:token).
 */

document.addEventListener("DOMContentLoaded", () => {
    // Dot colors (CSP-safe)
    document.querySelectorAll("[data-color]").forEach((el) => {
        el.style.backgroundColor = el.dataset.color;
    });

    const form = /** @type {HTMLFormElement|null} */ (document.getElementById("rsvpForm"));
    const responseInput = /** @type {HTMLInputElement|null} */ (document.getElementById("rsvpResponse"));
    if (!form || !responseInput) return;

    const otherWrap = document.getElementById("rsvpOtherWrap");
    const otherInput = /** @type {HTMLInputElement|null} */ (document.getElementById("rsvpOtherInput"));

    /**
     * Disable every answer button and show "Saving…" on the pressed one.
     *
     * @param {HTMLElement|null} pressed
     * @returns {void}
     */
    function showSaving(pressed) {
        document.querySelectorAll(".rsvp-btn").forEach((b) => {
            /** @type {HTMLButtonElement} */ (b).disabled = true;
        });
        if (pressed) {
            pressed.innerHTML = '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Saving…';
        }
    }

    document.querySelectorAll(".rsvp-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const response = /** @type {HTMLElement} */ (btn).dataset.response;
            if (!response) return;

            // "Other" shows the text box instead of submitting
            if (response === "other") {
                otherWrap?.classList.remove("d-none");
                otherInput?.focus();
                return;
            }

            responseInput.value = response;
            showSaving(/** @type {HTMLElement} */ (btn));
            form.submit();
        });
    });

    // Submitting the "Other" text box
    form.addEventListener("submit", (e) => {
        if (!otherWrap || otherWrap.classList.contains("d-none")) return;
        const text = otherInput?.value.trim();
        if (!text) {
            e.preventDefault();
            otherInput?.classList.add("is-invalid");
            otherInput?.focus();
            return;
        }
        otherInput?.classList.remove("is-invalid");
        responseInput.value = "other";
        showSaving(null);
    });
});
