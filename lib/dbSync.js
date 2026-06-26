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
 *   gender: string|null,
 * }>>}
 */
export async function getActiveVolunteers({ includeInactive = true, includeDeleted = false } = {}) {
  const conditions = ["registration_status <> 'archived'"];
  if (!includeDeleted) conditions.push("registration_status <> 'deleted'");

  const whereClause = 'WHERE ' + conditions.join(' AND ');

  const result = await exec(
    `SELECT id, firstName, lastName, suffix, registration_status,
            active_current_year, deleted_at, gender
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
    gender:              r.gender     || null,
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
 * Fetch all volunteers in draft (unapproved) status.
 * These volunteers have not completed registration and can
 * only be granted DESK-level access via assignDeskRole().
 *
 * @returns {Promise<Array<{
 *   id: number,
 *   firstName: string,
 *   lastName: string,
 *   suffix: string|null,
 *   email: string,
 *   role: string,
 *   registration_status: string
 * }>>}
 */
export async function getUnapprovedVolunteers() {
    const result = await exec(`
        SELECT
            id,
            firstName,
            lastName,
            suffix,
            email,
            role,
            registration_status
        FROM dbo.volunteer_in
        WHERE registration_status = 'draft'
        ORDER BY lastName, firstName, suffix;
    `);
    return result.recordset || [];
}

/**
 * Assign DESK role to a draft volunteer and mark them as completed,
 * allowing them to log in and use the app with DESK-level permissions.
 * Only operates on volunteers still in 'draft' status — will not
 * affect already-completed or archived volunteers.
 *
 * @param {number} targetId  - ID of the draft volunteer.
 * @param {string} editedBy  - Email of the actor making the change.
 * @returns {Promise<boolean>} true if a row was updated.
 */
export async function assignDeskRole(targetId, editedBy) {
    const result = await exec(
        `
        UPDATE dbo.volunteer_in
        SET role                = 'DESK',
            registration_status = 'completed',
            last_updated        = SYSUTCDATETIME(),
            edited_by           = @editedBy
        WHERE id = @id
          AND registration_status = 'draft';
        `,
        (req) => {
            req.input('id',       sql.Int,          targetId);
            req.input('editedBy', sql.NVarChar(50),  editedBy || null);
        }
    );

    const affected = Array.isArray(result.rowsAffected)
        ? result.rowsAffected.reduce((sum, n) => sum + n, 0)
        : result.rowsAffected || 0;

    return affected > 0;
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
 * Update role, crew assignments, and delegated extra permissions for a
 * volunteer (oversight panel).
 *
 * Called from the Assignment accordion section on the edit volunteer page.
 * Overseers can set role to REGISTERED or KEYMAN only.
 * All five crew assignment BIT columns and the extra_signs_placement flag
 * are written in one UPDATE.
 *
 * @param {number}   targetId
 * @param {string}   newRole            - 'REGISTERED' | 'KEYMAN'
 * @param {{
 *   crew_lots_garages:    boolean,
 *   crew_signs:           boolean,
 *   crew_security:        boolean,
 *   crew_mobile_support:  boolean,
 *   crew_dropoff_pickup:  boolean,
 *   crew_desk:            boolean,
 * }} crews
 * @param {{
 *   extraSignsPlacement?: boolean,
 * }} extraPerms  - Delegated permission overrides. Only ADMIN/ASSISTANT_ADMIN
 *                  passes non-default values here; OVERSEER always passes {}.
 * @param {string}   editedBy
 * @returns {Promise<boolean>} true if a row was updated
 */
export async function updateVolunteerAssignment(
  targetId,
  newRole,
  crews,
  extraPerms,
  editedBy,
) {
  const result = await exec(
    `
        UPDATE dbo.volunteer_in
        SET role                    = @role,
            crew_lots_garages       = @lotsGarages,
            crew_signs              = @signs,
            crew_security           = @security,
            crew_mobile_support     = @mobileSupport,
            crew_dropoff_pickup     = @dropoffPickup,
            crew_desk               = @desk,
            extra_signs_placement   = @extraSignsPlacement,
            last_updated            = SYSUTCDATETIME(),
            edited_by               = @editedBy
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
      req.input("desk", sql.Bit, crews.crew_desk ? 1 : 0);
      req.input("extraSignsPlacement", sql.Bit, extraPerms?.extraSignsPlacement ? 1 : 0);
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

  // When deactivating, purge all saved scheduler slot assignments so the
  // volunteer cannot silently re-appear in the grid if later reactivated
  // while their old slots were filled by someone else.
  if (!active && affected > 0) {
    await exec(
      `DELETE FROM dbo.shift_slot_assignments WHERE volunteer_id = @id;`,
      (req) => { req.input("id", sql.Int, targetId); },
    );
  }

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
       AND registration_status NOT IN ('archived', 'deleted');

     -- Remove all scheduler slot assignments for this volunteer so
     -- their name does not persist on any published or printed schedule.
     DELETE FROM dbo.shift_slot_assignments
     WHERE volunteer_id = @id;`,
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

    // Purge saved scheduler slot assignments for all newly deactivated
    // volunteers for the same reason as setVolunteerActive above.
    if (deactivated > 0) {
      const purgeParams = inactiveIds.map((_, i) => `@u${i}`).join(", ");
      await exec(
        `DELETE FROM dbo.shift_slot_assignments WHERE volunteer_id IN (${purgeParams});`,
        (req) => { inactiveIds.forEach((id, i) => req.input(`u${i}`, sql.Int, id)); },
      );
    }
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
// Scheduler Categories
// ============================================================

/**
 * Fetch all scheduler categories ordered by sort_order.
 *
 * @returns {Promise<Array<{id:number, dept_key:string, name:string,
 *   color:string|null, is_sensitive:boolean, active:boolean,
 *   sort_order:number, created_at:Date}>>}
 */
export async function getSchedulerCategories() {
    const result = await exec(`
        SELECT id, dept_key, name, color, is_sensitive, active, sort_order, created_at
        FROM dbo.scheduler_categories
        ORDER BY sort_order, name;
    `);
    return result.recordset || [];
}

/**
 * Create a scheduler category.
 *
 * @param {{dept_key:string, name:string, color?:string|null,
 *   is_sensitive?:boolean, sort_order?:number}} data
 * @returns {Promise<number>} new id
 */
export async function createSchedulerCategory(data) {
    const result = await exec(
        `
        INSERT INTO dbo.scheduler_categories (dept_key, name, color, is_sensitive, sort_order)
        OUTPUT INSERTED.id
        VALUES (@deptKey, @name, @color, @isSensitive, @sortOrder);
        `,
        (req) => {
            req.input('deptKey',      sql.NVarChar(50),  data.dept_key.trim());
            req.input('name',         sql.NVarChar(100), data.name.trim());
            req.input('color',        sql.NVarChar(7),   data.color?.trim()   || null);
            req.input('isSensitive',  sql.Bit,           data.is_sensitive    ? 1 : 0);
            req.input('sortOrder',    sql.Int,           data.sort_order      ?? 0);
        },
    );
    const id = result.recordset?.[0]?.id;
    if (!id) throw new Error('INSERT scheduler_categories did not return id.');
    return id;
}

/**
 * Update a scheduler category's display properties.
 * Does not touch is_sensitive — use toggleSchedulerCategorySensitivity() for that.
 *
 * @param {number} id
 * @param {{name:string, color?:string|null, active:boolean, sort_order?:number}} data
 * @returns {Promise<boolean>}
 */
export async function updateSchedulerCategory(id, data) {
    const result = await exec(
        `
        UPDATE dbo.scheduler_categories
        SET name       = @name,
            color      = @color,
            active     = @active,
            sort_order = @sortOrder
        WHERE id = @id;
        `,
        (req) => {
            req.input('id',        sql.Int,           id);
            req.input('name',      sql.NVarChar(100), data.name.trim());
            req.input('color',     sql.NVarChar(7),   data.color?.trim() || null);
            req.input('active',    sql.Bit,           data.active ? 1 : 0);
            req.input('sortOrder', sql.Int,           data.sort_order ?? 0);
        },
    );
    const affected = Array.isArray(result.rowsAffected)
        ? result.rowsAffected.reduce((s, n) => s + n, 0)
        : result.rowsAffected || 0;
    return affected > 0;
}

/**
 * Toggle the is_sensitive flag on a scheduler category.
 * When true, only OVERSEER+ or volunteers with a scheduler_category_access
 * grant for this category can see its shifts.
 *
 * @param {number} id
 * @param {boolean} isSensitive
 * @returns {Promise<boolean>}
 */
export async function toggleSchedulerCategorySensitivity(id, isSensitive) {
    const result = await exec(
        `
        UPDATE dbo.scheduler_categories
        SET is_sensitive = @isSensitive
        WHERE id = @id;
        `,
        (req) => {
            req.input('id',          sql.Int, id);
            req.input('isSensitive', sql.Bit, isSensitive ? 1 : 0);
        },
    );
    const affected = Array.isArray(result.rowsAffected)
        ? result.rowsAffected.reduce((s, n) => s + n, 0)
        : result.rowsAffected || 0;
    return affected > 0;
}

/**
 * Fetch the category_id values a volunteer is explicitly granted access to.
 * Called at login and stored in req.session.sensitiveCategories.
 * OVERSEER+ callers skip this and use null as a sentinel for "all access."
 *
 * @param {number} volunteerId
 * @returns {Promise<number[]>}
 */
export async function getSchedulerCategoryAccessForVolunteer(volunteerId) {
    const result = await exec(
        `
        SELECT category_id
        FROM dbo.scheduler_category_access
        WHERE volunteer_id = @volunteerId;
        `,
        (req) => {
            req.input('volunteerId', sql.Int, volunteerId);
        },
    );
    return (result.recordset || []).map((r) => r.category_id);
}

/**
 * Fetch all volunteers granted access to a specific category.
 * Used by the oversight access-management UI.
 *
 * @param {number} categoryId
 * @returns {Promise<Array<{volunteer_id:number, full_name:string,
 *   granted_by:number, granted_at:Date}>>}
 */
export async function getVolunteersForSchedulerCategory(categoryId) {
    const result = await exec(
        `
        SELECT
            sca.volunteer_id,
            v.first_name + ' ' + v.last_name AS full_name,
            sca.granted_by,
            sca.granted_at
        FROM dbo.scheduler_category_access sca
        JOIN dbo.volunteer_in v ON v.id = sca.volunteer_id
        WHERE sca.category_id = @categoryId
        ORDER BY full_name;
        `,
        (req) => {
            req.input('categoryId', sql.Int, categoryId);
        },
    );
    return result.recordset || [];
}

/**
 * Grant a volunteer access to a sensitive scheduler category.
 * Uses MERGE to avoid duplicate-key errors on repeat grants.
 *
 * @param {number} volunteerId
 * @param {number} categoryId
 * @param {number} grantedBy - volunteer_in.id of the granting OVERSEER+
 * @returns {Promise<void>}
 */
export async function grantSchedulerCategoryAccess(volunteerId, categoryId, grantedBy) {
    await exec(
        `
        MERGE dbo.scheduler_category_access AS target
        USING (SELECT @volunteerId AS volunteer_id, @categoryId AS category_id) AS source
            ON target.volunteer_id = source.volunteer_id
           AND target.category_id  = source.category_id
        WHEN NOT MATCHED THEN
            INSERT (volunteer_id, category_id, granted_by, granted_at)
            VALUES (@volunteerId, @categoryId, @grantedBy, GETDATE());
        `,
        (req) => {
            req.input('volunteerId', sql.Int, volunteerId);
            req.input('categoryId',  sql.Int, categoryId);
            req.input('grantedBy',   sql.Int, grantedBy);
        },
    );
}

/**
 * Revoke a volunteer's access to a sensitive scheduler category.
 *
 * @param {number} volunteerId
 * @param {number} categoryId
 * @returns {Promise<boolean>}
 */
export async function revokeSchedulerCategoryAccess(volunteerId, categoryId) {
    const result = await exec(
        `
        DELETE FROM dbo.scheduler_category_access
        WHERE volunteer_id = @volunteerId
          AND category_id  = @categoryId;
        `,
        (req) => {
            req.input('volunteerId', sql.Int, volunteerId);
            req.input('categoryId',  sql.Int, categoryId);
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
        SELECT id, year, label, convention_date, program_start, program_end, notes, schedulable
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
        INSERT INTO dbo.convention_days (year, label, convention_date, program_start, program_end, notes, schedulable)
        OUTPUT INSERTED.id
        VALUES (@year, @label, @convention_date, @program_start, @program_end, @notes, @schedulable);
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
      req.input("schedulable", sql.Bit, data.schedulable !== false ? 1 : 0);
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
            notes           = @notes,
            schedulable     = @schedulable
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
      req.input("schedulable", sql.Bit, data.schedulable !== false ? 1 : 0);
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
        DELETE ssa FROM dbo.shift_slot_assignments ssa
            INNER JOIN dbo.schedule_assignments sa ON sa.id = ssa.schedule_assignment_id
            INNER JOIN dbo.shifts sh ON sh.id = sa.shift_id
            INNER JOIN dbo.sessions se ON se.id = sh.session_id
            WHERE se.convention_day_id = @id;

        DELETE FROM dbo.attendance WHERE convention_day_id = @id;

        DELETE FROM dbo.invitations WHERE convention_day_id = @id;

        DELETE sal FROM dbo.shift_alert_log sal
            INNER JOIN dbo.shifts sh ON sh.id = sal.shift_id
            INNER JOIN dbo.sessions se ON se.id = sh.session_id
            WHERE se.convention_day_id = @id;

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
 * Fetch all schedulable convention days together with their sessions.
 * Non-schedulable days (e.g. training days) are excluded.
 * Session start/end times are returned as integer minutes from midnight
 * so the client never has to handle mssql epoch-anchored Date objects.
 *
 * @returns {Promise<Array<{
 *   id:              number,
 *   year:            number,
 *   label:           string,
 *   convention_date: string,
 *   sessions: Array<{
 *     id:            number,
 *     label:         string,
 *     session_order: number,
 *     startMin:      number,
 *     endMin:        number
 *   }>
 * }>>}
 */
export async function getConventionDaysWithSessions() {
    const result = await exec(`
        SELECT
            cd.id                                         AS day_id,
            cd.year,
            cd.label,
            CONVERT(varchar(10), cd.convention_date, 23) AS convention_date,
            s.id                                          AS session_id,
            s.label                                       AS session_label,
            s.session_order,
            DATEPART(HOUR,   s.start_time) * 60
                + DATEPART(MINUTE, s.start_time)          AS start_min,
            DATEPART(HOUR,   s.end_time)   * 60
                + DATEPART(MINUTE, s.end_time)            AS end_min
        FROM   dbo.convention_days cd
        LEFT JOIN dbo.sessions     s
               ON s.convention_day_id = cd.id
        WHERE  cd.schedulable = 1
        ORDER  BY cd.convention_date, s.session_order, s.start_time;
    `);
 
    const dayMap = new Map();
    for (const row of result.recordset || []) {
        if (!dayMap.has(row.day_id)) {
            dayMap.set(row.day_id, {
                id:              row.day_id,
                year:            row.year,
                label:           row.label,
                convention_date: row.convention_date,
                sessions:        [],
            });
        }
        if (row.session_id != null) {
            dayMap.get(row.day_id).sessions.push({
                id:            row.session_id,
                label:         row.session_label,
                session_order: row.session_order,
                startMin:      row.start_min,
                endMin:        row.end_min,
            });
        }
    }
 
    return [...dayMap.values()];
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
 * Clear T-15 alert log entries for a shift so the dupe guard resets.
 *
 * Called after a shift's start_time is updated so the rolling T-15
 * scheduler can fire again for the new time. Only removes rows with
 * schedule_id IS NULL and alert_category = 't15min' — burst alert
 * history (schedule_id NOT NULL) is intentionally preserved.
 *
 * @param {number} shiftId
 * @returns {Promise<void>}
 */
export async function clearT15AlertsForShift(shiftId) {
    await exec(
        `DELETE FROM dbo.shift_alert_log
         WHERE shift_id       = @shiftId
           AND alert_category = 't15min'
           AND schedule_id    IS NULL;`,
        (req) => { req.input('shiftId', sql.Int, shiftId); },
    );
}

/**
 * Delete a session and ALL its child data.
 */
export async function deleteSession(id) {
    // 1. Slot assignments (via schedule_assignments → shifts → session)
    await exec(`
        DELETE ssa FROM dbo.shift_slot_assignments ssa
            INNER JOIN dbo.schedule_assignments sa ON sa.id  = ssa.schedule_assignment_id
            INNER JOIN dbo.shifts               sh ON sh.id  = sa.shift_id
            WHERE sh.session_id = @id;
    `, (req) => { req.input('id', sql.Int, id); });

    // 2. Alert log (shift_id FK)
    await exec(`
        DELETE sal FROM dbo.shift_alert_log sal
            INNER JOIN dbo.shifts sh ON sh.id = sal.shift_id
            WHERE sh.session_id = @id;
    `, (req) => { req.input('id', sql.Int, id); });

    // 3. Attendance (shift_id FK)
    await exec(`
        DELETE att FROM dbo.attendance att
            INNER JOIN dbo.shifts sh ON sh.id = att.shift_id
            WHERE sh.session_id = @id;
    `, (req) => { req.input('id', sql.Int, id); });

    // 4. Invitations (shift_id FK)
    await exec(`
        DELETE inv FROM dbo.invitations inv
            INNER JOIN dbo.shifts sh ON sh.id = inv.shift_id
            WHERE sh.session_id = @id;
    `, (req) => { req.input('id', sql.Int, id); });

    // 5. Schedule assignments — ON DELETE CASCADE covers shift_rendezvous_points
    await exec(`
        DELETE sa FROM dbo.schedule_assignments sa
            INNER JOIN dbo.shifts sh ON sh.id = sa.shift_id
            WHERE sh.session_id = @id;
    `, (req) => { req.input('id', sql.Int, id); });

    // 6. Shifts
    await exec(`
        DELETE FROM dbo.shifts WHERE session_id = @id;
    `, (req) => { req.input('id', sql.Int, id); });

    // 7. Session itself
    const result = await exec(`
        DELETE FROM dbo.sessions WHERE id = @id;
    `, (req) => { req.input('id', sql.Int, id); });

    const affected = Array.isArray(result.rowsAffected)
        ? result.rowsAffected.reduce((s, n) => s + n, 0)
        : result.rowsAffected || 0;
    return affected > 0;
}

// ============================================================
// Shifts
// ============================================================

/**
 * Fetch all shifts for a session.
 * category_id is LEFT JOINed to scheduler_categories — meeting shifts
 * (is_meeting = 1) have no category and return NULL for those columns.
 *
 * When filterUserId is provided (non-OVERSEER+ callers), shifts whose
 * category is marked is_sensitive = 1 are excluded unless the volunteer
 * has a row in dbo.scheduler_category_access for that category.
 * Pass null for OVERSEER+ callers to bypass filtering entirely.
 *
 * @param {number} sessionId
 * @param {number|null} [filterUserId=null] - volunteer_in.id of the
 *   requesting user, or null to return all shifts regardless of sensitivity.
 * @returns {Promise<Array<{id:number, session_id:number,
 *   category_id:number|null, dept_key:string|null,
 *   category_name:string|null, category_color:string|null,
 *   label:string, start_time:string, end_time:string,
 *   volunteer_need:number|null, notes:string|null,
 *   invitable:boolean, sms_code:string|null, is_meeting:boolean}>>}
 */
export async function getShifts(sessionId, filterUserId = null) {
    const sensitivityFilter = filterUserId != null
        ? `AND (
               s.category_id IS NULL
               OR NOT EXISTS (
                   SELECT 1 FROM dbo.scheduler_categories sc2
                   WHERE sc2.id = s.category_id AND sc2.is_sensitive = 1
               )
               OR EXISTS (
                   SELECT 1 FROM dbo.scheduler_category_access sca
                   WHERE sca.volunteer_id = @filterUserId
                     AND sca.category_id  = s.category_id
               )
           )`
        : '';

    const result = await exec(
        `
        SELECT
            s.id, s.session_id, s.category_id,
            sc.dept_key,
            sc.name  AS category_name,
            sc.color AS category_color,
            s.label, s.start_time, s.end_time,
            s.volunteer_need, s.notes, s.invitable,
            s.sms_code, s.is_meeting,
            s.has_keyman, s.has_keyman_asst
        FROM dbo.shifts s
        LEFT JOIN dbo.scheduler_categories sc ON sc.id = s.category_id
        WHERE s.session_id = @sessionId
        ${sensitivityFilter}
        ORDER BY s.start_time, s.label;
        `,
        (req) => {
            req.input('sessionId', sql.Int, sessionId);
            if (filterUserId != null) req.input('filterUserId', sql.Int, filterUserId);
        },
    );
    return result.recordset || [];
}

/**
 * Create a shift.
 *
 * @param {{session_id:number, category_id?:number|null, label:string,
 *   start_time:string, end_time:string,
 *   volunteer_need?:number|null, notes?:string|null, sms_code?:string|null,
 *   is_meeting?:boolean, has_keyman?:boolean, has_keyman_asst?:boolean}} data
 * @returns {Promise<number>} New shift id.
 */
export async function createShift(data) {
    const result = await exec(
        `
        INSERT INTO dbo.shifts
            (session_id, category_id, label, start_time, end_time,
             volunteer_need, notes, sms_code, is_meeting,
             has_keyman, has_keyman_asst)
        OUTPUT INSERTED.id
        VALUES (@sessionId, @categoryId, @label, @start_time, @end_time,
                @volunteer_need, @notes, @smsCode, @isMeeting,
                @hasKeyman, @hasKeymanAsst);
        `,
        (req) => {
            req.input('sessionId',       sql.Int,           data.session_id);
            req.input('categoryId',      sql.Int,           data.category_id     ?? null);
            req.input('label',           sql.NVarChar(50),  data.label.trim());
            req.input('start_time',      sql.NVarChar(8),   data.start_time);
            req.input('end_time',        sql.NVarChar(8),   data.end_time);
            req.input('volunteer_need',  sql.Int,
                data.volunteer_need != null ? Number(data.volunteer_need) : null);
            req.input('notes',           sql.NVarChar(500), data.notes?.trim()     || null);
            req.input('smsCode',         sql.NVarChar(8),   data.sms_code?.trim()  || null);
            req.input('isMeeting',       sql.Bit,           data.is_meeting      ? 1 : 0);
            req.input('hasKeyman',       sql.Bit,           data.has_keyman      !== false ? 1 : 0);
            req.input('hasKeymanAsst',   sql.Bit,           data.has_keyman_asst !== false ? 1 : 0);
        },
    );
    const id = result.recordset?.[0]?.id;
    if (!id) throw new Error('INSERT shifts did not return id.');
    return id;
}
/**
 * Update a shift.
 *
 * @param {number} id
 * @param {{category_id?:number|null, label:string, start_time:string,
 *   end_time:string, volunteer_need?:number|null, notes?:string|null,
 *   sms_code?:string|null, invitable?:boolean, is_meeting?:boolean,
 *   has_keyman?:boolean, has_keyman_asst?:boolean}} data
 * @returns {Promise<boolean>}
 */
export async function updateShift(id, data) {
    const result = await exec(
        `
        UPDATE dbo.shifts
        SET category_id     = @categoryId,
            label           = @label,
            start_time      = @start_time,
            end_time        = @end_time,
            volunteer_need  = @volunteer_need,
            notes           = @notes,
            sms_code        = @smsCode,
            invitable       = @invitable,
            is_meeting      = @isMeeting,
            has_keyman      = @hasKeyman,
            has_keyman_asst = @hasKeymanAsst
        WHERE id = @id;
        `,
        (req) => {
            req.input('id',             sql.Int,           id);
            req.input('categoryId',     sql.Int,           data.category_id     ?? null);
            req.input('label',          sql.NVarChar(50),  data.label.trim());
            req.input('start_time',     sql.NVarChar(8),   data.start_time);
            req.input('end_time',       sql.NVarChar(8),   data.end_time);
            req.input('volunteer_need', sql.Int,
                data.volunteer_need != null ? Number(data.volunteer_need) : null);
            req.input('notes',          sql.NVarChar(500), data.notes?.trim()     || null);
            req.input('smsCode',        sql.NVarChar(8),   data.sms_code?.trim()  || null);
            req.input('invitable',      sql.Bit,           data.invitable       ? 1 : 0);
            req.input('isMeeting',      sql.Bit,           data.is_meeting      ? 1 : 0);
            req.input('hasKeyman',      sql.Bit,           data.has_keyman      !== false ? 1 : 0);
            req.input('hasKeymanAsst',  sql.Bit,           data.has_keyman_asst !== false ? 1 : 0);
        },
    );
    const affected = Array.isArray(result.rowsAffected)
        ? result.rowsAffected.reduce((s, n) => s + n, 0)
        : result.rowsAffected || 0;

    if (affected > 0) {
        // Prune shift_slot_assignments that are no longer valid after the update.
        // Three cases:
        //   1. volunteer slots whose index now exceeds volunteer_need
        //   2. keyman slot when has_keyman was turned off
        //   3. keyman_asst slot when has_keyman_asst was turned off
        await exec(`
            DELETE ssa
            FROM dbo.shift_slot_assignments ssa
            JOIN dbo.schedule_assignments sa
                ON sa.id = ssa.schedule_assignment_id
            WHERE sa.shift_id = @id
              AND (
                      (    ssa.slot_type = 'volunteer'
                       AND @volunteer_need IS NOT NULL
                       AND ssa.slot_index >= @volunteer_need)
                   OR (ssa.slot_type = 'keyman'      AND @hasKeyman     = 0)
                   OR (ssa.slot_type = 'keyman_asst' AND @hasKeymanAsst = 0)
              );
        `, (req) => {
            req.input('id',             sql.Int, id);
            req.input('volunteer_need', sql.Int,
                data.volunteer_need != null ? Number(data.volunteer_need) : null);
            req.input('hasKeyman',      sql.Bit, data.has_keyman      !== false ? 1 : 0);
            req.input('hasKeymanAsst',  sql.Bit, data.has_keyman_asst !== false ? 1 : 0);
        });
    }

    return affected > 0;
}

/**
 * Generate a shift SMS reply code from convention date, department, and
 * a sequence number that disambiguates multiple shifts in the same group.
 *
 * Crew format:    [DAY 2][DEPT 2][n]  e.g. "FRLG1", "SASC2"
 * Meeting format: [DAY 2]MT[n]        e.g. "FRMT1", "SAMT2"
 *
 * Department map (matches dbo.scheduler_categories.dept_key values):
 *   lots_and_garages → LG   security      → SC   desk          → DK
 *   signs            → SN   mobile_support → MS   dropoff_pickup → DO
 *   unknown/null     → XX
 *
 * @param {string|Date} conventionDate - YYYY-MM-DD string or Date
 * @param {string|null} deptKey        - scheduler_categories.dept_key (null for meetings)
 * @param {number}      sequenceNumber - 1-based position within the group
 * @param {boolean}     [isMeeting]    - Forces MT dept code; ignores deptKey
 * @returns {string} Uppercase code, e.g. "FRLG1", "FRMT1"
 */
export function generateShiftCode(conventionDate, deptKey, sequenceNumber, isMeeting = false) {
    const DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const d = new Date(
        typeof conventionDate === 'string'
            ? conventionDate + 'T12:00:00Z'
            : conventionDate,
    );
    const dayCode = DAY[d.getUTCDay()] ?? 'XX';

    let deptCode;
    if (isMeeting) {
        deptCode = 'MT';
    } else {
        const dept = (deptKey || '').toLowerCase().replace(/[_\s-]/g, '');
        if      (dept.includes('lot') || dept.includes('garage')) deptCode = 'LG';
        else if (dept.includes('security'))                       deptCode = 'SC';
        else if (dept.includes('desk'))                           deptCode = 'DK';
        else if (dept.includes('sign'))                           deptCode = 'SN';
        else if (dept.includes('mobile'))                         deptCode = 'MS';
        else if (dept.includes('drop') || dept.includes('pick'))  deptCode = 'DO';
        else                                                      deptCode = 'XX';
    }

    return (dayCode + deptCode + String(sequenceNumber)).toUpperCase();
}

/**
 * Delete a shift and ALL its child data.
 *
 * Deletion order satisfies FK constraints bottom-up:
 *   shift_slot_assignments → shift_alert_log → attendance → invitations
 *   → schedule_assignments (cascades shift_rendezvous_points) → shifts
 *
 * @param {number} id - Shift primary key.
 * @returns {Promise<boolean>} True if the shift row was deleted.
 */
export async function deleteShift(id) {
    // 1. Slot assignments (via schedule_assignments → shift)
    await exec(`
        DELETE ssa FROM dbo.shift_slot_assignments ssa
            INNER JOIN dbo.schedule_assignments sa ON sa.id = ssa.schedule_assignment_id
            WHERE sa.shift_id = @id;
    `, (req) => { req.input('id', sql.Int, id); });

    // 2. Alert log (shift_id FK — was causing the EREQUEST 547 error)
    await exec(`
        DELETE FROM dbo.shift_alert_log WHERE shift_id = @id;
    `, (req) => { req.input('id', sql.Int, id); });

    // 3. Attendance (shift_id FK)
    await exec(`
        DELETE FROM dbo.attendance WHERE shift_id = @id;
    `, (req) => { req.input('id', sql.Int, id); });

    // 4. Invitations (shift_id FK)
    await exec(`
        DELETE FROM dbo.invitations WHERE shift_id = @id;
    `, (req) => { req.input('id', sql.Int, id); });

    // 5. Schedule assignments — ON DELETE CASCADE covers shift_rendezvous_points
    await exec(`
        DELETE FROM dbo.schedule_assignments WHERE shift_id = @id;
    `, (req) => { req.input('id', sql.Int, id); });

    // 6. Shift itself
    const result = await exec(`
        DELETE FROM dbo.shifts WHERE id = @id;
    `, (req) => { req.input('id', sql.Int, id); });

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

// ═══════════════════════════════════════════════════════════════
// SHIFT RENDEZVOUS POINTS
// ═══════════════════════════════════════════════════════════════

/**
 * Get the rendezvous point for a single schedule assignment.
 *
 * @param {number} scheduleAssignmentId
 * @returns {Promise<object|null>}
 */
export async function getShiftRendezvous(scheduleAssignmentId) {
    const result = await exec(`
        SELECT
            rp.id, rp.schedule_assignment_id, rp.description,
            rp.address, rp.latitude, rp.longitude,
            rp.floor_number, rp.photo_blob_name,
            rp.created_by, rp.updated_by,
            rp.created_at, rp.updated_at,
            sa.shift_id,
            sa.location_task_id,
            lt.name AS location_name
        FROM dbo.shift_rendezvous_points rp
        JOIN dbo.schedule_assignments    sa ON sa.id = rp.schedule_assignment_id
        JOIN dbo.locations_tasks         lt ON lt.id = sa.location_task_id
        WHERE rp.schedule_assignment_id = @saId;
    `, (req) => {
        req.input('saId', sql.Int, scheduleAssignmentId);
    });
    return result.recordset?.[0] || null;
}

/**
 * Batch-fetch all rendezvous points for a convention day.
 * Used by the scheduler preload and the landing page.
 *
 * @param {number} dayId  convention_days.id
 * @returns {Promise<Array<object>>}
 */
export async function getRendezvousForDay(dayId) {
    const result = await exec(`
        SELECT
            rp.id, rp.schedule_assignment_id, rp.description,
            rp.address, rp.latitude, rp.longitude,
            rp.floor_number, rp.photo_blob_name,
            rp.created_by, rp.updated_by,
            rp.created_at, rp.updated_at,
            sa.shift_id,
            sa.location_task_id,
            lt.name  AS location_name,
            sh.label AS shift_label,
            sh.start_time,
            sh.end_time,
            sc.name  AS event_type_name,
            sc.color AS event_type_color
        FROM dbo.shift_rendezvous_points rp
        JOIN dbo.schedule_assignments    sa   ON sa.id  = rp.schedule_assignment_id
        JOIN dbo.locations_tasks         lt   ON lt.id  = sa.location_task_id
        JOIN dbo.shifts                  sh   ON sh.id  = sa.shift_id
        JOIN dbo.sessions               sess ON sess.id = sh.session_id
        LEFT JOIN dbo.scheduler_categories sc ON sc.id  = sh.category_id
        WHERE sess.convention_day_id = @dayId
        ORDER BY sh.start_time, sc.name, lt.name;
    `, (req) => {
        req.input('dayId', sql.Int, dayId);
    });
    return result.recordset || [];
}

/**
 * Create a rendezvous point for a schedule assignment.
 * Fails if one already exists (UNIQUE constraint).
 *
 * @param {{
 *   schedule_assignment_id: number,
 *   description?:           string|null,
 *   address?:               string|null,
 *   latitude?:              number|null,
 *   longitude?:             number|null,
 *   floor_number?:          string|null,
 *   photo_blob_name?:       string|null,
 *   created_by:             number,
 * }} data
 * @returns {Promise<number>}  New record id.
 */
export async function createShiftRendezvous(data) {
    const result = await exec(`
        INSERT INTO dbo.shift_rendezvous_points
            (schedule_assignment_id, description, address,
             latitude, longitude, floor_number, photo_blob_name,
             created_by, updated_by)
        OUTPUT INSERTED.id
        VALUES
            (@saId, @description, @address,
             @latitude, @longitude, @floorNumber, @photoBlobName,
             @createdBy, @createdBy);
    `, (req) => {
        req.input('saId',          sql.Int,          data.schedule_assignment_id);
        req.input('description',   sql.NVarChar(500), data.description?.trim()   || null);
        req.input('address',       sql.NVarChar(500), data.address?.trim()       || null);
        req.input('latitude',      sql.Float,         data.latitude  != null ? Number(data.latitude)  : null);
        req.input('longitude',     sql.Float,         data.longitude != null ? Number(data.longitude) : null);
        req.input('floorNumber',   sql.NVarChar(20),  data.floor_number?.trim()  || null);
        req.input('photoBlobName', sql.NVarChar(255), data.photo_blob_name       || null);
        req.input('createdBy',     sql.Int,           data.created_by);
    });
    const id = result.recordset?.[0]?.id;
    if (!id) throw new Error('INSERT shift_rendezvous_points did not return id.');
    return id;
}

/**
 * Update a rendezvous point. Any field set to null clears that value
 * (KEYMAN can clear individual fields without deleting the record).
 *
 * @param {number} id
 * @param {{
 *   description?:     string|null,
 *   address?:         string|null,
 *   latitude?:        number|null,
 *   longitude?:       number|null,
 *   floor_number?:    string|null,
 *   photo_blob_name?: string|null,
 *   updated_by:       number,
 * }} data
 * @returns {Promise<boolean>}
 */
export async function updateShiftRendezvous(id, data) {
    const result = await exec(`
        UPDATE dbo.shift_rendezvous_points
        SET description     = @description,
            address         = @address,
            latitude        = @latitude,
            longitude       = @longitude,
            floor_number    = @floorNumber,
            photo_blob_name = @photoBlobName,
            updated_by      = @updatedBy,
            updated_at      = SYSUTCDATETIME()
        WHERE id = @id;
    `, (req) => {
        req.input('id',            sql.Int,          id);
        req.input('description',   sql.NVarChar(500), data.description?.trim()   ?? null);
        req.input('address',       sql.NVarChar(500), data.address?.trim()       ?? null);
        req.input('latitude',      sql.Float,         data.latitude  != null ? Number(data.latitude)  : null);
        req.input('longitude',     sql.Float,         data.longitude != null ? Number(data.longitude) : null);
        req.input('floorNumber',   sql.NVarChar(20),  data.floor_number?.trim()  ?? null);
        req.input('photoBlobName', sql.NVarChar(255), data.photo_blob_name       ?? null);
        req.input('updatedBy',     sql.Int,           data.updated_by);
    });
    const affected = Array.isArray(result.rowsAffected)
        ? result.rowsAffected.reduce((s, n) => s + n, 0)
        : result.rowsAffected || 0;
    return affected > 0;
}

/**
 * Delete a rendezvous point by id.
 *
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export async function deleteShiftRendezvous(id) {
    const result = await exec(`
        DELETE FROM dbo.shift_rendezvous_points WHERE id = @id;
    `, (req) => {
        req.input('id', sql.Int, id);
    });
    const affected = Array.isArray(result.rowsAffected)
        ? result.rowsAffected.reduce((s, n) => s + n, 0)
        : result.rowsAffected || 0;
    return affected > 0;
}

/**
 * Get the rendezvous point by its own id (used by PUT / DELETE routes
 * that receive the RV id directly).
 *
 * @param {number} id
 * @returns {Promise<object|null>}
 */
export async function getShiftRendezvousById(id) {
    const result = await exec(`
        SELECT
            rp.id, rp.schedule_assignment_id, rp.description,
            rp.address, rp.latitude, rp.longitude,
            rp.floor_number, rp.photo_blob_name,
            rp.created_by, rp.updated_by,
            rp.created_at, rp.updated_at,
            sa.shift_id,
            sa.location_task_id,
            lt.name AS location_name
        FROM dbo.shift_rendezvous_points rp
        JOIN dbo.schedule_assignments    sa ON sa.id = rp.schedule_assignment_id
        JOIN dbo.locations_tasks         lt ON lt.id = sa.location_task_id
        WHERE rp.id = @id;
    `, (req) => {
        req.input('id', sql.Int, id);
    });
    return result.recordset?.[0] || null;
}

/**
 * Get all SMS-eligible volunteers assigned to a specific schedule assignment.
 * Used when an ad-hoc rendezvous update alert needs to be sent within
 * the T-15 window.
 *
 * @param {number} scheduleAssignmentId
 * @returns {Promise<Array<{
 *   volunteer_id:    number,
 *   firstName:       string,
 *   phone:           string,
 *   shift_id:        number,
 *   sms_code:        string|null,
 *   shift_label:     string,
 *   start_time:      Date|string,
 *   convention_date: Date|string,
 *   event_type_name: string,
 * }>>}
 */
export async function getVolunteersForRendezvousAlert(scheduleAssignmentId) {
    const result = await exec(`
        SELECT DISTINCT
            vi.id              AS volunteer_id,
            vi.firstName,
            vi.phone,
            sh.id              AS shift_id,
            sh.sms_code,
            sh.label           AS shift_label,
            sh.start_time,
            cd.convention_date,
            sc.name            AS event_type_name
        FROM dbo.shift_slot_assignments  ssa
        JOIN dbo.schedule_assignments    sa   ON sa.id  = ssa.schedule_assignment_id
        JOIN dbo.shifts                  sh   ON sh.id  = sa.shift_id
        JOIN dbo.sessions               sess ON sess.id = sh.session_id
        JOIN dbo.convention_days         cd   ON cd.id  = sess.convention_day_id
        LEFT JOIN dbo.scheduler_categories sc ON sc.id  = sh.category_id
        JOIN dbo.volunteer_in            vi   ON vi.id  = ssa.volunteer_id
        WHERE ssa.schedule_assignment_id = @saId
          AND vi.sms_shift_alerts_opt_in = 1
          AND vi.sms_opted_in            = 1
          AND vi.smsCapable              = 1
          AND vi.phone                   IS NOT NULL
        ORDER BY vi.firstName;
    `, (req) => {
        req.input('saId', sql.Int, scheduleAssignmentId);
    });
    return result.recordset || [];
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
              session_id:     newSessionId,
              category_id:    shift.category_id    ?? null,
              label:          shift.label,
              start_time:     toTimeString(shift.start_time),
              end_time:       toTimeString(shift.end_time),
              volunteer_need: shift.volunteer_need || null,
              notes:          shift.notes          || null,
              is_meeting:     shift.is_meeting     || false,
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

/* Fetch all completed volunteers with the fields needed by the
 * Messaging Center: name, contact info, SMS capability, active status,
 * gender, role, and crew assignments for sidebar filtering.
 *
 * @returns {Promise<Array<{\n *   id: number,
 *   firstName: string,
 *   lastName: string,
 *   suffix: string|null,
 *   email: string|null,
 *   phone: string|null,
 *   smsCapable: boolean,
 *   active_current_year: boolean,
 *   registration_status: string,
 *   gender: string|null,
 *   role: string,
 *   crew_lots_garages: boolean,
 *   crew_signs: boolean,
 *   crew_security: boolean,
 *   crew_dropoff_pickup: boolean,
 *   crew_mobile_support: boolean,
 *   crew_desk: boolean,
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
            sms_opted_out,
            active_current_year,
            registration_status,
            gender,
            role,
            crew_lots_garages,
            crew_signs,
            crew_security,
            crew_dropoff_pickup,
            crew_mobile_support,
            crew_desk
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
        smsCapable:          !!v.smsCapable,
        sms_opted_out:       !!v.sms_opted_out,
        active_current_year: !!v.active_current_year,
        registration_status: v.registration_status || '',
        gender:              v.gender              || null,
        role:                v.role                || 'REGISTERED',
        crew_lots_garages:   !!v.crew_lots_garages,
        crew_signs:          !!v.crew_signs,
        crew_security:       !!v.crew_security,
        crew_dropoff_pickup: !!v.crew_dropoff_pickup,
        crew_mobile_support: !!v.crew_mobile_support,
        crew_desk:           !!v.crew_desk,
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
            sc.name            AS event_type_name,
            sc.color           AS event_type_color,
            i.response_other,
            b.response_config,
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
        LEFT JOIN dbo.invitation_batches b
            ON b.id = i.batch_id
        LEFT JOIN dbo.convention_days cd
            ON cd.id = i.convention_day_id
        LEFT JOIN dbo.shifts sh
            ON sh.id = i.shift_id
        LEFT JOIN dbo.scheduler_categories sc
            ON sc.id = sh.category_id
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
export async function markInvitationResponded(token, response, responseOther = null) {
    const result = await exec(`
        UPDATE dbo.invitations
        SET
            responded_at   = SYSUTCDATETIME(),
            response       = @response,
            response_other = @responseOther,
            last_updated   = SYSUTCDATETIME()
        WHERE token = @token;
    `, (req) => {
        req.input('token',         sql.NVarChar(100), token);
        req.input('response',      sql.NVarChar(50),  response);
        req.input('responseOther', sql.NVarChar(500), responseOther || null);
    });

    return (result.rowsAffected?.[0] ?? 0) > 0;
}

// ============================================================
// MESSAGING CENTER — Message Templates
// ============================================================



/**
 * Update an invitation's RSVP response directly by its ID.
 * Used by the oversight edit-volunteer tool to record verbal RSVPs.
 * Pass null for response to clear back to "pending".
 *
 * @param {number} invitationId
 * @param {'yes'|'no'|'maybe'|null} response
 * @returns {Promise<boolean>} True if a row was updated.
 */
export async function setInvitationResponseById(invitationId, response) {
    const result = await exec(`
        UPDATE dbo.invitations
        SET
            response     = @response,
            responded_at = CASE WHEN @response IS NOT NULL THEN SYSUTCDATETIME() ELSE NULL END,
            last_updated = SYSUTCDATETIME()
        WHERE id = @invitationId;
    `, (req) => {
        req.input('invitationId', sql.Int,          invitationId);
        req.input('response',     sql.NVarChar(50), response ?? null);
    });
    return (result.rowsAffected?.[0] ?? 0) > 0;
}
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
             sc.dept_key,
             sc.name                            AS dept_name,
             sh.start_time                      AS shift_start,
             sh.end_time                        AS shift_end,
             sa.id                              AS assignment_id,
             lt.name                            AS location_name,
             sh.has_keyman,
             sh.has_keyman_asst,
             ssa.slot_type,
             ssa.slot_index,
             ssa.note                           AS vol_note,
             v.id                               AS vol_id,
             v.firstName                        AS vol_first,
             v.lastName                         AS vol_last,
             v.phone                            AS vol_phone
         FROM dbo.convention_days cd
         JOIN dbo.sessions sess   ON sess.convention_day_id = cd.id
         JOIN dbo.shifts   sh     ON sh.session_id = sess.id
                                 AND sh.category_id IS NOT NULL
         JOIN dbo.scheduler_categories sc ON sc.id = sh.category_id
         JOIN dbo.schedule_assignments sa ON sa.shift_id = sh.id
         JOIN dbo.locations_tasks      lt ON lt.id = sa.location_task_id
         LEFT JOIN dbo.shift_slot_assignments ssa
             ON  ssa.schedule_assignment_id = sa.id
             AND ssa.convention_day_id       = cd.id
         LEFT JOIN dbo.volunteer_in v
             ON  v.id = ssa.volunteer_id
             AND v.registration_status <> 'deleted'
         WHERE cd.id = @dayId
         ORDER BY
             sc.name,
             sh.start_time,
             lt.name,
             CASE ssa.slot_type
                 WHEN 'keyman'      THEN 0
                 WHEN 'keyman_asst' THEN 1
                 ELSE 2
             END,
             v.lastName,
             v.firstName;`,
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

    /** @type {{id:number, label:string, convention_date:string}|null} */
    let day = null;
    /** @type {Map<string, {key:string, name:string, shifts:Record<number,object>}>} */
    const depts = new Map();

    for (const r of rows) {
        if (!day) {
            day = { id: r.day_id, label: r.day_label, convention_date: r.convention_date };
        }

        if (!depts.has(r.dept_key)) {
            depts.set(r.dept_key, {
                key:    r.dept_key,
                name:   r.dept_name || r.dept_key,
                shifts: {},
            });
        }

        const deptShifts = depts.get(r.dept_key).shifts;
        if (!deptShifts[r.shift_id]) {
            deptShifts[r.shift_id] = {
                id:              r.shift_id,
                label:           r.shift_label,
                start_time:      fmtT(r.shift_start),
                end_time:        fmtT(r.shift_end),
                has_keyman:      !!r.has_keyman,
                has_keyman_asst: !!r.has_keyman_asst,
                locations:       {},
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
            const vol = { id: r.vol_id, firstName: r.vol_first, lastName: r.vol_last, phone: r.vol_phone || null, note: r.vol_note || null };
            const loc = locs[r.assignment_id];
            if      (r.slot_type === 'keyman')      loc.keyman      = vol;
            else if (r.slot_type === 'keyman_asst') loc.keyman_asst = vol;
            else                                     loc.volunteers.push(vol);
        }
    }

    // Deduplicate across all slot types — keep each volunteer in their
    // highest role only (KM > KA > volunteer).
    for (const dept of depts.values()) {
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
        departments: Array.from(depts.values()).map((dept) => ({
            ...dept,
            shifts: Object.values(dept.shifts).map((s) => ({
                ...s,
                locations: Object.values(s.locations),
            })),
        })),
    };
}

/**
 * Get a volunteer's full schedule across all convention days for a year.
 *
 * Returns assignments organized by day, each containing shift info,
 * location, role, and KM/KA leader details for that location.
 *
 * @param {number} volunteerId
 * @param {number} year
 * @returns {Promise<{days: Array<{
 *   id: number,
 *   label: string,
 *   convention_date: string|null,
 *   assignments: Array<{
 *     shift_id: number,
 *     shift_label: string,
 *     dept_key: string,
 *     dept_name: string,
 *     start_time: string|null,
 *     end_time: string|null,
 *     location_name: string,
 *     slot_type: string,
 *     note: string|null,
 *     keyman: {firstName:string, lastName:string, phone:string|null}|null,
 *     keyman_asst: {firstName:string, lastName:string, phone:string|null}|null,
 *   }>
 * }>}>}
 */
export async function getVolunteerScheduleReport(volunteerId, year) {
    /** @param {Date|string|null} t @returns {string|null} */
    function fmtT(t) {
        if (!t) return null;
        const d = t instanceof Date ? t : new Date(t);
        const h = d.getUTCHours(), m = d.getUTCMinutes(), ap = h >= 12 ? 'PM' : 'AM';
        return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`;
    }

    // 1) All assignments for this volunteer in the given year
    const assignRes = await exec(
        `SELECT
             cd.id                              AS day_id,
             cd.label                           AS day_label,
             CONVERT(VARCHAR(10), cd.convention_date, 120) AS convention_date,
             sh.id                              AS shift_id,
             sh.label                           AS shift_label,
             sc.dept_key,
             sc.name                            AS dept_name,
             sh.start_time                      AS shift_start,
             sh.end_time                        AS shift_end,
             lt.name                            AS location_name,
             sa.id                              AS assignment_id,
             ssa.slot_type,
             ssa.note                           AS vol_note
         FROM dbo.shift_slot_assignments ssa
         JOIN dbo.schedule_assignments sa ON sa.id = ssa.schedule_assignment_id
         JOIN dbo.shifts sh               ON sh.id = sa.shift_id
         LEFT JOIN dbo.scheduler_categories sc ON sc.id = sh.category_id
         JOIN dbo.sessions sess           ON sess.id = sh.session_id
         JOIN dbo.convention_days cd      ON cd.id = ssa.convention_day_id
         JOIN dbo.locations_tasks lt      ON lt.id = sa.location_task_id
         WHERE ssa.volunteer_id = @volunteerId
           AND cd.year = @year
         ORDER BY cd.convention_date, sh.start_time, lt.name;`,
        (req) => {
            req.input('volunteerId', sql.Int, volunteerId);
            req.input('year',        sql.Int, year);
        },
    );

    const rows = assignRes.recordset || [];
    if (rows.length === 0) return { days: [] };

    // 2) KM/KA leaders for every schedule_assignment the volunteer appears in
    const assignmentIds = [...new Set(rows.map((r) => r.assignment_id))];
    const kmkaRes = await exec(
        `SELECT
             ssa.schedule_assignment_id,
             ssa.slot_type,
             v.firstName,
             v.lastName,
             v.phone
         FROM dbo.shift_slot_assignments ssa
         JOIN dbo.volunteer_in v ON v.id = ssa.volunteer_id
         WHERE ssa.slot_type IN ('keyman', 'keyman_asst')
           AND ssa.schedule_assignment_id IN (
               SELECT [value] FROM OPENJSON(@ids)
           );`,
        (req) => {
            req.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(assignmentIds));
        },
    );

    /** @type {Record<number, {keyman?:object, keyman_asst?:object}>} */
    const leaderMap = {};
    for (const r of kmkaRes.recordset || []) {
        if (!leaderMap[r.schedule_assignment_id]) leaderMap[r.schedule_assignment_id] = {};
        leaderMap[r.schedule_assignment_id][r.slot_type] = {
            firstName: r.firstName,
            lastName:  r.lastName,
            phone:     r.phone || null,
        };
    }

    // 3) Group by day
    /** @type {Record<number, {id:number, label:string, convention_date:string|null, assignments:Array}>} */
    const dayMap = {};
    for (const r of rows) {
        if (!dayMap[r.day_id]) {
            dayMap[r.day_id] = {
                id:              r.day_id,
                label:           r.day_label,
                convention_date: r.convention_date || null,
                assignments:     [],
            };
        }
        dayMap[r.day_id].assignments.push({
            shift_id:      r.shift_id,
            shift_label:   r.shift_label,
            dept_key:      r.dept_key,
            dept_name:     r.dept_name || r.dept_key || '',
            start_time:    fmtT(r.shift_start),
            end_time:      fmtT(r.shift_end),
            location_name: r.location_name,
            slot_type:     r.slot_type || 'volunteer',
            note:          r.vol_note || null,
            keyman:        leaderMap[r.assignment_id]?.keyman      || null,
            keyman_asst:   leaderMap[r.assignment_id]?.keyman_asst || null,
        });
    }

    return { days: Object.values(dayMap) };
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
            sc.name        AS event_type_name,
            sc.color       AS event_type_color
        FROM dbo.convention_days cd
        LEFT JOIN dbo.sessions se
            ON se.convention_day_id = cd.id
        LEFT JOIN dbo.shifts sh
            ON sh.session_id = se.id
        LEFT JOIN dbo.scheduler_categories sc
            ON sc.id = sh.category_id
        WHERE cd.year = @year
        ORDER BY
            cd.convention_date,
            se.start_time,
            sh.start_time;
    `, (req) => {
        req.input('year', sql.Int, year);
    });

    // ── Nest into day → session → shift oversight structure──────────────────────
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
            b.message_type,
            cd.label           AS day_label,
            cd.convention_date,
            sh.label           AS shift_label,
            sc.name            AS event_type_name,
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
        LEFT JOIN dbo.scheduler_categories sc ON sc.id = sh.category_id
        LEFT JOIN dbo.invitations i       ON i.batch_id = b.id
        WHERE b.year   = @year
          AND b.active = 1
GROUP BY
            b.id, b.name, b.convention_day_id, b.shift_id,
            b.parent_batch_id, pb.name, b.response_needed,
            b.message_type,
            cd.label, cd.convention_date,
            sh.label, sc.name,
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
            b.message_type,
            cd.label           AS day_label,
            cd.convention_date,
            cd.program_start,
            cd.program_end,
            sh.label           AS shift_label,
            sh.start_time      AS shift_start,
            sh.end_time        AS shift_end,
            sc.name            AS event_type_name,
            sc.color           AS event_type_color,
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
        LEFT JOIN dbo.scheduler_categories sc ON sc.id = sh.category_id
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
    messageType = 'invitation',
    responseConfig = null,
}) {
    const result = await exec(`
        INSERT INTO dbo.invitation_batches
            (name, convention_day_id, shift_id, message_subject,
             message_body, year, created_by, parent_batch_id, response_needed, message_type,
             response_config)
        OUTPUT INSERTED.id
        VALUES
            (@name, @conventionDayId, @shiftId, @messageSubject,
             @messageBody, @year, @createdBy, @parentBatchId, @responseNeeded, @messageType,
             @responseConfig);
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
        req.input('messageType',      sql.NVarChar(20),      ['invitation','alert','followup'].includes(messageType) ? messageType : 'invitation');
        req.input('responseConfig',   sql.NVarChar(sql.MAX), responseConfig ? JSON.stringify(responseConfig) : null);
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
    messageType = 'invitation',
    responseConfig = null,
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
            message_type     = @messageType,
            response_config  = @responseConfig,
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
        req.input('messageType',     sql.NVarChar(20),      ['invitation','alert','followup'].includes(messageType) ? messageType : 'invitation');
        req.input('responseConfig',  sql.NVarChar(sql.MAX), responseConfig ? JSON.stringify(responseConfig) : null);
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
            sc.name        AS event_type_name,
            sc.color       AS event_type_color
        FROM dbo.convention_days cd
        LEFT JOIN dbo.sessions se
            ON se.convention_day_id = cd.id
        LEFT JOIN dbo.shifts sh
            ON sh.session_id = se.id
           AND sh.invitable = 1
        LEFT JOIN dbo.scheduler_categories sc
            ON sc.id = sh.category_id
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

/**
 * Set a volunteer's SMS opt-out status manually (oversight use).
 * - optOut=true:  marks opted_out=1, opted_in=0 (mirrors Twilio STOP)
 * - optOut=false: clears opted_out, restores opted_in=1 (mirrors UNSTOP)
 *
 * @param {number}  volunteerId
 * @param {boolean} optOut  true to opt out, false to opt back in
 * @returns {Promise<boolean>} true if a row was updated
 */
export async function setVolunteerSmsOptOutManual(volunteerId, optOut) {
    const result = optOut
        ? await exec(`
            UPDATE dbo.volunteer_in
            SET sms_opted_out    = 1,
                sms_opted_out_at = SYSUTCDATETIME(),
                sms_opted_in     = 0
            WHERE id = @id;
          `, (req) => { req.input('id', sql.Int, volunteerId); })
        : await exec(`
            UPDATE dbo.volunteer_in
            SET sms_opted_out    = 0,
                sms_opted_out_at = NULL,
                sms_opted_in     = 1,
                sms_opted_in_at  = SYSUTCDATETIME(),
                sms_opted_in_source = 'admin'
            WHERE id = @id;
          `, (req) => { req.input('id', sql.Int, volunteerId); });

    return (result.rowsAffected?.[0] ?? 0) > 0;
}

/**
 * Fetch all active volunteers with their SMS opt-in/out status.
 * Used by the oversight SMS management tab.
 *
 * @returns {Promise<Array<{
 *   id:                   number,
 *   firstName:            string,
 *   lastName:             string,
 *   suffix:               string|null,
 *   phone:                string|null,
 *   smsCapable:           boolean,
 *   sms_opted_in:         boolean,
 *   sms_opted_in_at:      Date|null,
 *   sms_opted_in_source:  string|null,
 *   sms_opted_out:        boolean,
 *   sms_opted_out_at:     Date|null,
 * }>>}
 */
export async function getVolunteersForSmsManagement() {
    const result = await exec(`
        SELECT
            id,
            firstName,
            lastName,
            suffix,
            phone,
            smsCapable,
            sms_opted_in,
            sms_opted_in_at,
            sms_opted_in_source,
            sms_opted_out,
            sms_opted_out_at
        FROM dbo.volunteer_in
        WHERE registration_status NOT IN ('archived', 'deleted')
        ORDER BY lastName, firstName, suffix;
    `);
    return result.recordset || [];
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
/**
 * Fetch invitations for the tracker page.
 *
 * Always collapses to one row per volunteer per campaign family using
 * ROW_NUMBER. A "family" is a parent batch plus all of its direct
 * follow-up children (identified via parent_batch_id). The winning row
 * for each volunteer within a family is selected by:
 *   1. Responded + not revoked (priority 0)
 *   2. Pending + not revoked  (priority 1)
 *   3. Revoked                (priority 2)
 *   … then most-recent invitation id as tiebreaker.
 *
 * The returned rows include `family_root_id` — the id of the root parent
 * batch for each invitation — so callers can filter or group by family.
 *
 * Optional filters:
 *  - `conventionDayId` — limit to invitations linked to a specific day
 *  - `batchId`         — limit to one campaign family (family_root_id = batchId)
 *  - `response`        — 'all' | 'pending' | 'yes' | 'no' | 'maybe'
 *  - `includeRevoked`  — when false, revoked rows are excluded from results
 *
 * @param {{
 *   conventionDayId?: number|null,
 *   batchId?:         number|null,
 *   response?:        'all'|'pending'|'yes'|'no'|'maybe',
 *   includeRevoked?:  boolean,
 * }} [opts]
 * @returns {Promise<Array<object>>}
 */
export async function getInvitationsForTracker({
    conventionDayId = null,
    batchId         = null,
    response        = 'all',
    includeRevoked  = true,
} = {}) {

    const filters = [];
    if (conventionDayId) filters.push('fr.convention_day_id = @dayId');
    if (batchId)         filters.push('fr.family_root_id = @batchId');
    if (!includeRevoked) filters.push('fr.revoked = 0');
    if (response === 'pending') filters.push('fr.responded_at IS NULL AND fr.revoked = 0');
    else if (response === 'yes')   filters.push("fr.response = 'yes'");
    else if (response === 'no')    filters.push("fr.response = 'no'");
    else if (response === 'maybe') filters.push("fr.response = 'maybe'");

    const whereClause = 'WHERE fr.rn = 1'
        + (filters.length > 0 ? ' AND ' + filters.join(' AND ') : '');

    const result = await exec(`
        WITH family_ranked AS (
            SELECT
                i.id,
                i.volunteer_id,
                i.batch_id,
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
                i.convention_day_id,
                i.shift_id,
                i.response_other,
                COALESCE(b.parent_batch_id, i.batch_id) AS family_root_id,
                ROW_NUMBER() OVER (
                    PARTITION BY i.volunteer_id,
                                 COALESCE(b.parent_batch_id, i.batch_id)
                    ORDER BY
                        CASE
                            WHEN i.revoked = 1          THEN 2
                            WHEN i.response IS NOT NULL THEN 0
                            ELSE                             1
                        END,
                        i.id DESC
                ) AS rn
            FROM dbo.invitations i
            LEFT JOIN dbo.invitation_batches b ON b.id = i.batch_id
        )
        SELECT
            fr.id,
            fr.volunteer_id,
            fr.batch_id,
            fr.token,
            fr.sent_at,
            fr.channel,
            fr.message_subject,
            
            fr.responded_at,
            fr.response,
            fr.sent_by,
            fr.revoked,
            fr.revoked_at,
            fr.revoked_by,
            fr.opted_in_at,
            fr.last_reminded_at,
            fr.reminder_count,
            fr.last_reminded_channel,
            fr.convention_day_id,
            fr.shift_id,
            fr.family_root_id,
            v.firstName,
            v.lastName,
            v.gender,
            v.registration_status   AS volunteer_status,
            b.name                  AS batch_name,
            b.message_type          AS batch_message_type,
            b.response_needed,
            b.parent_batch_id,
            b.response_config,
            fr.response_other,
            cd.label                AS day_label,
            cd.convention_date,
            sh.label                AS shift_label,
            sh.start_time           AS shift_start,
            sh.end_time             AS shift_end,
            sc.name                 AS event_type_name,
            sc.color                AS event_type_color
        FROM family_ranked fr
        INNER JOIN dbo.volunteer_in v
            ON v.id = fr.volunteer_id
        LEFT JOIN dbo.invitation_batches b
            ON b.id = fr.batch_id
        LEFT JOIN dbo.convention_days cd
            ON cd.id = fr.convention_day_id
        LEFT JOIN dbo.shifts sh
            ON sh.id = fr.shift_id
        LEFT JOIN dbo.scheduler_categories sc
            ON sc.id = sh.category_id
        ${whereClause}
        ORDER BY fr.sent_at DESC;
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
            sc.name                                        AS event_type_name,
            sc.color                                       AS event_type_color,
            i.channel,
            i.response,
            i.responded_at,
            COALESCE(i.last_reminded_at, i.sent_at)       AS last_sent_at,
            CAST(i.revoked AS BIT)                         AS revoked
        FROM dbo.invitations i
        LEFT JOIN dbo.convention_days cd  ON cd.id = i.convention_day_id
        LEFT JOIN dbo.shifts sh           ON sh.id = i.shift_id
        LEFT JOIN dbo.scheduler_categories sc ON sc.id = sh.category_id
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
 *   gender:          string|null,
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
            v.gender,
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
            v.gender,
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
 *   gender:          string|null,
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
            v.gender,
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
            v.gender,
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
    const result = await exec(
      `
        SELECT
            sh.id                                                       AS shift_id,
            sh.label                                                    AS shift_label,
            sh.start_time                                               AS shift_start,
            sh.end_time                                                 AS shift_end,
            sc.name                                                     AS event_type_name,
            sc.color                                                     AS event_type_color,
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
        LEFT JOIN dbo.scheduler_categories sc
            ON sc.id = sh.category_id
        LEFT JOIN dbo.invitations i
            ON i.shift_id = sh.id
           AND i.revoked  = 0
        LEFT JOIN dbo.attendance a
            ON a.shift_id      = sh.id
           AND a.volunteer_id  = i.volunteer_id
        WHERE se.convention_day_id = @dayId
        GROUP BY
            sh.id, sh.label, sh.start_time, sh.end_time,
            sc.name, sc.color, se.id, se.label, se.start_time
        ORDER BY se.start_time, sh.start_time;
    `,
      (req) => {
        req.input("dayId", sql.Int, dayId);
      },
    );

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
// SCHEDULER — Blackouts
// ============================================================

/**
 * Fetch all blackout windows for a convention day.
 * Used on day load to pre-populate the conflict tracker.
 *
 * @param {number} dayId
 * @returns {Promise<Array<{id:number, volunteer_id:number, start_mins:number, end_mins:number, reason:string|null}>>}
 */
export async function getBlackoutsForDay(dayId) {
    const result = await exec(`
        SELECT id, volunteer_id, start_mins, end_mins, reason
        FROM dbo.volunteer_blackouts
        WHERE convention_day_id = @dayId
        ORDER BY volunteer_id, start_mins;
    `, (req) => {
        req.input('dayId', sql.Int, dayId);
    });
    return result.recordset || [];
}

/**
 * Fetch blackout windows for one volunteer on a convention day.
 * Used by the Manage Blackouts panel.
 *
 * @param {number} volunteerId
 * @param {number} dayId
 * @returns {Promise<Array<{id:number, volunteer_id:number, start_mins:number, end_mins:number, reason:string|null}>>}
 */
export async function getBlackoutsForVolunteer(volunteerId, dayId) {
    const result = await exec(`
        SELECT id, volunteer_id, start_mins, end_mins, reason
        FROM dbo.volunteer_blackouts
        WHERE volunteer_id = @volunteerId
          AND convention_day_id = @dayId
        ORDER BY start_mins;
    `, (req) => {
        req.input('volunteerId', sql.Int, volunteerId);
        req.input('dayId',       sql.Int, dayId);
    });
    return result.recordset || [];
}

/**
 * Create a blackout window for a volunteer on a convention day.
 *
 * @param {{
 *   volunteerId:     number,
 *   conventionDayId: number,
 *   startMins:       number,
 *   endMins:         number,
 *   reason?:         string|null,
 *   createdBy?:      string|null
 * }} params
 * @returns {Promise<number>} The new blackout id.
 */
export async function createBlackout({ volunteerId, conventionDayId, startMins, endMins, reason = null, createdBy = null }) {
    const result = await exec(`
        INSERT INTO dbo.volunteer_blackouts
            (volunteer_id, convention_day_id, start_mins, end_mins, reason, created_by)
        OUTPUT INSERTED.id
        VALUES (@volunteerId, @conventionDayId, @startMins, @endMins, @reason, @createdBy);
    `, (req) => {
        req.input('volunteerId',     sql.Int,           volunteerId);
        req.input('conventionDayId', sql.Int,           conventionDayId);
        req.input('startMins',       sql.Int,           startMins);
        req.input('endMins',         sql.Int,           endMins);
        req.input('reason',          sql.NVarChar(200), reason    || null);
        req.input('createdBy',       sql.NVarChar(200), createdBy || null);
    });
    return result.recordset?.[0]?.id;
}

/**
 * Delete a blackout window by id.
 *
 * @param {number} id
 * @returns {Promise<boolean>} True if a row was deleted.
 */
export async function deleteBlackout(id) {
    const result = await exec(`
        DELETE FROM dbo.volunteer_blackouts WHERE id = @id;
    `, (req) => {
        req.input('id', sql.Int, id);
    });
    return (result.rowsAffected?.[0] ?? 0) > 0;
}

/**
 * Return the full day → session → shift tree for the blackout picker.
 * Times are pre-converted to minutes-from-midnight so the client
 * never has to parse mssql epoch-anchored Date objects.
 * Only non-meeting shifts with an assigned scheduler category are included.
 *
 * @param {number} year
 * @returns {Promise<Array<{
 *   dayId:    number,
 *   dayLabel: string,
 *   sessions: Array<{
 *     sessionId:           number,
 *     sessionLabel:        string,
 *     startMins:           number|null,
 *     endMins:             number|null,
 *     firstShiftStartMins: number|null,
 *     shifts: Array<{
 *       shiftId:    number,
 *       shiftLabel: string,
 *       deptKey:    string|null,
 *       startMins:  number|null,
 *       endMins:    number|null,
 *     }>,
 *   }>,
 * }>>}
 */
export async function getBlackoutPickerData(year) {
    const result = await exec(`
        SELECT
            cd.id          AS dayId,
            cd.label       AS dayLabel,
            s.id           AS sessionId,
            s.label        AS sessionLabel,
            s.start_time   AS sessionStart,
            s.end_time     AS sessionEnd,
            sh.id          AS shiftId,
            sh.label       AS shiftLabel,
            sh.start_time  AS shiftStart,
            sh.end_time    AS shiftEnd,
            sc.dept_key    AS deptKey
        FROM dbo.convention_days cd
        JOIN dbo.sessions s
            ON s.convention_day_id = cd.id
        LEFT JOIN dbo.shifts sh
            ON  sh.session_id   = s.id
            AND sh.is_meeting   = 0
            AND sh.category_id IS NOT NULL
        LEFT JOIN dbo.scheduler_categories sc
            ON sc.id = sh.category_id
        WHERE cd.year = @year
        ORDER BY cd.id, s.start_time, sh.start_time;
    `, (req) => {
        req.input('year', sql.Int, year);
    });

    const rows = result.recordset || [];

    /** @param {Date|null} t  @returns {number|null} */
    const toMins = (t) => (t instanceof Date)
        ? t.getUTCHours() * 60 + t.getUTCMinutes()
        : null;

    /** @type {Map<number, { dayId: number, dayLabel: string, sessions: Map<number, object> }>} */
    const dayMap = new Map();

    for (const r of rows) {
        if (!dayMap.has(r.dayId)) {
            dayMap.set(r.dayId, { dayId: r.dayId, dayLabel: r.dayLabel, sessions: new Map() });
        }
        const day = dayMap.get(r.dayId);

        if (!day.sessions.has(r.sessionId)) {
            day.sessions.set(r.sessionId, {
                sessionId:    r.sessionId,
                sessionLabel: r.sessionLabel,
                startMins:    toMins(r.sessionStart),
                endMins:      toMins(r.sessionEnd),
                shifts:       [],
            });
        }
        const sess = day.sessions.get(r.sessionId);

        if (r.shiftId != null) {
            sess.shifts.push({
                shiftId:    r.shiftId,
                shiftLabel: r.shiftLabel || '',
                deptKey:    r.deptKey    || null,
                startMins:  toMins(r.shiftStart),
                endMins:    toMins(r.shiftEnd),
            });
        }
    }

    return Array.from(dayMap.values()).map((day) => ({
        dayId:    day.dayId,
        dayLabel: day.dayLabel,
        sessions: Array.from(day.sessions.values()).map((sess) => ({
            ...sess,
            firstShiftStartMins: sess.shifts.length > 0
                ? Math.min(...sess.shifts.map((sh) => sh.startMins ?? Infinity))
                : null,
        })),
    }));
}

/**
 * Delete a blackout window only if it belongs to the specified volunteer.
 * Used by the self-service My Account route so volunteers can only remove
 * their own blackouts.
 *
 * @param {number} id          - Blackout row id.
 * @param {number} volunteerId - Logged-in volunteer's id.
 * @returns {Promise<boolean>} True if a row was deleted.
 */
export async function deleteBlackoutForVolunteer(id, volunteerId) {
    const result = await exec(`
        DELETE FROM dbo.volunteer_blackouts
        WHERE id = @id AND volunteer_id = @volunteerId;
    `, (req) => {
        req.input('id',          sql.Int, id);
        req.input('volunteerId', sql.Int, volunteerId);
    });
    return (result.rowsAffected?.[0] ?? 0) > 0;
}

/**
 * Fetch all blackout rows for a given volunteer across every convention day.
 * Unlike getBlackoutsForVolunteer(), this returns all days at once so the
 * BlackoutTimeline component can populate every track in a single request.
 *
 * @param {number} volunteerId
 * @returns {Promise<Array<{
 *   id:             number,
 *   conventionDayId: number,
 *   startMins:      number,
 *   endMins:        number,
 *   reason:         string|null
 * }>>}
 */
export async function getVolunteerBlackouts(volunteerId) {
    const result = await exec(`
        SELECT
            id,
            convention_day_id AS conventionDayId,
            start_mins        AS startMins,
            end_mins          AS endMins,
            reason
        FROM  dbo.volunteer_blackouts
        WHERE volunteer_id = @volunteerId
        ORDER BY convention_day_id, start_mins;
    `, (req) => {
        req.input('volunteerId', sql.Int, volunteerId);
    });
    return result.recordset || [];
}
 
/**
 * Replace all blackout rows for a volunteer with the supplied array.
 * Executes a DELETE then a batch of INSERTs sequentially.
 * If the blackouts array is empty the DELETE still runs, clearing all rows.
 *
 * @param {number} volunteerId
 * @param {Array<{
 *   conventionDayId: number,
 *   startMins:       number,
 *   endMins:         number,
 *   reason?:         string|null
 * }>} blackouts
 * @param {string} createdBy  Username / email of the acting user.
 * @returns {Promise<void>}
 */
export async function saveVolunteerBlackouts(volunteerId, blackouts, createdBy) {
    await exec(`
        DELETE FROM dbo.volunteer_blackouts
        WHERE volunteer_id = @volunteerId;
    `, (req) => {
        req.input('volunteerId', sql.Int, volunteerId);
    });
 
    for (const b of blackouts) {
        await exec(`
            INSERT INTO dbo.volunteer_blackouts
                (volunteer_id, convention_day_id, start_mins, end_mins, reason, created_by, created_at)
            VALUES
                (@volunteerId, @conventionDayId, @startMins, @endMins, @reason, @createdBy, GETDATE());
        `, (req) => {
            req.input('volunteerId',     sql.Int,           volunteerId);
            req.input('conventionDayId', sql.Int,           b.conventionDayId);
            req.input('startMins',       sql.Int,           b.startMins);
            req.input('endMins',         sql.Int,           b.endMins);
            req.input('reason',          sql.NVarChar(200), b.reason    || null);
            req.input('createdBy',       sql.NVarChar(200), createdBy   || null);
        });
    }
}
/**
 * Fetch all data needed to render the Master Conflict Grid for a given year.
 *
 * Returns four arrays:
 *  - shifts:      ordered columns (day + shift info with times as minutes)
 *  - volunteers:  rows (only those with at least one assignment)
 *  - assignments: volunteer_id → shift_id pairs
 *  - blackouts:   volunteer_id → day_id time ranges
 *
 * @param {number} year
 * @returns {Promise<{
 *   shifts:      Array<{shift_id:number, shift_label:string, start_mins:number, end_mins:number, department:string, day_id:number, day_label:string, convention_date:string}>,
 *   volunteers:  Array<{id:number, firstName:string, lastName:string}>,
 *   assignments: Array<{volunteer_id:number, shift_id:number}>,
 *   blackouts:   Array<{volunteer_id:number, day_id:number, start_mins:number, end_mins:number}>
 * }>}
 */
export async function getConflictGridData(year) {
    const result = await exec(`
        -- 1) Shifts (columns)
        SELECT
            sh.id                                                    AS shift_id,
            sh.label                                                 AS shift_label,
            DATEDIFF(MINUTE, CAST('00:00' AS TIME), sh.start_time)   AS start_mins,
            DATEDIFF(MINUTE, CAST('00:00' AS TIME), sh.end_time)     AS end_mins,
            sc.dept_key AS department,
            cd.id                                                    AS day_id,
            cd.label                                                 AS day_label,
            cd.convention_date
        FROM dbo.shifts sh
        LEFT JOIN dbo.scheduler_categories sc ON sc.id = sh.category_id
        JOIN dbo.sessions se ON se.id = sh.session_id
        JOIN dbo.convention_days cd ON cd.id = se.convention_day_id
        WHERE cd.year = @year
          AND sh.category_id IS NOT NULL
        ORDER BY cd.convention_date, sh.start_time, sh.end_time;

        -- 2) All active volunteers for this convention year
        SELECT id, firstName, lastName
        FROM dbo.volunteer_in
        WHERE active_current_year = 1
          AND registration_status <> 'deleted'
        ORDER BY lastName, firstName;

        -- 3) Assignments (volunteer → shift)
        SELECT DISTINCT ssa.volunteer_id, sa.shift_id
        FROM dbo.shift_slot_assignments ssa
        JOIN dbo.schedule_assignments sa ON sa.id = ssa.schedule_assignment_id
        JOIN dbo.shifts sh               ON sh.id = sa.shift_id
        JOIN dbo.sessions se             ON se.id = sh.session_id
        JOIN dbo.convention_days cd       ON cd.id = se.convention_day_id
        WHERE cd.year = @year;

        -- 4) Blackouts
        SELECT vb.volunteer_id,
               vb.convention_day_id AS day_id,
               vb.start_mins,
               vb.end_mins
        FROM dbo.volunteer_blackouts vb
        JOIN dbo.convention_days cd ON cd.id = vb.convention_day_id
        WHERE cd.year = @year;
    `, (req) => {
        req.input('year', sql.Int, year);
    });

    return {
        shifts:      result.recordsets[0] || [],
        volunteers:  result.recordsets[1] || [],
        assignments: result.recordsets[2] || [],
        blackouts:   result.recordsets[3] || [],
    };
}
/**
 * Removes a volunteer from all slot assignments on a given shift.
 * Used by the conflict grid context menu and violations panel actions.
 *
 * @param {number} volunteerId
 * @param {number} shiftId
 * @returns {Promise<boolean>} True if at least one row was deleted.
 */
export async function removeVolunteerFromShift(volunteerId, shiftId) {
    const result = await exec(
        `DELETE ssa
         FROM   dbo.shift_slot_assignments ssa
         JOIN   dbo.schedule_assignments   sa ON sa.id = ssa.schedule_assignment_id
         WHERE  ssa.volunteer_id = @volunteerId
           AND  sa.shift_id      = @shiftId`,
        (req) => {
            req.input("volunteerId", sql.Int, volunteerId);
            req.input("shiftId",     sql.Int, shiftId);
        },
    );
    const affected = Array.isArray(result.rowsAffected)
        ? result.rowsAffected.reduce((s, n) => s + n, 0)
        : result.rowsAffected || 0;
    return affected > 0;
}
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
            sc.dept_key         AS shift_department,
            sc.name             AS shift_dept_name,
            sh.is_meeting,
            sh.sms_code,
            sh.has_keyman,
            sh.has_keyman_asst,
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
        LEFT JOIN dbo.scheduler_categories sc
            ON sc.id = sh.category_id
        LEFT JOIN dbo.schedule_assignments sa
            ON sa.shift_id = sh.id
        LEFT JOIN dbo.locations_tasks lt
            ON lt.id = sa.location_task_id
        WHERE cd.id = @dayId
          AND (sh.category_id IS NOT NULL OR sh.is_meeting = 1)
        ORDER BY sh.start_time, sc.sort_order, sa.id;
    `, (req) => {
        req.input('dayId', sql.Int, dayId);
    });

    const rows    = result.recordset || [];
    const payload = { day: {} };
    if (rows.length === 0) return payload;

    const firstRow = rows[0];
    const dayLabel = firstRow.day_label;

    /** @type {{ id: number, department: Record<string, object>, meetings: Array }} */
    const dayObj = { id: firstRow.day_id, department: {}, meetings: [] };
    payload.day[dayLabel] = dayObj;

    /** @type {Set<number>} track meeting shift ids already added */
    const seenMeetings = new Set();

    for (const row of rows) {
        // Meeting shifts go into a flat array, not a dept column
        if (row.is_meeting) {
            if (!seenMeetings.has(row.shift_id)) {
                seenMeetings.add(row.shift_id);
                dayObj.meetings.push({
                    id:         row.shift_id,
                    shift_name: row.shift_name || '',
                    sms_code:   row.sms_code   || null,
                    schedule: {
                        start_time: formatSchedulerTime(row.shift_start),
                        end_time:   formatSchedulerTime(row.shift_end),
                    },
                });
            }
            continue;
        }

        const dept = row.shift_department;
        if (!dept) continue;

        if (!dayObj.department[dept]) {
            dayObj.department[dept] = {
                dpt_name: row.shift_dept_name || dept,
                shift:    {},
            };
        }

        const deptObj  = dayObj.department[dept];
        const shiftKey = String(row.shift_id);

        if (!deptObj.shift[shiftKey]) {
            deptObj.shift[shiftKey] = {
                id:              row.shift_id,
                shift_name:      row.shift_name || '',
                schedule: {
                    start_time: formatSchedulerTime(row.shift_start),
                    end_time:   formatSchedulerTime(row.shift_end),
                },
                has_keyman:      !!row.has_keyman,
                has_keyman_asst: !!row.has_keyman_asst,
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
 *   gender:    string|null,
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
            suffix,
            role,
            phone,
            email,
            gender,
            crew_lots_garages,
            crew_signs,
            crew_security,
            crew_mobile_support,
            crew_dropoff_pickup,
            crew_desk,
            CASE
                WHEN notes IS NOT NULL
                 AND LTRIM(RTRIM(notes)) != ''
                 AND ISNULL(note_dismissed, 0) = 0
                THEN 1 ELSE 0
            END AS has_note,
            ISNULL((
                SELECT COUNT(*)
                FROM   dbo.ai_blackout_suggestions abs
                WHERE  abs.volunteer_id = volunteer_in.id
                  AND  abs.applied      = 0
            ), 0) AS pending_constraints
        FROM dbo.volunteer_in
        WHERE active_current_year = 1
          AND registration_status <> 'deleted'
        ORDER BY lastName, firstName;
    `);

    return (result.recordset || []).map((r) => ({
        id:        r.id,
        firstName: r.firstName || '',
        lastName:  r.lastName  || '',
        suffix:    r.suffix    || null,
        role:      r.role      || 'REGISTERED',
        phone:     r.phone     || null,
        email:     r.email     || null,
        gender:    r.gender    || null,
        has_note:            !!r.has_note,
        pending_constraints: r.pending_constraints || 0,
        crews: {
            lots_and_garages: !!r.crew_lots_garages,
            signs:            !!r.crew_signs,
            security:         !!r.crew_security,
            dropoff_pickup:   !!r.crew_dropoff_pickup,
            mobile_support:   !!r.crew_mobile_support,
            desk:             !!r.crew_desk,
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
 *   gender:              string|null,
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
            gender,
            crew_lots_garages,
            crew_signs,
            crew_security,
            crew_dropoff_pickup,
            crew_mobile_support,
            crew_desk
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
        gender:              r.gender    || null,
        crew_lots_garages:   !!r.crew_lots_garages,
        crew_signs:          !!r.crew_signs,
        crew_security:       !!r.crew_security,
        crew_dropoff_pickup: !!r.crew_dropoff_pickup,
        crew_mobile_support: !!r.crew_mobile_support,
        crew_desk:           !!r.crew_desk,
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
        desk:             'crew_desk',
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
        desk:             'crew_desk',
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
             (schedule_assignment_id, convention_day_id, volunteer_id, slot_type, slot_index, note)
         OUTPUT INSERTED.id
         VALUES (@saId, @cdId, @volId, @slotType, @slotIndex, @note);`,
        (req) => {
            req.input('saId',      sql.Int,           data.schedule_assignment_id);
            req.input('cdId',      sql.Int,           data.convention_day_id);
            req.input('volId',     sql.Int,           data.volunteer_id);
            req.input('slotType',  sql.NVarChar(20),  data.slot_type);
            req.input('slotIndex', sql.Int,           data.slot_index);
            req.input('note',      sql.NVarChar(500), data.note || null);
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
 * Fetch all slot assignments for a convention day, joined with volunteer names
 * and current attendance status.
 *
 * @param {number} dayId
 * @returns {Promise<Array<{
 *   id: number,
 *   schedule_assignment_id: number,
 *   volunteer_id: number,
 *   firstName: string,
 *   lastName:  string,
 *   slot_type:  string,
 *   slot_index: number,
 *   note:       string|null,
 *   attended:   boolean,
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
             ssa.slot_index,
             ssa.note,
             CASE WHEN att.volunteer_id IS NOT NULL THEN 1 ELSE 0 END AS attended
         FROM dbo.shift_slot_assignments ssa
         JOIN dbo.volunteer_in v ON v.id = ssa.volunteer_id
         JOIN dbo.schedule_assignments sa ON sa.id = ssa.schedule_assignment_id
         LEFT JOIN dbo.attendance att
             ON att.volunteer_id      = ssa.volunteer_id
            AND att.convention_day_id = @dayId
            AND att.shift_id          = sa.shift_id
            AND att.attended          = 1
         WHERE ssa.convention_day_id = @dayId
         ORDER BY ssa.schedule_assignment_id, ssa.slot_type, ssa.slot_index;`,
        (req) => req.input('dayId', sql.Int, dayId),
    );
    return (result.recordset || []).map((r) => ({ ...r, attended: !!r.attended }));
}

/**
 * Fetch attended volunteer+shift pairs for a convention day.
 * Lightweight — used by the scheduler attendance poller.
 *
 * @param {number} dayId
 * @returns {Promise<Array<{ volunteer_id: number, shift_id: number }>>}
 */
export async function getAttendanceByDay(dayId) {
    const result = await exec(
        `SELECT volunteer_id, shift_id
         FROM dbo.attendance
         WHERE convention_day_id = @dayId
           AND attended = 1;`,
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
// PUBLISHED FILES
// ─────────────────────────────────────────────────────────────

/**
 * Record a published artifact (e.g. a sign map PDF) in
 * dbo.published_files after upload to Blob / SharePoint.
 *
 * Called by lib/publishSignMap.js step 5. The table predates this
 * function (created from another working copy); the insert matches
 * the publishSignMap call shape and house snake_case conventions.
 *
 * @param {{
 *   fileType:      string,
 *   filename:      string,
 *   blobName:      string|null,
 *   sharePointUrl: string|null,
 *   publishedBy:   string|null,
 * }} data
 * @returns {Promise<number>} New row id.
 */
export async function insertPublishedFile(data) {
    const result = await exec(`
        INSERT INTO dbo.published_files
            (file_type, filename, blob_name, sharepoint_url, published_by)
        OUTPUT INSERTED.id
        VALUES
            (@fileType, @filename, @blobName, @sharePointUrl, @publishedBy);
    `, (req) => {
        req.input('fileType',      sql.NVarChar(50),   data.fileType);
        req.input('filename',      sql.NVarChar(255),  data.filename      || null);
        req.input('blobName',      sql.NVarChar(500),  data.blobName      || null);
        req.input('sharePointUrl', sql.NVarChar(1000), data.sharePointUrl || null);
        req.input('publishedBy',   sql.NVarChar(255),  data.publishedBy   || null);
    });
    return result.recordset?.[0]?.id;
}

// ─────────────────────────────────────────────────────────────
// SHIFT ALERT SCHEDULES
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// CAMPAIGN MEETINGS — standalone meeting events (no crew shift)
// ─────────────────────────────────────────────────────────────

/**
 * Return all standalone campaign meetings for a year, ordered by date and time.
 *
 * @param {number} year
 * @returns {Promise<Array<{id:number, year:number, label:string,
 *   meeting_date:Date, start_time:string, end_time:string,
 *   description:string|null, created_at:Date}>>}
 */
export async function getCampaignMeetings(year) {
    const result = await exec(`
        SELECT id, year, label, meeting_date, start_time, end_time,
               description, created_at
        FROM dbo.campaign_meetings
        WHERE year = @year
        ORDER BY meeting_date, start_time;
    `, (req) => {
        req.input('year', sql.Int, year);
    });
    return result.recordset || [];
}

/**
 * Create a standalone campaign meeting.
 *
 * @param {{year:number, label:string, meeting_date:string,
 *   start_time:string, end_time:string,
 *   description?:string|null}} data
 * @returns {Promise<number>} New meeting id.
 */
export async function createCampaignMeeting(data) {
    const result = await exec(`
        INSERT INTO dbo.campaign_meetings
            (year, label, meeting_date, start_time, end_time, description)
        OUTPUT INSERTED.id
        VALUES (@year, @label, @meetingDate, @startTime, @endTime, @description);
    `, (req) => {
        req.input('year',        sql.Int,           data.year);
        req.input('label',       sql.NVarChar(100), data.label.trim());
        req.input('meetingDate', sql.Date,          data.meeting_date);
        req.input('startTime',   sql.NVarChar(8),   data.start_time);
        req.input('endTime',     sql.NVarChar(8),   data.end_time);
        req.input('description', sql.NVarChar(500), data.description?.trim() || null);
    });
    const id = result.recordset?.[0]?.id;
    if (!id) throw new Error('INSERT campaign_meetings did not return id.');
    return id;
}

/**
 * Update a standalone campaign meeting.
 *
 * @param {number} id
 * @param {{label:string, meeting_date:string, start_time:string,
 *   end_time:string, description?:string|null}} data
 * @returns {Promise<boolean>}
 */
export async function updateCampaignMeeting(id, data) {
    const result = await exec(`
        UPDATE dbo.campaign_meetings
        SET label        = @label,
            meeting_date = @meetingDate,
            start_time   = @startTime,
            end_time     = @endTime,
            description  = @description
        WHERE id = @id;
    `, (req) => {
        req.input('id',          sql.Int,           id);
        req.input('label',       sql.NVarChar(100), data.label.trim());
        req.input('meetingDate', sql.Date,          data.meeting_date);
        req.input('startTime',   sql.NVarChar(8),   data.start_time);
        req.input('endTime',     sql.NVarChar(8),   data.end_time);
        req.input('description', sql.NVarChar(500), data.description?.trim() || null);
    });
    const affected = Array.isArray(result.rowsAffected)
        ? result.rowsAffected.reduce((s, n) => s + n, 0)
        : result.rowsAffected || 0;
    return affected > 0;
}

/**
 * Delete a standalone campaign meeting.
 *
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export async function deleteCampaignMeeting(id) {
    const result = await exec(`
        DELETE FROM dbo.campaign_meetings WHERE id = @id;
    `, (req) => {
        req.input('id', sql.Int, id);
    });
    const affected = Array.isArray(result.rowsAffected)
        ? result.rowsAffected.reduce((s, n) => s + n, 0)
        : result.rowsAffected || 0;
    return affected > 0;
}

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
        req.input('fireTimeUtc',     sql.NVarChar(20),  data.fire_time_utc    || null);
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
        req.input('fireTimeUtc',     sql.NVarChar(20),  data.fire_time_utc    || null);
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

/**
 * Permanently delete a shift alert schedule and its log rows.
 * Only call on inactive schedules — the route should enforce this.
 *
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export async function hardDeleteAlertSchedule(id) {
    await exec(`
        DELETE FROM dbo.shift_alert_log WHERE schedule_id = @id;
    `, (req) => req.input('id', sql.Int, id));
    const result = await exec(`
        DELETE FROM dbo.shift_alert_schedules WHERE id = @id;
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
    const result = await exec(
      `
        SELECT DISTINCT
            sh.id              AS shift_id,
            sh.sms_code,
            sh.label           AS shift_label,
            sh.start_time,
            sh.end_time,
            sc.dept_key AS department,
            cd.convention_date,
            cd.label           AS day_label,
            sc.name            AS event_type_name,
            vi.id              AS volunteer_id,
            vi.firstName,
            vi.lastName,
            vi.phone
        FROM dbo.shifts sh
        JOIN dbo.sessions               sess ON sess.id  = sh.session_id
        JOIN dbo.convention_days        cd   ON cd.id    = sess.convention_day_id
        LEFT JOIN dbo.scheduler_categories sc ON sc.id   = sh.category_id
        JOIN dbo.schedule_assignments   sa   ON sa.shift_id = sh.id
        JOIN dbo.shift_slot_assignments ssa  ON ssa.schedule_assignment_id = sa.id
        JOIN dbo.volunteer_in           vi   ON vi.id    = ssa.volunteer_id
        WHERE vi.sms_shift_alerts_opt_in = 1
          AND vi.sms_opted_in            = 1
          AND vi.smsCapable              = 1
          AND vi.phone                   IS NOT NULL
          AND sh.sms_code                IS NOT NULL
          AND sh.is_meeting              = 0
          AND cd.year                    = @year
          AND (
              (@category = 'next_day'     AND cd.convention_date = DATEADD(DAY, 1, @fireDate))
           OR (@category = 'same_day'     AND cd.convention_date = @fireDate)
           OR (@category = 'all_upcoming' AND cd.convention_date >= @fireDate)
          )
          AND (
              @departments IS NULL
           OR (sh.category_id IS NULL AND @includeNullDept = 1)
           OR EXISTS (
                  SELECT 1 FROM OPENJSON(@departments) j WHERE j.[value] = sc.dept_key
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
    `,
      (req) => {
        req.input("year", sql.Int, year);
        req.input("scheduleId", sql.Int, scheduleId);
        req.input("category", sql.NVarChar(20), alertCategory);
        req.input("fireDate", sql.Date, fireDate);
        req.input("departments", sql.NVarChar(500), departments || null);
        req.input("includeNullDept", sql.Bit, includeNullDept ? 1 : 0);
      },
    );
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
    const result = await exec(
      `
        SELECT DISTINCT
            sh.id              AS shift_id,
            sh.sms_code,
            sh.label           AS shift_label,
            sh.start_time,
            sh.end_time,
            sc.dept_key AS department,
            cd.convention_date,
            cd.label           AS day_label,
            sc.name            AS event_type_name,
            vi.id              AS volunteer_id,
            vi.firstName,
            vi.lastName,
            vi.phone,
            rp.description     AS rv_description,
            rp.address         AS rv_address,
            rp.floor_number    AS rv_floor,
            rp.photo_blob_name AS rv_photo,
            lt.name            AS rv_location_name,
            sa.id              AS rv_sa_id
        FROM dbo.shifts sh
        JOIN dbo.sessions               sess ON sess.id  = sh.session_id
        JOIN dbo.convention_days        cd   ON cd.id    = sess.convention_day_id
        LEFT JOIN dbo.scheduler_categories   sc  ON sc.id    = sh.category_id
        JOIN dbo.schedule_assignments        sa  ON sa.shift_id = sh.id
        JOIN dbo.shift_slot_assignments      ssa ON ssa.schedule_assignment_id = sa.id
        JOIN dbo.volunteer_in                vi  ON vi.id    = ssa.volunteer_id
        LEFT JOIN dbo.shift_rendezvous_points rp ON rp.schedule_assignment_id = sa.id
        LEFT JOIN dbo.locations_tasks         lt ON lt.id = sa.location_task_id
        WHERE vi.sms_shift_alerts_opt_in = 1
          AND vi.sms_opted_in            = 1
          AND vi.smsCapable              = 1
          AND vi.phone                   IS NOT NULL
          AND sh.sms_code                IS NOT NULL
          AND sh.is_meeting              = 0
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
    `,
      (req) => {
        req.input("year", sql.Int, year);
        req.input("today", sql.Date, today);
      },
    );
    return result.recordset || [];
}

/**
 * Return volunteer+shift pairs eligible for T-15 meeting alerts.
 *
 * For each meeting shift (is_meeting = 1) starting within the query window,
 * returns all volunteers who:
 *   - have any crew assignment on that convention day, AND
 *   - do NOT have a crew shift whose window overlaps the meeting window
 *     (those volunteers are "scheduled elsewhere" and get crew alerts instead).
 *
 * The returned row shape matches getT15CandidateShifts so sendRows handles
 * both identically. event_type_name is hard-coded to 'Meeting'.
 *
 * @param {number} year  Current convention year.
 * @param {string} today ISO date string for today in Eastern time e.g. "2026-08-08"
 * @returns {Promise<Array>}
 */
export async function getMeetingT15Candidates(year, today) {
    const result = await exec(`
        SELECT DISTINCT
            sh.id               AS shift_id,
            sh.sms_code,
            sh.label            AS shift_label,
            sh.start_time,
            sh.end_time,
            NULL                AS department,
            cd.convention_date,
            cd.label            AS day_label,
            'Meeting'           AS event_type_name,
            vi.id               AS volunteer_id,
            vi.firstName,
            vi.lastName,
            vi.phone,
            NULL                AS rv_description,
            NULL                AS rv_address,
            NULL                AS rv_floor,
            NULL                AS rv_photo,
            NULL                AS rv_location_name,
            NULL                AS rv_sa_id
        FROM dbo.shifts sh
        JOIN dbo.sessions               sess  ON sess.id  = sh.session_id
        JOIN dbo.convention_days        cd    ON cd.id    = sess.convention_day_id
        -- Enumerate all crew volunteers on the same day
        JOIN dbo.sessions               sess2 ON sess2.convention_day_id = cd.id
        JOIN dbo.shifts                 sh2   ON sh2.session_id = sess2.id
                                             AND sh2.is_meeting = 0
        JOIN dbo.schedule_assignments   sa    ON sa.shift_id = sh2.id
        JOIN dbo.shift_slot_assignments ssa   ON ssa.schedule_assignment_id = sa.id
        JOIN dbo.volunteer_in           vi    ON vi.id = ssa.volunteer_id
        WHERE sh.is_meeting              = 1
          AND sh.sms_code                IS NOT NULL
          AND cd.year                    = @year
          AND cd.convention_date BETWEEN @today AND DATEADD(DAY, 1, @today)
          AND vi.sms_shift_alerts_opt_in = 1
          AND vi.sms_opted_in            = 1
          AND vi.smsCapable              = 1
          AND vi.phone                   IS NOT NULL
          -- Exclude volunteers whose crew shift overlaps the meeting window
          AND NOT EXISTS (
              SELECT 1
              FROM dbo.schedule_assignments   sa3
              JOIN dbo.shift_slot_assignments ssa3 ON ssa3.schedule_assignment_id = sa3.id
              JOIN dbo.shifts                 sh3  ON sh3.id  = sa3.shift_id
              JOIN dbo.sessions               se3  ON se3.id  = sh3.session_id
              WHERE ssa3.volunteer_id            = vi.id
                AND se3.convention_day_id        = cd.id
                AND sh3.is_meeting               = 0
                AND CONVERT(TIME, sh3.start_time) < CONVERT(TIME, sh.end_time)
                AND CONVERT(TIME, sh3.end_time)   > CONVERT(TIME, sh.start_time)
          )
          -- Dedup guard — skip if already sent T-15 for this meeting+volunteer
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

// ============================================================
// DASHBOARD — volunteer shifts for home page
// ============================================================

/**
 * Find today's convention day, or the next upcoming one, for the given year.
 *
 * @param {number} year
 * @returns {Promise<{id:number, label:string, convention_date:string}|null>}
 */
export async function getVolunteerDashboardDay(year) {
    const result = await exec(
        `SELECT TOP 1
             cd.id,
             cd.label,
             CONVERT(VARCHAR(10), cd.convention_date, 120) AS convention_date
         FROM dbo.convention_days cd
         WHERE YEAR(cd.convention_date) = @year
           AND cd.convention_date >= CAST(GETUTCDATE() AS DATE)
         ORDER BY cd.convention_date ASC;`,
        (req) => req.input('year', sql.Int, year),
    );
    return result.recordset?.[0] || null;
}

/**
 * Get a volunteer's slot assignments for one convention day,
 * augmented with the KM and KA for each assignment location.
 *
 * @param {number} volunteerId
 * @param {number} dayId
 * @returns {Promise<Array<{
 *   schedule_assignment_id: number,
 *   slot_type: string,
 *   shift_label: string,
 *   dept_name: string,
 *   start_time: string|null,
 *   end_time: string|null,
 *   location_name: string,
 *   keyman: {firstName:string, lastName:string, phone:string|null}|null,
 *   keyman_asst: {firstName:string, lastName:string, phone:string|null}|null
 * }>>}
 */
export async function getVolunteerShiftsForDay(volunteerId, dayId) {
    /** @param {Date|string|null} t @returns {string|null} */
    function fmtT(t) {
        if (!t) return null;
        const d = t instanceof Date ? t : new Date(t);
        const h = d.getUTCHours(), m = d.getUTCMinutes(), ap = h >= 12 ? 'PM' : 'AM';
        return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`;
    }

    const shiftRes = await exec(
        `SELECT
             ssa.schedule_assignment_id,
             ssa.slot_type,
             sh.label      AS shift_label,
             sc.dept_key,
             sc.name       AS dept_name,
             sh.start_time AS shift_start,
             sh.end_time   AS shift_end,
             lt.name       AS location_name
         FROM dbo.shift_slot_assignments ssa
         JOIN dbo.schedule_assignments sa ON sa.id = ssa.schedule_assignment_id
         JOIN dbo.shifts sh               ON sh.id = sa.shift_id
         LEFT JOIN dbo.scheduler_categories sc ON sc.id = sh.category_id
         JOIN dbo.sessions sess           ON sess.id = sh.session_id
         JOIN dbo.locations_tasks lt      ON lt.id = sa.location_task_id
         WHERE ssa.volunteer_id      = @volId
           AND ssa.convention_day_id = @dayId
         ORDER BY sh.start_time;`,
        (req) => {
            req.input('volId',  sql.Int, volunteerId);
            req.input('dayId',  sql.Int, dayId);
        },
    );

    if (!shiftRes.recordset?.length) return [];

    // Fetch KM/KA for every location this volunteer appears in
    const kmkaRes = await exec(
        `SELECT
             ssa.schedule_assignment_id,
             ssa.slot_type,
             v.firstName,
             v.lastName,
             v.phone
         FROM dbo.shift_slot_assignments ssa
         JOIN dbo.volunteer_in v ON v.id = ssa.volunteer_id
         WHERE ssa.convention_day_id = @dayId
           AND ssa.slot_type IN ('keyman', 'keyman_asst')
           AND EXISTS (
               SELECT 1 FROM dbo.shift_slot_assignments s2
               WHERE s2.schedule_assignment_id = ssa.schedule_assignment_id
                 AND s2.convention_day_id = @dayId
                 AND s2.volunteer_id = @volId
           );`,
        (req) => {
            req.input('dayId',  sql.Int, dayId);
            req.input('volId',  sql.Int, volunteerId);
        },
    );

    /** @type {Record<number, {keyman?:object, keyman_asst?:object}>} */
    const leaderMap = {};
    for (const r of kmkaRes.recordset || []) {
        if (!leaderMap[r.schedule_assignment_id]) leaderMap[r.schedule_assignment_id] = {};
        leaderMap[r.schedule_assignment_id][r.slot_type] = {
            firstName: r.firstName,
            lastName:  r.lastName,
            phone:     r.phone || null,
        };
    }

    return shiftRes.recordset.map((r) => ({
        schedule_assignment_id: r.schedule_assignment_id,
        slot_type:     r.slot_type,
        shift_label:   r.shift_label,
        dept_key:      r.dept_key,
        dept_name:     r.dept_name || r.dept_key,
        start_time:    fmtT(r.shift_start),
        end_time:      fmtT(r.shift_end),
        location_name: r.location_name,
        keyman:        leaderMap[r.schedule_assignment_id]?.keyman      || null,
        keyman_asst:   leaderMap[r.schedule_assignment_id]?.keyman_asst || null,
    }));
}

// ============================================================
// OVERSIGHT STRUCTURE
// ============================================================

/**
 * Fetch all oversight structure nodes as a flat list, sorted for tree rendering.
 *
 * @returns {Promise<Array<{id, parent_id, role_title, sort_order, volunteer_id, firstName, lastName, phone}>>}
 */
export async function getOversightStructure() {
    const result = await exec(
        `SELECT
             ch.id,
             ch.parent_id,
             ch.role_title,
             ch.sort_order,
             ch.volunteer_id,
             v.firstName,
             v.lastName,
             v.phone,
             v.email
         FROM dbo.oversight_structure ch
         LEFT JOIN dbo.volunteer_in v ON v.id = ch.volunteer_id
         ORDER BY ch.parent_id, ch.sort_order;`,
    );
    return result.recordset || [];
}

/**
 * Add a node to the oversight structure.
 *
 * @param {{volunteer_id:number|null, parent_id:number|null, role_title:string, sort_order:number}} opts
 * @returns {Promise<number>} New node id.
 */
export async function addOversightStructureNode({ volunteer_id, parent_id, role_title, sort_order }) {
    const result = await exec(
        `INSERT INTO dbo.oversight_structure (volunteer_id, parent_id, role_title, sort_order)
         OUTPUT INSERTED.id
         VALUES (@volId, @parentId, @title, @sortOrder);`,
        (req) => {
            req.input('volId',     sql.Int,           volunteer_id ?? null);
            req.input('parentId',  sql.Int,           parent_id    ?? null);
            req.input('title',     sql.NVarChar(100), role_title   || '');
            req.input('sortOrder', sql.Int,           sort_order   ?? 0);
        },
    );
    return result.recordset?.[0]?.id;
}

/**
 * Bulk-save the full oversight structure (sort_order + parent_id for every node).
 * Called after any drag/reorder/indent operation.
 *
 * @param {Array<{id:number, parent_id:number|null, sort_order:number, role_title:string, volunteer_id:number|null}>} nodes
 * @returns {Promise<void>}
 */
export async function saveOversightStructureOrder(nodes) {
    for (const n of nodes) {
        await exec(
            `UPDATE dbo.oversight_structure
             SET parent_id = @parentId, sort_order = @sortOrder,
                 volunteer_id = @volId, role_title = @title
             WHERE id = @id;`,
            (req) => {
                req.input('id',        sql.Int,           n.id);
                req.input('parentId',  sql.Int,           n.parent_id    ?? null);
                req.input('sortOrder', sql.Int,           n.sort_order   ?? 0);
                req.input('volId',     sql.Int,           n.volunteer_id ?? null);
                req.input('title',     sql.NVarChar(100), n.role_title   || '');
            },
        );
    }
}



/**
 * Check whether a T-15 alert was successfully sent to a volunteer for a
 * specific shift. Used to gate SMS check-in so attendance can only be
 * recorded via a T-15 reply, not an advance alert reply.
 *
 * @param {number} volunteerId
 * @param {number} shiftId
 * @returns {Promise<boolean>}
 */
export async function hasT15AlertBeenSent(volunteerId, shiftId) {
    const result = await exec(`
        SELECT 1
        FROM dbo.shift_alert_log
        WHERE volunteer_id   = @volunteerId
          AND shift_id       = @shiftId
          AND alert_category = 't15min'
          AND status         = 'sent';
    `, (req) => {
        req.input('volunteerId', sql.Int, volunteerId);
        req.input('shiftId',     sql.Int, shiftId);
    });
    return (result.recordset?.length ?? 0) > 0;
}

/**
 * Return a preview of shifts that would be targeted by a schedule's next send.
 * Returns distinct shifts with eligible recipient counts — not per-volunteer rows.
 * Used by the shift alerts UI to show the "next alert" summary on each card.
 *
 * For t15min schedules, fireDate should be today in Eastern time.
 *
 * @param {{
 *   scheduleId:      number,
 *   alertCategory:   string,
 *   fireDate:        string,
 *   departments:     string|null,
 *   includeNullDept: boolean,
 *   year:            number,
 * }} params
 * @returns {Promise<Array<{
 *   shift_id:        number,
 *   shift_label:     string,
 *   start_time:      string,
 *   convention_date: string,
 *   day_label:       string,
 *   department:      string|null,
 *   event_type_name: string,
 *   recipient_count: number,
 * }>>}
 */

/**
 * Look up the convention_day_id from shift_slot_assignments for a given
 * volunteer + shift pair. This is the "scheduler day" — the day the volunteer
 * was actually placed on — which may differ from the day derived via the
 * sessions chain if old test days exist in the DB.
 *
 * Used to ensure attendance rows are written with the correct convention_day_id
 * so the scheduler badge poller can find them.
 *
 * @param {number} volunteerId
 * @param {number} shiftId
 * @returns {Promise<number|null>}
 */
export async function getSchedulerDayForVolunteerShift(volunteerId, shiftId) {
    const result = await exec(`
        SELECT TOP 1 ssa.convention_day_id
        FROM dbo.shift_slot_assignments ssa
        JOIN dbo.schedule_assignments sa ON sa.id = ssa.schedule_assignment_id
        WHERE ssa.volunteer_id = @volunteerId
          AND sa.shift_id      = @shiftId;
    `, (req) => {
        req.input('volunteerId', sql.Int, volunteerId);
        req.input('shiftId',     sql.Int, shiftId);
    });
    return result.recordset?.[0]?.convention_day_id ?? null;
}

/**
 * Look up a shift by its SMS reply code for the incoming webhook.
 * Filters to the current year and shifts whose convention_date is today
 * or later (with a -1 day buffer for timezone tolerance).
 *
 * @param {string} smsCode  - e.g. "FRLG1" (matched case-insensitively)
 * @param {number} year     - Convention year (e.g. 2026)
 * @returns {Promise<{ shift_id: number }|null>}
 */
export async function findShiftBySmsCode(smsCode, year) {
    const result = await exec(`
        SELECT TOP 1
            sh.id AS shift_id
        FROM dbo.shifts sh
        JOIN dbo.sessions        sess ON sess.id = sh.session_id
        JOIN dbo.convention_days cd   ON cd.id   = sess.convention_day_id
        WHERE UPPER(sh.sms_code) = UPPER(@smsCode)
          AND cd.year             = @year
          AND cd.convention_date >= CONVERT(DATE, DATEADD(DAY, -1, GETUTCDATE()))
        ORDER BY cd.convention_date ASC;
    `, (req) => {
        req.input('smsCode', sql.NVarChar(8), smsCode);
        req.input('year',    sql.Int,          year);
    });
    return result.recordset?.[0] || null;
}

export async function getSchedulePreview(params) {
    const { scheduleId, alertCategory, fireDate, departments, includeNullDept, year } = params;
    const result = await exec(`
        SELECT
            sh.id                AS shift_id,
            sh.label             AS shift_label,
            sh.start_time,
            sc.dept_key AS department,
            CONVERT(VARCHAR(10), cd.convention_date, 120) AS convention_date,
            cd.label             AS day_label,
            sc.name              AS event_type_name,
            COUNT(DISTINCT vi.id) AS recipient_count
        FROM dbo.shifts sh
        JOIN dbo.sessions               sess ON sess.id  = sh.session_id
        JOIN dbo.convention_days        cd   ON cd.id    = sess.convention_day_id
        LEFT JOIN dbo.scheduler_categories sc ON sc.id   = sh.category_id
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
           OR (@category = 't15min'       AND cd.convention_date BETWEEN @fireDate AND DATEADD(DAY, 1, @fireDate))
          )
          AND (
              @departments IS NULL
           OR (sh.category_id IS NULL AND @includeNullDept = 1)
           OR EXISTS (
                  SELECT 1 FROM OPENJSON(@departments) j WHERE j.[value] = sc.dept_key
              )
          )
          AND NOT EXISTS (
              SELECT 1 FROM dbo.shift_alert_log sal
              WHERE sal.schedule_id  = CASE WHEN @category = 't15min' THEN NULL ELSE @scheduleId END
                AND sal.shift_id     = sh.id
                AND sal.volunteer_id = vi.id
                AND sal.alert_category = @category
                AND sal.status       = 'sent'
          )
        GROUP BY
            sh.id, sh.label, sh.start_time, sc.dept_key,
            cd.convention_date, cd.label, sc.name
        ORDER BY cd.convention_date, sh.start_time;
    `, (req) => {
        req.input('year',            sql.Int,           year);
        req.input('scheduleId',      sql.Int,           scheduleId);
        req.input('category',        sql.NVarChar(20),  alertCategory);
        req.input('fireDate',        sql.Date,          fireDate);
        req.input('departments',     sql.NVarChar(500), departments || null);
        req.input('includeNullDept', sql.Bit,           includeNullDept ? 1 : 0);
    });
    return result.recordset || [];
}

/**
 * Delete an oversight structure node. Children are promoted to the deleted
 * node's parent (so the subtree collapses up one level rather than orphaning).
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function deleteOversightStructureNode(id) {
    const nodeRes = await exec(
        `SELECT parent_id FROM dbo.oversight_structure WHERE id = @id;`,
        (req) => req.input('id', sql.Int, id),
    );
    const parentId = nodeRes.recordset?.[0]?.parent_id ?? null;

    await exec(
        `UPDATE dbo.oversight_structure SET parent_id = @parentId WHERE parent_id = @id;`,
        (req) => { req.input('parentId', sql.Int, parentId); req.input('id', sql.Int, id); },
    );
    await exec(
        `DELETE FROM dbo.oversight_structure WHERE id = @id;`,
        (req) => req.input('id', sql.Int, id),
    );
}

// ============================================================
// BUG REPORTS
// ============================================================

/**
 * Insert a new bug report submitted by a logged-in volunteer.
 *
 * @param {{
 *   volunteerId: number,
 *   description: string,
 *   steps?:      string|null,
 *   pageUrl?:    string|null,
 *   userAgent?:  string|null,
 * }} data
 * @returns {Promise<number>} The new report id.
 */
export async function createBugReport({ volunteerId, description, steps = null, pageUrl = null, userAgent = null }) {
    const result = await exec(`
        INSERT INTO dbo.bug_reports
            (volunteer_id, description, steps, page_url, user_agent)
        OUTPUT INSERTED.id
        VALUES
            (@volunteerId, @description, @steps, @pageUrl, @userAgent);
    `, (req) => {
        req.input('volunteerId',  sql.Int,               volunteerId);
        req.input('description',  sql.NVarChar(sql.MAX), description);
        req.input('steps',        sql.NVarChar(sql.MAX), steps        || null);
        req.input('pageUrl',      sql.NVarChar(500),     pageUrl      || null);
        req.input('userAgent',    sql.NVarChar(500),     userAgent    || null);
    });

    const id = result.recordset?.[0]?.id;
    if (!id) throw new Error('INSERT bug_reports did not return id.');
    return id;
}

/**
 * Fetch all bug reports ordered by created_at DESC.
 * Joins volunteer name for display.
 *
 * @param {{ status?: string|null }} [filters={}]
 * @returns {Promise<Array<{
 *   id:           number,
 *   volunteer_id: number|null,
 *   firstName:    string|null,
 *   lastName:     string|null,
 *   description:  string,
 *   steps:        string|null,
 *   page_url:     string|null,
 *   user_agent:   string|null,
 *   status:       string,
 *   solution:     string|null,
 *   files_touched: string|null,
 *   resolved_by:  string|null,
 *   fixed_at:     Date|null,
 *   created_at:   Date,
 * }>>}
 */
export async function getBugReports({ status = null } = {}) {
    const where = status ? 'WHERE br.status = @status' : '';

    const result = await exec(`
        SELECT
            br.id,
            br.volunteer_id,
            v.firstName,
            v.lastName,
            br.description,
            br.steps,
            br.page_url,
            br.user_agent,
            br.status,
            br.solution,
            br.files_touched,
            br.resolved_by,
            br.fixed_at,
            br.created_at
        FROM dbo.bug_reports br
        LEFT JOIN dbo.volunteer_in v ON v.id = br.volunteer_id
        ${where}
        ORDER BY br.created_at DESC;
    `, (req) => {
        if (status) req.input('status', sql.NVarChar(20), status);
    });

    return result.recordset || [];
}

/**
 * Update the resolution fields on a bug report.
 * Called from the admin bug reports page.
 *
 * @param {number} id
 * @param {{
 *   status:        string,
 *   solution?:     string|null,
 *   filesTouched?: string|null,
 *   fixedAt?:      string|null,
 * }} data
 * @param {string} resolvedBy
 * @returns {Promise<boolean>} True if a row was updated.
 */
export async function updateBugReport(id, { status, solution = null, filesTouched = null, fixedAt = null }, resolvedBy) {
    const result = await exec(`
        UPDATE dbo.bug_reports
        SET status        = @status,
            solution      = @solution,
            files_touched = @filesTouched,
            fixed_at      = @fixedAt,
            resolved_by   = @resolvedBy
        WHERE id = @id;
    `, (req) => {
        req.input('id',           sql.Int,               id);
        req.input('status',       sql.NVarChar(20),      status);
        req.input('solution',     sql.NVarChar(sql.MAX), solution      || null);
        req.input('filesTouched', sql.NVarChar(sql.MAX), filesTouched  || null);
        req.input('fixedAt',      sql.DateTime2,         fixedAt ? new Date(fixedAt) : null);
        req.input('resolvedBy',   sql.NVarChar(100),     resolvedBy    || null);
    });

    return (result.rowsAffected?.[0] ?? 0) > 0;
}

// ============================================================
// SIGNS — Templates and placements
// ============================================================

/**
 * Fetch all sign templates ordered by sign_text.
 * Excludes archived templates by default.
 * Includes a placement_count subquery so the list page can show usage at a glance.
 *
 * @param {{ includeArchived?: boolean }} [options={}]
 * @returns {Promise<Array<{
 *   sign_id:         number,
 *   sign_text:       string,
 *   arrow_direction: string|null,
 *   description:     string|null,
 *   placement_count: number,
 *   created_by:      string,
 *   created_at:      Date,
 *   updated_at:      Date,
 *   is_archived:     boolean,
 * }>>}
 */
/**
 * Compute a short (≤3 char) abbreviation from sign text using a deterministic
 * heuristic. Returned as a fallback when `signs.abbreviation` is NULL —
 * admins can override it in the Sign Builder.
 *
 * KEEP IN SYNC with the matching function in public/js/signsBuilder.js — the
 * client previews the same suggestion in the builder UI, so divergence would
 * cause the placeholder to disagree with what the server eventually returns.
 *
 * Rules:
 *   - Strip punctuation, normalise hyphens/underscores/slashes to spaces
 *   - Drop stop words ("the", "a", "an", "of", "&")
 *   - Single word ≤ 3 chars → use as-is
 *   - Single word with trailing digits → first letter + digits ("Lot7" → "L7")
 *   - Single word > 3 chars → first 3 letters
 *   - Multi-word → first letter of each (digits kept whole), capped at 3 chars
 *
 * @param {string} text  Sign template text.
 * @returns {string} Uppercase abbreviation, or '?' for empty/invalid input.
 */
export function computeSignAbbreviation(text) {
    if (!text || typeof text !== 'string') return '?';

    const cleaned = text
        .trim()
        .replace(/[^\w\s&-]/g, ' ')
        .replace(/[-_/]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!cleaned) return '?';

    const STOP_WORDS = new Set(['the', 'of', '&']);
    const words = cleaned
        .split(' ')
        .filter((w) => w && !STOP_WORDS.has(w.toLowerCase()));
    if (words.length === 0) return '?';

    if (words.length === 1) {
        const w = words[0];
        if (w.length <= 3) return w.toUpperCase();
        const m = w.match(/^([A-Za-z]+)(\d+)$/);
        if (m) return (m[1][0] + m[2]).toUpperCase().substring(0, 3);
        return w.substring(0, 3).toUpperCase();
    }

    const parts = words.map((w) => (/^\d+$/.test(w) ? w : w[0]));
    return parts.join('').toUpperCase().substring(0, 3);
}

export async function getSigns({ includeArchived = false } = {}) {
    const where = includeArchived ? '' : 'WHERE s.is_archived = 0';
    const result = await exec(`
        SELECT
            s.sign_id,
            s.sign_text,
            s.arrow_direction,
            s.abbreviation,
            s.sign_category,
            s.description,
            s.created_by,
            s.created_at,
            s.updated_at,
            s.is_archived,
            (SELECT COUNT(*) FROM dbo.sign_attachments a WHERE a.sign_id = s.sign_id) AS placement_count
        FROM dbo.signs s
        ${where}
        ORDER BY s.sign_text;
    `);
    const rows = result.recordset || [];
    // Inject computed abbreviation when the override column is NULL so the
    // client never has to deal with missing values. Empty string overrides
    // are also treated as "no override".
    return rows.map((r) => ({
        ...r,
        abbreviation: r.abbreviation || computeSignAbbreviation(r.sign_text),
    }));
}

/**
 * Fetch one sign template by id, with its placements attached as an array.
 *
 * @param {number} signId
 * @returns {Promise<object|null>} The sign row with .placements appended, or null if not found.
 */
export async function getSignById(signId) {
    const signRes = await exec(
        `SELECT * FROM dbo.signs WHERE sign_id = @signId;`,
        (req) => req.input('signId', sql.Int, signId),
    );
    const sign = signRes.recordset?.[0];
    if (!sign) return null;

    // Expose both the raw override (for the builder edit form, which
    // needs to know whether the value came from the user vs the
    // heuristic so it can re-suggest on sign-text changes) AND the
    // resolved value (for any consumer that just wants the final string).
    sign.abbreviation_override = sign.abbreviation || null;
    sign.abbreviation = sign.abbreviation || computeSignAbbreviation(sign.sign_text);

    const attRes = await exec(
        `SELECT a.*, s2.sign_text, s2.sign_category
         FROM dbo.sign_attachments a
         INNER JOIN dbo.sign_locations l ON l.location_id = a.location_id
         INNER JOIN dbo.signs s2 ON a.sign_id = s2.sign_id
         WHERE a.sign_id = @signId
         ORDER BY a.created_at;`,
        (req) => req.input('signId', sql.Int, signId),
    );
    sign.attachments = attRes.recordset || [];
    return sign;
}

/**
 * Insert a new sign template.
 *
 * @param {{
 *   signText:        string,
 *   arrowDirection?: string|null,
 *   description?:    string|null,
 * }} data
 * @param {string} createdBy - Email or identifier of the user creating the sign.
 * @returns {Promise<number>} The new sign_id.
 */
export async function createSign(
    { signText, arrowDirection = null, abbreviation = null, signCategory = null, description = null },
    createdBy,
) {
    const result = await exec(`
        INSERT INTO dbo.signs (sign_text, arrow_direction, abbreviation, sign_category, description, created_by)
        OUTPUT INSERTED.sign_id
        VALUES (@signText, @arrowDirection, @abbreviation, @signCategory, @description, @createdBy);
    `, (req) => {
        req.input('signText',       sql.NVarChar(100), signText);
        req.input('arrowDirection', sql.NVarChar(20),  arrowDirection || null);
        req.input('abbreviation',   sql.NVarChar(6),   abbreviation   || null);
        req.input('signCategory',   sql.NVarChar(20),  signCategory   || null);
        req.input('description',    sql.NVarChar(500), description    || null);
        req.input('createdBy',      sql.NVarChar(100), createdBy);
    });

    const id = result.recordset?.[0]?.sign_id;
    if (!id) throw new Error('INSERT signs did not return sign_id.');
    return id;
}

/**
 * Update an existing sign template's editable fields.
 *
 * @param {number} signId
 * @param {{
 *   signText:        string,
 *   arrowDirection?: string|null,
 *   description?:    string|null,
 * }} data
 * @returns {Promise<boolean>} True if a row was updated.
 */
export async function updateSign(
    signId,
    { signText, arrowDirection = null, abbreviation = null, signCategory = null, description = null },
) {
    const result = await exec(`
        UPDATE dbo.signs
        SET sign_text       = @signText,
            arrow_direction = @arrowDirection,
            abbreviation    = @abbreviation,
            sign_category   = @signCategory,
            description     = @description,
            updated_at      = SYSUTCDATETIME()
        WHERE sign_id = @signId;
    `, (req) => {
        req.input('signId',         sql.Int,           signId);
        req.input('signText',       sql.NVarChar(100), signText);
        req.input('arrowDirection', sql.NVarChar(20),  arrowDirection || null);
        req.input('abbreviation',   sql.NVarChar(6),   abbreviation   || null);
        req.input('signCategory',   sql.NVarChar(20),  signCategory   || null);
        req.input('description',    sql.NVarChar(500), description    || null);
    });
    return (result.rowsAffected?.[0] ?? 0) > 0;
}

/**
 * Archive (soft-delete) a sign template.
 * Existing attachments pointing at this sign remain intact; the FK keeps
 * historical attachments valid even after the template is hidden from the picker.
 *
 * @param {number} signId
 * @returns {Promise<boolean>}
 */
export async function archiveSign(signId) {
    const result = await exec(`
        UPDATE dbo.signs
        SET is_archived = 1,
            updated_at  = SYSUTCDATETIME()
        WHERE sign_id = @signId;
    `, (req) => req.input('signId', sql.Int, signId));
    return (result.rowsAffected?.[0] ?? 0) > 0;
}

// ═══════════════════════════════════════════════════════════════
//  SIGN LOCATIONS (physical mounting points)
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch all sign locations with their nested attachments.
 *
 * Each location includes an `attachments` array of sign templates
 * mounted on it, sorted by `sort_order`. Each attachment carries
 * the resolved abbreviation (override or heuristic).
 *
 * @returns {Promise<Array<object>>}
 */
export async function getSignLocations() {
    const result = await exec(`
        SELECT
            l.location_id,
            /*
             * User-facing placement ID ("P12" in the UI). Computed as a
             * dense rank over creation order so numbering is always
             * sequential with no gaps — deleting a location shifts all
             * later numbers up by one. Intentionally NOT a stored
             * column: printed materials reference the numbering as of
             * their print date.
             */
            DENSE_RANK() OVER (ORDER BY l.location_id) AS placement_number,
            l.latitude,
            l.longitude,
            l.mount_type,
            l.front_bearing,
            l.marker_color,
            l.location_notes,
            l.photo_url,
            l.photo_taken_by,
            l.photo_taken_at,
            l.sv_pano_id,
            l.sv_heading,
            l.sv_pitch,
            l.sv_fov,
            l.created_by,
            l.created_at,
            a.attachment_id,
            a.sign_id,
            s.sign_text,
            s.abbreviation,
            s.sign_category,
            s.arrow_direction AS template_arrow_direction,
            a.face,
            a.sort_order,
            a.arrow_direction,
            a.status,
            a.installed_by,
            a.installed_at,
            a.removed_at,
            a.created_by  AS attachment_created_by,
            a.created_at  AS attachment_created_at
        FROM dbo.sign_locations l
        LEFT JOIN dbo.sign_attachments a ON l.location_id = a.location_id
        LEFT JOIN dbo.signs s ON a.sign_id = s.sign_id
        ORDER BY l.location_id, a.sort_order;
    `);

    const rows = result.recordset || [];
    /** @type {Map<number, object>} */
    const map = new Map();

    rows.forEach((r) => {
        if (!map.has(r.location_id)) {
            map.set(r.location_id, {
                location_id:      r.location_id,
                placement_number: r.placement_number,
                latitude:         r.latitude,
                longitude:      r.longitude,
                mount_type:     r.mount_type,
                front_bearing:  r.front_bearing,
                marker_color:   r.marker_color,
                location_notes: r.location_notes,
                photo_url:      r.photo_url,
                photo_taken_by: r.photo_taken_by,
                photo_taken_at: r.photo_taken_at,
                sv_pano_id:     r.sv_pano_id  || null,
                sv_heading:     r.sv_heading  != null ? Number(r.sv_heading) : null,
                sv_pitch:       r.sv_pitch    != null ? Number(r.sv_pitch)   : null,
                sv_fov:         r.sv_fov      != null ? Number(r.sv_fov)     : null,
                created_by:     r.created_by,
                created_at:     r.created_at,
                attachments:    [],
            });
        }
        if (r.attachment_id) {
            map.get(r.location_id).attachments.push({
                attachment_id:  r.attachment_id,
                sign_id:        r.sign_id,
                sign_text:      r.sign_text,
                abbreviation:   r.abbreviation || computeSignAbbreviation(r.sign_text),
                sign_category:  r.sign_category || null,
                template_arrow_direction: r.template_arrow_direction,
                face:           r.face,
                sort_order:     r.sort_order,
                arrow_direction: r.arrow_direction,
                status:         r.status,
                installed_by:   r.installed_by,
                installed_at:   r.installed_at,
                removed_at:     r.removed_at,
                created_by:     r.attachment_created_by,
                created_at:     r.attachment_created_at,
            });
        }
    });

    return Array.from(map.values());
}

/**
 * Fetch one sign location by id, with nested attachments.
 *
 * @param {number} locationId
 * @returns {Promise<object|null>}
 */
export async function getSignLocationById(locationId) {
    const result = await exec(`
        SELECT
            l.location_id,
            l.latitude,
            l.longitude,
            l.mount_type,
            l.front_bearing,
            l.marker_color,
            l.location_notes,
            l.photo_url,
            l.photo_taken_by,
            l.photo_taken_at,
            l.sv_pano_id,
            l.sv_heading,
            l.sv_pitch,
            l.sv_fov,
            l.created_by,
            l.created_at,
            a.attachment_id,
            a.sign_id,
            s.sign_text,
            s.abbreviation,
            s.sign_category,
            s.arrow_direction AS template_arrow_direction,
            a.face,
            a.sort_order,
            a.arrow_direction,
            a.status,
            a.installed_by,
            a.installed_at,
            a.removed_at,
            a.created_by  AS attachment_created_by,
            a.created_at  AS attachment_created_at
        FROM dbo.sign_locations l
        LEFT JOIN dbo.sign_attachments a ON l.location_id = a.location_id
        LEFT JOIN dbo.signs s ON a.sign_id = s.sign_id
        WHERE l.location_id = @locationId
        ORDER BY a.sort_order;
    `, (req) => req.input('locationId', sql.Int, locationId));

    const rows = result.recordset || [];
    if (rows.length === 0) return null;

    const r0 = rows[0];
    const location = {
        location_id:    r0.location_id,
        latitude:       r0.latitude,
        longitude:      r0.longitude,
        mount_type:     r0.mount_type,
        front_bearing:  r0.front_bearing,
        marker_color:   r0.marker_color,
        location_notes: r0.location_notes,
        photo_url:      r0.photo_url,
        photo_taken_by: r0.photo_taken_by,
        photo_taken_at: r0.photo_taken_at,
        sv_pano_id:     r0.sv_pano_id  || null,
        sv_heading:     r0.sv_heading  != null ? Number(r0.sv_heading) : null,
        sv_pitch:       r0.sv_pitch    != null ? Number(r0.sv_pitch)   : null,
        sv_fov:         r0.sv_fov      != null ? Number(r0.sv_fov)     : null,
        created_by:     r0.created_by,
        created_at:     r0.created_at,
        attachments:    [],
    };

    rows.forEach((r) => {
        if (r.attachment_id) {
            location.attachments.push({
                attachment_id:  r.attachment_id,
                sign_id:        r.sign_id,
                sign_text:      r.sign_text,
                abbreviation:   r.abbreviation || computeSignAbbreviation(r.sign_text),
                sign_category:  r.sign_category || null,
                template_arrow_direction: r.template_arrow_direction,
                face:           r.face,
                sort_order:     r.sort_order,
                arrow_direction: r.arrow_direction,
                status:         r.status,
                installed_by:   r.installed_by,
                installed_at:   r.installed_at,
                removed_at:     r.removed_at,
                created_by:     r.attachment_created_by,
                created_at:     r.attachment_created_at,
            });
        }
    });

    return location;
}

/**
 * Create a new sign location (no attachments yet).
 *
 * @param {{
 *   latitude:      number,
 *   longitude:     number,
 *   mountType?:    string|null,
 *   frontBearing?: number|null,
 *   markerColor?:  string|null,
 *   locationNotes?: string|null,
 * }} data
 * @param {string} createdBy
 * @returns {Promise<number>} The new location_id.
 */
export async function createSignLocation(data, createdBy) {
    const result = await exec(`
        INSERT INTO dbo.sign_locations
            (latitude, longitude, mount_type, front_bearing,
             marker_color, location_notes, created_by)
        OUTPUT INSERTED.location_id
        VALUES
            (@lat, @lng, @mountType, @frontBearing,
             @markerColor, @locationNotes, @createdBy);
    `, (req) => {
        req.input('lat',           sql.Decimal(10, 7), data.latitude);
        req.input('lng',           sql.Decimal(10, 7), data.longitude);
        req.input('mountType',     sql.NVarChar(20),   data.mountType || null);
        req.input('frontBearing',  sql.Decimal(5, 1),  data.frontBearing ?? null);
        req.input('markerColor',   sql.NVarChar(20),   data.markerColor || null);
        req.input('locationNotes', sql.NVarChar(500),  data.locationNotes || null);
        req.input('createdBy',     sql.NVarChar(100),  createdBy);
    });

    const id = result.recordset?.[0]?.location_id;
    if (!id) throw new Error('INSERT sign_locations did not return location_id.');
    return id;
}

/**
 * Update a sign location's metadata (coordinates, mount type, etc.).
 *
 * @param {number} locationId
 * @param {{
 *   latitude:      number,
 *   longitude:     number,
 *   mountType?:    string|null,
 *   frontBearing?: number|null,
 *   markerColor?:  string|null,
 *   locationNotes?: string|null,
 * }} data
 * @returns {Promise<boolean>}
 */
export async function updateSignLocation(locationId, data) {
    const result = await exec(`
        UPDATE dbo.sign_locations
        SET latitude       = @lat,
            longitude      = @lng,
            mount_type     = @mountType,
            front_bearing  = @frontBearing,
            marker_color   = @markerColor,
            location_notes = @locationNotes
        WHERE location_id = @locationId;
    `, (req) => {
        req.input('locationId',    sql.Int,            locationId);
        req.input('lat',           sql.Decimal(10, 7), data.latitude);
        req.input('lng',           sql.Decimal(10, 7), data.longitude);
        req.input('mountType',     sql.NVarChar(20),   data.mountType || null);
        req.input('frontBearing',  sql.Decimal(5, 1),  data.frontBearing ?? null);
        req.input('markerColor',   sql.NVarChar(20),   data.markerColor || null);
        req.input('locationNotes', sql.NVarChar(500),  data.locationNotes || null);
    });
    return (result.rowsAffected?.[0] ?? 0) > 0;
}

/**
 * Delete a sign location. Cascade deletes its attachments and
 * any traffic-arrow links (via FK ON DELETE CASCADE).
 *
 * @param {number} locationId
 * @returns {Promise<boolean>}
 */
export async function deleteSignLocation(locationId) {
    const result = await exec(`
        DELETE FROM dbo.sign_locations WHERE location_id = @locationId;
    `, (req) => req.input('locationId', sql.Int, locationId));
    return (result.rowsAffected?.[0] ?? 0) > 0;
}

/**
 * Set the photo blob name and attribution on a sign location.
 *
 * @param {number} locationId
 * @param {string} blobName
 * @param {string|null} actorName
 * @returns {Promise<void>}
 */
/**
 * Set the photo (and optionally Street View camera state) on a location.
 *
 * When `svState` is provided (non-null object with panoId), the four
 * sv_ columns are updated to the given values.  When omitted or null,
 * existing sv_ values are preserved — so a manual photo upload does
 * not erase a previously saved Street View position.
 *
 * @param {number}  locationId
 * @param {string}  blobName
 * @param {string|null} actorName
 * @param {{ panoId: string, heading: number, pitch: number, fov: number }|null} [svState]
 * @returns {Promise<void>}
 */
export async function setSignLocationPhoto(locationId, blobName, actorName, svState) {
    const hasSv = !!(svState && svState.panoId);
    await exec(`
        UPDATE dbo.sign_locations
        SET photo_url      = @blobName,
            photo_taken_by = @actorName,
            photo_taken_at = SYSUTCDATETIME(),
            sv_pano_id     = CASE WHEN @hasSvState = 1 THEN @svPanoId  ELSE sv_pano_id END,
            sv_heading     = CASE WHEN @hasSvState = 1 THEN @svHeading ELSE sv_heading  END,
            sv_pitch       = CASE WHEN @hasSvState = 1 THEN @svPitch   ELSE sv_pitch    END,
            sv_fov         = CASE WHEN @hasSvState = 1 THEN @svFov     ELSE sv_fov      END
        WHERE location_id = @locationId;
    `, (req) => {
        req.input('locationId', sql.Int,            locationId);
        req.input('blobName',   sql.NVarChar(500),  blobName);
        req.input('actorName',  sql.NVarChar(100),  actorName || null);
        req.input('hasSvState', sql.Bit,            hasSv ? 1 : 0);
        req.input('svPanoId',   sql.NVarChar(100),  hasSv ? svState.panoId              : null);
        req.input('svHeading',  sql.Decimal(6, 2),  hasSv ? Number(svState.heading)     : null);
        req.input('svPitch',    sql.Decimal(6, 2),  hasSv ? Number(svState.pitch)       : null);
        req.input('svFov',      sql.Decimal(6, 2),  hasSv ? Number(svState.fov)         : null);
    });
}

/**
 * Clear the photo from a sign location.
 *
 * @param {number} locationId
 * @returns {Promise<void>}
 */
/**
 * Clear the photo and Street View state from a sign location.
 *
 * @param {number} locationId
 * @returns {Promise<void>}
 */
export async function clearSignLocationPhoto(locationId) {
    await exec(`
        UPDATE dbo.sign_locations
        SET photo_url      = NULL,
            photo_taken_by = NULL,
            photo_taken_at = NULL,
            sv_pano_id     = NULL,
            sv_heading     = NULL,
            sv_pitch       = NULL,
            sv_fov         = NULL
        WHERE location_id = @locationId;
    `, (req) => req.input('locationId', sql.Int, locationId));
}

// ═══════════════════════════════════════════════════════════════
//  SIGN ATTACHMENTS (signs mounted on a location)
// ═══════════════════════════════════════════════════════════════

/**
 * Attach a sign template to a location.
 *
 * @param {{
 *   locationId:      number,
 *   signId:          number,
 *   face?:           string|null,    'front', 'back', or null
 *   sortOrder?:      number,
 *   arrowDirection?: string|null,
 *   status?:         string,
 * }} data
 * @param {string} createdBy
 * @returns {Promise<number>} The new attachment_id.
 */
export async function createSignAttachment(data, createdBy) {
    const result = await exec(`
        INSERT INTO dbo.sign_attachments
            (location_id, sign_id, face, sort_order,
             arrow_direction, status, created_by)
        OUTPUT INSERTED.attachment_id
        VALUES
            (@locationId, @signId, @face, @sortOrder,
             @arrowDirection, @status, @createdBy);
    `, (req) => {
        req.input('locationId',     sql.Int,          data.locationId);
        req.input('signId',         sql.Int,          data.signId);
        req.input('face',           sql.NVarChar(10), data.face || null);
        req.input('sortOrder',      sql.Int,          data.sortOrder ?? 0);
        req.input('arrowDirection', sql.NVarChar(20), data.arrowDirection || null);
        req.input('status',         sql.NVarChar(20), data.status || 'planned');
        req.input('createdBy',      sql.NVarChar(100), createdBy);
    });

    const id = result.recordset?.[0]?.attachment_id;
    if (!id) throw new Error('INSERT sign_attachments did not return attachment_id.');
    return id;
}

/**
 * Update an attachment's editable fields (face, arrow, sort order).
 *
 * @param {number} attachmentId
 * @param {{
 *   face?:           string|null,
 *   sortOrder?:      number,
 *   arrowDirection?: string|null,
 * }} data
 * @returns {Promise<boolean>}
 */
export async function updateSignAttachment(attachmentId, data) {
    const result = await exec(`
        UPDATE dbo.sign_attachments
        SET face            = @face,
            sort_order      = @sortOrder,
            arrow_direction = @arrowDirection
        WHERE attachment_id = @attachmentId;
    `, (req) => {
        req.input('attachmentId',   sql.Int,          attachmentId);
        req.input('face',           sql.NVarChar(10), data.face || null);
        req.input('sortOrder',      sql.Int,          data.sortOrder ?? 0);
        req.input('arrowDirection', sql.NVarChar(20), data.arrowDirection || null);
    });
    return (result.rowsAffected?.[0] ?? 0) > 0;
}

/**
 * Update an attachment's status, setting audit fields as appropriate.
 *
 * @param {number} attachmentId
 * @param {'planned'|'installed'|'removed'} status
 * @param {string} editedBy
 * @returns {Promise<boolean>}
 */
export async function updateSignAttachmentStatus(attachmentId, status, editedBy) {
    let extraSets = '';
    if (status === 'installed') {
        extraSets = `, installed_by = @editedBy, installed_at = SYSUTCDATETIME(), removed_at = NULL`;
    } else if (status === 'removed') {
        extraSets = `, removed_at = SYSUTCDATETIME()`;
    } else {
        // planned — clear audit fields
        extraSets = `, installed_by = NULL, installed_at = NULL, removed_at = NULL`;
    }

    const result = await exec(`
        UPDATE dbo.sign_attachments
        SET status = @status ${extraSets}
        WHERE attachment_id = @attachmentId;
    `, (req) => {
        req.input('attachmentId', sql.Int,          attachmentId);
        req.input('status',       sql.NVarChar(20), status);
        req.input('editedBy',     sql.NVarChar(100), editedBy);
    });
    return (result.rowsAffected?.[0] ?? 0) > 0;
}

/**
 * Remove a sign attachment from its location. The FK cascade also
 * deletes any traffic_arrow_signs links.
 *
 * @param {number} attachmentId
 * @returns {Promise<boolean>}
 */
export async function deleteSignAttachment(attachmentId) {
    const result = await exec(`
        DELETE FROM dbo.sign_attachments WHERE attachment_id = @attachmentId;
    `, (req) => req.input('attachmentId', sql.Int, attachmentId));
    return (result.rowsAffected?.[0] ?? 0) > 0;
}

/**
 * Reorder attachments on a location. Accepts an array of attachment_ids
 * in the desired order (top → bottom). Updates `sort_order` to match
 * the array index.
 *
 * @param {number} locationId
 * @param {number[]} orderedIds - Attachment IDs in desired display order.
 * @returns {Promise<void>}
 */
export async function reorderSignAttachments(locationId, orderedIds) {
    if (!orderedIds || orderedIds.length === 0) return;

    // Build a CASE expression so the reorder is a single UPDATE.
    const cases = orderedIds
        .map((_, i) => `WHEN @id${i} THEN ${i}`)
        .join(' ');
    const inList = orderedIds
        .map((_, i) => `@id${i}`)
        .join(', ');

    await exec(`
        UPDATE dbo.sign_attachments
        SET sort_order = CASE attachment_id ${cases} END
        WHERE location_id = @locationId
          AND attachment_id IN (${inList});
    `, (req) => {
        req.input('locationId', sql.Int, locationId);
        orderedIds.forEach((id, i) => {
            req.input(`id${i}`, sql.Int, id);
        });
    });
}
 // ═══════════════════════════════════════════════════════════════
//  SIGN TRAFFIC ARROWS (directional road-surface markers)
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch all traffic arrows with their linked attachment IDs.
 *
 * Each arrow includes a `links` array of attachment_id values
 * representing the signs a driver approaching from this direction
 * would see.
 *
 * @returns {Promise<Array<object>>}
 */
export async function getTrafficArrows() {
    const result = await exec(`
        SELECT
            a.arrow_id,
            a.latitude,
            a.longitude,
            a.bearing,
            a.label,
            a.color,
            a.sv_pano_id,
            a.sv_heading,
            a.sv_pitch,
            a.sv_fov,
            a.created_by,
            a.created_at,
            l.attachment_id
        FROM dbo.sign_traffic_arrows a
        LEFT JOIN dbo.sign_traffic_arrow_links l ON a.arrow_id = l.arrow_id
        ORDER BY a.arrow_id, l.link_id;
    `);

    const rows = result.recordset || [];
    /** @type {Map<number, object>} */
    const map = new Map();

    rows.forEach((r) => {
        if (!map.has(r.arrow_id)) {
            map.set(r.arrow_id, {
                arrow_id:   r.arrow_id,
                latitude:   r.latitude,
                longitude:  r.longitude,
                bearing:    r.bearing,
                label:      r.label,
                color:      r.color,
                sv_pano_id: r.sv_pano_id  || null,
                sv_heading: r.sv_heading  != null ? Number(r.sv_heading) : null,
                sv_pitch:   r.sv_pitch    != null ? Number(r.sv_pitch)   : null,
                sv_fov:     r.sv_fov      != null ? Number(r.sv_fov)     : null,
                created_by: r.created_by,
                created_at: r.created_at,
                links:      [],
            });
        }
        if (r.attachment_id != null) {
            map.get(r.arrow_id).links.push(r.attachment_id);
        }
    });

    return Array.from(map.values());
}

/**
 * Create a new traffic arrow.
 *
 * @param {{
 *   latitude:  number,
 *   longitude: number,
 *   bearing:   number,
 *   label?:    string|null,
 *   color?:    string|null,
 * }} data
 * @param {string} createdBy
 * @returns {Promise<number>} The new arrow_id.
 */
export async function createTrafficArrow(data, createdBy) {
    const result = await exec(`
        INSERT INTO dbo.sign_traffic_arrows
            (latitude, longitude, bearing, label, color, created_by)
        OUTPUT INSERTED.arrow_id
        VALUES
            (@lat, @lng, @bearing, @label, @color, @createdBy);
    `, (req) => {
        req.input('lat',       sql.Decimal(10, 7), data.latitude);
        req.input('lng',       sql.Decimal(10, 7), data.longitude);
        req.input('bearing',   sql.Decimal(5, 1),  data.bearing);
        req.input('label',     sql.NVarChar(100),  data.label || null);
        req.input('color',     sql.NVarChar(20),   data.color || null);
        req.input('createdBy', sql.NVarChar(100),  createdBy);
    });

    const id = result.recordset?.[0]?.arrow_id;
    if (!id) throw new Error('INSERT sign_traffic_arrows did not return arrow_id.');
    return id;
}

/**
 * Update a traffic arrow's position, bearing, label, and color.
 *
 * @param {number} arrowId
 * @param {{
 *   latitude:  number,
 *   longitude: number,
 *   bearing:   number,
 *   label?:    string|null,
 *   color?:    string|null,
 * }} data
 * @returns {Promise<boolean>}
 */
export async function updateTrafficArrow(arrowId, data) {
    const result = await exec(`
        UPDATE dbo.sign_traffic_arrows
        SET latitude  = @lat,
            longitude = @lng,
            bearing   = @bearing,
            label     = @label,
            color     = @color
        WHERE arrow_id = @arrowId;
    `, (req) => {
        req.input('arrowId',  sql.Int,            arrowId);
        req.input('lat',      sql.Decimal(10, 7), data.latitude);
        req.input('lng',      sql.Decimal(10, 7), data.longitude);
        req.input('bearing',  sql.Decimal(5, 1),  data.bearing);
        req.input('label',    sql.NVarChar(100),  data.label || null);
        req.input('color',    sql.NVarChar(20),   data.color || null);
    });
    return (result.rowsAffected?.[0] ?? 0) > 0;
}



/**
 * Delete a traffic arrow. Cascade deletes its links.
 *
 * @param {number} arrowId
 * @returns {Promise<boolean>}
 */
export async function deleteTrafficArrow(arrowId) {
    const result = await exec(`
        DELETE FROM dbo.sign_traffic_arrows WHERE arrow_id = @arrowId;
    `, (req) => req.input('arrowId', sql.Int, arrowId));
    return (result.rowsAffected?.[0] ?? 0) > 0;
}

/**
 * Link an attachment to a traffic arrow. Idempotent — the unique
 * constraint silently prevents duplicates via a MERGE.
 *
 * @param {number} arrowId
 * @param {number} attachmentId
 * @returns {Promise<number>} The link_id (new or existing).
 */
export async function createTrafficArrowLink(arrowId, attachmentId) {
    const result = await exec(`
        MERGE dbo.sign_traffic_arrow_links AS tgt
        USING (SELECT @arrowId AS arrow_id, @attachmentId AS attachment_id) AS src
        ON tgt.arrow_id = src.arrow_id AND tgt.attachment_id = src.attachment_id
        WHEN NOT MATCHED THEN
            INSERT (arrow_id, attachment_id)
            VALUES (src.arrow_id, src.attachment_id)
        OUTPUT INSERTED.link_id;
    `, (req) => {
        req.input('arrowId',      sql.Int, arrowId);
        req.input('attachmentId', sql.Int, attachmentId);
    });

    const id = result.recordset?.[0]?.link_id;
    if (!id) {
        // MERGE matched — link already exists, fetch it
        const existing = await exec(`
            SELECT link_id FROM dbo.sign_traffic_arrow_links
            WHERE arrow_id = @arrowId AND attachment_id = @attachmentId;
        `, (req) => {
            req.input('arrowId',      sql.Int, arrowId);
            req.input('attachmentId', sql.Int, attachmentId);
        });
        return existing.recordset?.[0]?.link_id ?? 0;
    }
    return id;
}

/**
 * Unlink an attachment from a traffic arrow.
 *
 * @param {number} arrowId
 * @param {number} attachmentId
 * @returns {Promise<boolean>}
 */
export async function deleteTrafficArrowLink(arrowId, attachmentId) {
  const result = await exec(
    `
        DELETE FROM dbo.sign_traffic_arrow_links
        WHERE arrow_id = @arrowId AND attachment_id = @attachmentId;
    `,
    (req) => {
      req.input("arrowId", sql.Int, arrowId);
      req.input("attachmentId", sql.Int, attachmentId);
    },
  );
  return (result.rowsAffected?.[0] ?? 0) > 0;
}

/**
 * Persist Street View camera state on a traffic arrow.
 *
 * Saves the panorama ID and camera angles so the view can be
 * restored the next time Street View is opened from this arrow.
 *
 * @param {number} arrowId
 * @param {{ panoId: string, heading: number, pitch: number, fov: number }} svState
 * @returns {Promise<void>}
 */
export async function setTrafficArrowSvState(arrowId, svState) {
  await exec(
    `
        UPDATE dbo.sign_traffic_arrows
        SET sv_pano_id = @svPanoId,
            sv_heading = @svHeading,
            sv_pitch   = @svPitch,
            sv_fov     = @svFov
        WHERE arrow_id = @arrowId;
    `,
    (req) => {
      req.input("arrowId", sql.Int, arrowId);
      req.input("svPanoId", sql.NVarChar(100), String(svState.panoId));
      req.input("svHeading", sql.Decimal(6, 2), Number(svState.heading));
      req.input("svPitch", sql.Decimal(6, 2), Number(svState.pitch));
      req.input("svFov", sql.Decimal(6, 2), Number(svState.fov));
    },
  );
}

// ═══════════════════════════════════════════════════════════════════
// TOURS
// ═══════════════════════════════════════════════════════════════════

/**
 * Returns all dismissed tour IDs for a volunteer.
 *
 * @param {number} volunteerId
 * @returns {Promise<string[]>}
 */
export async function getTourDismissals(volunteerId) {
    const result = await exec(
        `SELECT tour_id FROM dbo.volunteer_tour_dismissals
         WHERE volunteer_id = @volunteerId`,
        (req) => {
            req.input('volunteerId', sql.Int, volunteerId);
        }
    );
    return (result.recordset || []).map(r => r.tour_id);
}

/**
 * Dismisses a tour prompt for a volunteer (idempotent).
 *
 * @param {number} volunteerId
 * @param {string} tourId — tour key e.g. 'scheduler', or '_all' to disable all prompts
 * @returns {Promise<void>}
 */
export async function dismissTour(volunteerId, tourId) {
    await exec(
        `IF NOT EXISTS (
            SELECT 1 FROM dbo.volunteer_tour_dismissals
            WHERE volunteer_id = @volunteerId AND tour_id = @tourId
        )
        INSERT INTO dbo.volunteer_tour_dismissals (volunteer_id, tour_id)
        VALUES (@volunteerId, @tourId)`,
        (req) => {
            req.input('volunteerId', sql.Int, volunteerId);
            req.input('tourId', sql.NVarChar(50), tourId);
        }
    );
}

// ============================================================
// REPORTS — Graphical chart data
// ============================================================

/**
 * Return per-convention-day slot fill rate for a given year.
 *
 * For each convention day:
 *  - `total_needed`   = SUM of schedule_assignments.volunteer_need across all
 *                       schedule assignments in shifts belonging to that day.
 *  - `total_assigned` = COUNT of shift_slot_assignments rows for that day
 *                       (one row per volunteer-slot pair in the scheduler).
 *
 * Used by GET /api/reports/scheduling-coverage to feed the Scheduling Coverage
 * chart on the Reports page.
 *
 * @param {number} year - Convention year (e.g. 2026).
 * @returns {Promise<Array<{
 *   day_id:         number,
 *   day_label:      string,
 *   convention_date: string,
 *   total_needed:   number,
 *   total_assigned: number,
 * }>>}
 */
export async function getSchedulingCoverageSummary(year) {
    const result = await exec(
        `SELECT
             cd.id                                                   AS day_id,
             cd.label                                                AS day_label,
             CONVERT(VARCHAR(10), cd.convention_date, 120)           AS convention_date,
             COALESCE(SUM(sa.volunteer_need), 0)                     AS total_needed,
             COUNT(ssa.id)                                           AS total_assigned
         FROM dbo.convention_days cd
         LEFT JOIN dbo.sessions             sess ON sess.convention_day_id = cd.id
         LEFT JOIN dbo.shifts               sh   ON sh.session_id          = sess.id
         LEFT JOIN dbo.schedule_assignments sa   ON sa.shift_id             = sh.id
         LEFT JOIN dbo.shift_slot_assignments ssa
             ON  ssa.schedule_assignment_id = sa.id
             AND ssa.convention_day_id      = cd.id
         WHERE cd.year = @year
         GROUP BY cd.id, cd.label, cd.convention_date
         ORDER BY cd.convention_date;`,
        (req) => {
            req.input('year', sql.Int, year);
        },
    );

    return (result.recordset || []).map((r) => ({
        day_id:          r.day_id,
        day_label:       r.day_label       || '',
        convention_date: r.convention_date || null,
        total_needed:    Number(r.total_needed)   || 0,
        total_assigned:  Number(r.total_assigned) || 0,
    }));
}

/**
 * Return per-convention-day attendance summary for a given year.
 *
 * Aggregates shift-level invitation and attendance data up to the day level.
 * Follows the same per-shift counting logic as getAttendanceReportForDay but
 * spans all shifts in all days of the year in a single query.
 *
 * Counts are shift-invitation-slot based, not unique-volunteer based — a
 * volunteer assigned to two shifts on the same day contributes two rows to
 * both invited_count and attended_count, matching the detailed report view.
 *
 * Fields returned per day:
 *  - `total_invited`   = SUM of distinct invited volunteers per shift across the day.
 *  - `total_attended`  = SUM of invited volunteers who have an attended=1 record.
 *  - `total_no_show`   = Invited but not attended and not declined.
 *
 * Used by GET /api/reports/attendance-overview to feed the Attendance chart
 * on the Reports page.
 *
 * @param {number} year - Convention year (e.g. 2026).
 * @returns {Promise<Array<{
 *   day_id:          number,
 *   day_label:       string,
 *   convention_date: string,
 *   total_invited:   number,
 *   total_attended:  number,
 *   total_no_show:   number,
 * }>>}
 */
export async function getAttendanceSummary(year) {
    const result = await exec(
        `SELECT
             cd.id                                         AS day_id,
             cd.label                                      AS day_label,
             CONVERT(VARCHAR(10), cd.convention_date, 120) AS convention_date,
             COALESCE(SUM(sh_agg.invited_count),  0)       AS total_invited,
             COALESCE(SUM(sh_agg.attended_count), 0)       AS total_attended,
             COALESCE(SUM(sh_agg.no_show_count),  0)       AS total_no_show
         FROM dbo.convention_days cd
         LEFT JOIN (
             SELECT
                 se.convention_day_id,
                 COUNT(DISTINCT i.volunteer_id)                           AS invited_count,
                 COUNT(DISTINCT CASE WHEN a.attended = 1
                                     THEN a.volunteer_id END)            AS attended_count,
                 COUNT(DISTINCT CASE
                     WHEN i.volunteer_id IS NOT NULL
                      AND COALESCE(a.attended, 0)  = 0
                      AND COALESCE(i.response, '') <> 'no'
                     THEN i.volunteer_id END)                            AS no_show_count
             FROM dbo.shifts sh
             INNER JOIN dbo.sessions      se
                 ON  se.id = sh.session_id
             INNER JOIN dbo.convention_days cd2
                 ON  cd2.id   = se.convention_day_id
                 AND cd2.year = @year
             LEFT JOIN dbo.invitations i
                 ON  i.shift_id = sh.id
                 AND i.revoked  = 0
             LEFT JOIN dbo.attendance a
                 ON  a.shift_id     = sh.id
                 AND a.volunteer_id = i.volunteer_id
             GROUP BY se.convention_day_id
         ) sh_agg ON sh_agg.convention_day_id = cd.id
         WHERE cd.year = @year
         GROUP BY cd.id, cd.label, cd.convention_date
         ORDER BY cd.convention_date;`,
        (req) => {
            req.input('year', sql.Int, year);
        },
    );

    return (result.recordset || []).map((r) => ({
        day_id:          r.day_id,
        day_label:       r.day_label       || '',
        convention_date: r.convention_date || null,
        total_invited:   Number(r.total_invited)  || 0,
        total_attended:  Number(r.total_attended) || 0,
        total_no_show:   Number(r.total_no_show)  || 0,
    }));
}

/**
 * Fetch demographic data for active completed volunteers.
 *
 * Returns one row per volunteer with computed age (null when dobirth is null),
 * gender, and all spiritual privilege flags. Aggregation (age bins, privilege
 * counts, gender split) is done client-side in reportsCharts.js so the server
 * stays thin and the UI can re-aggregate without another round-trip.
 *
 * Used by GET /api/reports/demographics.
 *
 * @param {number} year - Convention year (used only for active_current_year filter).
 * @returns {Promise<Array<{
 *   age:          number|null,
 *   gender:       string|null,
 *   elder:        boolean,
 *   min_serv:     boolean,
 *   aux_pioneer:  boolean,
 *   reg_pioneer:  boolean,
 *   spec_pioneer: boolean,
 *   sfs:          boolean,
 * }>>}
 */
export async function getVolunteerDemographics(year) {
    const result = await exec(
        `SELECT
             CASE
                 WHEN dobirth IS NULL THEN NULL
                 ELSE DATEDIFF(YEAR, dobirth, GETDATE()) -
                      CASE
                          WHEN MONTH(dobirth) > MONTH(GETDATE())
                            OR (MONTH(dobirth) = MONTH(GETDATE())
                                AND DAY(dobirth) > DAY(GETDATE()))
                          THEN 1 ELSE 0
                      END
             END                              AS age,
             gender,
             CAST(elder       AS BIT)         AS elder,
             CAST(minServ     AS BIT)         AS min_serv,
             CAST(auxPioneer  AS BIT)         AS aux_pioneer,
             CAST(regPioneer  AS BIT)         AS reg_pioneer,
             CAST(specPioneer AS BIT)         AS spec_pioneer,
             CAST(sfs         AS BIT)         AS sfs
         FROM dbo.volunteer_in
         WHERE registration_status = 'completed'
           AND active_current_year = 1
         ORDER BY lastName;`,
        (req) => { req.input('year', sql.Int, year); },
    );

    return (result.recordset || []).map((r) => ({
        age:          r.age         != null ? Number(r.age) : null,
        gender:       r.gender      || null,
        elder:        !!r.elder,
        min_serv:     !!r.min_serv,
        aux_pioneer:  !!r.aux_pioneer,
        reg_pioneer:  !!r.reg_pioneer,
        spec_pioneer: !!r.spec_pioneer,
        sfs:          !!r.sfs,
    }));
}

/**
 * Return crew staffing summary for a given year:
 *   - Roster count per department (volunteers with the crew flag set and
 *     active_current_year = 1).
 *   - Scheduled count per department (distinct volunteers who appeared in
 *     at least one shift of that department in the year's convention days).
 *
 * Returned as an array of one object per department, ordered by roster size
 * descending so the chart renders largest crews first.
 *
 * Used by GET /api/reports/crew-staffing.
 *
 * @param {number} year
 * @returns {Promise<Array<{
 *   department:       string,
 *   label:            string,
 *   roster_count:     number,
 *   scheduled_count:  number,
 * }>>}
 */
export async function getCrewStaffingSummary(year) {
    // Part 1: how many active volunteers have each crew flag set
    const rosterResult = await exec(
        `SELECT
             SUM(CASE WHEN crew_lots_garages  = 1 THEN 1 ELSE 0 END) AS lots_and_garages,
             SUM(CASE WHEN crew_signs         = 1 THEN 1 ELSE 0 END) AS signs,
             SUM(CASE WHEN crew_security      = 1 THEN 1 ELSE 0 END) AS security,
             SUM(CASE WHEN crew_dropoff_pickup= 1 THEN 1 ELSE 0 END) AS dropoff_pickup,
             SUM(CASE WHEN crew_mobile_support= 1 THEN 1 ELSE 0 END) AS mobile_support,
             SUM(CASE WHEN crew_desk          = 1 THEN 1 ELSE 0 END) AS desk
         FROM dbo.volunteer_in
         WHERE active_current_year = 1
           AND registration_status NOT IN ('deleted', 'archived', 'draft');`,
    );

    // Part 2: how many distinct volunteers were actually scheduled per department
    const scheduledResult = await exec(
        `SELECT
             sc.dept_key,
             COUNT(DISTINCT ssa.volunteer_id) AS scheduled_count
         FROM dbo.shift_slot_assignments ssa
         JOIN dbo.schedule_assignments sa ON sa.id  = ssa.schedule_assignment_id
         JOIN dbo.shifts               sh ON sh.id  = sa.shift_id
         JOIN dbo.scheduler_categories sc ON sc.id  = sh.category_id
         JOIN dbo.sessions             se ON se.id  = sh.session_id
         JOIN dbo.convention_days      cd ON cd.id  = se.convention_day_id
         WHERE cd.year = @year
           AND sh.category_id IS NOT NULL
         GROUP BY sc.dept_key;`,
        (req) => { req.input('year', sql.Int, year); },
    );

    const roster = rosterResult.recordset?.[0] || {};
    /** @type {Record<string, number>} */
    const scheduledMap = {};
    for (const r of scheduledResult.recordset || []) {
        scheduledMap[r.dept_key] = Number(r.scheduled_count) || 0;
    }

    const DEPT_META = [
        { key: 'lots_and_garages', label: 'Lots & Garages'    },
        { key: 'signs',            label: 'Signs'              },
        { key: 'security',         label: 'Security'           },
        { key: 'dropoff_pickup',   label: 'Drop-off / Pickup'  },
        { key: 'mobile_support',   label: 'Mobile Support'     },
        { key: 'desk',             label: 'Desk'               },
    ];

    return DEPT_META
        .map(({ key, label }) => ({
            department:      key,
            label,
            roster_count:    Number(roster[key])        || 0,
            scheduled_count: scheduledMap[key]           || 0,
        }))
        .sort((a, b) => b.roster_count - a.roster_count);
}

/**
 * Return per-crew staffing health for a single convention day.
 *
 * For each department that has shifts on that day, computes:
 *  - volunteer_need: SUM of schedule_assignments.volunteer_need for all
 *    schedule assignments belonging to shifts on this day in this dept.
 *  - scheduled:  COUNT DISTINCT volunteers in shift_slot_assignments
 *    for this day + department.
 *  - attended:   COUNT DISTINCT volunteers with attendance.attended = 1
 *    for this day + department.
 *  - gap:        volunteer_need − attended (positive = short, negative = over)
 *
 * Correlated subqueries are used for each count to avoid row-multiplication
 * from multi-assignment shifts.
 *
 * Used by GET /api/reports/day-staffing.
 *
 * @param {number} dayId - convention_days.id
 * @returns {Promise<Array<{
 *   department:     string,
 *   label:          string,
 *   volunteer_need: number,
 *   scheduled:      number,
 *   attended:       number,
 *   gap:            number,
 * }>>}
 */
export async function getDayStaffingReport(dayId) {
    

    const result = await exec(
        `SELECT
             sc.dept_key,
             sc.name AS dept_name,
             -- Total volunteer need for this shift across all its assignments
             COALESCE((
                 SELECT SUM(sa.volunteer_need)
                 FROM   dbo.schedule_assignments sa
                 WHERE  sa.shift_id = sh.id
             ), 0)                                              AS volunteer_need,
             -- Distinct volunteers scheduled into any slot for this shift/day
             (
                 SELECT COUNT(DISTINCT ssa.volunteer_id)
                 FROM   dbo.shift_slot_assignments ssa
                 JOIN   dbo.schedule_assignments   sa2
                        ON sa2.id = ssa.schedule_assignment_id
                 WHERE  sa2.shift_id           = sh.id
                   AND  ssa.convention_day_id  = @dayId
             )                                                  AS scheduled,
             -- Distinct volunteers who attended this shift on this day
             (
                 SELECT COUNT(DISTINCT a.volunteer_id)
                 FROM   dbo.attendance a
                 WHERE  a.shift_id          = sh.id
                   AND  a.convention_day_id = @dayId
                   AND  a.attended          = 1
             )                                                  AS attended
         FROM dbo.shifts   sh
         JOIN dbo.scheduler_categories sc ON sc.id = sh.category_id
         JOIN dbo.sessions se ON se.id = sh.session_id
         WHERE se.convention_day_id = @dayId
           AND sh.category_id       IS NOT NULL
         ORDER BY sc.sort_order, sh.start_time;`,
        (req) => { req.input('dayId', sql.Int, dayId); },
    );

    const rows = result.recordset || [];

    // Aggregate shift-level rows up to department-level totals
    /** @type {Map<string, { volunteer_need:number, scheduled:number, attended:number }>} */
    const deptMap = new Map();

    for (const r of rows) {
        const key = r.dept_key;
        if (!deptMap.has(key)) {
            deptMap.set(key, { name: r.dept_name || key, volunteer_need: 0, scheduled: 0, attended: 0 });
        }
        const d = deptMap.get(key);
        d.volunteer_need += Number(r.volunteer_need) || 0;
        d.scheduled      += Number(r.scheduled)      || 0;
        d.attended       += Number(r.attended)        || 0;
    }

    return Array.from(deptMap.entries()).map(([k, d]) => ({
        department:     k,
        label:          d.name,
        volunteer_need: d.volunteer_need,
        scheduled:      d.scheduled,
        attended:       d.attended,
        gap:            d.volunteer_need - d.attended,
    }));
}

// ═══════════════════════════════════════════════════════════════════
// NOTES REPORT
// ═══════════════════════════════════════════════════════════════════

/**
 * Returns volunteers who have a non-null, non-empty intake note.
 * Includes aggregated read history, action item count, and dismissal state.
 *
 * @param {{ includeDismissed?: boolean }} [opts]
 * @returns {Promise<Array<{
 *   id:                  number,
 *   first_name:          string,
 *   last_name:           string,
 *   notes:               string,
 *   action_count:        number,
 *   note_dismissed:      boolean,
 *   note_dismissed_at:   string|null,
 *   note_dismissed_by:   number|null,
 *   dismisser:           string|null,
 *   reads:               Array<{ read_by: number, reader_name: string, read_at: string }>,
 * }>>}
 */
export async function getNotesReportVolunteers({ includeDismissed = false } = {}) {
    const result = await exec(
        `SELECT
            v.id,
            v.firstName,
            v.lastName,
            v.notes,
            ISNULL(v.note_dismissed, 0)                  AS note_dismissed,
            CONVERT(NVARCHAR, v.note_dismissed_at, 126)  AS note_dismissed_at,
            v.note_dismissed_by,
            dm.firstName + ' ' + dm.lastName             AS dismisser,
            ISNULL(ac.action_count, 0)                   AS action_count,
            ISNULL(rds.reads_json, '[]')                 AS reads_json
         FROM dbo.volunteer_in v
         LEFT JOIN dbo.volunteer_in dm ON dm.id = v.note_dismissed_by
         LEFT JOIN (
             SELECT volunteer_id, COUNT(*) AS action_count
             FROM   dbo.volunteer_actions
             WHERE  source_type = 'intake_note'
             GROUP  BY volunteer_id
         ) ac ON ac.volunteer_id = v.id
         LEFT JOIN (
             SELECT
                 nr.volunteer_id,
                 '[' + STRING_AGG(
                     '{"read_by":' + CAST(nr.read_by AS NVARCHAR) +
                     ',"reader_name":"' + REPLACE(r.firstName + ' ' + r.lastName, '"', '') + '"' +
                     ',"read_at":"' + CONVERT(NVARCHAR, nr.read_at, 126) + '"' +
                     '}',
                     ','
                 ) + ']' AS reads_json
             FROM   dbo.volunteer_note_reads nr
             JOIN   dbo.volunteer_in r ON r.id = nr.read_by
             GROUP  BY nr.volunteer_id
         ) rds ON rds.volunteer_id = v.id
         WHERE v.notes IS NOT NULL
           AND LTRIM(RTRIM(v.notes)) != ''
           AND ISNULL(v.note_dismissed, 0) = @includeDismissed
         ORDER BY v.lastName, v.firstName`,
        (req) => {
            req.input('includeDismissed', sql.Bit, includeDismissed ? 1 : 0);
        }
    );

    return (result.recordset || []).map((row) => ({
        id:                 row.id,
        first_name:         row.firstName,
        last_name:          row.lastName,
        notes:              row.notes,
        action_count:       row.action_count,
        note_dismissed:     !!row.note_dismissed,
        note_dismissed_at:  row.note_dismissed_at,
        note_dismissed_by:  row.note_dismissed_by,
        dismisser:          row.dismisser,
        reads:              JSON.parse(row.reads_json || '[]'),
    }));
}

/**
 * Returns note data for a single volunteer — note text, read history,
 * and linked action items. Used by the scheduler note panel.
 *
 * @param {number} volunteerId
 * @returns {Promise<{
 *   id:       number,
 *   first_name: string,
 *   last_name:  string,
 *   notes:    string|null,
 *   reads:    Array<{ read_by: number, reader_name: string, read_at: string }>,
 *   actions:  Array<{ id: number, solution_found: boolean|null, solution: string|null, completed: boolean|null, creator: string, created_at: string }>,
 * }|null>}
 */
export async function getVolunteerNoteById(volunteerId) {
    const [volRes, actRes] = await Promise.all([
        exec(
            `SELECT
                v.id,
                v.firstName,
                v.lastName,
                v.notes,
                ISNULL(rds.reads_json, '[]') AS reads_json
             FROM dbo.volunteer_in v
             LEFT JOIN (
                 SELECT
                     nr.volunteer_id,
                     '[' + STRING_AGG(
                         '{"read_by":' + CAST(nr.read_by AS NVARCHAR) +
                         ',"reader_name":"' + REPLACE(r.firstName + ' ' + r.lastName, '"', '') + '"' +
                         ',"read_at":"' + CONVERT(NVARCHAR, nr.read_at, 126) + '"' +
                         '}',
                         ','
                     ) + ']' AS reads_json
                 FROM   dbo.volunteer_note_reads nr
                 JOIN   dbo.volunteer_in r ON r.id = nr.read_by
                 GROUP  BY nr.volunteer_id
             ) rds ON rds.volunteer_id = v.id
             WHERE v.id = @volunteerId`,
            (req) => { req.input('volunteerId', sql.Int, volunteerId); }
        ),
        exec(
            `SELECT
                a.id,
                a.solution_found,
                a.solution,
                a.completed,
                CONVERT(NVARCHAR, a.created_at, 126) AS created_at,
                cr.firstName + ' ' + cr.lastName     AS creator
             FROM      dbo.volunteer_actions a
             LEFT JOIN dbo.volunteer_in      cr ON cr.id = a.created_by
             WHERE a.volunteer_id = @volunteerId
               AND a.source_type  = 'intake_note'
             ORDER BY a.created_at DESC`,
            (req) => { req.input('volunteerId', sql.Int, volunteerId); }
        ),
    ]);

    const row = volRes.recordset?.[0];
    if (!row) return null;

    return {
        id:         row.id,
        first_name: row.firstName,
        last_name:  row.lastName,
        notes:      row.notes,
        reads:      JSON.parse(row.reads_json || '[]'),
        actions:    (actRes.recordset || []).map((a) => ({
            id:             a.id,
            solution_found: a.solution_found,
            solution:       a.solution,
            completed:      a.completed,
            created_at:     a.created_at,
            creator:        a.creator,
        })),
    };
}

/**
 * Records that an overseer has read a volunteer's intake note.
 * Upserts on (volunteer_id, read_by) — re-reading updates read_at.
 *
 * @param {number} volunteerId
 * @param {number} readBy
 * @returns {Promise<void>}
 */
export async function recordNoteRead(volunteerId, readBy) {
    await exec(
        `MERGE dbo.volunteer_note_reads AS target
         USING (VALUES (@volunteerId, @readBy))
             AS source (volunteer_id, read_by)
         ON target.volunteer_id = source.volunteer_id
            AND target.read_by  = source.read_by
         WHEN MATCHED THEN
             UPDATE SET read_at = GETUTCDATE()
         WHEN NOT MATCHED THEN
             INSERT (volunteer_id, read_by, read_at)
             VALUES (@volunteerId, @readBy, GETUTCDATE());`,
        (req) => {
            req.input('volunteerId', sql.Int, volunteerId);
            req.input('readBy',      sql.Int, readBy);
        }
    );
}

/**
 * Creates a new action item linked to a volunteer.
 *
 * @param {{ volunteerId: number, sourceType: string, sourceId?: number|null, createdBy: number }} params
 * @returns {Promise<number>} The new action's ID.
 */
export async function createVolunteerAction({ volunteerId, sourceType, sourceId = null, createdBy }) {
    const result = await exec(
        `INSERT INTO dbo.volunteer_actions
             (volunteer_id, source_type, source_id, created_by)
         OUTPUT INSERTED.id
         VALUES (@volunteerId, @sourceType, @sourceId, @createdBy)`,
        (req) => {
            req.input('volunteerId', sql.Int,          volunteerId);
            req.input('sourceType',  sql.NVarChar(50), sourceType);
            req.input('sourceId',    sql.Int,          sourceId);
            req.input('createdBy',   sql.Int,          createdBy);
        }
    );
    return result.recordset[0].id;
}

/**
 * Returns all action items for the Notes Report, joined to volunteer and actor names.
 *
 * @param {{ sourceType?: string }} [opts]
 * @returns {Promise<Array>}
 */
export async function getVolunteerActions({ sourceType = 'intake_note', includeAllSources = false } = {}) {
    const result = await exec(
        `SELECT
            a.id,
            a.volunteer_id,
            v.firstName + ' ' + v.lastName           AS volunteer_name,
            CASE
                WHEN a.source_type = 'inbound_sms' AND m.raw_body IS NOT NULL
                THEN m.raw_body
                ELSE v.notes
            END                                       AS notes,
            a.source_type,
            a.solution_found,
            a.solution,
            CONVERT(NVARCHAR, a.solution_found_at, 126) AS solution_found_at,
            a.solution_found_by,
            sf.firstName + ' ' + sf.lastName          AS solution_founder,
            a.completed,
            CONVERT(NVARCHAR, a.completed_at, 126)      AS completed_at,
            a.completed_by,
            cb.firstName + ' ' + cb.lastName          AS completer,
            CONVERT(NVARCHAR, a.created_at, 126)        AS created_at,
            a.created_by,
            cr.firstName + ' ' + cr.lastName          AS creator
         FROM      dbo.volunteer_actions  a
         JOIN      dbo.volunteer_in       v  ON v.id  = a.volunteer_id
         LEFT JOIN dbo.volunteer_in       sf ON sf.id = a.solution_found_by
         LEFT JOIN dbo.volunteer_in       cb ON cb.id = a.completed_by
         LEFT JOIN dbo.volunteer_in       cr ON cr.id = a.created_by
         LEFT JOIN dbo.inbound_sms_messages m ON m.id = a.source_id
                                              AND a.source_type = 'inbound_sms'
         WHERE (
             @includeAllSources = 1
                 AND a.source_type IN ('intake_note', 'inbound_sms')
             OR
             @includeAllSources = 0
                 AND a.source_type = @sourceType
         )
         ORDER BY a.created_at DESC`,
        (req) => {
            req.input('sourceType',        sql.NVarChar(50), sourceType);
            req.input('includeAllSources', sql.Bit,          includeAllSources ? 1 : 0);
        }
    );

    return (result.recordset || []).map(row => ({
        id:                row.id,
        volunteer_id:      row.volunteer_id,
        volunteer_name:    row.volunteer_name,
        notes:             row.notes,
        source_type:       row.source_type,
        solution_found:    row.solution_found,
        solution:          row.solution,
        solution_found_at: row.solution_found_at,
        solution_found_by: row.solution_found_by,
        solution_founder:  row.solution_founder,
        completed:         row.completed,
        completed_at:      row.completed_at,
        completed_by:      row.completed_by,
        completer:         row.completer,
        created_at:        row.created_at,
        created_by:        row.created_by,
        creator:           row.creator,
    }));
}

/**
 * Sets solution_found and optional solution text on an action item.
 *
 * @param {number} actionId
 * @param {{ solutionFound: boolean|null, solution?: string|null }} data
 * @param {number} updatedBy
 * @returns {Promise<void>}
 */
export async function updateActionSolution(actionId, { solutionFound, solution = null }, updatedBy) {
    await exec(
        `UPDATE dbo.volunteer_actions
         SET    solution_found    = @solutionFound,
                solution          = @solution,
                solution_found_at = CASE WHEN @solutionFound IS NOT NULL THEN GETUTCDATE() ELSE NULL END,
                solution_found_by = CASE WHEN @solutionFound IS NOT NULL THEN @updatedBy    ELSE NULL END
         WHERE  id = @actionId`,
        (req) => {
            req.input('actionId',      sql.Int,               actionId);
            req.input('solutionFound', sql.Bit,               solutionFound);
            req.input('solution',      sql.NVarChar(sql.MAX), solution);
            req.input('updatedBy',     sql.Int,               updatedBy);
        }
    );
}

/**
 * Marks an action item as completed.
 *
 * @param {number} actionId
 * @param {number} completedBy
 * @returns {Promise<void>}
 */
export async function completeAction(actionId, completedBy) {
    await exec(
        `UPDATE dbo.volunteer_actions
         SET    completed    = 1,
                completed_at = GETUTCDATE(),
                completed_by = @completedBy
         WHERE  id = @actionId`,
        (req) => {
            req.input('actionId',    sql.Int, actionId);
            req.input('completedBy', sql.Int, completedBy);
        }
    );
}

/**
 * Deletes a volunteer action item by ID.
 *
 * @param {number} actionId
 * @returns {Promise<void>}
 */
export async function deleteVolunteerAction(actionId) {
    await exec(
        `DELETE FROM dbo.volunteer_actions WHERE id = @actionId`,
        (req) => {
            req.input('actionId', sql.Int, actionId);
        }
    );
}

/**
 * Team-level dismissal of a volunteer's intake note.
 *
 * @param {number} volunteerId
 * @param {number} dismissedBy
 * @returns {Promise<void>}
 */
export async function dismissNote(volunteerId, dismissedBy) {
    await exec(
        `UPDATE dbo.volunteer_in
         SET    note_dismissed    = 1,
                note_dismissed_at = GETUTCDATE(),
                note_dismissed_by = @dismissedBy
         WHERE  id = @volunteerId`,
        (req) => {
            req.input('volunteerId', sql.Int, volunteerId);
            req.input('dismissedBy', sql.Int, dismissedBy);
        }
    );
}

/**
 * Restores a dismissed volunteer intake note to the active All Notes view.
 *
 * @param {number} volunteerId
 * @returns {Promise<void>}
 */
export async function restoreNote(volunteerId) {
    await exec(
        `UPDATE dbo.volunteer_in
         SET    note_dismissed    = 0,
                note_dismissed_at = NULL,
                note_dismissed_by = NULL
         WHERE  id = @volunteerId`,
        (req) => {
            req.input('volunteerId', sql.Int, volunteerId);
        }
    );
}

// ─── AI Note Analysis ────────────────────────────────────────────────────────

/**
 * Returns the most recent AI note analysis for a volunteer, or null if none exists.
 * JSON columns (action_items, suggested_blackouts, flags) are parsed before return.
 *
 * @param {number} volunteerId
 * @returns {Promise<{
 *   id:                  number,
 *   volunteer_id:        number,
 *   note_text_snapshot:  string,
 *   note_hash:           string,
 *   analyzed_at:         string,
 *   analyzed_by:         number,
 *   analyzer_name:       string,
 *   model:               string,
 *   prompt_tokens:       number|null,
 *   completion_tokens:   number|null,
 *   summary:             string|null,
 *   category:            string|null,
 *   action_items:        Array,
 *   suggested_blackouts: Array,
 *   flags:               Array,
 *   error:               string|null,
 * }|null>}
 */
export async function getVolunteerNoteAnalysis(volunteerId) {
    const result = await exec(
        `SELECT TOP 1
             a.id,
             a.volunteer_id,
             a.note_text_snapshot,
             a.note_hash,
             CONVERT(NVARCHAR, a.analyzed_at, 126)  AS analyzed_at,
             a.analyzed_by,
             v.firstName + ' ' + v.lastName          AS analyzer_name,
             a.model,
             a.prompt_tokens,
             a.completion_tokens,
             a.summary,
             a.category,
             a.action_items,
             a.suggested_blackouts,
             a.flags,
             a.error
         FROM      dbo.volunteer_note_analyses a
         LEFT JOIN dbo.volunteer_in            v ON v.id = a.analyzed_by
         WHERE  a.volunteer_id = @volunteerId
         ORDER BY a.analyzed_at DESC`,
        (req) => {
            req.input('volunteerId', sql.Int, volunteerId);
        }
    );

    const row = result.recordset?.[0];
    if (!row) return null;

    return {
        id:                  row.id,
        volunteer_id:        row.volunteer_id,
        note_text_snapshot:  row.note_text_snapshot,
        note_hash:           row.note_hash,
        analyzed_at:         row.analyzed_at,
        analyzed_by:         row.analyzed_by,
        analyzer_name:       row.analyzer_name,
        model:               row.model,
        prompt_tokens:       row.prompt_tokens,
        completion_tokens:   row.completion_tokens,
        summary:             row.summary,
        category:            row.category,
        action_items:        row.action_items        ? JSON.parse(row.action_items)        : [],
        suggested_blackouts: row.suggested_blackouts ? JSON.parse(row.suggested_blackouts) : [],
        flags:               row.flags               ? JSON.parse(row.flags)               : [],
        error:               row.error,
    };
}

/**
 * Returns the full analysis history for a volunteer, newest first.
 * Used by the analysis audit view on the Notes Report.
 *
 * @param {number} volunteerId
 * @returns {Promise<Array>}
 */
export async function getAllNoteAnalyses(volunteerId) {
    const result = await exec(
        `SELECT
             a.id,
             CONVERT(NVARCHAR, a.analyzed_at, 126)  AS analyzed_at,
             a.analyzed_by,
             v.firstName + ' ' + v.lastName          AS analyzer_name,
             a.model,
             a.prompt_tokens,
             a.completion_tokens,
             a.summary,
             a.category,
             a.action_items,
             a.suggested_blackouts,
             a.flags,
             a.error
         FROM      dbo.volunteer_note_analyses a
         LEFT JOIN dbo.volunteer_in            v ON v.id = a.analyzed_by
         WHERE  a.volunteer_id = @volunteerId
         ORDER BY a.analyzed_at DESC`,
        (req) => {
            req.input('volunteerId', sql.Int, volunteerId);
        }
    );

    return (result.recordset || []).map((row) => ({
        id:                  row.id,
        analyzed_at:         row.analyzed_at,
        analyzed_by:         row.analyzed_by,
        analyzer_name:       row.analyzer_name,
        model:               row.model,
        prompt_tokens:       row.prompt_tokens,
        completion_tokens:   row.completion_tokens,
        summary:             row.summary,
        category:            row.category,
        action_items:        row.action_items        ? JSON.parse(row.action_items)        : [],
        suggested_blackouts: row.suggested_blackouts ? JSON.parse(row.suggested_blackouts) : [],
        flags:               row.flags               ? JSON.parse(row.flags)               : [],
        error:               row.error,
    }));
}

/**
 * Inserts a new AI note analysis record and returns the new row's ID.
 * JSON array fields (actionItems, suggestedBlackouts, flags) are serialized before storage.
 *
 * @param {{
 *   volunteerId:         number,
 *   noteTextSnapshot:    string,
 *   noteHash:            string,
 *   analyzedBy:          number,
 *   model:               string,
 *   promptTokens?:       number|null,
 *   completionTokens?:   number|null,
 *   summary?:            string|null,
 *   category?:           string|null,
 *   actionItems?:        Array|null,
 *   suggestedBlackouts?: Array|null,
 *   flags?:              Array|null,
 *   rawResponse?:        string|null,
 *   error?:              string|null,
 * }} data
 * @returns {Promise<number>} The new analysis record's ID.
 */
export async function insertNoteAnalysis(data) {
    const {
        volunteerId,
        noteTextSnapshot,
        noteHash,
        analyzedBy,
        model,
        promptTokens       = null,
        completionTokens   = null,
        summary            = null,
        category           = null,
        actionItems        = null,
        suggestedBlackouts = null,
        flags              = null,
        rawResponse        = null,
        error              = null,
    } = data;

    const result = await exec(
        `INSERT INTO dbo.volunteer_note_analyses
             (volunteer_id, note_text_snapshot, note_hash, analyzed_by, model,
              prompt_tokens, completion_tokens, summary, category,
              action_items, suggested_blackouts, flags, raw_response, error)
         OUTPUT INSERTED.id
         VALUES
             (@volunteerId, @noteTextSnapshot, @noteHash, @analyzedBy, @model,
              @promptTokens, @completionTokens, @summary, @category,
              @actionItems, @suggestedBlackouts, @flags, @rawResponse, @error)`,
        (req) => {
            req.input('volunteerId',        sql.Int,               volunteerId);
            req.input('noteTextSnapshot',   sql.NVarChar(sql.MAX), noteTextSnapshot);
            req.input('noteHash',           sql.NVarChar(64),      noteHash);
            req.input('analyzedBy',         sql.Int,               analyzedBy);
            req.input('model',              sql.NVarChar(100),     model);
            req.input('promptTokens',       sql.Int,               promptTokens);
            req.input('completionTokens',   sql.Int,               completionTokens);
            req.input('summary',            sql.NVarChar(sql.MAX), summary);
            req.input('category',           sql.NVarChar(50),      category);
            req.input('actionItems',        sql.NVarChar(sql.MAX), actionItems        ? JSON.stringify(actionItems)        : null);
            req.input('suggestedBlackouts', sql.NVarChar(sql.MAX), suggestedBlackouts ? JSON.stringify(suggestedBlackouts) : null);
            req.input('flags',              sql.NVarChar(sql.MAX), flags              ? JSON.stringify(flags)              : null);
            req.input('rawResponse',        sql.NVarChar(sql.MAX), rawResponse);
            req.input('error',              sql.NVarChar(sql.MAX), error);
        }
    );

    return result.recordset[0].id;
}

/**
 * Inserts an AI-generated action item into volunteer_actions.
 * Sets source_type='ai_analysis' and source_id to the originating analysis row.
 * solution_found is set to 1 immediately since the AI has already provided the
 * recommended action; completed remains null pending overseer follow-through.
 *
 * @param {number} volunteerId
 * @param {string} solution    - The AI-recommended action description.
 * @param {number} analysisId  - FK to volunteer_note_analyses.id.
 * @param {number} createdBy
 * @returns {Promise<number>} The new volunteer_actions row's ID.
 */
export async function insertAiActionItem(volunteerId, solution, analysisId, createdBy) {
    const result = await exec(
        `INSERT INTO dbo.volunteer_actions
             (volunteer_id, source_type, source_id, solution_found, solution,
              solution_found_at, solution_found_by, created_by)
         OUTPUT INSERTED.id
         VALUES
             (@volunteerId, 'ai_analysis', @analysisId, 1, @solution,
              GETUTCDATE(), @createdBy, @createdBy)`,
        (req) => {
            req.input('volunteerId', sql.Int,               volunteerId);
            req.input('analysisId',  sql.Int,               analysisId);
            req.input('solution',    sql.NVarChar(sql.MAX), solution);
            req.input('createdBy',   sql.Int,               createdBy);
        }
    );

    return result.recordset[0].id;
}

/**
 * Returns volunteers whose notes have not yet been analyzed, or whose note text
 * has changed since the most recent analysis (stale). Filters match the Notes
 * Report: non-empty notes only, deleted volunteers excluded.
 * Hash comparison uses SHA2_256 via HASHBYTES to detect staleness server-side.
 *
 * @returns {Promise<Array<{
 *   id:                 number,
 *   first_name:         string,
 *   last_name:          string,
 *   notes:              string,
 *   current_hash:       string,
 *   last_analyzed_hash: string|null,
 *   is_stale:           boolean,
 * }>>}
 */
export async function getVolunteersWithUnanalyzedNotes() {
    const result = await exec(
        `WITH latest_analysis AS (
             SELECT
                 volunteer_id,
                 note_hash,
                 ROW_NUMBER() OVER (PARTITION BY volunteer_id ORDER BY analyzed_at DESC) AS rn
             FROM dbo.volunteer_note_analyses
         )
         SELECT
             v.id,
             v.firstName,
             v.lastName,
             v.notes,
             LOWER(CONVERT(NVARCHAR(64), HASHBYTES('SHA2_256', CAST(v.notes AS NVARCHAR(MAX))), 2)) AS current_hash,
             la.note_hash AS last_analyzed_hash
         FROM      dbo.volunteer_in  v
         LEFT JOIN latest_analysis   la ON la.volunteer_id = v.id AND la.rn = 1
         WHERE v.notes IS NOT NULL
           AND LTRIM(RTRIM(v.notes)) != ''
           AND (
               la.volunteer_id IS NULL
               OR LOWER(CONVERT(NVARCHAR(64), HASHBYTES('SHA2_256', CAST(v.notes AS NVARCHAR(MAX))), 2)) != la.note_hash
           )
         ORDER BY v.lastName, v.firstName`
    );

    return (result.recordset || []).map((row) => ({
        id:                 row.id,
        first_name:         row.firstName,
        last_name:          row.lastName,
        notes:              row.notes,
        current_hash:       row.current_hash,
        last_analyzed_hash: row.last_analyzed_hash ?? null,
        is_stale:           row.last_analyzed_hash !== null && row.last_analyzed_hash !== row.current_hash,
    }));
}
// ─── Inbound SMS helpers ──────────────────────────────────────────────────────

/**
 * Returns the ID of the first active ADMIN-role volunteer.
 * Used as the created_by actor for system-generated volunteer_actions rows
 * (e.g. actions created automatically from inbound SMS messages) where no
 * human operator initiated the action.
 *
 * @returns {Promise<number>}
 * @throws {Error} If no active ADMIN volunteer exists in the database.
 */
export async function getSystemActorId() {
    const result = await exec(
        `SELECT TOP 1 id
         FROM   dbo.volunteer_in
         WHERE  role                = 'ADMIN'
           AND  registration_status = 'completed'
         ORDER BY id ASC`,
    );

    const id = result.recordset?.[0]?.id;
    if (!id) throw new Error("getSystemActorId: no ADMIN volunteer found — cannot create system action.");
    return id;
}

/**
 * Returns all active overseers and admins who have at least one contact method.
 * Used to send SMS and email alerts when an inbound message is received.
 *
 * @returns {Promise<Array<{
 *   id:         number,
 *   firstName:  string,
 *   lastName:   string,
 *   email:      string|null,
 *   phone:      string|null,
 *   smsCapable: boolean,
 * }>>}
 */
export async function getOverseerContacts() {
    const result = await exec(
        `SELECT id, firstName, lastName, email, phone, smsCapable
         FROM   dbo.volunteer_in
         WHERE  role               = 'ADMIN'
           AND  active_current_year = 1
           AND  registration_status = 'completed'
           AND  (email IS NOT NULL OR phone IS NOT NULL)
         ORDER BY lastName, firstName`,
    );

    return (result.recordset || []).map((v) => ({
        id:         v.id,
        firstName:  v.firstName  || "",
        lastName:   v.lastName   || "",
        email:      v.email      || null,
        phone:      v.phone      || null,
        smsCapable: !!v.smsCapable,
    }));
}

/**
 * Inserts a record for an inbound freeform SMS message into inbound_sms_messages.
 * Returns the new row's ID, which is stored as source_id on the linked
 * volunteer_actions row (source_type = 'inbound_sms').
 *
 * @param {{
 *   volunteerId:      number|null,
 *   fromPhone:        string,
 *   rawBody:          string,
 *   aiSummary:        string|null,
 *   aiCategory:       string|null,
 *   aiActionItems:    string|null,
 *   aiRawResponse:    string|null,
 *   aiError:          string|null,
 *   promptTokens:     number|null,
 *   completionTokens: number|null,
 * }} data
 * @returns {Promise<number>} The new inbound_sms_messages row ID.
 */
export async function logInboundSmsMessage({
    volunteerId,
    fromPhone,
    rawBody,
    aiSummary,
    aiCategory,
    aiActionItems,
    aiRawResponse,
    aiError,
    promptTokens,
    completionTokens,
}) {
    const result = await exec(
        `INSERT INTO dbo.inbound_sms_messages
             (volunteer_id, from_phone, raw_body,
              ai_summary, ai_category, ai_action_items,
              ai_raw_response, ai_error,
              prompt_tokens, completion_tokens)
         OUTPUT INSERTED.id
         VALUES
             (@volunteerId, @fromPhone, @rawBody,
              @aiSummary, @aiCategory, @aiActionItems,
              @aiRawResponse, @aiError,
              @promptTokens, @completionTokens)`,
        (req) => {
            req.input("volunteerId",      sql.Int,               volunteerId ?? null);
            req.input("fromPhone",        sql.NVarChar(50),      fromPhone);
            req.input("rawBody",          sql.NVarChar(sql.MAX), rawBody);
            req.input("aiSummary",        sql.NVarChar(sql.MAX), aiSummary        ?? null);
            req.input("aiCategory",       sql.NVarChar(50),      aiCategory       ?? null);
            req.input("aiActionItems",    sql.NVarChar(sql.MAX), aiActionItems    ?? null);
            req.input("aiRawResponse",    sql.NVarChar(sql.MAX), aiRawResponse    ?? null);
            req.input("aiError",          sql.NVarChar(sql.MAX), aiError          ?? null);
            req.input("promptTokens",     sql.Int,               promptTokens     ?? null);
            req.input("completionTokens", sql.Int,               completionTokens ?? null);
        },
    );

    return result.recordset[0].id;
}

/**
 * Appends a timestamped line to a volunteer's notes field.
 * Creates the notes field if it was previously NULL.
 * Used to log inbound SMS messages directly onto the volunteer record
 * so the text appears in the Notes Report.
 *
 * The AI summary is intentionally excluded — only the raw SMS body is
 * appended so notes remain human-authored text.
 *
 * @param {number} volunteerId
 * @param {string} appendText - Pre-formatted line, e.g. "[SMS 6/26/2026 3:14 PM]: I can't work Friday."
 * @returns {Promise<void>}
 */
export async function appendVolunteerNote(volunteerId, appendText) {
    await exec(
        `UPDATE dbo.volunteer_in
         SET    notes = CASE
                    WHEN notes IS NULL OR LTRIM(RTRIM(notes)) = ''
                    THEN @appendText
                    ELSE notes + CHAR(10) + @appendText
                END
         WHERE  id = @volunteerId`,
        (req) => {
            req.input("volunteerId", sql.Int,               volunteerId);
            req.input("appendText",  sql.NVarChar(sql.MAX), appendText);
        },
    );
}/**
 * Returns all unresolved inbound SMS messages joined with volunteer name.
 * Used to populate the Inbound Messages section of the Notes Report.
 *
 * @returns {Promise<Array<{
 *   id:              number,
 *   volunteer_id:    number|null,
 *   first_name:      string,
 *   last_name:       string,
 *   from_phone:      string,
 *   raw_body:        string,
 *   received_at:     string,
 *   ai_summary:      string|null,
 *   ai_category:     string|null,
 *   ai_action_items: string|null,
 *   ai_error:        string|null,
 * }>>}
 */
export async function getUnresolvedInboundSms() {
    const result = await exec(
        `SELECT
            m.id,
            m.volunteer_id,
            ISNULL(v.firstName, 'Unknown') AS first_name,
            ISNULL(v.lastName,  'Caller')  AS last_name,
            m.from_phone,
            m.raw_body,
            CONVERT(NVARCHAR, m.received_at, 126) AS received_at,
            m.ai_summary,
            m.ai_category,
            m.ai_action_items,
            m.ai_error
         FROM dbo.inbound_sms_messages m
         LEFT JOIN dbo.volunteer_in v ON v.id = m.volunteer_id
         WHERE m.resolved = 0
         ORDER BY m.received_at DESC`,
    );

    return (result.recordset || []).map((row) => ({
        id:              row.id,
        volunteer_id:    row.volunteer_id    ?? null,
        first_name:      row.first_name,
        last_name:       row.last_name,
        from_phone:      row.from_phone,
        raw_body:        row.raw_body,
        received_at:     row.received_at,
        ai_summary:      row.ai_summary      ?? null,
        ai_category:     row.ai_category     ?? null,
        ai_action_items: row.ai_action_items ?? null,
        ai_error:        row.ai_error        ?? null,
    }));
}

/**
 * Marks an inbound SMS message as resolved and completes its linked
 * volunteer_action row (source_type = 'inbound_sms', source_id = id).
 *
 * @param {number} id         - inbound_sms_messages.id
 * @param {number} resolvedBy - volunteer_in.id of the overseer resolving it
 * @returns {Promise<void>}
 */
export async function resolveInboundSmsMessage(id, resolvedBy) {
    await exec(
        `UPDATE dbo.inbound_sms_messages
         SET    resolved = 1
         WHERE  id = @id`,
        (req) => { req.input("id", sql.Int, id); },
    );

    await exec(
        `UPDATE dbo.volunteer_actions
         SET    completed    = 1,
                completed_at = GETUTCDATE(),
                completed_by = @resolvedBy
         WHERE  source_type        = 'inbound_sms'
           AND  source_id          = @id
           AND  ISNULL(completed, 0) = 0`,
        (req) => {
            req.input("id",          sql.Int, id);
            req.input("resolvedBy",  sql.Int, resolvedBy);
        },
    );
}
/**
 * Returns all resolved inbound SMS messages for the dismissed/archived panel.
 * Mirrors getUnresolvedInboundSms() with resolved = 1.
 *
 * @returns {Promise<Array<{
 *   id:              number,
 *   volunteer_id:    number|null,
 *   first_name:      string,
 *   last_name:       string,
 *   from_phone:      string,
 *   raw_body:        string,
 *   received_at:     string,
 *   ai_summary:      string|null,
 *   ai_category:     string|null,
 * }>>}
 */
export async function getResolvedInboundSms() {
    const result = await exec(
        `SELECT
            m.id,
            m.volunteer_id,
            ISNULL(v.firstName, 'Unknown') AS first_name,
            ISNULL(v.lastName,  'Caller')  AS last_name,
            m.from_phone,
            m.raw_body,
            CONVERT(NVARCHAR, m.received_at, 126) AS received_at,
            m.ai_summary,
            m.ai_category
         FROM dbo.inbound_sms_messages m
         LEFT JOIN dbo.volunteer_in v ON v.id = m.volunteer_id
         WHERE m.resolved = 1
         ORDER BY m.received_at DESC`,
    );

    return (result.recordset || []).map((row) => ({
        id:           row.id,
        volunteer_id: row.volunteer_id   ?? null,
        first_name:   row.first_name,
        last_name:    row.last_name,
        from_phone:   row.from_phone,
        raw_body:     row.raw_body,
        received_at:  row.received_at,
        ai_summary:   row.ai_summary    ?? null,
        ai_category:  row.ai_category   ?? null,
    }));
}
// ─── AI Blackout Suggestions ──────────────────────────────────────────────────

/**
 * Resolves an AI-produced dayHint/timeHint pair into concrete DB IDs and
 * minute values. Called when persisting a suggestion so the scheduler panel
 * can display and apply it without a second resolution step.
 *
 * Resolution logic:
 *  - dayHint  → convention_day_id  (substring match on convention_days.label)
 *  - Full Day  → startMins/endMins from convention_days.program_start/program_end
 *  - Session   → startMins/endMins from the matching session row
 *  - All other types → convention_day_id only; start/end remain null
 *
 * @param {string|null}  dayHint      - "Friday" | "Saturday" | "Sunday"
 * @param {string|null}  timeHint     - "morning" | "afternoon" | "evening"
 * @param {string}       blackoutType - "Full Day" | "Session" | "Custom" | …
 * @param {number}       year         - Convention year (e.g. 2026).
 * @returns {Promise<{ conventionDayId: number|null, startMins: number|null, endMins: number|null }>}
 */
export async function resolveBlackoutHints(dayHint, timeHint, blackoutType, year) {
    if (!dayHint) return { conventionDayId: null, startMins: null, endMins: null };

    const hint = dayHint.toLowerCase();

    // Fetch both day list (for program times) and days-with-sessions in parallel.
    const [rawDays, daysWithSessions] = await Promise.all([
        getConventionDays(year),
        getConventionDaysWithSessions(),
    ]);

    const rawDay = rawDays.find((d) => d.label.toLowerCase().includes(hint));
    if (!rawDay) return { conventionDayId: null, startMins: null, endMins: null };

    const conventionDayId = rawDay.id;

    /** @param {Date|null} t @returns {number|null} */
    const toMins = (t) =>
        t instanceof Date ? t.getUTCHours() * 60 + t.getUTCMinutes() : null;

    if (blackoutType === "Full Day") {
        return {
            conventionDayId,
            startMins: 0,
            endMins:   1440,
        };
    }

    if (blackoutType === "Session" && timeHint) {
        const th    = timeHint.toLowerCase();
        const dayWS = daysWithSessions.find((d) => d.id === conventionDayId);
        const sess  = dayWS?.sessions.find((s) => s.label.toLowerCase().includes(th));
        if (sess) {
            return {
                conventionDayId,
                startMins: sess.startMin,
                endMins:   sess.endMin,
            };
        }
    }

    // Pre-session, Custom, Shift, or unresolvable Session — day only.
    return { conventionDayId, startMins: null, endMins: null };
}

/**
 * Inserts one pending AI blackout suggestion.
 * Returns the new row id.
 *
 * @param {{
 *   volunteerId:     number,
 *   sourceType:      string,
 *   sourceId:        number|null,
 *   blackoutType:    string,
 *   description:     string,
 *   dayHint:         string|null,
 *   timeHint:        string|null,
 *   conventionDayId: number|null,
 *   startMins:       number|null,
 *   endMins:         number|null,
 * }} params
 * @returns {Promise<number>}
 */
export async function createAiBlackoutSuggestion({
    volunteerId,
    sourceType,
    sourceId,
    blackoutType,
    description,
    dayHint,
    timeHint,
    conventionDayId,
    startMins,
    endMins,
}) {
    const result = await exec(
        `INSERT INTO dbo.ai_blackout_suggestions
             (volunteer_id, source_type, source_id, blackout_type, description,
              day_hint, time_hint, convention_day_id, start_mins, end_mins)
         OUTPUT INSERTED.id
         VALUES
             (@volunteerId, @sourceType, @sourceId, @blackoutType, @description,
              @dayHint, @timeHint, @conventionDayId, @startMins, @endMins)`,
        (req) => {
            req.input("volunteerId",     sql.Int,           volunteerId);
            req.input("sourceType",      sql.NVarChar(50),  sourceType);
            req.input("sourceId",        sql.Int,           sourceId        ?? null);
            req.input("blackoutType",    sql.NVarChar(30),  blackoutType);
            req.input("description",     sql.NVarChar(500), description);
            req.input("dayHint",         sql.NVarChar(20),  dayHint         ?? null);
            req.input("timeHint",        sql.NVarChar(20),  timeHint        ?? null);
            req.input("conventionDayId", sql.Int,           conventionDayId ?? null);
            req.input("startMins",       sql.Int,           startMins       ?? null);
            req.input("endMins",         sql.Int,           endMins         ?? null);
        },
    );
    return result.recordset[0].id;
}

/**
 * Deletes all unapplied suggestions for a given source so that re-analysis
 * or new SMS messages do not stack duplicate suggestions.
 *
 * @param {string}      sourceType - 'intake_note' | 'inbound_sms'
 * @param {number|null} sourceId   - Analysis or SMS message row id.
 * @returns {Promise<void>}
 */
export async function clearUnappliedSuggestionsForSource(sourceType, sourceId) {
    if (sourceId == null) return;
    await exec(
        `DELETE FROM dbo.ai_blackout_suggestions
         WHERE source_type = @sourceType
           AND source_id   = @sourceId
           AND applied     = 0`,
        (req) => {
            req.input("sourceType", sql.NVarChar(50), sourceType);
            req.input("sourceId",   sql.Int,          sourceId);
        },
    );
}

/**
 * Returns all pending (unapplied) blackout suggestions for a volunteer,
 * joined with convention day label for display.
 *
 * @param {number} volunteerId
 * @returns {Promise<Array<{
 *   id:               number,
 *   source_type:      string,
 *   source_id:        number|null,
 *   blackout_type:    string,
 *   description:      string,
 *   day_hint:         string|null,
 *   time_hint:        string|null,
 *   convention_day_id: number|null,
 *   day_label:        string|null,
 *   start_mins:       number|null,
 *   end_mins:         number|null,
 *   created_at:       string,
 * }>>}
 */
export async function getVolunteerPendingConstraints(volunteerId) {
    const result = await exec(
        `SELECT
            s.id,
            s.source_type,
            s.source_id,
            s.blackout_type,
            s.description,
            s.day_hint,
            s.time_hint,
            s.convention_day_id,
            cd.label                                AS day_label,
            s.start_mins,
            s.end_mins,
            CONVERT(NVARCHAR, s.created_at, 126)    AS created_at
         FROM dbo.ai_blackout_suggestions s
         LEFT JOIN dbo.convention_days cd ON cd.id = s.convention_day_id
         WHERE s.volunteer_id = @volunteerId
           AND s.applied      = 0
         ORDER BY s.created_at DESC`,
        (req) => { req.input("volunteerId", sql.Int, volunteerId); },
    );

    return (result.recordset || []).map((r) => ({
        id:               r.id,
        source_type:      r.source_type,
        source_id:        r.source_id        ?? null,
        blackout_type:    r.blackout_type,
        description:      r.description,
        day_hint:         r.day_hint         ?? null,
        time_hint:        r.time_hint        ?? null,
        convention_day_id: r.convention_day_id ?? null,
        day_label:        r.day_label        ?? null,
        start_mins:       r.start_mins       ?? null,
        end_mins:         r.end_mins         ?? null,
        created_at:       r.created_at,
    }));
}

/**
 * Marks a suggestion as applied and creates the corresponding volunteer_blackouts
 * row. Uses createBlackout() (single additive INSERT) rather than
 * saveVolunteerBlackouts() (replace-all) so existing blackouts are preserved.
 *
 * @param {{
 *   suggestionId:    number,
 *   volunteerId:     number,
 *   conventionDayId: number,
 *   startMins:       number,
 *   endMins:         number,
 *   reason:          string|null,
 *   appliedBy:       number,
 * }} params
 * @returns {Promise<{ blackoutId: number }>}
 */
export async function applyBlackoutSuggestion({
    suggestionId,
    volunteerId,
    conventionDayId,
    startMins,
    endMins,
    reason,
    appliedBy,
}) {
    // Create the blackout row (additive — does not touch other blackouts).
    const blackoutId = await createBlackout({
        volunteerId,
        conventionDayId,
        startMins,
        endMins,
        reason:    reason    || null,
        createdBy: String(appliedBy),
    });

    // Look up suggestion source before marking applied — needed for SMS auto-resolve.
    const sugRow = await exec(
        `SELECT source_type, source_id FROM dbo.ai_blackout_suggestions WHERE id = @id`,
        (req) => { req.input("id", sql.Int, suggestionId); },
    );
    const { source_type: srcType, source_id: srcId } = sugRow.recordset?.[0] ?? {};

    // Mark the suggestion applied.
    await exec(
        `UPDATE dbo.ai_blackout_suggestions
         SET    applied    = 1,
                applied_at = GETUTCDATE(),
                applied_by = @appliedBy
         WHERE  id = @id`,
        (req) => {
            req.input("id",        sql.Int, suggestionId);
            req.input("appliedBy", sql.Int, appliedBy);
        },
    );

    // If this suggestion came from an inbound SMS, check whether all suggestions
    // for that message are now applied. If so, auto-resolve the SMS and complete
    // its linked volunteer_action.
    if (srcType === "inbound_sms" && srcId != null) {
        const remainingRes = await exec(
            `SELECT COUNT(*) AS remaining
             FROM   dbo.ai_blackout_suggestions
             WHERE  source_type = 'inbound_sms'
               AND  source_id   = @srcId
               AND  applied     = 0`,
            (req) => { req.input("srcId", sql.Int, srcId); },
        );
        const remaining = remainingRes.recordset?.[0]?.remaining ?? 1;

        if (remaining === 0) {
            await exec(
                `UPDATE dbo.inbound_sms_messages
                 SET    resolved = 1
                 WHERE  id = @srcId`,
                (req) => { req.input("srcId", sql.Int, srcId); },
            );
            await exec(
                `UPDATE dbo.volunteer_actions
                 SET    completed    = 1,
                        completed_at = GETUTCDATE(),
                        completed_by = @appliedBy
                 WHERE  source_type        = 'inbound_sms'
                   AND  source_id          = @srcId
                   AND  ISNULL(completed, 0) = 0`,
                (req) => {
                    req.input("srcId",     sql.Int, srcId);
                    req.input("appliedBy", sql.Int, appliedBy);
                },
            );
        }
    }

    return { blackoutId };
}
/**
 * Deletes all unapplied intake note blackout suggestions for a volunteer.
 * Called before persisting new suggestions from a fresh analysis so that
 * re-running analysis never stacks duplicate suggestions.
 *
 * @param {number} volunteerId
 * @returns {Promise<void>}
 */
export async function clearUnappliedIntakeNoteSuggestions(volunteerId) {
    await exec(
        `DELETE FROM dbo.ai_blackout_suggestions
         WHERE source_type  = 'intake_note'
           AND volunteer_id = @volunteerId
           AND applied      = 0`,
        (req) => { req.input("volunteerId", sql.Int, volunteerId); },
    );
}

/**
 * Deletes a single unapplied blackout suggestion by id.
 * Only deletes if applied = 0 — applied suggestions are permanent records.
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function deleteBlackoutSuggestion(id) {
    await exec(
        `DELETE FROM dbo.ai_blackout_suggestions
         WHERE id      = @id
           AND applied = 0`,
        (req) => { req.input("id", sql.Int, id); },
    );
}
// ─── Schedule Violations ──────────────────────────────────────────────────────

/**
 * Returns all schedule_assignments where assigned_count < vol_min for the
 * given convention year. Used by the rule engine to detect understaffed slots.
 *
 * @param {number} year
 * @returns {Promise<Array<{
 *   slot_id:        number,
 *   shift_id:       number,
 *   shift_label:    string,
 *   vol_min:        number,
 *   vol_ideal:      number|null,
 *   vol_max:        number|null,
 *   location_name:  string|null,
 *   day_id:         number,
 *   day_label:      string,
 *   assigned_count: number,
 * }>>}
 */
export async function getSlotStaffingForYear(year) {
    const result = await exec(
        `SELECT
            sa.id                  AS slot_id,
            sa.shift_id,
            sh.label               AS shift_label,
            sa.vol_min,
            sa.volunteer_need      AS vol_ideal,
            sa.vol_max,
            lt.name                AS location_name,
            cd.id                  AS day_id,
            cd.label               AS day_label,
            COUNT(ssa.volunteer_id) AS assigned_count
         FROM      dbo.schedule_assignments  sa
         JOIN      dbo.shifts                sh  ON sh.id  = sa.shift_id
         JOIN      dbo.sessions              se  ON se.id  = sh.session_id
         JOIN      dbo.convention_days       cd  ON cd.id  = se.convention_day_id
         LEFT JOIN dbo.locations_tasks       lt  ON lt.id  = sa.location_task_id
         LEFT JOIN dbo.shift_slot_assignments ssa ON ssa.schedule_assignment_id = sa.id
         WHERE  cd.year     = @year
           AND  sa.vol_min IS NOT NULL
           AND  sa.vol_min  > 0
         GROUP BY sa.id, sa.shift_id, sh.label, sa.vol_min, sa.volunteer_need,
                  sa.vol_max, lt.name, cd.id, cd.label
         HAVING COUNT(ssa.volunteer_id) < sa.vol_min
         ORDER BY cd.id, sh.label`,
        (req) => { req.input("year", sql.Int, year); },
    );

    return (result.recordset || []).map((r) => ({
        slot_id:       r.slot_id,
        shift_id:      r.shift_id,
        shift_label:   r.shift_label,
        vol_min:       r.vol_min,
        vol_ideal:     r.vol_ideal     ?? null,
        vol_max:       r.vol_max       ?? null,
        location_name: r.location_name ?? null,
        day_id:        r.day_id,
        day_label:     r.day_label,
        assigned_count: r.assigned_count,
    }));
}

/**
 * Returns the most recent violation run for a given year, including all of
 * its violations joined with volunteer name and day label.
 *
 * Returns null when no run exists for the year.
 *
 * @param {number} year
 * @returns {Promise<object|null>}
 */
export async function getLatestScheduleViolationRun(year) {
    const runRes = await exec(
        `SELECT TOP 1
            r.id,
            r.year,
            r.schedule_hash,
            r.triggered_by,
            v.firstName + ' ' + v.lastName AS triggered_by_name,
            CONVERT(NVARCHAR, r.triggered_at, 126) AS triggered_at,
            r.violation_count
         FROM      dbo.schedule_violation_runs r
         LEFT JOIN dbo.volunteer_in            v ON v.id = r.triggered_by
         WHERE  r.year = @year
         ORDER BY r.triggered_at DESC`,
        (req) => { req.input("year", sql.Int, year); },
    );

    const run = runRes.recordset?.[0];
    if (!run) return null;

    const violRes = await exec(
        `SELECT
            sv.id,
            sv.volunteer_id,
            vi.firstName + ' ' + vi.lastName AS volunteer_name,
            sv.shift_id,
            sv.shift_id_2,
            sv.convention_day_id,
            cd.label                          AS day_label,
            sv.violation_type,
            sv.severity,
            sv.confidence,
            sv.description,
            sv.ai_suggestion,
            sv.ai_question,
            sv.overseer_response,
            sv.acknowledged,
            sv.acknowledged_by,
            ab.firstName + ' ' + ab.lastName  AS acknowledged_by_name,
            CONVERT(NVARCHAR, sv.acknowledged_at, 126) AS acknowledged_at
         FROM      dbo.schedule_violations sv
         LEFT JOIN dbo.volunteer_in        vi ON vi.id = sv.volunteer_id
         LEFT JOIN dbo.convention_days     cd ON cd.id = sv.convention_day_id
         LEFT JOIN dbo.volunteer_in        ab ON ab.id = sv.acknowledged_by
         WHERE  sv.run_id = @runId
         ORDER BY
             CASE sv.severity
                 WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3
                 WHEN 'low'      THEN 4 WHEN 'info'  THEN 5 ELSE 6
             END,
             sv.id`,
        (req) => { req.input("runId", sql.Int, run.id); },
    );

    return {
        id:                   run.id,
        year:                 run.year,
        schedule_hash:        run.schedule_hash,
        triggered_by:         run.triggered_by         ?? null,
        triggered_by_name:    run.triggered_by_name    ?? null,
        triggered_at:         run.triggered_at,
        violation_count:      run.violation_count,
        violations: (violRes.recordset || []).map((v) => ({
            id:                   v.id,
            volunteer_id:         v.volunteer_id          ?? null,
            volunteer_name:       v.volunteer_name         ?? null,
            shift_id:             v.shift_id               ?? null,
            shift_id_2:           v.shift_id_2             ?? null,
            convention_day_id:    v.convention_day_id,
            day_label:            v.day_label              ?? null,
            violation_type:       v.violation_type,
            severity:             v.severity               ?? null,
            confidence:           v.confidence !== null ? Number(v.confidence) : null,
            description:          v.description,
            ai_suggestion:        v.ai_suggestion          ?? null,
            ai_question:          v.ai_question            ?? null,
            overseer_response:    v.overseer_response      ?? null,
            acknowledged:         !!v.acknowledged,
            acknowledged_by:      v.acknowledged_by        ?? null,
            acknowledged_by_name: v.acknowledged_by_name   ?? null,
            acknowledged_at:      v.acknowledged_at         ?? null,
        })),
    };
}

/**
 * Inserts a new schedule violation run header.
 *
 * @param {{ year: number, scheduleHash: string, triggeredBy: number|null, violationCount: number }} p
 * @returns {Promise<number>} New run id.
 */
export async function insertScheduleViolationRun({ year, scheduleHash, triggeredBy, violationCount }) {
    const result = await exec(
        `INSERT INTO dbo.schedule_violation_runs
             (year, schedule_hash, triggered_by, violation_count)
         OUTPUT INSERTED.id
         VALUES (@year, @hash, @triggeredBy, @count)`,
        (req) => {
            req.input("year",        sql.Int,          year);
            req.input("hash",        sql.NVarChar(64), scheduleHash);
            req.input("triggeredBy", sql.Int,          triggeredBy   ?? null);
            req.input("count",       sql.Int,          violationCount);
        },
    );
    return result.recordset[0].id;
}

/**
 * Inserts one schedule violation row.
 *
 * @param {{
 *   runId:          number,
 *   volunteerId:    number|null,
 *   shiftId:        number|null,
 *   shiftId2:       number|null,
 *   conventionDayId: number,
 *   violationType:  string,
 *   severity:       string|null,
 *   confidence:     number|null,
 *   description:    string,
 *   aiSuggestion:   string|null,
 *   aiQuestion:     string|null,
 * }} p
 * @returns {Promise<number>} New violation id.
 */
export async function insertScheduleViolation({
    runId, volunteerId, shiftId, shiftId2, conventionDayId,
    violationType, severity, confidence, description, aiSuggestion, aiQuestion,
}) {
    const result = await exec(
        `INSERT INTO dbo.schedule_violations
             (run_id, volunteer_id, shift_id, shift_id_2, convention_day_id,
              violation_type, severity, confidence, description, ai_suggestion, ai_question)
         OUTPUT INSERTED.id
         VALUES
             (@runId, @volunteerId, @shiftId, @shiftId2, @conventionDayId,
              @violationType, @severity, @confidence, @description, @aiSuggestion, @aiQuestion)`,
        (req) => {
            req.input("runId",          sql.Int,           runId);
            req.input("volunteerId",    sql.Int,           volunteerId     ?? null);
            req.input("shiftId",        sql.Int,           shiftId         ?? null);
            req.input("shiftId2",       sql.Int,           shiftId2        ?? null);
            req.input("conventionDayId",sql.Int,           conventionDayId);
            req.input("violationType",  sql.NVarChar(50),  violationType);
            req.input("severity",       sql.NVarChar(20),  severity        ?? null);
            req.input("confidence",     sql.Decimal(3, 2), confidence      ?? null);
            req.input("description",    sql.NVarChar(sql.MAX), description);
            req.input("aiSuggestion",   sql.NVarChar(sql.MAX), aiSuggestion ?? null);
            req.input("aiQuestion",     sql.NVarChar(sql.MAX), aiQuestion   ?? null);
        },
    );
    return result.recordset[0].id;
}

/**
 * Marks a violation acknowledged.
 *
 * @param {number} id
 * @param {number} acknowledgedBy
 * @returns {Promise<void>}
 */
export async function acknowledgeScheduleViolation(id, acknowledgedBy) {
    await exec(
        `UPDATE dbo.schedule_violations
         SET    acknowledged    = 1,
                acknowledged_by = @acknowledgedBy,
                acknowledged_at = GETUTCDATE()
         WHERE  id = @id`,
        (req) => {
            req.input("id",             sql.Int, id);
            req.input("acknowledgedBy", sql.Int, acknowledgedBy);
        },
    );
}

/**
 * Saves the overseer's plain-text response to an AI question.
 *
 * @param {number} id
 * @param {string} response
 * @returns {Promise<void>}
 */
export async function saveViolationOverseerResponse(id, response) {
    await exec(
        `UPDATE dbo.schedule_violations
         SET    overseer_response = @response
         WHERE  id = @id`,
        (req) => {
            req.input("id",       sql.Int,               id);
            req.input("response", sql.NVarChar(sql.MAX), response);
        },
    );
}

/**
 * Fetches a single violation by id, including volunteer and day label.
 * Used by the re-analyze route.
 *
 * @param {number} id
 * @returns {Promise<object|null>}
 */
export async function getScheduleViolationById(id) {
    const result = await exec(
        `SELECT
            sv.*,
            vi.firstName + ' ' + vi.lastName AS volunteer_name,
            cd.label                          AS day_label
         FROM      dbo.schedule_violations sv
         LEFT JOIN dbo.volunteer_in        vi ON vi.id = sv.volunteer_id
         LEFT JOIN dbo.convention_days     cd ON cd.id = sv.convention_day_id
         WHERE sv.id = @id`,
        (req) => { req.input("id", sql.Int, id); },
    );
    return result.recordset?.[0] ?? null;
}

/**
 * Updates AI result fields on a violation after a targeted re-analysis.
 *
 * @param {number} id
 * @param {{ aiSuggestion: string|null, aiQuestion: string|null, confidence: number|null }} p
 * @returns {Promise<void>}
 */
export async function updateViolationAiResult(id, { aiSuggestion, aiQuestion, confidence }) {
    await exec(
        `UPDATE dbo.schedule_violations
         SET    ai_suggestion = @aiSuggestion,
                ai_question   = @aiQuestion,
                confidence    = @confidence
         WHERE  id = @id`,
        (req) => {
            req.input("id",           sql.Int,               id);
            req.input("aiSuggestion", sql.NVarChar(sql.MAX), aiSuggestion ?? null);
            req.input("aiQuestion",   sql.NVarChar(sql.MAX), aiQuestion   ?? null);
            req.input("confidence",   sql.Decimal(3, 2),     confidence   ?? null);
        },
    );
}

/**
 * Returns all violations in a run that share a given ai_question text
 * and have an overseer_response already saved.
 * Used for bulk re-analysis after a new rule is created from a response.
 *
 * @param {number} runId
 * @param {string} aiQuestion - Exact ai_question string to match.
 * @returns {Promise<Array<object>>}
 */
export async function getViolationsByQuestion(runId, aiQuestion) {
    const result = await exec(
        `SELECT
            sv.id,
            sv.description,
            sv.ai_question,
            sv.overseer_response,
            sv.convention_day_id,
            cd.label                          AS day_label,
            sv.volunteer_id,
            vi.firstName + ' ' + vi.lastName  AS volunteer_name
         FROM      dbo.schedule_violations sv
         LEFT JOIN dbo.convention_days     cd ON cd.id = sv.convention_day_id
         LEFT JOIN dbo.volunteer_in        vi ON vi.id = sv.volunteer_id
         WHERE  sv.run_id     = @runId
           AND  sv.ai_question = @aiQuestion
         ORDER BY sv.id`,
        (req) => {
            req.input("runId",      sql.Int,               runId);
            req.input("aiQuestion", sql.NVarChar(sql.MAX), aiQuestion);
        },
    );
    return (result.recordset || []).map((v) => ({
        id:               v.id,
        description:      v.description,
        ai_question:      v.ai_question,
        overseer_response: v.overseer_response ?? null,
        convention_day_id: v.convention_day_id,
        day_label:        v.day_label         ?? null,
        volunteer_id:     v.volunteer_id       ?? null,
        volunteer_name:   v.volunteer_name     ?? null,
    }));
}
// ─── Schedule Analysis Rules ──────────────────────────────────────────────────

/**
 * Returns all schedule analysis rules ordered by sort_order.
 * Pass { activeOnly: true } to exclude inactive rules (for AI injection).
 *
 * @param {{ activeOnly?: boolean }} [opts]
 * @returns {Promise<Array<{ id: number, rule_text: string, sort_order: number, active: boolean }>>}
 */
export async function getScheduleAnalysisRules({ activeOnly = false } = {}) {
    const result = await exec(
        `SELECT id, rule_text, sort_order, active
         FROM   dbo.schedule_analysis_rules
         ${activeOnly ? "WHERE active = 1" : ""}
         ORDER  BY sort_order, id`,
    );
    return (result.recordset || []).map((r) => ({
        id:         r.id,
        rule_text:  r.rule_text,
        sort_order: r.sort_order,
        active:     !!r.active,
    }));
}

/**
 * @param {{ ruleText: string, sortOrder: number, createdBy: number }} p
 * @returns {Promise<number>} New rule id.
 */
export async function createScheduleAnalysisRule({ ruleText, sortOrder, createdBy }) {
    const result = await exec(
        `INSERT INTO dbo.schedule_analysis_rules (rule_text, sort_order, created_by)
         OUTPUT INSERTED.id
         VALUES (@ruleText, @sortOrder, @createdBy)`,
        (req) => {
            req.input("ruleText",   sql.NVarChar(sql.MAX), ruleText);
            req.input("sortOrder",  sql.Int,               sortOrder);
            req.input("createdBy",  sql.Int,               createdBy);
        },
    );
    return result.recordset[0].id;
}

/**
 * Updates rule_text and/or sort_order on a rule.
 *
 * @param {{ id: number, ruleText?: string, sortOrder?: number, updatedBy: number }} p
 * @returns {Promise<void>}
 */
export async function updateScheduleAnalysisRule({ id, ruleText, sortOrder, updatedBy }) {
    await exec(
        `UPDATE dbo.schedule_analysis_rules
         SET    rule_text  = COALESCE(@ruleText, rule_text),
                sort_order = COALESCE(@sortOrder, sort_order),
                updated_by = @updatedBy,
                updated_at = GETUTCDATE()
         WHERE  id = @id`,
        (req) => {
            req.input("id",         sql.Int,               id);
            req.input("ruleText",   sql.NVarChar(sql.MAX), ruleText  ?? null);
            req.input("sortOrder",  sql.Int,               sortOrder ?? null);
            req.input("updatedBy",  sql.Int,               updatedBy);
        },
    );
}

/**
 * Toggles the active bit on a rule.
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function toggleScheduleAnalysisRule(id) {
    await exec(
        `UPDATE dbo.schedule_analysis_rules
         SET    active = CASE WHEN active = 1 THEN 0 ELSE 1 END
         WHERE  id = @id`,
        (req) => { req.input("id", sql.Int, id); },
    );
}

/**
 * Deletes a rule permanently.
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function deleteScheduleAnalysisRule(id) {
    await exec(
        `DELETE FROM dbo.schedule_analysis_rules WHERE id = @id`,
        (req) => { req.input("id", sql.Int, id); },
    );
}