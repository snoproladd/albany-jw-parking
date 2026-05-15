/**
 * ============================================================
 *  dbSync.js
 *  Centralized database access layer for volunteer management.
 *  - Draft-based registration lifecycle
 *  - Registered-user My Account updates
 * ============================================================
 */

// ============================================================
// Imports
// ============================================================
import {
  query as rawQuery,
  whoAmI,
  healthProbe,
} from "../src/config/azureConfig.js";
import { hashPassword } from "./passwordVer.js";
import sql from "mssql";
import { PERMISSIONS } from "../src/config/roles.js";
import { isProfileComplete } from "./volunteerStatus.js";



// ============================================================
// Logging Helpers
// ============================================================
/**
 * @param {...any} args
 */
function log(...args) {
  console.log(`[${new Date().toISOString()}] [lib/dbSync.js]`, ...args);
}
/**
 * @param {...any} args
 */
function logError(...args) {
  console.error(`[${new Date().toISOString()}] [lib/dbSync.js]`, ...args);
}

// ============================================================
// Exec Wrapper
// ============================================================

/**
 * Wrapper for rawQuery() from azureConfig.js
 * @param {string} sqlText
 * @param {(req: import("mssql").Request) => void} [bindParamsFn]
 * @returns {Promise<import("mssql").IResult<any>>}
 */
export async function exec(sqlText, bindParamsFn) {
  log("exec called");
  return rawQuery(sqlText, bindParamsFn);
}

// ============================================================
// Volunteer Cache
// ============================================================

/**
 * Load all volunteers into in-memory caches keyed by registration_id and id.
 * @returns {Promise<{byRegistrationId: Record<string, any>, byUserId: Record<number, any>}>}
 */
export async function loadVolunteerCache() {
  const tsql = `SELECT * FROM dbo.volunteer_in;`;
  const result = await exec(tsql);
  const rows = result.recordset || [];

  /** @type {Record<string, any>} */
  const byRegistrationId = {};
  /** @type {Record<number, any>} */
  const byUserId = {};

  for (const row of rows) {
    if (row.registration_id) byRegistrationId[row.registration_id] = row;
    if (row.id) byUserId[row.id] = row;
  }

  return { byRegistrationId, byUserId };
}

/**
 * Mark a volunteer as having a pending password reset or resume link.
 *
 * - Stores the provided hash into pending_pass_hash.
 * - Sets pending_pass_reset = 1.
 * - Stamps the appropriate per-channel cooldown column based on type + method.
 *
 * @param {number} id
 * @param {string} hash
 * @param {"resume"|"reset"} [linkType="reset"]
 * @param {"email"|"sms"} [channel="email"]
 * @returns {Promise<void>}
 */
export async function setPendingReset(
  id,
  hash,
  linkType = "reset",
  channel = "email",
) {
  const channelCol =
    linkType === "resume"
      ? channel === "sms"
        ? "last_resume_sms_sent_at"
        : "last_resume_email_sent_at"
      : channel === "sms"
        ? "last_reset_sms_sent_at"
        : "last_reset_email_sent_at";

  const tsql = `
        UPDATE dbo.volunteer_in
        SET pending_pass_reset      = 1,
            pending_pass_hash       = @hash,
            last_pass_reset_sent_at = SYSUTCDATETIME(),
            ${channelCol}           = SYSUTCDATETIME(),
            last_updated            = SYSUTCDATETIME()
        WHERE id = @id;
    `;

  await exec(tsql, (req) => {
    req.input("id", sql.Int, id);
    req.input("hash", sql.NVarChar(200), hash);
  });
}

/**
 * Clear a pending password reset for a volunteer.
 *
 * - Sets pending_pass_reset = 0
 * - Clears pending_pass_hash to NULL
 * - Updates last_updated
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function clearPendingReset(id) {
  const tsql = `
    UPDATE dbo.volunteer_in
    SET pending_pass_reset = 0,
        pending_pass_hash  = NULL,
        last_updated       = SYSUTCDATETIME()
    WHERE id = @id;
  `;

  await exec(tsql, (req) => {
    req.input("id", sql.Int, id);
  });
}
// ============================================================
// CONTINUE REGISTRATION Logic (name/phone confirmation, security attempts, etc.)
// This section includes all DB interactions related to the continue-registration flow,
// which allows users to continue filling out their registration without creating an account.
// This flow includes:
// 1) Fetching the volunteer row by ID for continue-registration.
// 2) Updating security attempt counts after failed checks.
// 3) Marking an account as compromised after too many failed attempts.
// 4) Finalizing continue-registration after successful checks (optionally updating name/phone).
// ============================================================
// In lib/dbSync.js

/**
 * Fetch volunteer row used by continue-registration logic.
 *
 * Returns:
 *  {
 *    id,
 *    firstName,
 *    lastName,
 *    suffix,
 *    phone,
 *    account_status,
 *    security_attempt_count,
 *    last_step
 *  } or null
 *
 * @param {number} id
 * @returns {Promise<any|null>}
 */
export async function getVolunteerForContinueRegistration(id) {
  const result = await exec(
    `
    SELECT TOP (1)
      id,
      firstName,
      lastName,
      suffix,
      phone,
      account_status,
      security_attempt_count,
      registration_status,
      registration_id,
      last_step
    FROM dbo.volunteer_in
    WHERE id = @id;
    `,
    (reqSql) => {
      reqSql.input("id", sql.Int, id);
    },
  );

  return result.recordset?.[0] || null;
}

/**
 * Get a single volunteer row by primary key ID.
 *
 * Used by /my-account and other account-related flows.
 *
 * @param {number} id
 * @returns {Promise<any|null>} - volunteer row or null
 */
export async function getVolunteerById(id) {
  const result = await exec(
    `
    SELECT TOP (1) *
    FROM dbo.volunteer_in
    WHERE id = @id;
    `,
    (reqSql) => {
      reqSql.input("id", sql.Int, id);
    },
  );

  return result.recordset?.[0] || null;
}

/**
 * Fetch volunteers for the oversight selector list.
 *
 * @param {{
 *   includeInactive?: boolean,
 *   includeDeleted?:  boolean,
 * }} [opts]
 * @returns {Promise<Array<{
 *   id: number,
 *   firstName: string|null,
 *   lastName: string|null,
 *   suffix: string|null,
 *   active: boolean,
 *   registration_status: string,
 *   deleted_at: Date|null,
 * }>>}
 */
export async function getActiveVolunteers({ includeInactive = true, includeDeleted = false } = {}) {
  const conditions = ["registration_status <> 'archived'"];
  if (!includeDeleted) conditions.push("registration_status <> 'deleted'");

  const whereClause = 'WHERE ' + conditions.join(' AND ');

  const result = await exec(
    `SELECT id, firstName, lastName, suffix, registration_status,
            active_current_year, deleted_at
     FROM dbo.volunteer_in
     ${whereClause}
     ORDER BY lastName, firstName, suffix;`,
  );

  return result.recordset.map((r) => ({
    id:                  r.id,
    lastName:            r.lastName,
    firstName:           r.firstName,
    suffix:              r.suffix,
    active:              !!r.active_current_year,
    registration_status: r.registration_status,
    deleted_at:          r.deleted_at || null,
  }));
}

/**
 * Update audit fields (last_updated, edited_by) for a volunteer.
 *
 * Used by /my-account/finalize and can be reused elsewhere if needed.
 *
 * @param {number} id
 * @param {string} editedBy
 * @returns {Promise<void>}
 */
export async function updateVolunteerAudit(id, editedBy) {
  await exec(
    `
    UPDATE dbo.volunteer_in
    SET last_updated = SYSUTCDATETIME(),
        edited_by    = @editedBy
    WHERE id = @id;
    `,
    (reqSql) => {
      reqSql.input("id", sql.Int, id);
      reqSql.input("editedBy", sql.NVarChar(50), editedBy || null);
    },
  );
}
/**
 * Find a volunteer by phone or email (non-archived only).
 *
 * - Normalizes phone by stripping non-digits.
 * - Normalizes email to lowercase.
 * - Tries phone match if phoneDigits present.
 * - Otherwise email match.
 *
 * Returns: the first matching volunteer row or null.
 *
 * @param {string | null} phoneRaw
 * @param {string | null} emailRaw
 * @returns {Promise<any | null>}
 */
export async function findVolunteerByPhoneOrEmail(phoneRaw, emailRaw) {
  const digitsOnly = (s) => (s || "").replace(/\D+/g, "").trim();

  const phoneDigits = digitsOnly(phoneRaw);
  const normalizedPhoneDigits =
    phoneDigits && phoneDigits.length > 0 ? phoneDigits : null;

  const email = (emailRaw || "").trim().toLowerCase();
  const normalizedEmail = email || null;

  const tsql = `
    SELECT TOP (1) *
    FROM dbo.volunteer_in
    WHERE registration_status <> 'archived'
      AND (
        (@phoneDigits IS NOT NULL AND
         REPLACE(REPLACE(REPLACE(REPLACE(phone, '(', ''), ')', ''), '-', ''), ' ', '') = @phoneDigits
        )
        OR (@email IS NOT NULL AND LOWER(email) = @email)
      );
  `;

  const result = await exec(tsql, (req) => {
    req.input("phoneDigits", sql.NVarChar(50), normalizedPhoneDigits);
    req.input("email", sql.NVarChar(255), normalizedEmail);
  });

  return result.recordset?.[0] || null;
}

/**
 * Find a volunteer by ID, excluding archived registrations.
 *
 * @param {number | string} id
 * @returns {Promise<any | null>}
 */
export async function findVolunteerByIdNonArchived(id) {
  const tsql = `
    SELECT TOP (1) *
    FROM dbo.volunteer_in
    WHERE id = @id
      AND registration_status <> 'archived';
  `;

  const result = await exec(tsql, (req) => {
    req.input("id", sql.Int, Number(id));
  });

  return result.recordset?.[0] || null;
}

/**
 * Find volunteer by reset hash value (for password reset).
 *
 * - Works with pending_pass_hash VARBINARY(32) by converting it to NVARCHAR.
 * - Only matches rows where pending_pass_reset = 1 and not archived.
 *
 * @param {string} hash
 * @returns {Promise<any | null>}
 */
export async function findVolunteerByResetHash(hash) {
  const tsql = `
    SELECT TOP (1) *
    FROM dbo.volunteer_in
    WHERE pending_pass_reset = 1
      AND CONVERT(nvarchar(200), pending_pass_hash) = @hash
      AND registration_status <> 'archived';
  `;

  const result = await exec(tsql, (req) => {
    req.input("hash", sql.NVarChar(200), hash);
  });

  return result.recordset?.[0] || null;
}

/**
 * Get a volunteer row by email for account-related flows
 * (continue-without-account, upgrade-to-account, etc.).
 *
 * - Matches LOWER(email) = @email
 * - Excludes archived registrations
 * - Returns the first matching row or null
 *
 * Fields returned:
 *  {
 *    id,
 *    email,
 *    accountType,
 *    registration_status,
 *    last_step,
 *    account_status,
 *    passwordHash
 *  }
 *
 * @param {string} email
 * @returns {Promise<any|null>}
 */
export async function getVolunteerByEmailNonArchived(email) {
  const trimmedEmail = (email || "").trim().toLowerCase();
  if (!trimmedEmail) return null;

  const result = await exec(
    `
    SELECT TOP (1)
      id,
      email,
      accountType,
      registration_status,
      last_step,
      account_status,
      passwordHash
    FROM dbo.volunteer_in
    WHERE LOWER(email) = @email
      AND registration_status <> 'archived';
    `,
    (reqSql) => {
      reqSql.input("email", sql.NVarChar(255), trimmedEmail);
    },
  );

  return result.recordset?.[0] || null;
}

/**
 * Update the security_attempt_count for a volunteer.
 *
 * @param {number} id
 * @param {number} attempts
 * @returns {Promise<void>}
 */
export async function updateSecurityAttemptCount(id, attempts) {
  await exec(
    `
    UPDATE dbo.volunteer_in
    SET security_attempt_count = @attempts
    WHERE id = @id;
    `,
    (reqSql) => {
      reqSql.input("attempts", sql.Int, attempts);
      reqSql.input("id", sql.Int, id);
    },
  );
}

/**
 * Mark a volunteer account as compromised and redact PII.
 *
 * This preserves your existing behavior:
 *  - account_status = 'compromised'
 *  - wraps non-null firstName/lastName/suffix/email/phone in '**'
 *  - sets security_attempt_count = 3
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function markVolunteerCompromised(id) {
  await exec(
    `
    UPDATE dbo.volunteer_in
    SET
      account_status = 'compromised',
      firstName = CASE WHEN firstName IS NOT NULL THEN '**' + firstName + '**' ELSE NULL END,
      lastName  = CASE WHEN lastName  IS NOT NULL THEN '**' + lastName  + '**' ELSE NULL END,
      suffix    = CASE WHEN suffix    IS NOT NULL THEN '**' + suffix    + '**' ELSE NULL END,
      email     = CASE WHEN email     IS NOT NULL THEN '**' + email     + '**' ELSE NULL END,
      phone     = CASE WHEN phone     IS NOT NULL THEN '**' + phone     + '**' ELSE NULL END,
      security_attempt_count = 3
    WHERE id = @id;
    `,
    (reqSql) => {
      reqSql.input("id", sql.Int, id);
    },
  );
}

/**
 * Finalize continue-registration after successful name/phone checks.
 *
 * Behavior matches existing route:
 *  - If requireName = true: overwrite firstName/lastName/suffix with provided values.
 *  - If requireName = false: leave name fields as-is in DB.
 *  - If requirePhoneConfirm = true: overwrite phone with normalizedPhone.
 *  - If requirePhoneConfirm = false: leave phone as-is in DB.
 *  - Always set last_step to nextStep (e.g., 'personalInfo', 'congregationInfo', etc.).
 *  - Reset security_attempt_count to 0.
 *
 * @param {{
 *   id: number;
 *   requireName: boolean;
 *   requirePhoneConfirm: boolean;
 *   firstName?: string | null;
 *   lastName?: string | null;
 *   suffix?: string | null;
 *   normalizedPhone: string;
 *   nextStep: string; // e.g., "personalInfo" (no leading '/')
 * }} opts
 * @returns {Promise<void>}
 */
export async function finalizeContinueRegistration(opts) {
  const {
    id,
    requireName,
    requirePhoneConfirm,
    firstName,
    lastName,
    suffix,
    normalizedPhone,
    nextStep,
  } = opts;

  await exec(
    `
    UPDATE dbo.volunteer_in
    SET
      firstName = CASE WHEN @requireName = 1 THEN @fn ELSE firstName END,
      lastName  = CASE WHEN @requireName = 1 THEN @ln ELSE lastName END,
      suffix    = CASE WHEN @requireName = 1 THEN @sx ELSE suffix END,
      phone     = CASE WHEN @requirePhoneConfirm = 1 THEN @ph ELSE phone END,
      last_step = @nextStep,
      security_attempt_count = 0
    WHERE id = @id;
    `,
    (reqSql) => {
      reqSql.input("id", sql.Int, id);
      reqSql.input("requireName", sql.Bit, requireName ? 1 : 0);
      reqSql.input("requirePhoneConfirm", sql.Bit, requirePhoneConfirm ? 1 : 0);
      reqSql.input("fn", sql.NVarChar(100), firstName || null);
      reqSql.input("ln", sql.NVarChar(100), lastName || null);
      reqSql.input("sx", sql.NVarChar(20), suffix || null);
      reqSql.input("ph", sql.NVarChar(100), normalizedPhone || null);
      // nextStep stored without leading slash, e.g., "personalInfo"
      reqSql.input("nextStep", sql.VarChar(50), nextStep);
    },
  );
}

// ============================================================
// Get spiritual info (for summary, etc.)
// ============================================================

/**
 * Get spiritual info for a volunteer draft by registrationId.
 * @param {string} registrationId
 * @returns {Promise<any|null>}
 */
export async function getSpiritualInfo(registrationId) {
  const tsql = `
    SELECT
      auxPioneer,
      regPioneer,
      specPioneer,
      minServ,
      elder,
      sfs,
      gender      
    FROM dbo.volunteer_in
    WHERE registration_id = @registrationId;
  `;

  const result = await exec(tsql, (req) => {
    req.input("registrationId", sql.UniqueIdentifier, registrationId);
  });

  return result.recordset?.[0] ?? null;
}

// ============================================================
// Draft Inserts
// ============================================================

// lib/dbSync.js

/**
 * Insert a new draft registered volunteer with email + password.
 * If an abandoned draft already exists for this email, its password
 * credentials are updated in-place and the existing row is returned,
 * preserving any registration data already saved beyond step 1.
 *
 * Returns { id, registration_id }, or null on failure.
 *
 * @param {string} email
 * @param {string} rawPassword
 * @returns {Promise<{id:number, registration_id:string} | null>}
 */
export async function insertDraftEmailPass(email, rawPassword) {
  const trimmedEmail = (email || "").trim().toLowerCase();
  if (!trimmedEmail || !rawPassword) return null;

  const pwd = hashPassword(rawPassword);

  // Upsert pattern:
  //   1. Try to UPDATE an existing draft row for this email.
  //   2. If no draft existed (@@ROWCOUNT = 0), INSERT a new one.
  // Both branches write their result into @result so the caller
  // always gets back { id, registration_id }.
  const result = await exec(
    `
    DECLARE @result TABLE (id INT, registration_id UNIQUEIDENTIFIER);

    UPDATE dbo.volunteer_in
    SET
      passwordHash = @hash,
      passwordSalt = @salt,
      passwordIter = @iter,
      passwordAlgo = @algo,
      accountType  = 'registered',
      last_step    = 'emailPass'
    OUTPUT inserted.id, inserted.registration_id INTO @result
    WHERE email = @email
      AND registration_status = 'draft';

    IF @@ROWCOUNT = 0
    BEGIN
      INSERT INTO dbo.volunteer_in (
        email,
        passwordHash,
        passwordSalt,
        passwordIter,
        passwordAlgo,
        accountType,
        registration_status,
        last_step
      )
      OUTPUT inserted.id, inserted.registration_id INTO @result
      VALUES (
        @email,
        @hash,
        @salt,
        @iter,
        @algo,
        'registered',
        'draft',
        'emailPass'
      );
    END

    SELECT id, registration_id FROM @result;
    `,
    (reqSql) => {
      reqSql.input("email", sql.NVarChar(255), trimmedEmail);
      reqSql.input("hash", sql.VarBinary(32), pwd.hash);
      reqSql.input("salt", sql.VarBinary(16), pwd.salt);
      reqSql.input("iter", sql.Int, pwd.iterations);
      reqSql.input("algo", sql.NVarChar(100), pwd.algo);
    },
  );

  return result.recordset?.[0] || null;
}
/**
 * Insert a "non-registered" draft with name + email.
 * @param {string} firstName
 * @param {string} lastName
 * @param {string|null} suffix
 * @param {string} email
 * @returns {Promise<any|null>}
 */
export async function insertDraftNameEmail(firstName, lastName, suffix, email) {
  const sqlText = `
    INSERT INTO dbo.volunteer_in (
      firstName,
      lastName,
      suffix,
      email,
      accountType,
      registration_status,
      last_step
    )
    OUTPUT inserted.id, inserted.registration_id, inserted.accountType
    VALUES (
      @firstName,
      @lastName,
      @suffix,
      @email,
      'non-registered',
      'draft',
      'nonProfile'
    );
  `;

  log("[dbSync.insertDraftNameEmail] inserting new draft:", {
    firstName,
    lastName,
    suffix,
    email,
  });

  const result = await exec(sqlText, (req) => {
    req.input("firstName", sql.NVarChar(100), firstName);
    req.input("lastName", sql.NVarChar(100), lastName);
    req.input("suffix", sql.NVarChar(20), suffix || null);
    req.input("email", sql.NVarChar(255), email);
  });

  const row = result.recordset?.[0] ?? null;
  log("[dbSync.insertDraftNameEmail] inserted row:", row);
  return row;
}

// ============================================================
// Draft Updates
// ============================================================

/**
 * Update draft name+email for a registrationId.
 * @param {string} registrationId
 * @param {string} firstName
 * @param {string} lastName
 * @param {string|null} suffix
 * @param {string} email
 * @returns {Promise<any|null>}
 */
export async function updateDraftNameEmail(
  registrationId,
  firstName,
  lastName,
  suffix,
  email,
) {
  const sqlText = `
    UPDATE dbo.volunteer_in
    SET
      firstName = @firstName,
      lastName = @lastName,
      suffix = @suffix,
      email = @email,
      last_step = 'nonProfile',
      last_updated = SYSUTCDATETIME()
    OUTPUT inserted.id, inserted.registration_id, inserted.accountType
    WHERE registration_id = @registrationId
      AND registration_status = 'draft';
  `;

  log("[dbSync.updateDraftNameEmail] registrationId:", registrationId, {
    firstName,
    lastName,
    suffix,
    email,
  });

  const result = await exec(sqlText, (req) => {
    req.input("registrationId", sql.UniqueIdentifier, registrationId);
    req.input("firstName", sql.NVarChar(100), firstName);
    req.input("lastName", sql.NVarChar(100), lastName);
    req.input("suffix", sql.NVarChar(20), suffix || null);
    req.input("email", sql.NVarChar(255), email);
  });

  const row = result.recordset?.[0] ?? null;
  log("[dbSync.updateDraftNameEmail] recordset:", row);
  return row;
}

/**
 * Update draft phone + SMS + (optionally) name.
 * @param {string} registrationId
 * @param {string|null} firstName
 * @param {string|null} lastName
 * @param {string|null} suffix
 * @param {string} phone
 * @param {boolean} smsCapable
 * @returns {Promise<any|null>}
 */
export async function updateDraftNamePhone(
  registrationId,
  firstName,
  lastName,
  suffix,
  phone,
  smsCapable,
  whatsappid,
) {
  const sqlText = `
    UPDATE dbo.volunteer_in
    SET
      phone      = @phone,
      smsCapable = @smsCapable,
      whatsappid = @whatsappid,
      firstName  = COALESCE(@firstName, firstName),
      lastName   = COALESCE(@lastName, lastName),
      suffix     = COALESCE(@suffix,   suffix),
      last_step  = 'volunteerIn',
      last_updated = SYSUTCDATETIME()
    OUTPUT inserted.id
    WHERE registration_id = @registrationId
      AND registration_status = 'draft';
  `;

  const result = await exec(sqlText, (req) => {
    req.input("registrationId", sql.UniqueIdentifier, registrationId);
    req.input("firstName", sql.NVarChar(100), firstName);
    req.input("lastName", sql.NVarChar(100), lastName);
    req.input("suffix", sql.NVarChar(20), suffix);
    req.input("phone", sql.NVarChar(50), phone);
    req.input("smsCapable", sql.Bit, Boolean(smsCapable));
    req.input("whatsappid", sql.NVarChar(96), whatsappid || null);
  });

  return result.recordset?.[0] ?? null;
}

/**
 * Update draft personal info.
 * @param {string} registrationId
 * @param {{gender:string, dobirth:Date, stamina:number}} data
 * @returns {Promise<any|null>}
 */
export async function updateDraftPersonalInfo(registrationId, data) {
  const { gender, dobirth, stamina } = data;

  const sqlText = `
    UPDATE dbo.volunteer_in
    SET
      gender     = @gender,
      dobirth    = @dobirth,
      stamina    = @stamina,
      last_step  = 'personalInfo',
      last_updated = SYSUTCDATETIME()
    WHERE registration_id = @registrationId
      AND registration_status = 'draft';
  `;

  const result = await exec(sqlText, (req) => {
    req.input("registrationId", sql.UniqueIdentifier, registrationId);
    req.input("gender", sql.NVarChar(20), gender);
    req.input("dobirth", sql.Date, dobirth);
    req.input("stamina", sql.Int, stamina);
  });

  return result.recordset?.[0] ?? null;
}

/**
 * Update draft congregation info.
 * @param {string} registrationId
 * @param {{assignedToConv:boolean, congregation:string, attendExtra:boolean}} data
 * @returns {Promise<any|null>}
 */
export async function updateDraftCongregationInfo(registrationId, data) {
  let { assignedToConv, congregation, attendExtra } = data;

  // Normalize
  const trimmed =
    typeof congregation === "string" ? congregation.trim() : congregation;

  // If assignedToConv is true, NEVER allow blank congregation through.
  // This protects you even if some route or autosave accidentally sends "".
  if (assignedToConv) {
    if (!trimmed) {
      // You have two design choices:

      // 1) Hard fail (my recommended for drafts):
      throw new Error(
        "updateDraftCongregationInfo: blank congregation is not allowed when assignedToConv is true",
      );

      // 2) Or silently keep congregation as NULL and treat as unassigned:
      // assignedToConv = false;
      // congregation = null;
    } else {
      congregation = trimmed;
    }
  } else {
    // Visiting congregation or "no congregation assigned" path:
    // it's OK for congregation to be null here, because your route
    // already builds `${city}, ${state} - ${lang}` when required.
    congregation = trimmed || null;
  }

  const sqlText = `
    UPDATE dbo.volunteer_in
    SET
      assignedToConv = @assignedToConv,
      congregation   = @congregation,
      attendExtra    = @attendExtra,
      last_step      = 'congregationInfo',
      last_updated   = SYSUTCDATETIME()
    WHERE registration_id = @registrationId
      AND registration_status = 'draft';
  `;

  const result = await exec(sqlText, (req) => {
    req.input("registrationId", sql.UniqueIdentifier, registrationId);
    req.input("assignedToConv", sql.Bit, assignedToConv);
    req.input("congregation", sql.NVarChar(150), congregation);
    req.input("attendExtra", sql.Bit, attendExtra);
  });

  return result.recordset?.[0] ?? null;
}

/**
 * Update draft spiritual privileges.
 * @param {string} registrationId
 * @param {string[]} privilegeList
 * @returns {Promise<any|null>}
 */
