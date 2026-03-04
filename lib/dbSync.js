/**
 * ============================================================
 *  dbSync.js
 *  Centralized database access layer for volunteer management.
 *  Draft-based registration lifecycle only.
 * ============================================================
 */

// ============================================================
// Imports
// ============================================================
import { query as rawQuery, whoAmI, healthProbe } from "../src/config/azureConfig.js";
import sql from "mssql";
import crypto from "crypto";

// ============================================================
// Logging Helpers
// ============================================================
function log(...args) {
  console.log(`[${new Date().toISOString()}] [lib/dbSync.js]`, ...args);
}
function logError(...args) {
  console.error(`[${new Date().toISOString()}] [lib/dbSync.js]`, ...args);
}

// ============================================================
// Password Hashing
// ============================================================
function hashPassword(password) {
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
export async function exec(sqlText, bindParamsFn) {
  log("exec called");
  return rawQuery(sqlText, bindParamsFn);
}

// ============================================================
// Volunteer Cache
// ============================================================
export async function loadVolunteerCache() {
  const tsql = `SELECT * FROM dbo.volunteer_in;`;
  const result = await exec(tsql);
  const rows = result.recordset || [];

  const byRegistrationId = {};
  const byUserId = {};

  for (const row of rows) {
    if (row.registration_id) byRegistrationId[row.registration_id] = row;
    if (row.id) byUserId[row.id] = row;
  }

  return { byRegistrationId, byUserId };
}

// ============================================================
// Draft Inserts
// ============================================================
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

  const result = await exec(sqlText, (req) => {
    req.input("firstName", sql.NVarChar(100), firstName);
    req.input("lastName", sql.NVarChar(100), lastName);
    req.input("suffix", sql.NVarChar(20), suffix || null);
    req.input("email", sql.NVarChar(255), email);
  });

  return result.recordset?.[0] ?? null;
}

// ============================================================
// Draft Updates
// ============================================================
export async function updateDraftNameEmail(
  registrationId,
  firstName,
  lastName,
  suffix,
  email,
){
  const sqlText = `
    UPDATE dbo.volunteer_in
    SET
      firstName = @firstName,
      lastName = @lastName,
      suffix = @suffix,
      email = @email,
      last_step = 'volunteerIn',
      last_updated = SYSUTCDATETIME()
    WHERE registration_id = @registrationId
      AND registration_status = 'draft';
  `;
  const result = await exec(sqlText, (req) => {
    req.input("registrationId", sql.UniqueIdentifier, registrationId);
    req.input("firstName", sql.NVarChar(100), firstName);
    req.input("lastName", sql.NVarChar(100), lastName);
    req.input("suffix", sql.NVarChar(20), suffix || null);
    req.input("email", sql.NVarChar(255), email);
    });

  return result.recordset?.[0] ?? null;

}

