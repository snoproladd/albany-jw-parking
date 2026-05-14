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
import {
    sendResetEmail,
    sendResetSms,
    normalizeToE164,
} from './messaging.js';
import {
    getPublishNotificationData,
    recordSchedulePublish,
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
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30_000 });

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
//  Notification message builder
// ─────────────────────────────────────────────

/**
 * @typedef {{
 *   shift_label:   string,
 *   location_name: string,
 *   start_time:    string,
 *   end_time:      string,
 *   slot_type:     string,
 * }} ShiftAssignment
 */

/**
 * Build the email subject, email body, and SMS body for one recipient.
 *
 * @param {string}              firstName
 * @param {string}              dayLabel
 * @param {string|null}         conventionDate  - ISO date string "YYYY-MM-DD"
 * @param {ShiftAssignment[]}   assignments     - This volunteer's shifts (may be empty)
 * @param {string}              sharePointUrl
 * @returns {{ subject: string, emailBody: string, smsBody: string }}
 */
function buildNotificationContent(firstName, dayLabel, conventionDate, assignments, sharePointUrl) {
    const dateStr = conventionDate
        ? new Date(`${conventionDate}T12:00:00Z`).toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
          })
        : dayLabel;

    const subject = `Albany JW Parking \u2014 ${dayLabel} Schedule Published`;

    /** @type {string[]} */
    const assignmentLines = (assignments || []).map((a) => {
        const role =
            a.slot_type === 'keyman'      ? ' [Keyman]'      :
            a.slot_type === 'keyman_asst' ? ' [Keyman Asst]' : '';
        return `  \u2022 ${a.shift_label} \u2014 ${a.location_name} (${a.start_time}\u2013${a.end_time})${role}`;
    });

    const emailBody = [
        `Hi ${firstName},`,
        ``,
        `The parking schedule for ${dateStr} has been published.`,
        ...(assignmentLines.length ? [``, `Your assignments:`, ...assignmentLines] : []),
        ``,
        `View the full schedule:`,
        sharePointUrl,
        ``,
        `Albany JW Parking Team`,
    ].join('\n');

    // SMS is kept short
    const smsBody = assignments?.length
        ? `Albany JW Parking: ${dayLabel} schedule published. Your shifts: ${
              assignments.map((a) => `${a.shift_label} at ${a.location_name} (${a.start_time})`).join('; ')
          }. View: ${sharePointUrl}`
        : `Albany JW Parking: ${dayLabel} schedule published. View: ${sharePointUrl}`;

    return { subject, emailBody, smsBody };
}

// ─────────────────────────────────────────────
//  Main publish orchestrator
// ─────────────────────────────────────────────

/**
 * Run the full publish pipeline for one convention day:
 * PDF → upload → notify → record.
 *
 * @param {{
 *   dayId:            number,
 *   dayLabel:         string,
 *   conventionDate:   string|null,
 *   publishedBy:      string,
 *   serverPort:       number,
 *   smtpConfig:       { host:string, port:number, user:string, pass:string },
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
 * }} opts
 * @returns {Promise<{
 *   sharePointUrl:    string,
 *   filename:         string,
 *   emailSent:        number,
 *   smsSent:          number,
 *   totalRecipients:  number,
 * }>}
 */
export async function publishDaySchedule(opts) {
    const {
        dayId, dayLabel, conventionDate, publishedBy,
        serverPort, smtpConfig, twilioAccountSid, twilioAuthToken, twilioMsgSid,
        graphConfig,
        dryRun = false,
    } = opts;

    // 1. Generate PDF
    const pdfBuffer = await generateReportPDF(dayId, serverPort);

    // 2. Build filename + upload
    const datePart = conventionDate
        ? new Date(`${conventionDate}T12:00:00Z`)
              .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
              .replace(',', '').replace(/\s+/g, '_')
        : '';

    const filename = `${dayLabel.replace(/\s+/g, '_')}_Schedule${datePart ? '_' + datePart : ''}.pdf`;

    const sharePointUrl = await uploadToOneDrive(pdfBuffer, filename, graphConfig);
    log(`${dryRun ? '[DRY RUN] ' : ''}Uploaded to SharePoint: ${sharePointUrl}`);

    // 3. Get recipients
    const { recipients } = await getPublishNotificationData(dayId);
    log(`${dryRun ? '[DRY RUN] ' : ''}${recipients.length} recipients`);

    // 4. Send notifications — or collect preview for dry runs
    let emailSent = 0, smsSent = 0;
    /** @type {Array<{name:string, email:string|null, phone:string|null, emailBody:string, smsBody:string}>} */
    const preview = [];

    for (const r of recipients) {
        const { subject, emailBody, smsBody } = buildNotificationContent(
            r.firstName, dayLabel, conventionDate, r.assignments, sharePointUrl,
        );

        if (dryRun) {
            preview.push({
                name:      `${r.lastName}, ${r.firstName}`,
                email:     r.email  || null,
                phone:     r.phone  || null,
                emailBody,
                smsBody,
            });
            continue;
        }

        // Email
        if (r.email && smtpConfig?.user && smtpConfig?.pass) {
            const ok = await sendResetEmail(r.email, sharePointUrl, {
                ...smtpConfig,
                subject,
                firstName: r.firstName,
                customBody: emailBody,
            });
            if (ok) emailSent++;
        }

        // SMS
        if (r.phone && r.smsCapable !== false && twilioAccountSid && twilioMsgSid) {
            let phoneE164;
            try { phoneE164 = normalizeToE164(r.phone); } catch { /* skip */ }
            if (phoneE164) {
                const ok = await sendResetSms(
                    phoneE164, sharePointUrl,
                    twilioAccountSid, twilioAuthToken, twilioMsgSid,
                    { firstName: r.firstName, customBody: smsBody },
                );
                if (ok) smsSent++;
            }
        }
    }

    // 5. Record — skipped for dry runs
    if (!dryRun) {
        await recordSchedulePublish({
            dayId,
            publishedBy,
            sharePointUrl,
            filename,
            emailSent,
            smsSent,
            totalRecipients: recipients.length,
        });
    }

    log(`${dryRun ? '[DRY RUN] ' : ''}Publish complete: ${
        dryRun
            ? `${recipients.length} recipients previewed, no messages sent`
            : `${emailSent} emails, ${smsSent} SMS`
    }`);

    return {
        sharePointUrl,
        filename,
        emailSent,
        smsSent,
        totalRecipients: recipients.length,
        ...(dryRun ? { dryRun: true, preview } : {}),
    };
}