export async function updateDraftSpiritualInfo(registrationId, privilegeList) {
  const privilegesOptions = [
    "auxPioneer",
    "regPioneer",
    "specPioneer",
    "minServ",
    "elder",
    "sfs",
  ];

  const sqlText = `
    UPDATE dbo.volunteer_in
    SET
      auxPioneer  = @auxPioneer,
      regPioneer  = @regPioneer,
      specPioneer = @specPioneer,
      minServ     = @minServ,
      elder       = @elder,
      sfs         = @sfs,
      last_step   = 'spiritualInfo',
      last_updated = SYSUTCDATETIME()
    WHERE registration_id = @registrationId
      AND registration_status = 'draft';
  `;

  const result = await exec(sqlText, (req) => {
    req.input("registrationId", sql.UniqueIdentifier, registrationId);
    for (const privilege of privilegesOptions) {
      req.input(privilege, sql.Bit, privilegeList.includes(privilege));
    }
  });

  return result.recordset?.[0] ?? null;
}

/**
 * Update draft notes.
 * @param {string} registrationId
 * @param {string} notes
 * @returns {Promise<any|null>}
 */
export async function updateDraftNotes(registrationId, notes) {
  const sqlText = `
    UPDATE dbo.volunteer_in
    SET notes      = @notes,
        last_step  = 'notes',
        last_updated = SYSUTCDATETIME()
    WHERE registration_id = @registrationId
      AND registration_status = 'draft';
  `;

  const result = await exec(sqlText, (req) => {
    req.input("registrationId", sql.UniqueIdentifier, registrationId);
    req.input("notes", sql.VarChar(2048), notes);
  });

  return result.recordset?.[0] ?? null;
}

/**
 * Mark a draft registration as completed.
 * @param {string} registrationId
 * @returns {Promise<boolean>}
 */
export async function markDraftCompleted(registrationId) {
  if (!registrationId) {
    throw new Error("markDraftCompleted: registrationId is required");
  }

  const sqlText = `
    UPDATE dbo.volunteer_in
    SET registration_status = 'completed',
        last_updated = SYSUTCDATETIME()
    WHERE registration_id = @registrationId;
  `;

  const result = await exec(sqlText, (req) => {
    req.input("registrationId", sql.UniqueIdentifier, registrationId);
  });

  const affected = Array.isArray(result.rowsAffected)
    ? result.rowsAffected.reduce((sum, n) => sum + n, 0)
    : result.rowsAffected || 0;

  return affected > 0;
}

// ============================================================
// Account Upgrades
// ============================================================
/**
 * Upgrade existing draft volunteer_in row to a registered account by setting password.
 * Returns { id, registration_id }.
 *
 * @param {string} email
 * @param {string} rawPassword
 * @returns {Promise<{id:number, registration_id:string} | null>}
 */
export async function upgradeDraftEmailPass(email, rawPassword) {
  const trimmedEmail = (email || "").trim().toLowerCase();
  if (!trimmedEmail || !rawPassword) return null;

  const pwd = hashPassword(rawPassword);

  const result = await exec(
    `
    UPDATE dbo.volunteer_in
    SET
      passwordHash = @hash,
      passwordSalt = @salt,
      passwordIter = @iter,
      passwordAlgo = @algo,
      accountType  = 'registered'
    WHERE LOWER(email) = @email
      AND registration_status <> 'archived';

    SELECT TOP (1)
      id,
      registration_id
    FROM dbo.volunteer_in
    WHERE LOWER(email) = @email
      AND registration_status <> 'archived';
    `,
    (reqSql) => {
      reqSql.input("email", sql.NVarChar(255), trimmedEmail);
      reqSql.input("hash", sql.VarBinary(32), pwd.hash);
      reqSql.input("salt", sql.VarBinary(16), pwd.salt);
      reqSql.input("iter", sql.Int, pwd.iterations);
      reqSql.input("algo", sql.NVarChar(100), pwd.algo);
    },
  );

  return result.recordset?.[0] || null;
}

// ============================================================
// Registered Volunteer Updates (My Account)
// ============================================================

/**
 * Update core contact info (email, phone, smsCapable, whatsappid) for a real user.
 *
 * @param {number} id
 * @param {{
 *   email: string,
 *   phone: string,
 *   smsCapable: boolean,
 *   whatsappid?: string | null
 * }} contact
 * @param {string} [editedBy]
 * @returns {Promise<import("mssql").IResult<any>>}
 */
export async function updateUserContact(
  id,
  { email, phone, smsCapable, whatsappid },
  editedBy,
) {
  const tsql = `
    UPDATE dbo.volunteer_in
    SET email        = @email,
        phone        = @phone,
        smsCapable   = @smsCapable,
        whatsappid   = @whatsappid,
        last_updated = SYSUTCDATETIME(),
        edited_by    = @editedBy
    WHERE id = @id;
  `;

  return exec(tsql, (req) => {
    req.input("email", sql.NVarChar(255), email);
    req.input("phone", sql.NVarChar(50), phone);
    req.input("smsCapable", sql.Bit, smsCapable ? 1 : 0);
    req.input(
      "whatsappid",
      sql.NVarChar(96),
      typeof whatsappid === "string" && whatsappid.trim() !== ""
        ? whatsappid
        : null,
    );
    req.input("editedBy", sql.NVarChar(50), editedBy || null);
    req.input("id", sql.Int, id);
  });
}

/**
 * Update personal info (DOB, gender, stamina) for real user.
 * @param {number} id
 * @param {{dobirthRaw?:string,genderRaw?:string,staminaRaw?:string}} param1
 * @param {string} [editedBy]
 * @returns {Promise<import("mssql").IResult<any>>}
 */
/**
 * Update personal info (DOB, gender, stamina) for a volunteer.
 *
 * @param {number} id
 * @param {{dobirthRaw?: string|null, genderRaw?: string|null, staminaRaw?: string|null}} personal
 * @param {string} [editedBy]
 * @returns {Promise<import("mssql").IResult<any>>}
 */
export async function updateUserPersonal(id, personal, editedBy) {
  const { dobirthRaw, genderRaw, staminaRaw } = personal || {};

  const tsql = `
    UPDATE dbo.volunteer_in
    SET
      dobirth      = @dobirth,
      gender       = @gender,
      stamina      = @stamina,
      last_updated = SYSUTCDATETIME(),
      edited_by    = @editedBy
    WHERE id = @id;
  `;

  return exec(tsql, (req) => {
    // DOB: convert YYYY-MM-DD → DATE or NULL
    req.input("dobirth", sql.Date, dobirthRaw ? new Date(dobirthRaw) : null);

    req.input("gender", sql.NVarChar(20), genderRaw || null);

    req.input("stamina", sql.Int, staminaRaw ? Number(staminaRaw) : null);

    req.input("editedBy", sql.NVarChar(50), editedBy || null);
    req.input("id", sql.Int, id);
  });
}

/**
 * Update congregation info for real user (assigned/visiting/extra session).
 * @param {number} id
 * @param {{
 *   congAssigned?:string,
 *   congregation?:string,
 *   congregationOtherCity?:string,
 *   congregationOtherState?:string,
 *   congregationOtherLang?:string,
 *   extraAttend?:string
 * }} param1
 * @param {string} [editedBy]
 * @returns {Promise<import("mssql").IResult<any>>}
 */
export async function updateUserCongregation(
  id,
  {
    congAssigned,
    congregation,
    congregationOtherCity,
    congregationOtherState,
    congregationOtherLang,
    extraAttend,
  },
  editedBy,
) {
  const assignedToConv = congAssigned === "yes";

  /** @type {string|null} */
  let congregationValue = null;

  if (assignedToConv) {
    congregationValue = congregation || null;
  } else {
    const city = (congregationOtherCity || "").trim();
    const state = (congregationOtherState || "").trim();
    const lang = (congregationOtherLang || "").trim();

    if (city || state || lang) {
      const left = state ? `${city}, ${state}` : city;
      congregationValue = lang ? `${left} - ${lang}` : left;
    } else {
      congregationValue = null;
    }
  }

  const attendExtra = extraAttend === "yes";

  const tsql = `
    UPDATE dbo.volunteer_in
    SET assignedToConv = @assignedToConv,
        congregation   = @congregation,
        attendExtra    = @attendExtra,
        last_updated   = SYSUTCDATETIME(),
        edited_by      = @editedBy
    WHERE id = @id;
  `;

  return exec(tsql, (req) => {
    req.input("assignedToConv", sql.Bit, assignedToConv ? 1 : 0);
    req.input("congregation", sql.NVarChar(255), congregationValue);
    req.input("attendExtra", sql.Bit, attendExtra ? 1 : 0);
    req.input("editedBy", sql.NVarChar(50), editedBy || null);
    req.input("id", sql.Int, id);
  });
}

/**
 * Update spiritual privileges (aux/reg/spec/minServ/elder/sfs) for real user.
 * @param {number} id
 * @param {string[]|string} [privileges=[]]
 * @param {string} [editedBy]
 * @returns {Promise<import("mssql").IResult<any>>}
 */
export async function updateUserSpiritual(id, privileges = [], editedBy) {
  const arr = Array.isArray(privileges) ? privileges : [privileges];
  const set = new Set(arr);

  const auxPioneer = set.has("auxPioneer");
  const regPioneer = set.has("regPioneer");
  const specPioneer = set.has("specPioneer");
  const minServ = set.has("minServ");
  const elder = set.has("elder");
  const sfs = set.has("sfs");

  const tsql = `
    UPDATE dbo.volunteer_in
    SET auxPioneer  = @auxPioneer,
        regPioneer  = @regPioneer,
        specPioneer = @specPioneer,
        minServ     = @minServ,
        elder       = @elder,
        sfs         = @sfs,
        last_updated = SYSUTCDATETIME(),
        edited_by    = @editedBy
    WHERE id = @id;
  `;

  return exec(tsql, (req) => {
    req.input("auxPioneer", sql.Bit, auxPioneer ? 1 : 0);
    req.input("regPioneer", sql.Bit, regPioneer ? 1 : 0);
    req.input("specPioneer", sql.Bit, specPioneer ? 1 : 0);
    req.input("minServ", sql.Bit, minServ ? 1 : 0);
    req.input("elder", sql.Bit, elder ? 1 : 0);
    req.input("sfs", sql.Bit, sfs ? 1 : 0);
    req.input("editedBy", sql.NVarChar(50), editedBy || null);
    req.input("id", sql.Int, id);
  });
}

/**
 * Update notes for real user.
 * @param {number} id
 * @param {string} notes
 * @param {string} [editedBy]
 * @returns {Promise<import("mssql").IResult<any>>}
 */
export async function updateUserNotes(id, notes, editedBy) {
  const tsql = `
    UPDATE dbo.volunteer_in
    SET notes        = @notes,
        last_updated = SYSUTCDATETIME(),
        edited_by    = @editedBy
    WHERE id = @id;
  `;

  return exec(tsql, (req) => {
    req.input("notes", sql.NVarChar(sql.MAX), notes || null);
    req.input("editedBy", sql.NVarChar(50), editedBy || null);
    req.input("id", sql.Int, id);
  });
}

/**
 * Update password for an existing volunteer (My Account & reset).
 *
 * @param {number} id
 * @param {{hash:Buffer, salt:Buffer, iterations:number, algo:string}} pwd
 * @param {string} editedBy
 */
export async function updateUserPassword(id, pwd, editedBy) {
  await exec(
    `
    UPDATE dbo.volunteer_in
    SET
      passwordHash = @hash,
      passwordSalt = @salt,
      passwordIter = @iter,
      passwordAlgo = @algo,
      last_updated = SYSUTCDATETIME(),
      edited_by    = @editedBy
    WHERE id = @id;
    `,
    (reqSql) => {
      reqSql.input("id", sql.Int, id);
      reqSql.input("hash", sql.VarBinary(32), pwd.hash);
      reqSql.input("salt", sql.VarBinary(16), pwd.salt);
      reqSql.input("iter", sql.Int, pwd.iterations);
      reqSql.input("algo", sql.NVarChar(100), pwd.algo);
      reqSql.input("editedBy", sql.NVarChar(50), editedBy || null);
    },
  );
}

// ============================================================
// Duplicate Checks
// ============================================================

/**
 * Check if a name (first, last, suffix) exists in non-archived records.
 * @param {string} firstName
 * @param {string} lastName
 * @param {string|null} suffix
 * @param {string|null} [excludeRegistrationId=null]
 * @returns {Promise<boolean>}
 */
export async function nameExists(
  firstName,
  lastName,
  suffix,
  excludeRegistrationId = null,
) {
  const sqlText = `
    SELECT 1
    FROM dbo.volunteer_in
    WHERE firstName = @firstName
      AND lastName = @lastName
      AND ISNULL(suffix, '') = ISNULL(@suffix, '')
      AND registration_status <> 'archived'
      AND (
        @excludeRegistrationId IS NULL
        OR registration_id <> @excludeRegistrationId
      );
  `;

  const res = await exec(sqlText, (req) => {
    req.input("firstName", sql.NVarChar(100), firstName);
    req.input("lastName", sql.NVarChar(100), lastName);
    req.input("suffix", sql.NVarChar(20), suffix || null);
    req.input(
      "excludeRegistrationId",
      sql.UniqueIdentifier,
      excludeRegistrationId,
    );
  });

  return res.recordset.length > 0;
}

/**
 * Check if a phone exists in non-archived records.
 * @param {string} phone
 * @param {string|null} [excludeRegistrationId=null]
 * @returns {Promise<boolean>}
 */
export async function phoneExists(phone, excludeRegistrationId = null) {
  const sqlText = `
    SELECT 1
    FROM dbo.volunteer_in
    WHERE phone = @phone
      AND registration_status <> 'archived'
      AND (
        @excludeRegistrationId IS NULL
        OR registration_id <> @excludeRegistrationId
      );
  `;

  const res = await exec(sqlText, (req) => {
    req.input("phone", sql.NVarChar(50), phone);
    req.input(
      "excludeRegistrationId",
      sql.UniqueIdentifier,
      excludeRegistrationId,
    );
  });

  return res.recordset.length > 0;
}

// REPLACE WITH:
/**
 * Check whether an email address is already registered in the system.
 *
 * @param {string} email - The email address to check.
 * @param {string|null} [excludeRegistrationId=null] - A registration_id to
 *   exclude from the check (used to allow a draft to re-validate its own email).
 * @param {boolean} [excludeDrafts=false] - When true, draft-status rows are
 *   excluded from the check, allowing a new submission to overwrite an
 *   abandoned draft with the same email.
 * @returns {Promise<boolean>}
 */
export async function emailExists(email, excludeRegistrationId = null, excludeDrafts = false) {
  const sqlText = `
    SELECT 1
    FROM dbo.volunteer_in
    WHERE email = @email
      AND registration_status <> 'archived'
      AND (
        @excludeRegistrationId IS NULL
        OR registration_id <> @excludeRegistrationId
      )
      AND (
        @excludeDrafts = 0
        OR registration_status <> 'draft'
      );
  `;

  const res = await exec(sqlText, (req) => {
    req.input("email", sql.NVarChar(255), email);
    req.input(
      "excludeRegistrationId",
      sql.UniqueIdentifier,
      excludeRegistrationId,
    );
    req.input("excludeDrafts", sql.Bit, excludeDrafts ? 1 : 0);
  });

  return res.recordset.length > 0;
}
/**
 * Look up an existing draft registration by email address.
 * Used to recover a lost session when a non-registered user returns
 * after their session has expired.
 *
 * @param {string} email
 * @returns {Promise<{id: number, registration_id: string, firstName: string, lastName: string, suffix: string|null} | null>}
 */
export async function getDraftByEmail(email) {
  const trimmedEmail = (email || "").trim().toLowerCase();
  if (!trimmedEmail) return null;

  const result = await exec(
    `
    SELECT TOP (1) id, registration_id, firstName, lastName, suffix
    FROM dbo.volunteer_in
    WHERE email = @email
      AND registration_status = 'draft';
    `,
    (req) => {
      req.input("email", sql.NVarChar(255), trimmedEmail);
    },
  );

  return result.recordset?.[0] || null;
}

/**
 * Check if either full name+suffix OR phone exists.
 * @param {string} firstName
 * @param {string} lastName
 * @param {string} phone
 * @param {string} suffix
 * @returns {Promise<any|null>}
 */
export async function namePhoneExists(firstName, lastName, phone, suffix) {
  const tsql = `
    SELECT TOP (1) id
    FROM dbo.volunteer_in
    WHERE (firstName = @firstName AND lastName = @lastName AND suffix = @suffix)
       OR (phone = @phone);
  `;

  const res = await exec(tsql, (req) => {
    req.input("firstName", sql.NVarChar(50), firstName);
    req.input("lastName", sql.NVarChar(50), lastName);
    req.input("suffix", sql.NVarChar(50), suffix);
    req.input("phone", sql.NVarChar(50), phone);
  });

  return res.recordset?.[0] ?? null;
}

// ============================================================
// Congregations
// ============================================================

/**
 * Get a list of congregations as "Congregation, State".
 * @returns {Promise<string[]>}
 */
export async function getCongregations() {
  const tsql = `SELECT * FROM dbo.congregations WHERE congregation IS NOT NULL AND LTRIM(RTRIM(congregation)) <> '' ORDER BY congregation`;

  try {
    const res = await exec(tsql);
    return (
      res.recordset?.map((item) => `${item.Congregation}, ${item.State}`) ?? []
    );
  } catch (error) {
    logError("Database query failed:", error);
    return [];
  }
}

/** @type {Promise<string[]>} */
export const congregations = getCongregations();

// ============================================================
// Diagnostics
// ============================================================

/**
 * Return DB identity (for diagnostics).
 * @returns {Promise<any>}
 */
export async function dbWhoAmI() {
  return whoAmI();
}

/**
 * Return DB health probe.
 * @returns {Promise<any>}
 */
export async function dbHealth() {
  return healthProbe();
}

// ============================================================
// Role Permissions
// ============================================================

/**
 * Load DB permission overrides and merge onto the PERMISSIONS defaults
 * from src/config/roles.js.
 *
 * Only rows that differ from the defaults are stored in role_permissions —
 * missing rows fall back to the static PERMISSIONS object.
 *
 * Call once at login and store the result in req.session.permissions.
 * Middleware should read from session, not call this on every request.
 *
 * @returns {Promise<Record<string, Record<string, boolean>>>}
 */
export async function loadMergedPermissions() {
  const result = await exec(`
        SELECT role_name, permission, is_granted
        FROM dbo.role_permissions;
    `);

  const merged = structuredClone(PERMISSIONS);

  for (const { role_name, permission, is_granted } of result.recordset) {
    if (merged[role_name]) {
      merged[role_name][permission] = !!is_granted;
    }
  }

  return merged;
}

/**
 * Fetch all volunteers with their current role, ordered by last name.
 * Used by the admin roles console.
 *
 * @returns {Promise<Array<{id:number, firstName:string, lastName:string, suffix:string|null, email:string, role:string}>>}
 */
export async function getAllVolunteersWithRoles() {
  const result = await exec(`
        SELECT
            id,
            firstName,
            lastName,
            suffix,
            email,
            role
        FROM dbo.volunteer_in
        WHERE registration_status <> 'archived'
          AND registration_status <> 'draft'
        ORDER BY lastName, firstName, suffix;
    `);

  return result.recordset || [];
}

/**
 * Update the role for a single volunteer.
 * Does NOT enforce canAssignRole — that must be done in the route before calling this.
 *
 * @param {number} targetId - ID of the volunteer being updated.
 * @param {string} newRole - New role name (must exist in dbo.roles).
 * @param {string} editedBy - Email of the actor making the change.
 * @returns {Promise<boolean>} true if a row was updated.
 */
export async function updateVolunteerRole(targetId, newRole, editedBy) {
  const result = await exec(
    `
        UPDATE dbo.volunteer_in
        SET role         = @role,
            last_updated = SYSUTCDATETIME(),
            edited_by    = @editedBy
        WHERE id = @id
          AND registration_status <> 'archived';
    `,
    (req) => {
      req.input("id", sql.Int, targetId);
      req.input("role", sql.NVarChar(20), newRole);
      req.input("editedBy", sql.NVarChar(50), editedBy || null);
    },
  );

  const affected = Array.isArray(result.rowsAffected)
    ? result.rowsAffected.reduce((sum, n) => sum + n, 0)
    : result.rowsAffected || 0;

  return affected > 0;
}

/**
 * Update role and crew assignments for a volunteer (oversight panel).
 *
 * Called from the Assignment accordion section on the edit volunteer page.
 * Overseers can set role to REGISTERED or KEYMAN only.
 * All five crew assignment BIT columns are written in one UPDATE.
 *
 * @param {number}   targetId
 * @param {string}   newRole            - 'REGISTERED' | 'KEYMAN'
 * @param {{
 *   crew_lots_garages:   boolean,
 *   crew_signs:          boolean,
 *   crew_security:       boolean,
 *   crew_mobile_support: boolean,
 *   crew_dropoff_pickup: boolean,
 * }} crews
 * @param {string}   editedBy
 * @returns {Promise<boolean>} true if a row was updated
 */
export async function updateVolunteerAssignment(
  targetId,
  newRole,
  crews,
  editedBy,
) {
  const result = await exec(
    `
        UPDATE dbo.volunteer_in
        SET role                = @role,
            crew_lots_garages   = @lotsGarages,
            crew_signs          = @signs,
            crew_security       = @security,
            crew_mobile_support = @mobileSupport,
            crew_dropoff_pickup = @dropoffPickup,
            last_updated        = SYSUTCDATETIME(),
            edited_by           = @editedBy
        WHERE id = @id
          AND registration_status = 'completed'
          AND registration_status <> 'archived';
    `,
    (req) => {
      req.input("id", sql.Int, targetId);
      req.input("role", sql.NVarChar(20), newRole);
      req.input("lotsGarages", sql.Bit, crews.crew_lots_garages ? 1 : 0);
      req.input("signs", sql.Bit, crews.crew_signs ? 1 : 0);
      req.input("security", sql.Bit, crews.crew_security ? 1 : 0);
      req.input("mobileSupport", sql.Bit, crews.crew_mobile_support ? 1 : 0);
      req.input("dropoffPickup", sql.Bit, crews.crew_dropoff_pickup ? 1 : 0);
      req.input("editedBy", sql.NVarChar(100), editedBy || "admin");
    },
  );

  const affected = Array.isArray(result.rowsAffected)
    ? result.rowsAffected.reduce((sum, n) => sum + n, 0)
    : result.rowsAffected || 0;

  return affected > 0;
}
/**
 * Find potential duplicate volunteers before creating a new account.
 *
 * Matches on any of:
 *  - Exact email match (highest signal)
 *  - Exact phone match (digits only)
 *  - Same first + last name (case-insensitive)
 *
 * Returns non-archived records only.
 *
 * @param {{
 *   firstName: string,
 *   lastName: string,
 *   phone?: string|null,
 *   email: string,
 * }} data
 * @returns {Promise<Array<{
 *   id: number,
 *   firstName: string|null,
 *   lastName: string|null,
 *   suffix: string|null,
 *   email: string|null,
 *   phone: string|null,
 *   registration_status: string,
 *   role: string,
 *   matchReason: string,
 * }>>}
 */
export async function findPotentialDuplicates({
  firstName,
  lastName,
  phone,
  email,
}) {
  // Normalize phone to digits only for comparison
  const phoneDigits = (phone || "").replace(/\D+/g, "") || null;

  const tsql = `
        SELECT
            id,
            firstName,
            lastName,
            suffix,
            email,
            phone,
            registration_status,
            role,
            CASE
                WHEN LOWER(email) = LOWER(@email) THEN 'email'
                WHEN @phoneDigits IS NOT NULL
                     AND LEN(@phoneDigits) >= 10
                     AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'(',''),')',''),'.','') = @phoneDigits THEN 'phone'
                ELSE 'name'
            END AS matchReason
        FROM dbo.volunteer_in
        WHERE registration_status <> 'archived'
          AND (
              LOWER(email) = LOWER(@email)
              OR (
                  @phoneDigits IS NOT NULL
                  AND LEN(@phoneDigits) >= 10
                  AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'(',''),')',''),'.','') = @phoneDigits
              )
              OR (
                  LOWER(firstName) = LOWER(@firstName)
                  AND LOWER(lastName) = LOWER(@lastName)
              )
          )
        ORDER BY
            CASE
                WHEN LOWER(email) = LOWER(@email) THEN 0
                WHEN @phoneDigits IS NOT NULL
                     AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'(',''),')',''),'.','') = @phoneDigits THEN 1
                ELSE 2
            END,
            lastName,
            firstName;
    `;

  const result = await exec(tsql, (req) => {
    req.input("email", sql.NVarChar(255), email.trim().toLowerCase());
    req.input("phoneDigits", sql.NVarChar(20), phoneDigits);
    req.input("firstName", sql.NVarChar(100), firstName.trim());
    req.input("lastName", sql.NVarChar(100), lastName.trim());
  });

  return result.recordset || [];
}

/**
 * Create a new fully-registered volunteer account from Oversight Tools.
 *
 * - Sets registration_status = 'completed', accountType = 'registered'
 * - Default role = 'REGISTERED'
 * - Password is hashed from `lastName + '1914'`
 * - Generates a UUID for registration_id
 *
 * @param {{
 *   firstName: string,
 *   lastName: string,
 *   suffix?: string|null,
 *   email: string,
 *   phone?: string|null,
 *   congregationId?: number|null,
 * }} data
 * @param {string} editedBy - Email or identifier of the admin performing the action.
 * @returns {Promise<number>} The new volunteer's `id`.
 */
