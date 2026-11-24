/**
 * @file publishSchedule.js
 * @description Orchestrates the full publish flow for a convention day schedule:
 *   1. Generate a PDF via Puppeteer (loads internal no-auth report route)
 *   2. Upload the PDF to Blob storage (the link volunteers get) and to
 *      SharePoint / OneDrive via Microsoft Graph (the department's folder)
 *   3. Notify oversight (alerts.receivePublishNotices) and the scheduled
 *      volunteers by email, and by SMS when they have opted in to texts
 *   4. Record the publish event and the assignment snapshot in the database
 *
 * Test runs never change the real publish (2026-11-24):
 *   - Dry run: the PDF is built but not uploaded anywhere; it is returned as
 *     base64 so the modal can show it. No messages, no records.
 *   - Only people who can publish ("adminOnly"): real messages to holders of
 *     scheduler.publish, with the PDF uploaded to Blob storage for the link,
 *     but not to SharePoint, and no publish record or snapshot, so
 *     differential publishes keep comparing against the last real publish.
 *
 * Delivery tracking (message_deliveries): every email and text of a run is
 * recorded under the run id (the publish job's id). Texts carry a Twilio
 * statusCallback when one is configured, so POST /webhook/sms/status can
 * mark them delivered, failed or undelivered as Twilio reports.
 *
 * The PDF_SECRET is generated once at server start. The internal render route
 * in oversightRoutes.js checks this secret so Puppeteer can load the report
 * page without a user session, while external callers cannot access it.
 */

import crypto from 'crypto';
import { getBrand } from './branding.js';
import { demoStorage, getRequestContext } from './sql.js';
import { uploadToOneDrive } from './graphClient.js';
import { uploadPublishedFile } from './blobStorage.js';
import {
    sendResetEmail,
    sendTrackedSms,
    describeSmsError,
    normalizeToE164,
} from './messaging.js';
import {
    getPublishNotificationData,
    getVolunteerIdsWithPermission,
    recordSchedulePublish,
    getCurrentAssignmentSnapshot,
    getLastPublishSnapshot,
    savePublishSnapshot,
    recordMessageDelivery,
} from './dbSync.js';

// ─────────────────────────────────────────────
//  Logging
// ─────────────────────────────────────────────

/**
 * @param {...any} args
 * @returns {void}
 */
function log(...args) {
    console.log(`[${new Date().toISOString()}] [lib/publishSchedule]`, ...args);
}

/**
 * @param {...any} args
 * @returns {void}
 */
function logError(...args) {
    console.error(`[${new Date().toISOString()}] [lib/publishSchedule]`, ...args);
}

// ─────────────────────────────────────────────
//  Internal-render secret
// ─────────────────────────────────────────────

/**
 * One-time random secret generated at server start.
 * The internal `/internal/pdf/report` route verifies this value so
 * Puppeteer can fetch the report HTML without a session cookie, while
 * the route remains inaccessible to external callers.
 *
 * @type {string}
 */
export const PDF_SECRET = crypto.randomBytes(32).toString('hex');

// ─────────────────────────────────────────────
//  Puppeteer launch args (safe for Linux + Windows)
// ─────────────────────────────────────────────

/** @type {string[]} */
const PUPPETEER_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
];

// ─────────────────────────────────────────────
//  PDF generation
// ─────────────────────────────────────────────

/**
 * Launch Puppeteer, render the internal report page, and return a PDF buffer.
 * The report page uses print-media CSS to strip chrome automatically.
 *
 * @param {number} dayId        - Convention day primary key.
 * @param {number} serverPort   - Local port the Express server is listening on.
 * @returns {Promise<Buffer>}
 */
