/**
 * @file scheduleViolationsPanel.js
 * @description Schedule violations panel for the Master Conflict Grid page.
 *
 * Self-initializing IIFE. Mounts into #svPanelMount (Bootstrap accordion body)
 * and updates #svAccordionMeta (accordion header) with run status.
 *
 * Violations are grouped by severity (critical → high → medium → low → info),
 * each group collapsible. Critical and high start expanded; others start closed.
 *
 * Action buttons per violation type:
 *  - time_overlap:         Remove from ShiftA / Remove from ShiftB
 *  - blackout_violation:   Remove from Shift (the conflicting assignment)
 *  - pre/post_overload:    Remove from Shift (the stored shift_id)
 *
 * After any action: conflict grid is refreshed (window.cgRefresh) and the
 * violation is acknowledged. Panel reloads from server.
 */
(function () {
  "use strict";

  // ── Constants ─────────────────────────────────────────────────────────────
  var SEV_ORDER = ["critical", "high", "medium", "low", "info"];
  var SEV_START_OPEN = {
    critical: true,
    high: true,
    medium: false,
    low: false,
    info: false,
  };

  // ── State ─────────────────────────────────────────────────────────────────
  var _run = null;
  var _violations = [];
  var _rules = [];
  var _loading = false;

  // ── Init ──────────────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", function () {
    var mount = document.getElementById("svPanelMount");
    if (!mount) return;
    document.getElementById("svRunBtn")?.addEventListener("click", function () {
      _load(true);
    });
    _load(false);
  });

  // ── Data ──────────────────────────────────────────────────────────────────
  function _load(force) {
    if (_loading) return;
    _loading = true;
    _setHeaderStatus("loading");

    var fetchUrl = force ? "/api/schedule/analyze" : "/api/schedule/violations";
    var opts = force
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: true }),
        }
      : { method: "GET" };

    fetch(fetchUrl, opts)
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        _run = data.run || null;
        _violations = data.violations || [];
        _rules = data.rules || [];
        _loading = false;
        _render();
        if (force) {
          var collapseEl = document.getElementById("svAccordionBody");
          if (collapseEl && window.bootstrap) {
            bootstrap.Collapse.getOrCreateInstance(collapseEl).show();
          }
        }
      })
      .catch(function (err) {
        console.error("[svPanel] load error:", err);
        _loading = false;
        _setHeaderStatus("error");
      });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function _render() {
    var body = document.getElementById("svPanelMount");
    if (!body) return;

    // Rules section always first.
    body.innerHTML = _buildRulesSection();
    _wireRulesToggle();

    if (!_run) {
      _setHeaderStatus("none");
      return;
    }

    // Partition violations.
    var groups = { critical: [], high: [], medium: [], low: [], info: [] };
    var acknowledged = [];
    var total = _violations.length;

    for (var i = 0; i < _violations.length; i++) {
      var v = _violations[i];
      var sev = v.severity || "info";
      if (v.acknowledged) {
        acknowledged.push(v);
      } else {
        (groups[sev] = groups[sev] || []).push(v);
      }
    }

    // Header meta.
    var counts = {};
    for (var s in groups) {
      counts[s] = groups[s].length;
    }

    var runDate = _run.triggered_at
      ? new Date(_run.triggered_at).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "—";
    var triggeredBy = _run.triggered_by_name
      ? " by " + _esc(_run.triggered_by_name)
      : "";

    var badgeHtml = "";
    if (counts.critical)
      badgeHtml +=
        '<span class="sv-sev-badge sv-sev-critical">' +
        counts.critical +
        " critical</span>";
    if (counts.high)
      badgeHtml +=
        '<span class="sv-sev-badge sv-sev-high">' +
        counts.high +
        " high</span>";
    if (counts.medium)
      badgeHtml +=
        '<span class="sv-sev-badge sv-sev-medium">' +
        counts.medium +
        " medium</span>";
    if (counts.low)
      badgeHtml +=
        '<span class="sv-sev-badge sv-sev-low">' + counts.low + " low</span>";
    if (counts.info)
      badgeHtml +=
        '<span class="sv-sev-badge sv-sev-info">' +
        counts.info +
        " info</span>";

    var meta = document.getElementById("svAccordionMeta");
    if (meta) {
      meta.innerHTML =
        '<span class="sv-meta-text">' +
        runDate +
        triggeredBy +
        "</span>" +
        '<span class="sv-meta-dot">·</span>' +
        '<span class="sv-meta-text">' +
        total +
        " violation" +
        (total !== 1 ? "s" : "") +
        "</span>" +
        (badgeHtml ? '<span class="sv-meta-dot">·</span>' + badgeHtml : "");
    }

    // No unacknowledged violations?
    var anyUnacked = SEV_ORDER.some(function (s) {
      return groups[s] && groups[s].length > 0;
    });
    if (!anyUnacked && acknowledged.length === 0) {
      var emptyEl = document.createElement("div");
      emptyEl.className = "sv-empty";
      emptyEl.innerHTML =
        '<i class="fa-solid fa-circle-check text-success me-1"></i>No violations found.';
      body.appendChild(emptyEl);
      return;
    }

    if (!anyUnacked) {
      var ackedEl = document.createElement("div");
      ackedEl.className = "sv-empty";
      ackedEl.innerHTML =
        '<i class="fa-solid fa-circle-check text-success me-1"></i>All violations acknowledged.';
      body.appendChild(ackedEl);
    } else {
      // Severity groups.
      SEV_ORDER.forEach(function (sev) {
        var rows = groups[sev];
        if (!rows || !rows.length) return;
        body.appendChild(_buildSeverityGroup(sev, rows));
      });
    }

    // Acknowledged footer.
    if (acknowledged.length > 0) {
      var ackToggle = document.createElement("button");
      ackToggle.type = "button";
      ackToggle.className = "sv-ack-toggle";
      ackToggle.innerHTML =
        '<i class="fa-solid fa-chevron-right sv-ack-chevron me-1"></i>' +
        acknowledged.length +
        " acknowledged";
      var ackList = document.createElement("div");
      ackList.className = "sv-ack-list d-none";
      acknowledged.forEach(function (v) {
        ackList.appendChild(_buildViolationRow(v));
      });
      ackToggle.addEventListener("click", function () {
        var hidden = ackList.classList.toggle("d-none");
        ackToggle.querySelector(".sv-ack-chevron").style.transform = hidden
          ? ""
          : "rotate(90deg)";
      });
      body.appendChild(ackToggle);
      body.appendChild(ackList);
    }
  }

  // ── Severity group ────────────────────────────────────────────────────────

  function _buildSeverityGroup(sev, rows) {
    var open = SEV_START_OPEN[sev] !== false;
    var groupId = "svGrp_" + sev;

    var wrap = document.createElement("div");
    wrap.className = "sv-sev-group";

    var hdr = document.createElement("button");
    hdr.type = "button";
    hdr.className = "sv-sev-group-hdr";
    hdr.setAttribute("aria-expanded", open ? "true" : "false");
    hdr.innerHTML =
      '<i class="fa-solid fa-chevron-right sv-sev-grp-chevron me-1' +
      (open ? " sv-sev-grp-chevron--open" : "") +
      '"></i>' +
      '<span class="sv-sev-pill sv-sev-pill--' +
      sev +
      '">' +
      sev.toUpperCase() +
      "</span>" +
      '<span class="sv-sev-grp-count ms-2">' +
      rows.length +
      " violation" +
      (rows.length !== 1 ? "s" : "") +
      "</span>";

    var body = document.createElement("div");
    body.className = "sv-sev-group-body" + (open ? "" : " d-none");
    rows.forEach(function (v) {
      body.appendChild(_buildViolationRow(v));
    });

    hdr.addEventListener("click", function () {
      var hidden = body.classList.toggle("d-none");
      hdr.setAttribute("aria-expanded", hidden ? "false" : "true");
      var chevron = hdr.querySelector(".sv-sev-grp-chevron");
      if (chevron) {
        chevron.classList.toggle("sv-sev-grp-chevron--open", !hidden);
      }
    });

    wrap.appendChild(hdr);
    wrap.appendChild(body);
    return wrap;
  }

  // ── Rules section ─────────────────────────────────────────────────────────

  function _buildRulesSection() {
    if (_rules.length === 0) return "";
    var listHtml = _rules
      .map(function (r) {
        return '<li class="sv-rule-item">' + _esc(r.rule_text) + "</li>";
      })
      .join("");
    return (
      '<div class="sv-rules-section">' +
      '<button type="button" class="sv-rules-toggle" id="svRulesToggle">' +
      '<i class="fa-solid fa-chevron-right sv-rules-chevron me-1"></i>' +
      '<i class="fa-solid fa-list-check me-1 text-primary"></i>' +
      'Active Rules <span class="sv-rules-count">(' +
      _rules.length +
      ")</span>" +
      '<a href="/oversight/tools/schedule-rules" class="sv-rules-manage-link" onclick="event.stopPropagation()">' +
      '<i class="fa-solid fa-arrow-up-right-from-square me-1"></i>Manage' +
      "</a>" +
      "</button>" +
      '<ol class="sv-rules-list d-none" id="svRulesList">' +
      listHtml +
      "</ol>" +
      "</div>"
    );
  }

  function _wireRulesToggle() {
    var toggle = document.getElementById("svRulesToggle");
    var list = document.getElementById("svRulesList");
    if (!toggle || !list) return;
    toggle.addEventListener("click", function () {
      var hidden = list.classList.toggle("d-none");
      var chevron = toggle.querySelector(".sv-rules-chevron");
      if (chevron) chevron.style.transform = hidden ? "" : "rotate(90deg)";
    });
  }

  // ── Violation row ─────────────────────────────────────────────────────────

  function _buildViolationRow(v) {
    var sev = v.severity || "info";
    var conf =
      v.confidence !== null ? Math.round(v.confidence * 100) + "%" : null;
    var typeLabel = _typeLabel(v.violation_type);

    var row = document.createElement("div");
    row.className =
      "sv-row sv-row--" + sev + (v.acknowledged ? " sv-row--acked" : "");
    row.dataset.id = String(v.id);

    // Summary bar (always visible).
    var summary = document.createElement("div");
    summary.className = "sv-row-summary";
    summary.innerHTML =
      '<div class="sv-row-left">' +
      '<span class="sv-type-label">' +
      _esc(typeLabel) +
      "</span>" +
      (v.volunteer_name
        ? '<span class="sv-vol-name">' + _esc(v.volunteer_name) + "</span>"
        : "") +
      (v.day_label
        ? '<span class="sv-day-label">' + _esc(v.day_label) + "</span>"
        : "") +
      "</div>" +
      '<button type="button" class="sv-expand-btn" aria-label="Expand"><i class="fa-solid fa-chevron-down"></i></button>';

    // Detail (collapsed by default).
    var detail = document.createElement("div");
    detail.className = "sv-row-detail d-none";

    // Description.
    var descEl = document.createElement("p");
    descEl.className = "sv-description";
    descEl.textContent = v.description;
    detail.appendChild(descEl);

    // AI suggestion.
    if (v.ai_suggestion) {
      var sugEl = document.createElement("div");
      sugEl.className = "sv-ai-block sv-ai-suggestion";
      sugEl.innerHTML =
        '<i class="fa-solid fa-wand-magic-sparkles me-1"></i>' +
        "<strong>AI" +
        (conf ? " (" + conf + ")" : "") +
        ":</strong> " +
        _esc(v.ai_suggestion);
      detail.appendChild(sugEl);
    }

    // AI question + response + re-analyze + add-as-rule.
    if (v.ai_question) {
      var qBlock = document.createElement("div");
      qBlock.className = "sv-ai-block sv-ai-question";

      var qText = document.createElement("div");
      qText.innerHTML =
        '<i class="fa-solid fa-circle-question me-1"></i><strong>AI question:</strong> ' +
        _esc(v.ai_question);
      qBlock.appendChild(qText);

      var responseInput = document.createElement("textarea");
      responseInput.className = "sv-response-input";
      responseInput.rows = 2;
      responseInput.placeholder = "Your response…";
      responseInput.value = v.overseer_response || "";
      qBlock.appendChild(responseInput);

      var reanalyzeBtn = document.createElement("button");
      reanalyzeBtn.type = "button";
      reanalyzeBtn.className = "sv-reanalyze-btn";
      reanalyzeBtn.innerHTML =
        '<i class="fa-solid fa-rotate me-1"></i>Re-analyze';
      reanalyzeBtn.addEventListener("click", function () {
        _onReanalyze(v.id, responseInput, reanalyzeBtn);
      });

      var addRuleBtn = document.createElement("button");
      addRuleBtn.type = "button";
      addRuleBtn.className =
        "sv-add-rule-btn" + (v.overseer_response ? "" : " d-none");
      addRuleBtn.title =
        "Save as a standing rule and re-analyze similar violations";
      addRuleBtn.innerHTML =
        '<i class="fa-solid fa-list-check me-1"></i>Add as Rule';
      addRuleBtn.addEventListener("click", function () {
        _onAddAsRule(
          v.id,
          v.ai_question,
          responseInput.value,
          addRuleBtn,
          qBlock,
        );
      });

      responseInput.addEventListener("input", function () {
        if (responseInput.value.trim()) addRuleBtn.classList.remove("d-none");
        else addRuleBtn.classList.add("d-none");
      });

      qBlock.appendChild(reanalyzeBtn);
      qBlock.appendChild(addRuleBtn);
      detail.appendChild(qBlock);
    }

    // Actions row (acknowledge + schedule actions).
    var actionsEl = document.createElement("div");
    actionsEl.className = "sv-actions";

    _buildScheduleActions(v, actionsEl);

    if (!v.acknowledged) {
      var ackBtn = document.createElement("button");
      ackBtn.type = "button";
      ackBtn.className = "sv-ack-btn";
      ackBtn.innerHTML = '<i class="fa-solid fa-check me-1"></i>Acknowledge';
      ackBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        _onAcknowledge(v.id);
      });
      actionsEl.appendChild(ackBtn);
    }

    if (actionsEl.children.length) detail.appendChild(actionsEl);

    row.appendChild(summary);
    row.appendChild(detail);

    summary.addEventListener("click", function () {
      var hidden = detail.classList.toggle("d-none");
      var chevron = summary.querySelector(".fa-chevron-down, .fa-chevron-up");
      if (chevron) {
        chevron.classList.toggle("fa-chevron-down", hidden);
        chevron.classList.toggle("fa-chevron-up", !hidden);
      }
    });

    return row;
  }

  /**
   * Append Remove-from-Shift buttons to the actions row for applicable
   * violation types, using shift data from window.cgData when available.
   *
   * @param {object}      v         - Violation row.
   * @param {HTMLElement} container
   */
  function _buildScheduleActions(v, container) {
    if (v.acknowledged) return;

    var shifts = (window.cgData && window.cgData.shifts) || [];

    /**
     * @param {number} shiftId
     * @param {string|null} [labelOverride]
     */
    function addRemoveBtn(shiftId, labelOverride) {
      var sh = shifts.find(function (s) {
        return s.shift_id === shiftId;
      });
      var label = labelOverride || (sh ? sh.shift_label : "Shift #" + shiftId);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sv-action-btn sv-action-btn--remove";
      btn.innerHTML =
        '<i class="fa-solid fa-user-minus me-1"></i>Remove from "' +
        _esc(label) +
        '"';
      btn.addEventListener("click", function () {
        _onRemoveFromShift(v.id, v.volunteer_id, shiftId);
      });
      container.appendChild(btn);
    }

    if (v.violation_type === "time_overlap") {
      if (v.shift_id)   addRemoveBtn(v.shift_id);
      if (v.shift_id_2) addRemoveBtn(v.shift_id_2);
    } else if (
      v.violation_type === "blackout_violation" ||
      v.violation_type === "pre_session_overload" ||
      v.violation_type === "post_session_overload"
    ) {
      if (v.shift_id) addRemoveBtn(v.shift_id);
    }

    // View blackouts — available on any violation tied to a specific volunteer.
    if (v.volunteer_id) {
      var bkBtn = document.createElement("button");
      bkBtn.type      = "button";
      bkBtn.className = "sv-action-btn sv-action-btn--view";
      bkBtn.innerHTML = '<i class="fa-solid fa-calendar-xmark me-1"></i>View Blackouts';
      bkBtn.addEventListener("click", function () {
        if (window.showBlackoutModal) {
          window.showBlackoutModal(v.volunteer_id, v.volunteer_name || "Volunteer");
        }
      });
      container.appendChild(bkBtn);
    }
  }

  // ── Schedule actions ──────────────────────────────────────────────────────

  function _onRemoveFromShift(violationId, volunteerId, shiftId) {
    var shifts = (window.cgData && window.cgData.shifts) || [];
    var sh = shifts.find(function (s) {
      return s.shift_id === shiftId;
    });
    var label = sh ? sh.shift_label : "shift #" + shiftId;

    if (!confirm('Remove this volunteer from "' + label + '"?')) return;

    fetch("/api/conflict-grid/assignment", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volunteerId: volunteerId, shiftId: shiftId }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data.ok) {
          alert("Failed to remove assignment. Please try again.");
          return;
        }
        return fetch(
          "/api/schedule/violations/" + violationId + "/acknowledge",
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
          },
        );
      })
      .then(function () {
        var v = _violations.find(function (x) {
          return x.id === violationId;
        });
        if (v) v.acknowledged = true;
        window.cgRefresh?.();
        _load(false);
      })
      .catch(function (err) {
        console.error("[svPanel] removeFromShift error:", err);
        alert("Network error. Please try again.");
      });
  }

  // ── Existing action handlers ───────────────────────────────────────────────

  function _onAcknowledge(id) {
    fetch("/api/schedule/violations/" + id + "/acknowledge", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
    })
      .then(function (r) {
        if (!r.ok) return;
        var v = _violations.find(function (x) {
          return x.id === id;
        });
        if (v) v.acknowledged = true;
        _render();
      })
      .catch(function (err) {
        console.error("[svPanel] acknowledge error:", err);
      });
  }

  function _onReanalyze(id, textarea, btn) {
    var response = textarea.value.trim();
    if (!response) {
      textarea.focus();
      return;
    }
    btn.disabled = true;
    btn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-1"></span>Analyzing…';
    fetch("/api/schedule/violations/" + id + "/response", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: response }),
    })
      .then(function () {
        return fetch("/api/schedule/violations/" + id + "/reanalyze", {
          method: "POST",
        });
      })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var v = _violations.find(function (x) {
          return x.id === id;
        });
        if (v && data.ok) {
          v.ai_suggestion = data.aiSuggestion;
          v.ai_question = data.aiQuestion;
          v.confidence = data.confidence;
          v.overseer_response = response;
        }
        _render();
      })
      .catch(function (err) {
        console.error("[svPanel] reanalyze error:", err);
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-rotate me-1"></i>Re-analyze';
      });
  }

  function _onAddAsRule(
    violationId,
    aiQuestion,
    responseText,
    triggerBtn,
    qBlock,
  ) {
    if (qBlock.querySelector(".sv-add-rule-form")) return;
    triggerBtn.disabled = true;

    var form = document.createElement("div");
    form.className = "sv-add-rule-form";

    var label = document.createElement("div");
    label.className = "sv-add-rule-label";
    label.innerHTML =
      '<i class="fa-solid fa-list-check me-1"></i>New rule text — edit before saving:';

    var textarea = document.createElement("textarea");
    textarea.className = "sv-response-input";
    textarea.rows = 2;
    textarea.value = responseText.trim();

    var errEl = document.createElement("div");
    errEl.className = "sv-inline-error d-none";

    var btnRow = document.createElement("div");
    btnRow.className = "sv-add-rule-btnrow";

    var saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "sv-reanalyze-btn";
    saveBtn.innerHTML =
      '<i class="fa-solid fa-floppy-disk me-1"></i>Save Rule &amp; Re-analyze Similar';

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "sv-ack-btn";
    cancelBtn.innerHTML = "Cancel";

    btnRow.appendChild(saveBtn);
    btnRow.appendChild(cancelBtn);
    form.appendChild(label);
    form.appendChild(textarea);
    form.appendChild(errEl);
    form.appendChild(btnRow);
    qBlock.appendChild(form);
    textarea.focus();

    cancelBtn.addEventListener("click", function () {
      form.remove();
      triggerBtn.disabled = false;
    });

    saveBtn.addEventListener("click", function () {
      var ruleText = textarea.value.trim();
      if (!ruleText) {
        errEl.textContent = "Rule text cannot be empty.";
        errEl.classList.remove("d-none");
        return;
      }
      saveBtn.disabled = true;
      saveBtn.innerHTML =
        '<span class="spinner-border spinner-border-sm me-1"></span>Saving…';
      errEl.classList.add("d-none");

      var nextOrder =
        _rules.length > 0
          ? Math.max.apply(
              null,
              _rules.map(function (r) {
                return r.sort_order;
              }),
            ) + 10
          : 10;

      fetch("/api/schedule/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleText: ruleText, sortOrder: nextOrder }),
      })
        .then(function (r) {
          if (!r.ok) throw new Error("Rule save failed.");
          return r.json();
        })
        .then(function (data) {
          _rules.push({
            id: data.id,
            rule_text: ruleText,
            sort_order: nextOrder,
            active: true,
          });
          saveBtn.innerHTML =
            '<span class="spinner-border spinner-border-sm me-1"></span>Re-analyzing…';
          return fetch("/api/schedule/violations/reanalyze-by-question", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runId: _run.id, aiQuestion: aiQuestion }),
          });
        })
        .then(function (r) {
          return r.json();
        })
        .then(function () {
          form.remove();
          _load(false);
        })
        .catch(function (err) {
          console.error("[svPanel] addAsRule error:", err);
          errEl.textContent = "Failed. Please try again.";
          errEl.classList.remove("d-none");
          saveBtn.disabled = false;
          saveBtn.innerHTML =
            '<i class="fa-solid fa-floppy-disk me-1"></i>Save Rule &amp; Re-analyze Similar';
          triggerBtn.disabled = false;
        });
    });
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  function _setHeaderStatus(state) {
    var meta = document.getElementById("svAccordionMeta");
    if (!meta) return;
    if (state === "loading")
      meta.innerHTML =
        '<span class="spinner-border spinner-border-sm me-1"></span>Analyzing…';
    else if (state === "error")
      meta.innerHTML =
        '<span class="text-danger">Analysis failed — try again.</span>';
    else if (state === "none")
      meta.innerHTML = '<span class="text-muted">No analysis run yet.</span>';
  }

  function _typeLabel(type) {
    var labels = {
      time_overlap: "Time Overlap",
      blackout_violation: "Blackout Violation",
      pre_session_overload: "Pre-Session Overload",
      post_session_overload: "Post-Session Overload",
      understaffed: "Understaffed Slot",
      daily_load: "Daily Load",
      coverage_gap: "Coverage Gap",
      ai_observation: "AI Observation",
    };
    return labels[type] || type;
  }

  function _esc(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
})();