export async function createVolunteerAccount(data, editedBy) {
  const {
    firstName,
    lastName,
    suffix,
    email,
    phone,
    // Congregation fields
    congAssigned, // 'yes' | 'no' | 'unknown'
    congregation, // congregation string when assigned
    congregationOtherCity,
    congregationOtherState,
    congregationOtherLang,
  } = data;

  const rawPassword = lastName.trim() + "1914";
  const { hash, salt, iterations, algo } = hashPassword(rawPassword);

  // ── Resolve congregation value (mirrors updateUserCongregation logic) ──
  let congregationValue = null;
  let assignedToConv = false;

  if (congAssigned === "yes") {
    assignedToConv = true;
    congregationValue = congregation?.trim() || null;
  } else if (congAssigned === "no") {
    assignedToConv = false;
    const city = (congregationOtherCity || "").trim();
    const state = (congregationOtherState || "").trim();
    const lang = (congregationOtherLang || "").trim();
    if (city || state || lang) {
      const left = state ? `${city}, ${state}` : city;
      congregationValue = lang ? `${left} - ${lang}` : left;
    }
  }
  // congAssigned === 'unknown' → both remain null/false

  const tsql = `
        INSERT INTO dbo.volunteer_in (
            registration_id,
            firstName,
            lastName,
            suffix,
            email,
            phone,
            passwordHash,
            passwordSalt,
            passwordIter,
            passwordAlgo,
            registration_status,
            accountType,
            role,
            last_step,
            assignedToConv,
            congregation,
            edited_by,
            last_updated
        )
        OUTPUT INSERTED.id
        VALUES (
            NEWID(),
            @firstName,
            @lastName,
            @suffix,
            @email,
            @phone,
            @passwordHash,
            @passwordSalt,
            @passwordIter,
            @passwordAlgo,
            'draft', -- Start as draft to ensure all required fields are set, then immediately update to completed below
            'registered', 
            'NON_REGISTERED',
            'emailPass',
            @assignedToConv,
            @congregation,
            @editedBy,
            SYSUTCDATETIME()
        );
    `;

  const result = await exec(tsql, (req) => {
    req.input("firstName", sql.NVarChar(100), firstName.trim());
    req.input("lastName", sql.NVarChar(100), lastName.trim());
    req.input("suffix", sql.NVarChar(20), suffix?.trim() || null);
    req.input("email", sql.NVarChar(255), email.trim().toLowerCase());
    req.input("phone", sql.NVarChar(30), phone?.trim() || null);
    req.input("passwordHash", sql.VarBinary(64), hash);
    req.input("passwordSalt", sql.VarBinary(32), salt);
    req.input("passwordIter", sql.Int, iterations);
    req.input("passwordAlgo", sql.NVarChar(50), algo);
    req.input("assignedToConv", sql.Bit, assignedToConv ? 1 : 0);
    req.input("congregation", sql.NVarChar(255), congregationValue);
    req.input("editedBy", sql.NVarChar(100), editedBy || "admin");
  });

  const newId = result.recordset?.[0]?.id;
  if (!newId) throw new Error("INSERT did not return a new id.");
  return newId;
}

/**
 * Fetch all volunteers with incomplete (draft) registrations.
 * Used by the admin send-reset tool.
 *
 * Returns only non-archived drafts that have at least an email or phone
 * so there's actually somewhere to send the link.
 *
 * @returns {Promise<Array<{
 *   id: number,
 *   firstName: string|null,
 *   lastName: string|null,
 *   suffix: string|null,
 *   email: string|null,
 *   phone: string|null,
 *   last_step: string|null,
 *   accountType: string,
 *   last_updated: Date|null,
 *   pending_pass_reset: boolean
 * }>>}
 */
export async function getIncompleteDraftVolunteers() {
  const result = await exec(`
        SELECT
            id,
            firstName,
            lastName,
            suffix,
            email,
            phone,
            last_step,
            accountType,
            last_updated,
            pending_pass_reset,
            last_pass_reset_sent_at,
            last_resume_email_sent_at,
            last_resume_sms_sent_at
        FROM dbo.volunteer_in
        WHERE registration_status = 'draft'
          AND registration_status <> 'archived'
          AND (email IS NOT NULL OR phone IS NOT NULL)
        ORDER BY lastName, firstName;
    `);

  return result.recordset || [];
}

/**
 * Fetch all completed (registered) volunteers who can be sent a password reset.
 * Used by the admin send-reset tool's "Registered" tab.
 *
 * @returns {Promise<Array<{
 *   id: number,
 *   firstName: string|null,
 *   lastName: string|null,
 *   suffix: string|null,
 *   email: string|null,
 *   phone: string|null,
 *   last_reset_email_sent_at: Date|null,
 *   last_reset_sms_sent_at: Date|null,
 * }>>}
 */
export async function getRegisteredVolunteers() {
  const result = await exec(`
        SELECT
            id,
            firstName,
            lastName,
            suffix,
            email,
            phone,
            last_reset_email_sent_at,
            last_reset_sms_sent_at
        FROM dbo.volunteer_in
        WHERE registration_status = 'completed'
          AND accountType = 'registered'
          AND registration_status <> 'archived'
          AND (email IS NOT NULL OR phone IS NOT NULL)
        ORDER BY lastName, firstName;
    `);
  return result.recordset || [];
}

/**
 * Fetch all rows from dbo.role_permissions (DB overrides only).
 * Returns an empty array if the table has no overrides yet.
 *
 * @returns {Promise<Array<{role_name: string, permission: string, is_granted: boolean}>>}
 */
export async function getRolePermissions() {
  const result = await exec(`
        SELECT role_name, permission, is_granted
        FROM dbo.role_permissions
        ORDER BY role_name, permission;
    `);
  return result.recordset || [];
}

/**
 * Insert or update a single role/permission override in dbo.role_permissions.
 * Uses MERGE so it works whether the row exists or not.
 *
 * @param {string}  roleName   - e.g. 'OVERSEER'
 * @param {string}  permission - e.g. 'sendMessages'
 * @param {boolean} isGranted  - true = grant, false = deny
 * @returns {Promise<void>}
 */
export async function upsertRolePermission(
  roleName,
  permission,
  isGranted,
  updatedById,
) {
  const tsql = `
        MERGE dbo.role_permissions AS target
        USING (SELECT @roleName AS role_name, @permission AS permission) AS source
        ON target.role_name = source.role_name AND target.permission = source.permission
        WHEN MATCHED THEN
            UPDATE SET is_granted   = @isGranted,
                       updated_by   = @updatedById
        WHEN NOT MATCHED THEN
            INSERT (role_name, permission, is_granted, updated_by)
            VALUES (@roleName, @permission, @isGranted, @updatedById);
    `;

  await exec(tsql, (req) => {
    req.input("roleName", sql.NVarChar(50), roleName);
    req.input("permission", sql.NVarChar(50), permission);
    req.input("isGranted", sql.Bit, isGranted ? 1 : 0);
    req.input("updatedById", sql.Int, updatedById || null);
  });
}

/**
 * Delete a single role/permission override from dbo.role_permissions.
 * Called when the user resets a permission back to its factory default.
 *
 * @param {string} roleName
 * @param {string} permission
 * @returns {Promise<void>}
 */
export async function deleteRolePermission(roleName, permission) {
  await exec(
    `
        DELETE FROM dbo.role_permissions
        WHERE role_name = @roleName
          AND permission = @permission;
    `,
    (req) => {
      req.input("roleName", sql.NVarChar(50), roleName);
      req.input("permission", sql.NVarChar(50), permission);
    },
  );
}

/**
 * Fetch volunteers not yet exported to Decently.
 * Returns rows where decently_exported is 0 or NULL.
 * Columns match what Decently expects.
 *
 * @returns {Promise<Array<{
 *   id: number,
 *   firstName: string|null,
 *   lastName: string|null,
 *   suffix: string|null,
 *   email: string|null,
 *   phone: string|null,
 *   congregation: string|null,
 *   role: string|null,
 *   notes: string|null,
 * }>>}
 */
export async function getDecentlyExportRows() {
  const result = await exec(`
        SELECT
            id,
            firstName,
            lastName,
            suffix,
            email,
            phone,
            congregation,
            role,
            notes
        FROM dbo.volunteer_in
        WHERE registration_status = 'completed'
          AND (decently_exported = 0 OR decently_exported IS NULL)
        ORDER BY lastName, firstName;
    `);
  return result.recordset || [];
}

/**
 * Mark a list of volunteer IDs as exported to Decently.
 *
 * @param {number[]} ids
 * @returns {Promise<void>}
 */
export async function markDecentlyExported(ids) {
  if (!ids || ids.length === 0) return;

  // Build a safe parameterised IN list
  const params = ids.map((_, i) => `@id${i}`).join(", ");
  const tsql = `
        UPDATE dbo.volunteer_in
        SET decently_exported           = 1,
            decently_exported_time      = SYSUTCDATETIME()
        WHERE id IN (${params});
    `;

  await exec(tsql, (req) => {
    ids.forEach((id, i) => req.input(`id${i}`, sql.Int, id));
  });
}

/**
 * Set the active_current_year flag for a volunteer.
 *
 * @param {number} targetId
 * @param {boolean} active - true = active, false = inactive
 * @param {string} editedBy
 * @returns {Promise<boolean>} true if a row was updated
 */
export async function setVolunteerActive(targetId, active, editedBy) {
  const result = await exec(
    `
        UPDATE dbo.volunteer_in
        SET active_current_year = @active,
            last_updated        = SYSUTCDATETIME(),
            edited_by           = @editedBy
        WHERE id = @id
          AND registration_status <> 'archived';
    `,
    (req) => {
      req.input("id", sql.Int, targetId);
      req.input("active", sql.Bit, active ? 1 : 0);
      req.input("editedBy", sql.NVarChar(100), editedBy || "admin");
    },
  );

  const affected = Array.isArray(result.rowsAffected)
    ? result.rowsAffected.reduce((sum, n) => sum + n, 0)
    : result.rowsAffected || 0;

  return affected > 0;
}
/**
 * Soft-delete a volunteer by setting registration_status to 'deleted'.
 * Preserves the prior status in deleted_status for reinstatement.
 * No-ops if the volunteer is already deleted or archived.
 *
 * @param {number} targetId
 * @param {string} deletedBy
 * @returns {Promise<boolean>} true if a row was updated.
 */
export async function softDeleteVolunteer(targetId, deletedBy) {
  const result = await exec(
    `UPDATE dbo.volunteer_in
     SET deleted_status       = registration_status,
         registration_status  = 'deleted',
         deleted_at           = SYSUTCDATETIME(),
         deleted_by           = @deletedBy,
         last_updated         = SYSUTCDATETIME(),
         edited_by            = @deletedBy
     WHERE id = @id
       AND registration_status NOT IN ('archived', 'deleted');`,
    (req) => {
      req.input('id',        sql.Int,           targetId);
      req.input('deletedBy', sql.NVarChar(100),  deletedBy || 'admin');
    },
  );

  return (result.rowsAffected?.[0] ?? 0) > 0;
}

/**
 * Reinstate a soft-deleted volunteer by restoring their prior
 * registration_status from deleted_status.
 * Falls back to 'completed' if deleted_status is somehow null.
 * No-ops if the volunteer is not currently deleted.
 *
 * @param {number} targetId
 * @param {string} reinstatedBy
 * @returns {Promise<boolean>} true if a row was updated.
 */
export async function reinstateVolunteer(targetId, reinstatedBy) {
  const result = await exec(
    `UPDATE dbo.volunteer_in
     SET registration_status = COALESCE(deleted_status, 'completed'),
         deleted_status      = NULL,
         deleted_at          = NULL,
         deleted_by          = NULL,
         last_updated        = SYSUTCDATETIME(),
         edited_by           = @reinstatedBy
     WHERE id = @id
       AND registration_status = 'deleted';`,
    (req) => {
      req.input('id',           sql.Int,          targetId);
      req.input('reinstatedBy', sql.NVarChar(100), reinstatedBy || 'admin');
    },
  );

  return (result.rowsAffected?.[0] ?? 0) > 0;
}

/**
 * Fetch all completed volunteers for Decently import matching.
 * Returns id, name fields, email, phone, and current active/import state.
 *
 * @returns {Promise<Array<{
 *   id: number,
 *   firstName: string|null,
 *   lastName: string|null,
 *   suffix: string|null,
 *   email: string|null,
 *   phone: string|null,
 *   active_current_year: boolean,
 *   decently_import: boolean,
 * }>>}
 */
export async function getVolunteersForImportMatch() {
  const result = await exec(`
        SELECT
            id,
            firstName,
            lastName,
            suffix,
            email,
            phone,
            active_current_year,
            decently_import
        FROM dbo.volunteer_in
        WHERE registration_status IN ('completed', 'draft')
          AND registration_status <> 'archived'
        ORDER BY lastName, firstName;
    `);
  return result.recordset || [];
}

/**
 * Apply the results of a Decently import:
 *  - Mark matched volunteer IDs as active + imported.
 *  - Mark unmatched DB volunteer IDs as inactive.
 *
 * Both lists are processed in a single transaction via two parameterised
 * UPDATE statements. Either list may be empty.
 *
 * @param {number[]} matchedIds   - IDs to set active_current_year=1, decently_import=1
 * @param {number[]} inactiveIds  - IDs to set active_current_year=0
 * @param {string}   editedBy
 * @returns {Promise<{ activated: number, deactivated: number }>}
 */
export async function applyDecentlyImport(matchedIds, inactiveIds, editedBy) {
  let activated = 0;
  let deactivated = 0;

  if (matchedIds.length > 0) {
    const params = matchedIds.map((_, i) => `@m${i}`).join(", ");
    const result = await exec(
      `
            UPDATE dbo.volunteer_in
            SET active_current_year    = 1,
                decently_import        = 1,
                decently_imported_time = SYSUTCDATETIME(),
                last_updated           = SYSUTCDATETIME(),
                edited_by              = @editedBy
            WHERE id IN (${params})
              AND registration_status <> 'archived';
        `,
      (req) => {
        matchedIds.forEach((id, i) => req.input(`m${i}`, sql.Int, id));
        req.input("editedBy", sql.NVarChar(100), editedBy || "admin");
      },
    );
    activated = Array.isArray(result.rowsAffected)
      ? result.rowsAffected.reduce((s, n) => s + n, 0)
      : result.rowsAffected || 0;
  }

  if (inactiveIds.length > 0) {
    const params = inactiveIds.map((_, i) => `@u${i}`).join(", ");
    const result = await exec(
      `
            UPDATE dbo.volunteer_in
            SET active_current_year = 0,
                last_updated        = SYSUTCDATETIME(),
                edited_by           = @editedBy
            WHERE id IN (${params})
              AND registration_status <> 'archived';
        `,
      (req) => {
        inactiveIds.forEach((id, i) => req.input(`u${i}`, sql.Int, id));
        req.input("editedBy", sql.NVarChar(100), editedBy || "admin");
      },
    );
    deactivated = Array.isArray(result.rowsAffected)
      ? result.rowsAffected.reduce((s, n) => s + n, 0)
      : result.rowsAffected || 0;
  }

  return { activated, deactivated };
}
/**
 * Fetch all locations and tasks for a given year.
 *
 * @param {number} year
 * @returns {Promise<Array<{
 *   id: number,
 *   year: number,
 *   name: string,
 *   type: string,
 *   description: string|null,
 *   capacity: number|null,
 *   address: string|null,
 *   lat: number|null,
 *   lng: number|null,
 *   maps_url: string|null,
 *   active: boolean,
 *   created_at: Date,
 *   created_by: string|null,
 * }>>}
 */
export async function getLocationsTasks(year) {
  const result = await exec(
    `
        SELECT
            id, year, name, type, description, capacity,
            address, lat, lng, maps_url, active, created_at, created_by
        FROM dbo.locations_tasks
        WHERE year = @year
        ORDER BY type DESC, name ASC;
    `,
    (req) => {
      req.input("year", sql.Int, year);
    },
  );
  return result.recordset || [];
}

/**
 * Insert a new location or task.
 *
 * @param {{
 *   year: number,
 *   name: string,
 *   type: 'location'|'task',
 *   description?: string|null,
 *   capacity?: number|null,
 *   address?: string|null,
 *   lat?: number|null,
 *   lng?: number|null,
 *   maps_url?: string|null,
 * }} data
 * @param {string} createdBy
 * @returns {Promise<number>} new record id
 */
export async function createLocationTask(data, createdBy) {
  const result = await exec(
    `
        INSERT INTO dbo.locations_tasks
            (year, name, type, description, capacity, address, lat, lng, maps_url, created_by)
        OUTPUT INSERTED.id
        VALUES
            (@year, @name, @type, @description, @capacity, @address, @lat, @lng, @maps_url, @createdBy);
    `,
    (req) => {
      req.input("year", sql.Int, data.year);
      req.input("name", sql.NVarChar(100), data.name.trim());
      req.input("type", sql.NVarChar(20), data.type);
      req.input(
        "description",
        sql.NVarChar(500),
        data.description?.trim() || null,
      );
      req.input(
        "capacity",
        sql.Int,
        data.capacity != null ? Number(data.capacity) : null,
      );
      req.input("address", sql.NVarChar(255), data.address?.trim() || null);
      req.input(
        "lat",
        sql.Decimal(9, 6),
        data.lat != null ? Number(data.lat) : null,
      );
      req.input(
        "lng",
        sql.Decimal(9, 6),
        data.lng != null ? Number(data.lng) : null,
      );
      req.input("maps_url", sql.NVarChar(500), data.maps_url?.trim() || null);
      req.input("createdBy", sql.NVarChar(100), createdBy || null);
    },
  );
  const id = result.recordset?.[0]?.id;
  if (!id) throw new Error("INSERT locations_tasks did not return id.");
  return id;
}

/**
 * Update an existing location or task.
 *
 * @param {number} id
 * @param {{
 *   name: string,
 *   type: 'location'|'task',
 *   description?: string|null,
 *   capacity?: number|null,
 *   address?: string|null,
 *   lat?: number|null,
 *   lng?: number|null,
 *   maps_url?: string|null,
 *   active: boolean,
 * }} data
 * @returns {Promise<boolean>} true if a row was updated
 */
export async function updateLocationTask(id, data) {
  const result = await exec(
    `
        UPDATE dbo.locations_tasks
        SET name        = @name,
            type        = @type,
            description = @description,
            capacity    = @capacity,
            address     = @address,
            lat         = @lat,
            lng         = @lng,
            maps_url    = @maps_url,
            active      = @active
        WHERE id = @id;
    `,
    (req) => {
      req.input("id", sql.Int, id);
      req.input("name", sql.NVarChar(100), data.name.trim());
      req.input("type", sql.NVarChar(20), data.type);
      req.input(
        "description",
        sql.NVarChar(500),
        data.description?.trim() || null,
      );
      req.input(
        "capacity",
        sql.Int,
        data.capacity != null ? Number(data.capacity) : null,
      );
      req.input("address", sql.NVarChar(255), data.address?.trim() || null);
      req.input(
        "lat",
        sql.Decimal(9, 6),
        data.lat != null ? Number(data.lat) : null,
      );
      req.input(
        "lng",
        sql.Decimal(9, 6),
        data.lng != null ? Number(data.lng) : null,
      );
      req.input("maps_url", sql.NVarChar(500), data.maps_url?.trim() || null);
      req.input("active", sql.Bit, data.active ? 1 : 0);
    },
  );
  const affected = Array.isArray(result.rowsAffected)
    ? result.rowsAffected.reduce((s, n) => s + n, 0)
    : result.rowsAffected || 0;
  return affected > 0;
}

/**
 * Toggle the active flag for a single location or task.
 *
 * @param {number} id
 * @param {boolean} active
 * @returns {Promise<boolean>}
 */
export async function setLocationTaskActive(id, active) {
  const result = await exec(
    `
        UPDATE dbo.locations_tasks
        SET active = @active
        WHERE id = @id;
    `,
    (req) => {
      req.input("id", sql.Int, id);
      req.input("active", sql.Bit, active ? 1 : 0);
    },
  );
  const affected = Array.isArray(result.rowsAffected)
    ? result.rowsAffected.reduce((s, n) => s + n, 0)
    : result.rowsAffected || 0;
  return affected > 0;
}

// ============================================================
// Event Types
// ============================================================

/**
 * Fetch all event types.
 * @returns {Promise<Array<{id:number, name:string, description:string|null,
 *   color:string|null, active:boolean, created_at:Date, created_by:string|null}>>}
 */
export async function getEventTypes() {
  const result = await exec(`
        SELECT id, name, description, color, active, created_at, created_by
        FROM dbo.event_types
        ORDER BY name;
    `);
  return result.recordset || [];
}

/**
 * Create a new event type.
 * @param {{name:string, description?:string|null, color?:string|null}} data
 * @param {string} createdBy
 * @returns {Promise<number>} new id
 */
export async function createEventType(data, createdBy) {
  const result = await exec(
    `
        INSERT INTO dbo.event_types (name, description, color, created_by)
        OUTPUT INSERTED.id
        VALUES (@name, @description, @color, @createdBy);
    `,
    (req) => {
      req.input("name", sql.NVarChar(100), data.name.trim());
      req.input(
        "description",
        sql.NVarChar(500),
        data.description?.trim() || null,
      );
      req.input("color", sql.NVarChar(7), data.color?.trim() || null);
      req.input("createdBy", sql.NVarChar(100), createdBy || null);
    },
  );
  const id = result.recordset?.[0]?.id;
  if (!id) throw new Error("INSERT event_types did not return id.");
  return id;
}

/**
 * Update an event type.
 * @param {number} id
 * @param {{name:string, description?:string|null, color?:string|null, active:boolean}} data
 * @returns {Promise<boolean>}
 */
export async function updateEventType(id, data) {
  const result = await exec(
    `
        UPDATE dbo.event_types
        SET name        = @name,
            description = @description,
            color       = @color,
            active      = @active
        WHERE id = @id;
    `,
    (req) => {
      req.input("id", sql.Int, id);
      req.input("name", sql.NVarChar(100), data.name.trim());
      req.input(
        "description",
        sql.NVarChar(500),
        data.description?.trim() || null,
      );
      req.input("color", sql.NVarChar(7), data.color?.trim() || null);
      req.input("active", sql.Bit, data.active ? 1 : 0);
    },
  );
  const affected = Array.isArray(result.rowsAffected)
    ? result.rowsAffected.reduce((s, n) => s + n, 0)
    : result.rowsAffected || 0;
  return affected > 0;
}

// ============================================================
// Convention Days
// ============================================================

/**
 * Fetch all convention days for a given year.
 * @param {number} year
 * @returns {Promise<Array<{id:number, year:number, label:string,
 *   convention_date:Date, program_start:string, program_end:string, notes:string|null}>>}
 */
export async function getConventionDays(year) {
  const result = await exec(
    `
        SELECT id, year, label, convention_date, program_start, program_end, notes
        FROM dbo.convention_days
        WHERE year = @year
        ORDER BY convention_date;
    `,
    (req) => {
      req.input("year", sql.Int, year);
    },
  );
  return result.recordset || [];
}

/**
 * Create a convention day.
 * @param {{year:number, label:string, convention_date:string,
 *   program_start:string, program_end:string, notes?:string|null}} data
 * @returns {Promise<number>}
 */
export async function createConventionDay(data) {
  const result = await exec(
    `
        INSERT INTO dbo.convention_days (year, label, convention_date, program_start, program_end, notes)
        OUTPUT INSERTED.id
        VALUES (@year, @label, @convention_date, @program_start, @program_end, @notes);
    `,
    (req) => {
      req.input("year", sql.Int, data.year);
      req.input("label", sql.NVarChar(50), data.label.trim());
      req.input(
        "convention_date",
        sql.Date,
        new Date(data.convention_date.slice(0, 10) + "T12:00:00Z"),
      );
      req.input("program_start", sql.NVarChar(8), data.program_start);
      req.input("program_end", sql.NVarChar(8), data.program_end);
      req.input("notes", sql.NVarChar(500), data.notes?.trim() || null);
    },
  );
  const id = result.recordset?.[0]?.id;
  if (!id) throw new Error("INSERT convention_days did not return id.");
  return id;
}

/**
 * Update a convention day.
 * @param {number} id
 * @param {{label:string, convention_date:string,
 *   program_start:string, program_end:string, notes?:string|null}} data
 * @returns {Promise<boolean>}
 */
export async function updateConventionDay(id, data) {
  const result = await exec(
    `
        UPDATE dbo.convention_days
        SET label           = @label,
            convention_date = @convention_date,
            program_start   = @program_start,
            program_end     = @program_end,
            notes           = @notes
        WHERE id = @id;
    `,
    (req) => {
      req.input("id", sql.Int, id);
      req.input("label", sql.NVarChar(50), data.label.trim());
      req.input(
        "convention_date",
        sql.Date,
        new Date(data.convention_date.slice(0, 10) + "T12:00:00Z"),
      );
      req.input("program_start", sql.NVarChar(8), data.program_start);
      req.input("program_end", sql.NVarChar(8), data.program_end);
      req.input("notes", sql.NVarChar(500), data.notes?.trim() || null);
    },
  );
  const affected = Array.isArray(result.rowsAffected)
    ? result.rowsAffected.reduce((s, n) => s + n, 0)
    : result.rowsAffected || 0;
  return affected > 0;
}

/**
 * Delete a convention day (and cascade-delete its sessions/shifts/assignments).
 * Only safe if no volunteer assignments exist yet.
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export async function deleteConventionDay(id) {
  // All four DELETEs run in a single round-trip.
  // Order satisfies FK constraints: assignments → shifts → sessions → day.
  const result = await exec(
    `
        DELETE sa FROM dbo.schedule_assignments sa
            INNER JOIN dbo.shifts sh ON sh.id = sa.shift_id
            INNER JOIN dbo.sessions se ON se.id = sh.session_id
            WHERE se.convention_day_id = @id;

        DELETE sh FROM dbo.shifts sh
            INNER JOIN dbo.sessions se ON se.id = sh.session_id
            WHERE se.convention_day_id = @id;

        DELETE FROM dbo.sessions WHERE convention_day_id = @id;

        DELETE FROM dbo.convention_days WHERE id = @id;
    `,
    (req) => {
      req.input("id", sql.Int, id);
    },
  );

  const affected = Array.isArray(result.rowsAffected)
    ? result.rowsAffected.reduce((s, n) => s + n, 0)
    : result.rowsAffected || 0;
  return affected > 0;
}
// ============================================================
// Sessions
// ============================================================

/**
 * Fetch all sessions for a convention day, ordered by session_order.
 * @param {number} conventionDayId
 * @returns {Promise<Array<{id:number, convention_day_id:number, label:string,
 *   session_order:number, start_time:string, end_time:string, notes:string|null}>>}
 */
