/**
 * @file graphClient.js
 * @description Microsoft Graph API client for uploading files to a
 * OneDrive for Business personal drive via the client-credentials flow
 * (service principal — no user sign-in required).
 *
 * Required secrets (Key Vault or .env):
 *   GRAPH_TENANT_ID      — Azure AD tenant ID (GUID)
 *   GRAPH_CLIENT_ID      — App Registration application (client) ID
 *   GRAPH_CLIENT_SECRET  — App Registration client secret value
 *   GRAPH_DRIVE_USER     — UPN of the OneDrive owner,
 *                          e.g. jladd@jakeofalltradespropertyserv.onmicrosoft.com
 *   GRAPH_FOLDER_PATH    — Destination folder path within the owner's
 *                          Documents library, e.g.
 *                          "2026 Convention Parking/Documents for Distribution"
 *
 * Azure App Registration requirements:
 *   1. Create a new App Registration in the Azure portal.
 *   2. Under API permissions → Microsoft Graph → Application permissions,
 *      add: Files.ReadWrite.All
 *   3. Grant admin consent for the permission.
 *   4. Under Certificates & secrets, create a client secret and copy
 *      its value to GRAPH_CLIENT_SECRET.
 *   5. Copy the Application (client) ID to GRAPH_CLIENT_ID.
 *   6. Copy the Directory (tenant) ID to GRAPH_TENANT_ID.
 */

// ─────────────────────────────────────────────
//  Logging
// ─────────────────────────────────────────────

/**
 * @param {...any} args
 * @returns {void}
 */
function log(...args) {
    console.log(`[${new Date().toISOString()}] [lib/graphClient]`, ...args);
}

/**
 * @param {...any} args
 * @returns {void}
 */
function logError(...args) {
    console.error(`[${new Date().toISOString()}] [lib/graphClient]`, ...args);
}

// ─────────────────────────────────────────────
//  Token cache (reuse within a single server run)
// ─────────────────────────────────────────────

/** @type {{ token: string, expiresAt: number }|null} */
let _tokenCache = null;

/**
 * Obtain a Microsoft Graph access token using the client-credentials flow.
 * Tokens are cached until 60 seconds before expiry.
 *
 * @param {{ tenantId: string, clientId: string, clientSecret: string }} creds
 * @returns {Promise<string>}
 */
