/**
 * @file src/config/permissions.js
 * @description Permission catalogue for multi-department phase 3.
 *
 * Every permission the app knows about, with a plain-language description
 * that admins see when building positions. Phase 3c bundles these into
 * department positions; phase 3d converts every route, view and client
 * check to these keys. Until then the old keys in src/config/roles.js stay
 * in force — this file changes no behaviour on its own.
 *
 * Design and decisions: project doc claude/phase3a-permission-catalog-draft.md.
 *
 * Fields of a catalogue entry:
 *   key            `area.action`, unique.
 *   label          Short name for lists and checkboxes.
 *   description    What it lets a person do, in plain language.
 *   category       Group heading on the Positions page (see CATEGORIES).
 *   scope          "account"      always available to every signed-in person;
 *                  "department"   granted through a department's positions;
 *                  "convention"   convention admins only, never through positions.
 *   pkg            "core" or "parking" (moves to the Parking package in phase 5).
 *   sensitive      Shown with a warning when granted.
 *   defaultVolunteer  In a department's default Volunteer position.
 *   volunteerServicesOnly  Only meaningful in the Volunteer Services department.
 *   replaces       Old permission keys / rank checks it takes over (for the audit).
 */

/**
 * Category headings, in display order.
 * @type {ReadonlyArray<{ id: string, label: string }>}
 */
export const CATEGORIES = Object.freeze([
    { id: "account",     label: "Your own account" },
    { id: "basics",      label: "Volunteer basics" },
    { id: "volunteers",  label: "Volunteers" },
    { id: "standing",    label: "Volunteer standing (flags and blacklist)" },
    { id: "notes",       label: "Intake notes and messages" },
    { id: "shifts",      label: "Shifts, locations, rendezvous and events" },
    { id: "scheduling",  label: "Scheduling" },
    { id: "alerts",      label: "Alerts and notifications" },
    { id: "campaigns",   label: "Campaigns and invitations" },
    { id: "attendance",  label: "Attendance and counts" },
    { id: "signs",       label: "Signs and maps" },
    { id: "lessons",     label: "Lessons learned" },
    { id: "admin",       label: "Department administration" },
    { id: "vs",          label: "Volunteer Services" },
    { id: "convention",  label: "Convention-wide (convention admins only)" },
]);

/**
 * Build one catalogue entry with defaults filled in.
 *
 * @param {string} key
 * @param {string} label
 * @param {string} description
 * @param {string} category
 * @param {{ scope?: "account"|"department"|"convention", pkg?: "core"|"parking",
 *           sensitive?: boolean, defaultVolunteer?: boolean,
 *           volunteerServicesOnly?: boolean, replaces?: string[] }} [opts]
 * @returns {PermissionDef}
 */
function def(key, label, description, category, opts = {}) {
    return Object.freeze({
        key,
        label,
        description,
        category,
        scope: opts.scope ?? "department",
        pkg: opts.pkg ?? "core",
        sensitive: opts.sensitive === true,
        defaultVolunteer: opts.defaultVolunteer === true,
        volunteerServicesOnly: opts.volunteerServicesOnly === true,
        replaces: Object.freeze([...(opts.replaces ?? [])]),
    });
}

/**
 * @typedef {Object} PermissionDef
 * @property {string} key
 * @property {string} label
 * @property {string} description
 * @property {string} category
 * @property {"account"|"department"|"convention"} scope
 * @property {"core"|"parking"} pkg
 * @property {boolean} sensitive
 * @property {boolean} defaultVolunteer
 * @property {boolean} volunteerServicesOnly
 * @property {ReadonlyArray<string>} replaces
 */

/**
 * The catalogue, in display order.
 * @type {ReadonlyArray<PermissionDef>}
 */
