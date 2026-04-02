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
import {hashPassword} from "./passwordVer.js";
import sql from "mssql";
import { PERMISSIONS } from "../src/config/roles.js";

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
 * Mark a volunteer as having a pending password reset.
 *
 * - Stores the provided hash into pending_pass_hash (VARBINARY).
 * - Sets pending_pass_reset = 1 and updates timestamps.
 *
 * @param {number} id
 * @param {string} hash
 * @returns {Promise<void>}
 */
export async function setPendingReset(id, hash) {
  const tsql = `
    UPDATE dbo.volunteer_in
    SET pending_pass_reset       = 1,
        pending_pass_hash        = @hash,
        last_pass_reset_sent_at  = SYSUTCDATETIME(),
        last_updated             = SYSUTCDATETIME()
    WHERE id = @id;
  `;

  await exec(tsql, (req) => {
    req.input("id", sql.Int, id);
    // Let SQL convert NVARCHAR -> VARBINARY for now; matches your existing behavior.
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

export async function getActiveVolunteers() {
  const result= await exec(
    `
    SELECT id, firstName, lastName, suffix
    FROM dbo.volunteer_in
    WHERE registration_status = 'completed'
    ORDER BY lastName, firstName, suffix;
    `)
    
  const volunteers = [];
  for(let v=0; v<result.recordset.length; v++) {
    const {id, firstName, lastName, suffix} = result.recordset[v];
    volunteers.push({id, lastName, firstName, suffix });
  }
  console.log("Loaded volunteers for oversight:", volunteers);
  return volunteers || null;
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
  const digitsOnly = (s) =>
    (s || "")
      .replace(/\D+/g, "")
      .trim();

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
      reqSql.input(
        "requirePhoneConfirm",
        sql.Bit,
        requirePhoneConfirm ? 1 : 0,
      );
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
 * Returns { id, registration_id }.
 *
 * @param {string} email
 * @param {string} rawPassword
 * @returns {Promise<{id:number, registration_id:string} | null>}
 */
export async function insertDraftEmailPass(email, rawPassword) {
  const trimmedEmail = (email || "").trim().toLowerCase();
  if (!trimmedEmail || !rawPassword) return null;

  const pwd = hashPassword(rawPassword);

  const result = await exec(
    `
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
    OUTPUT inserted.id, inserted.registration_id
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
``

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
      'volunteerIn'
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
      last_step = 'volunteerIn',
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
  whatsappid
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
    req.input("whatsappid", sql.NVarChar(96), typeof whatsappid === "string" && whatsappid.trim() !== "" ? whatsappid : null);
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
    req.input(
      "dobirth",
      sql.Date,
      dobirthRaw ? new Date(dobirthRaw) : null
    );

    req.input(
      "gender",
      sql.NVarChar(20),
      genderRaw || null
    );

    req.input(
      "stamina",
      sql.Int,
      staminaRaw ? Number(staminaRaw) : null
    );

    req.input("editedBy", sql.NVarChar(50), editedBy || null);
    req.input("id", sql.Int, id);
  });
};

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

/**
 * Check if an email exists in non-archived records.
 * @param {string} email
 * @param {string|null} [excludeRegistrationId=null]
 * @returns {Promise<boolean>}
 */
export async function emailExists(email, excludeRegistrationId = null) {
  const sqlText = `
    SELECT 1
    FROM dbo.volunteer_in
    WHERE email = @email
      AND registration_status <> 'archived'
      AND (
        @excludeRegistrationId IS NULL
        OR registration_id <> @excludeRegistrationId
      );
  `;

  const res = await exec(sqlText, (req) => {
    req.input("email", sql.NVarChar(255), email);
    req.input(
      "excludeRegistrationId",
      sql.UniqueIdentifier,
      excludeRegistrationId,
    );
  });

  return res.recordset.length > 0;
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
    const result = await exec(`
        UPDATE dbo.volunteer_in
        SET role         = @role,
            last_updated = SYSUTCDATETIME(),
            edited_by    = @editedBy
        WHERE id = @id
          AND registration_status <> 'archived';
    `, (req) => {
        req.input('id',       sql.Int,         targetId);
        req.input('role',     sql.NVarChar(20), newRole);
        req.input('editedBy', sql.NVarChar(50), editedBy || null);
    });

    const affected = Array.isArray(result.rowsAffected)
        ? result.rowsAffected.reduce((sum, n) => sum + n, 0)
        : result.rowsAffected || 0;

    return affected > 0;
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
            pending_pass_reset
        FROM dbo.volunteer_in
        WHERE registration_status = 'draft'
          AND registration_status <> 'archived'
          AND (email IS NOT NULL OR phone IS NOT NULL)
        ORDER BY lastName, firstName;
    `);

    return result.recordset || [];
}