async function getAccessToken({ tenantId, clientId, clientSecret }) {
    const now = Date.now();
    if (_tokenCache && now < _tokenCache.expiresAt) {
        return _tokenCache.token;
    }

    if (!tenantId || !clientId || !clientSecret) {
        throw new Error(
            'Microsoft Graph credentials not configured. ' +
            'Set GRAPH_TENANT_ID, GRAPH_CLIENT_ID, and GRAPH_CLIENT_SECRET.',
        );
    }

    const params = new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     clientId,
        client_secret: clientSecret,
        scope:         'https://graph.microsoft.com/.default',
    });

    const res = await fetch(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        {
            method:  'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body:    params.toString(),
        },
    );

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Graph token request failed ${res.status}: ${body}`);
    }

    const data = await res.json();

    // Cache with a 60-second safety buffer before actual expiry
    _tokenCache = {
        token:     data.access_token,
        expiresAt: now + (data.expires_in - 60) * 1000,
    };

    log('Access token obtained, expires in', data.expires_in, 'seconds');
    return _tokenCache.token;
}




// ─────────────────────────────────────────────
//  Folder listing
// ─────────────────────────────────────────────

/**
 * @typedef {Object} DriveFileItem
 * @property {string}      id          - Graph item ID.
 * @property {string}      name        - Filename.
 * @property {string|null} description - File description from OneDrive metadata (may be null).
 * @property {string}      webUrl      - Direct link to view/download the file.
 * @property {number}      size        - File size in bytes.
 * @property {string|null} mimeType    - MIME type, e.g. "application/pdf".
 * @property {string|null} lastModified - ISO 8601 last-modified timestamp.
 * @property {string|null} thumbnailUrl - Small thumbnail URL if available (null for non-images).
 * @property {string|null} scribbleUrl  - ScribbleMaps link URL from _meta.json, or null if not set.
 * @property {string|null} embedUrl     - ScribbleMaps iframe embed src from _meta.json, or null if not set.
 */

/**
 * @typedef {Object} DriveFolderSection
 * @property {string}         folderName - Display name of the subfolder.
 * @property {DriveFileItem[]} files     - Files directly inside this subfolder.
 */

/**
 * List the immediate subfolders of the configured OneDrive folder path,
 * then fetch the children of each subfolder and return them grouped by
 * section.  Files sitting at the root of the folder (not in a subfolder)
 * are returned in an "Uncategorised" section.
 *
 * Only non-folder children are included in each section's file list.
 *
 * @param {{
 *   tenantId:     string,
 *   clientId:     string,
 *   clientSecret: string,
 *   driveUser:    string,
 *   folderPath:   string,
 * }} config
 * @returns {Promise<DriveFolderSection[]>}
 */
export async function listOneDriveFolder(config) {
    const { tenantId, clientId, clientSecret, driveUser, folderPath } = config;

    if (!driveUser) {
        throw new Error('GRAPH_DRIVE_USER is not configured.');
    }

    const token = await getAccessToken({ tenantId, clientId, clientSecret });

    /**
     * Build a Graph URL for a path under the user's drive root.
     * @param {string} itemPath - e.g. "Folder/Sub Folder"
     * @param {string} suffix   - e.g. "/children"
     * @returns {string}
     */
    function driveUrl(itemPath, suffix = '') {
        const encoded = itemPath
            .split('/')
            .map((s) => encodeURIComponent(s.trim()))
            .join('/');
        return [
            'https://graph.microsoft.com/v1.0',
            'users', encodeURIComponent(driveUser),
            'drive', `root:/${encoded}:${suffix}`,
        ].join('/');
    }

    /**
     * GET a Graph URL and return parsed JSON; throws on non-2xx.
     * @param {string} url
     * @returns {Promise<any>}
     */
    async function graphGet(url) {
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Graph GET failed ${res.status}: ${body}`);
        }
        return res.json();
    }

    // ── Fetch the root folder's children ─────────────────────────────
    const rootChildren = await graphGet(
        driveUrl(folderPath, '/children') + '?$select=id,name,folder,file,size,webUrl,description,lastModifiedDateTime',
    );

    const items = rootChildren.value || [];

    /** @type {DriveFolderSection[]} */
    const sections = [];

    /** @type {DriveFileItem[]} */
    const rootFiles = [];

    for (const item of items) {
        if (item.folder) {
            // It's a subfolder — fetch its children
            const subPath = `${folderPath}/${item.name}`;
            let subChildren;
            try {
                subChildren = await graphGet(
                    driveUrl(subPath, '/children') + '?$select=id,name,folder,file,size,webUrl,description,lastModifiedDateTime',
                );
            } catch (err) {
                logError(`Failed to list subfolder "${item.name}":`, err.message);
                subChildren = { value: [] };
            }

            const allChildren = subChildren.value || [];

            // Pull out _meta.json if present; exclude it from tiles.
            // Fetch content via the Graph /content endpoint using the item ID,
            // which works reliably with app-only (service principal) tokens.
            const metaItem = allChildren.find(
                (child) => !child.folder && child.name === '_meta.json',
            );
            /** @type {Record<string, { scribbleUrl?: string, embedUrl?: string }>} */
            let metaLinks = {};
            if (metaItem) {
                try {
                    const contentUrl = [
                        'https://graph.microsoft.com/v1.0',
                        'users', encodeURIComponent(driveUser),
                        'drive', 'items', metaItem.id, 'content',
                    ].join('/');
                    const metaRes = await fetch(contentUrl, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (metaRes.ok) {
                        metaLinks = await metaRes.json();
                        log(`Loaded _meta.json for "${item.name}" — ${Object.keys(metaLinks).length} entries`);
                    } else {
                        logError(`_meta.json fetch returned ${metaRes.status} for "${item.name}"`);
                    }
                } catch (metaErr) {
                    logError(`Failed to fetch _meta.json in "${item.name}":`, metaErr.message);
                }
            }

            const files = allChildren
                .filter((child) => !child.folder && child.name !== '_meta.json')
                .map((child) => {
                    const meta = metaLinks[child.name] || {};
                    return {
                        ...mapToFileItem(child),
                        scribbleUrl: meta.scribbleUrl || null,
                        embedUrl:    meta.embedUrl    || null,
                    };
                });

            sections.push({ folderName: item.name, files });
        } else {
            rootFiles.push(mapToFileItem(item));
        }
    }

    // Root-level files go into an "Other" section at the end
    if (rootFiles.length > 0) {
        sections.push({ folderName: 'Other', files: rootFiles });
    }

    return sections;
}

