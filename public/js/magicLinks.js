/**
 * @file magicLinks.js
 * @description Client logic for the Oversight Tools "Magic Links" page.
 *
 * Responsibilities:
 *  - Revoke a magic login token via POST, with a confirm prompt since
 *    the action is immediate and irreversible.
 *  - Update the row's status badge and disable the button in place
 *    on success, avoiding a full page reload.
 */

document.addEventListener("DOMContentLoaded", () => {
    const csrfToken =
        document.querySelector('meta[name="csrf-token"]')?.content || "";

    /**
     * Handle a click on a revoke button: confirm, POST, then update
     * the row in place on success.
     *
     * @param {MouseEvent} evt
     * @returns {Promise<void>}
     */
    async function handleRevokeClick(evt) {
        const btn = evt.currentTarget;
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
        } catch (err) {
            console.error("[magicLinks] Revoke error:", err);
            alert("Failed to revoke link. Please try again.");
            btn.disabled = false;
        }
    }

    document.querySelectorAll(".revoke-btn").forEach((btn) => {
        btn.addEventListener("click", handleRevokeClick);
    });
});