export async function getSessions(conventionDayId) {
  const result = await exec(
    `
        SELECT id, convention_day_id, label, session_order, start_time, end_time, notes
        FROM dbo.sessions
        WHERE convention_day_id = @dayId
        ORDER BY start_time;
    `,
    (req) => {
      req.input("dayId", sql.Int, conventionDayId);
    },
  );
  return result.recordset || [];
}

/**
 * Create a session.
 * @param {{convention_day_id:number, label:string, session_order:number,
 *   start_time:string, end_time:string, notes?:string|null}} data
 * @returns {Promise<number>}
 */
export async function createSession(data) {
  const result = await exec(
    `
        INSERT INTO dbo.sessions (convention_day_id, label, session_order, start_time, end_time, notes)
        OUTPUT INSERTED.id
        VALUES (@dayId, @label, @session_order, @start_time, @end_time, @notes);
    `,
    (req) => {
      req.input("dayId", sql.Int, data.convention_day_id);
      req.input("label", sql.NVarChar(50), data.label.trim());
      req.input("session_order", sql.Int, Number(data.session_order));
      req.input("start_time", sql.NVarChar(8), data.start_time);
      req.input("end_time", sql.NVarChar(8), data.end_time);
      req.input("notes", sql.NVarChar(500), data.notes?.trim() || null);
    },
  );
  const id = result.recordset?.[0]?.id;
  if (!id) throw new Error("INSERT sessions did not return id.");
  return id;
}

/**
 * Update a session.
 * @param {number} id
 * @param {{label:string, session_order:number,
 *   start_time:string, end_time:string, notes?:string|null}} data
 * @returns {Promise<boolean>}
 */
export async function updateSession(id, data) {
  const result = await exec(
    `
        UPDATE dbo.sessions
        SET label         = @label,
            session_order = @session_order,
            start_time    = @start_time,
            end_time      = @end_time,
            notes         = @notes
        WHERE id = @id;
    `,
    (req) => {
      req.input("id", sql.Int, id);
      req.input("label", sql.NVarChar(50), data.label.trim());
      req.input("session_order", sql.Int, Number(data.session_order));
      req.input("start_time", sql.NVarChar(8), data.start_time);
      req.input("end_time", sql.NVarChar(8), data.end_time);
      req.input("notes", sql.NVarChar(500), data.notes?.trim() || null);
    },
  );
  const affected = Array.isArray(result.rowsAffected)
    ? result.rowsAffected.reduce((s, n) => s + n, 0)
    : result.rowsAffected || 0;
  return affected > 0;
}

/**
 * Delete a session and its shifts/assignments.
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export async function deleteSession(id) {
  const result = await exec(
    `
        DELETE FROM dbo.sessions WHERE id = @id;
    `,
    (req) => {
      req.input("id", sql.Int, id);
    },
  );
  const affected = Array.isArray(result.rowsAffected)
    ? result.rowsAffected.reduce((s, n) => s + n, 0)
    : result.rowsAffected || 0;
  return affected > 0;
}

// ============================================================
// Shifts
// ============================================================

/**
 * Fetch all shifts for a session, with event type name and color joined in.
 * @param {number} sessionId
 * @returns {Promise<Array<{id:number, session_id:number, event_type_id:number,
 *   event_type_name:string, event_type_color:string|null,
 *   label:string, start_time:string, end_time:string,
 *   volunteer_need:number|null, notes:string|null}>>}
 */
export async function getShifts(sessionId) {
  const result = await exec(
    `
        SELECT
            s.id, s.session_id, s.event_type_id,
            et.name  AS event_type_name,
            et.color AS event_type_color,
            s.label, s.start_time, s.end_time,
            s.volunteer_need, s.notes, s.invitable,
            s.sms_code, s.department
        FROM dbo.shifts s
        JOIN dbo.event_types et ON et.id = s.event_type_id
        WHERE s.session_id = @sessionId
        ORDER BY s.start_time, et.name;
    `,
    (req) => {
      req.input("sessionId", sql.Int, sessionId);
    },
  );
  return result.recordset || [];
}

/**
 * Create a shift.
 * @param {{session_id:number, event_type_id:number, label:string,
 *   start_time:string, end_time:string,
 *   volunteer_need?:number|null, notes?:string|null,
 *   sms_code?:string|null}} data
 * @returns {Promise<number>}
 */
export async function createShift(data) {
  const result = await exec(
    `
        INSERT INTO dbo.shifts
            (session_id, event_type_id, label, start_time, end_time, volunteer_need, notes, sms_code)
        OUTPUT INSERTED.id
        VALUES (@sessionId, @eventTypeId, @label, @start_time, @end_time, @volunteer_need, @notes, @smsCode);
    `,
    (req) => {
      req.input("sessionId",      sql.Int,          data.session_id);
      req.input("eventTypeId",    sql.Int,          data.event_type_id);
      req.input("label",          sql.NVarChar(50), data.label.trim());
      req.input("start_time",     sql.NVarChar(8),  data.start_time);
      req.input("end_time",       sql.NVarChar(8),  data.end_time);
      req.input(
        "volunteer_need",
        sql.Int,
        data.volunteer_need != null ? Number(data.volunteer_need) : null,
      );
      req.input("notes",    sql.NVarChar(500), data.notes?.trim()    || null);
      req.input("smsCode",  sql.NVarChar(8),   data.sms_code?.trim() || null);
    },
  );
  const id = result.recordset?.[0]?.id;
  if (!id) throw new Error("INSERT shifts did not return id.");
  return id;
}

/**
 * Update a shift.
 * @param {number} id
 * @param {{event_type_id:number, label:string, start_time:string,
 *   end_time:string, volunteer_need?:number|null, notes?:string|null,
 *   sms_code?:string|null}} data
 * @returns {Promise<boolean>}
 */
export async function updateShift(id, data) {
  const result = await exec(
    `
        UPDATE dbo.shifts
        SET event_type_id  = @eventTypeId,
            label          = @label,
            start_time     = @start_time,
            end_time       = @end_time,
            volunteer_need = @volunteer_need,
            notes          = @notes,
            sms_code       = @smsCode,
            invitable      = @invitable
        WHERE id = @id;
    `,
    (req) => {
      req.input("id",          sql.Int,          id);
      req.input("eventTypeId", sql.Int,          data.event_type_id);
      req.input("label",       sql.NVarChar(50), data.label.trim());
      req.input("start_time",  sql.NVarChar(8),  data.start_time);
      req.input("end_time",    sql.NVarChar(8),  data.end_time);
      req.input(
        "volunteer_need",
        sql.Int,
        data.volunteer_need != null ? Number(data.volunteer_need) : null,
      );
      req.input("notes",     sql.NVarChar(500), data.notes?.trim()    || null);
      req.input("smsCode",   sql.NVarChar(8),   data.sms_code?.trim() || null);
      req.input("invitable", sql.Bit,           data.invitable ? 1 : 0);
    },
  );
  const affected = Array.isArray(result.rowsAffected)
    ? result.rowsAffected.reduce((s, n) => s + n, 0)
    : result.rowsAffected || 0;
  return affected > 0;
}

/**
 * Generate a short SMS reply code for a shift from its schedule context.
 *
 * Format: {DAY2}{TYPE2}[{QUAL}] — max 7 chars, uppercase.
 *
 * Day codes (from convention_date day-of-week):
 *   SU MO TU WE TH FR SA
 *
 * Type codes (from event_type_name):
 *   IN  Ingress       EG  Egress       SC  Security
 *   SN  Signs         MT  Meeting      DO  Dropoff
 *   PU  Pickup        XX  unknown
 *
 * Qual codes (from shift label, omitted when redundant):
 *   A–F  Shift A through F
 *   M    Morning / AM
 *   E    Evening / PM / Late
 *
 * Examples:
 *   Fri, Ingress,  "Ingress"  → FRIN
 *   Fri, Security, "Shift A"  → FRSCA
 *   Sat, Dropoff,  "Morning"  → SADOM
 *   Thu, Meeting,  "Meeting"  → THMT
 *
 * @param {string|Date} conventionDate  ISO date string or Date for the convention day
 * @param {string}      eventTypeName   e.g. "Security", "Ingress"
 * @param {string}      shiftLabel      e.g. "Shift A", "Morning", "Ingress"
 * @returns {string}
 */
export function generateShiftCode(conventionDate, eventTypeName, shiftLabel) {
    const DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const d = new Date(
        typeof conventionDate === 'string'
            ? conventionDate + 'T12:00:00Z'
            : conventionDate,
    );
    const dayCode = DAY[d.getUTCDay()] ?? 'XX';

    const type = (eventTypeName || '').toUpperCase();
    let typeCode;
    if      (type.includes('INGRESS'))                             typeCode = 'IN';
    else if (type.includes('EGRESS'))                              typeCode = 'EG';
    else if (type.includes('SECURITY'))                            typeCode = 'SC';
    else if (type.includes('SIGN'))                                typeCode = 'SN';
    else if (type.includes('MEETING'))                             typeCode = 'MT';
    else if (type.includes('DROP'))                                typeCode = 'DO';
    else if (type.includes('PICKUP') || type.includes('PICK UP')) typeCode = 'PU';
    else                                                           typeCode = type.slice(0, 2) || 'XX';

    const label = (shiftLabel || '').toUpperCase().trim();
    let qual = '';
    const shiftMatch = label.match(/SHIFT\s+([A-F])\b/);
    if (shiftMatch) {
        qual = shiftMatch[1];
    } else if (label.includes('MORNING') || /\bAM\b/.test(label)) {
        qual = 'M';
    } else if (label.includes('EVENING') || label.includes('LATE') || /\bPM\b/.test(label)) {
        qual = 'E';
    }

    return (dayCode + typeCode + qual).toUpperCase();
}

/**
 * Delete a shift and its schedule assignments.
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export async function deleteShift(id) {
  // Remove child assignments first to satisfy the FK constraint
  await exec(
    `
        DELETE FROM dbo.schedule_assignments WHERE shift_id = @id;
    `,
    (req) => {
      req.input("id", sql.Int, id);
    },
  );
  const result = await exec(
    `
        DELETE FROM dbo.shifts WHERE id = @id;
    `,
    (req) => {
      req.input("id", sql.Int, id);
    },
  );
  const affected = Array.isArray(result.rowsAffected)
    ? result.rowsAffected.reduce((s, n) => s + n, 0)
    : result.rowsAffected || 0;
  return affected > 0;
}

// ============================================================
// Schedule Assignments (shift → location/task)
// ============================================================

/**
 * Fetch all schedule assignments for a shift, with location/task name joined in.
 * @param {number} shiftId
 * @returns {Promise<Array<{id:number, shift_id:number, location_task_id:number,
 *   location_task_name:string, location_task_type:string, volunteer_need:number|null, notes:string|null}>>}
 */
export async function getScheduleAssignments(shiftId) {
  const result = await exec(
    `
        SELECT
            sa.id, sa.shift_id, sa.location_task_id,
            lt.name AS location_task_name,
            lt.type AS location_task_type,
            sa.volunteer_need, sa.vol_min, sa.vol_max, sa.notes
        FROM dbo.schedule_assignments sa
        JOIN dbo.locations_tasks lt ON lt.id = sa.location_task_id
        WHERE sa.shift_id = @shiftId
        ORDER BY lt.type DESC, lt.name;
    `,
    (req) => {
      req.input("shiftId", sql.Int, shiftId);
    },
  );
  return result.recordset || [];
}

/**
 * Add a location/task to a shift.
 * @param {{shift_id:number, location_task_id:number, volunteer_need?:number|null, notes?:string|null}} data
 * @returns {Promise<number>}
 */
export async function createScheduleAssignment(data) {
  const result = await exec(
    `
        INSERT INTO dbo.schedule_assignments (shift_id, location_task_id, volunteer_need, vol_min, vol_max, notes)
        OUTPUT INSERTED.id
        VALUES (@shiftId, @locationTaskId, @volunteerNeed, @volMin, @volMax, @notes);
    `,
    (req) => {
      req.input("shiftId",       sql.Int,          data.shift_id);
      req.input("locationTaskId", sql.Int,          data.location_task_id);
      req.input("volunteerNeed", sql.Int,          data.volunteer_need != null ? Number(data.volunteer_need) : null);
      req.input("volMin",        sql.Int,          data.vol_min        != null ? Number(data.vol_min)        : null);
      req.input("volMax",        sql.Int,          data.vol_max        != null ? Number(data.vol_max)        : null);
      req.input("notes",         sql.NVarChar(500), data.notes?.trim() || null);
    },
  );
  const id = result.recordset?.[0]?.id;
  if (!id) throw new Error("INSERT schedule_assignments did not return id.");
  return id;
}

/**
 * Update volunteer_need and notes on an existing schedule assignment.
 * The location itself is not editable — delete and recreate for that.
 *
 * @param {number} id
 * @param {{volunteer_need?:number|null, notes?:string|null}} data
 * @returns {Promise<boolean>}
 */
export async function updateScheduleAssignment(id, data) {
  const result = await exec(
    `
        UPDATE dbo.schedule_assignments
        SET volunteer_need = @volunteerNeed,
            vol_min        = @volMin,
            vol_max        = @volMax,
            notes          = @notes
        WHERE id = @id;
    `,
    (req) => {
      req.input("id",            sql.Int,          id);
      req.input("volunteerNeed", sql.Int,          data.volunteer_need != null ? Number(data.volunteer_need) : null);
      req.input("volMin",        sql.Int,          data.vol_min        != null ? Number(data.vol_min)        : null);
      req.input("volMax",        sql.Int,          data.vol_max        != null ? Number(data.vol_max)        : null);
      req.input("notes",         sql.NVarChar(500), data.notes?.trim() || null);
    },
  );
  const affected = Array.isArray(result.rowsAffected)
    ? result.rowsAffected.reduce((s, n) => s + n, 0)
    : result.rowsAffected || 0;
  return affected > 0;
}

/**
 * Remove a schedule assignment.
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export async function deleteScheduleAssignment(id) {
  const result = await exec(
    `
        DELETE FROM dbo.schedule_assignments WHERE id = @id;
    `,
    (req) => {
      req.input("id", sql.Int, id);
    },
  );
  const affected = Array.isArray(result.rowsAffected)
    ? result.rowsAffected.reduce((s, n) => s + n, 0)
    : result.rowsAffected || 0;
  return affected > 0;
}

/**
 * Fetch a full timeline for a convention day — all sessions with their
 * shifts and schedule assignments nested in, for the timelines page.
 *
 * @param {number} conventionDayId
 * @returns {Promise<Array<{
 *   session: object,
 *   shifts: Array<{ shift: object, assignments: object[] }>
 * }>>}
 */
export async function getFullDayTimeline(conventionDayId) {
  const sessions = await getSessions(conventionDayId);

  const result = await Promise.all(
    sessions.map(async (session) => {
      const shifts = await getShifts(session.id);

      const shiftRows = await Promise.all(
        shifts.map(async (shift) => {
          const assignments = await getScheduleAssignments(shift.id);
          return { shift, assignments };
        }),
      );

      return { session, shifts: shiftRows };
    }),
  );

  return result;
}
/**
 * Copy a convention day and all its sessions, shifts, and schedule
 * assignments to a new day. Old ids are remapped to new ids at each
 * level so FK integrity is maintained.
 *
 * @param {number} sourceDayId - id of the day to copy from
 * @param {{
 *   year: number,
 *   label: string,
 *   convention_date: string,
 *   program_start: string,
 *   program_end: string,
 *   notes?: string|null
 * }} newDayData - data for the new day
 * @returns {Promise<number>} the new convention_day id
 */
export async function copyConventionDay(sourceDayId, newDayData) {
  /**
   * Convert a mssql TIME value (epoch-anchored Date object or ISO string)
   * to an "HH:MM:SS" string suitable for NVarChar(8) TIME inserts.
   * @param {Date|string|null} val
   * @returns {string|null}
   */
  function toTimeString(val) {
    if (!val) return null;
    const d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.valueOf())) return String(val).slice(0, 8);
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    const ss = String(d.getUTCSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  // 1. Create the new day and load source sessions in parallel
  const [newDayId, sourceSessions] = await Promise.all([
    createConventionDay(newDayData),
    getSessions(sourceDayId),
  ]);

  // 2. Process all sessions concurrently — each session's shifts are
  //    independent of every other session's shifts
  await Promise.all(
    sourceSessions.map(async (session) => {
      // 3. Create the session and load its source shifts in parallel
      const [newSessionId, sourceShifts] = await Promise.all([
        createSession({
          convention_day_id: newDayId,
          label: session.label,
          session_order: session.session_order,
          start_time: toTimeString(session.start_time),
          end_time: toTimeString(session.end_time),
          notes: session.notes || null,
        }),
        getShifts(session.id),
      ]);

      // 4. Process all shifts in this session concurrently
      await Promise.all(
        sourceShifts.map(async (shift) => {
          // 5. Create the shift and load its source assignments in parallel
          const [newShiftId, sourceAssignments] = await Promise.all([
            createShift({
              session_id: newSessionId,
              event_type_id: shift.event_type_id,
              label: shift.label,
              start_time: toTimeString(shift.start_time),
              end_time: toTimeString(shift.end_time),
              volunteer_need: shift.volunteer_need || null,
              notes: shift.notes || null,
            }),
            getScheduleAssignments(shift.id),
          ]);

          // 6. Create all assignments for this shift concurrently
          await Promise.all(
            sourceAssignments.map((assignment) =>
              createScheduleAssignment({
                shift_id:         newShiftId,
                location_task_id: assignment.location_task_id,
                volunteer_need:   assignment.volunteer_need || null,
                vol_min:          assignment.vol_min        || null,
                vol_max:          assignment.vol_max        || null,
                notes:            assignment.notes          || null,
              }),
            ),
          );
        }),
      );
    }),
  );

  return newDayId;
}

// ============================================================
// MESSAGING CENTER — Volunteers
// ============================================================

/**
 * Fetch all non-archived volunteers with the fields needed by the
 * Messaging Center: name, contact info, SMS capability, and active status.
 *
 * @returns {Promise<Array<{
 *   id: number,
 *   firstName: string,
 *   lastName: string,
 *   suffix: string|null,
 *   email: string|null,
 *   phone: string|null,
 *   smsCapable: boolean,
 *   active_current_year: boolean,
 *   registration_status: string
 * }>>}
 */
export async function getVolunteersForMessaging() {
    const result = await exec(`
        SELECT
            id,
            firstName,
            lastName,
            suffix,
            email,
            phone,
            smsCapable,
            active_current_year,
            registration_status
        FROM dbo.volunteer_in
        WHERE registration_status = 'completed'
        ORDER BY lastName, firstName, suffix;
    `);

    return (result.recordset || []).map((v) => ({
        id:                  v.id,
        firstName:           v.firstName   || '',
        lastName:            v.lastName    || '',
        suffix:              v.suffix      || null,
        email:               v.email       || null,
        phone:               v.phone       || null,
        smsCapable:         !!v.smsCapable,
        active_current_year: !!v.active_current_year,
        registration_status: v.registration_status || '',
    }));
}

// ============================================================
// MESSAGING CENTER — Invitations
// ============================================================


/**
 * Insert a single invitation record for one volunteer send.
 * Called once per volunteer per send operation.
 *
 * @param {{
 *   volunteerId:       number,
 *   token:             string,
 *   channel:           'email'|'sms'|'both',
 *   messageSubject:    string|null,
 *   messageBody:       string,
 *   sentBy:            string,
 *   conventionDayId?:  number|null,
 *   sessionId?:        number|null,
 *   shiftId?:          number|null,
 *   batchId?:          number|null
 * }} opts
 * @returns {Promise<number>} The new invitation id.
 */
export async function createInvitation({
    volunteerId,
    token,
    channel,
    messageSubject,
    messageBody,
    sentBy,
    conventionDayId = null,
    sessionId       = null,
    shiftId         = null,
    batchId         = null,
}) {
    const result = await exec(`
        INSERT INTO dbo.invitations
            (volunteer_id, token, channel, message_subject, message_body,
             sent_by, convention_day_id, session_id, shift_id, batch_id)
        OUTPUT INSERTED.id
        VALUES
            (@volunteerId, @token, @channel, @messageSubject, @messageBody,
             @sentBy, @conventionDayId, @sessionId, @shiftId, @batchId);
    `, (req) => {
        req.input('volunteerId',     sql.Int,               volunteerId);
        req.input('token',           sql.NVarChar(100),     token);
        req.input('channel',         sql.NVarChar(10),      channel);
        req.input('messageSubject',  sql.NVarChar(255),     messageSubject || null);
        req.input('messageBody',     sql.NVarChar(sql.MAX), messageBody);
        req.input('sentBy',          sql.NVarChar(100),     sentBy || null);
        req.input('conventionDayId', sql.Int,               conventionDayId || null);
        req.input('sessionId',       sql.Int,               sessionId       || null);
        req.input('shiftId',         sql.Int,               shiftId         || null);
        req.input('batchId',         sql.Int,               batchId         || null);
    });

    return result.recordset?.[0]?.id;
}

/**
 * Update an existing invitation row to record a reminder send.
 * Increments reminder_count, stamps last_reminded_at, and records
 * the channel and sender. The original token is preserved so the
 * volunteer's existing RSVP link continues to work.
 *
 * @param {object} params
 * @param {number} params.id          - Invitation primary key.
 * @param {string} params.channel     - 'email', 'sms', or 'both'.
 * @param {string} [params.remindedBy] - Email/identifier of the sender.
 * @returns {Promise<void>}
 */
export async function remindInvitation({ id, channel, remindedBy }) {
    await exec(`
        UPDATE dbo.invitations
        SET last_reminded_at      = SYSUTCDATETIME(),
            reminder_count        = reminder_count + 1,
            last_reminded_channel = @channel,
            last_reminded_by      = @remindedBy
        WHERE id = @id;
    `, (req) => {
        req.input('id',          sql.Int,          id);
        req.input('channel',     sql.NVarChar(10),  channel);
        req.input('remindedBy',  sql.NVarChar(100), remindedBy || null);
    });
}

/**
 * Fetch the existing unrevoked, unanswered invitation row for a given
 * volunteer + batch combination. Used by the reminder send path to
 * retrieve the token to reuse.
 *
 * @param {number} volunteerId
 * @param {number} batchId
 * @returns {Promise<{ id: number, token: string }|null>}
 */
export async function getInvitationByVolunteerBatch(volunteerId, batchId) {
    const result = await exec(`
        SELECT id, token
        FROM dbo.invitations
        WHERE volunteer_id  = @volunteerId
          AND batch_id      = @batchId
          AND revoked       = 0
          AND responded_at  IS NULL;
    `, (req) => {
        req.input('volunteerId', sql.Int, volunteerId);
        req.input('batchId',     sql.Int, batchId);
    });
    return result.recordset?.[0] || null;
}

/**
 * Fetch a single invitation by its unique response token.
 * Used by the public RSVP route to validate and display the response page.
 *
 * @param {string} token
 * @returns {Promise<{
 *   id: number,
 *   volunteer_id: number,
 *   token: string,
 *   sent_at: Date,
 *   channel: string,
 *   message_subject: string|null,
 *   message_body: string|null,
 *   responded_at: Date|null,
 *   response: string|null,
 *   firstName: string,
 *   lastName: string
 * }|null>}
 */
/**
 * Fetch a single invitation by its unique response token.
 * Joins volunteer name, convention day, shift, event type, and
 * the first schedule assignment location for the RSVP page.
 *
 * @param {string} token
 * @returns {Promise<{
 *   id: number,
 *   volunteer_id: number,
 *   token: string,
 *   sent_at: Date,
 *   channel: string,
 *   message_subject: string|null,
 *   message_body: string|null,
 *   responded_at: Date|null,
 *   response: string|null,
 *   firstName: string,
 *   lastName: string,
 *   convention_day_id: number|null,
 *   day_label: string|null,
 *   convention_date: Date|null,
 *   program_start: string|null,
 *   program_end: string|null,
 *   shift_id: number|null,
 *   shift_label: string|null,
 *   shift_start: string|null,
 *   shift_end: string|null,
 *   event_type_name: string|null,
 *   event_type_color: string|null,
 *   location_name: string|null
 * }|null>}
 */
export async function getInvitationByToken(token) {
    const result = await exec(`
        SELECT
            i.id,
            i.volunteer_id,
            i.token,
            i.sent_at,
            i.channel,
            i.message_subject,
            i.message_body,
            i.responded_at,
            i.response,
            v.firstName,
            v.lastName,
            i.convention_day_id,
            i.session_id,
            cd.label           AS day_label,
            cd.convention_date,
            cd.program_start,
            cd.program_end,
            i.shift_id,
            i.session_id,
            sh.label           AS shift_label,
            sh.start_time      AS shift_start,
            sh.end_time        AS shift_end,
            et.name            AS event_type_name,
            et.color           AS event_type_color,
            (
                SELECT TOP 1 lt.name
                FROM dbo.schedule_assignments sa
                JOIN dbo.locations_tasks lt ON lt.id = sa.location_task_id
                WHERE sa.shift_id = sh.id
                ORDER BY lt.name
            )                  AS location_name
        FROM dbo.invitations i
        INNER JOIN dbo.volunteer_in v
            ON v.id = i.volunteer_id
        LEFT JOIN dbo.convention_days cd
            ON cd.id = i.convention_day_id
        LEFT JOIN dbo.shifts sh
            ON sh.id = i.shift_id
        LEFT JOIN dbo.event_types et
            ON et.id = sh.event_type_id
        WHERE i.token = @token;
    `, (req) => {
        req.input('token', sql.NVarChar(100), token);
    });

    return result.recordset?.[0] || null;
}

