/**
 * ============================================================
 *  dbSync.js  (renamed in comments only — file remains dbSync.js)
 *  Centralized database access layer for volunteer management.
 *  Handles inserts, updates, lookups, duplicate checks, and
 *  cached volunteer loading.
 *
 *  Works With:
 *    - ../src/config/azureConfig.js → getSqlPool(), query(), whoAmI(), healthProbe()
 *    - index.js                     → routes call these functions
 *    - dbo.volunteer_in             → core registration table
 *    - dbo.congregations            → data source for congregation choices
 * ============================================================
 */

// ============================================================
// Imports
// ============================================================
//#region Imports
import { getSqlPool, query as rawQuery, whoAmI, healthProbe } from '../src/config/azureConfig.js';
import sql from 'mssql';
import crypto from 'crypto';
//#endregion

// ============================================================
// Logging Helpers
// ============================================================
//#region Logging
function log(...args) {
  console.log(`[${new Date().toISOString()}] [lib/dbSync.js]`, ...args);
}
function logError(...args) {
  console.error(`[${new Date().toISOString()}] [lib/dbSync.js]`, ...args);
}
//#endregion

// ============================================================
// Password Hashing
// ============================================================
//#region Password Hashing
/**
 * Hash a password using PBKDF2-SHA256.
 * @param {string} password - Raw user password.
 * @returns {{hash: string, salt: string, iterations: number, algorithm: string}}
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64');
  const iterations = 310000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('base64');
  return { hash, salt, iterations, algorithm: 'pbkdf2-sha256' };
}
//#endregion

// ============================================================
// Exec Wrapper
// ============================================================
//#region Exec Wrapper
/**
 * Unified executor for all SQL queries with optional param binding.
 * @param {string} sqlText - T-SQL statement.
 * @param {(req: sql.Request) => void} [bindParamsFn] - Parameter binding function.
 * @returns {Promise<import("mssql").IResult<any>>}
 */
export async function exec(sqlText, bindParamsFn) {
  log('exec called');
  return rawQuery(sqlText, bindParamsFn);
}
//#endregion

// ============================================================
// Volunteer Cache Loader
// ============================================================
//#region Volunteer Cache
/**
 * Load the full volunteer_in table into memory.
 * Used for fast duplicate checking and caching.
 * @returns {Promise<Array>}
 */
export async function loadVolunteerCache() {
  const tsql = `
    SELECT id, email, firstName, lastName, suffix, phone
    FROM dbo.volunteer_in;
  `;
  const result = await exec(tsql);
  return result.recordset || [];
}
//#endregion

// ============================================================
// Insert Functions
// ============================================================
//#region Inserts
/**
 * Insert or attach a volunteer using name + email.
 * Prevents duplicates based on:
 *  - email
 *  - OR firstName + lastName + suffix
 * @returns {Promise<Object|null>} The inserted row or null if duplicate.
 */
export async function insertNameEmail(firstName, lastName, suffix, email) {
  const sqlText = `
    IF NOT EXISTS (
      SELECT 1 FROM volunteer_in
      WHERE email = @email
      OR (firstName = @firstName AND lastName = @lastName AND suffix = @suffix)
    )
    BEGIN
      INSERT INTO dbo.volunteer_in (firstName, lastName, suffix, email)
      OUTPUT inserted.id, inserted.firstName, inserted.lastName, inserted.suffix, inserted.email
      VALUES (@firstName, @lastName, @suffix, @email)
    END;
  `;
  const result = await exec(sqlText, (req) => {
    req.input('firstName', sql.NVarChar(50), firstName);
    req.input('lastName', sql.NVarChar(50), lastName);
    req.input('suffix', sql.NVarChar(50), suffix);
    req.input('email', sql.NVarChar(255), email);
  });
  return result.recordset?.[0] ?? null;
}

/**
 * Insert a volunteer using email + password hash.
 * Prevents duplicate emails.
 * @returns {Promise<Object|null>} The inserted row or null if duplicate.
 */
