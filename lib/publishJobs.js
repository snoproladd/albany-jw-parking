/**
 * @file lib/publishJobs.js
 * @description Runs schedule publishes in the background, one per department
 * at a time, and keeps their progress for the publish modal to poll.
 *
 * A publish (PDFs, uploads, then an email and a text per volunteer) can take
 * minutes; run inside one web request it could pass Azure's request timeout
 * (about 230 s), and a retry would send everything twice. Instead the route
 * starts a job and answers straight away with its id, and the modal polls
 * GET /api/scheduler/publish-jobs/:id until it finishes.
 *
 * The lock: while a department's publish is running, starting another one in
 * that department is refused with the running job, so a second click or a
 * second admin watches it instead of sending again.
 *
 * Jobs live in this process's memory. That fits the App Service's single
 * instance; with several instances the lock would need the database. A
 * restart loses the progress display (publish history still shows what was
 * saved). Finished jobs are forgotten after an hour.
 *
 * The job keeps the request's async context (department scope for SQL), since
 * it is started inside the request and its promise chain inherits it.
 */

import crypto from "crypto";

/** How long a finished job stays readable, in milliseconds. */
const KEEP_FINISHED_MS = 60 * 60 * 1000;

/**
 * @typedef {Object} PublishJob
 * @property {string} id
 * @property {number} departmentId
 * @property {string} startedBy        Who started it (email or name).
 * @property {string} startedAt        ISO time.
 * @property {"running"|"done"|"failed"} status
 * @property {string} message          Latest progress line, e.g. "Sending 12 of 40".
 * @property {number} done             Steps finished in the current phase.
 * @property {number} total            Steps in the current phase (0 = unknown).
 * @property {object|null} result      publishDays() result when done.
 * @property {string|null} error       Error message when failed.
 * @property {number|null} finishedAt  Epoch ms when it finished.
 */

/** @type {Map<string, PublishJob>} */
const jobs = new Map();

/** Running job id per department. @type {Map<number, string>} */
const runningByDepartment = new Map();

/**
 * Drop finished jobs older than KEEP_FINISHED_MS.
 *
 * @returns {void}
 */
function prune() {
    const cutoff = Date.now() - KEEP_FINISHED_MS;
    for (const [id, job] of jobs) {
        if (job.finishedAt && job.finishedAt < cutoff) jobs.delete(id);
    }
}

/**
 * The department's running publish, if any.
 *
 * @param {number} departmentId
 * @returns {PublishJob|null}
 */
export function getRunningPublishJob(departmentId) {
    const id = runningByDepartment.get(departmentId);
    const job = id ? jobs.get(id) : null;
    return job && job.status === "running" ? job : null;
}

/**
 * A job by id, or null when unknown or forgotten.
 *
 * @param {string} id
 * @returns {PublishJob|null}
 */
export function getPublishJob(id) {
    prune();
    return jobs.get(id) ?? null;
}

/**
 * Start a publish job for a department unless one is already running there.
 *
 * `run` receives a progress callback and must resolve with the publish
 * result (it is not awaited by the caller).
 *
 * @param {{
 *   departmentId: number,
 *   startedBy: string,
 *   run: (progress: (update: { message?: string, done?: number, total?: number }) => void) => Promise<object>,
 *   onError?: (err: unknown) => void,
 * }} opts
 * @returns {{ job: PublishJob, started: boolean }}  started false: the running job was returned instead.
 */
export function startPublishJob({ departmentId, startedBy, run, onError }) {
    prune();
    const running = getRunningPublishJob(departmentId);
    if (running) return { job: running, started: false };

    /** @type {PublishJob} */
    const job = {
        id: crypto.randomUUID(),
        departmentId,
        startedBy,
        startedAt: new Date().toISOString(),
        status: "running",
        message: "Starting…",
        done: 0,
        total: 0,
        result: null,
        error: null,
        finishedAt: null,
    };
    jobs.set(job.id, job);
    runningByDepartment.set(departmentId, job.id);

    /**
     * @param {{ message?: string, done?: number, total?: number }} update
     * @returns {void}
     */
    const progress = (update) => {
        if (typeof update.message === "string") job.message = update.message;
        if (Number.isFinite(update.done)) job.done = update.done;
        if (Number.isFinite(update.total)) job.total = update.total;
    };

    Promise.resolve()
        .then(() => run(progress))
        .then((result) => {
            job.result = result;
            job.status = "done";
            job.message = "Finished";
        })
        .catch((err) => {
            job.status = "failed";
            job.error = err instanceof Error ? err.message : String(err);
            job.message = "Failed";
            onError?.(err);
        })
        .finally(() => {
            job.finishedAt = Date.now();
            if (runningByDepartment.get(departmentId) === job.id) runningByDepartment.delete(departmentId);
        });

    return { job, started: true };
}

/**
 * The fields of a job the modal needs (no internal references).
 *
 * @param {PublishJob} job
 * @returns {object}
 */
export function publishJobView(job) {
    return {
        id: job.id,
        status: job.status,
        startedBy: job.startedBy,
        startedAt: job.startedAt,
        message: job.message,
        done: job.done,
        total: job.total,
        result: job.result,
        error: job.error,
    };
}
