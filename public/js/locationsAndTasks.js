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
 *  - Expand/collapse sub-location panels per location row:
 *    classification selector, sub-location CRUD, inline type creation.
 */

document.addEventListener("DOMContentLoaded", () => {
  // Submit the year-picker form on change so no inline onchange is needed.
  const yearPicker = document.getElementById("yearPicker");
  yearPicker?.addEventListener("change", () => yearPicker.closest("form").submit());

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
  /** @type {Record<number, object>} id => row object */
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
    // Hide the active toggle in create mode -- new records are always active
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
      showFormAlert("Row data not found -- try refreshing the page.");
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
    formTitle.textContent = `Edit -- ${row.name}`;
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
    saveBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Saving...`;

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
      showFormAlert("Network error -- please try again.");
      saveBtn.disabled = false;
      saveBtn.innerHTML = origHtml;
    }
  });

  // ── Initial state ────────────────────────────────────────────────────
  syncLocationFields();

  // ── Sub-location & classification expansion ───────────────────────────

  /**
   * Escapes HTML special characters to prevent XSS in innerHTML strings.
   * @param {string | null | undefined} str
   * @returns {string}
   */
  function escHtml(str) {
    return (str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** @type {{ id: number, display_name: string, parent_id: number|null }[] | null} */
  let cachedClassifications = null;

  /** @type {{ id: number, display_name: string, parent_id: number|null }[] | null} */
  let cachedSubTypes = null;

  /**
   * Fetch and cache location classification options.
   * @returns {Promise<{ id: number, display_name: string, parent_id: number|null }[]>}
   */
  async function fetchClassifications() {
    if (cachedClassifications) return cachedClassifications;
    const res  = await fetch("/api/system-variables/location_classification");
    const data = await res.json();
    cachedClassifications = data.variables || [];
    return cachedClassifications;
  }

  /**
   * Fetch and cache sub-location type options.
   * @returns {Promise<{ id: number, display_name: string, parent_id: number|null }[]>}
   */
  async function fetchSubTypes() {
    if (cachedSubTypes) return cachedSubTypes;
    const res  = await fetch("/api/system-variables/location_sub_type");
    const data = await res.json();
    cachedSubTypes = data.variables || [];
    return cachedSubTypes;
  }

  /**
   * Build <option> HTML for the sub-type dropdown, filtered to types whose
   * parent_id matches the location's classification (or has no parent restriction).
   * @param {{ id: number, display_name: string, parent_id: number|null }[]} types
   * @param {number | null} classificationId  Current classification of the location.
   * @param {number | null} selectedId        Currently selected sub_type_id.
   * @returns {string}
   */
  function subTypeOptions(types, classificationId, selectedId) {
    const relevant = types.filter(
      (t) => t.parent_id == null || t.parent_id === classificationId
    );
    const opts = relevant.map((t) =>
      `<option value="${t.id}" ${t.id === selectedId ? "selected" : ""}>${escHtml(t.display_name)}</option>`
    ).join("");
    return `<option value=""${selectedId == null ? " selected" : ""}>(No type)</option>${opts}`;
  }

  // Track which rows have been initialised to avoid double-loading.
  const initialisedPanels = new Set();

  /**
   * Toggle the expand/collapse state of a location's sub-location panel.
   * Initialises the panel on first open.
   * @param {HTMLButtonElement} btn  The expand chevron button.
   * @returns {Promise<void>}
   */
  async function togglePanel(btn) {
    const locationId = Number(btn.dataset.id);
    const row        = document.getElementById(`subloc-row-${locationId}`);
    if (!row) return;

    const isOpen = btn.getAttribute("aria-expanded") === "true";

    if (isOpen) {
      row.classList.add("d-none");
      btn.setAttribute("aria-expanded", "false");
      btn.querySelector(".loc-chevron")?.classList.remove("loc-chevron--open");
    } else {
      row.classList.remove("d-none");
      btn.setAttribute("aria-expanded", "true");
      btn.querySelector(".loc-chevron")?.classList.add("loc-chevron--open");
      if (!initialisedPanels.has(locationId)) {
        initialisedPanels.add(locationId);
        await initPanel(locationId, row);
      }
    }
  }

  /**
   * Initialise the classification select and sub-location list for a panel.
   * Called once per locationId on first open.
   * @param {number}      locationId
   * @param {HTMLElement} panelRow   The <tr> that wraps the panel.
   * @returns {Promise<void>}
   */
  async function initPanel(locationId, panelRow) {
    const [classifications, subTypes] = await Promise.all([
      fetchClassifications(),
      fetchSubTypes(),
    ]);

    // Classification select
    const classSelect = panelRow.querySelector(".loc-classification-select");
    if (classSelect instanceof HTMLSelectElement) {
      const currentId = classSelect.dataset.current
        ? Number(classSelect.dataset.current)
        : null;
      const opts = classifications.map((c) =>
        `<option value="${c.id}" ${c.id === currentId ? "selected" : ""}>${escHtml(c.display_name)}</option>`
      ).join("");
      classSelect.innerHTML =
        `<option value=""${currentId == null ? " selected" : ""}>(No classification)</option>${opts}`;

      classSelect.addEventListener("change", () =>
        saveClassification(
          locationId,
          classSelect.value ? Number(classSelect.value) : null,
          panelRow
        )
      );
    }

    // Sub-location list
    await loadSubLocations(locationId, panelRow, subTypes);

    // Add-form type dropdown and new-type parent dropdown
    populateAddTypeSelect(panelRow, subTypes, null);
    populateNewTypeParentSelect(panelRow, classifications);
  }

  /**
   * Persist a classification change and update the badge in the main table row.
   * @param {number}      locationId
   * @param {number|null} classificationId
   * @param {HTMLElement} panelRow
   * @returns {Promise<void>}
   */
  async function saveClassification(locationId, classificationId, panelRow) {
    try {
      const res = await fetch(`/api/locations/${locationId}/classification`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ classificationId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Update the classification badge in the main table row.
      const badgeEl = document.querySelector(
        `.loc-classification-badge[data-location-id="${locationId}"]`
      );
      if (badgeEl) {
        const selected = cachedClassifications?.find((c) => c.id === classificationId);
        if (selected) {
          badgeEl.textContent = selected.display_name;
          badgeEl.className   = "badge loc-classification-badge";
        } else {
          badgeEl.textContent = "\u2014";
          badgeEl.className   = "text-muted small loc-classification-badge";
        }
        badgeEl.setAttribute("data-location-id", String(locationId));
      }

      // Re-filter the add-form type dropdown for the new classification.
      const subTypes = await fetchSubTypes();
      populateAddTypeSelect(panelRow, subTypes, classificationId);
    } catch (err) {
      console.error("[locationsAndTasks] saveClassification error:", err);
    }
  }

  /**
   * Fetch and render the sub-location list for a location panel.
   * @param {number}      locationId
   * @param {HTMLElement} panelRow
   * @param {{ id: number, display_name: string, parent_id: number|null }[]} subTypes
   * @returns {Promise<void>}
   */
  async function loadSubLocations(locationId, panelRow, subTypes) {
    const listEl = document.getElementById(`subloc-list-${locationId}`);
    if (!listEl) return;
    try {
      const res  = await fetch(`/api/locations/${locationId}/sub-locations`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      renderSubLocationList(locationId, panelRow, listEl, data.subLocations, subTypes);
    } catch (err) {
      listEl.innerHTML =
        `<p class="text-danger small px-3 py-2">Failed to load: ${escHtml(err.message)}</p>`;
    }
  }

  /**
   * Render sub-location rows inside the list container and wire their handlers.
   * @param {number}      locationId
   * @param {HTMLElement} panelRow
   * @param {HTMLElement} listEl
   * @param {Array}       items
   * @param {Array}       subTypes
   * @returns {void}
   */
  function renderSubLocationList(locationId, panelRow, listEl, items, subTypes) {
    if (!items.length) {
      listEl.innerHTML =
        '<p class="text-muted small px-3 py-2 mb-0">No entrances or sections yet. Click Add to create one.</p>';
      return;
    }

    listEl.innerHTML = `
      <table class="table table-sm loc-subloc-table mb-0">
        <tbody>
          ${items.map((s) => `
            <tr data-subloc-id="${s.id}" class="${s.active ? "" : "text-muted"}">
              <td class="loc-subloc-name">${escHtml(s.name)}</td>
              <td>
                ${s.sub_type_name
                  ? `<span class="badge loc-type-badge">${escHtml(s.sub_type_name)}</span>`
                  : '<span class="text-muted">\u2014</span>'}
              </td>
              <td>
                <button type="button"
                        class="btn btn-xs ${s.active ? "btn-outline-success" : "btn-outline-secondary"} loc-subloc-active-btn"
                        data-id="${s.id}" data-active="${s.active}"
                        data-location-id="${locationId}">
                  ${s.active ? "Active" : "Inactive"}
                </button>
              </td>
              <td class="text-end">
                <button type="button"
                        class="btn btn-xs btn-outline-danger loc-subloc-delete-btn"
                        data-id="${s.id}"
                        data-name="${escHtml(s.name)}"
                        data-location-id="${locationId}">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </td>
            </tr>`
          ).join("")}
        </tbody>
      </table>`;

    // Wire active toggle buttons.
    listEl.querySelectorAll(".loc-subloc-active-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id       = Number(btn.dataset.id);
        const isActive = btn.dataset.active === "true";
        const name     = btn.closest("tr")?.querySelector(".loc-subloc-name")?.textContent?.trim() ?? "";
        try {
          const res = await fetch(`/api/locations/sub-locations/${id}`, {
            method:  "PUT",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ name, subTypeId: null, displayOrder: 0, active: !isActive }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const fresh = await fetchSubTypes();
          await loadSubLocations(locationId, panelRow, fresh);
        } catch (err) {
          console.error("[locationsAndTasks] toggleActive error:", err);
        }
      });
    });

    // Wire delete buttons.
    listEl.querySelectorAll(".loc-subloc-delete-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm(
          `Delete "${btn.dataset.name}"? Count data that referenced it will be preserved but lose this label.`
        )) return;
        try {
          const res = await fetch(`/api/locations/sub-locations/${btn.dataset.id}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const fresh = await fetchSubTypes();
          await loadSubLocations(locationId, panelRow, fresh);
        } catch (err) {
          console.error("[locationsAndTasks] delete error:", err);
        }
      });
    });
  }

  /**
   * Populate the type <select> in the add-sub-location form.
   * Appends a sentinel option for inline type creation.
   * @param {HTMLElement} panelRow
   * @param {Array}       subTypes
   * @param {number|null} classificationId
   * @returns {void}
   */
  function populateAddTypeSelect(panelRow, subTypes, classificationId) {
    panelRow.querySelectorAll(".loc-add-type").forEach((sel) => {
      sel.innerHTML = subTypeOptions(subTypes, classificationId, null);
      const addOpt       = document.createElement("option");
      addOpt.value       = "__new__";
      addOpt.textContent = "+ Add new type\u2026";
      sel.appendChild(addOpt);
    });
  }

  /**
   * Populate the "Applies to" <select> inside the inline new-type form.
   * @param {HTMLElement} panelRow
   * @param {Array}       classifications
   * @returns {void}
   */
  function populateNewTypeParentSelect(panelRow, classifications) {
    panelRow.querySelectorAll(".loc-new-type-parent").forEach((sel) => {
      sel.innerHTML =
        '<option value="">(All classifications)</option>' +
        classifications.map((c) =>
          `<option value="${c.id}">${escHtml(c.display_name)}</option>`
        ).join("");
    });
  }

  // Wire expand chevron buttons.
  document.querySelectorAll(".loc-expand-btn").forEach((btn) => {
    btn.addEventListener("click", () => togglePanel(btn));
  });

  // Wire "Add" sub-location buttons (show/hide the add form).
  document.querySelectorAll(".loc-add-subloc-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const locationId = btn.dataset.locationId;
      const addForm    = document.getElementById(`subloc-add-${locationId}`);
      addForm?.classList.toggle("d-none");
      addForm?.querySelector(".loc-add-name")?.focus();
    });
  });

  // Wire add-sub-location Save buttons.
  document.querySelectorAll(".loc-add-save-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const locationId = Number(btn.dataset.locationId);
      const addForm    = document.getElementById(`subloc-add-${locationId}`);
      if (!addForm) return;

      const nameInput  = /** @type {HTMLInputElement} */  (addForm.querySelector(".loc-add-name"));
      const typeSelect = /** @type {HTMLSelectElement} */ (addForm.querySelector(".loc-add-type"));
      const name       = nameInput?.value.trim() ?? "";
      if (!name) { nameInput?.focus(); return; }

      // "Add new type" sentinel -- show the inline type form instead.
      if (typeSelect?.value === "__new__") {
        const newTypeForm = document.getElementById(`new-type-form-${locationId}`);
        newTypeForm?.classList.remove("d-none");
        newTypeForm?.querySelector(".loc-new-type-name")?.focus();
        return;
      }

      const subTypeId = typeSelect?.value ? Number(typeSelect.value) : null;

      try {
        const res = await fetch(`/api/locations/${locationId}/sub-locations`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ name, subTypeId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

        // Reset and hide the add form.
        if (nameInput)  nameInput.value  = "";
        if (typeSelect) typeSelect.value = "";
        addForm.classList.add("d-none");

        // Reload sub-location list.
        const panelRow = document.getElementById(`subloc-row-${locationId}`);
        if (panelRow) {
          const subTypes = await fetchSubTypes();
          await loadSubLocations(locationId, panelRow, subTypes);
        }
      } catch (err) {
        console.error("[locationsAndTasks] addSubLocation error:", err);
        alert(`Failed to add: ${err.message}`);
      }
    });
  });

  // Wire add-sub-location Cancel buttons.
  document.querySelectorAll(".loc-add-cancel-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest(".loc-subloc-add-form")?.classList.add("d-none");
    });
  });

  // Wire inline new-type Save buttons.
  document.querySelectorAll(".loc-new-type-save-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const locationId  = Number(btn.dataset.locationId);
      const newTypeForm = document.getElementById(`new-type-form-${locationId}`);
      const addForm     = document.getElementById(`subloc-add-${locationId}`);
      if (!newTypeForm) return;

      const nameInput = /** @type {HTMLInputElement} */  (newTypeForm.querySelector(".loc-new-type-name"));
      const parentSel = /** @type {HTMLSelectElement} */ (newTypeForm.querySelector(".loc-new-type-parent"));
      const typeName  = nameInput?.value.trim() ?? "";
      if (!typeName) { nameInput?.focus(); return; }

      const parentId = parentSel?.value ? Number(parentSel.value) : null;

      try {
        const res = await fetch("/api/system-variables", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            category:    "location_sub_type",
            displayName: typeName,
            parentId,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

        // Bust the sub-type cache so all dropdowns pick up the new entry.
        cachedSubTypes = null;
        const freshTypes = await fetchSubTypes();

        // Get the current classification for this location to filter types correctly.
        const classSelect = document.querySelector(
          `.loc-classification-select[data-location-id="${locationId}"]`
        );
        const currentClassId =
          classSelect instanceof HTMLSelectElement && classSelect.value
            ? Number(classSelect.value)
            : null;

        // Refresh the add-form type dropdown and auto-select the new type.
        if (addForm) {
          const panelRow = document.getElementById(`subloc-row-${locationId}`);
          if (panelRow) populateAddTypeSelect(panelRow, freshTypes, currentClassId);
          const typeSelect = /** @type {HTMLSelectElement} */ (addForm.querySelector(".loc-add-type"));
          if (typeSelect) typeSelect.value = String(data.id);
        }

        // Hide and reset the new-type form.
        newTypeForm.classList.add("d-none");
        if (nameInput) nameInput.value = "";
        if (parentSel) parentSel.value = "";
      } catch (err) {
        console.error("[locationsAndTasks] createSubType error:", err);
        alert(`Failed to create type: ${err.message}`);
      }
    });
  });

  // Wire inline new-type Cancel buttons.
  document.querySelectorAll(".loc-new-type-cancel-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest(".loc-new-type-form")?.classList.add("d-none");
    });
  });
});
