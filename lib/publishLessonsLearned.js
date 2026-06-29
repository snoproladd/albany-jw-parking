/**
 * @file lib/publishLessonsLearned.js
 * @description Orchestrates the PDF publish flow for the Lessons Learned report.
 *
 * Steps when OVERSEER+ publishes a lesson:
 *   1. Mark the lesson as published in the DB.
 *   2. Generate a PDF via Puppeteer (loads internal no-auth render route).
 *   3. Upload PDF to the published-files blob container at a fixed
 *      year-keyed path so each year has one overwritable report.
 *   4. Upload / overwrite to SharePoint / OneDrive via Microsoft Graph.
 *   5. Record the report metadata (blob name, share URL) in
 *      dbo.lessons_learned_reports for display in the UI.
 *
 * The LL_PDF_SECRET is generated once at server start.  The internal render
 * route checks this secret so Puppeteer can fetch the report HTML without a
 * user session, while external callers cannot access it.
 */

import crypto from 'crypto';
import { uploadLessonsLearnedReport } from './blobStorage.js';
import { uploadToOneDrive } from './graphClient.js';

// ─────────────────────────────────────────────
//  Logging
// ─────────────────────────────────────────────

/**
 * @param {...any} args
 * @returns {void}
 */
function log(...args) {
    console.log(`[${new Date().toISOString()}] [lib/publishLessonsLearned]`, ...args);
}

/**
 * @param {...any} args
 * @returns {void}
 */
function logError(...args) {
    console.error(`[${new Date().toISOString()}] [lib/publishLessonsLearned]`, ...args);
}

// ─────────────────────────────────────────────
//  Internal-render secret
// ─────────────────────────────────────────────

/**
 * One-time random secret generated at server start.
 * The internal `/internal/pdf/lessons-learned` route verifies this value so
 * Puppeteer can fetch the report HTML without a session cookie, while the
 * route remains inaccessible to external callers.
 *
 * @type {string}
 */
export const LL_PDF_SECRET = crypto.randomBytes(32).toString('hex');

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
 * Launch Puppeteer, render the internal lessons-learned PDF page for the
 * given year, and return a PDF buffer.
 *
 * @param {number} year        - Convention year to report on.
 * @param {number} serverPort  - Local port the Express server is listening on.
 * @returns {Promise<Buffer>}
 */
export async function generateLessonsLearnedPDF(year, serverPort) {
    let puppeteer;
    try {
        puppeteer = (await import('puppeteer')).default;
    } catch {
        throw new Error('Puppeteer is not installed. Run: npm install puppeteer');
    }

    const url =
        `http://127.0.0.1:${serverPort}/internal/pdf/lessons-learned` +
        `?year=${year}&secret=${encodeURIComponent(LL_PDF_SECRET)}`;

    log('Launching Puppeteer for year', year, 'at', url);

    const browser = await puppeteer.launch({
        headless: 'new',
        args: PUPPETEER_ARGS,
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1200, height: 900 });
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 45_000 });

        const pdf = await page.pdf({
            format: 'Letter',
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
//  Main publish orchestrator
// ─────────────────────────────────────────────

/**
 * @typedef {{
 *   tenantId:     string,
 *   clientId:     string,
 *   clientSecret: string,
 *   driveUser:    string,
 *   folderPath:   string,
 * }} GraphConfig
 */

/**
 * Run the full lessons-learned publish pipeline for one convention year:
 *   generate PDF → upload to blob (fixed path) → upload to OneDrive.
 *
 * Returns metadata to be stored in dbo.lessons_learned_reports by the caller.
 *
 * @param {{
 *   year:        number,
 *   serverPort:  number,
 *   graphConfig: GraphConfig,
 * }} opts
 * @returns {Promise<{ blobName: string, shareUrl: string }>}
 */
export async function publishLessonsLearnedPdf({ year, serverPort, graphConfig }) {
    // 1. Generate PDF
    const pdfBuffer = await generateLessonsLearnedPDF(year, serverPort);

    // 2. Upload to blob at deterministic path (overwrites previous publish for year)
    const blobName = await uploadLessonsLearnedReport(pdfBuffer, year);
    log(`Blob upload complete: ${blobName}`);

    // 3. Upload / overwrite to SharePoint / OneDrive
    const filename = `lessons-learned-${year}.pdf`;
    let shareUrl = '';
    try {
        shareUrl = await uploadToOneDrive(pdfBuffer, filename, graphConfig);
        log(`SharePoint upload complete: ${shareUrl}`);
    } catch (err) {
        // SharePoint failure is non-fatal — blob URL is the fallback
        logError('SharePoint upload failed (non-fatal):', err.message);
    }

    return { blobName, shareUrl };
}
