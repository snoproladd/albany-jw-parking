/**
 * @file magicLinks.js
 * @description Client logic for the Tools "Magic Links" page.
 *
 * Responsibilities:
 *  - Create a magic sign-in link (phase 3d-8g): POST the form, then show
 *    the link and its QR code once (copy and download), and add the new
 *    row to the table without a reload.
 *  - Revoke a magic login token via POST, with a confirm prompt since
 *    the action is immediate and irreversible, then update the row's
 *    status badge and actions in place. Revoking the link still shown in
 *    the result panel clears the panel and says so.
 */

document.addEventListener("DOMContentLoaded", () => {
    const csrfToken =
        document.querySelector('meta[name="csrf-token"]')?.content || "";

    const form = /** @type {HTMLFormElement|null} */ (document.getElementById("mlCreateForm"));
    const createBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById("mlCreateBtn"));
    const errorBox = document.getElementById("mlCreateError");
    const result = document.getElementById("mlResult");
    const qrImg = /** @type {HTMLImageElement|null} */ (document.getElementById("mlQr"));
    const qrDownload = /** @type {HTMLAnchorElement|null} */ (document.getElementById("mlQrDownload"));
    const urlInput = /** @type {HTMLInputElement|null} */ (document.getElementById("mlUrl"));
    const resultName = document.getElementById("mlResultName");
    const copyBtn = document.getElementById("mlCopyBtn");
    const copyStatus = document.getElementById("mlCopyStatus");
    const tableBody = document.getElementById("mlTableBody");
    const tableWrap = document.getElementById("mlTableWrap");
    const emptyMsg = document.getElementById("mlEmpty");
    const revokedNote = document.getElementById("mlRevokedNote");

    /**
     * Id of the link shown in the result panel, or null when none is.
     * @type {string|null}
     */
    let shownId = null;

    /**
     * Hide the result panel and clear the link, QR code and download.
     *
     * @returns {void}
     */
    function clearResult() {
        result?.classList.add("d-none");
        if (urlInput) urlInput.value = "";
        if (qrImg) {
            qrImg.removeAttribute("src");
            qrImg.alt = "";
        }
        if (qrDownload) qrDownload.href = "#";
        if (resultName) resultName.textContent = "";
        if (copyStatus) copyStatus.textContent = "";
        shownId = null;
    }

    /**
     * Show an error above the result panel, or hide it when msg is empty.
     *
     * @param {string} msg
     * @returns {void}
     */
    function showError(msg) {
        if (!errorBox) return;
        errorBox.textContent = msg;
        errorBox.classList.toggle("d-none", !msg);
        if (msg) errorBox.focus();
    }

    /**
     * Build a table row for a newly created link, matching the server-rendered rows.
     *
     * @param {{ id: number, label: string|null, created_at: string, expires_at: string|null,
     *           firstName: string, lastName: string, email: string|null }} t
     * @returns {HTMLTableRowElement}
     */
    function buildRow(t) {
        const row = document.createElement("tr");
        row.dataset.id = String(t.id);

        const account = document.createElement("td");
        const name = document.createElement("div");
        name.className = "fw-semibold";
        name.textContent = `${t.firstName} ${t.lastName}`;
        const email = document.createElement("div");
        email.className = "small text-muted";
        email.textContent = t.email || "—";
        account.append(name, email);

        const label = document.createElement("td");
        label.textContent = t.label || "—";

        const created = document.createElement("td");
        created.className = "small";
        created.textContent = new Date(t.created_at).toLocaleString();

        const used = document.createElement("td");
        used.className = "small";
        used.textContent = "Never";

        const status = document.createElement("td");
        const badge = document.createElement("span");
        badge.className = "badge bg-success";
        badge.textContent = "Active";
        status.append(badge);

        const actions = document.createElement("td");
        actions.className = "text-end";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-outline-danger btn-sm revoke-btn";
        btn.dataset.id = String(t.id);
        btn.innerHTML = '<i class="fa-solid fa-ban me-1"></i>Revoke';
        actions.append(btn);

        row.append(account, label, created, used, status, actions);
        return row;
    }

    /**
     * Submit the create form: POST it, then show the link and QR code once
     * and add the new row to the table.
     *
     * @param {SubmitEvent} evt
     * @returns {Promise<void>}
     */
    async function handleCreate(evt) {
        evt.preventDefault();
        if (!form || !createBtn) return;
        showError("");
        revokedNote?.classList.add("d-none");

        const data = new FormData(form);
        const volunteerId = String(data.get("volunteerId") || "");
        if (!volunteerId) {
            showError("Pick a person.");
            return;
        }

        createBtn.disabled = true;
        try {
            const resp = await fetch("/oversight/tools/magic-links", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": csrfToken,
                },
                body: JSON.stringify({
                    volunteerId: Number(volunteerId),
                    label: String(data.get("label") || ""),
                    expiresOn: String(data.get("expiresOn") || ""),
                }),
            });
            const body = await resp.json().catch(() => ({}));
            if (!resp.ok || !body.success) {
                showError(body.error || "Couldn't create the link.");
                return;
            }

            const who = `${body.token.firstName} ${body.token.lastName}`.trim();
            if (resultName) resultName.textContent = who;
            if (urlInput) urlInput.value = body.url;
            if (qrImg) {
                qrImg.src = body.qrDataUrl;
                qrImg.alt = `QR code for the sign-in link for ${who}`;
            }
            if (qrDownload) {
                qrDownload.href = body.qrDataUrl;
                const slug = (body.token.label || who).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
                qrDownload.download = `magic-link-${slug || body.token.id}.png`;
            }
            if (copyStatus) copyStatus.textContent = "";
            shownId = String(body.token.id);
            result?.classList.remove("d-none");
            result?.focus();

            tableBody?.prepend(buildRow(body.token));
            tableWrap?.classList.remove("d-none");
            emptyMsg?.classList.add("d-none");
            form.reset();
        } catch (err) {
            console.error("[magicLinks] Create error:", err);
            showError("Couldn't create the link. Please try again.");
        } finally {
            createBtn.disabled = false;
        }
    }

    /**
     * Copy the shown link to the clipboard, falling back to selecting it.
     *
     * @returns {Promise<void>}
     */
    async function handleCopy() {
        if (!urlInput) return;
        try {
            await navigator.clipboard.writeText(urlInput.value);
            if (copyStatus) copyStatus.textContent = "Copied.";
        } catch {
            urlInput.select();
            if (copyStatus) copyStatus.textContent = "Press Ctrl+C to copy.";
        }
    }

    /**
     * Handle a click on a revoke button: confirm, POST, then update
     * the row in place on success.
     *
     * @param {HTMLButtonElement} btn
     * @returns {Promise<void>}
     */
    async function handleRevoke(btn) {
        const id = btn.dataset.id;
        const row = btn.closest("tr[data-id]");

        if (!confirm("Revoke this magic link? This cannot be undone -- the printed QR code will stop working immediately.")) {
            return;
        }

        btn.disabled = true;

        try {
            const resp = await fetch(`/oversight/tools/magic-links/${id}/revoke`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": csrfToken,
                },
            });
            const data = await resp.json();

            if (!resp.ok || !data.success) {
                alert(data.error || "Failed to revoke link.");
                btn.disabled = false;
                return;
            }

            const statusCell = row?.querySelector("td:nth-child(5)");
            if (statusCell) {
                statusCell.innerHTML = '<span class="badge bg-secondary">Revoked</span>';
            }
            const actionsCell = row?.querySelector("td:last-child");
            if (actionsCell) {
                actionsCell.innerHTML = '<span class="text-muted small">—</span>';
            }

            // The link in the result panel no longer works: take it off the screen.
            if (id && id === shownId) {
                clearResult();
                revokedNote?.classList.remove("d-none");
            }
        } catch (err) {
            console.error("[magicLinks] Revoke error:", err);
            alert("Failed to revoke link. Please try again.");
            btn.disabled = false;
        }
    }

    form?.addEventListener("submit", handleCreate);
    copyBtn?.addEventListener("click", handleCopy);

    // Delegated, so rows added after a create can be revoked too.
    tableBody?.addEventListener("click", (evt) => {
        const btn = /** @type {HTMLElement} */ (evt.target).closest(".revoke-btn");
        if (btn instanceof HTMLButtonElement) handleRevoke(btn);
    });
});
