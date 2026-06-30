/**
 * @file publishSchedule.js
 * @description Orchestrates the full publish flow for a convention day schedule:
 *   1. Generate a PDF via Puppeteer (loads internal no-auth report route)
 *   2. Upload PDF to SharePoint / OneDrive via Microsoft Graph API
 *   3. Notify OVERSEER+ and all scheduled volunteers by email + SMS
 *   4. Record the publish event in the database
 *
 * The PDF_SECRET is generated once at server start. The internal render route
 * in oversightRoutes.js checks this secret so Puppeteer can load the report
 * page without a user session, while external callers cannot access it.
 */

import crypto from 'crypto';
import { uploadToOneDrive } from './graphClient.js';
import { uploadPublishedFile } from './blobStorage.js';
import {
    sendResetEmail,
    sendResetSms,
    normalizeToE164,
} from './messaging.js';
import {
    getPublishNotificationData,
    recordSchedulePublish,
    getCurrentAssignmentSnapshot,
    getLastPublishSnapshot,
    savePublishSnapshot,
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

    const url =
        `http://127.0.0.1:${serverPort}/internal/pdf/report` +
        `?dayId=${dayId}&secret=${encodeURIComponent(PDF_SECRET)}`;

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
                // role is stamped on oversight recipients by getPublishNotificationData.
                // Unscheduled oversight recipients have empty assignments and no role
                // set if role was missing from the query — either check covers them.
                const isOversight =
                    (rec.role && ['OVERSEER', 'ASSISTANT_ADMIN', 'ADMIN'].includes(rec.role)) ||
                    (!rec.role && rec.assignments.length === 0);
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
    const subject  = `Albany JW Parking \u2014 Schedule Update (${dayNames})`;

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

    lines.push('Albany JW Parking Team');
    const emailBody = lines.join('\n');

    // ── SMS ──────────────────────────────────────────────────
    // Sections joined by "\n\n" (blank line between blocks); shift and
    // link lists within a section joined by "\n". Days are abbreviated
    // and shifts are grouped by location to keep the body compact on
    // multi-day publishes.
    const smsSections = ['Albany JW Parking schedule update.'];

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
 *   Generate PDF → upload to SharePoint + Blob → fetch recipients +
 *   current snapshot → (differential) fetch last snapshot + compute diff
 *
 * Phase 2 — cross-day batch map:
 *   Merge all recipients across successful days into a single Map keyed
 *   by volunteer ID so each volunteer receives exactly one notification.
 *
 * Phase 3 — notifications:
 *   One email + one SMS per volunteer covering all selected days.
 *
 * Phase 4 — record + snapshot:
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
 * }} opts
 * @returns {Promise<{
 *   success:        true,
 *   days:           Array<{ dayId: number, dayLabel: string, sharePointUrl: string|null, downloadUrl: string|null, filename: string|null, error: string|null }>,
 *   totalEmailSent: number,
 *   totalSmsSent:   number,
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
    } = opts;

    // ── Phase 1: PDF + upload + recipient data per day ───────
    /** @type {Array<object>} */
    const dayResults = [];

    for (const dayId of dayIds) {
        const { label: dayLabel = `Day_${dayId}`, conventionDate = null } =
            dayMeta?.[dayId] || {};

        try {
            const datePart    = conventionDate ? _datePart(conventionDate) : '';
            let filename      = null;
            let sharePointUrl = null;
            let blobName      = null;
            let downloadUrl   = null;

            if (!recipientsOnly) {
                filename        = `${dayLabel.replace(/\s+/g, '_')}_Schedule${datePart ? '_' + datePart : ''}.pdf`;
                const pdfBuffer = await generateReportPDF(dayId, serverPort);
                sharePointUrl   = await uploadToOneDrive(pdfBuffer, filename, graphConfig);
                log(`${dryRun ? '[DRY RUN] ' : ''}Uploaded to SharePoint: ${sharePointUrl}`);
                blobName    = await uploadPublishedFile(pdfBuffer, filename);
                downloadUrl = `${appBaseUrl}/schedule/pdf/${encodeURIComponent(blobName)}`;
                log(`${dryRun ? '[DRY RUN] ' : ''}Blob URL: ${downloadUrl}`);
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
                filename, sharePointUrl, blobName, downloadUrl,
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
        for (const [volId, { vol }] of batchMap) {
            if (!['ADMIN', 'ASSISTANT_ADMIN'].includes(vol.role || '')) {
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
            role:     vol.role || null,
            hasEmail: !!vol.email,
            hasPhone: !!(vol.phone && vol.smsCapable !== false),
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

    for (const [volId, { vol, dayInfos }] of batchMap) {
        const { subject, emailBody, smsBody } = _buildBatchNotification(vol, dayInfos);

        if (dryRun) {
            preview.push({
                name:      `${vol.lastName}, ${vol.firstName}`,
                email:     vol.email  || null,
                phone:     vol.phone  || null,
                emailBody,
                smsBody,
            });
            continue;
        }

        // Email
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
            }
        }

        // SMS
        if (vol.phone && vol.smsCapable !== false && twilioAccountSid && twilioMsgSid) {
            let phoneE164;
            try { phoneE164 = normalizeToE164(vol.phone); } catch { /* skip */ }
            if (phoneE164) {
                const ok = await sendResetSms(
                    phoneE164, dayInfos[0]?.downloadUrl || '',
                    twilioAccountSid, twilioAuthToken, twilioMsgSid,
                    { firstName: vol.firstName, customBody: smsBody },
                );
                if (ok) {
                    smsSentSet.add(volId);
                    totalSmsSent++;
                }
            }
        }
    }

    // ── Phase 4: DB records + snapshots ──────────────────────
    if (!dryRun) {
        for (const dr of successDays) {
            const dayEntries = [...batchMap.entries()]
                .filter(([, { dayInfos }]) => dayInfos.some((di) => di.dayId === dr.dayId));

            const publishId = await recordSchedulePublish({
                dayId:           dr.dayId,
                publishedBy,
                sharePointUrl:   dr.downloadUrl,
                filename:        dr.filename,
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
            error:         dr.error         || null,
        })),
        totalEmailSent,
        totalSmsSent,
        ...(dryRun ? { dryRun: true, preview } : {}),
    };
}

/**
 * @deprecated Use publishDays() directly.
 * Shim retained for any callers that haven't been updated yet.
 *
 * @param {{ dayId: number, dayLabel: string, conventionDate: string|null } & object} opts
 * @returns {Promise<object>}
 */
export async function publishDaySchedule(opts) {
    const { dayId, dayLabel, conventionDate, ...rest } = opts;
    return publishDays({
        ...rest,
        dayIds:    [dayId],
        dayMeta:   { [dayId]: { label: dayLabel, conventionDate } },
        alertMode: 'all',
    });
}