export async function insertEmailPass(email, password) {
  const { hash, salt, iterations, algorithm } = hashPassword(password);
  const sqlText = `
    IF NOT EXISTS (
      SELECT 1 FROM volunteer_in WHERE email = @email
    )
    BEGIN
      INSERT INTO dbo.volunteer_in (email, passwordHash, passwordSalt, passwordAlgo, passwordIter)
      OUTPUT inserted.id, inserted.email
      VALUES (@email, @hash, @salt, @algo, @iter)
    END;
  `;
  const result = await exec(sqlText, (req) => {
    req.input('email', sql.NVarChar(255), email);
    req.input('hash', sql.NVarChar(256), hash);
    req.input('salt', sql.NVarChar(64), salt);
    req.input('algo', sql.NVarChar(50), algorithm);
    req.input('iter', sql.Int, iterations);
  });
  return result.recordset?.[0] ?? null;
}
//#endregion

// ============================================================
// Update Functions (Spiritual Info, Congregation, Name & Phone)
// ============================================================
//#region Updates
/**
 * Update spiritual privileges for a volunteer.
 * @param {number} userId
 * @param {Array<string>} privilegeList
 * @returns {Promise<Object|null>}
 */
export async function insertSpiritualInfo(userId, privilegeList) {
  const privilegesOptions = [
    'auxPioneer',
    'regPioneer',
    'specPioneer',
    'minServ',
    'elder',
    'sfs'
  ];

  const sqlText = `
    UPDATE dbo.volunteer_in
    SET auxPioneer = @auxPioneer,
        regPioneer = @regPioneer,
        specPioneer = @specPioneer,
        minServ = @minServ,
        elder = @elder,
        sfs = @sfs
    OUTPUT inserted.*
    WHERE id = @userId;
  `;
  const result = await exec(sqlText, (req) => {
    req.input('userId', sql.Int, userId);
    for (const privilege of privilegesOptions) {
      req.input(privilege, sql.Bit, privilegeList.includes(privilege));
    }
  });
  return result.recordset?.[0] ?? null;
}

/**
 * Update a volunteer's congregation information.
 * Supports:
 *  - Assigned = dropdown selection
 *  - Visiting = city/state/language composition
 */
export async function insertCongregationInfo(
  userId,
  congAssignedRaw,
  congregation,
  extraAttendRaw,
  congregationOtherCity,
  congregationOtherState,
  congregationOtherLang
) {
  // Normalize flags from mixed inputs ("yes"/"no", on/true/1)
  const congAssigned = String(congAssignedRaw).toLowerCase() === 'yes';
  const extraAttend =
    extraAttendRaw === true ||
    extraAttendRaw === 1 ||
    extraAttendRaw === '1' ||
    String(extraAttendRaw).toLowerCase() === 'on' ||
    String(extraAttendRaw).toLowerCase() === 'true';

  // Compute final congregation string
  let congregationValue;
  if (congAssigned) {
    congregationValue = congregation ?? null;
  } else {
    const city = (congregationOtherCity || '').trim();
    const state = (congregationOtherState || '').trim().toUpperCase();
    const lang = (congregationOtherLang || '').trim().toUpperCase();
    congregationValue = `${city}, ${state} - ${lang}`;
  }

  const sqlText = `
    UPDATE dbo.volunteer_in
    SET assignedToConv = @congAssigned,
        congregation   = @congregation,
        attendExtra    = @extraAttend
    OUTPUT inserted.*
    WHERE id = @userId;
  `;
  const result = await exec(sqlText, (req) => {
    req.input('userId', sql.Int, userId);
    req.input('congAssigned', sql.Bit, congAssigned);
    req.input('congregation', sql.NVarChar(100), congregationValue);
    req.input('extraAttend', sql.Bit, extraAttend);
  });
  return result.recordset?.[0] ?? null;
}

/**
 * Update volunteer name + phone info.
 * Performs normalized update and accepts SMS capable flag.
 */
