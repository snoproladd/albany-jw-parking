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

    log('Upload successful:', data.name, '→', data.webUrl);
    return data.webUrl;
}