/**
 * Record a volunteer's RSVP response against an invitation token.
 * Sets responded_at to the current UTC time and stores the response value.
 *
 * @param {string} token
 * @param {'yes'|'no'|'maybe'} response
 * @returns {Promise<boolean>} True if a row was updated, false if token not found.
 */
export async function markInvitationResponded(token, response) {
    const result = await exec(`
        UPDATE dbo.invitations
        SET
            responded_at = SYSUTCDATETIME(),
            response     = @response,
            last_updated = SYSUTCDATETIME()
        WHERE token = @token;
    `, (req) => {
        req.input('token',    sql.NVarChar(100), token);
        req.input('response', sql.NVarChar(50),  response);
    });

    return (result.rowsAffected?.[0] ?? 0) > 0;
}

// ============================================================
// MESSAGING CENTER — Message Templates
// ============================================================

/**
 * Fetch all active message templates, ordered by name.
 *
 * @returns {Promise<Array<{
 *   id: number,
 *   name: string,
 *   subject: string|null,
 *   body: string,
 *   created_by: string|null,
 *   created_at: Date,
 *   last_updated: Date|null
 * }>>}
 */
export async function getMessageTemplates() {
    const result = await exec(`
        SELECT id, name, subject, body, created_by, created_at, last_updated
        FROM dbo.message_templates
        WHERE active = 1
        ORDER BY name;
    `);

    return result.recordset || [];
}

/**
 * Fetch sessions for a convention day with their times formatted as strings.
 * Used by the scheduler to build time-period background bands.
 *
 * @param {number} dayId
 * @returns {Promise<Array<{id:number, label:string, start_time:string, end_time:string}>>}
 */
export async function getSessionsForDay(dayId) {
    const result = await exec(
        `SELECT id, label, start_time, end_time
         FROM dbo.sessions
         WHERE convention_day_id = @dayId
         ORDER BY start_time;`,
        (req) => req.input('dayId', sql.Int, dayId),
    );

    /**
     * Format a MSSQL TIME (epoch-anchored Date) as "h:mm AM/PM".
     * @param {Date|null} t
     * @returns {string|null}
     */
    function fmtTime(t) {
        if (!t) return null;
        const d = t instanceof Date ? t : new Date(t);
        const h  = d.getUTCHours();
        const m  = d.getUTCMinutes();
        const ap = h >= 12 ? 'PM' : 'AM';
        return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`;
    }

    return (result.recordset || []).map((r) => ({
        id:         r.id,
        label:      r.label || '',
        start_time: fmtTime(r.start_time),
        end_time:   fmtTime(r.end_time),
    }));
}

/**
 * Build a structured report dataset for a convention day.
 * Returns departments → shifts → locations with every assigned volunteer.
 *
 * @param {number} dayId
 * @returns {Promise<{
 *   day:         { id:number, label:string, convention_date:string },
 *   departments: Array<{
 *     key:    string,
 *     name:   string,
 *     shifts: Array<{
 *       id:        number,
 *       label:     string,
 *       start_time:string,
 *       end_time:  string,
 *       locations: Array<{
 *         id:           number,
 *         name:         string,
 *         keyman:       {id:number,firstName:string,lastName:string}|null,
 *         keyman_asst:  {id:number,firstName:string,lastName:string}|null,
 *         volunteers:   Array<{id:number,firstName:string,lastName:string}>
 *       }>
 *     }>
 *   }>
 * }>}
 */
export async function getSchedulerReportData(dayId) {
    const result = await exec(
        `SELECT
             cd.id                              AS day_id,
             cd.label                           AS day_label,
             CONVERT(VARCHAR(10), cd.convention_date, 120) AS convention_date,
             sh.id                              AS shift_id,
             sh.label                           AS shift_label,
             sh.department                      AS dept_key,
             sh.start_time                      AS shift_start,
             sh.end_time                        AS shift_end,
             sa.id                              AS assignment_id,
             lt.name                            AS location_name,
             ssa.slot_type,
             ssa.slot_index,
             v.id                               AS vol_id,
             v.firstName                        AS vol_first,
             v.lastName                         AS vol_last,
             v.phone                            AS vol_phone
         FROM dbo.convention_days cd
         JOIN dbo.sessions sess   ON sess.convention_day_id = cd.id
         JOIN dbo.shifts   sh     ON sh.session_id = sess.id
                                 AND sh.department IS NOT NULL
                                 AND sh.department <> ''
         JOIN dbo.schedule_assignments sa ON sa.shift_id = sh.id
         JOIN dbo.locations_tasks      lt ON lt.id = sa.location_task_id
         LEFT JOIN dbo.shift_slot_assignments ssa
             ON  ssa.schedule_assignment_id = sa.id
             AND ssa.convention_day_id       = cd.id
         LEFT JOIN dbo.volunteer_in v ON v.id = ssa.volunteer_id
         WHERE cd.id = @dayId
         ORDER BY
             sh.department,
             sh.start_time,
             lt.name,
             CASE ssa.slot_type
                 WHEN 'keyman'      THEN 0
                 WHEN 'keyman_asst' THEN 1
                 ELSE 2
             END,
             ssa.slot_index;`,
        (req) => req.input('dayId', sql.Int, dayId),
    );

    const rows = result.recordset || [];
    if (rows.length === 0) return { day: null, departments: [] };

    /**
     * Format a MSSQL TIME (epoch-anchored Date) as "h:mm AM/PM".
     * @param {Date|null} t
     * @returns {string|null}
     */
    function fmtT(t) {
        if (!t) return null;
        const d  = t instanceof Date ? t : new Date(t);
        const h  = d.getUTCHours();
        const m  = d.getUTCMinutes();
        const ap = h >= 12 ? 'PM' : 'AM';
        return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`;
    }

    const DEPT_NAMES = {
        lots_and_garages: 'Lots and Garages',
        signs:            'Signs',
        security:         'Security',
        dropoff_pickup:   'Drop-off / Pickup',
        mobile_support:   'Mobile Support',
    };
    const DEPT_ORDER = ['lots_and_garages', 'signs', 'security', 'dropoff_pickup', 'mobile_support'];

    /** @type {{id:number, label:string, convention_date:string}|null} */
    let day = null;
    /** @type {Record<string, {key:string, name:string, shifts:Record<number,object>}>} */
    const depts = {};

    for (const r of rows) {
        if (!day) {
            day = { id: r.day_id, label: r.day_label, convention_date: r.convention_date };
        }

        if (!depts[r.dept_key]) {
            depts[r.dept_key] = {
                key:    r.dept_key,
                name:   DEPT_NAMES[r.dept_key] || r.dept_key,
                shifts: {},
            };
        }

        const deptShifts = depts[r.dept_key].shifts;
        if (!deptShifts[r.shift_id]) {
            deptShifts[r.shift_id] = {
                id:         r.shift_id,
                label:      r.shift_label,
                start_time: fmtT(r.shift_start),
                end_time:   fmtT(r.shift_end),
                locations:  {},
            };
        }

        const locs = deptShifts[r.shift_id].locations;
        if (!locs[r.assignment_id]) {
            locs[r.assignment_id] = {
                id:          r.assignment_id,
                name:        r.location_name,
                keyman:      null,
                keyman_asst: null,
                volunteers:  [],
            };
        }

        if (r.vol_id) {
            const vol = { id: r.vol_id, firstName: r.vol_first, lastName: r.vol_last, phone: r.vol_phone || null };
            const loc = locs[r.assignment_id];
            if      (r.slot_type === 'keyman')      loc.keyman      = vol;
            else if (r.slot_type === 'keyman_asst') loc.keyman_asst = vol;
            else                                     loc.volunteers.push(vol);
        }
    }

    // Deduplicate across all slot types — keep each volunteer in their
    // highest role only (KM > KA > volunteer).
    for (const dept of Object.values(depts)) {
        for (const shift of Object.values(dept.shifts)) {
            for (const loc of Object.values(shift.locations)) {
                const seen = new Set();

                // KM is highest — always kept
                if (loc.keyman) seen.add(loc.keyman.id);

                // KA — drop if already listed as KM
                if (loc.keyman_asst) {
                    if (seen.has(loc.keyman_asst.id)) {
                        loc.keyman_asst = null;
                    } else {
                        seen.add(loc.keyman_asst.id);
                    }
                }

                // Regular volunteers — drop if already listed as KM or KA
                loc.volunteers = loc.volunteers.filter((v) => !seen.has(v.id));
            }
        }
    }

    return {
        day,
        departments: DEPT_ORDER
            .filter((k) => depts[k])
            .map((k) => ({
                ...depts[k],
                shifts: Object.values(depts[k].shifts).map((s) => ({
                    ...s,
                    locations: Object.values(s.locations),
                })),
            })),
    };
}

/**
 * Insert a new message template.
 *
 * @param {{
 *   name: string,
 *   subject: string|null,
 *   body: string,
 *   createdBy: string
 * }} opts
 * @returns {Promise<number>} The new template id.
 */
export async function createMessageTemplate({ name, subject, body, createdBy }) {
    const result = await exec(`
        INSERT INTO dbo.message_templates (name, subject, body, created_by)
        OUTPUT INSERTED.id
        VALUES (@name, @subject, @body, @createdBy);
    `, (req) => {
        req.input('name',      sql.NVarChar(100),      name);
        req.input('subject',   sql.NVarChar(255),      subject || null);
        req.input('body',      sql.NVarChar(sql.MAX),  body);
        req.input('createdBy', sql.NVarChar(100),      createdBy || null);
    });

    return result.recordset?.[0]?.id;
}

/**
 * Update an existing message template by id.
 * Stamps last_updated to current UTC time.
 *
 * @param {number} id
 * @param {{
 *   name: string,
 *   subject: string|null,
 *   body: string
 * }} fields
 * @returns {Promise<boolean>} True if a row was updated.
 */
export async function updateMessageTemplate(id, { name, subject, body }) {
    const result = await exec(`
        UPDATE dbo.message_templates
        SET
            name         = @name,
            subject      = @subject,
            body         = @body,
            last_updated = SYSUTCDATETIME()
        WHERE id = @id AND active = 1;
    `, (req) => {
        req.input('id',      sql.Int,           id);
        req.input('name',    sql.NVarChar(100), name);
        req.input('subject', sql.NVarChar(255), subject || null);
        req.input('body',    sql.NVarChar(sql.MAX), body);
    });

    return (result.rowsAffected?.[0] ?? 0) > 0;
}

/**
 * Soft-delete a message template by setting active = 0.
 * Hard deletes are avoided so sent invitation records retain their context.
 *
 * @param {number} id
 * @returns {Promise<boolean>} True if a row was updated.
 */
export async function deleteMessageTemplate(id) {
    const result = await exec(`
        UPDATE dbo.message_templates
        SET active = 0, last_updated = SYSUTCDATETIME()
        WHERE id = @id;
    `, (req) => {
        req.input('id', sql.Int, id);
    });

    return (result.rowsAffected?.[0] ?? 0) > 0;
}
// ============================================================
// MESSAGING CENTER — Event picker (for invite linking)
// ============================================================

/**
 * Fetch all convention days for the current year, each with their
 * sessions and shifts nested in. Used to build the cascading event
 * picker in the Messaging Center compose area.
 *
 * Returns days ordered by date. Within each day, sessions are ordered
 * by start_time. Within each session, shifts are ordered by start_time.
 * Event type name and color are joined onto each shift.
 *
 * @param {number} year
 * @returns {Promise<Array<{
 *   id: number,
 *   label: string,
 *   convention_date: Date,
 *   program_start: string,
 *   program_end: string,
 *   sessions: Array<{
 *     id: number,
 *     label: string,
 *     start_time: string,
 *     end_time: string,
 *     shifts: Array<{
 *       id: number,
 *       label: string,
 *       start_time: string,
 *       end_time: string,
 *       event_type_name: string,
 *       event_type_color: string|null
 *     }>
 *   }>
 * }>>}
 */
export async function getConventionDaysWithShifts(year) {
    const result = await exec(`
        SELECT
            cd.id          AS day_id,
            cd.label       AS day_label,
            cd.convention_date,
            cd.program_start,
            cd.program_end,
            se.id          AS session_id,
            se.label       AS session_label,
            se.start_time  AS session_start,
            se.end_time    AS session_end,
            sh.id          AS shift_id,
            sh.label       AS shift_label,
            sh.start_time  AS shift_start,
            sh.end_time    AS shift_end,
            et.name        AS event_type_name,
            et.color       AS event_type_color
        FROM dbo.convention_days cd
        LEFT JOIN dbo.sessions se
            ON se.convention_day_id = cd.id
        LEFT JOIN dbo.shifts sh
            ON sh.session_id = se.id
        LEFT JOIN dbo.event_types et
            ON et.id = sh.event_type_id
        WHERE cd.year = @year
        ORDER BY
            cd.convention_date,
            se.start_time,
            sh.start_time;
    `, (req) => {
        req.input('year', sql.Int, year);
    });

    // ── Nest into day → session → shift hierarchy ──────────────────────
    /** @type {Map<number, object>} */
    const dayMap = new Map();

    for (const row of (result.recordset || [])) {
        // Day
        if (!dayMap.has(row.day_id)) {
            dayMap.set(row.day_id, {
                id:              row.day_id,
                label:           row.day_label,
                convention_date: row.convention_date,
                program_start:   row.program_start,
                program_end:     row.program_end,
                sessions:        new Map(),
            });
        }
        const day = dayMap.get(row.day_id);

        if (!row.session_id) continue; // day has no sessions yet

        // Session
        if (!day.sessions.has(row.session_id)) {
            day.sessions.set(row.session_id, {
                id:         row.session_id,
                label:      row.session_label,
                start_time: row.session_start,
                end_time:   row.session_end,
                shifts:     [],
            });
        }
        const session = day.sessions.get(row.session_id);

        if (!row.shift_id) continue; // session has no shifts yet

        // Shift (avoid dupes from the LEFT JOIN)
        if (!session.shifts.some((s) => s.id === row.shift_id)) {
            session.shifts.push({
                id:               row.shift_id,
                label:            row.shift_label,
                start_time:       row.shift_start,
                end_time:         row.shift_end,
                event_type_name:  row.event_type_name  || '',
                event_type_color: row.event_type_color || null,
            });
        }
    }

    // Convert nested Maps to arrays for JSON serialisation
    return Array.from(dayMap.values()).map((day) => ({
        ...day,
        sessions: Array.from(day.sessions.values()),
    }));
}

// ============================================================
// MESSAGING CENTER — Invitation Tracker queries
// ============================================================

/**
 * Fetch all invitations with volunteer name, event context, and response
 * status for the Invitation Tracker page.
 *
 * Optionally filter by:
 *  - conventionDayId  — only invitations linked to a specific day
 *  - response         — 'yes' | 'no' | 'maybe' | 'pending' (null responded_at)
 *
 * Returns rows ordered by sent_at DESC so newest sends appear first.
 *
 * @param {{
 *   conventionDayId?: number|null,
 *   response?: 'yes'|'no'|'maybe'|'pending'|'all'
 * }} [filters={}]
 * @returns {Promise<Array<{
 *   id: number,
 *   volunteer_id: number,
 *   firstName: string,
 *   lastName: string,
 *   token: string,
 *   sent_at: Date,
 *   channel: string,
 *   message_subject: string|null,
 *   responded_at: Date|null,
 *   response: string|null,
 *   sent_by: string|null,
 *   convention_day_id: number|null,
 *   day_label: string|null,
 *   convention_date: Date|null,
 *   shift_id: number|null,
 *   shift_label: string|null,
 *   shift_start: string|null,
 *   shift_end: string|null,
 *   event_type_name: string|null,
 *   event_type_color: string|null
 * }>>}
 */
// export async function getInvitationsForTracker({ conventionDayId = null, response = 'all' } = {}) {
//     const filters = [];
//     if (conventionDayId) filters.push('i.convention_day_id = @dayId');
//     if (response === 'pending') filters.push('i.responded_at IS NULL');
//     else if (response === 'yes')   filters.push("i.response = 'yes'");
//     else if (response === 'no')    filters.push("i.response = 'no'");
//     else if (response === 'maybe') filters.push("i.response = 'maybe'");

//     const whereClause = filters.length > 0
//         ? 'WHERE ' + filters.join(' AND ')
//         : '';

//     const tsql = `
//         SELECT
//             i.id,
//             i.volunteer_id,
//             v.firstName,
//             v.lastName,
//             i.token,
//             i.sent_at,
//             i.channel,
//             i.message_subject,
//             i.responded_at,
//             i.response,
//             i.sent_by,
//             i.convention_day_id,
//             cd.label           AS day_label,
//             cd.convention_date,
//             i.shift_id,
//             i.session_id,
//             sh.label           AS shift_label,
//             sh.start_time      AS shift_start,
//             sh.end_time        AS shift_end,
//             et.name            AS event_type_name,
//             et.color           AS event_type_color
//         FROM dbo.invitations i
//         INNER JOIN dbo.volunteer_in v
//             ON v.id = i.volunteer_id
//         LEFT JOIN dbo.convention_days cd
//             ON cd.id = i.convention_day_id
//         LEFT JOIN dbo.shifts sh
//             ON sh.id = i.shift_id
//         LEFT JOIN dbo.event_types et
//             ON et.id = sh.event_type_id
//         ${whereClause}
//         ORDER BY i.sent_at DESC;
//     `;

//     const result = await exec(tsql, (req) => {
//         if (conventionDayId) req.input('dayId', sql.Int, conventionDayId);
//     });

//     return result.recordset || [];
// }

/**
 * For a given list of volunteer IDs and a convention day, return the IDs
 * of volunteers who already have an open (unanswered) invitation for that day.
 * Used by the send route to warn before double-sending.
 *
 * @param {number[]} volunteerIds
 * @param {number} conventionDayId
 * @returns {Promise<number[]>} Subset of volunteerIds that have pending invites.
 */
export async function getVolunteersWithPendingInvites(volunteerIds, conventionDayId) {
    if (!volunteerIds.length) return [];

    const params = volunteerIds.map((_, i) => `@v${i}`).join(', ');
    const result = await exec(`
        SELECT DISTINCT volunteer_id
        FROM dbo.invitations
        WHERE convention_day_id = @dayId
          AND responded_at IS NULL
          AND volunteer_id IN (${params});
    `, (req) => {
        req.input('dayId', sql.Int, conventionDayId);
        volunteerIds.forEach((id, i) => req.input(`v${i}`, sql.Int, id));
    });

    return (result.recordset || []).map((r) => r.volunteer_id);
}

/**
 * Pending invite check at deepest context level:
 * shift > session > day.
 */
export async function getVolunteersWithPendingInvitesDeep(
  volunteerIds,
  { conventionDayId = null, sessionId = null, shiftId = null } = {}
) {
  if (!volunteerIds.length || !conventionDayId) return [];

  const params = volunteerIds.map((_, i) => `@v${i}`).join(", ");

  // Determine “key” by choosing the deepest provided context
  const useShift = !!shiftId;
  const useSession = !useShift && !!sessionId;
  const useDay = !useShift && !useSession && !!conventionDayId;

  const result = await exec(`
    SELECT DISTINCT volunteer_id
    FROM dbo.invitations
    WHERE responded_at IS NULL
      AND volunteer_id IN (${params})
      AND (
        (${useShift ? 1 : 0} = 1 AND shift_id = @shiftId)
        OR
        (${useSession ? 1 : 0} = 1 AND shift_id IS NULL AND session_id = @sessionId)
        OR
        (${useDay ? 1 : 0} = 1 AND shift_id IS NULL AND session_id IS NULL AND convention_day_id = @dayId)
      );
  `, (req) => {
    req.input("dayId", sql.Int, conventionDayId);
    req.input("sessionId", sql.Int, sessionId);
    req.input("shiftId", sql.Int, shiftId);
    volunteerIds.forEach((id, i) => req.input(`v${i}`, sql.Int, id));
  });

  return (result.recordset || []).map(r => r.volunteer_id);
}

/**
 * Check whether a volunteer has already acknowledged ("yes")
 * a meeting (convention day).
 */
export async function hasAcceptedMeeting(volunteerId, conventionDayId) {
  const result = await exec(`
    SELECT TOP 1 1
    FROM dbo.invitations
    WHERE volunteer_id = @volunteerId
      AND convention_day_id = @dayId
      AND responded_at IS NOT NULL
      AND response = 'yes'
  `, (req) => {
    req.input('volunteerId', sql.Int, volunteerId);
    req.input('dayId', sql.Int, conventionDayId);
  });

  return result.recordset.length > 0;
}
/**
 * True if volunteer already responded "yes" for the same context key:
 * shift > session > day.
 */
export async function hasAcceptedInviteContext(
  volunteerId,
  { conventionDayId = null, sessionId = null, shiftId = null } = {}
) {
  const useShift = !!shiftId;
  const useSession = !useShift && !!sessionId;
  const useDay = !useShift && !useSession && !!conventionDayId;

  if (!useShift && !useSession && !useDay) return false;

  const result = await exec(`
    SELECT TOP 1 1
    FROM dbo.invitations
    WHERE volunteer_id = @volunteerId
      AND responded_at IS NOT NULL
      AND response = 'yes'
      AND (
        (${useShift ? 1 : 0} = 1 AND shift_id = @shiftId)
        OR
        (${useSession ? 1 : 0} = 1 AND shift_id IS NULL AND session_id = @sessionId)
        OR
        (${useDay ? 1 : 0} = 1 AND shift_id IS NULL AND session_id IS NULL AND convention_day_id = @dayId)
      );
  `, (req) => {
    req.input("volunteerId", sql.Int, volunteerId);
    req.input("dayId", sql.Int, conventionDayId);
    req.input("sessionId", sql.Int, sessionId);
    req.input("shiftId", sql.Int, shiftId);
  });

  return result.recordset.length > 0;
}

// ============================================================
// INVITATION BATCHES
// ============================================================

/**
 * Fetch all active invitation batches for a given year, with
 * convention day and shift context joined in. Ordered by created_at DESC.
 *
 * @param {number} year
 * @returns {Promise<Array<{
 *   id: number,
 *   name: string,
 *   convention_day_id: number|null,
 *   shift_id: number|null,
 *   day_label: string|null,
 *   convention_date: Date|null,
 *   shift_label: string|null,
 *   event_type_name: string|null,
 *   message_subject: string|null,
 *   message_body: string|null,
 *   year: number,
 *   created_by: string|null,
 *   created_at: Date,
 *   volunteer_count: number
 * }>>}
 */
export async function getInvitationBatches(year) {
    const result = await exec(
      `
SELECT
            b.id,
            b.name,
            b.convention_day_id,
            b.shift_id,
            b.parent_batch_id,
            pb.name            AS parent_name,
            b.response_needed,
            cd.label           AS day_label,
            cd.convention_date,
            sh.label           AS shift_label,
            et.name            AS event_type_name,
            b.message_subject,
            b.message_body,
            b.year,
            b.created_by,
            b.created_at,
            COUNT(CASE
            WHEN i.revoked = 0
              OR i.revoked IS NULL
              THEN i.id END)
            AS volunteer_count
            FROM dbo.invitation_batches b
        LEFT JOIN dbo.invitation_batches pb ON pb.id = b.parent_batch_id
        LEFT JOIN dbo.convention_days cd ON cd.id = b.convention_day_id
        LEFT JOIN dbo.shifts sh           ON sh.id = b.shift_id
        LEFT JOIN dbo.event_types et      ON et.id = sh.event_type_id
        LEFT JOIN dbo.invitations i       ON i.batch_id = b.id
        WHERE b.year   = @year
          AND b.active = 1
        GROUP BY
            b.id, b.name, b.convention_day_id, b.shift_id,
            b.parent_batch_id, pb.name, b.response_needed,
            cd.label, cd.convention_date,
            sh.label, et.name,
            b.message_subject, b.message_body,
            b.year, b.created_by, b.created_at
        ORDER BY
            COALESCE(b.parent_batch_id, b.id),
            b.parent_batch_id,
            b.created_at DESC;
    `,
      (req) => {
        req.input("year", sql.Int, year);
      },
    );

    return result.recordset || [];
}

/**
 * Fetch a single invitation batch by id with full context.
 *
 * @param {number} id
 * @returns {Promise<object|null>}
 */
export async function getInvitationBatch(id) {
    const result = await exec(
      `
SELECT
            b.id,
            b.name,
            b.convention_day_id,
            b.shift_id,
            b.parent_batch_id,
            pb.name            AS parent_name,
            b.response_needed,
            cd.label           AS day_label,
            cd.convention_date,
            cd.program_start,
            cd.program_end,
            sh.label           AS shift_label,
            sh.start_time      AS shift_start,
            sh.end_time        AS shift_end,
            et.name            AS event_type_name,
            et.color           AS event_type_color,
            b.message_subject,
            b.message_body,
            b.year,
            b.created_by,
            b.created_at,
            b.last_updated,
            (
                SELECT STRING_AGG(lt.name, ', ') WITHIN GROUP (ORDER BY lt.name)
                FROM dbo.schedule_assignments sa
                JOIN dbo.locations_tasks lt ON lt.id = sa.location_task_id
                WHERE sa.shift_id = sh.id
            )                  AS location_names,
            (
                SELECT TOP 1 lt.address
                FROM dbo.schedule_assignments sa
                JOIN dbo.locations_tasks lt ON lt.id = sa.location_task_id
                WHERE sa.shift_id = sh.id
                ORDER BY lt.name
            )                  AS location_address,
            (
                SELECT TOP 1 lt.maps_url
                FROM dbo.schedule_assignments sa
                JOIN dbo.locations_tasks lt ON lt.id = sa.location_task_id
                WHERE sa.shift_id = sh.id
                ORDER BY lt.name
            )                  AS location_maps_url,
            (
                SELECT COUNT(*)
                FROM dbo.schedule_assignments sa
                WHERE sa.shift_id = sh.id
            )                  AS location_count
        FROM dbo.invitation_batches b
        LEFT JOIN dbo.invitation_batches pb ON pb.id = b.parent_batch_id
        LEFT JOIN dbo.convention_days cd ON cd.id = b.convention_day_id
        LEFT JOIN dbo.shifts sh           ON sh.id = b.shift_id
        LEFT JOIN dbo.event_types et      ON et.id = sh.event_type_id
        WHERE b.id = @id;
    `,
      (req) => {
        req.input("id", sql.Int, id);
      },
    );

    return result.recordset?.[0] || null;
}

