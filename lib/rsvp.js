/**
 * @file rsvp.js
 * @description Rules for answering an invitation, shared by the RSVP page
 * (index.js, /invite/respond/:token) and texted answers
 * (routes/smsWebhookRoute.js):
 *
 *  - which answers an invitation offers (its campaign's response_config);
 *  - whether a first answer or a change is still allowed: a first answer is
 *    always taken (after the Respond-by date it is marked late); a change is
 *    allowed until the Respond-by date, or with none until the event day,
 *    or with no event either, always;
 *  - recording the answer, and alerting the campaign department's people
 *    who receive incoming-text alerts when a volunteer changes their answer;
 *  - an answer set by oversight for a volunteer (Invitation Tracker, Edit
 *    Volunteer), checked against the campaign's own answers.
 *
 * @module rsvp
 */

import {
    recordInvitationResponse,
    getOverseerContacts,
    getInvitationAnswerContext,
} from "./dbSync.js";
import { runAsDepartment, getRequestContext } from "./sql.js";
import { sendResetSms, sendResetEmail } from "./messaging.js";
import { conventionToday as todayInConventionZone } from "./conventionTime.js";

/**
 * @param {...*} args
 * @returns {void}
 */
function logError(...args) {
    console.error(`[${new Date().toISOString()}] [rsvp:ERROR]`, ...args);
}

/** The standard answers, in display order, with their labels. */
export const STANDARD_LABELS = { yes: "Yes", no: "No", maybe: "Maybe" };

/**
 * A campaign's answer settings.
 *
 * @typedef {Object} AnswerConfig
 * @property {'standard'|'custom'|'poll'} type
 * @property {string[]} options - Answer values ("yes", "no", "maybe" or
 *   free-text choices).
 * @property {boolean} allowOther - An "Other" answer with free text.
 * @property {string|null} question - A poll's question.
 */

/**
 * Read a campaign's response_config, falling back to Yes / No / Maybe.
 *
 * @param {string|object|null|undefined} raw
 * @returns {AnswerConfig}
 */
export function parseAnswerConfig(raw) {
    let cfg = null;
    try {
        cfg = typeof raw === "string" ? JSON.parse(raw) : raw || null;
    } catch {
        cfg = null;
    }
    const options = Array.isArray(cfg?.options) && cfg.options.length
        ? cfg.options.map(String)
        : ["yes", "no", "maybe"];
    return {
        type: cfg?.type === "custom" || cfg?.type === "poll" ? cfg.type : "standard",
        options,
        allowOther: !!cfg?.allowOther,
        question: cfg?.question || null,
    };
}

/**
 * How an answer reads to a person: "Yes", "Other: can do mornings", or a
 * custom choice as written.
 *
 * @param {string|null} response
 * @param {string|null} [other]
 * @returns {string}
 */
export function answerLabel(response, other = null) {
    if (!response) return "no answer";
    if (response === "other") return other ? `Other: ${other}` : "Other";
    return STANDARD_LABELS[response] || response;
}

/**
 * Today's date at the convention (its time zone, lib/conventionTime.js),
 * as YYYY-MM-DD.
 *
 * @param {Date} [now]
 * @returns {string}
 */
export function conventionToday(now = new Date()) {
    return todayInConventionZone(now);
}

/**
 * A DATE column (mssql returns UTC midnight) as YYYY-MM-DD, or null.
 *
 * @param {Date|string|null|undefined} value
 * @returns {string|null}
 */
export function dateOnly(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * A YYYY-MM-DD date for people, e.g. "Friday, July 3".
 *
 * @param {string|null} ymd
 * @returns {string}
 */
export function formatDay(ymd) {
    if (!ymd) return "";
    return new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
    });
}

/**
 * What a volunteer may do with an invitation right now.
 *
 * @param {{
 *   revoked?: boolean|number|null,
 *   responded_at?: Date|string|null,
 *   respond_by?: Date|string|null,
 *   convention_date?: Date|string|null,
 * }} inv
 * @param {Date} [now]
 * @returns {{
 *   answered: boolean,
 *   canAnswer: boolean,
 *   canChange: boolean,
 *   pastRespondBy: boolean,
 *   respondBy: string|null,
 *   changeUntil: string|null,
 * }} respondBy / changeUntil: YYYY-MM-DD or null.
 */
