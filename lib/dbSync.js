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
import sql from "mssql";
import crypto from "crypto";

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
// Password Hashing (for draft registration)
// ============================================================

/**
 * Hash a password using PBKDF2-SHA256 (for draft registration inserts).
 * @param {string} password
 * @returns {{hash: string, salt: string, iterations: number, algorithm: string}}
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64");
  const iterations = 310000;
  const hash = crypto
    .pbkdf2Sync(password, salt, iterations, 32, "sha256")
    .toString("base64");

  return { hash, salt, iterations, algorithm: "pbkdf2-sha256" };
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

/**
 * Insert a "registered" draft with email + password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{id:number,registration_id:string}|null>}
 */
export async function insertDraftEmailPass(email, password) {
  const { hash, salt, iterations, algorithm } = hashPassword(password);

  const sqlText = `
    INSERT INTO dbo.volunteer_in (
      email,
      passwordHash,
      passwordSalt,
      passwordAlgo,
      passwordIter,
      registration_status,
      last_step,
      accountType
    )
    OUTPUT inserted.id, inserted.registration_id
    VALUES (
      @email,
      @hash,
      @salt,
      @algo,
      @iter,
      'draft',
      'emailPass',
      'registered'
    );
  `;

  const result = await exec(sqlText, (req) => {
    req.input("email", sql.NVarChar(255), email);
    req.input("hash", sql.NVarChar(256), hash);
    req.input("salt", sql.NVarChar(64), salt);
    req.input("algo", sql.NVarChar(50), algorithm);
    req.input("iter", sql.Int, iterations);
  });

  return result.recordset?.[0] ?? null;
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
// Registered Volunteer Updates (My Account)
// ============================================================

/**
 * Update core contact info (email, phone, smsCapable) for real user.
 * @param {number} id
 * @param {{email:string,phone:string,smsCapable:boolean}} param1
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
export async function updateUserPersonal(
  id,
  { dobirthRaw, genderRaw, staminaRaw },
  editedBy,
) {
  const dob = dobirthRaw ? new Date(dobirthRaw) : null;
  const stamina = staminaRaw ? Number(staminaRaw) : null;

  const tsql = `
    UPDATE dbo.volunteer_in
    SET dobirth     = @dobirth,
        gender      = @gender,
        stamina     = @stamina,
        last_updated = SYSUTCDATETIME(),
        edited_by    = @editedBy
    WHERE id = @id;
  `;

  return exec(tsql, (req) => {
    if (dob && !isNaN(dob.valueOf())) {
      req.input("dobirth", sql.DateTime2, dob);
    } else {
      req.input("dobirth", sql.DateTime2, null);
    }
    req.input(
      "gender",
      sql.NVarChar(20),
      (genderRaw || "").toLowerCase() || null,
    );
    req.input("stamina", sql.Int, stamina || null);
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
 * Update password (PBKDF2) for real user.
 * @param {number} id
 * @param {{hash:string,salt:string,iterations:number,algo:string}} param1
 * @param {string} [editedBy]
 * @returns {Promise<import("mssql").IResult<any>>}
 */
export async function updateUserPassword(
  id,
  { hash, salt, iterations, algo },
  editedBy,
) {
  const tsql = `
    UPDATE dbo.volunteer_in
    SET passwordHash = @hash,
        passwordSalt = @salt,
        passwordIter = @iter,
        passwordAlgo = @algo,
        last_updated = SYSUTCDATETIME(),
        edited_by    = @editedBy
    WHERE id = @id;
  `;

  return exec(tsql, (req) => {
    req.input("hash", sql.NVarChar(200), hash);
    req.input("salt", sql.NVarChar(200), salt);
    req.input("iter", sql.Int, iterations);
    req.input("algo", sql.NVarChar(50), algo);
    req.input("editedBy", sql.NVarChar(50), editedBy || null);
    req.input("id", sql.Int, id);
  });
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
