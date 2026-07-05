/**
 * @file lib/publishSignMap.js
 * @description Generates a PDF snapshot of the sign placement map and
 *   uploads it to both Azure Blob Storage and SharePoint / OneDrive.
 *
 *   Flow:
 *     1. Launch Puppeteer against the internal no-auth render route.
 *     2. Wait for Google Maps tiles + markers to finish painting.
 *     3. Generate a letter-portrait PDF.
 *     4. Upload the same buffer to Blob and OneDrive in parallel.
 *     5. Record the publish event in the `published_files` table.
 *
 *   The PDF_SECRET is imported from publishSchedule.js so all internal
 *   PDF render routes share a single server-startup secret.
 */

import { PDF_SECRET } from "./publishSchedule.js";
import { uploadToOneDrive } from "./graphClient.js";
import { uploadPublishedFile } from "./blobStorage.js";
import { insertPublishedFile } from "./dbSync.js";

// ─────────────────────────────────────────────
//  Logging
// ─────────────────────────────────────────────

/**
 * @param {...any} args
 * @returns {void}
 */
function log(...args) {
  console.log(`[${new Date().toISOString()}] [lib/publishSignMap]`, ...args);
}

/**
 * @param {...any} args
 * @returns {void}
 */
function logError(...args) {
  console.error(`[${new Date().toISOString()}] [lib/publishSignMap]`, ...args);
}

// ─────────────────────────────────────────────
//  Puppeteer launch args
// ─────────────────────────────────────────────

/** @type {string[]} */
const PUPPETEER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-accelerated-2d-canvas",
  "--no-first-run",
  "--no-zygote",
  "--disable-gpu",
];

/**
 * Extra milliseconds to wait after `signsMapReady` fires, giving
 * AdvancedMarkerElement DOM nodes time to fully paint.
 *
 * @type {number}
 */
const POST_READY_DELAY_MS = 3000;

// ─────────────────────────────────────────────
//  PDF generation
// ─────────────────────────────────────────────

/**
 * Launch Puppeteer, render the internal sign-map route, and return a
 * PDF buffer.
 *
 * @param {number} serverPort   - Local port the Express server listens on.
 * @param {{ status?: string, template?: string, mapType?: string }} [filters]
 * @returns {Promise<Buffer>}
 */
export async function generateSignMapPDF(serverPort, filters = {}) {
  let puppeteer;
  try {
    puppeteer = (await import("puppeteer")).default;
  } catch {
    throw new Error("Puppeteer is not installed. Run: npm install puppeteer");
  }

  const params = new URLSearchParams();
  params.set("secret", PDF_SECRET);
  if (filters.status) params.set("status", filters.status);
  if (filters.template) params.set("template", filters.template);
  if (filters.mapType) params.set("mapType", filters.mapType);

  const url = `http://127.0.0.1:${serverPort}/internal/pdf/signs-map?${params}`;
  log("Launching Puppeteer for sign map at", url);

  const browser = await puppeteer.launch({
    headless: "new",
    args: PUPPETEER_ARGS,
  });

  try {
    const page = await browser.newPage();
    page.on("console", (msg) => log("BROWSER:", msg.text()));
    page.on("pageerror", (err) => logError("PAGE ERROR:", err.message));
    page.on("requestfailed", (req) =>
      logError("REQUEST FAILED:", req.url(), req.failure()?.errorText),
    );
await page.setViewport({ width: 1200, height: 900 });
await page.setRequestInterception(true);
page.on("request", (req) => {
  const reqUrl = req.url();
  if (
    reqUrl.includes("googleapis.com") ||
    reqUrl.includes("google.com/maps") ||
    reqUrl.includes("maps.google.com")
  ) {
    req.continue({
      headers: {
        ...req.headers(),
        Referer: "https://albanyjwparking.org/",
      },
    });
  } else {
    req.continue();
  }
});
await page.goto(url, { waitUntil: "networkidle0", timeout: 60_000 });
    await page.waitForFunction(() => window.signsMapReady === true, { timeout: 30_000 });

    // Extra paint delay — AdvancedMarkerElements render async
    await new Promise((r) => setTimeout(r, POST_READY_DELAY_MS));

    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: {
        top: "0.25in",
        right: "0.25in",
        bottom: "0.25in",
        left: "0.25in",
      },
    });

    log("PDF generated,", pdf.byteLength, "bytes");
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

// ─────────────────────────────────────────────
//  Main publish orchestrator
// ─────────────────────────────────────────────

/**
 * Generate a sign-map PDF and upload it to Blob Storage + SharePoint.
 *
 * @param {{
 *   serverPort:   number,
 *   publishedBy:  string,
 *   filters?:     { status?: string, template?: string, mapType?: string },
 *   graphConfig:  {
 *     tenantId:     string,
 *     clientId:     string,
 *     clientSecret: string,
 *     driveUser:    string,
 *     folderPath:   string,
 *   },
 * }} opts
 * @returns {Promise<{
 *   blobName:       string | null,
 *   sharePointUrl:  string | null,
 *   filename:       string,
 * }>}
 */
export async function publishSignMap(opts) {
  const { serverPort, publishedBy, filters = {}, graphConfig } = opts;

  // 1. Generate PDF
  const pdfBuffer = await generateSignMapPDF(serverPort, filters);

  // 2. Build filename
  //
  // Deliberately NOT date-stamped: uploadToOneDrive() does a PUT to this
  // exact path, which SharePoint treats as replacing/versioning the file
  // already there. A fixed name means every republish truly replaces the
  // last one (same Graph item ID) instead of leaving old dated copies
  // behind in the "Sign Maps" folder — which lib/mapsSync.js would
  // otherwise start mirroring onto the Maps page as separate tiles.
  const filename = "Sign_Placement_Map.pdf";

  // 3. Upload to Blob + SharePoint in parallel
  let blobName = null;
  let sharePointUrl = null;

  const uploads = await Promise.allSettled([
    uploadPublishedFile(pdfBuffer, filename).then((name) => {
      blobName = name;
    }),
    uploadToOneDrive(pdfBuffer, filename, {
      ...graphConfig,
      folderPath: `${graphConfig.folderPath}/Maps/Sign Maps`,
    }).then((url) => {
      sharePointUrl = url;
    }),
  ]);

  // Log any individual upload failures without aborting the whole publish
  uploads.forEach((result, i) => {
    if (result.status === "rejected") {
      const dest = i === 0 ? "Blob" : "SharePoint";
      logError(`${dest} upload failed:`, result.reason);
    }
  });

  if (!blobName && !sharePointUrl) {
    throw new Error(
      "Both Blob and SharePoint uploads failed. PDF was not saved.",
    );
  }

  // 4. Record in DB
  await insertPublishedFile({
    fileType: "sign-map",
    filename,
    blobName,
    sharePointUrl,
    publishedBy,
  });

  log(
    "Publish complete:",
    filename,
    "| blob:",
    blobName || "(failed)",
    "| sharepoint:",
    sharePointUrl || "(failed)",
  );

  return { blobName, sharePointUrl, filename };
}