export function answerWindow(inv, now = new Date()) {
    const today = conventionToday(now);
    const respondBy = dateOnly(inv.respond_by);
    const changeUntil = respondBy || dateOnly(inv.convention_date);
    const revoked = !!inv.revoked;
    const answered = !!inv.responded_at;
    return {
        answered,
        canAnswer: !revoked && !answered,
        canChange: !revoked && answered && (!changeUntil || today <= changeUntil),
        pastRespondBy: !!respondBy && today > respondBy,
        respondBy,
        changeUntil,
    };
}

/**
 * Whether a submitted answer is one the invitation offers.
 *
 * @param {AnswerConfig} cfg
 * @param {string} response
 * @param {string|null} other - Free text, for "other".
 * @returns {boolean}
 */
export function isOfferedAnswer(cfg, response, other) {
    if (response === "other") return cfg.allowOther && !!other?.trim();
    return cfg.options.includes(response);
}

/**
 * A campaign's answers as oversight pages offer them: each answer with its
 * label, and whether "Other" (with words) is allowed.
 *
 * @param {string|object|null|undefined} raw - The campaign's response_config.
 * @returns {{ choices: Array<{ value: string, label: string }>, allowOther: boolean }}
 */
export function answerChoices(raw) {
    const cfg = parseAnswerConfig(raw);
    return {
        choices: cfg.options.map((value) => ({ value, label: answerLabel(value) })),
        allowOther: cfg.allowOther,
    };
}

/** Longest "Other" answer kept (dbo.invitations.response_other). */
const MAX_OTHER_LENGTH = 500;

/**
 * Set an invitation's answer for a volunteer who answered another way
 * (told someone, phoned, wrote) — from the Invitation Tracker or Edit
 * Volunteer. The answer must be one the campaign offers; null clears it
 * back to no answer. Recorded with source 'oversight' and kept like any
 * other change. Nobody is messaged. Runs in the caller's department, so
 * another department's invitation is not found.
 *
 * @param {{ invitationId: number, response: string|null, responseOther?: string|null }} p
 * @returns {Promise<{ ok: true, changed: boolean }
 *   | { ok: false, status: number, error: string }>}
 */
export async function setAnswerForVolunteer({ invitationId, response, responseOther = null }) {
    const inv = await getInvitationAnswerContext(invitationId);
    if (!inv) return { ok: false, status: 404, error: "Invitation not found." };
    if (inv.revoked) return { ok: false, status: 409, error: "This invitation is revoked. Reinstate it first." };

    const value = response === "" || response == null ? null : String(response);
    const other = value === "other" ? String(responseOther || "").trim().slice(0, MAX_OTHER_LENGTH) : null;
    if (value !== null && !isOfferedAnswer(parseAnswerConfig(inv.response_config), value, other)) {
        return {
            ok: false,
            status: 400,
            error: value === "other" ? "Type the answer for Other." : "That isn't one of this campaign's answers.",
        };
    }

    const result = await recordInvitationResponse({
        invitationId,
        response: value,
        responseOther: other,
        source: "oversight",
    });
    if (!result.found) return { ok: false, status: 404, error: "Invitation not found." };
    return { ok: true, changed: !!result.changed };
}

/** Most choices a texted number can pick (replies 1 to 9). */
const MAX_TEXT_CHOICES = 9;

/**
 * The answers a texted number picks, in order: reply 1 for the first, 2 for
 * the second, and so on. "Other" needs words, so it is left to the link.
 *
 * @param {AnswerConfig} cfg
 * @returns {string[]} Answer values; empty when there are too many to number.
 */
export function textReplyChoices(cfg) {
    return cfg.options.length <= MAX_TEXT_CHOICES ? cfg.options : [];
}