/**
 * Map a raw Graph DriveItem to a clean DriveFileItem.
 * @param {any} item
 * @returns {DriveFileItem}
 */
function mapToFileItem(item) {
    return {
        id:           item.id,
        name:         item.name || '',
        description:  item.description || null,
        webUrl:       item.webUrl || '#',
        size:         item.size || 0,
        mimeType:     item.file?.mimeType || null,
        lastModified: item.lastModifiedDateTime || null,
        thumbnailUrl: null,
    };
}


// ─────────────────────────────────────────────
//  File download (for maps blob sync)
// ─────────────────────────────────────────────

/**
 * Download the raw content of a OneDrive file by its Graph drive item ID.
 * Used by lib/mapsSync.js to copy SharePoint-hosted map files into Blob
 * Storage so the /maps page never has to link directly to SharePoint.
 *
 * @param {string} itemId - Graph drive item ID (DriveFileItem.id).
 * @param {{
 *   tenantId:     string,
 *   clientId:     string,
 *   clientSecret: string,
 *   driveUser:    string,
 * }} config
 * @returns {Promise<Buffer>} Raw file bytes.
 * @throws {Error} if the download request fails.
 */
export async function downloadOneDriveFileContent(itemId, config) {
    const { tenantId, clientId, clientSecret, driveUser } = config;

    if (!driveUser) {
        throw new Error('GRAPH_DRIVE_USER is not configured.');
    }

    const token = await getAccessToken({ tenantId, clientId, clientSecret });

    const url = [
        'https://graph.microsoft.com/v1.0',
        'users', encodeURIComponent(driveUser),
        'drive', 'items', itemId, 'content',
    ].join('/');

    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Graph file download failed ${res.status}: ${body}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

// ─────────────────────────────────────────────
//  File upload
// ─────────────────────────────────────────────

/**
 * Upload a file buffer to a specific OneDrive for Business personal drive.
 * If a file with the same name already exists it is overwritten (re-publish).
 *
 * @param {Buffer}  fileBuffer - The file content to upload.
 * @param {string}  filename   - The filename, e.g. "Friday_Schedule_Jul_3.pdf".
 * @param {{
 *   tenantId:     string,
 *   clientId:     string,
 *   clientSecret: string,
 *   driveUser:    string,
 *   folderPath:   string,
 * }} config
 * @returns {Promise<string>} The SharePoint web URL of the uploaded file.
 */
export async function uploadToOneDrive(fileBuffer, filename, config) {
    const { tenantId, clientId, clientSecret, driveUser, folderPath } = config;

    if (!driveUser) {
        throw new Error('GRAPH_DRIVE_USER is not configured.');
    }

    const token = await getAccessToken({ tenantId, clientId, clientSecret });

    // Build the item path, encoding each segment individually so slashes
    // in folder names are preserved as path separators.
    const segments = [
        ...folderPath.split('/').map((s) => encodeURIComponent(s.trim())),
        encodeURIComponent(filename),
    ];
    const itemPath = segments.join('/');

    const url = [
        'https://graph.microsoft.com/v1.0',
        'users', encodeURIComponent(driveUser),
        'drive', `root:/${itemPath}:`, 'content',
    ].join('/');

    log(`Uploading "${filename}" to OneDrive path: ${folderPath}/`);

    const res = await fetch(url, {
        method:  'PUT',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type':  'application/pdf',
        },
        body: fileBuffer,
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Graph file upload failed ${res.status}: ${body}`);
    }

    const data = await res.json();

 log("Upload successful:", data.name, "→", data.webUrl);

 // Create an anonymous "anyone with the link" view URL so recipients
 // can open the file without signing in to a Microsoft account.
 const linkUrl = [
   "https://graph.microsoft.com/v1.0",
   "users",
   encodeURIComponent(driveUser),
   "drive",
   "items",
   data.id,
   "createLink",
 ].join("/");

 const linkRes = await fetch(linkUrl, {
   method: "POST",
   headers: {
     Authorization: `Bearer ${token}`,
     "Content-Type": "application/json",
   },
   body: JSON.stringify({ type: "view", scope: "anonymous" }),
 });

 if (!linkRes.ok) {
   const linkBody = await linkRes.text();
   logError(
     "createLink failed — falling back to webUrl:",
     linkRes.status,
     linkBody,
   );
   return data.webUrl;
 }

 const linkData = await linkRes.json();
 const shareUrl = linkData.link?.webUrl ?? data.webUrl;
 log("Anonymous share link created:", shareUrl);
 return shareUrl;
}