/**
 * Create a new invitation batch. Returns the new batch id.
 *
 * @param {{
 *   name: string,
 *   conventionDayId: number|null,
 *   shiftId: number|null,
 *   messageSubject: string|null,
*   messageBody: string,
 *   year: number,
 *   createdBy: string,
 *   parentBatchId?: number|null,
 *   responseNeeded?: boolean
 * }} opts
 * @returns {Promise<number>}
 */
export async function createInvitationBatch({
    name,
    conventionDayId,
    shiftId,
    messageSubject,
    messageBody,
    year,
    createdBy,
    parentBatchId = null,
    responseNeeded = true,
}) {
    const result = await exec(`
        INSERT INTO dbo.invitation_batches
            (name, convention_day_id, shift_id, message_subject,
             message_body, year, created_by, parent_batch_id, response_needed)
        OUTPUT INSERTED.id
        VALUES
            (@name, @conventionDayId, @shiftId, @messageSubject,
             @messageBody, @year, @createdBy, @parentBatchId, @responseNeeded);
    `, (req) => {
        req.input('name',             sql.NVarChar(150),     name);
        req.input('conventionDayId',  sql.Int,               conventionDayId || null);
        req.input('shiftId',          sql.Int,               shiftId || null);
        req.input('messageSubject',   sql.NVarChar(255),     messageSubject || null);
        req.input('messageBody',      sql.NVarChar(sql.MAX), messageBody);
        req.input('year',             sql.Int,               year);
        req.input('createdBy',        sql.NVarChar(100),     createdBy || null);
        req.input('parentBatchId',    sql.Int,               parentBatchId || null);
        req.input('responseNeeded',   sql.Bit,               responseNeeded ? 1 : 0);
    });

    const id = result.recordset?.[0]?.id;
    if (!id) throw new Error('INSERT invitation_batches did not return id.');
    return id;
}

/**
 * Update an existing invitation batch's editable fields.
 *
 * Only the fields explicitly passed are written — all are required
 * in practice since the edit form always submits the full set.
 *
 * @param {{
 *   id:              number,
 *   name:            string,
 *   messageSubject:  string|null,
 *   messageBody:     string,
 *   parentBatchId:   number|null,
 *   responseNeeded:  boolean,
 *   active:          boolean,
 * }} opts
 * @returns {Promise<boolean>} true if a row was updated, false if not found.
 */
export async function updateInvitationBatch({
    id,
    name,
    messageSubject,
    messageBody,
    parentBatchId,
    responseNeeded,
    active,
}) {
    const result = await exec(`
        UPDATE dbo.invitation_batches
        SET
            name             = @name,
            message_subject  = @messageSubject,
            message_body     = @messageBody,
            parent_batch_id  = @parentBatchId,
            response_needed  = @responseNeeded,
            active           = @active,
            last_updated     = SYSUTCDATETIME()
        WHERE id = @id;
    `, (req) => {
        req.input('id',              sql.Int,               id);
        req.input('name',            sql.NVarChar(150),     name);
        req.input('messageSubject',  sql.NVarChar(255),     messageSubject || null);
        req.input('messageBody',     sql.NVarChar(sql.MAX), messageBody);
        req.input('parentBatchId',   sql.Int,               parentBatchId || null);
        req.input('responseNeeded',  sql.Bit,               responseNeeded ? 1 : 0);
        req.input('active',          sql.Bit,               active ? 1 : 0);
    });

    return (result.rowsAffected?.[0] ?? 0) > 0;
}

/**
 * Auto-generate a batch name from event context.
 * Falls back to "General Invite" if no event is linked.
 * Called server-side when the client sends suggestBatchName = true.
 *
 * @param {{
 *   dayLabel: string|null,
 *   conventionDate: Date|string|null,
 *   shiftLabel: string|null,
 *   eventTypeName: string|null,
 * }} context
 * @returns {string}
 */
export function suggestBatchName({ dayLabel, conventionDate, shiftLabel, eventTypeName } = {}) {
    if (!dayLabel) return 'General Invite';

    const datePart = conventionDate
        ? new Date(conventionDate).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', timeZone: 'UTC',
          })
        : null;

    const parts = [dayLabel];
    if (datePart) parts.push(datePart);
    if (eventTypeName) parts.push(eventTypeName);
    if (shiftLabel) parts.push(`(${shiftLabel})`);

    return parts.join(' · ');
}

// ============================================================
// INVITATION REVOCATION
// ============================================================

/**
 * Revoke a single invitation. Sets revoked = 1 and writes to the
 * revocation log.
 *
 * @param {number} invitationId
 * @param {string} revokedBy
 * @param {string|null} [notes]
 * @returns {Promise<boolean>} True if a row was updated.
 */
export async function revokeInvitation(invitationId, revokedBy, notes = null) {
    // Fetch volunteer_id and batch_id for the log
    const inv = await exec(`
        SELECT volunteer_id, batch_id FROM dbo.invitations WHERE id = @id;
    `, (req) => {
        req.input('id', sql.Int, invitationId);
    });

    const row = inv.recordset?.[0];
    if (!row) return false;

    await exec(`
        UPDATE dbo.invitations
        SET revoked    = 1,
            revoked_at = SYSUTCDATETIME(),
            revoked_by = @revokedBy
        WHERE id = @id;
    `, (req) => {
        req.input('id',        sql.Int,           invitationId);
        req.input('revokedBy', sql.NVarChar(100), revokedBy || null);
    });

    await exec(`
        INSERT INTO dbo.invitation_revocation_log
            (invitation_id, volunteer_id, batch_id, action, actioned_by, notes)
        VALUES
            (@invitationId, @volunteerId, @batchId, 'revoked', @actionedBy, @notes);
    `, (req) => {
        req.input('invitationId', sql.Int,           invitationId);
        req.input('volunteerId',  sql.Int,           row.volunteer_id);
        req.input('batchId',      sql.Int,           row.batch_id || null);
        req.input('actionedBy',   sql.NVarChar(100), revokedBy || null);
        req.input('notes',        sql.NVarChar(500), notes || null);
    });

    return true;
}

/**
 * Reinstate a previously revoked invitation.
 * Clears revoked flag and writes a reinstatement entry to the log.
 *
 * @param {number} invitationId
 * @param {string} reinstatedBy
 * @param {string|null} [notes]
 * @returns {Promise<boolean>}
 */
export async function reinstateInvitation(invitationId, reinstatedBy, notes = null) {
    const inv = await exec(`
        SELECT volunteer_id, batch_id FROM dbo.invitations WHERE id = @id;
    `, (req) => {
        req.input('id', sql.Int, invitationId);
    });

    const row = inv.recordset?.[0];
    if (!row) return false;

    await exec(`
        UPDATE dbo.invitations
        SET revoked    = 0,
            revoked_at = NULL,
            revoked_by = NULL
        WHERE id = @id;
    `, (req) => {
        req.input('id', sql.Int, invitationId);
    });

    await exec(`
        INSERT INTO dbo.invitation_revocation_log
            (invitation_id, volunteer_id, batch_id, action, actioned_by, notes)
        VALUES
            (@invitationId, @volunteerId, @batchId, 'reinstated', @actionedBy, @notes);
    `, (req) => {
        req.input('invitationId', sql.Int,           invitationId);
        req.input('volunteerId',  sql.Int,           row.volunteer_id);
        req.input('batchId',      sql.Int,           row.batch_id || null);
        req.input('actionedBy',   sql.NVarChar(100), reinstatedBy || null);
        req.input('notes',        sql.NVarChar(500), notes || null);
    });

    return true;
}

/**
 * Fetch the full revocation/reinstatement log for a single invitation.
 *
 * @param {number} invitationId
 * @returns {Promise<Array<{
 *   id: number,
 *   action: string,
 *   actioned_by: string|null,
 *   actioned_at: Date,
 *   notes: string|null
 * }>>}
 */
export async function getRevocationLog(invitationId) {
    const result = await exec(`
        SELECT id, action, actioned_by, actioned_at, notes
        FROM dbo.invitation_revocation_log
        WHERE invitation_id = @id
        ORDER BY actioned_at DESC;
    `, (req) => {
        req.input('id', sql.Int, invitationId);
    });

    return result.recordset || [];
}

// ============================================================
// SHIFTS — Invitable flag
// ============================================================

/**
 * Toggle the invitable flag on a shift.
 *
 * @param {number} id
 * @param {boolean} invitable
 * @returns {Promise<boolean>}
 */
export async function setShiftInvitable(id, invitable) {
    const result = await exec(`
        UPDATE dbo.shifts
        SET invitable = @invitable
        WHERE id = @id;
    `, (req) => {
        req.input('id',        sql.Int, id);
        req.input('invitable', sql.Bit, invitable ? 1 : 0);
    });

    const affected = Array.isArray(result.rowsAffected)
        ? result.rowsAffected.reduce((s, n) => s + n, 0)
        : result.rowsAffected || 0;
    return affected > 0;
}

/**
 * Fetch convention days with shifts filtered to invitable = 1 only.
 * Used by the Messaging Center event picker.
 * Days with no invitable shifts are still returned — the sessions/shifts
 * arrays will be empty so the UI can show an appropriate message.
 *
 * @param {number} year
 * @returns {Promise<Array<object>>}
 */
export async function getInvitableDaysWithShifts(year) {
    const result = await exec(`
        SELECT
            cd.id          AS day_id,
            cd.label       AS day_label,
            cd.convention_date,
            cd.program_start,
            cd.program_end,
            se.id          AS session_id,
            se.label       AS session_label,
            se.start_time  AS session_start,
            se.end_time    AS session_end,
            sh.id          AS shift_id,
            sh.label       AS shift_label,
            sh.start_time  AS shift_start,
            sh.end_time    AS shift_end,
            et.name        AS event_type_name,
            et.color       AS event_type_color
        FROM dbo.convention_days cd
        LEFT JOIN dbo.sessions se
            ON se.convention_day_id = cd.id
        LEFT JOIN dbo.shifts sh
            ON sh.session_id = se.id
           AND sh.invitable = 1
        LEFT JOIN dbo.event_types et
            ON et.id = sh.event_type_id
        WHERE cd.year = @year
        ORDER BY
            cd.convention_date,
            se.start_time,
            sh.start_time;
    `, (req) => {
        req.input('year', sql.Int, year);
    });

    const dayMap = new Map();

    for (const row of (result.recordset || [])) {
        if (!dayMap.has(row.day_id)) {
            dayMap.set(row.day_id, {
                id:              row.day_id,
                label:           row.day_label,
                convention_date: row.convention_date,
                program_start:   row.program_start,
                program_end:     row.program_end,
                sessions:        new Map(),
            });
        }
        const day = dayMap.get(row.day_id);

        if (!row.session_id) continue;

        if (!day.sessions.has(row.session_id)) {
            day.sessions.set(row.session_id, {
                id:         row.session_id,
                label:      row.session_label,
                start_time: row.session_start,
                end_time:   row.session_end,
                shifts:     [],
            });
        }
        const session = day.sessions.get(row.session_id);

        if (!row.shift_id) continue;

        if (!session.shifts.some((s) => s.id === row.shift_id)) {
            session.shifts.push({
                id:               row.shift_id,
                label:            row.shift_label,
                start_time:       row.shift_start,
                end_time:         row.shift_end,
                event_type_name:  row.event_type_name  || '',
                event_type_color: row.event_type_color || null,
            });
        }
    }

    return Array.from(dayMap.values()).map((day) => ({
        ...day,
        sessions: Array.from(day.sessions.values()),
    }));
}

// ============================================================
// SMS OPT-IN / OPT-OUT
// ============================================================

/**
 * Stamp SMS opt-in on a volunteer record.
 * No-ops if already opted in this year — checks sms_opted_in_at
 * within the current calendar year.
 *
 * @param {number} volunteerId
 * @param {'rsvp'|'admin'|'webhook'} source
 * @returns {Promise<boolean>} True if the record was updated.
 */
export async function setVolunteerSmsOptIn(volunteerId, source) {
    const result = await exec(`
        UPDATE dbo.volunteer_in
        SET sms_opted_in        = 1,
            sms_opted_in_at     = SYSUTCDATETIME(),
            sms_opted_in_source = @source,
            sms_opted_out       = 0,
            sms_opted_out_at    = NULL
        WHERE id = @id
          AND (
              sms_opted_in = 0
              OR YEAR(sms_opted_in_at) < YEAR(SYSUTCDATETIME())
          );
    `, (req) => {
        req.input('id',     sql.Int,           volunteerId);
        req.input('source', sql.NVarChar(100), source || 'admin');
    });

    const affected = Array.isArray(result.rowsAffected)
        ? result.rowsAffected.reduce((s, n) => s + n, 0)
        : result.rowsAffected || 0;
    return affected > 0;
}

/**
 * Handle a Twilio opt-out (STOP/UNSTOP/HELP) webhook event.
 *
 * - Logs the raw event to sms_opt_out_log
 * - If STOP: marks the matching volunteer opted out
 * - If UNSTOP: clears the opted-out flag
 * - Matches volunteer by phone digits (last 10)
 *
 * @param {{
 *   phone: string,
 *   eventType: 'STOP'|'UNSTOP'|'HELP',
 *   rawPayload: string
 * }} opts
 * @returns {Promise<void>}
 */
export async function handleSmsOptOutWebhook({ phone, eventType, rawPayload }) {
    const digits = (phone || '').replace(/\D/g, '').slice(-10);

    // Find matching volunteer
    const volResult = await exec(`
        SELECT TOP 1 id
        FROM dbo.volunteer_in
        WHERE RIGHT(REPLACE(REPLACE(REPLACE(phone, '-', ''), '(', ''), ')', ''), 10) = @digits
          AND registration_status <> 'archived';
    `, (req) => {
        req.input('digits', sql.NVarChar(10), digits);
    });

    const volunteerId = volResult.recordset?.[0]?.id || null;

    // Log the event
    await exec(`
        INSERT INTO dbo.sms_opt_out_log
            (phone, volunteer_id, event_type, raw_payload)
        VALUES
            (@phone, @volunteerId, @eventType, @rawPayload);
    `, (req) => {
        req.input('phone',       sql.NVarChar(50),      phone);
        req.input('volunteerId', sql.Int,               volunteerId);
        req.input('eventType',   sql.NVarChar(20),      eventType);
        req.input('rawPayload',  sql.NVarChar(sql.MAX), rawPayload || null);
    });

    if (!volunteerId) return;

    if (eventType === 'STOP') {
        await exec(`
            UPDATE dbo.volunteer_in
            SET sms_opted_out    = 1,
                sms_opted_out_at = SYSUTCDATETIME(),
                sms_opted_in     = 0
            WHERE id = @id;
        `, (req) => {
            req.input('id', sql.Int, volunteerId);
        });
    } else if (eventType === 'UNSTOP') {
        await exec(`
            UPDATE dbo.volunteer_in
            SET sms_opted_out    = 0,
                sms_opted_out_at = NULL
            WHERE id = @id;
        `, (req) => {
            req.input('id', sql.Int, volunteerId);
        });
    }
}

// ============================================================
// SMS INBOUND — shift code reply handling
// ============================================================

/**
 * Find a volunteer by their phone number (last 10 digits match).
 * Used by the inbound SMS webhook to identify the sender.
 *
 * @param {string} rawPhone  E.164 or any format, e.g. "+15185550100"
 * @returns {Promise<{ id: number, smsCapable: boolean, sms_opted_out: boolean } | null>}
 */
export async function findVolunteerIdByPhone(rawPhone) {
    const digits = (rawPhone || '').replace(/\D/g, '').slice(-10);
    if (digits.length < 10) return null;

    const result = await exec(`
        SELECT TOP 1 id, smsCapable, sms_opted_out
        FROM dbo.volunteer_in
        WHERE RIGHT(REPLACE(REPLACE(REPLACE(phone, '-', ''), '(', ''), ')', ''), 10) = @digits
          AND registration_status <> 'archived';
    `, (req) => {
        req.input('digits', sql.NVarChar(10), digits);
    });

    const row = result.recordset?.[0];
    if (!row) return null;
    return { id: row.id, smsCapable: !!row.smsCapable, sms_opted_out: !!row.sms_opted_out };
}

/**
 * Find a volunteer's scheduled shift that matches a given SMS reply code.
 * Checks both shift_slot_assignments (scheduler) and invitations.
 * Returns the nearest future or same-day shift.
 *
 * @param {number} volunteerId
 * @param {string} smsCode  Uppercased code, e.g. "FRIN"
 * @returns {Promise<{
 *   shift_id: number,
 *   shift_label: string,
 *   sms_code: string,
 *   start_time: Date,
 *   end_time: Date,
 *   convention_day_id: number,
 *   session_id: number,
 *   convention_date: Date,
 * } | null>}
 */
export async function getVolunteerShiftByCode(volunteerId, smsCode) {
    const result = await exec(`
        SELECT TOP 1
            sh.id        AS shift_id,
            sh.label     AS shift_label,
            sh.sms_code,
            sh.start_time,
            sh.end_time,
            cd.id        AS convention_day_id,
            sess.id      AS session_id,
            cd.convention_date
        FROM (
            -- Via scheduler slot assignments
            SELECT sh2.id, sh2.label, sh2.sms_code, sh2.start_time, sh2.end_time,
                   cd2.id AS cdid, sess2.id AS sessid, cd2.convention_date
            FROM dbo.shift_slot_assignments ssa
            JOIN dbo.schedule_assignments sa2 ON sa2.id = ssa.schedule_assignment_id
            JOIN dbo.shifts sh2               ON sh2.id = sa2.shift_id
            JOIN dbo.sessions sess2           ON sess2.id = sh2.session_id
            JOIN dbo.convention_days cd2      ON cd2.id  = sess2.convention_day_id
            WHERE ssa.volunteer_id = @volunteerId
              AND UPPER(sh2.sms_code) = @code
              AND cd2.convention_date >= CAST(SYSUTCDATETIME() AS DATE)

            UNION

            -- Via invitations
            SELECT sh3.id, sh3.label, sh3.sms_code, sh3.start_time, sh3.end_time,
                   cd3.id, sess3.id, cd3.convention_date
            FROM dbo.invitations i
            JOIN dbo.shifts sh3      ON sh3.id   = i.shift_id
            JOIN dbo.sessions sess3  ON sess3.id = sh3.session_id
            JOIN dbo.convention_days cd3 ON cd3.id = sess3.convention_day_id
            WHERE i.volunteer_id = @volunteerId
              AND i.revoked = 0
              AND i.shift_id IS NOT NULL
              AND UPPER(sh3.sms_code) = @code
              AND cd3.convention_date >= CAST(SYSUTCDATETIME() AS DATE)
        ) AS combined(id, label, sms_code, start_time, end_time, cdid, sessid, convention_date)
        JOIN dbo.shifts sh   ON sh.id   = combined.id
        JOIN dbo.sessions sess ON sess.id = combined.sessid
        JOIN dbo.convention_days cd ON cd.id = combined.cdid
        ORDER BY combined.convention_date, combined.start_time;
    `, (req) => {
        req.input('volunteerId', sql.Int,           volunteerId);
        req.input('code',        sql.NVarChar(8),   smsCode.toUpperCase());
    });

    return result.recordset?.[0] || null;
}

/**
 * Find a volunteer's nearest upcoming or active shift on a given Eastern date.
 * Used for CHECK replies when the volunteer doesn't include a code.
 *
 * @param {number} volunteerId
 * @param {string} todayEastern  ISO date string e.g. "2026-08-08"
 * @returns {Promise<{
 *   shift_id: number,
 *   shift_label: string,
 *   sms_code: string | null,
 *   start_time: Date,
 *   end_time: Date,
 *   convention_day_id: number,
 *   session_id: number,
 *   convention_date: Date,
 * } | null>}
 */
export async function getVolunteerActiveShiftToday(volunteerId, todayEastern) {
    const result = await exec(`
        SELECT TOP 1
            sh.id        AS shift_id,
            sh.label     AS shift_label,
            sh.sms_code,
            sh.start_time,
            sh.end_time,
            cd.id        AS convention_day_id,
            sess.id      AS session_id,
            cd.convention_date
        FROM (
            SELECT sh2.id, sh2.start_time, cd2.id AS cdid, sess2.id AS sessid, cd2.convention_date
            FROM dbo.shift_slot_assignments ssa
            JOIN dbo.schedule_assignments sa2 ON sa2.id = ssa.schedule_assignment_id
            JOIN dbo.shifts sh2               ON sh2.id = sa2.shift_id
            JOIN dbo.sessions sess2           ON sess2.id = sh2.session_id
            JOIN dbo.convention_days cd2      ON cd2.id  = sess2.convention_day_id
            WHERE ssa.volunteer_id = @volunteerId
              AND CONVERT(DATE, cd2.convention_date) = @today

            UNION

            SELECT sh3.id, sh3.start_time, cd3.id, sess3.id, cd3.convention_date
            FROM dbo.invitations i
            JOIN dbo.shifts sh3      ON sh3.id   = i.shift_id
            JOIN dbo.sessions sess3  ON sess3.id = sh3.session_id
            JOIN dbo.convention_days cd3 ON cd3.id = sess3.convention_day_id
            WHERE i.volunteer_id = @volunteerId
              AND i.revoked = 0
              AND i.shift_id IS NOT NULL
              AND CONVERT(DATE, cd3.convention_date) = @today
        ) AS combined(id, start_time, cdid, sessid, convention_date)
        JOIN dbo.shifts sh     ON sh.id   = combined.id
        JOIN dbo.sessions sess ON sess.id = combined.sessid
        JOIN dbo.convention_days cd ON cd.id = combined.cdid
        ORDER BY combined.start_time;
    `, (req) => {
        req.input('volunteerId', sql.Int,  volunteerId);
        req.input('today',       sql.Date, todayEastern);
    });

    return result.recordset?.[0] || null;
}

/**
 * Confirm a volunteer's RSVP for a shift via SMS reply code.
 * Updates their most recent unrevoked, unanswered invitation to response = 'yes'.
 * No-ops if already responded or no invitation exists.
 *
 * @param {number} volunteerId
 * @param {number} shiftId
 * @returns {Promise<boolean>} true if an invitation row was updated
 */
export async function confirmShiftRsvpBySms(volunteerId, shiftId) {
    const result = await exec(`
        UPDATE TOP(1) dbo.invitations
        SET response     = 'yes',
            responded_at = SYSUTCDATETIME()
        WHERE volunteer_id  = @volunteerId
          AND shift_id      = @shiftId
          AND revoked       = 0
          AND responded_at  IS NULL;
    `, (req) => {
        req.input('volunteerId', sql.Int, volunteerId);
        req.input('shiftId',     sql.Int, shiftId);
    });

    return (result.rowsAffected?.[0] ?? 0) > 0;
}

// ============================================================
// TRACKER — updated query with batch + revocation support
// ============================================================

/**
 * Fetch all invitations with volunteer name, batch context, event context,
 * and response/revocation status for the Invitation Tracker page.
 *
 * @param {{
 *   conventionDayId?: number|null,
 *   batchId?:         number|null,
 *   response?:        'yes'|'no'|'maybe'|'pending'|'all',
 *   includeRevoked?:  boolean
 * }} [filters={}]
 * @returns {Promise<Array<object>>}
 */
export async function getInvitationsForTracker({
    conventionDayId = null,
    batchId         = null,
    response        = 'all',
    includeRevoked  = true,
} = {}) {
    const filters = [];
    if (conventionDayId)     filters.push('i.convention_day_id = @dayId');
    if (batchId)             filters.push('i.batch_id = @batchId');
    if (!includeRevoked)     filters.push('i.revoked = 0');
    if (response === 'pending') filters.push('i.responded_at IS NULL AND i.revoked = 0');
    else if (response === 'yes')   filters.push("i.response = 'yes'");
    else if (response === 'no')    filters.push("i.response = 'no'");
    else if (response === 'maybe') filters.push("i.response = 'maybe'");

    const whereClause = filters.length > 0 ? 'WHERE ' + filters.join(' AND ') : '';

    const result = await exec(`
        SELECT
            i.id,
            i.volunteer_id,
            v.firstName,
            v.lastName,
            v.registration_status   AS volunteer_status,
            i.token,
            i.sent_at,
            i.channel,
            i.message_subject,
            i.responded_at,
            i.response,
            i.sent_by,
            i.revoked,
            i.revoked_at,
            i.revoked_by,
            i.opted_in_at,
            i.last_reminded_at,
            i.reminder_count,
            i.last_reminded_channel,
            i.batch_id,
            b.name             AS batch_name,
            b.parent_batch_id,
            i.convention_day_id,
            cd.label           AS day_label,
            cd.convention_date,
            i.shift_id,
            sh.label           AS shift_label,
            sh.start_time      AS shift_start,
            sh.end_time        AS shift_end,
            et.name            AS event_type_name,
            et.color           AS event_type_color
        FROM dbo.invitations i
        INNER JOIN dbo.volunteer_in v
            ON v.id = i.volunteer_id
        LEFT JOIN dbo.invitation_batches b
            ON b.id = i.batch_id
        LEFT JOIN dbo.convention_days cd
            ON cd.id = i.convention_day_id
        LEFT JOIN dbo.shifts sh
            ON sh.id = i.shift_id
        LEFT JOIN dbo.event_types et
            ON et.id = sh.event_type_id
        ${whereClause}
        ORDER BY i.sent_at DESC;
    `, (req) => {
        if (conventionDayId) req.input('dayId',   sql.Int, conventionDayId);
        if (batchId)         req.input('batchId', sql.Int, batchId);
    });

    return result.recordset || [];
}

