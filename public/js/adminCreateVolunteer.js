/**
 * @file adminCreateVolunteer.js
 * @description Client logic for the Create Volunteer page.
 *
 * Handles:
 *  - US phone number masking and Twilio Lookup validation
 *  - Email validation via Kickbox (/validate-email)
 *  - Congregation selector (assigned / visiting / unknown)
 *  - Duplicate-match modal display and "force create" flow
 *  - AJAX form submission with inline result feedback
 *
 * All DOM interaction is driven by element IDs set in adminCreateVolunteer.ejs.
 * The CSRF token is read from #csrfToken (a hidden input rendered by EJS).
 */

(() => {
    "use strict";

    // ── DOM refs ────────────────────────────────────────────────────────────
    const form            = document.getElementById("createVolForm");
    const submitBtn       = document.getElementById("submitBtn");
    const forceInput      = document.getElementById("forceCreate");
    const csrfToken       = document.getElementById("csrfToken").value;
    const formAlert       = document.getElementById("formAlert");

    const emailInput      = document.getElementById("email");
    const emailStatus     = document.getElementById("email-status");
    const phoneInput      = document.getElementById("phone");
    const phoneStatus     = document.getElementById("phone-status");

    const congSelect      = document.getElementById("congSelect");
    const congregationHid = document.getElementById("congregationHidden");
    const visitingFields  = document.getElementById("visitingFields");

    const dupModal        = new bootstrap.Modal(document.getElementById("duplicateModal"));
    const dupList         = document.getElementById("duplicateList");
    const forceBtn        = document.getElementById("forceCreateBtn");

    // ── Validation state ────────────────────────────────────────────────────
    const state = { emailOk: false, phoneOk: false };

    // ── Helpers ─────────────────────────────────────────────────────────────

    /**
     * Show a spinner status message.
     * @param {HTMLElement} el
     * @param {string} text
     */
    function setLoading(el, text) {
        el.className = "form-text mt-1 text-secondary";
        el.innerHTML =
            `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>${text}`;
    }

    /**
     * Mark an input valid with a status message.
     * @param {HTMLInputElement} input
     * @param {HTMLElement} el
     * @param {string} msg
     */
    function setSuccess(input, el, msg) {
        input.classList.remove("is-invalid");
        input.classList.add("is-valid");
        el.className = "form-text mt-1 text-success";
        el.innerHTML = `<i class="fa-solid fa-circle-check me-1"></i>${msg}`;
    }

    /**
     * Mark an input invalid with a status message.
     * @param {HTMLInputElement} input
     * @param {HTMLElement} el
     * @param {string} msg
     */
    function setError(input, el, msg) {
        input.classList.remove("is-valid");
        input.classList.add("is-invalid");
        el.className = "form-text mt-1 text-danger";
        el.innerHTML = `<i class="fa-solid fa-triangle-exclamation me-1"></i>${msg}`;
    }

    /**
     * Show a page-level alert in #formAlert.
     * @param {string} msg
     * @param {"success"|"danger"|"warning"} [type]
     */
    function showAlert(msg, type = "danger") {
        const icon = type === "success" ? "circle-check" : "triangle-exclamation";
        formAlert.innerHTML = `
            <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                <i class="fa-solid fa-${icon} me-2"></i>${msg}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>`;
    }

    /** Enable submit only when both email and phone are valid. */
    function syncSubmitBtn() {
        submitBtn.disabled = !(state.emailOk && state.phoneOk);
    }

    // ── Phone masking (US format: (555) 555-5555) ───────────────────────────

    /**
     * Format a raw digit string into (NXX) NXX-XXXX US mask.
     * @param {string} digits - Raw digit characters only.
     * @returns {string} Masked string, max 14 chars.
     */
    function maskPhone(digits) {
        const d = digits.replace(/\D+/g, "").slice(0, 10);
        if (d.length === 0) return "";
        if (d.length <= 3)  return `(${d}`;
        if (d.length <= 6)  return `(${d.slice(0,3)}) ${d.slice(3)}`;
        return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    }

    phoneInput.addEventListener("input", () => {
        const raw    = phoneInput.value;
        const cursor = phoneInput.selectionStart ?? raw.length;

        // Count digits before cursor to restore position after reformatting
        const digitsBefore = raw.slice(0, cursor).replace(/\D+/g, "").length;

        const masked = maskPhone(raw);
        phoneInput.value = masked;

        // Re-position cursor: find position after digitsBefore-th digit in masked string
        let count = 0;
        let newPos = masked.length;
        for (let i = 0; i < masked.length; i++) {
            if (/\d/.test(masked[i])) {
                count++;
                if (count === digitsBefore) {
                    newPos = i + 1;
                    break;
                }
            }
        }
        phoneInput.setSelectionRange(newPos, newPos);
    });

    // ── Phone validation (Twilio Lookup) ────────────────────────────────────

    /** @type {number|undefined} */
    let phoneDebounce;

    /**
     * Validate phone number via Twilio /validate-phone endpoint.
     * @param {string} phone
     */
    async function validatePhone(phone) {
        const digits = phone.replace(/\D+/g, "");

        if (digits.length < 10) {
            phoneInput.classList.remove("is-valid", "is-invalid");
            phoneStatus.textContent = "";
            state.phoneOk = false;
            syncSubmitBtn();
            return;
        }

        setLoading(phoneStatus, "Validating phone…");

        try {
            const res  = await fetch(`/validate-phone?phone=${encodeURIComponent(digits)}`);
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setError(phoneInput, phoneStatus, data.error || "Phone validation error.");
                state.phoneOk = false;
                syncSubmitBtn();
                return;
            }

            if (data.valid) {
                const typeLabel = data.carrierType ? ` (${data.carrierType})` : "";
                setSuccess(phoneInput, phoneStatus, `Valid number${typeLabel}`);
                state.phoneOk = true;
            } else {
                setError(phoneInput, phoneStatus, data.validation_errors || "Phone number is not valid.");
                state.phoneOk = false;
            }
        } catch (err) {
            console.error("validatePhone error:", err);
            setError(phoneInput, phoneStatus, "Could not validate phone. Please try again.");
            state.phoneOk = false;
        }

        syncSubmitBtn();
    }

    phoneInput.addEventListener("input", () => {
        clearTimeout(phoneDebounce);
        state.phoneOk = false;
        syncSubmitBtn();
        const digits = phoneInput.value.replace(/\D+/g, "");
        if (digits.length >= 10) {
            phoneDebounce = window.setTimeout(() => validatePhone(phoneInput.value), 600);
        }
    });

    // ── Email validation (Kickbox) ───────────────────────────────────────────

    /** @type {number|undefined} */
    let emailDebounce;

    /**
     * Validate email via /validate-email (Kickbox) endpoint.
     * @param {string} email
     */
    async function validateEmail(email) {
        const trimmed = email.trim().toLowerCase();
        if (!trimmed) {
            emailInput.classList.remove("is-valid", "is-invalid");
            emailStatus.textContent = "";
            state.emailOk = false;
            syncSubmitBtn();
            return;
        }

        if (trimmed.endsWith("@jwpub.org")) {
            setError(emailInput, emailStatus, "Emails from @jwpub.org are not allowed.");
            state.emailOk = false;
            syncSubmitBtn();
            return;
        }

        setLoading(emailStatus, "Validating email…");

        try {
            const res  = await fetch(`/validate-email?email=${encodeURIComponent(trimmed)}`);
            const data = await res.json().catch(() => ({}));

            // Discard stale response
            if (emailInput.value.trim().toLowerCase() !== trimmed) return;

            if (!res.ok) {
                setError(emailInput, emailStatus, data.error || "Email validation error.");
                state.emailOk = false;
                syncSubmitBtn();
                return;
            }

            if (String(data.result || "").toLowerCase() === "deliverable") {
                setSuccess(emailInput, emailStatus, "Email looks good");
                state.emailOk = true;
            } else {
                setError(emailInput, emailStatus, data.reason || "Email is not deliverable.");
                state.emailOk = false;
            }
        } catch (err) {
            console.error("validateEmail error:", err);
            setError(emailInput, emailStatus, "Could not validate email. Please try again.");
            state.emailOk = false;
        }

        syncSubmitBtn();
    }

    emailInput.addEventListener("input", () => {
        clearTimeout(emailDebounce);
        state.emailOk = false;
        syncSubmitBtn();
        emailDebounce = window.setTimeout(() => validateEmail(emailInput.value), 500);
    });

    // ── Congregation selector ───────────────────────────────────────────────

    /**
     * React to the congregation dropdown changing.
     * - "yes|CongName, State" → assigned; populate hidden field, hide visiting block
     * - "no"                  → visiting; show visiting inputs, clear hidden field
     * - "unknown" / ""        → unknown; hide visiting block, clear hidden field
     */
    function onCongChange() {
        const val = congSelect.value;

        if (val.startsWith("yes|")) {
            // Assigned to a local congregation
            const congName = val.slice(4); // everything after "yes|"
            congregationHid.value = congName;
            // Overwrite name attr so server sees congAssigned=yes
            congSelect.name = "congAssigned";
            visitingFields.classList.add("d-none");
        } else if (val === "no") {
            congregationHid.value = "";
            visitingFields.classList.remove("d-none");
        } else {
            // "unknown" or blank
            congregationHid.value = "";
            visitingFields.classList.add("d-none");
        }
    }

    congSelect.addEventListener("change", onCongChange);
    // Run once on load to reflect sticky-repopulated state
    onCongChange();

    // ── Auto-validate pre-filled fields (e.g. from Decently Import query params) ──
    if (emailInput.value.trim()) {
        emailDebounce = window.setTimeout(() => validateEmail(emailInput.value), 100);
    }
    if (phoneInput.value.trim()) {
        // Normalise the pre-filled value through the mask first
        phoneInput.value = maskPhone(phoneInput.value);
        phoneDebounce = window.setTimeout(() => validatePhone(phoneInput.value), 200);
    }

    // ── Duplicate modal helpers ─────────────────────────────────────────────

    /**
     * CSS class for a registration_status badge.
     * @param {string} status
     * @returns {string}
     */
    function statusBadge(status) {
        return { completed: "bg-success", draft: "bg-warning text-dark", archived: "bg-secondary" }[status] || "bg-secondary";
    }

    /**
     * Human-readable label for a matchReason.
     * @param {string} reason
     * @returns {string}
     */
    function matchLabel(reason) {
        return { email: "Email match", phone: "Phone match", name: "Name match" }[reason] || reason;
    }

    /**
     * Build and inject duplicate match cards into the modal.
     * @param {Array<{id:number,firstName:string,lastName:string,suffix:string,
     *   email:string,phone:string,registration_status:string,role:string,matchReason:string}>} duplicates
     */
    function renderDuplicates(duplicates) {
        dupList.innerHTML = duplicates.map(v => {
            const parts = [v.lastName, v.suffix].filter(Boolean).join(" ");
            const name  = v.firstName ? `${parts}, ${v.firstName}` : parts || "—";
            return `
                <div class="card mb-2 border-warning">
                    <div class="card-body py-2 px-3 d-flex flex-wrap align-items-center justify-content-between gap-2">
                        <div>
                            <strong>${name}</strong>
                            <span class="badge ${statusBadge(v.registration_status)} ms-2">${v.registration_status}</span>
                            <span class="badge bg-info text-dark ms-1">${matchLabel(v.matchReason)}</span>
                            <div class="text-muted small mt-1">
                                ${v.email ? `<i class="fa-solid fa-envelope me-1"></i>${v.email}` : ""}
                                ${v.phone ? `<span class="ms-2"><i class="fa-solid fa-phone me-1"></i>${v.phone}</span>` : ""}
                            </div>
                        </div>
                        <button
                            type="button"
                            class="btn btn-sm btn-outline-primary"
                            onclick="submitSelectVol(${v.id})"
                        >
                            <i class="fa-solid fa-pen-to-square me-1"></i>Edit this volunteer
                        </button>
                    </div>
                </div>`;
        }).join("");
    }

    // ── selectVolEdit helper ────────────────────────────────────────────────

    /**
     * POST to /selectVolEdit to open the edit page pre-populated for a volunteer.
     * @param {number} volunteerId
     */
    window.submitSelectVol = function submitSelectVol(volunteerId) {
        const f         = document.createElement("form");
        f.method        = "POST";
        f.action        = "/selectVolEdit";
        f.style.display = "none";

        const csrfFld   = document.createElement("input");
        csrfFld.type    = "hidden";
        csrfFld.name    = "_csrf";
        csrfFld.value   = csrfToken;

        const idFld     = document.createElement("input");
        idFld.type      = "hidden";
        idFld.name      = "targetUserId";
        idFld.value     = String(volunteerId);

        f.appendChild(csrfFld);
        f.appendChild(idFld);
        document.body.appendChild(f);
        f.submit();
    };

    // ── Form submission (AJAX) ──────────────────────────────────────────────

    let isSubmitting = false;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (isSubmitting) return;

        const firstName = document.getElementById("firstName").value.trim();
        const lastName  = document.getElementById("lastName").value.trim();
        const email     = emailInput.value.trim();
        const phone     = phoneInput.value.trim();

        if (!firstName || !lastName) {
            showAlert("First and last name are required.");
            return;
        }
        if (!state.emailOk) {
            showAlert("Please wait for email validation to complete.");
            return;
        }
        if (!state.phoneOk) {
            showAlert("Please wait for phone validation to complete.");
            return;
        }

        isSubmitting = true;
        submitBtn.disabled = true;
        const originalHTML = submitBtn.innerHTML;
        submitBtn.innerHTML =
            '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Please wait…';
        formAlert.innerHTML = "";

        // Resolve congregation payload
        const congVal  = congSelect.value;
        let congAssigned = "unknown";
        let congregation = "";

        if (congVal.startsWith("yes|")) {
            congAssigned = "yes";
            congregation = congVal.slice(4);
        } else if (congVal === "no") {
            congAssigned = "no";
        } else if (congVal === "unknown") {
            congAssigned = "unknown";
        }

        const suffix                 = document.getElementById("suffix").value.trim();
        const congregationOtherCity  = document.getElementById("congregationOtherCity").value.trim();
        const congregationOtherState = document.getElementById("congregationOtherState").value.trim();
        const congregationOtherLang  = document.getElementById("congregationOtherLang").value.trim();
        const force                  = forceInput.value;

        try {
            const res = await fetch("/oversight/tools/create-volunteer", {
                method:  "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": csrfToken,
                },
                credentials: "include",
                body: JSON.stringify({
                    firstName, lastName, suffix,
                    email, phone,
                    congAssigned, congregation,
                    congregationOtherCity, congregationOtherState, congregationOtherLang,
                    force,
                }),
            });

            const data = await res.json().catch(() => ({}));

            // Server found potential duplicates → show modal
            if (data.duplicates && data.duplicates.length > 0) {
                renderDuplicates(data.duplicates);
                dupModal.show();
                isSubmitting = false;
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalHTML;
                return;
            }

            if (data.success) {
                showAlert(data.message, "success");
                form.reset();
                state.emailOk = false;
                state.phoneOk = false;
                forceInput.value = "false";
                emailInput.classList.remove("is-valid", "is-invalid");
                phoneInput.classList.remove("is-valid", "is-invalid");
                emailStatus.textContent = "";
                phoneStatus.textContent = "";
                congregationHid.value = "";
                visitingFields.classList.add("d-none");
            } else {
                showAlert(data.error || "An error occurred. Please try again.");
            }
        } catch (err) {
            console.error("create-volunteer submit error:", err);
            showAlert("Server error. Please try again.");
        }

        isSubmitting = false;
        submitBtn.disabled = !(state.emailOk && state.phoneOk);
        submitBtn.innerHTML = originalHTML;
    });

    // ── "Create New Anyway" from duplicate modal ────────────────────────────

    forceBtn.addEventListener("click", () => {
        forceInput.value = "true";
        dupModal.hide();
        setTimeout(() => {
            form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
        }, 300);
    });

    // Reset force flag on modal close via Back/X
    document.getElementById("duplicateModal").addEventListener("hidden.bs.modal", () => {
        forceInput.value = "false";
    });

})();