export const PERMISSION_CATALOG = Object.freeze([
    // ── Your own account ────────────────────────────────────────────────
    def("self.editProfile", "Edit own profile and password",
        "Edit your own contact, personal, congregation and spiritual details and change your password.",
        "account", { scope: "account", replaces: ["editSelf", "submitInfo"] }),

    // ── Volunteer basics (default Volunteer position) ───────────────────
    def("self.viewSchedule", "See own schedule",
        "See your own schedule in this department and your rendezvous points.",
        "basics", { defaultVolunteer: true, replaces: ["viewSchedules"] }),
    def("self.manageBlackouts", "Mark own availability",
        "Mark the times you are not available.",
        "basics", { defaultVolunteer: true }),
    def("schedules.view", "View published schedules",
        "Open this department's published schedules for any crew.",
        "basics", { defaultVolunteer: true, replaces: ["viewSchedules", "printSchedules"] }),
    def("maps.view", "View maps",
        "Open the convention maps page.",
        "basics", { pkg: "parking", defaultVolunteer: true, replaces: ["viewMaps", "printMaps"] }),
    def("signs.view", "View signs",
        "Open the sign library, the sign map and its print view.",
        "basics", { pkg: "parking", defaultVolunteer: true, replaces: ["viewSigns"] }),

    // ── Volunteers ──────────────────────────────────────────────────────
    def("volunteers.view", "Look up volunteers",
        "Look up volunteers in this department and see their details and contact information.",
        "volunteers", { replaces: ["viewVolunteerInfo"] }),
    def("volunteers.edit", "Edit volunteers",
        "Edit a volunteer's details, active status, RSVP and availability.",
        "volunteers", { replaces: ["editVolunteerInfo"] }),
    def("volunteers.markNotApproved", "Mark not approved",
        "Mark a volunteer \"not approved\" for this department for this convention year.",
        "volunteers", { replaces: ["editVolunteerInfo"] }),
    def("volunteers.create", "Create volunteer accounts",
        "Create an account for someone who hasn't registered.",
        "volunteers", { replaces: ["createVolunteerAccounts"] }),
    def("volunteers.archive", "Archive volunteers",
        "Archive and reinstate volunteer accounts.",
        "volunteers", { replaces: ["deleteVolunteer"] }),
    def("volunteers.sendSignInLinks", "Send sign-in links",
        "Send password-reset and welcome links, and manage magic sign-in links.",
        "volunteers", { replaces: ["accessAdminConsole"] }),
    def("volunteers.viewReports", "Volunteer reports",
        "See the application status and demographics reports.",
        "volunteers", { replaces: ["createAssignments", "viewAttendance"] }),
    def("volunteers.exportData", "Export volunteer data",
        "Print or export volunteers' personal data.",
        "volunteers", { sensitive: true, replaces: ["printUserData"] }),

    // ── Volunteer standing ──────────────────────────────────────────────
    def("standing.flag", "Flag a volunteer",
        "Flag a volunteer with a private reason. Volunteer Services and convention oversight are alerted.",
        "standing", { sensitive: true }),
    def("standing.viewDepartmentFlags", "See department flags",
        "See that a volunteer in this department is flagged or blacklisted, and the reasons this department's oversight wrote.",
        "standing", { sensitive: true }),

    // ── Intake notes and messages ───────────────────────────────────────
    def("notes.view", "Read notes",
        "Read intake notes and texted messages in the Notes Report.",
        "notes", { replaces: ["viewVolunteerInfo"] }),
    def("notes.act", "Act on notes",
        "Mark notes read, dismiss and restore them, create and close follow-up actions, and resolve text messages.",
        "notes", { replaces: ["viewVolunteerInfo"] }),
    def("notes.analyze", "Analyze one person's notes",
        "Run the AI analysis on one person's notes.",
        "notes", { replaces: ["viewVolunteerInfo", "editVolunteerInfo"] }),
    def("notes.analyzeAll", "Analyze all notes",
        "Run the AI analysis on every note at once.",
        "notes", { replaces: ["deleteVolunteer", "ASSISTANT_ADMIN+"] }),
    def("sms.manageOptOuts", "Manage text opt-outs",
        "See and change who has opted out of texts.",
        "notes", { replaces: ["deleteVolunteer"] }),

    // ── Shifts, locations, rendezvous and events ────────────────────────
    def("shifts.manage", "Manage shifts",
        "Create and edit this department's shifts within the convention days, and how many people each needs.",
        "shifts", { replaces: ["manageShifts"] }),
    def("locations.manage", "Manage locations",
        "Create and edit locations, tasks and sub-locations.",
        "shifts", { replaces: ["manageShifts"] }),
    def("rendezvous.manage", "Manage rendezvous points",
        "Create and edit rendezvous points and their photos, and apply them to shifts.",
        "shifts", { replaces: ["editRendezvous", "manageShifts"] }),
    def("events.manage", "Manage department events",
        "Create and edit this department's own events, such as training and meetings.",
        "shifts", { replaces: ["manageShifts"] }),

    // ── Scheduling ──────────────────────────────────────────────────────
    def("scheduler.use", "Use the scheduler",
        "Place volunteers in shifts, and use the conflict grid and volunteer schedules.",
        "scheduling", { replaces: ["createAssignments"] }),
    def("scheduler.analyze", "Analyze schedules",
        "Run schedule analysis and review violations.",
        "scheduling", { replaces: ["createAssignments"] }),
    def("scheduler.manageRules", "Schedule analysis rules",
        "Change the schedule analysis rules.",
        "scheduling", { replaces: ["deleteVolunteer"] }),
    def("scheduler.publish", "Publish schedules",
        "Publish schedules and see publish history and recipients.",
        "scheduling", { replaces: ["accessAdminConsole"] }),
    def("schedules.sendToVolunteer", "Send a volunteer their schedule",
        "Send a volunteer their schedule by text or email.",
        "scheduling", { replaces: ["viewSchedules"] }),
    def("crews.assign", "Assign crews",
        "Assign volunteers to crews in the crew matrix.",
        "scheduling", { replaces: ["createAssignments"] }),
    def("crews.viewRestricted", "Restricted crews",
        "See and schedule volunteers in restricted crews.",
        "scheduling", { replaces: ["OVERSEER+"] }),
    def("crews.manageRestricted", "Manage restricted crews",
        "Choose which crews are restricted and who may see them.",
        "scheduling", { replaces: ["manageScheduleSensitivity"] }),
    def("shifts.lead", "Lead shifts",
        "Can be placed in a shift's Keyman or Keyman Assistant slot.",
        "scheduling", { replaces: ["KEYMAN+"] }),
    def("constraints.review", "Review scheduling constraints",
        "Review and apply volunteers' scheduling constraints.",
        "scheduling", { replaces: ["editVolunteerInfo"] }),

    // ── Alerts and notifications ────────────────────────────────────────
    def("alerts.manageShiftAlerts", "Manage shift alerts",
        "Set up shift reminder texts and see the send log.",
        "alerts", { replaces: ["accessAdminConsole"] }),
    def("alerts.manageCapacityAlerts", "Manage capacity alerts",
        "Set up garage capacity alerts, the kill switch and the alert log.",
        "alerts", { pkg: "parking", replaces: ["accessAdminConsole"] }),
    def("alerts.receiveCapacityAlerts", "Receive capacity alerts",
        "Receive capacity alert texts.",
        "alerts", { pkg: "parking", replaces: ["capacity alert minimum role"] }),
    def("alerts.receivePublishNotices", "Receive publish notices",
        "Get a copy when schedules are published.",
        "alerts", { replaces: ["OVERSEER+", "ASSISTANT_ADMIN+"] }),
    def("alerts.receiveVolunteerTexts", "Receive volunteer text alerts",
        "Be texted when a volunteer's message needs oversight attention.",
        "alerts", { replaces: ["OVERSEER+"] }),

    // ── Campaigns and invitations ───────────────────────────────────────
    def("campaigns.send", "Send department campaigns",
        "Create department campaigns and templates, send invitations (including to department events) and use the campaign tracker.",
        "campaigns", { replaces: ["accessAdminConsole", "createCampaign", "sendMessages"] }),
    def("campaigns.edit", "Edit department campaigns",
        "Edit an existing department campaign's settings.",
        "campaigns", { replaces: ["manageCampaigns"] }),

    // ── Attendance and counts ───────────────────────────────────────────
    def("attendance.checkIn", "Check volunteers in",
        "Check volunteers in and out for their shifts.",
        "attendance", { replaces: ["logAttendance"] }),
    def("attendance.viewReports", "Attendance reports",
        "See attendance, day and staffing reports.",
        "attendance", { replaces: ["viewAttendance"] }),
    def("counts.log", "Record counts",
        "Record vehicle counts.",
        "attendance", { pkg: "parking", replaces: ["logParkingCount"] }),
    def("counts.viewReport", "Count report",
        "See the count report.",
        "attendance", { pkg: "parking", replaces: ["viewAttendance"] }),
    def("counts.manageLocations", "Manage count locations",
        "Delete a count location's data.",
        "attendance", { pkg: "parking", replaces: ["accessAdminConsole"] }),

    // ── Signs and maps ──────────────────────────────────────────────────
    def("signs.manage", "Manage signs",
        "Build signs and place, move and photograph them.",
        "signs", { pkg: "parking", replaces: ["manageSigns"] }),
    def("signs.publishMap", "Publish the sign map",
        "Publish the sign placement map PDF.",
        "signs", { pkg: "parking", replaces: ["manageSigns"] }),
    def("maps.sync", "Sync maps",
        "Re-sync the convention maps from SharePoint.",
        "signs", { pkg: "parking", replaces: ["accessAdminConsole", "uploadMaps"] }),

    // ── Lessons learned ─────────────────────────────────────────────────
    def("lessons.submit", "Submit lessons",
        "Submit lessons learned and see your own submissions.",
        "lessons", { replaces: ["KEYMAN+"] }),
    def("lessons.viewAll", "See all lessons",
        "See every lesson in the department, not just your own.",
        "lessons", { replaces: ["OVERSEER+"] }),
    def("lessons.review", "Review lessons",
        "Approve, un-approve, flag, archive and delete lessons.",
        "lessons", { replaces: ["editVolunteerInfo", "OVERSEER+"] }),
    def("lessons.publish", "Publish lessons",
        "Publish lessons and the yearly report PDF.",
        "lessons", { replaces: ["editVolunteerInfo", "ASSISTANT_ADMIN+"] }),

    // ── Department administration ───────────────────────────────────────
    def("positions.assign", "Assign positions",
        "Give people positions in this department (only positions whose permissions you hold yourself).",
        "admin", { replaces: ["accessAdminConsole", "manageRoles", "canAssignRole", "canGrantExtraPerms"] }),
    def("positions.manage", "Manage positions",
        "Create and edit this department's positions and what they allow, including the default Volunteer position.",
        "admin", { replaces: ["manageRoles"] }),
    def("structure.manage", "Edit reporting structure",
        "Edit the department's reporting structure.",
        "admin", { replaces: ["manageCampaigns"] }),
    def("decently.run", "Run Decently",
        "Export to and import from Decently for this department.",
        "admin", { replaces: ["accessAdminConsole"] }),
    def("systemVariables.manage", "Edit department lists",
        "Edit the department's lists (system variables).",
        "admin", { replaces: ["accessAdminConsole", "manageShifts"] }),
    def("bugReports.manage", "Bug reports",
        "See and resolve bug reports.",
        "admin", { replaces: ["accessAdminConsole"] }),

    // ── Volunteer Services ──────────────────────────────────────────────
    def("departments.runDecentlyForAll", "Run Decently for any department",
        "Run Decently for any department and add approved people to it.",
        "vs", { volunteerServicesOnly: true, replaces: ["canManageAllDepartments"] }),
    def("departments.viewAllPeople", "See everyone's departments",
        "See every volunteer and the departments they serve in (People & Departments).",
        "vs", { volunteerServicesOnly: true, replaces: ["canManageAllDepartments"] }),
    def("departments.sendCampaigns", "Volunteer Services campaigns",
        "Send recruitment campaigns for any department or to all volunteers.",
        "vs", { volunteerServicesOnly: true }),
    def("departments.manageStanding", "Manage volunteer standing",
        "Receive flag alerts, see every flag reason, set and clear flags, and blacklist or lift a blacklist.",
        "vs", { volunteerServicesOnly: true, sensitive: true }),

    // ── Convention-wide (convention admins only) ────────────────────────
    def("convention.manageDays", "Manage convention days",
        "Create and edit the convention days, their program sessions and event types, which every department shares.",
        "convention", { scope: "convention", replaces: ["manageShifts", "accessAdminConsole"] }),
    def("convention.manageEvents", "Manage convention events",
        "Create and edit convention-wide events, such as all-department training.",
        "convention", { scope: "convention" }),
    def("convention.sendCampaigns", "Convention campaigns",
        "Send convention-wide campaigns and announcements to everyone.",
        "convention", { scope: "convention" }),
    def("convention.manageStanding", "Manage volunteer standing (convention)",
        "Receive flag alerts, see every flag reason, set and clear flags, and blacklist or lift a blacklist.",
        "convention", { scope: "convention", sensitive: true }),
    def("convention.startYear", "Start the next convention year",
        "Close the convention year and start the next.",
        "convention", { scope: "convention", replaces: ["canStartConventionYear"] }),
    def("convention.manageAdmins", "Manage convention admins",
        "Grant and revoke convention admin.",
        "convention", { scope: "convention", replaces: ["grantConventionAdmin.js"] }),
    def("convention.testSms", "Send test texts",
        "Send test text messages.",
        "convention", { scope: "convention", replaces: ["ADMIN"] }),
]);

