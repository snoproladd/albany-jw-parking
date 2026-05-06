/**
 * @file emailPass.js
 * @description Client-side logic for the Enhanced Account creation page (/email-pass).
 * Handles the identity confirmation modal shown when a returning non-registered
 * user tries to create an enhanced account with the same email as their existing draft.
 */

/**
 * Initialise the identity confirmation modal if the page was reached
 * via a pending draft recovery redirect (?pending=1&maskedName=...).
 * The user must enter their chosen password to confirm identity and
 * convert their non-registered draft to an enhanced account.
 */
function initEmailPassConfirmModal() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("pending") !== "1") return;

  const maskedName = params.get("maskedName") || "";
  const modalEl = document.getElementById("confirmIdentityModal");
  if (!modalEl) return;

  document.getElementById("confirmIdentityName").textContent = maskedName;

  const modal = new bootstrap.Modal(modalEl);
  modal.show();

  const csrfInput = document.querySelector('[name="_csrf"]');
  const csrfToken = csrfInput?.value || "";
  const errorEl = document.getElementById("confirmIdentityError");
  const passwordInput = document.getElementById("confirmIdentityPassword");

  document
    .getElementById("confirmIdentityYes")
    ?.addEventListener("click", async () => {
      const password = passwordInput?.value || "";
      if (!password) {
        if (errorEl) {
          errorEl.textContent = "Please enter your password.";
          errorEl.classList.remove("d-none");
        }
        return;
      }
      if (errorEl) errorEl.classList.add("d-none");

      try {
        const res = await fetch("/confirm-emailpass-recovery", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          credentials: "include",
          body: JSON.stringify({ password }),
        });
        const data = await res.json();
        if (data.success) {
          modal.hide();
          window.location.href = "/volunteerIn?disable=true";
        } else {
          if (errorEl) {
            errorEl.textContent =
              data.error || "Something went wrong. Please try again.";
            errorEl.classList.remove("d-none");
          }
        }
      } catch (err) {
        console.error("[emailPass] confirm recovery error:", err);
        if (errorEl) {
          errorEl.textContent = "Server error. Please try again.";
          errorEl.classList.remove("d-none");
        }
      }
    });

  document
    .getElementById("confirmIdentityStandard")
    ?.addEventListener("click", async () => {
      try {
        const res = await fetch("/confirm-emailpass-recovery", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          credentials: "include",
          body: JSON.stringify({ continueAsStandard: true }),
        });
        const data = await res.json();
        if (data.success) {
          modal.hide();
          window.location.href = "/volunteerIn?disable=true";
        }
      } catch (err) {
        console.error("[emailPass] continue as standard error:", err);
      }
    });

  document
    .getElementById("confirmIdentityNo")
    ?.addEventListener("click", () => {
      modal.hide();
      window.history.replaceState({}, "", "/email-pass");
    });
}

document.addEventListener("DOMContentLoaded", initEmailPassConfirmModal);
