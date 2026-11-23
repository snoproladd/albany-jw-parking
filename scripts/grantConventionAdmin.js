/**
 * @file scripts/grantConventionAdmin.js
 * Grant or revoke convention admin for one account (multi-department).
 *
 * Convention admins sit above every department: they can work in any
 * department (department switcher), run Decently for any department, and
 * are the only people asked to start the next convention year.
 *
 * Usage (from the repo root):
 *     node --env-file=.env scripts/grantConventionAdmin.js <email>            grant (dbo)
 *     node --env-file=.env scripts/grantConventionAdmin.js <email> --revoke   revoke
 *     node --env-file=.env scripts/grantConventionAdmin.js <email> --demo     demo schema
 *     node --env-file=.env scripts/grantConventionAdmin.js --list             list current convention admins
 *
 * It prints the database it is connected to first. The person must sign
 * out and back in for the change to reach their session.
 */

import sql from "mssql";
import { runAsSystem, query, closeSqlPool } from "../lib/sql.js";

const args   = process.argv.slice(2);
const isDemo = args.includes("--demo");
const revoke = args.includes("--revoke");
const list   = args.includes("--list");
const email  = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase() || "";
const schema = isDemo ? "demo" : "dbo";

/**
 * List convention admins, or grant / revoke one.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const db = (await query("SELECT DB_NAME() AS name;")).recordset[0].name;
    console.log(`Database: ${db} (schema ${schema})`);

    if (list) {
        const r = await query(
            `SELECT id, firstName, lastName, email
             FROM dbo.volunteer_in
             WHERE is_convention_admin = 1
             ORDER BY lastName, firstName;`,
        );
        if (r.recordset.length === 0) console.log("No convention admins.");
        for (const v of r.recordset) {
            console.log(`  ${v.id}  ${v.firstName} ${v.lastName}  <${v.email}>`);
        }
        return;
    }

    if (!email) {
        console.error("Give an e-mail address, or --list. See the comment at the top of this file.");
        process.exitCode = 1;
        return;
    }

    const r = await query(
        `UPDATE dbo.volunteer_in
         SET is_convention_admin = @value,
             last_updated        = SYSUTCDATETIME(),
             edited_by           = 'grantConventionAdmin'
         OUTPUT inserted.id, inserted.firstName, inserted.lastName
         WHERE LOWER(email) = @email;`,
        (req) => {
            req.input("value", sql.Bit, revoke ? 0 : 1);
            req.input("email", sql.NVarChar(255), email);
        },
    );

    const v = r.recordset?.[0];
    if (!v) {
        console.error(`No account with e-mail ${email} in ${schema}.`);
        process.exitCode = 1;
        return;
    }
    console.log(`${revoke ? "Revoked" : "Granted"} convention admin: ${v.id} ${v.firstName} ${v.lastName} <${email}>`);
    console.log("They must sign out and back in for it to take effect.");
}

try {
    await runAsSystem(main, { isDemo });
} catch (err) {
    console.error("grantConventionAdmin failed:", err.message);
    process.exitCode = 1;
} finally {
    await closeSqlPool();
}