export async function generateReportPDF(dayId, serverPort) {
    // Lazy import so the server doesn't fail to start if puppeteer is missing
    let puppeteer;
    try {
        puppeteer = (await import('puppeteer')).default;
    } catch {
        throw new Error(
            'Puppeteer is not installed. Run: npm install puppeteer',
        );
    }

    // ?demo=1 makes the internal render read the demo schema when this PDF
    // is generated during a demo request (see middleware/demoContext.js).
    const demoParam = demoStorage.getStore()?.isDemo ? '&demo=1' : '';
    // &dept=N keeps the render to the publishing department's data
    // (see middleware/resolveDepartment.js).
    const deptId = getRequestContext()?.departmentId;
    const deptParam = deptId ? `&dept=${deptId}` : '';
    const url =
        `http://127.0.0.1:${serverPort}/internal/pdf/report` +
        `?dayId=${dayId}&secret=${encodeURIComponent(PDF_SECRET)}${demoParam}${deptParam}`;

    log('Launching Puppeteer for day', dayId, 'at', url);

    const browser = await puppeteer.launch({
        headless: 'new',
        args: PUPPETEER_ARGS,
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1200, height: 900 });
        // 'networkidle0' (zero network for 500ms) is too strict for a data-heavy
        // report page — any background fetch (fonts, analytics, polling) keeps
        // it from settling and trips the timeout. 'load' fires when the window
        // load event fires (DOM + sub-resources), which is all we need for a
        // print PDF. 90s gives headroom for the busiest days; lighter days
        // still finish in well under 30s.
        await page.goto(url, { waitUntil: 'load', timeout: 90_000 });

        const pdf = await page.pdf({
            format:          'Letter',
            printBackground: true,
            margin: { top: '0.5in', right: '0.75in', bottom: '0.5in', left: '0.75in' },
        });

        log('PDF generated,', pdf.byteLength, 'bytes');
        return Buffer.from(pdf);
    } finally {
        await browser.close();
    }
}

// ─────────────────────────────────────────────
//  Time / date formatters
// ─────────────────────────────────────────────

/**
 * Format a mssql TIME column (epoch-anchored Date) as "h:mm AM/PM".
 *
 * @param {Date|null} t
 * @returns {string}
 */
function _fmtTime(t) {
    if (!t) return '';
    const d = t instanceof Date ? t : new Date(t);
    const h = d.getUTCHours(), m = d.getUTCMinutes();
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/**
 * Build the sortable date suffix for a PDF filename, e.g. "_Aug_8_2026".
 *
 * @param {string} conventionDate - ISO "YYYY-MM-DD"
 * @returns {string}
 */
function _datePart(conventionDate) {
    return new Date(`${conventionDate}T12:00:00Z`)
        .toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
        })
        .replace(',', '')
        .replace(/\s+/g, '_');
}

/**
 * Format a convention date as a long readable string, e.g. "Friday, August 8".
 *
 * @param {string} conventionDate - ISO "YYYY-MM-DD"
 * @returns {string}
 */
function _fmtDateLong(conventionDate) {
    return new Date(`${conventionDate}T12:00:00Z`).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
    });
}

// ─────────────────────────────────────────────
//  SMS formatting helpers
// ─────────────────────────────────────────────

/**
 * Abbreviate full weekday names to 3-letter form for SMS economy.
 * Passes non-weekday labels through unchanged.
 *
 * @param {string} label
 * @returns {string}
 */
function _abbrevDay(label) {
    const map = {
        Sunday:    'Sun',
        Monday:    'Mon',
        Tuesday:   'Tue',
        Wednesday: 'Wed',
        Thursday:  'Thu',
        Friday:    'Fri',
        Saturday:  'Sat',
    };
    return map[label] || label;
}

/**
 * Group a day's assignments by location_name, preserving first-seen order
 * so the SMS reflects the source ordering of shifts.
 *
 * @param {Array<{ location_name: string }>} assignments
 * @returns {Map<string, Array<object>>}
 */
function _groupByLocation(assignments) {
    const m = new Map();
    for (const a of assignments) {
        const key = a.location_name || '';
        if (!m.has(key)) m.set(key, []);
        m.get(key).push(a);
    }
    return m;
}

/**
 * Compact role tag suffix for SMS (e.g. " [K]" / " [KA]").
 *
 * @param {string|null} slotType
 * @returns {string}
 */
function _smsRoleTag(slotType) {
    if (slotType === 'keyman')      return ' [K]';
    if (slotType === 'keyman_asst') return ' [KA]';
    return '';
}

// ─────────────────────────────────────────────
//  Differential comparison
// ─────────────────────────────────────────────

