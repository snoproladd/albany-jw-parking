/**
 * @file locationsAndTasks.js
 * @description Client logic for the Locations & Tasks management page.
 *
 * Responsibilities:
 *  - Show/hide the add/edit form panel.
 *  - Populate form fields when editing an existing record.
 *  - Toggle location-specific fields (address, lat/lng, maps URL)
 *    based on the selected type.
 *  - POST (create) and PUT (update) via JSON AJAX.
 *  - Reload the page after a successful save so the server-rendered
 *    tables stay in sync without a client-side DOM diffing layer.
 */

document.addEventListener("DOMContentLoaded", () => {
  // ── DOM refs ────────────────────────────────────────────────────────
  const csrfToken =
    document.querySelector('meta[name="csrf-token"]')?.content || "";
  const formPanel = document.getElementById("formPanel");
  const formTitle = document.getElementById("formPanelTitle");
  const formStatus = document.getElementById("formStatus");
  const editIdInput = document.getElementById("editId");

  const fieldName = document.getElementById("fieldName");
  const fieldType = document.getElementById("fieldType");
  const fieldCapacity = document.getElementById("fieldCapacity");
  const fieldActive = document.getElementById("fieldActive");
  const fieldDescription = document.getElementById("fieldDescription");
  const fieldAddress = document.getElementById("fieldAddress");
  const fieldMapsUrl = document.getElementById("fieldMapsUrl");
  const fieldLat = document.getElementById("fieldLat");
  const fieldLng = document.getElementById("fieldLng");
  const mapsPreviewBtn = document.getElementById("mapsPreviewBtn");
  const activeToggleWrap = document.getElementById("activeToggleWrap");

  const addressWrap = document.getElementById("addressWrap");
  const mapsUrlWrap = document.getElementById("mapsUrlWrap");
  const latWrap = document.getElementById("latWrap");
  const lngWrap = document.getElementById("lngWrap");

  const addBtn = document.getElementById("addBtn");
  const saveBtn = document.getElementById("saveBtn");
  const cancelBtn = document.getElementById("cancelBtn");
  const formCloseBtn = document.getElementById("formCloseBtn");

  // ── Row data store (populated from EJS via inline JSON below) ───────
  /** @type {Record<number, object>} id → row object */
  const rowData = {};

  // Collect row data from the rendered tables
  document.querySelectorAll("tr[data-id]").forEach((tr) => {
    const id = Number(tr.dataset.id);
    // Read data attributes set by the EJS render pass
    rowData[id] = {
      id,
      name:
        tr.querySelector("td:first-child strong")?.textContent?.trim() || "",
      description: tr.dataset.description || "",
      capacity: tr.dataset.capacity || "",
      address: tr.dataset.address || "",
      lat: tr.dataset.lat || "",
      lng: tr.dataset.lng || "",
      maps_url: tr.dataset.mapsUrl || "",
      type: tr.dataset.type || "location",
      active: tr.dataset.active !== "false",
    };
  });

  // ── Helpers ──────────────────────────────────────────────────────────

  /**
   * Show a status alert inside the form panel.
   * @param {string} msg
   * @param {'danger'|'success'|'warning'} [type]
   */
  function showFormAlert(msg, type = "danger") {
    const icon = type === "success" ? "circle-check" : "triangle-exclamation";
    formStatus.innerHTML = `
            <div class="alert alert-${type} alert-dismissible fade show py-2" role="alert">
                <i class="fa-solid fa-${icon} me-2"></i>${msg}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>`;
  }

  /**
   * Show or hide the location-specific fields based on the current type selection.
   * Tasks don't have address / lat / lng / maps fields.
   * @returns {void}
   */
  function syncLocationFields() {
    const isLocation = fieldType.value === "location";
    [addressWrap, mapsUrlWrap, latWrap, lngWrap].forEach((el) => {
      el.classList.toggle("d-none", !isLocation);
    });
  }

  /**
   * Reset the form to a clean blank state.
   * @returns {void}
   */
  function resetForm() {
    editIdInput.value = "";
    fieldName.value = "";
    fieldType.value = "location";
    fieldCapacity.value = "";
    fieldActive.checked = true;
    fieldDescription.value = "";
    fieldAddress.value = "";
    fieldMapsUrl.value = "";
    fieldLat.value = "";
    fieldLng.value = "";
    mapsPreviewBtn.disabled = true;
    formStatus.innerHTML = "";
    syncLocationFields();
  }

  /**
   * Open the form panel in add mode.
   * @returns {void}
   */
  function openAddForm() {
    resetForm();
    // Hide the active toggle in create mode — new records are always active
    activeToggleWrap.classList.add("d-none");
    formTitle.textContent = "Add Location or Task";
    formPanel.classList.remove("d-none");
    fieldName.focus();
    formPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /**
   * Open the form panel pre-populated for editing a row.
   * Falls back to reading from DOM data attributes if the row
   * was added dynamically after page load.
   *
   * @param {number} id
   * @returns {void}
   */
  function openEditForm(id) {
    const row = rowData[id];
    if (!row) {
      showFormAlert("Row data not found — try refreshing the page.");
      return;
    }

    resetForm();
    activeToggleWrap.classList.remove("d-none");

    editIdInput.value = id;
    fieldName.value = row.name || "";
    fieldType.value = row.type || "location";
    fieldCapacity.value = row.capacity || "";
    fieldActive.checked = row.active !== false;
    fieldDescription.value = row.description || "";
    fieldAddress.value = row.address || "";
    fieldMapsUrl.value = row.maps_url || "";
    fieldLat.value = row.lat || "";
    fieldLng.value = row.lng || "";

    mapsPreviewBtn.disabled = !row.maps_url;
    formTitle.textContent = `Edit — ${row.name}`;
    syncLocationFields();

    formPanel.classList.remove("d-none");
    formPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** Close and reset the form panel. @returns {void} */
  function closeForm() {
    formPanel.classList.add("d-none");
    resetForm();
  }

  // ── Event wiring ─────────────────────────────────────────────────────

  addBtn.addEventListener("click", openAddForm);
  cancelBtn.addEventListener("click", closeForm);
  formCloseBtn.addEventListener("click", closeForm);
  fieldType.addEventListener("change", syncLocationFields);

  // Enable / disable the maps preview button live
  fieldMapsUrl.addEventListener("input", () => {
    mapsPreviewBtn.disabled = !fieldMapsUrl.value.trim();
  });

  // Open Google Maps URL in a new tab
  mapsPreviewBtn.addEventListener("click", () => {
    const url = fieldMapsUrl.value.trim();
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  });

  // Edit buttons on rendered rows
  document.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => openEditForm(Number(btn.dataset.id)));
  });

  // ── Save handler ─────────────────────────────────────────────────────

  saveBtn.addEventListener("click", async () => {
    formStatus.innerHTML = "";

    const name = fieldName.value.trim();
    if (!name) {
      showFormAlert("Name is required.");
      fieldName.focus();
      return;
    }

    const id = editIdInput.value ? Number(editIdInput.value) : null;
    const isEdit = id !== null;
    const year = Number(
      document.getElementById("yearPicker")?.value || new Date().getFullYear(),
    );

    const payload = {
      name,
      type: fieldType.value,
      description: fieldDescription.value.trim() || null,
      capacity: fieldCapacity.value !== "" ? Number(fieldCapacity.value) : null,
      address: fieldAddress.value.trim() || null,
      lat: fieldLat.value !== "" ? Number(fieldLat.value) : null,
      lng: fieldLng.value !== "" ? Number(fieldLng.value) : null,
      maps_url: fieldMapsUrl.value.trim() || null,
      active: fieldActive.checked,
      ...(isEdit ? {} : { year }),
    };

    saveBtn.disabled = true;
    const origHtml = saveBtn.innerHTML;
    saveBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Saving…`;

    try {
      const url = isEdit
        ? `/oversight/tools/locationsAndTasks/${id}`
        : "/oversight/tools/locationsAndTasks";
      const method = isEdit ? "PUT" : "POST";

      const resp = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || !data.success) {
        showFormAlert(data.error || "Failed to save.");
        saveBtn.disabled = false;
        saveBtn.innerHTML = origHtml;
        return;
      }

      // Reload to get fresh server-rendered tables
      window.location.reload();
    } catch (err) {
      console.error("[locationsAndTasks] save error:", err);
      showFormAlert("Network error — please try again.");
      saveBtn.disabled = false;
      saveBtn.innerHTML = origHtml;
    }
  });

  // ── Initial state ────────────────────────────────────────────────────
  syncLocationFields();
});