/**
 * Check whether a volunteer's profile is complete and, if so, promote their
 * registration_status from 'draft' to 'completed'.
 *
 * Only acts on records currently in 'draft' status — completed/archived records
 * are untouched. Safe to call on every oversight edit without side-effects.
 *
 * @param {number} id       - Volunteer's primary key.
 * @param {string} editedBy - Email/identifier of the actor triggering the check.
 * @returns {Promise<{ promoted: boolean, missing: string[] }>}
 */
export async function promoteIfComplete(id, editedBy) {
    const volunteer = await getVolunteerById(id);

    if (!volunteer) return { promoted: false, missing: ['Volunteer not found'] };
    if (volunteer.registration_status !== 'draft') return { promoted: false, missing: [] };

    const { complete, missing } = isProfileComplete(volunteer);
    if (!complete) return { promoted: false, missing };

    await exec(
        `UPDATE dbo.volunteer_in
         SET registration_status = 'completed',
             last_updated        = SYSUTCDATETIME(),
             edited_by           = @editedBy
         WHERE id = @id
           AND registration_status = 'draft';`,
        (req) => {
            req.input('id',       sql.Int,          id);
            req.input('editedBy', sql.NVarChar(100), editedBy || 'system');
        },
    );

    return { promoted: true, missing: [] };
}

/**
 * Fetch all non-archived volunteers with the fields needed for the
 * Volunteer Application Status report.
 *
 * Returns completed and draft records. Archived records are excluded.
 * The caller is responsible for attaching completeness data via isProfileComplete().
 *
 * @returns {Promise<Array<{
 *   id: number,
 *   firstName: string|null,
 *   lastName: string|null,
 *   suffix: string|null,
 *   email: string|null,
 *   phone: string|null,
 *   gender: string|null,
 *   dobirth: Date|null,
 *   stamina: number|null,
 *   congregation: string|null,
 *   registration_status: string,
 *   accountType: string|null,
 *   active_current_year: boolean,
 *   last_updated: Date|null,
 * }>>}
 */
export async function getVolunteerReportRows() {
    const result = await exec(`
        SELECT
            id,
            firstName,
            lastName,
            suffix,
            email,
            phone,
            gender,
            dobirth,
            stamina,
            congregation,
            registration_status,
            accountType,
            active_current_year,
            last_updated
        FROM dbo.volunteer_in
        WHERE registration_status <> 'archived'
        ORDER BY lastName, firstName, suffix;
    `);
    return result.recordset || [];
}
// ============================================================
// MY ACCOUNT — RSVP History
// ============================================================

/**
 * Fetch a volunteer's invitation history for the current convention year.
 * One row per invitation. "Last Date Sent" is the reminder date if the
 * volunteer was reminded, otherwise the original sent_at.
 *
 * @param {number} volunteerId
 * @param {number} year
 * @returns {Promise<Array<{
 *   invitation_id:     number,
 *   convention_day_id: number|null,
 *   day_label:         string|null,
 *   convention_date:   Date|null,
 *   shift_id:          number|null,
 *   shift_label:       string|null,
 *   shift_start:       Date|null,
 *   shift_end:         Date|null,
 *   event_type_name:   string|null,
 *   event_type_color:  string|null,
 *   channel:           string,
 *   response:          string|null,
 *   responded_at:      Date|null,
 *   last_sent_at:      Date,
 *   revoked:           boolean,
 * }>>}
 */
export async function getVolunteerRsvpHistory(volunteerId, year) {
    const result = await exec(`
        SELECT
            i.id                                           AS invitation_id,
            i.convention_day_id,
            cd.label                                       AS day_label,
            cd.convention_date,
            i.shift_id,
            sh.label                                       AS shift_label,
            sh.start_time                                  AS shift_start,
            sh.end_time                                    AS shift_end,
            et.name                                        AS event_type_name,
            et.color                                       AS event_type_color,
            i.channel,
            i.response,
            i.responded_at,
            COALESCE(i.last_reminded_at, i.sent_at)       AS last_sent_at,
            CAST(i.revoked AS BIT)                         AS revoked
        FROM dbo.invitations i
        LEFT JOIN dbo.convention_days cd  ON cd.id = i.convention_day_id
        LEFT JOIN dbo.shifts sh           ON sh.id = i.shift_id
        LEFT JOIN dbo.event_types et      ON et.id = sh.event_type_id
        WHERE i.volunteer_id = @volunteerId
          AND YEAR(cd.convention_date) = @year
        ORDER BY cd.convention_date, sh.start_time;
    `, (req) => {
        req.input('volunteerId', sql.Int, volunteerId);
        req.input('year',        sql.Int, year);
    });

    return (result.recordset || []).map((r) => ({
        invitation_id:     r.invitation_id,
        convention_day_id: r.convention_day_id ?? null,
        day_label:         r.day_label         || null,
        convention_date:   r.convention_date   || null,
        shift_id:          r.shift_id          ?? null,
        shift_label:       r.shift_label       || null,
        shift_start:       r.shift_start       || null,
        shift_end:         r.shift_end         || null,
        event_type_name:   r.event_type_name   || null,
        event_type_color:  r.event_type_color  || null,
        channel:           r.channel           || '',
        response:          r.response          || null,
        responded_at:      r.responded_at      || null,
        last_sent_at:      r.last_sent_at      || null,
        revoked:           !!r.revoked,
    }));
}
// ============================================================
// ATTENDANCE
// ============================================================

/**
 * Fetch the full volunteer list for a shift's check-in view.
 *
 * Returns two populations merged into one ordered list:
 *  1. Invited volunteers (from invitations for this shift) with their
 *     RSVP response and existing attendance record if any.
 *  2. Walk-ins (attendance rows with walk_in=1 that have no matching
 *     invitation for this shift).
 *
 * @param {number} shiftId
 * @returns {Promise<Array<{
 *   volunteer_id:    number,
 *   firstName:       string,
 *   lastName:        string,
 *   rsvp_response:   string|null,
 *   invite_channel:  string|null,
 *   attendance_id:   number|null,
 *   attended:        boolean,
 *   notes:           string|null,
 *   recorded_by:     string|null,
 *   recorded_at:     Date|null,
 *   walk_in:         boolean
 * }>>}
 */
export async function getShiftAttendanceData(shiftId) {
    const result = await exec(`
        -- Invited volunteers for this shift (deduplicated across campaigns)
        -- ROW_NUMBER picks one invitation per volunteer: responded rows first,
        -- then most recent by id, so follow-up campaigns don't create duplicates.
        WITH ranked_invites AS (
            SELECT
                volunteer_id,
                response,
                channel,
                ROW_NUMBER() OVER (
                    PARTITION BY volunteer_id
                    ORDER BY
                        CASE WHEN response IS NOT NULL THEN 0 ELSE 1 END,
                        id DESC
                ) AS rn
            FROM dbo.invitations
            WHERE shift_id = @shiftId
              AND revoked   = 0
        )
        SELECT
            v.id            AS volunteer_id,
            v.firstName,
            v.lastName,
            ri.response     AS rsvp_response,
            ri.channel      AS invite_channel,
            a.id            AS attendance_id,
            CAST(COALESCE(a.attended, 0) AS BIT) AS attended,
            a.notes,
            a.recorded_by,
            a.recorded_at,
            CAST(0 AS BIT)  AS walk_in
        FROM ranked_invites ri
        INNER JOIN dbo.volunteer_in v ON v.id = ri.volunteer_id
        LEFT JOIN dbo.attendance a
            ON a.volunteer_id = ri.volunteer_id
           AND a.shift_id     = @shiftId
        WHERE ri.rn = 1

        UNION ALL

        -- Walk-ins: attendance rows with no matching invitation
        SELECT
            v.id            AS volunteer_id,
            v.firstName,
            v.lastName,
            NULL            AS rsvp_response,
            NULL            AS invite_channel,
            a.id            AS attendance_id,
            a.attended,
            a.notes,
            a.recorded_by,
            a.recorded_at,
            CAST(1 AS BIT)  AS walk_in
        FROM dbo.attendance a
        INNER JOIN dbo.volunteer_in v
            ON v.id = a.volunteer_id
        WHERE a.shift_id = @shiftId
          AND a.walk_in  = 1
          AND NOT EXISTS (
              SELECT 1
              FROM dbo.invitations i2
              WHERE i2.volunteer_id = a.volunteer_id
                AND i2.shift_id    = @shiftId
                AND i2.revoked     = 0
          )

        ORDER BY lastName, firstName;
    `, (req) => {
        req.input('shiftId', sql.Int, shiftId);
    });

    return (result.recordset || []).map((r) => ({
        volunteer_id:   r.volunteer_id,
        firstName:      r.firstName   || '',
        lastName:       r.lastName    || '',
        rsvp_response:  r.rsvp_response  || null,
        invite_channel: r.invite_channel || null,
        attendance_id:  r.attendance_id  ?? null,
        attended:       !!r.attended,
        notes:          r.notes          || null,
        recorded_by:    r.recorded_by    || null,
        recorded_at:    r.recorded_at    || null,
        walk_in:        !!r.walk_in,
    }));
}

/**
 * Fetch the volunteer list for a day-level check-in (no shift granularity).
 * Used when a convention day has no shifts defined.
 *
 * Returns invited volunteers (invitations linked to this day with no shift)
 * plus any walk-ins recorded directly against the day.
 *
 * @param {number} dayId
 * @returns {Promise<Array<{
 *   volunteer_id:    number,
 *   firstName:       string,
 *   lastName:        string,
 *   rsvp_response:   string|null,
 *   invite_channel:  string|null,
 *   attendance_id:   number|null,
 *   attended:        boolean,
 *   notes:           string|null,
 *   recorded_by:     string|null,
 *   recorded_at:     Date|null,
 *   walk_in:         boolean
 * }>>}
 */
export async function getAttendanceDayData(dayId) {
    const result = await exec(`
        -- Volunteers invited to this day (deduplicated across campaigns)
        WITH ranked_invites AS (
            SELECT
                volunteer_id,
                response,
                channel,
                ROW_NUMBER() OVER (
                    PARTITION BY volunteer_id
                    ORDER BY
                        CASE WHEN response IS NOT NULL THEN 0 ELSE 1 END,
                        id DESC
                ) AS rn
            FROM dbo.invitations
            WHERE convention_day_id = @dayId
              AND shift_id          IS NULL
              AND revoked            = 0
        )
        SELECT
            v.id            AS volunteer_id,
            v.firstName,
            v.lastName,
            ri.response     AS rsvp_response,
            ri.channel      AS invite_channel,
            a.id            AS attendance_id,
            CAST(COALESCE(a.attended, 0) AS BIT) AS attended,
            a.notes,
            a.recorded_by,
            a.recorded_at,
            CAST(0 AS BIT)  AS walk_in
        FROM ranked_invites ri
        INNER JOIN dbo.volunteer_in v ON v.id = ri.volunteer_id
        LEFT JOIN dbo.attendance a
            ON a.volunteer_id      = ri.volunteer_id
           AND a.convention_day_id = @dayId
           AND a.shift_id          IS NULL
        WHERE ri.rn = 1

        UNION ALL

        -- Walk-ins recorded directly against the day
        SELECT
            v.id            AS volunteer_id,
            v.firstName,
            v.lastName,
            NULL            AS rsvp_response,
            NULL            AS invite_channel,
            a.id            AS attendance_id,
            a.attended,
            a.notes,
            a.recorded_by,
            a.recorded_at,
            CAST(1 AS BIT)  AS walk_in
        FROM dbo.attendance a
        INNER JOIN dbo.volunteer_in v
            ON v.id = a.volunteer_id
        WHERE a.convention_day_id = @dayId
          AND a.shift_id          IS NULL
          AND a.walk_in            = 1
          AND NOT EXISTS (
              SELECT 1
              FROM dbo.invitations i2
              WHERE i2.volunteer_id      = a.volunteer_id
                AND i2.convention_day_id = @dayId
                AND i2.shift_id          IS NULL
                AND i2.revoked           = 0
          )

        ORDER BY lastName, firstName;
    `, (req) => {
        req.input('dayId', sql.Int, dayId);
    });

    return (result.recordset || []).map((r) => ({
        volunteer_id:   r.volunteer_id,
        firstName:      r.firstName      || '',
        lastName:       r.lastName       || '',
        rsvp_response:  r.rsvp_response  || null,
        invite_channel: r.invite_channel || null,
        attendance_id:  r.attendance_id  ?? null,
        attended:       !!r.attended,
        notes:          r.notes          || null,
        recorded_by:    r.recorded_by    || null,
        recorded_at:    r.recorded_at    || null,
        walk_in:        !!r.walk_in,
    }));
}

/**
 * Insert or update a single attendance record.
 * Matches on (volunteer_id, shift_id) — the unique constraint guarantees
 * at most one row per volunteer per shift.
 *
 * @param {{
 *   volunteerId:      number,
 *   conventionDayId:  number,
 *   sessionId:        number|null,
 *   shiftId:          number,
 *   attended:         boolean,
 *   notes?:           string|null,
 *   recordedBy?:      string|null,
 *   walkIn?:          boolean
 * }} params
 * @returns {Promise<void>}
 */
export async function upsertAttendance({
    volunteerId,
    conventionDayId,
    sessionId,
    shiftId,
    attended,
    notes       = null,
    recordedBy  = null,
    walkIn      = false,
}) {
    await exec(`
        MERGE dbo.attendance AS target
        USING (SELECT @volunteerId AS volunteer_id, @shiftId AS shift_id, @conventionDayId AS convention_day_id) AS source
            ON target.volunteer_id = source.volunteer_id
           AND (
               (source.shift_id IS NOT NULL AND target.shift_id = source.shift_id)
               OR
               (source.shift_id IS NULL AND target.shift_id IS NULL AND target.convention_day_id = source.convention_day_id)
           )
        WHEN MATCHED THEN
            UPDATE SET
                attended    = @attended,
                notes       = @notes,
                recorded_by = @recordedBy,
                recorded_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
            INSERT (volunteer_id, convention_day_id, session_id, shift_id,
                    attended, notes, recorded_by, walk_in)
            VALUES (@volunteerId, @conventionDayId, @sessionId, @shiftId,
                    @attended, @notes, @recordedBy, @walkIn);
    `, (req) => {
        req.input('volunteerId',     sql.Int,               volunteerId);
        req.input('conventionDayId', sql.Int,               conventionDayId);
        req.input('sessionId',       sql.Int,               sessionId || null);
        req.input('shiftId',         sql.Int,               shiftId ?? null);
        req.input('attended',        sql.Bit,               attended ? 1 : 0);
        req.input('notes',           sql.NVarChar(1000),    notes || null);
        req.input('recordedBy',      sql.NVarChar(200),     recordedBy || null);
        req.input('walkIn',          sql.Bit,               walkIn ? 1 : 0);
    });
}

/**
 * Fetch all shifts for a convention day with per-shift attendance stats.
 * Used by the attendance report page to build its accordion.
 *
 * @param {number} dayId
 * @returns {Promise<Array<{
 *   shift_id:         number,
 *   shift_label:      string,
 *   shift_start:      Date,
 *   shift_end:        Date,
 *   event_type_name:  string|null,
 *   event_type_color: string|null,
 *   session_id:       number,
 *   session_label:    string,
 *   invited_count:    number,
 *   rsvp_yes_count:   number,
 *   attended_count:   number,
 *   no_show_count:    number
 * }>>}
 */
export async function getAttendanceReportForDay(dayId) {
    const result = await exec(`
        SELECT
            sh.id                                                       AS shift_id,
            sh.label                                                    AS shift_label,
            sh.start_time                                               AS shift_start,
            sh.end_time                                                 AS shift_end,
            et.name                                                     AS event_type_name,
            et.color                                                    AS event_type_color,
            se.id                                                       AS session_id,
            se.label                                                    AS session_label,
            COUNT(DISTINCT i.volunteer_id)                              AS invited_count,
            COUNT(DISTINCT CASE WHEN i.response = 'yes'
                                THEN i.volunteer_id END)                AS rsvp_yes_count,
            COUNT(DISTINCT CASE WHEN a.attended = 1
                                THEN a.volunteer_id END)                AS attended_count,
            COUNT(DISTINCT CASE
                WHEN i.volunteer_id IS NOT NULL
                 AND COALESCE(a.attended, 0) = 0
                 AND COALESCE(i.response, '') <> 'no'
                THEN i.volunteer_id END)                                AS no_show_count
        FROM dbo.shifts sh
        INNER JOIN dbo.sessions se
            ON se.id = sh.session_id
        LEFT JOIN dbo.event_types et
            ON et.id = sh.event_type_id
        LEFT JOIN dbo.invitations i
            ON i.shift_id = sh.id
           AND i.revoked  = 0
        LEFT JOIN dbo.attendance a
            ON a.shift_id      = sh.id
           AND a.volunteer_id  = i.volunteer_id
        WHERE se.convention_day_id = @dayId
        GROUP BY
            sh.id, sh.label, sh.start_time, sh.end_time,
            et.name, et.color, se.id, se.label, se.start_time
        ORDER BY se.start_time, sh.start_time;
    `, (req) => {
        req.input('dayId', sql.Int, dayId);
    });

    return (result.recordset || []).map((r) => ({
        shift_id:         r.shift_id,
        shift_label:      r.shift_label      || '',
        shift_start:      r.shift_start,
        shift_end:        r.shift_end,
        event_type_name:  r.event_type_name  || null,
        event_type_color: r.event_type_color || null,
        session_id:       r.session_id,
        session_label:    r.session_label    || '',
        invited_count:    r.invited_count    || 0,
        rsvp_yes_count:   r.rsvp_yes_count   || 0,
        attended_count:   r.attended_count   || 0,
        no_show_count:    r.no_show_count     || 0,
    }));
}

// ============================================================
// SCHEDULER
// ============================================================

/**
 * Format a mssql TIME column value (UTC-epoch Date) as "h:mm AM/PM".
 * TIME columns come back as Date objects anchored to UTC midnight,
 * so we use UTC hours/minutes to avoid local timezone offset shifts.
 *
 * @param {Date|null} dateObj
 * @returns {string|null}
 */