/**
 * Compare current assignment snapshot rows against the last-published
 * snapshot to identify volunteers whose assignments changed.
 *
 * A "change" is any difference in the set of (shift_id, location_task_id,
 * slot_type) triples held by a volunteer — i.e. a different crew location,
 * a different shift time, or a changed role. Pool-only presence (volunteer
 * exists in the pool but holds no assignments) is NOT a change.
 *
 * @param {Array<{ volunteer_id: number, shift_id: number, location_task_id: number, slot_type: string|null }>} current
 * @param {Array<{ volunteer_id: number, shift_id: number, location_task_id: number, slot_type: string|null }>} last
 * @returns {{ changedVolIds: Set<number>, removedVolIds: Set<number> }}
 */
function _computeDiff(current, last) {
    /** @param {Array} rows @returns {Map<number, Array>} */
    const byVol = (rows) => {
        const m = new Map();
        for (const r of rows) {
            if (!m.has(r.volunteer_id)) m.set(r.volunteer_id, []);
            m.get(r.volunteer_id).push(r);
        }
        return m;
    };

    /** @param {Array} rows @returns {string} */
    const toKey = (rows) =>
        rows.map((r) => `${r.shift_id}:${r.location_task_id}:${r.slot_type ?? ''}`)
            .sort()
            .join('|');

    const currentByVol = byVol(current);
    const lastByVol    = byVol(last);

    const changedVolIds = new Set();
    const removedVolIds = new Set();

    for (const [volId, curRows] of currentByVol) {
        const lastRows = lastByVol.get(volId);
        if (!lastRows || toKey(curRows) !== toKey(lastRows)) changedVolIds.add(volId);
    }

    for (const volId of lastByVol.keys()) {
        if (!currentByVol.has(volId)) removedVolIds.add(volId);
    }

    return { changedVolIds, removedVolIds };
}

/**
 * Whether a recipient may be texted: a phone number, not marked unable to
 * receive texts, and opted in to texts (volunteer_in.sms_opted_in), the same
 * rule as shift reminders.
 *
 * @param {{ phone?: string|null, smsCapable?: boolean, smsOptedIn?: boolean }} vol
 * @returns {boolean}
 */
function _canText(vol) {
    return Boolean(vol.phone) && vol.smsCapable !== false && vol.smsOptedIn === true;
}

// ─────────────────────────────────────────────
//  Batch recipient map builder
// ─────────────────────────────────────────────

/**
 * @typedef {{
 *   dayId:          number,
 *   dayLabel:       string,
 *   conventionDate: string|null,
 *   downloadUrl:    string,
 *   assignments:    Array<object>,
 *   isRemoved:      boolean,
 * }} DayInfo
 */

/**
 * Build a cross-day volunteer map for batched notifications.
 *
 * In "all" mode every recipient for every successful day is included.
 * In "differential" mode only OVERSEER+, keymen/asst keymen, and
 * volunteers with changed, added, or removed assignments are included.
 *
 * @param {Array<object>} successDays - Entries from dayResults with no error.
 * @param {'all'|'differential'} alertMode
 * @returns {Map<number, { vol: object, dayInfos: DayInfo[] }>}
 */
function _buildBatchMap(successDays, alertMode) {
    /** @type {Map<number, { vol: object, dayInfos: DayInfo[] }>} */
    const batchMap = new Map();

    /**
     * @param {object} vol
     * @returns {{ vol: object, dayInfos: DayInfo[] }}
     */
    const ensure = (vol) => {
        if (!batchMap.has(vol.id)) batchMap.set(vol.id, { vol, dayInfos: [] });
        return batchMap.get(vol.id);
    };

    for (const dr of successDays) {
        const {
            dayId, dayLabel, conventionDate, downloadUrl,
            recipients, changedVolIds, removedVolIds, removedDetails,
        } = dr;

        if (alertMode === 'all') {
            for (const rec of recipients) {
                ensure(rec).dayInfos.push({
                    dayId, dayLabel, conventionDate, downloadUrl,
                    assignments: rec.assignments,
                    isRemoved: false,
                });
            }
        } else {
            // differential — oversight+, keymen, changed/added volunteers
            for (const rec of recipients) {
                // isOversight is stamped by getPublishNotificationData on members
                // holding alerts.receivePublishNotices (phase 3d-5).
                const isOversight = rec.isOversight === true;
                const isKeyman =
                    rec.assignments.some(
                        (a) => a.slot_type === 'keyman' || a.slot_type === 'keyman_asst',
                    );
                const hasChanges = changedVolIds.has(rec.id);

                if (isOversight || isKeyman || hasChanges) {
                    ensure(rec).dayInfos.push({
                        dayId, dayLabel, conventionDate, downloadUrl,
                        assignments: rec.assignments,
                        isRemoved: false,
                    });
                }
            }

            // Removed volunteers are no longer in recipients but still need
            // a "no longer scheduled" notification.
            for (const [, vol] of removedDetails) {
                ensure(vol).dayInfos.push({
                    dayId, dayLabel, conventionDate, downloadUrl,
                    assignments: vol.assignments,
                    isRemoved: true,
                });
            }
        }
    }

    return batchMap;
}

