/**
 * @fileoverview blackoutTimeline.js
 * Interactive SVG blackout time-range editor for the Albany JW Parking
 * application.
 *
 * Renders a shared time ruler, a switchable session bar, and three stacked
 * independently-editable blackout tracks — one per convention day.  All
 * tracks are always visible regardless of any external day filter.
 *
 * Drag handles snap to session boundaries for the active day, 5-minute
 * grid positions, and the timeline endpoints.  Pointer capture is used so
 * drags remain active when the pointer leaves the SVG.
 *
 * Usage:
 *   import BlackoutTimeline from '/js/blackoutTimeline.js';
 *   const bt = new BlackoutTimeline(containerEl, data, { onSave });
 *
 * @module blackoutTimeline
 */

"use strict";

// ─── Layout constants ─────────────────────────────────────────────────────────

/** Width of the left gutter reserved for day row labels, in px. */
const GUTTER_W = 52;

/** Pixels rendered per minute of timeline time. */
const PX_PER_MIN = 1.4;

/** Timeline left edge — 5:00 AM in minutes from midnight. */
const TIMELINE_START = 300;

/** Timeline right edge — 7:00 PM in minutes from midnight. */
const TIMELINE_END = 1140;

/** Snap grid interval in minutes. */
const SNAP_INTERVAL = 5;

/**
 * Pixel distance within which a named snap point (endpoint or session
 * boundary) activates.  Beyond this threshold the 5-minute grid is used.
 */
const SNAP_THRESHOLD = 6;

/** Visible drag-handle width in px (desktop) — narrow bar style. */
const HANDLE_W = 5;

/** Visible drag-handle height in px (desktop) — taller than the track bar. */
const HANDLE_H = 26;

/** Invisible hit-area padding on each side of the handle (desktop). */
const HANDLE_HIT_PAD = 9;

/** Visible drag-handle width for mobile. */
const HANDLE_W_MOBILE = 8;

/** Visible drag-handle height for mobile. */
const HANDLE_H_MOBILE = 30;

/** Hit-area padding for mobile. */
const HANDLE_HIT_PAD_MOBILE = 10;

/** Minimum blackout range width in minutes — prevents handles crossing. */
const MIN_RANGE_MINS = 5;

// Vertical layout (all in SVG user units / px)
const SESSION_BAR_Y = 4;
const SESSION_BAR_H = 28;
const TRACK_H = 24;
const TRACK_GAP = 5;
const TRACK_Y0 = SESSION_BAR_Y + SESSION_BAR_H + 8; // top of first track

// Ruler geometry
const MAJOR_TICK_H = 12;
const MED_TICK_H = 7;
const MINOR_TICK_H = 4;

// Derived constants computed once at module load
const SVG_CONTENT_W = Math.round((TIMELINE_END - TIMELINE_START) * PX_PER_MIN);
const SVG_W = GUTTER_W + SVG_CONTENT_W;

/** SVG XML namespace. */
const SVG_NS = "http://www.w3.org/2000/svg";

// ─── Module-level geometry helpers ───────────────────────────────────────────

/**
 * Compute the SVG y-top of a zero-indexed track row.
 * @param {number} i Track index (0 = Friday, 1 = Saturday, 2 = Sunday).
 * @returns {number}
 */
const trackTopY = (i) => TRACK_Y0 + i * (TRACK_H + TRACK_GAP);

// Ruler sits below all three tracks
const RULER_Y = trackTopY(3) + 6;
const LABEL_Y = RULER_Y + MAJOR_TICK_H + 14;
const SVG_H = LABEL_Y + 12;

/**
 * Convert minutes from midnight to an SVG x coordinate.
 * @param {number} mins
 * @returns {number}
 */
const minToX = (mins) => GUTTER_W + (mins - TIMELINE_START) * PX_PER_MIN;

/**
 * Convert an SVG x coordinate to minutes from midnight.
 * @param {number} x
 * @returns {number}
 */
const xToMin = (x) => (x - GUTTER_W) / PX_PER_MIN + TIMELINE_START;

/**
 * Clamp v between lo and hi (inclusive).
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ─── Formatting helpers ───────────────────────────────────────────────────────

/**
 * Format minutes from midnight as a 12-hour time string.
 * @param {number} mins
 * @returns {string} e.g. "10:30 AM"
 */