/**
 * The line added to the end of a texted invitation that asks for a reply:
 * "Reply 1 for Yes, 2 for No or 3 for Maybe."
 *
 * @param {AnswerConfig} cfg
 * @returns {string} "" when the answers can't be numbered.
 */
export function textReplyHint(cfg) {
    const choices = textReplyChoices(cfg).map((opt, i) => `${i + 1} for ${STANDARD_LABELS[opt] || opt}`);
    if (!choices.length) return "";
    const list = choices.length === 1
        ? choices[0]
        : `${choices.slice(0, -1).join(", ")} or ${choices[choices.length - 1]}`;
    return `Reply ${list}.`;
}

/**
 * Whether a text is short enough to be a texted answer worth looking up
 * (a number 1–9, or a few words such as "Yes" or "Mornings").
 *
 * @param {string} body
 * @returns {boolean}
 */
export function mightBeTextAnswer(body) {
    const text = String(body || "").trim();
    return text.length > 0 && text.length <= 40 && text.split(/\s+/).length <= 4;
}

/**
 * The answer a text picks from a campaign's choices: a number (1 for the
 * first choice …), or the answer itself in words ("yes", "No.", "Maybe!",
 * "mornings"), ignoring case and trailing punctuation.
 *
 * @param {{ number: number|null, words: string|null }} reply - Parsed text.
 * @param {string[]} choices - From textReplyChoices.
 * @returns {string|null} The answer value, or null when nothing matches.
 */
function pickChoice(reply, choices) {
    if (reply.number) return choices[reply.number - 1] ?? null;
    return choices.find((value) =>
        value.toLowerCase() === reply.words || answerLabel(value).toLowerCase() === reply.words,
    ) ?? null;
}

/**
 * What a texted answer does: a number, or the answer in words ("yes",
 * "no", "maybe", or a custom choice as written). It only ever applies to
 * the newest invitation texted to the person, so a reply can never land
 * on an older campaign by accident. Texting only gives a first answer;
 * changing an answer is done with the link.
 *
 * Considered: the person's invitations texted to them in the last 7 days
 * (getTextReplyInvitations), one per campaign family (the newest), that ask
 * for an answer they can give by number.
 *  - newest not yet answered → the answer is recorded ('one'); a number
 *    out of range gets 'unknown'; words that aren't one of its answers
 *    get 'none' (an ordinary message, like "ok thanks");
 *  - newest already answered → for a number or one of its answers, they
 *    are told so and given the link to change it ('answered');
 *  - none at all → the message carries on as usual ('none').
 * For 'one' and 'answered', next is the most recently texted other
 * invitation still waiting for an answer (or null), and waiting how many
 * others are waiting: the caller says so in its reply, then sends next
 * again as a follow-up so it becomes the newest, and the next number
 * answers it.
 *
 * @param {string} body - The text as received.
 * @param {Array<object>} invitations - From getTextReplyInvitations, most
 *   recently texted first.
 * @param {Date} [now]
 * @returns {{ kind: 'none' }
 *   | { kind: 'answered', invitation: object, next: object|null, waiting: number }
 *   | { kind: 'unknown', invitation: object, count: number }
 *   | { kind: 'one', invitation: object, response: string, next: object|null, waiting: number }}
 *   unknown: no answer has that number (count = how many there are).
 */
export function matchTextReply(body, invitations, now = new Date()) {
    const text = String(body || "").trim();
    const n = /^([1-9])$/.exec(text)?.[1];
    const reply = n
        ? { number: Number(n), words: null }
        : { number: null, words: text.replace(/[\s.!]+$/, "").toLowerCase() };
    if (!reply.number && !(reply.words && mightBeTextAnswer(text))) return { kind: "none" };

    // Newest invitation of each campaign family (rows arrive newest first)
    const seen = new Set();
    const usable = invitations.filter((inv) => {
        const key = inv.family_id ?? inv.batch_id ?? inv.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return textReplyChoices(parseAnswerConfig(inv.response_config)).length > 0;
    });
    if (!usable.length) return { kind: "none" };

    const [newest, ...older] = usable;
    const others = older.filter((inv) => answerWindow(inv, now).canAnswer);
    const next = others[0] || null;
    const waiting = others.length;

    const choices = textReplyChoices(parseAnswerConfig(newest.response_config));
    const response = pickChoice(reply, choices);
    // Words that aren't an answer are an ordinary message
    if (!reply.number && !response) return { kind: "none" };

    if (!answerWindow(newest, now).canAnswer) {
        return newest.responded_at ? { kind: "answered", invitation: newest, next, waiting } : { kind: "none" };
    }
    if (!response) return { kind: "unknown", invitation: newest, count: choices.length };
    return { kind: "one", invitation: newest, response, next, waiting };
}