// ─────────────────────────────────────────────
//  Batched notification content builder
// ─────────────────────────────────────────────

/**
 * Build the email subject, multi-day email body, and SMS body for one
 * volunteer covering all days in their dayInfos list.
 *
 * @param {object}    vol      - Recipient volunteer record.
 * @param {DayInfo[]} dayInfos - One entry per day included in this notification.
 * @returns {{ subject: string, emailBody: string, smsBody: string }}
 */
export function _buildBatchNotification(vol, dayInfos) {
    const dayNames = dayInfos.map((di) => di.dayLabel).join(', ');
    const subject  = `${getBrand().siteName} \u2014 Schedule Update (${dayNames})`;

    // ── Email ────────────────────────────────────────────────
    const lines = [`Hi ${vol.firstName},`, ''];

    // Single overseer-only day (no assignments, not removed) — simple headline
    if (
        dayInfos.length === 1 &&
        !dayInfos[0].isRemoved &&
        dayInfos[0].assignments.length === 0
    ) {
        const di      = dayInfos[0];
        const dateStr = di.conventionDate ? _fmtDateLong(di.conventionDate) : di.dayLabel;
        lines.push(`The parking schedule for ${dateStr} has been published.`);
    } else {
        lines.push('The parking schedule has been updated.', '');

        for (const di of dayInfos) {
            const dateStr = di.conventionDate ? _fmtDateLong(di.conventionDate) : di.dayLabel;
            lines.push(`${dateStr}:`);

            if (di.isRemoved) {
                lines.push('  You are no longer scheduled for this day.');
                if (di.assignments.length) {
                    lines.push('  Previously assigned:');
                    for (const a of di.assignments) {
                        const role =
                            a.slot_type === 'keyman'      ? ' [Keyman]'      :
                            a.slot_type === 'keyman_asst' ? ' [Keyman Asst]' : '';
                        lines.push(
                            `    \u2022 ${a.shift_label} \u2014 ${a.location_name}` +
                            ` (${a.start_time}\u2013${a.end_time})${role}`,
                        );
                    }
                }
            } else if (di.assignments.length) {
                for (const a of di.assignments) {
                    const role =
                        a.slot_type === 'keyman'      ? ' [Keyman]'      :
                        a.slot_type === 'keyman_asst' ? ' [Keyman Asst]' : '';
                    lines.push(
                        `  \u2022 ${a.shift_label} \u2014 ${a.location_name}` +
                        ` (${a.start_time}\u2013${a.end_time})${role}`,
                    );
                }
            }

            lines.push('');
        }
    }

    // Schedule links
    if (dayInfos.length === 1) {
        lines.push('View the full schedule:', dayInfos[0].downloadUrl, '');
    } else {
        lines.push('View the schedules:');
        for (const di of dayInfos) {
            lines.push(`  ${di.dayLabel}: ${di.downloadUrl}`);
        }
        lines.push('');
    }

    lines.push(getBrand().teamSignature);
    const emailBody = lines.join('\n');

    // ── SMS ──────────────────────────────────────────────────
    // Sections joined by "\n\n" (blank line between blocks); shift and
    // link lists within a section joined by "\n". Days are abbreviated
    // and shifts are grouped by location to keep the body compact on
    // multi-day publishes.
    const smsSections = [`${getBrand().siteName} schedule update.`];

    for (const di of dayInfos) {
        const dayShort = _abbrevDay(di.dayLabel);

        if (di.isRemoved) {
            smsSections.push(`${dayShort}: no longer scheduled.`);
            continue;
        }
        if (!di.assignments.length) continue;

        const grouped = _groupByLocation(di.assignments);
        const lines   = [];

        if (grouped.size === 1) {
            // Single-location day: collapse to "Day @ Location:" header
            const [loc, rows] = grouped.entries().next().value;
            lines.push(`${dayShort} @ ${loc}:`);
            for (const a of rows) {
                lines.push(`${a.start_time} ${a.shift_label}${_smsRoleTag(a.slot_type)}`);
            }
        } else {
            // Multi-location day: day header + indented location blocks
            lines.push(`${dayShort}:`);
            for (const [loc, rows] of grouped) {
                lines.push(`  @ ${loc}:`);
                for (const a of rows) {
                    lines.push(`    ${a.start_time} ${a.shift_label}${_smsRoleTag(a.slot_type)}`);
                }
            }
        }

        smsSections.push(lines.join('\n'));
    }

    if (dayInfos.length === 1) {
        smsSections.push(`PDF:\n${dayInfos[0].downloadUrl}`);
    } else {
        const links = dayInfos
            .map((di) => `${_abbrevDay(di.dayLabel)}: ${di.downloadUrl}`)
            .join('\n');
        smsSections.push(`PDFs:\n${links}`);
    }

    const smsBody = smsSections.join('\n\n');

    return { subject, emailBody, smsBody };
}