function formatTime(mins) {
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/**
 * Format an integer hour (0–23) as a short ruler label.
 * @param {number} h
 * @returns {string} e.g. "5 AM", "12 PM"
 */
function formatHour(h) {
  return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
}

// ─── SVG helpers ──────────────────────────────────────────────────────────────

/**
 * Create an SVG element and apply an attribute map.
 * @param {string} tag
 * @param {Object.<string, string|number>} [attrs]
 * @returns {SVGElement}
 */
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

/**
 * Apply multiple attributes to an existing SVG element.
 * @param {SVGElement} el
 * @param {Object.<string, string|number>} attrs
 */
function setAttrs(el, attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
}

// ─── BlackoutTimeline ─────────────────────────────────────────────────────────

/**
 * Interactive SVG blackout range editor.
 *
 * Creates all DOM/SVG in the supplied container element.  The container
 * receives the `bt-container` class; call destroy() to undo this.
 */
export default class BlackoutTimeline {
  /** @type {number} Auto-increments to generate unique per-instance IDs. */
  static _instanceCount = 0;

  /**
   * @param {HTMLElement} el
   *   Target container element.
   *
   * @param {Object} data
   * @param {number} data.volunteerId
   * @param {Array<{id:number, label:string, date:string}>} data.days
   *   Convention days in display order (typically Fri/Sat/Sun).
   * @param {Object.<string|number, Array<{label:string, startMin:number, endMin:number, order:number}>>} data.sessions
   *   Session arrays keyed by convention day ID.
   * @param {Array<{id:number, conventionDayId:number, startMins:number, endMins:number, reason?:string}>} data.blackouts
   *   Existing blackout rows loaded from the database.
   *
   * @param {Object}   [options]
   * @param {Function} [options.onSave]
   *   Async callback receiving the serialized blackout array.
   *   When omitted the component POSTs to `/api/blackouts/:volunteerId`.
   * @param {boolean}  [options.readOnly]
   *   Suppress all editing controls when true.
   * @param {boolean}  [options.mobile]
   *   Use larger touch targets and always-visible remove buttons.
   */
  constructor(el, data, options = {}) {
    /** @private */
    this._uid = ++BlackoutTimeline._instanceCount;

    /** @private @type {HTMLElement} */
    this._el = el;

    /** @private */
    this._data = data;

    /** @private */
    this._opts = { readOnly: false, mobile: false, ...options };

    /**
     * Convention day ID of the currently active (session-bar-shown) track.
     * @private @type {number|null}
     */
    this._activeDay = data.days[0]?.id ?? null;

    /**
     * Blackout range objects keyed by convention day ID.
     * @private
     * @type {Object.<number, Array<{id:string, dayId:number, startMins:number, endMins:number}>>}
     */
    this._ranges = {};

    /** @private @type {number} */
    this._nextId = 1;

    /**
     * ID of a newly-added range that has not yet been saved.
     * While set, the + buttons are locked to force save before adding another.
     * @private @type {string|null}
     */
    this._pendingRangeId = null;

    /**
     * Active drag state, or null when idle.
     * @private
     * @type {{ rangeId:string, handle:'start'|'end', pointerId:number }|null}
     */
    this._drag = null;

    // Overlay SVG element refs — assigned in _buildOverlay()
    /** @private @type {SVGLineElement|null} */ this._cursorLine = null;
    /** @private @type {SVGLineElement|null} */ this._glowTick = null;
    /** @private @type {SVGLineElement|null} */ this._sessionBndGlow = null;
    /** @private @type {SVGRectElement|null} */ this._tooltipBg = null;
    /** @private @type {SVGTextElement|null} */ this._tooltipText = null;

    // Key group refs — assigned in _build()
    /** @private @type {SVGSVGElement|null} */ this._svg = null;
    /** @private @type {HTMLButtonElement|null} */ this._saveBtn = null;
    /** @private @type {HTMLElement|null} */ this._headerEl = null;
    /** @private @type {SVGGElement|null} */ this._sessionBarGrp = null;
    /** @private @type {SVGGElement|null} */ this._rangesGrp = null;
    /** @private @type {SVGGElement|null} */ this._overlayGrp = null;
    /** @private @type {string} */ this._glowFilterUrl = "";

    /**
     * Track label text elements, parallel to data.days.
     * @private @type {Array<{dayId:number, el:SVGTextElement}>}
     */
    this._trackLabels = [];

    this._initRanges();
    this._build();
    this._bindEvents();
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  /**
   * Populate internal range state from `data.blackouts`.
   * Database sentinel values 0 and 1440 (full-day) are clamped to the
   * timeline edges for display; they will be saved as their clamped values
   * on the next save.
   * @private
   */
  _initRanges() {
    for (const day of this._data.days) {
      this._ranges[day.id] = [];
    }

    for (const b of this._data.blackouts) {
      if (!this._ranges[b.conventionDayId]) continue;

      const startMins = clamp(
        b.startMins,
        TIMELINE_START,
        TIMELINE_END - MIN_RANGE_MINS,
      );
      const endMins = clamp(
        b.endMins,
        startMins + MIN_RANGE_MINS,
        TIMELINE_END,
      );

      this._ranges[b.conventionDayId].push({
        id: `bt${this._uid}-r${this._nextId++}`,
        dayId: b.conventionDayId,
        startMins,
        endMins,
      });
    }
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  /**
   * Build the full component DOM and SVG into the container element.
   * @private
   */
  _build() {
    this._el.classList.add("bt-container");
    this._el.appendChild(this._buildHeader());

    const wrapper = document.createElement("div");
    wrapper.className = "bt-scroll-wrapper";

    const svg = svgEl("svg", {
      class: "bt-svg",
      width: SVG_W,
      height: SVG_H,
      viewBox: `0 0 ${SVG_W} ${SVG_H}`,
    });
    this._svg = svg;

    // ── Defs: per-instance glow filter ────────────────────────────────
    const filterId = `bt-glow-${this._uid}`;
    this._glowFilterUrl = `url(#${filterId})`;

    const defs = svgEl("defs");
    const filter = svgEl("filter", {
      id: filterId,
      x: "-80%",
      y: "-80%",
      width: "260%",
      height: "260%",
    });
    // Two-pass glow: tight inner + wide outer, both layered under source
    const blur1 = svgEl("feGaussianBlur", {
      in: "SourceGraphic",
      stdDeviation: "2.5",
      result: "glow1",
    });
    const blur2 = svgEl("feGaussianBlur", {
      in: "SourceGraphic",
      stdDeviation: "6",
      result: "glow2",
    });
    const merge = svgEl("feMerge");
    merge.appendChild(svgEl("feMergeNode", { in: "glow2" }));
    merge.appendChild(svgEl("feMergeNode", { in: "glow1" }));
    merge.appendChild(svgEl("feMergeNode", { in: "SourceGraphic" }));
    filter.appendChild(blur1);
    filter.appendChild(blur2);
    filter.appendChild(merge);
    defs.appendChild(filter);
    svg.appendChild(defs);

    // ── Layers — back to front ─────────────────────────────────────────
    this._buildRuler(svg);
    this._buildTrackRails(svg);

    this._sessionBarGrp = svgEl("g", { class: "bt-session-bar" });
    svg.appendChild(this._sessionBarGrp);
    this._drawSessionBar(this._activeDay);

    this._rangesGrp = svgEl("g", { class: "bt-ranges" });
    svg.appendChild(this._rangesGrp);
    this._drawAllRanges();

    this._buildOverlay(svg);

    wrapper.appendChild(svg);
    this._el.appendChild(wrapper);
  }

  /**
   * Build the header row: day selector chips and save button.
   * @private
   * @returns {HTMLElement}
   */
  _buildHeader() {
    const header = document.createElement("div");
    header.className = "bt-header";

    const chipsRow = document.createElement("div");
    chipsRow.className = "bt-day-chips";

    for (const day of this._data.days) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "bt-day-chip" + (day.id === this._activeDay ? " bt-active" : "");
      btn.dataset.dayId = String(day.id);

      const lbl = document.createElement("span");
      lbl.className = "bt-chip-label";
      lbl.textContent = day.label;
      btn.appendChild(lbl);

      if (!this._opts.readOnly) {
        const sep = document.createElement("span");
        sep.className = "bt-chip-sep";
        sep.setAttribute("aria-hidden", "true");

        const add = document.createElement("span");
        add.className = "bt-chip-add";
        add.textContent = "+";
        add.title = `Add blackout — ${day.label}`;
        add.dataset.addDay = String(day.id);

        btn.appendChild(sep);
        btn.appendChild(add);
      }

      chipsRow.appendChild(btn);
    }

    header.appendChild(chipsRow);

    if (!this._opts.readOnly) {
      this._saveBtn = document.createElement("button");
      this._saveBtn.type = "button";
      this._saveBtn.className = "bt-save-btn";
      this._saveBtn.textContent = "Save Changes";
      header.appendChild(this._saveBtn);
    }

    this._headerEl = header;
    return header;
  }

  /**
   * Build the static time ruler: tick marks every 5 minutes, hour labels
   * at each whole hour.
   * @private
   * @param {SVGElement} svg
   */
  _buildRuler(svg) {
    const g = svgEl("g", { class: "bt-ruler" });

    for (let m = TIMELINE_START; m <= TIMELINE_END; m += SNAP_INTERVAL) {
      const x = minToX(m);
      const isMajor = m % 60 === 0;
      const isMed = !isMajor && m % 15 === 0;
      const tickH = isMajor ? MAJOR_TICK_H : isMed ? MED_TICK_H : MINOR_TICK_H;

      g.appendChild(
        svgEl("line", {
          class: "bt-ruler-tick" + (isMajor ? " bt-major" : ""),
          x1: x,
          y1: RULER_Y,
          x2: x,
          y2: RULER_Y + tickH,
        }),
      );

      if (isMajor) {
        const txt = svgEl("text", { class: "bt-ruler-label", x, y: LABEL_Y });
        txt.textContent = formatHour(m / 60);
        g.appendChild(txt);
      }
    }

    svg.appendChild(g);
  }

  /**
   * Build static track rail backgrounds and day-label text elements.
   * @private
   * @param {SVGElement} svg
   */
  _buildTrackRails(svg) {
    const g = svgEl("g", { class: "bt-tracks" });
    this._trackLabels = [];

    this._data.days.forEach((day, i) => {
      const ty = trackTopY(i);
      const isActive = day.id === this._activeDay;

      g.appendChild(
        svgEl("rect", {
          class: "bt-track-rail",
          x: GUTTER_W,
          y: ty,
          width: SVG_CONTENT_W,
          height: TRACK_H,
          fill: "rgba(255,255,255,0.05)",
          stroke: "rgba(255,255,255,0.09)",
          "stroke-width": 0.5,
          rx: 2,
        }),
      );

      const lbl = svgEl("text", {
        class: "bt-track-label" + (isActive ? " bt-track-active-label" : ""),
        x: GUTTER_W / 2,
        y: ty + TRACK_H / 2,
      });
      lbl.textContent = day.label.slice(0, 3).toUpperCase();
      g.appendChild(lbl);

      this._trackLabels.push({ dayId: day.id, el: lbl });
    });

    svg.appendChild(g);
  }

  /**
   * Draw (or redraw) the session bar for the given convention day.
   * Sessions are sorted by session_order so higher-order segments render
   * on top of overlapping lower-order ones.
   * @private
   * @param {number|null} dayId
   */
  _drawSessionBar(dayId) {
    this._sessionBarGrp.innerHTML = "";
    if (dayId == null) return;

    const sessions = [
      ...(this._data.sessions[dayId] ??
        this._data.sessions[String(dayId)] ??
        []),
    ].sort((a, b) => a.order - b.order);

    sessions.forEach((s, idx) => {
      const x = minToX(s.startMin);
      const w = Math.max(1, (s.endMin - s.startMin) * PX_PER_MIN);

      this._sessionBarGrp.appendChild(
        svgEl("rect", {
          class: "bt-session-seg",
          x,
          y: SESSION_BAR_Y,
          width: w,
          height: SESSION_BAR_H,
          fill: "rgba(255,255,255,0.07)",
          stroke: "rgba(255,255,255,0.18)",
          "stroke-width": 0.75,
          rx: 2,
        }),
      );

      // Clip the label to its segment so short sessions don't bleed
      const clipId = `bt${this._uid}-sc${idx}`;
      const clip = svgEl("clipPath", { id: clipId });
      clip.appendChild(
        svgEl("rect", {
          x: x + 2,
          y: SESSION_BAR_Y,
          width: Math.max(0, w - 4),
          height: SESSION_BAR_H,
        }),
      );
      this._sessionBarGrp.appendChild(clip);

      const txt = svgEl("text", {
        class: "bt-session-label",
        x: x + w / 2,
        y: SESSION_BAR_Y + SESSION_BAR_H / 2,
        "clip-path": `url(#${clipId})`,
      });
      txt.textContent = s.label;
      this._sessionBarGrp.appendChild(txt);
    });
  }

  /**
   * Draw all blackout ranges for every day into the ranges group.
   * @private
   */
  _drawAllRanges() {
    this._rangesGrp.innerHTML = "";
    this._data.days.forEach((day, i) => {
      for (const range of this._ranges[day.id] ?? []) {
        this._drawRange(range, i);
      }
    });
  }

  /**
   * Draw a single blackout range (bar + drag handles + remove button).
   * @private
   * @param {{ id:string, dayId:number, startMins:number, endMins:number }} range
   * @param {number} trackIdx Zero-based track row index.
   */
  _drawRange(range, trackIdx) {
    const ty = trackTopY(trackIdx);
    const barH = TRACK_H - 6;
    const barY = ty + 3;
    const handleCY = ty + TRACK_H / 2;
    const x1 = minToX(range.startMins);
    const x2 = minToX(range.endMins);
    const barW = Math.max(2, x2 - x1);

    const g = svgEl("g", {
      class: "bt-range",
      "data-range-id": range.id,
      "data-day-id": range.dayId,
    });

    g.appendChild(
      svgEl("rect", {
        class: "bt-range-bar",
        x: x1,
        y: barY,
        width: barW,
        height: barH,
        fill: "rgba(200,230,255,0.88)",
        rx: 2,
      }),
    );

    if (!this._opts.readOnly) {
      g.appendChild(this._buildHandle(x1, handleCY, range.id, "start"));
      g.appendChild(this._buildHandle(x2, handleCY, range.id, "end"));
      g.appendChild(
        this._buildRemoveBtn(x1 + barW / 2, barY + barH / 2, range.id),
      );
    }

    this._rangesGrp.appendChild(g);
  }

  /**
   * Build a drag handle group: visible square + transparent enlarged hit area.
   * @private
   * @param {number} cx Centre x of the handle.
   * @param {number} cy Centre y of the handle.
   * @param {string} rangeId
   * @param {'start'|'end'} handle
   * @returns {SVGGElement}
   */
  _buildHandle(cx, cy, rangeId, handle) {
    const hw = this._opts.mobile ? HANDLE_W_MOBILE : HANDLE_W;
    const hh = this._opts.mobile ? HANDLE_H_MOBILE : HANDLE_H;
    const pad = this._opts.mobile ? HANDLE_HIT_PAD_MOBILE : HANDLE_HIT_PAD;

    const g = svgEl("g", {
      class: "bt-range-handle-hit",
      "data-range-id": rangeId,
      "data-handle": handle,
    });

    // Square hit area — large enough to grab comfortably
    const hitSize = Math.max(hw, hh) + pad * 2;
    g.appendChild(
      svgEl("rect", {
        x: cx - hitSize / 2,
        y: cy - hitSize / 2,
        width: hitSize,
        height: hitSize,
        fill: "transparent",
      }),
    );

    // Visible handle — narrow bar, taller than the track
    g.appendChild(
      svgEl("rect", {
        class: "bt-range-handle",
        x: cx - hw / 2,
        y: cy - hh / 2,
        width: hw,
        height: hh,
        fill: "#90c4f8",
        stroke: "rgba(8,28,58,0.65)",
        "stroke-width": 0.75,
        rx: 2,
      }),
    );

    return g;
  }

  /**
   * Build the small remove (×) button group centered at (cx, cy).
   * @private
   * @param {number} cx
   * @param {number} cy
   * @param {string} rangeId
   * @returns {SVGGElement}
   */
  _buildRemoveBtn(cx, cy, rangeId) {
    const g = svgEl("g", {
      class: "bt-range-remove-g",
      "data-remove-id": rangeId,
    });

    g.appendChild(
      svgEl("rect", {
        x: cx - 7,
        y: cy - 7,
        width: 14,
        height: 14,
        rx: 7,
        fill: "rgba(220,60,60,0.82)",
      }),
    );

    const txt = svgEl("text", {
      class: "bt-range-remove-x",
      x: cx,
      y: cy,
    });
    txt.textContent = "×";
    g.appendChild(txt);

    return g;
  }

  /**
   * Build the cursor drag overlay group (cursor line, glow tick, tooltip,
   * session boundary glow mark).  All elements start hidden.
   * @private
   * @param {SVGElement} svg
   */
  _buildOverlay(svg) {
    const g = svgEl("g", { class: "bt-overlay", visibility: "hidden" });

    this._sessionBndGlow = svgEl("line", {
      class: "bt-session-bound-glow",
      filter: this._glowFilterUrl,
      x1: 0,
      y1: SESSION_BAR_Y,
      x2: 0,
      y2: SESSION_BAR_Y + SESSION_BAR_H,
    });
    g.appendChild(this._sessionBndGlow);

    // Dashed cursor line (session bottom → ruler top)
    this._cursorLine = svgEl("line", {
      class: "bt-cursor-line",
      x1: 0,
      y1: SESSION_BAR_Y + SESSION_BAR_H,
      x2: 0,
      y2: RULER_Y,
    });
    g.appendChild(this._cursorLine);

    // Glowing ruler graduation
    this._glowTick = svgEl("line", {
      class: "bt-glow-tick",
      filter: this._glowFilterUrl,
      x1: 0,
      y1: RULER_Y,
      x2: 0,
      y2: RULER_Y + MAJOR_TICK_H,
    });
    g.appendChild(this._glowTick);

    // Tooltip background + text
    this._tooltipBg = svgEl("rect", {
      class: "bt-tooltip-bg",
      x: 0,
      y: 0,
      width: 56,
      height: 16,
      rx: 3,
    });
    g.appendChild(this._tooltipBg);

    this._tooltipText = svgEl("text", {
      class: "bt-tooltip-text",
      x: 0,
      y: 0,
    });
    g.appendChild(this._tooltipText);

    svg.appendChild(g);
    this._overlayGrp = g;
  }

  // ── Snap logic ────────────────────────────────────────────────────────────

  /**
   * Build the ordered list of session-boundary snap points for the given day.
   * @private
   * @param {number} dayId
   * @returns {number[]} Sorted unique array of minute values.
   */
  _sessionSnapPoints(dayId) {
    const sessions =
      this._data.sessions[dayId] ?? this._data.sessions[String(dayId)] ?? [];
    const pts = new Set([TIMELINE_START, TIMELINE_END]);
    for (const s of sessions) {
      pts.add(s.startMin);
      pts.add(s.endMin);
    }
    return [...pts].sort((a, b) => a - b);
  }

  /**
   * Snap a raw minute value to the nearest valid position.
   * Priority: timeline endpoints / session boundaries → 5-minute grid.
   * @private
   * @param {number} rawMins
   * @returns {{ snapped:number, onSessionBound:boolean }}
   */
  _snap(rawMins) {
    const snapPts = this._sessionSnapPoints(this._activeDay);
    const threshM = SNAP_THRESHOLD / PX_PER_MIN;

    for (const pt of snapPts) {
      if (Math.abs(rawMins - pt) <= threshM) {
        return { snapped: pt, onSessionBound: true };
      }
    }

    const gridded = Math.round(rawMins / SNAP_INTERVAL) * SNAP_INTERVAL;
    return {
      snapped: clamp(gridded, TIMELINE_START, TIMELINE_END),
      onSessionBound: false,
    };
  }

  // ── Event binding ─────────────────────────────────────────────────────────

  /**
   * Attach all pointer and click event listeners.
   * @private
   */
  _bindEvents() {
    // Pointer drag events — captured on the SVG root
    this._svg.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    this._svg.addEventListener("pointermove", (e) => this._onPointerMove(e));
    this._svg.addEventListener("pointerup", (e) => this._onPointerUp(e));
    this._svg.addEventListener("pointercancel", () => this._endDrag());

    // Header chip clicks (day select & add blackout)
    this._headerEl?.addEventListener("click", (e) => {
      const addBtn = e.target.closest("[data-add-day]");
      if (addBtn) {
        this._addRange(Number(addBtn.dataset.addDay));
        return;
      }
      const chip = e.target.closest("[data-day-id]");
      if (chip) {
        this._setActiveDay(Number(chip.dataset.dayId));
      }
    });

    // Track rail clicks — clicking any day's rail activates it
    this._svg.addEventListener("click", (e) => {
      const g = e.target.closest("[data-day-id]");
      if (g && !this._drag) {
        this._setActiveDay(Number(g.dataset.dayId));
      }
    });

    // Remove buttons (delegated from SVG root)
    this._svg.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-remove-id]");
      if (btn) {
        e.stopPropagation();
        this._removeRange(btn.dataset.removeId);
      }
    });

    this._saveBtn?.addEventListener("click", () => this._save());
  }

  // ── Pointer / drag ────────────────────────────────────────────────────────

  /**
   * Begin a drag if the pointer lands on a range handle.
   * Pointer capture keeps the drag alive outside the SVG boundary.
   * @private
   * @param {PointerEvent} e
   */
  _onPointerDown(e) {
    if (this._opts.readOnly) return;

    const hit = e.target.closest("[data-handle]");
    if (!hit) return;

    e.preventDefault();

    const rangeId = hit.dataset.rangeId;
    const handle = hit.dataset.handle;

    this._svg.setPointerCapture(e.pointerId);
    this._drag = { rangeId, handle, pointerId: e.pointerId };

    // Activate the day this range belongs to
    const range = this._findRange(rangeId);
    if (range) this._setActiveDay(range.dayId);

    this._updateOverlay(this._svgX(e));
  }

  /**
   * Update overlay and range position during drag.
   * @private
   * @param {PointerEvent} e
   */
  _onPointerMove(e) {
    if (!this._drag || e.pointerId !== this._drag.pointerId) return;

    const x = this._svgX(e);
    const rawMin = xToMin(x);
    const { snapped, onSessionBound } = this._snap(rawMin);

    const range = this._findRange(this._drag.rangeId);
    if (!range) return;

    if (this._drag.handle === "start") {
      range.startMins = clamp(
        snapped,
        TIMELINE_START,
        range.endMins - MIN_RANGE_MINS,
      );
    } else {
      range.endMins = clamp(
        snapped,
        range.startMins + MIN_RANGE_MINS,
        TIMELINE_END,
      );
    }

    this._drawAllRanges();
    this._updateOverlay(minToX(snapped), onSessionBound);
  }

  /**
   * End the active drag.
   * @private
   * @param {PointerEvent} [e]
   */
  _onPointerUp(e) {
    if (!this._drag || (e && e.pointerId !== this._drag.pointerId)) return;
    this._endDrag();
  }

  /**
   * Clean up drag state and hide overlay.
   * @private
   */
  _endDrag() {
    this._drag = null;
    this._overlayGrp.setAttribute("visibility", "hidden");
  }

  // ── Overlay ───────────────────────────────────────────────────────────────

  /**
   * Update the cursor overlay position.
   * @private
   * @param {number} x SVG x coordinate.
   * @param {boolean} [onBound=false] Whether x aligns with a session boundary.
   */
  _updateOverlay(x, onBound = false) {
    this._overlayGrp.setAttribute("visibility", "visible");

    // Cursor line — extends up through session bar when on a boundary
    const lineY1 = onBound ? SESSION_BAR_Y : SESSION_BAR_Y + SESSION_BAR_H;
    setAttrs(this._cursorLine, { x1: x, y1: lineY1, x2: x, y2: RULER_Y });

    // Session boundary glow (visible only when on a boundary)
    setAttrs(this._sessionBndGlow, {
      x1: x,
      y1: SESSION_BAR_Y,
      x2: x,
      y2: SESSION_BAR_Y + SESSION_BAR_H,
      visibility: onBound ? "visible" : "hidden",
    });

    // Glowing ruler tick
    setAttrs(this._glowTick, { x1: x, x2: x });

    // Tooltip
    const mins = clamp(Math.round(xToMin(x)), TIMELINE_START, TIMELINE_END);
    const tipW = 58;
    const tipH = 16;
    const tipX = clamp(x - tipW / 2, GUTTER_W, SVG_W - tipW);
    const tipY = RULER_Y + MAJOR_TICK_H + 2;
    setAttrs(this._tooltipBg, { x: tipX, y: tipY, width: tipW, height: tipH });
    setAttrs(this._tooltipText, { x: tipX + tipW / 2, y: tipY + tipH / 2 });
    this._tooltipText.textContent = formatTime(mins);
  }

  // ── State mutations ───────────────────────────────────────────────────────

  /**
   * Set the active convention day, updating header chips, track labels,
   * and the session bar.
   * @private
   * @param {number} dayId
   */
  _setActiveDay(dayId) {
    if (dayId === this._activeDay) return;
    this._activeDay = dayId;

    // Update chip active class
    this._headerEl?.querySelectorAll(".bt-day-chip").forEach((c) => {
      c.classList.toggle("bt-active", Number(c.dataset.dayId) === dayId);
    });

    // Update track label active class
    for (const { dayId: did, el } of this._trackLabels) {
      el.classList.toggle("bt-track-active-label", did === dayId);
    }

    this._drawSessionBar(dayId);
  }

  /**
   * Add a new blackout range to the given day, defaulting to the day's
   * first → last session span.
   * @private
   * @param {number} dayId
   */
  _addRange(dayId) {
    if (this._pendingRangeId) return;

    const sessions =
      this._data.sessions[dayId] ?? this._data.sessions[String(dayId)] ?? [];
    const starts = sessions.map((s) => s.startMin);
    const ends = sessions.map((s) => s.endMin);
    const startMins = starts.length ? Math.min(...starts) : TIMELINE_START;
    const endMins = ends.length ? Math.max(...ends) : TIMELINE_END;

    const newId = `bt${this._uid}-r${this._nextId++}`;
    this._ranges[dayId].push({
      id: newId,
      dayId,
      startMins: clamp(
        startMins,
        TIMELINE_START,
        TIMELINE_END - MIN_RANGE_MINS,
      ),
      endMins: clamp(endMins, startMins + MIN_RANGE_MINS, TIMELINE_END),
    });

    this._pendingRangeId = newId;
    this._updateAddLock();
    this._setActiveDay(dayId);
    this._drawAllRanges();
  }

  /**
   * Remove a blackout range by its internal ID.
   * @private
   * @param {string} rangeId
   */
  _removeRange(rangeId) {
    for (const dayId of Object.keys(this._ranges)) {
      const arr = this._ranges[dayId];
      const idx = arr.findIndex((r) => r.id === rangeId);
      if (idx !== -1) {
        arr.splice(idx, 1);
        if (rangeId === this._pendingRangeId) {
          this._pendingRangeId = null;
          this._updateAddLock();
        }
        this._drawAllRanges();
        return;
      }
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  /**
   * Enable or disable the chip-add buttons based on whether a new unsaved
   * range is pending.  Locked buttons gain the `bt-chip-add-locked` class.
   * @private
   */
  _updateAddLock() {
    const locked = this._pendingRangeId !== null;
    this._headerEl
      ?.querySelectorAll(".bt-chip-add")
      .forEach((el) => el.classList.toggle("bt-chip-add-locked", locked));
  }

  /**
   * Look up a range object by its internal ID across all days.
   * @private
   * @param {string} rangeId
   * @returns {{ id:string, dayId:number, startMins:number, endMins:number }|undefined}
   */
  _findRange(rangeId) {
    for (const arr of Object.values(this._ranges)) {
      const r = arr.find((r) => r.id === rangeId);
      if (r) return r;
    }
  }

  /**
   * Convert a PointerEvent client x coordinate to SVG user units,
   * accounting for any CSS transform / zoom on the SVG.
   * @private
   * @param {PointerEvent} e
   * @returns {number}
   */
  _svgX(e) {
    const rect = this._svg.getBoundingClientRect();
    const scale = SVG_W / rect.width;
    return (e.clientX - rect.left) * scale;
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  /**
   * Serialize the current ranges and dispatch to the save callback or the
   * default API endpoint.
   * @private
   * @returns {Promise<void>}
   */
  async _save() {
    if (this._saveBtn) {
      this._saveBtn.disabled = true;
      this._saveBtn.textContent = "Saving…";
    }

    const payload = [];
    for (const dayId of Object.keys(this._ranges)) {
      for (const r of this._ranges[dayId]) {
        payload.push({
          conventionDayId: Number(dayId),
          startMins: r.startMins,
          endMins: r.endMins,
        });
      }
    }

    try {
      if (this._opts.onSave) {
        await this._opts.onSave(payload);
      } else {
        const csrf =
          document.querySelector('meta[name="csrf-token"]')?.content || "";
        const res = await fetch(`/api/blackouts/${this._data.volunteerId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify({ blackouts: payload }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }

      this._pendingRangeId = null;
      this._updateAddLock();
      if (this._saveBtn) this._saveBtn.textContent = "Saved";
      setTimeout(() => {
        if (this._saveBtn) {
          this._saveBtn.disabled = false;
          this._saveBtn.textContent = "Save Changes";
        }
      }, 1800);
    } catch (err) {
      console.error("[BlackoutTimeline] save failed:", err);
      if (this._saveBtn) {
        this._saveBtn.disabled = false;
        this._saveBtn.textContent = "Save Failed — Retry";
      }
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Destroy the component: remove all DOM, strip the container class, and
   * release event listeners.  After calling destroy() the instance must not
   * be used again.
   */
  destroy() {
    this._el.classList.remove("bt-container");
    this._el.innerHTML = "";
  }
}