export async function updateDraftNamePhone(
  registrationId,
  firstName,
  lastName,
  suffix,
  phone,
  smsCapable
) {
  const sqlText = `
    UPDATE dbo.volunteer_in
    SET
      phone = @phone,
      smsCapable = @smsCapable,
      firstName = COALESCE(@firstName, firstName),
      lastName  = COALESCE(@lastName, lastName),
      suffix    = COALESCE(@suffix, suffix),
      last_step = 'volunteerIn',
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
  });

  return result.recordset?.[0] ?? null;
}

export async function updateDraftPersonalInfo(registrationId, data) {
  const { gender, dobirth, stamina } = data;

  const sqlText = `
    UPDATE dbo.volunteer_in
    SET
      gender = @gender,
      dobirth = @dobirth,
      stamina = @stamina,
      last_step = 'personalInfo',
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

export async function updateDraftCongregationInfo(registrationId, data) {
  const { assignedToConv, congregation, attendExtra } = data;

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

export async function updateDraftSpiritualInfo(registrationId, privilegeList) {
  const privilegesOptions = [
    "auxPioneer",
    "regPioneer",
    "specPioneer",
    "minServ",
    "elder",
    "sfs"
  ];

  const sqlText = `
    UPDATE dbo.volunteer_in
    SET
      auxPioneer = @auxPioneer,
      regPioneer = @regPioneer,
      specPioneer = @specPioneer,
      minServ = @minServ,
      elder = @elder,
      sfs = @sfs,
      last_step = 'spiritualInfo',
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

// ============================================================
// Notes
// ============================================================
export async function updateDraftNotes(registrationId, notes) {
  const sqlText = `
    UPDATE dbo.volunteer_in
    SET notes = @notes,
    last_step = 'notes',
      last_updated = SYSUTCDATETIME()
    WHERE registration_id = @registrationId
      AND registration_status = 'draft';
  `;

 const result= await exec(sqlText, (req) => {
    req.input("registrationId", sql.UniqueIdentifier, registrationId);
    req.input("notes", sql.VarChar(2048), notes);
  });
  return result.recordset?.[0] ?? null;

}

// lib/dbSync.js

/**
 * Mark a draft registration as completed.
 *
 * Implementation: Option A
 *   - Uses NVARCHAR column [registration_status]
 *   - Sets it to 'completed' for the given registration_id
 *
 * @param {string} registrationId - req.session.registrationId
 * @returns {Promise<boolean>} true if a row was updated; false otherwise
 */
export async function markDraftCompleted(registrationId) {
  if (!registrationId) {
    throw new Error('markDraftCompleted: registrationId is required');
  }

  const pool = await getSqlPool();

  const result = await pool
    .request()
    .input('registrationId', sql.VarChar(50), registrationId)
    .query(`
      UPDATE dbo.volunteer_in
      SET registration_status = 'completed'
      WHERE registration_id = @registrationId;
    `);

  // rowsAffected is an array (one entry per statement)
  const affected = Array.isArray(result.rowsAffected)
    ? result.rowsAffected.reduce((sum, n) => sum + n, 0)
    : result.rowsAffected || 0;

  return affected > 0;
}

// ============================================================
// Duplicate Checks
// ============================================================
export async function nameExists(
  firstName,
  lastName,
  suffix,
  excludeRegistrationId = null
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

  const res = await exec(sqlText, req => {
    req.input("firstName", sql.NVarChar(100), firstName);
    req.input("lastName", sql.NVarChar(100), lastName);
    req.input("suffix", sql.NVarChar(20), suffix || null);
    req.input(
      "excludeRegistrationId",
      sql.UniqueIdentifier,
      excludeRegistrationId
    );
  });

  return res.recordset.length > 0;
}
export async function phoneExists(
  phone,
  excludeRegistrationId = null
) {
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

  const res = await exec(sqlText, req => {
    req.input("phone", sql.NVarChar(50), phone);
    req.input(
      "excludeRegistrationId",
      sql.UniqueIdentifier,
      excludeRegistrationId
    );
  });

  return res.recordset.length > 0;
}


export async function emailExists(
  email,
  excludeRegistrationId = null
) {
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

  const res = await exec(sqlText, req => {
    req.input("email", sql.NVarChar(255), email);
    req.input(
      "excludeRegistrationId",
      sql.UniqueIdentifier,
      excludeRegistrationId
    );
  });

  return res.recordset.length > 0;
}

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
export async function getCongregations() {
  const tsql = `SELECT * FROM dbo.congregations ORDER BY congregation`;

  try {
    const res = await exec(tsql);
    return res.recordset?.map(
      (item) => `${item.Congregation}, ${item.State}`
    ) ?? [];
  } catch (error) {
    logError("Database query failed:", error);
    return [];
  }
}

// ============================================================
// Diagnostics
// ============================================================
export async function dbWhoAmI() {
  return whoAmI();
}

export async function dbHealth() {
  return healthProbe();
}