// ─────────────────────────────────────────────
//  Main publish orchestrator
// ─────────────────────────────────────────────

/**
 * Run the full publish pipeline for one or more convention days.
 *
 * Phase 1 — per day (sequential):
 *   Generate PDF → upload (real: SharePoint + Blob; adminOnly: Blob only;
 *   dryRun: none) → fetch recipients + current snapshot → (differential)
 *   fetch last snapshot + compute diff
 *
 * Phase 2 — cross-day batch map:
 *   Merge all recipients across successful days into a single Map keyed
 *   by volunteer ID so each volunteer receives exactly one notification.
 *
 * Phase 3 — notifications:
 *   One email + one SMS per volunteer covering all selected days.
 *
 * Phase 4 — record + snapshot (real publishes only, not dryRun or adminOnly):
 *   Insert one row into schedule_publishes per successful day and save
 *   the current assignment state to schedule_publish_snapshots.
 *
 * @param {{
 *   dayIds:           number[],
 *   dayMeta:          Record<number, { label: string, conventionDate: string|null }>,
 *   alertMode:        'all'|'differential',
 *   publishedBy:      string,
 *   serverPort:       number,
 *   appBaseUrl:       string,
 *   smtpConfig:       { host: string, port: number, user: string, pass: string },
 *   twilioAccountSid: string,
 *   twilioAuthToken:  string,
 *   twilioMsgSid:     string,
 *   graphConfig: {
 *     tenantId:     string,
 *     clientId:     string,
 *     clientSecret: string,
 *     driveUser:    string,
 *     folderPath:   string,
 *   },
 *   dryRun?: boolean,
 *   adminOnly?: boolean,
 *   onProgress?: (update: { message?: string, done?: number, total?: number }) => void,
 *   runId?: string|null,             publish job id, for delivery records and schedule_publishes.run_id
 *   smsStatusCallback?: string|null, public https URL for Twilio status callbacks, or null
 * }} opts  onProgress: called as each day is built and each person is sent
 *          to (lib/publishJobs.js shows it in the modal).
 * @returns {Promise<{
 *   success:        true,
 *   days:           Array<{ dayId: number, dayLabel: string, sharePointUrl: string|null, downloadUrl: string|null, filename: string|null, pdfBase64: string|null, error: string|null }>,
 *                   (pdfBase64: dry run only, the built PDF)
 *   totalEmailSent: number,
 *   totalSmsSent:   number,
 *   failures:       Array<{ name: string, channels: string[] }>,  people an email or text to them failed for
 *   runId:          string|null,  the run id deliveries were recorded under
 *   smsTracked:     boolean,      texts carry a status callback (delivery updates follow)
 *   dryRun?:        true,
 *   preview?:       Array<object>,
 * }>}
 */