export async function insertNameAndPhone(id, firstName, lastName, phone, suffix, smsCapableRaw) {
  const smsCapable =
    smsCapableRaw === true ||
    smsCapableRaw === 1 ||
    smsCapableRaw === '1' ||
    String(smsCapableRaw).toLowerCase() === 'on' ||
    String(smsCapableRaw).toLowerCase() === 'true';
  const sqlText = `
    UPDATE dbo.volunteer_in 
    SET firstName = @firstName,
        lastName  = @lastName, 
        phone     = @phone, 
        suffix    = @suffix,
        smsCapable = @smsCapable
    OUTPUT inserted.*
    WHERE id = @id;
  `;
  const result = await exec(sqlText, (req) => {
    req.input('id', sql.Int, id);
    req.input('phone', sql.NVarChar(50), phone);
    req.input('firstName', sql.NVarChar(50), firstName);
    req.input('lastName', sql.NVarChar(50), lastName);
    req.input('suffix', sql.NVarChar(50), suffix);
    req.input('smsCapable', sql.Bit, smsCapable);
  });
  return result.recordset?.[0] ?? null;
}

/**
 * Update volunteer gender, age, stamina.
 * Accepts sanitized data from /submitPersonal route
 */

export async function insertPersonalInfo(userId, gender, dobirth, stamina){
  const sqlText = `
    UPDATE dbo.volunteer_in
    SET gender = @gender,
        dobirth = @dobirth,
        stamina = @stamina
    OUTPUT inserted.*
    WHERE id = @userId;
  `;
  const result = await exec(sqlText, (req) =>{
    req.input("userId", sql.Int, userId);
    req.input("gender", sql.VarChar(50), gender);
    req.input("dobirth", sql.Date, dobirth);
    req.input("stamina", sql.Int, stamina);
  });
  return result.recordset?.[0] ?? null;
}
//#endregion

// ============================================================
// Existence & Duplicate Checks
// ============================================================
//#region Duplicate Checks
/**
 * Check if an email already exists.
 * @param {string} email
 * @returns {Promise<boolean>}
 */
export async function emailExists(email) {
  const tsql = `
    SELECT TOP (1) 1 AS exists_flag
    FROM dbo.volunteer_in
    WHERE email = @email;
  `;
  const res = await exec(tsql, (req) => {
    req.input('email', sql.NVarChar(255), email);
  });
  return !!res.recordset?.length;
}

/**
 * Check if a volunteer already exists by:
 *  - name (first, last, suffix)
 *  - OR phone number
 * Prevents duplicates and enforces unique phones.
 * @returns {Promise<Object|null>} Existing record or null.
 */
export async function namePhoneExists(firstName, lastName, phone, suffix) {
  const tsql = `
    SELECT TOP (1) id, firstName, lastName, phone, suffix
    FROM dbo.volunteer_in
    WHERE (firstName = @firstName AND lastName = @lastName AND suffix = @suffix)
       OR (phone = @phone);
  `;
  const res = await exec(tsql, (req) => {
    req.input('firstName', sql.NVarChar(50), firstName);
    req.input('lastName', sql.NVarChar(50), lastName);
    req.input('suffix', sql.NVarChar(50), suffix);
    req.input('phone', sql.NVarChar(50), phone);
  });
  return res.recordset?.[0] ?? null;
}
//#endregion

// ============================================================
// Congregation Queries
// ============================================================
//#region Congregations
/**
 * Fetch full list of congregations for dropdown + autocomplete.
 * @returns {Promise<string[]>}
 */
export async function getCongregations() {
  const tsql = `SELECT * FROM dbo.congregations ORDER BY congregation`;
  try {
    const res = await exec(tsql);
    return res.recordset?.map((item) => `${item.Congregation}, ${item.State}`) ?? [];
  } catch (error) {
    logError('Database query failed:', error);
    return [];
  }
}
//#endregion

// ============================================================
// Diagnostics
// ============================================================
//#region Diagnostics
/**
 * Return SQL login + database user context.
 * @returns {Promise<{login: string, dbuser: string}>}
 */
export async function dbWhoAmI() {
  return whoAmI();
}

/**
 * Return SQL security principals (health probe).
 * @returns {Promise<any>}
 */
export async function dbHealth() {
  return healthProbe();
}
//#endregion

// ============================================================
// END OF FILE
// ============================================================