function formatSchedulerTime(dateObj) {
    if (!dateObj) return null;
    const h    = dateObj.getUTCHours();
    const m    = dateObj.getUTCMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12  = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** @type {Record<string, string>} */
const SCHEDULER_DEPT_LABEL = {
    lots_and_garages: 'Lots and Garages',
    signs:            'Signs',
    security:         'Security',
    dropoff_pickup:   'Dropoff / Pickup',
    mobile_support:   'Mobile Support',
};

/**
 * Fetch all shifts for a convention day and shape them into the scheduler
 * JSON payload consumed by the frontend drag-and-drop grid.
 *
 * Output shape:
 * ```
 * {
 *   day: {
 *     "<day_label>": {
 *       id: number,
 *       department: {
 *         "<dept_key>": {
 *           dpt_name: string,
 *           shift: {
 *             "<shift_id>": {
 *               id:         number,
 *               shift_name: string,
 *               schedule:   { start_time: string, end_time: string },
 *               location: {
 *                 "loc_N": {
 *                   id: number, name: string,
 *                   vol_min: number|null, vol_ideal: number|null, vol_max: number|null
 *                 }
 *               }
 *             }
 *           }
 *         }
 *       }
 *     }
 *   }
 * }
 * ```
 *
 * Only shifts that have a non-null `department` column are included.
 * Shifts with no schedule_assignments produce an empty `location` object.
 *
 * @param {number} dayId
 * @returns {Promise<object>}
 */
export async function getSchedulerData(dayId) {
    const result = await exec(`
        SELECT
            cd.id               AS day_id,
            cd.label            AS day_label,
            sh.id               AS shift_id,
            sh.label            AS shift_name,
            sh.start_time       AS shift_start,
            sh.end_time         AS shift_end,
            sh.department       AS shift_department,
            sa.id               AS assignment_id,
            lt.name             AS location_name,
            sa.vol_min,
            sa.volunteer_need   AS vol_ideal,
            sa.vol_max
        FROM dbo.convention_days cd
        INNER JOIN dbo.sessions se
            ON se.convention_day_id = cd.id
        INNER JOIN dbo.shifts sh
            ON sh.session_id = se.id
        LEFT JOIN dbo.schedule_assignments sa
            ON sa.shift_id = sh.id
        LEFT JOIN dbo.locations_tasks lt
            ON lt.id = sa.location_task_id
        WHERE cd.id = @dayId
          AND sh.department IS NOT NULL
        ORDER BY sh.start_time, sh.department, sa.id;
    `, (req) => {
        req.input('dayId', sql.Int, dayId);
    });

    const rows    = result.recordset || [];
    const payload = { day: {} };
    if (rows.length === 0) return payload;

    const firstRow = rows[0];
    const dayLabel = firstRow.day_label;

    /** @type {{ id: number, department: Record<string, object> }} */
    const dayObj = { id: firstRow.day_id, department: {} };
    payload.day[dayLabel] = dayObj;

    for (const row of rows) {
        const dept = row.shift_department;
        if (!dept) continue;

        if (!dayObj.department[dept]) {
            dayObj.department[dept] = {
                dpt_name: SCHEDULER_DEPT_LABEL[dept] || dept,
                shift:    {},
            };
        }

        const deptObj  = dayObj.department[dept];
        const shiftKey = String(row.shift_id);

        if (!deptObj.shift[shiftKey]) {
            deptObj.shift[shiftKey] = {
                id:         row.shift_id,
                shift_name: row.shift_name || '',
                schedule: {
                    start_time: formatSchedulerTime(row.shift_start),
                    end_time:   formatSchedulerTime(row.shift_end),
                },
                location: {},
            };
        }

        if (row.assignment_id != null) {
            const locs   = deptObj.shift[shiftKey].location;
            const locKey = `loc_${Object.keys(locs).length + 1}`;
            locs[locKey] = {
                id:        row.assignment_id,
                name:      row.location_name || '',
                vol_min:   row.vol_min    ?? null,
                vol_ideal: row.vol_ideal  ?? null,
                vol_max:   row.vol_max    ?? null,
            };
        }
    }

    return payload;
}

/**
 * Fetch all active registered volunteers with crew eligibility flags
 * for the scheduler's name pool and drop guards.
 *
 * Includes only volunteers who are fully registered and active for
 * the current convention year. Deleted volunteers are excluded by
 * the `registration_status = 'registered'` filter.
 *
 * @returns {Promise<Array<{
 *   id:        number,
 *   firstName: string,
 *   lastName:  string,
 *   role:      string,
 *   crews: {
 *     lots_and_garages: boolean,
 *     signs:            boolean,
 *     security:         boolean,
 *     dropoff_pickup:   boolean,
 *     mobile_support:   boolean,
 *   }
 * }>>}
 */
export async function getSchedulerVolunteers() {
    const result = await exec(`
        SELECT
            id,
            firstName,
            lastName,
            role,
            phone,
            email,
            crew_lots_garages,
            crew_signs,
            crew_security,
            crew_mobile_support,
            crew_dropoff_pickup
        FROM dbo.volunteer_in
        WHERE active_current_year = 1
          AND registration_status <> 'deleted'
        ORDER BY lastName, firstName;
    `);

    return (result.recordset || []).map((r) => ({
        id:        r.id,
        firstName: r.firstName || '',
        lastName:  r.lastName  || '',
        role:      r.role      || 'REGISTERED',
        phone:     r.phone     || null,
        email:     r.email     || null,
        crews: {
            lots_and_garages: !!r.crew_lots_garages,
            signs:            !!r.crew_signs,
            security:         !!r.crew_security,
            dropoff_pickup:   !!r.crew_dropoff_pickup,
            mobile_support:   !!r.crew_mobile_support,
        },
    }));
}

// ============================================================
// CREW MATRIX
// ============================================================

/**
 * Fetch all volunteers active for the current convention year with their
 * crew assignment flags. Used to populate the crew assignment matrix.
 *
 * Includes all volunteers regardless of registration status or accountType —
 * the only filter is active_current_year = 1.
 *
 * @returns {Promise<Array<{
 *   id:                  number,
 *   firstName:           string,
 *   lastName:            string,
 *   role:                string,
 *   crew_lots_garages:   boolean,
 *   crew_signs:          boolean,
 *   crew_security:       boolean,
 *   crew_dropoff_pickup: boolean,
 *   crew_mobile_support: boolean,
 * }>>}
 */
export async function getCrewMatrix() {
    const result = await exec(`
        SELECT
            id,
            firstName,
            lastName,
            role,
            crew_lots_garages,
            crew_signs,
            crew_security,
            crew_dropoff_pickup,
            crew_mobile_support
        FROM dbo.volunteer_in
        WHERE active_current_year = 1
          AND registration_status <> 'deleted'
        ORDER BY lastName, firstName;
    `);

    return (result.recordset || []).map((r) => ({
        id:                  r.id,
        firstName:           r.firstName || '',
        lastName:            r.lastName  || '',
        role:                r.role      || 'NON_REGISTERED',
        crew_lots_garages:   !!r.crew_lots_garages,
        crew_signs:          !!r.crew_signs,
        crew_security:       !!r.crew_security,
        crew_dropoff_pickup: !!r.crew_dropoff_pickup,
        crew_mobile_support: !!r.crew_mobile_support,
    }));
}

/**
 * Toggle a single crew assignment flag for a volunteer.
 *
 * The crewKey parameter is validated against a strict whitelist and mapped
 * to the correct DB column — no dynamic column names reach the query.
 *
 * @param {number}  volunteerId
 * @param {string}  crewKey  - One of the five department keys.
 * @param {boolean} value
 * @returns {Promise<boolean>} True if a row was updated, false if not found.
 */
export async function updateVolunteerCrew(volunteerId, crewKey, value) {
    /** @type {Record<string, string>} */
    const COLUMN_MAP = {
        lots_and_garages: 'crew_lots_garages',
        signs:            'crew_signs',
        security:         'crew_security',
        dropoff_pickup:   'crew_dropoff_pickup',
        mobile_support:   'crew_mobile_support',
    };

    const column = COLUMN_MAP[crewKey];
    if (!column) throw new Error(`Invalid crew key: ${crewKey}`);

    const result = await exec(`
        UPDATE dbo.volunteer_in
        SET ${column}    = @value,
            last_updated = SYSUTCDATETIME()
        WHERE id                  = @id
          AND active_current_year = 1
          AND registration_status <> 'deleted';
    `, (req) => {
        req.input('id',    sql.Int, volunteerId);
        req.input('value', sql.Bit, value ? 1 : 0);
    });

    const affected = Array.isArray(result.rowsAffected)
        ? result.rowsAffected.reduce((s, n) => s + n, 0)
        : result.rowsAffected || 0;

    return affected > 0;
}
/**
 * Set a single crew flag to the same value for multiple volunteers in one
 * UPDATE statement. Used by the scheduler crew matrix toggle-all action.
 *
 * The crewKey is validated against a strict whitelist before the column
 * name is interpolated — no user-supplied text reaches the SQL.
 *
 * @param {number[]} volunteerIds
 * @param {string}   crewKey  - One of the five department keys.
 * @param {boolean}  value
 * @returns {Promise<number>} Number of rows updated.
 */
export async function batchUpdateVolunteerCrew(volunteerIds, crewKey, value) {
    if (!Array.isArray(volunteerIds) || volunteerIds.length === 0) return 0;

    /** @type {Record<string, string>} */
    const COLUMN_MAP = {
        lots_and_garages: 'crew_lots_garages',
        signs:            'crew_signs',
        security:         'crew_security',
        dropoff_pickup:   'crew_dropoff_pickup',
        mobile_support:   'crew_mobile_support',
    };

    const column = COLUMN_MAP[crewKey];
    if (!column) throw new Error(`Invalid crew key: ${crewKey}`);

    // Build a safe parameter list — one named input per ID
    const params = volunteerIds.map((_, i) => `@id${i}`).join(', ');

    const result = await exec(`
        UPDATE dbo.volunteer_in
        SET ${column}            = @value,
            last_updated         = SYSUTCDATETIME()
        WHERE id                  IN (${params})
          AND active_current_year = 1
          AND registration_status <> 'deleted';
    `, (req) => {
        req.input('value', sql.Bit, value ? 1 : 0);
        volunteerIds.forEach((id, i) => {
            req.input(`id${i}`, sql.Int, id);
        });
    });

    const affected = Array.isArray(result.rowsAffected)
        ? result.rowsAffected.reduce((s, n) => s + n, 0)
        : result.rowsAffected || 0;

    return affected;
}

/**
 * Persist a volunteer-to-slot assignment and return the new row id.
 *
 * @param {{
 *   schedule_assignment_id: number,
 *   convention_day_id:       number,
 *   volunteer_id:            number,
 *   slot_type:               string,
 *   slot_index:              number
 * }} data
 * @returns {Promise<number>}
 */
export async function saveSlotAssignment(data) {
    const result = await exec(
        `INSERT INTO dbo.shift_slot_assignments
             (schedule_assignment_id, convention_day_id, volunteer_id, slot_type, slot_index)
         OUTPUT INSERTED.id
         VALUES (@saId, @cdId, @volId, @slotType, @slotIndex);`,
        (req) => {
            req.input('saId',      sql.Int,          data.schedule_assignment_id);
            req.input('cdId',      sql.Int,          data.convention_day_id);
            req.input('volId',     sql.Int,          data.volunteer_id);
            req.input('slotType',  sql.NVarChar(20), data.slot_type);
            req.input('slotIndex', sql.Int,          data.slot_index);
        },
    );
    const id = result.recordset?.[0]?.id;
    if (!id) throw new Error('INSERT shift_slot_assignments did not return id.');
    return id;
}

/**
 * Remove a slot assignment by its primary key.
 *
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export async function deleteSlotAssignment(id) {
    const result = await exec(
        `DELETE FROM dbo.shift_slot_assignments WHERE id = @id;`,
        (req) => req.input('id', sql.Int, id),
    );
    const affected = Array.isArray(result.rowsAffected)
        ? result.rowsAffected.reduce((s, n) => s + n, 0)
        : result.rowsAffected || 0;
    return affected > 0;
}

/**
 * Fetch all slot assignments for a convention day, joined with volunteer names.
 *
 * @param {number} dayId
 * @returns {Promise<Array<{
 *   id: number,
 *   schedule_assignment_id: number,
 *   volunteer_id: number,
 *   firstName: string,
 *   lastName:  string,
 *   slot_type:  string,
 *   slot_index: number
 * }>>}
 */
export async function getSlotAssignmentsByDay(dayId) {
    const result = await exec(
        `SELECT
             ssa.id,
             ssa.schedule_assignment_id,
             ssa.volunteer_id,
             v.firstName,
             v.lastName,
             ssa.slot_type,
             ssa.slot_index
         FROM dbo.shift_slot_assignments ssa
         JOIN dbo.volunteer_in v ON v.id = ssa.volunteer_id
         WHERE ssa.convention_day_id = @dayId
         ORDER BY ssa.schedule_assignment_id, ssa.slot_type, ssa.slot_index;`,
        (req) => req.input('dayId', sql.Int, dayId),
    );
    return result.recordset || [];
}

// ============================================================
// SCHEDULE PUBLISH
// ============================================================

/**
 * Fetch all notification recipients for a schedule publish event.
 *
 * Returns the UNION of:
 *   - All OVERSEER+ volunteers (general publish notification)
 *   - All volunteers scheduled for the day (personalised with shift list)
 *
 * Volunteers in both groups receive one personalised message.
 *
 * @param {number} dayId
 * @returns {Promise<{ recipients: Array<object> }>}
 */
export async function getPublishNotificationData(dayId) {
    // ── OVERSEER+ with at least one contact method ─────────────────
    const overseerResult = await exec(`
        SELECT id, firstName, lastName, email, phone, smsCapable, role
        FROM dbo.volunteer_in
        WHERE active_current_year  = 1
          AND registration_status  = 'completed'
          AND role IN ('OVERSEER', 'ASSISTANT_ADMIN', 'ADMIN')
          AND (email IS NOT NULL OR phone IS NOT NULL)
        ORDER BY lastName, firstName;
    `);

    // ── Scheduled volunteers for this day ──────────────────────────
    const scheduledResult = await exec(`
        SELECT
            v.id,
            v.firstName,
            v.lastName,
            v.email,
            v.phone,
            v.smsCapable,
            sh.label        AS shift_label,
            sh.start_time   AS shift_start,
            sh.end_time     AS shift_end,
            lt.name         AS location_name,
            ssa.slot_type
        FROM dbo.shift_slot_assignments ssa
        JOIN dbo.volunteer_in v
            ON v.id = ssa.volunteer_id
           AND (v.email IS NOT NULL OR v.phone IS NOT NULL)
        JOIN dbo.schedule_assignments sa ON sa.id = ssa.schedule_assignment_id
        JOIN dbo.shifts sh               ON sh.id = sa.shift_id
        JOIN dbo.locations_tasks lt      ON lt.id = sa.location_task_id
        WHERE ssa.convention_day_id = @dayId
        ORDER BY v.lastName, v.firstName, sh.start_time;
    `, (req) => req.input('dayId', sql.Int, dayId));

    // ── Format TIME columns ─────────────────────────────────────────
    /**
     * @param {Date|null} t
     * @returns {string}
     */
    function fmtT(t) {
        if (!t) return '';
        const d = t instanceof Date ? t : new Date(t);
        const h = d.getUTCHours(), m = d.getUTCMinutes();
        return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
    }

    // ── Build scheduled-volunteer map ───────────────────────────────
    /** @type {Map<number, { vol: object, assignments: object[] }>} */
    const scheduledMap = new Map();
    for (const r of scheduledResult.recordset || []) {
        if (!scheduledMap.has(r.id)) {
            scheduledMap.set(r.id, { vol: r, assignments: [] });
        }
        scheduledMap.get(r.id).assignments.push({
            shift_label:   r.shift_label   || '',
            location_name: r.location_name || '',
            start_time:    fmtT(r.shift_start),
            end_time:      fmtT(r.shift_end),
            slot_type:     r.slot_type     || '',
        });
    }

    // ── Merge into deduplicated recipient list ──────────────────────
    /** @type {Map<number, object>} */
    const recipientMap = new Map();

    for (const [id, { vol, assignments }] of scheduledMap) {
        recipientMap.set(id, {
            id:         vol.id,
            firstName:  vol.firstName  || '',
            lastName:   vol.lastName   || '',
            email:      vol.email      || null,
            phone:      vol.phone      || null,
            smsCapable: !!vol.smsCapable,
            assignments,
        });
    }

    for (const v of overseerResult.recordset || []) {
        if (!recipientMap.has(v.id)) {
            recipientMap.set(v.id, {
                id:          v.id,
                firstName:   v.firstName  || '',
                lastName:    v.lastName   || '',
                email:       v.email      || null,
                phone:       v.phone      || null,
                smsCapable:  !!v.smsCapable,
                assignments: [],
            });
        }
    }

    return { recipients: Array.from(recipientMap.values()) };
}

/**
 * Record a completed schedule publish event in dbo.schedule_publishes.
 *
 * @param {{
 *   dayId:            number,
 *   publishedBy:      string,
 *   sharePointUrl:    string,
 *   filename:         string,
 *   emailSent:        number,
 *   smsSent:          number,
 *   totalRecipients:  number,
 * }} data
 * @returns {Promise<number>} New row id.
 */
export async function recordSchedulePublish(data) {
    const result = await exec(`
        INSERT INTO dbo.schedule_publishes
            (convention_day_id, published_by, sharepoint_url,
             filename, email_sent, sms_sent, total_recipients)
        OUTPUT INSERTED.id
        VALUES
            (@dayId, @publishedBy, @sharePointUrl,
             @filename, @emailSent, @smsSent, @totalRecipients);
    `, (req) => {
        req.input('dayId',           sql.Int,            data.dayId);
        req.input('publishedBy',     sql.NVarChar(100),  data.publishedBy     || null);
        req.input('sharePointUrl',   sql.NVarChar(1000), data.sharePointUrl   || null);
        req.input('filename',        sql.NVarChar(255),  data.filename        || null);
        req.input('emailSent',       sql.Int,            data.emailSent       ?? 0);
        req.input('smsSent',         sql.Int,            data.smsSent         ?? 0);
        req.input('totalRecipients', sql.Int,            data.totalRecipients ?? 0);
    });
    return result.recordset?.[0]?.id;
}

// ─────────────────────────────────────────────────────────────
// SHIFT ALERT SCHEDULES
// ─────────────────────────────────────────────────────────────

/**
 * Return all shift alert schedules for a given year.
 * @param {number} year
 * @returns {Promise<Array>}
 */
export async function getAlertSchedules(year) {
    const result = await exec(`
        SELECT id, year, name, fire_date, fire_time_utc, alert_category,
               departments, include_null_dept, message_override, active,
               created_by, created_at
        FROM dbo.shift_alert_schedules
        WHERE year = @year
        ORDER BY fire_date, fire_time_utc;
    `, (req) => {
        req.input('year', sql.Int, year);
    });
    return result.recordset || [];
}

/**
 * Return a single shift alert schedule by id.
 * @param {number} id
 * @returns {Promise<object|null>}
 */
export async function getAlertSchedule(id) {
    const result = await exec(`
        SELECT id, year, name, fire_date, fire_time_utc, alert_category,
               departments, include_null_dept, message_override, active,
               created_by, created_at
        FROM dbo.shift_alert_schedules
        WHERE id = @id;
    `, (req) => {
        req.input('id', sql.Int, id);
    });
    return result.recordset?.[0] || null;
}

/**
 * Create a new shift alert schedule.
 * @param {{
 *   year:              number,
 *   name:              string,
 *   fire_date?:        string|null,
 *   fire_time_utc?:    string|null,
 *   alert_category:    'next_day'|'same_day'|'all_upcoming'|'t15min',
 *   departments?:      string|null,
 *   include_null_dept: boolean,
 *   message_override?: string|null,
 *   created_by?:       string|null,
 * }} data
 * @returns {Promise<number>}
 */
export async function createAlertSchedule(data) {
    const result = await exec(`
        INSERT INTO dbo.shift_alert_schedules
            (year, name, fire_date, fire_time_utc, alert_category,
             departments, include_null_dept, message_override, created_by)
        OUTPUT INSERTED.id
        VALUES
            (@year, @name, @fireDate, @fireTimeUtc, @alertCategory,
             @departments, @includeNullDept, @messageOverride, @createdBy);
    `, (req) => {
        req.input('year',            sql.Int,          data.year);
        req.input('name',            sql.NVarChar(100), data.name.trim());
        req.input('fireDate',        sql.Date,          data.fire_date        || null);
        req.input('fireTimeUtc',     sql.NVarChar(8),   data.fire_time_utc    || null);
        req.input('alertCategory',   sql.NVarChar(20),  data.alert_category);
        req.input('departments',     sql.NVarChar(500), data.departments      || null);
        req.input('includeNullDept', sql.Bit,           data.include_null_dept ? 1 : 0);
        req.input('messageOverride', sql.NVarChar(sql.MAX), data.message_override || null);
        req.input('createdBy',       sql.NVarChar(100), data.created_by       || null);
    });
    const id = result.recordset?.[0]?.id;
    if (!id) throw new Error('INSERT shift_alert_schedules did not return id.');
    return id;
}

/**
 * Update an existing shift alert schedule.
 * @param {number} id
 * @param {{
 *   name:              string,
 *   fire_date?:        string|null,
 *   fire_time_utc?:    string|null,
 *   alert_category:    string,
 *   departments?:      string|null,
 *   include_null_dept: boolean,
 *   message_override?: string|null,
 *   active:            boolean,
 * }} data
 * @returns {Promise<boolean>}
 */
export async function updateAlertSchedule(id, data) {
    const result = await exec(`
        UPDATE dbo.shift_alert_schedules
        SET name              = @name,
            fire_date         = @fireDate,
            fire_time_utc     = @fireTimeUtc,
            alert_category    = @alertCategory,
            departments       = @departments,
            include_null_dept = @includeNullDept,
            message_override  = @messageOverride,
            active            = @active
        WHERE id = @id;
    `, (req) => {
        req.input('id',              sql.Int,          id);
        req.input('name',            sql.NVarChar(100), data.name.trim());
        req.input('fireDate',        sql.Date,          data.fire_date        || null);
        req.input('fireTimeUtc',     sql.NVarChar(8),   data.fire_time_utc    || null);
        req.input('alertCategory',   sql.NVarChar(20),  data.alert_category);
        req.input('departments',     sql.NVarChar(500), data.departments      || null);
        req.input('includeNullDept', sql.Bit,           data.include_null_dept ? 1 : 0);
        req.input('messageOverride', sql.NVarChar(sql.MAX), data.message_override || null);
        req.input('active',          sql.Bit,           data.active ? 1 : 0);
    });
    const affected = Array.isArray(result.rowsAffected)
        ? result.rowsAffected.reduce((s, n) => s + n, 0)
        : result.rowsAffected || 0;
    return affected > 0;
}

/**
 * Soft-delete (deactivate) a shift alert schedule.
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export async function deleteAlertSchedule(id) {
    const result = await exec(`
        UPDATE dbo.shift_alert_schedules SET active = 0 WHERE id = @id;
    `, (req) => req.input('id', sql.Int, id));
    const affected = Array.isArray(result.rowsAffected)
        ? result.rowsAffected.reduce((s, n) => s + n, 0)
        : result.rowsAffected || 0;
    return affected > 0;
}

// ─────────────────────────────────────────────────────────────
// SHIFT ALERT — SEND RESOLUTION
// ─────────────────────────────────────────────────────────────

/**
 * Resolve the full set of volunteer+shift pairs eligible for a burst alert.
 *
 * Applies:
 *  - Category date filter (next_day / same_day / all_upcoming relative to fire_date)
 *  - Department filter (JSON array or null for all; include_null_dept flag)
 *  - Volunteer eligibility (opted in, sms capable, has phone)
 *  - Dupe guard (skips pairs already successfully sent for this schedule_id)
 *
 * @param {{
 *   scheduleId:       number,
 *   alertCategory:    'next_day'|'same_day'|'all_upcoming',
 *   fireDate:         string,   ISO date string (Eastern local date) e.g. "2026-08-07"
 *   departments:      string|null,
 *   includeNullDept:  boolean,
 *   year:             number,
 * }} params
 * @returns {Promise<Array<{
 *   shift_id:number, sms_code:string, shift_label:string,
 *   start_time:string, end_time:string, department:string|null,
 *   convention_date:Date, day_label:string, event_type_name:string,
 *   volunteer_id:number, firstName:string, lastName:string, phone:string
 * }>>}
 */
export async function getShiftsForAlertBurst(params) {
    const { scheduleId, alertCategory, fireDate, departments, includeNullDept, year } = params;
    const result = await exec(`
        SELECT DISTINCT
            sh.id              AS shift_id,
            sh.sms_code,
            sh.label           AS shift_label,
            sh.start_time,
            sh.end_time,
            sh.department,
            cd.convention_date,
            cd.label           AS day_label,
            et.name            AS event_type_name,
            vi.id              AS volunteer_id,
            vi.firstName,
            vi.lastName,
            vi.phone
        FROM dbo.shifts sh
        JOIN dbo.sessions               sess ON sess.id  = sh.session_id
        JOIN dbo.convention_days        cd   ON cd.id    = sess.convention_day_id
        JOIN dbo.event_types            et   ON et.id    = sh.event_type_id
        JOIN dbo.schedule_assignments   sa   ON sa.shift_id = sh.id
        JOIN dbo.shift_slot_assignments ssa  ON ssa.schedule_assignment_id = sa.id
        JOIN dbo.volunteer_in           vi   ON vi.id    = ssa.volunteer_id
        WHERE vi.sms_shift_alerts_opt_in = 1
          AND vi.sms_opted_in            = 1
          AND vi.smsCapable              = 1
          AND vi.phone                   IS NOT NULL
          AND sh.sms_code                IS NOT NULL
          AND cd.year                    = @year
          AND (
              (@category = 'next_day'     AND cd.convention_date = DATEADD(DAY, 1, @fireDate))
           OR (@category = 'same_day'     AND cd.convention_date = @fireDate)
           OR (@category = 'all_upcoming' AND cd.convention_date >= @fireDate)
          )
          AND (
              @departments IS NULL
           OR (sh.department IS NULL AND @includeNullDept = 1)
           OR EXISTS (
                  SELECT 1 FROM OPENJSON(@departments) j WHERE j.[value] = sh.department
              )
          )
          AND NOT EXISTS (
              SELECT 1 FROM dbo.shift_alert_log sal
              WHERE sal.schedule_id  = @scheduleId
                AND sal.shift_id     = sh.id
                AND sal.volunteer_id = vi.id
                AND sal.status       = 'sent'
          )
        ORDER BY cd.convention_date, sh.start_time, vi.lastName, vi.firstName;
    `, (req) => {
        req.input('year',         sql.Int,          year);
        req.input('scheduleId',   sql.Int,          scheduleId);
        req.input('category',     sql.NVarChar(20), alertCategory);
        req.input('fireDate',     sql.Date,         fireDate);
        req.input('departments',  sql.NVarChar(500), departments || null);
        req.input('includeNullDept', sql.Bit,       includeNullDept ? 1 : 0);
    });
    return result.recordset || [];
}

/**
 * Return all volunteer+shift pairs eligible for a T-15 alert.
 *
 * Returns today's and tomorrow's shifts not yet t15-alerted.
 * The caller (alertScheduler.js) applies the ±1 minute window check
 * in Eastern time to find which rows to actually send now.
 *
 * @param {number} year  Current convention year.
 * @param {string} today ISO date string for today in Eastern time e.g. "2026-08-08"
 * @returns {Promise<Array<{
 *   shift_id:number, sms_code:string, shift_label:string,
 *   start_time:string, end_time:string, department:string|null,
 *   convention_date:Date, day_label:string, event_type_name:string,
 *   volunteer_id:number, firstName:string, lastName:string, phone:string
 * }>>}
 */
export async function getT15CandidateShifts(year, today) {
    const result = await exec(`
        SELECT DISTINCT
            sh.id              AS shift_id,
            sh.sms_code,
            sh.label           AS shift_label,
            sh.start_time,
            sh.end_time,
            sh.department,
            cd.convention_date,
            cd.label           AS day_label,
            et.name            AS event_type_name,
            vi.id              AS volunteer_id,
            vi.firstName,
            vi.lastName,
            vi.phone
        FROM dbo.shifts sh
        JOIN dbo.sessions               sess ON sess.id  = sh.session_id
        JOIN dbo.convention_days        cd   ON cd.id    = sess.convention_day_id
        JOIN dbo.event_types            et   ON et.id    = sh.event_type_id
        JOIN dbo.schedule_assignments   sa   ON sa.shift_id = sh.id
        JOIN dbo.shift_slot_assignments ssa  ON ssa.schedule_assignment_id = sa.id
        JOIN dbo.volunteer_in           vi   ON vi.id    = ssa.volunteer_id
        WHERE vi.sms_shift_alerts_opt_in = 1
          AND vi.sms_opted_in            = 1
          AND vi.smsCapable              = 1
          AND vi.phone                   IS NOT NULL
          AND sh.sms_code                IS NOT NULL
          AND cd.year                    = @year
          AND cd.convention_date BETWEEN @today AND DATEADD(DAY, 1, @today)
          AND NOT EXISTS (
              SELECT 1 FROM dbo.shift_alert_log sal
              WHERE sal.schedule_id    IS NULL
                AND sal.shift_id       = sh.id
                AND sal.volunteer_id   = vi.id
                AND sal.alert_category = 't15min'
                AND sal.status         = 'sent'
          )
        ORDER BY cd.convention_date, sh.start_time;
    `, (req) => {
        req.input('year',  sql.Int,  year);
        req.input('today', sql.Date, today);
    });
    return result.recordset || [];
}

// ─────────────────────────────────────────────────────────────
// SHIFT ALERT — LOGGING
// ─────────────────────────────────────────────────────────────

/**
 * Bulk-insert shift alert log rows after a send attempt.
 *
 * @param {Array<{
 *   schedule_id?:    number|null,
 *   shift_id:        number,
 *   volunteer_id:    number,
 *   alert_category:  string,
 *   phone:           string,
 *   twilio_sid?:     string|null,
 *   status:          'sent'|'failed',
 *   error_msg?:      string|null,
 * }>} rows
 * @returns {Promise<void>}
 */
export async function logShiftAlerts(rows) {
    if (!rows.length) return;
    for (const row of rows) {
        await exec(`
            INSERT INTO dbo.shift_alert_log
                (schedule_id, shift_id, volunteer_id, alert_category,
                 phone, twilio_sid, status, error_msg)
            VALUES
                (@scheduleId, @shiftId, @volunteerId, @alertCategory,
                 @phone, @twilioSid, @status, @errorMsg);
        `, (req) => {
            req.input('scheduleId',    sql.Int,          row.schedule_id    || null);
            req.input('shiftId',       sql.Int,          row.shift_id);
            req.input('volunteerId',   sql.Int,          row.volunteer_id);
            req.input('alertCategory', sql.NVarChar(20), row.alert_category);
            req.input('phone',         sql.NVarChar(20), row.phone);
            req.input('twilioSid',     sql.NVarChar(50), row.twilio_sid     || null);
            req.input('status',        sql.NVarChar(10), row.status);
            req.input('errorMsg',      sql.NVarChar(500), row.error_msg     || null);
        });
    }
}

/**
 * Return the shift alert log, optionally filtered.
 *
 * @param {{
 *   scheduleId?:   number|null,
 *   volunteerId?:  number|null,
 *   shiftId?:      number|null,
 *   status?:       string|null,
 *   year?:         number|null,
 * }} filters
 * @returns {Promise<Array>}
 */
export async function getAlertLog(filters = {}) {
    const result = await exec(`
        SELECT
            sal.id, sal.schedule_id, sal.shift_id, sal.volunteer_id,
            sal.alert_category, sal.sent_at, sal.phone, sal.twilio_sid,
            sal.status, sal.error_msg,
            vi.firstName, vi.lastName,
            sh.label     AS shift_label,
            sh.start_time,
            cd.convention_date,
            cd.label     AS day_label,
            sched.name   AS schedule_name
        FROM dbo.shift_alert_log sal
        JOIN dbo.volunteer_in          vi    ON vi.id    = sal.volunteer_id
        JOIN dbo.shifts                sh    ON sh.id    = sal.shift_id
        JOIN dbo.sessions              sess  ON sess.id  = sh.session_id
        JOIN dbo.convention_days       cd    ON cd.id    = sess.convention_day_id
        LEFT JOIN dbo.shift_alert_schedules sched ON sched.id = sal.schedule_id
        WHERE (@scheduleId  IS NULL OR sal.schedule_id  = @scheduleId)
          AND (@volunteerId IS NULL OR sal.volunteer_id = @volunteerId)
          AND (@shiftId     IS NULL OR sal.shift_id     = @shiftId)
          AND (@status      IS NULL OR sal.status       = @status)
          AND (@year        IS NULL OR cd.year          = @year)
        ORDER BY sal.sent_at DESC;
    `, (req) => {
        req.input('scheduleId',  sql.Int,         filters.scheduleId  || null);
        req.input('volunteerId', sql.Int,         filters.volunteerId || null);
        req.input('shiftId',     sql.Int,         filters.shiftId     || null);
        req.input('status',      sql.NVarChar(10), filters.status     || null);
        req.input('year',        sql.Int,         filters.year        || null);
    });
    return result.recordset || [];
}