export async function publishDays(opts) {
    const {
        dayIds, dayMeta, alertMode = 'all',
        publishedBy, serverPort, appBaseUrl,
        smtpConfig, twilioAccountSid, twilioAuthToken, twilioMsgSid,
        graphConfig,
        dryRun = false,
        adminOnly = false,
        recipientsOnly = false,
        onProgress = () => {},
        runId = null,
        smsStatusCallback = null,
    } = opts;

    // ── Phase 1: PDF + upload + recipient data per day ───────
    /** @type {Array<object>} */
    const dayResults = [];

    for (const [dayIndex, dayId] of dayIds.entries()) {
        const { label: dayLabel = `Day_${dayId}`, conventionDate = null } =
            dayMeta?.[dayId] || {};
        onProgress({
            message: `Building ${dayLabel} (${dayIndex + 1} of ${dayIds.length})`,
            done: dayIndex,
            total: dayIds.length,
        });

        try {
            const datePart    = conventionDate ? _datePart(conventionDate) : '';
            let filename      = null;
            let sharePointUrl = null;
            let blobName      = null;
            let downloadUrl   = null;
            /** @type {string|null} Dry run only: the PDF, base64. */
            let pdfBase64     = null;

            if (!recipientsOnly && demoStorage.getStore()?.isDemo) {
                // Demo: never upload to SharePoint or the shared blob
                // container. The schedule link points at a route that renders
                // the PDF live from demo data (routes/schedulesRoutes.js).
                filename    = `${dayLabel.replace(/\s+/g, '_')}_Schedule${datePart ? '_' + datePart : ''}.pdf`;
                downloadUrl = `/schedule/demo-pdf/${dayId}`;
                log(`[DEMO] Uploads skipped for ${filename}; live link ${downloadUrl}`);
            } else if (!recipientsOnly) {
                filename        = `${dayLabel.replace(/\s+/g, '_')}_Schedule${datePart ? '_' + datePart : ''}.pdf`;
                const pdfBuffer = await generateReportPDF(dayId, serverPort);
                if (dryRun) {
                    // Nothing is uploaded: the modal shows the PDF from memory.
                    pdfBase64 = Buffer.from(pdfBuffer).toString('base64');
                    // Placeholder so the message preview reads naturally.
                    downloadUrl = '(link added when published)';
                    log(`[DRY RUN] Built ${filename} (${pdfBuffer.length} bytes); not uploaded`);
                } else {
                    // The SharePoint copy is the department's distributed file:
                    // only a real publish replaces it.
                    if (!adminOnly) {
                        sharePointUrl = await uploadToOneDrive(pdfBuffer, filename, graphConfig);
                        log(`Uploaded to SharePoint: ${sharePointUrl}`);
                    }
                    blobName    = await uploadPublishedFile(pdfBuffer, filename);
                    downloadUrl = `${appBaseUrl}/schedule/pdf/${encodeURIComponent(blobName)}`;
                    log(`${adminOnly ? '[ADMIN ONLY] ' : ''}Blob URL: ${downloadUrl}`);
                }
            }

            const { recipients }  = await getPublishNotificationData(dayId);
            const currentSnapshot = await getCurrentAssignmentSnapshot(dayId);

            // Differential: compare against last snapshot
            let changedVolIds  = new Set();
            let removedVolIds  = new Set();
            /** @type {Map<number, object>} */
            let removedDetails = new Map(); // volId → vol record + last assignments

            if (alertMode === 'differential') {
                const lastSnapshot = await getLastPublishSnapshot(dayId);

                if (lastSnapshot.length > 0) {
                    const diff = _computeDiff(currentSnapshot, lastSnapshot);
                    changedVolIds = diff.changedVolIds;
                    removedVolIds = diff.removedVolIds;

                    // Build removed-volunteer records from snapshot rows (includes contact info)
                    for (const row of lastSnapshot) {
                        if (!removedVolIds.has(row.volunteer_id)) continue;
                        if (!removedDetails.has(row.volunteer_id)) {
                            removedDetails.set(row.volunteer_id, {
                                id:          row.volunteer_id,
                                firstName:   row.firstName   || '',
                                lastName:    row.lastName    || '',
                                email:       row.email       || null,
                                phone:       row.phone       || null,
                                smsCapable:  !!row.smsCapable,
                                smsOptedIn:  row.sms_opted_in === true || row.sms_opted_in === 1,
                                assignments: [],
                            });
                        }
                        removedDetails.get(row.volunteer_id).assignments.push({
                            shift_label:   row.shift_label   || '',
                            location_name: row.location_name || '',
                            start_time:    _fmtTime(row.shift_start),
                            end_time:      _fmtTime(row.shift_end),
                            slot_type:     row.slot_type     || '',
                        });
                    }
                }
                // No prior snapshot → first-ever publish → treat as 'all' (sets stay empty)
            }

            dayResults.push({
                dayId, dayLabel, conventionDate,
                filename, sharePointUrl, blobName, downloadUrl, pdfBase64,
                recipients, currentSnapshot,
                changedVolIds, removedVolIds, removedDetails,
                error: null,
            });
        } catch (err) {
            logError(`Day ${dayId} publish error:`, err.message);
            dayResults.push({ dayId, dayLabel, error: err.message || 'Publish failed' });
        }
    }

    // ── Phase 2: Cross-day batch map ─────────────────────────
    const successDays = dayResults.filter((dr) => !dr.error);
    const batchMap    = _buildBatchMap(successDays, alertMode);

    if (adminOnly) {
        // Admin-only test sends go to the people who can publish
        // (scheduler.publish — Assistant Admin and Admin; phase 3d-5).
        const publishers = await getVolunteerIdsWithPermission('scheduler.publish');
        for (const volId of [...batchMap.keys()]) {
            if (!publishers.has(volId)) {
                batchMap.delete(volId);
            }
        }
    }

    log(
        `${dryRun ? '[DRY RUN] ' : ''}` +
        `${adminOnly ? '[ADMIN ONLY] ' : ''}` +
        `Batch map: ${batchMap.size} unique recipients across ${successDays.length} days`,
    );

    if (recipientsOnly) {
        const preview = [...batchMap.values()].map(({ vol, dayInfos }) => ({
            name:     `${vol.firstName} ${vol.lastName}`,
            role:     vol.isOversight ? "Oversight" : null,
            hasEmail: !!vol.email,
            hasPhone: _canText(vol),
            days:     [...new Set(dayInfos.map((di) => di.dayLabel))],
        }));
        preview.sort((a, b) => a.name.localeCompare(b.name));
        return { success: true, preview, totalRecipients: preview.length };
    }

    // ── Phase 3: Notifications ───────────────────────────────
    let totalEmailSent = 0, totalSmsSent = 0;
    const emailSentSet = new Set(); // vol IDs who received an email
    const smsSentSet   = new Set(); // vol IDs who received an SMS
    /** @type {Array<object>} */
    const preview = [];
    /** People a send failed for. @type {Array<{ name: string, channels: string[] }>} */
    const failures = [];
    let sentTo = 0;

    for (const [volId, { vol, dayInfos }] of batchMap) {
        if (!dryRun) {
            onProgress({ message: `Sending ${sentTo + 1} of ${batchMap.size}`, done: sentTo, total: batchMap.size });
        }
        sentTo++;
        const { subject, emailBody, smsBody } = _buildBatchNotification(vol, dayInfos);

        if (dryRun) {
            preview.push({
                name:      `${vol.lastName}, ${vol.firstName}`,
                email:     vol.email  || null,
                phone:     _canText(vol) ? vol.phone : null,
                emailBody,
                smsBody,
            });
            continue;
        }

        /** Channels that failed for this person. @type {string[]} */
        const failed = [];
        const fullName = `${vol.firstName} ${vol.lastName}`.trim();

        /**
         * Record one send in message_deliveries; a failure to record is
         * logged and never stops the publish.
         *
         * @param {object} d  Fields for recordMessageDelivery().
         * @returns {Promise<void>}
         */
        const track = async (d) => {
            try {
                await recordMessageDelivery({
                    source: 'publish', runId, volunteerId: volId, recipientName: fullName, ...d,
                });
            } catch (err) {
                logError('Could not record a delivery:', err.message);
            }
        };

        // Email (SMTP reports only success or failure at send time)
        if (vol.email && smtpConfig?.user && smtpConfig?.pass) {
            const ok = await sendResetEmail(vol.email, dayInfos[0]?.downloadUrl || '', {
                ...smtpConfig,
                subject,
                firstName:  vol.firstName,
                customBody: emailBody,
            });
            if (ok) {
                emailSentSet.add(volId);
                totalEmailSent++;
            } else {
                failed.push('email');
            }
            await track({ channel: 'email', address: vol.email, status: ok ? 'sent' : 'failed' });
        }

        // SMS (opted-in volunteers only), tracked through Twilio status callbacks
        if (_canText(vol) && twilioAccountSid && twilioMsgSid) {
            let phoneE164;
            try { phoneE164 = normalizeToE164(vol.phone); } catch { /* skip */ }
            if (phoneE164) {
                const sent = await sendTrackedSms({
                    to: phoneE164,
                    body: smsBody,
                    accountSid: twilioAccountSid,
                    authToken: twilioAuthToken,
                    messagingServiceSid: twilioMsgSid,
                    statusCallback: smsStatusCallback,
                });
                if (sent.ok) {
                    smsSentSet.add(volId);
                    totalSmsSent++;
                } else {
                    failed.push(`text (${describeSmsError(sent.errorCode)})`);
                }
                await track({
                    channel: 'sms',
                    address: phoneE164,
                    providerSid: sent.sid,
                    status: !sent.ok ? 'failed'
                        : smsStatusCallback ? (['queued', 'accepted', 'sending', 'sent', 'delivered'].includes(sent.status) ? sent.status : 'queued')
                        : 'not_tracked',
                    errorCode: sent.errorCode,
                    errorMessage: sent.errorMessage,
                });
            } else {
                failed.push('text (bad number)');
                await track({ channel: 'sms', address: vol.phone, status: 'failed', errorMessage: 'Not a valid phone number' });
            }
        }

        if (failed.length) failures.push({ name: `${vol.firstName} ${vol.lastName}`.trim(), channels: failed });
    }

    onProgress({ message: dryRun ? 'Finishing' : 'Saving the publish record', done: batchMap.size, total: batchMap.size });

    // ── Phase 4: DB records + snapshots (real publishes only) ─
    // A test (dry run or adminOnly) must not become the baseline that
    // differential publishes compare against, nor appear in history.
    if (!dryRun && !adminOnly) {
        for (const dr of successDays) {
            const dayEntries = [...batchMap.entries()]
                .filter(([, { dayInfos }]) => dayInfos.some((di) => di.dayId === dr.dayId));

            const publishId = await recordSchedulePublish({
                dayId:           dr.dayId,
                publishedBy,
                sharePointUrl:   dr.downloadUrl,
                filename:        dr.filename,
                runId,
                emailSent:       dayEntries.filter(([id]) => emailSentSet.has(id)).length,
                smsSent:         dayEntries.filter(([id]) => smsSentSet.has(id)).length,
                totalRecipients: dayEntries.length,
            });

            await savePublishSnapshot(publishId, dr.currentSnapshot);
        }
    }

    log(
        `${dryRun ? '[DRY RUN] ' : ''}Publish complete: ` +
        `${successDays.length}/${dayResults.length} days, ` +
        `${totalEmailSent} emails, ${totalSmsSent} SMS`,
    );

    return {
        success: true,
        days: dayResults.map((dr) => ({
            dayId:         dr.dayId,
            dayLabel:      dr.dayLabel || String(dr.dayId),
            sharePointUrl: dr.sharePointUrl || null,
            downloadUrl:   dr.downloadUrl   || null,
            filename:      dr.filename      || null,
            pdfBase64:     dr.pdfBase64     || null,
            error:         dr.error         || null,
        })),
        totalEmailSent,
        totalSmsSent,
        failures,
        runId,
        smsTracked: Boolean(smsStatusCallback),
        ...(dryRun ? { dryRun: true, preview } : {}),
    };
}