/**
 * Messaging settings for change alerts.
 *
 * @typedef {Object} AlertSenders
 * @property {string} twilioAccountSid
 * @property {string} twilioAuthToken
 * @property {string} twilioMsgSid
 * @property {{ host: string, port: number|string, user: string, pass: string }} smtpConfig
 */

/**
 * Record an answer and, when it replaces a different answer the volunteer
 * gave, alert the campaign department's people who receive incoming-text
 * alerts (in the background; never throws for the alert).
 *
 * The caller has already checked answerWindow() and isOfferedAnswer().
 *
 * @param {{
 *   invitation: {
 *     token: string, firstName?: string, lastName?: string,
 *     batch_name?: string|null, department_id?: number|null,
 *     department_name?: string|null,
 *   },
 *   response: string,
 *   responseOther?: string|null,
 *   source: 'link'|'text',
 *   senders?: AlertSenders|null,
 * }} opts
 * @returns {Promise<import("./dbSync.js").ResponseResult>}
 */
export async function recordAnswer({ invitation, response, responseOther = null, source, senders = null }) {
    const result = await recordInvitationResponse({
        token: invitation.token,
        response,
        responseOther,
        source,
    });

    if (result.found && result.changed && senders && invitation.department_id) {
        const isDemo = getRequestContext()?.isDemo === true;
        setImmediate(() => {
            runAsDepartment(
                invitation.department_id,
                () => alertAnswerChange({ invitation, result, response, responseOther, source, senders }),
                { isDemo },
            ).catch((err) => logError("answer change alert failed:", err));
        });
    }
    return result;
}

/**
 * Text and email the department's incoming-text alert recipients that a
 * volunteer changed their answer. Runs inside the campaign's department.
 *
 * @param {{
 *   invitation: object,
 *   result: import("./dbSync.js").ResponseResult,
 *   response: string,
 *   responseOther: string|null,
 *   source: 'link'|'text',
 *   senders: AlertSenders,
 * }} p
 * @returns {Promise<void>}
 */
async function alertAnswerChange({ invitation, result, response, responseOther, source, senders }) {
    const name = [invitation.firstName, invitation.lastName].filter(Boolean).join(" ") || "A volunteer";
    const campaign = invitation.batch_name || "an invitation";
    const dept = invitation.department_name || "Convention";
    const from = answerLabel(result.previousResponse, result.previousOther);
    const to = answerLabel(response, responseOther);
    const how = source === "text" ? "by text" : "on the RSVP page";

    const smsBody = `${dept}: ${name} changed their answer for "${campaign}" from ${from} to ${to} (${how}).`;
    const emailSubject = `${name} changed their answer: ${from} → ${to}`;
    const emailBody =
        `${name} changed their answer for the campaign "${campaign}" ${how}.\n\n` +
        `Before: ${from}\nNow: ${to}\n\n` +
        `See the campaign in the Invitation Tracker.`;

    const contacts = await getOverseerContacts();
    for (const c of contacts) {
        if (c.smsCapable && c.phone) {
            await sendResetSms(c.phone, "", senders.twilioAccountSid, senders.twilioAuthToken, senders.twilioMsgSid, {
                customBody: smsBody,
            }).catch((err) => logError("change alert text error:", err));
        }
        if (c.email) {
            await sendResetEmail(c.email, "", {
                ...senders.smtpConfig,
                subject: emailSubject,
                customBody: emailBody,
            }).catch((err) => logError("change alert email error:", err));
        }
    }
}