/**
 * Catalogue entries by key.
 * @type {ReadonlyMap<string, PermissionDef>}
 */
const BY_KEY = new Map(PERMISSION_CATALOG.map((p) => [p.key, p]));

if (BY_KEY.size !== PERMISSION_CATALOG.length) {
    throw new Error("permissions.js: duplicate permission key in PERMISSION_CATALOG");
}
for (const p of PERMISSION_CATALOG) {
    if (!CATEGORIES.some((c) => c.id === p.category)) {
        throw new Error(`permissions.js: unknown category "${p.category}" on ${p.key}`);
    }
}

/**
 * Where each old permission key (src/config/roles.js) went. Used by the
 * route audit to show the new keys next to each old check, and as a guide
 * for phase 3d. Not used to build positions (3c maps roles explicitly, so
 * nobody gains access the old key never gave them).
 *
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
export const LEGACY_PERMISSION_MAP = Object.freeze({
    accessAdminConsole: ["alerts.manageCapacityAlerts", "maps.sync", "positions.assign", "volunteers.sendSignInLinks",
        "convention.manageDays", "campaigns.send", "alerts.manageShiftAlerts", "scheduler.publish",
        "bugReports.manage", "systemVariables.manage", "decently.run", "departments.viewAllPeople",
        "departments.runDecentlyForAll", "counts.manageLocations"],
    manageShifts: ["shifts.manage", "locations.manage", "convention.manageDays", "rendezvous.manage",
        "events.manage", "systemVariables.manage"],
    createAssignments: ["scheduler.use", "scheduler.analyze", "crews.assign", "volunteers.viewReports"],
    editVolunteerInfo: ["volunteers.edit", "volunteers.markNotApproved", "lessons.review", "lessons.publish",
        "constraints.review", "notes.analyze"],
    manageSigns: ["signs.manage", "signs.publishMap"],
    viewVolunteerInfo: ["volunteers.view", "notes.view", "notes.act", "notes.analyze"],
    viewAttendance: ["attendance.viewReports", "counts.viewReport", "volunteers.viewReports"],
    deleteVolunteer: ["volunteers.archive", "notes.analyzeAll", "sms.manageOptOuts", "scheduler.manageRules"],
    logParkingCount: ["counts.log"],
    viewSchedules: ["schedules.view", "self.viewSchedule", "schedules.sendToVolunteer"],
    viewSigns: ["signs.view"],
    editRendezvous: ["rendezvous.manage"],
    manageCampaigns: ["campaigns.edit", "structure.manage"],
    manageScheduleSensitivity: ["crews.manageRestricted"],
    logAttendance: ["attendance.checkIn"],
    createVolunteerAccounts: ["volunteers.create"],
    viewMaps: ["maps.view"],
    manageRoles: ["positions.manage", "positions.assign"],
    submitInfo: ["self.editProfile"],
    editSelf: ["self.editProfile"],
    printMaps: ["maps.view"],
    printSchedules: ["schedules.view"],
    uploadMaps: ["maps.sync"],
    sendMessages: ["campaigns.send"],
    createCampaign: ["campaigns.send"],
    printUserData: ["volunteers.exportData"],
});

for (const [oldKey, keys] of Object.entries(LEGACY_PERMISSION_MAP)) {
    for (const k of keys) {
        if (!BY_KEY.has(k)) {
            throw new Error(`permissions.js: LEGACY_PERMISSION_MAP.${oldKey} names unknown key "${k}"`);
        }
    }
}

/**
 * The catalogue entry for a key, or undefined.
 *
 * @param {string} key
 * @returns {PermissionDef|undefined}
 */
export function getPermission(key) {
    return BY_KEY.get(key);
}

/**
 * True when `key` is in the catalogue.
 *
 * @param {string} key
 * @returns {boolean}
 */
export function isKnownPermission(key) {
    return BY_KEY.has(key);
}

/**
 * Catalogue entries in one category, in display order.
 *
 * @param {string} categoryId
 * @returns {PermissionDef[]}
 */
export function permissionsInCategory(categoryId) {
    return PERMISSION_CATALOG.filter((p) => p.category === categoryId);
}

/**
 * Keys of the default Volunteer position (department-editable later).
 *
 * @returns {string[]}
 */
export function defaultVolunteerPermissions() {
    return PERMISSION_CATALOG.filter((p) => p.defaultVolunteer).map((p) => p.key);
}

/**
 * Keys that can be granted through department positions (scope "department").
 *
 * @returns {string[]}
 */
export function grantablePermissions() {
    return PERMISSION_CATALOG.filter((p) => p.scope === "department").map((p) => p.key);
}
