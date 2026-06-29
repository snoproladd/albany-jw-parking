/**
 * @file routes/lessonsLearnedRoutes.js
 * @description Routes for the Lessons Learned feature.
 *
 * Lessons Learned allows KEYMAN+ volunteers to submit observations from a
 * convention year.  OVERSEER+ can approve and publish entries.  Publishing
 * a lesson triggers PDF generation of all published lessons for that year
 * and uploads the report to Azure Blob Storage and SharePoint / OneDrive.
 *
 * Page routes:
 *   GET  /oversight/tools/lessons-learned          Main page (KEYMAN+)
 *   GET  /internal/pdf/lessons-learned             Puppeteer render (secret auth)
 *
 * API routes (all return JSON):
 *   GET    /api/lessons-learned                    List (filterable by status/year)
 *   POST   /api/lessons-learned                    Create
 *   PUT    /api/lessons-learned/:id                Update notes/dept/comments
 *   POST   /api/lessons-learned/:id/approve        Set status → approved
 *   POST   /api/lessons-learned/:id/publish        Set status → published + PDF
 *   POST   /api/lessons-learned/:id/photos         Upload photo attachment
 *   DELETE /api/lessons-learned/:id/photos/:pid    Delete photo attachment
 *   GET    /api/lessons-learned/photos/:blobName   Proxy photo blob
 *   GET    /api/lessons-learned/report/:year       Get published report metadata
 *
 * @module routes/lessonsLearnedRoutes
 */

import express from 'express';
import multer  from 'multer';
import {
    requirePermission,
    ROLE_HIERARCHY,
} from '../src/config/roles.js';
import {
    getLessonsLearnedYears,
    getLessonsLearnedDepartments,
    getLessonsLearned,
    getLessonById,
    getLessonPhotos,
    createLesson,
    updateLesson,
    setLessonStatus,
    addLessonPhotoRecord,
    deleteLessonPhotoRecord,
    upsertLessonsLearnedReport,
    getLessonsLearnedReport,
    setLessonArchived,
} from '../lib/dbSync.js';
import {
    uploadLessonPhoto,
    streamLessonPhotoToResponse,
    deleteLessonPhotoBlob,
    downloadLessonPhoto,
    streamPublishedFileToResponse,
} from '../lib/blobStorage.js';
import {
    LL_PDF_SECRET,
    publishLessonsLearnedPdf,
} from '../lib/publishLessonsLearned.js';

/** Minimum role index that can view and submit lessons. */
const KEYMAN_LEVEL = ROLE_HIERARCHY.indexOf('KEYMAN');

/** Minimum role index that can approve and publish lessons. */
const OVERSEER_LEVEL = ROLE_HIERARCHY.indexOf('OVERSEER');

/**
 * Multer config for lesson photo uploads: in-memory, 20 MB cap, images only.
 *
 * @type {import('multer').Multer}
 */
const lessonPhotoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        cb(null, /^image\//.test(file.mimetype || ''));
    },
});

/**
 * Creates and returns the lessons-learned Express router.
 *
 * @param {{
 *   csrfProtection: import('express').RequestHandler,
 *   logError:       (...args: any[]) => void,
 *   serverPort:     number,
 *   graphConfig: {
 *     tenantId:     string,
 *     clientId:     string,
 *     clientSecret: string,
 *     driveUser:    string,
 *     folderPath:   string,
 *   },
 * }} opts
 * @returns {import('express').Router}
 */
export function lessonsLearnedRouter({ csrfProtection, logError, serverPort, graphConfig }) {
    const router = express.Router();

    // ─────────────────────────────────────────────
    //  Helpers
    // ─────────────────────────────────────────────

    /**
     * Require an authenticated session; return 401 JSON if not present.
     *
     * @param {import('express').Request}  req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} next
     */
    function requireAuth(req, res, next) {
        if (!req.session.userId) {
            return res.status(401).json({ success: false, message: 'Not authenticated.' });
        }
        next();
    }

    /**
     * Return true if the session user is at least OVERSEER level.
     *
     * @param {import('express').Request} req
     * @returns {boolean}
     */
    function isOverseer(req) {
        return ROLE_HIERARCHY.indexOf(req.session.userRole || '') >= OVERSEER_LEVEL;
    }

    /**
     * Return true if the session user is at least KEYMAN level.
     *
     * @param {import('express').Request} req
     * @returns {boolean}
     */
    function isKeyman(req) {
        return ROLE_HIERARCHY.indexOf(req.session.userRole || '') >= KEYMAN_LEVEL;
    }

    /**
     * Return true if the user can edit the given lesson:
     *   – The submitting volunteer (any status)
     *   – Any OVERSEER+ volunteer
     *
     * @param {import('express').Request} req
     * @param {{ submitted_by: number }} lesson
     * @returns {boolean}
     */
    function canEdit(req, lesson) {
        return isOverseer(req) || Number(req.session.userId) === lesson.submitted_by;
    }

    // ─────────────────────────────────────────────
    //  Page route
    // ─────────────────────────────────────────────

    /**
     * GET /oversight/tools/lessons-learned
     * Renders the lessons-learned management page for KEYMAN+ users.
     */
    router.get(
        '/oversight/tools/lessons-learned',
        requireAuth,
        (req, res, next) => {
            if (!isKeyman(req)) {
                return res.status(403).render('errors/403', {
                    nav: res.locals.nav,
                    userRole: req.session.userRole,
                });
            }
            next();
        },
        csrfProtection,
        (req, res) => {
            return res.render('lessonsLearned', {
                csrfToken:  req.csrfToken(),
                userRole:   req.session.userRole || '',
                userId:     req.session.userId   || null,
                isOverseer: isOverseer(req),
            });
        },
    );

    // ─────────────────────────────────────────────
    //  Internal PDF render route (Puppeteer only)
    // ─────────────────────────────────────────────

    /**
     * GET /internal/pdf/lessons-learned
     * Renders a print-optimized HTML page of all published lessons for a year.
     * Authenticated via ?secret= query param only — no session required.
     * This route is intentionally unauthenticated; the secret is the credential.
     */
    router.get('/internal/pdf/lessons-learned', async (req, res) => {
        if (!req.query.secret || req.query.secret !== LL_PDF_SECRET) {
            return res.status(403).end();
        }
        const year = Number(req.query.year);
        if (!year) return res.status(400).end();

        try {
            const lessons = await getLessonsLearned({ year, status: 'published' });

            // Attach photos to each lesson, downloading each blob as a base64
            // data URI so Puppeteer can render them without an authenticated session.
            await Promise.all(
                lessons.map(async (lesson) => {
                    const photos = await getLessonPhotos(lesson.id);
                    lesson.photos = await Promise.all(
                        photos.map(async (p) => {
                            try {
                                const buf = await downloadLessonPhoto(p.blob_name);
                                return {
                                    ...p,
                                    dataUri: `data:image/jpeg;base64,${buf.toString('base64')}`,
                                };
                            } catch {
                                // If a single photo fails, skip it rather than aborting the PDF
                                return { ...p, dataUri: null };
                            }
                        }),
                    );
                }),
            );

            return res.render('lessonsLearnedPdf', { year, lessons });
        } catch (err) {
            (logError || console.error)('[internal/pdf/lessons-learned]', err);
            return res.status(500).end();
        }
    });

    // ─────────────────────────────────────────────
    //  API — list
    // ─────────────────────────────────────────────

    /**
     * GET /api/lessons-learned
     * Returns lessons filtered by status group and optional year.
     *
     * Query params:
     *   tab    'proposed' | 'accepted'   (maps to status filter)
     *   year   number (optional)
     */
    router.get(
        '/api/lessons-learned',
        requireAuth,
        (req, res, next) => {
            if (!isKeyman(req)) return res.status(403).json({ success: false });
            next();
        },
        async (req, res) => {
            try {
                const tab  = req.query.tab;
                const year = req.query.year ? Number(req.query.year) : null;
                let status = null;
                let archivedOnly = false;

                if (tab === 'archived') {
                    archivedOnly = true;
                } else if (tab === 'published') {
                    status = 'published';
                } else if (tab === 'accepted') {
                    status = 'approved';
                } else {
                    // proposed (default)
                    status = 'submitted';
                }

                const lessons = await getLessonsLearned({ year, status, archivedOnly });
                return res.json({ success: true, lessons });
            } catch (err) {
                logError('[GET /api/lessons-learned]', err);
                return res.status(500).json({ success: false });
            }
        },
    );

    // ─────────────────────────────────────────────
    //  API — metadata helpers
    // ─────────────────────────────────────────────

    /**
     * GET /api/lessons-learned/years
     * Returns distinct convention years for the year filter/selector.
     */
    router.get(
        '/api/lessons-learned/years',
        requireAuth,
        async (req, res) => {
            try {
                const years = await getLessonsLearnedYears();
                return res.json({ success: true, years });
            } catch (err) {
                logError('[GET /api/lessons-learned/years]', err);
                return res.status(500).json({ success: false });
            }
        },
    );

    /**
     * GET /api/lessons-learned/departments
     * Returns active lesson-department entries from system_variable_lists.
     */
    router.get(
        '/api/lessons-learned/departments',
        requireAuth,
        async (req, res) => {
            try {
                const departments = await getLessonsLearnedDepartments();
                return res.json({ success: true, departments });
            } catch (err) {
                logError('[GET /api/lessons-learned/departments]', err);
                return res.status(500).json({ success: false });
            }
        },
    );

    // ─────────────────────────────────────────────
    //  API — report metadata
    // ─────────────────────────────────────────────

    /**
     * GET /api/lessons-learned/report/:year
     * Returns published report metadata for the given year, or null if none.
     */
    router.get(
        '/api/lessons-learned/report/:year',
        requireAuth,
        async (req, res) => {
            try {
                const year   = Number(req.params.year);
                const report = await getLessonsLearnedReport(year);
                return res.json({ success: true, report: report || null });
            } catch (err) {
                logError('[GET /api/lessons-learned/report/:year]', err);
                return res.status(500).json({ success: false });
            }
        },
    );

    // ─────────────────────────────────────────────
    //  API — photo proxy
    // ─────────────────────────────────────────────

    /**
     * GET /api/lessons-learned/photos/:blobName
     * Streams a lesson photo from blob storage to the client.
     * Requires authentication; access is not further scoped (KEYMAN+ can view all).
     */
    router.get(
        '/api/lessons-learned/photos/:blobName',
        requireAuth,
        async (req, res) => {
            try {
                await streamLessonPhotoToResponse(req.params.blobName, res);
            } catch (err) {
                logError('[GET /api/lessons-learned/photos/:blobName]', err);
                if (!res.headersSent) return res.status(404).end();
            }
        },
    );

    /**
     * GET /api/lessons-learned/:id/photos
     * Returns all photo records for a lesson.
     */
    router.get(
        '/api/lessons-learned/:id/photos',
        requireAuth,
        async (req, res) => {
            try {
                const photos = await getLessonPhotos(Number(req.params.id));
                return res.json({ success: true, photos });
            } catch (err) {
                logError('[GET /api/lessons-learned/:id/photos]', err);
                return res.status(500).json({ success: false });
            }
        },
    );

    // ─────────────────────────────────────────────
    //  API — create
    // ─────────────────────────────────────────────

    /**
     * POST /api/lessons-learned
     * Create a new lesson. Body: { year, departmentId?, departmentOther?, notes }.
     */
    router.post(
        '/api/lessons-learned',
        requireAuth,
        csrfProtection,
        (req, res, next) => {
            if (!isKeyman(req)) return res.status(403).json({ success: false });
            next();
        },
        async (req, res) => {
            try {
                const { year, departmentId, departmentOther, notes } = req.body;
                if (!year || !notes?.trim()) {
                    return res.status(400).json({ success: false, message: 'year and notes are required.' });
                }
                const id = await createLesson({
                    year:            Number(year),
                    departmentId:    departmentId ? Number(departmentId) : null,
                    departmentOther: departmentOther?.trim() || null,
                    notes:           notes.trim(),
                    submittedBy:     req.session.userId,
                });
                const lesson = await getLessonById(id);
                return res.status(201).json({ success: true, lesson });
            } catch (err) {
                logError('[POST /api/lessons-learned]', err);
                return res.status(500).json({ success: false });
            }
        },
    );

    // ─────────────────────────────────────────────
    //  API — update
    // ─────────────────────────────────────────────

    /**
     * PUT /api/lessons-learned/:id
     * Update lesson fields. Submitter or OVERSEER+ only.
     * Body: { year?, departmentId?, departmentOther?, notes?, overseerComments? }
     */
    router.put(
        '/api/lessons-learned/:id',
        requireAuth,
        csrfProtection,
        async (req, res) => {
            try {
                const id     = Number(req.params.id);
                const lesson = await getLessonById(id);
                if (!lesson) return res.status(404).json({ success: false });
                if (!canEdit(req, lesson)) return res.status(403).json({ success: false });

                const { year, departmentId, departmentOther, notes, overseerComments } = req.body;

                // Non-overseers cannot change overseerComments
                const commentsUpdate = isOverseer(req) ? (overseerComments ?? lesson.overseer_comments) : lesson.overseer_comments;

                await updateLesson(id, {
                    year:             year            ? Number(year) : lesson.year,
                    departmentId:     departmentId !== undefined ? (departmentId ? Number(departmentId) : null) : lesson.department_id,
                    departmentOther:  departmentOther !== undefined ? (departmentOther?.trim() || null) : lesson.department_other,
                    notes:            notes?.trim()   || lesson.notes,
                    overseerComments: commentsUpdate  ?? null,
                });
                const updated = await getLessonById(id);
                return res.json({ success: true, lesson: updated });
            } catch (err) {
                logError('[PUT /api/lessons-learned/:id]', err);
                return res.status(500).json({ success: false });
            }
        },
    );

    // ─────────────────────────────────────────────
    //  API — approve
    // ─────────────────────────────────────────────

    /**
     * POST /api/lessons-learned/:id/approve
     * Move lesson to 'approved'. OVERSEER+ only.
     */
    router.post(
        '/api/lessons-learned/:id/approve',
        requireAuth,
        csrfProtection,
        requirePermission('editVolunteerInfo'),
        async (req, res) => {
            try {
                const id     = Number(req.params.id);
                const lesson = await getLessonById(id);
                if (!lesson) return res.status(404).json({ success: false });
                if (lesson.status === 'published') {
                    return res.status(409).json({ success: false, message: 'Lesson is already published.' });
                }
                await setLessonStatus(id, 'approved', req.session.userId);
                const updated = await getLessonById(id);
                return res.json({ success: true, lesson: updated });
            } catch (err) {
                logError('[POST /api/lessons-learned/:id/approve]', err);
                return res.status(500).json({ success: false });
            }
        },
    );

    // ─────────────────────────────────────────────
    //  API — publish
    // ─────────────────────────────────────────────

    /**
     * POST /api/lessons-learned/:id/publish
     * Mark lesson as published, then regenerate the year's PDF report.
     * OVERSEER+ only. May take several seconds (Puppeteer PDF generation).
     */
    router.post(
        '/api/lessons-learned/:id/publish',
        requireAuth,
        csrfProtection,
        requirePermission('editVolunteerInfo'),
        async (req, res) => {
            try {
                const id     = Number(req.params.id);
                const lesson = await getLessonById(id);
                if (!lesson) return res.status(404).json({ success: false });
                if (lesson.status === 'published') {
                    return res.status(409).json({ success: false, message: 'Already published.' });
                }

                // Mark published first so it appears in the PDF
                await setLessonStatus(id, 'published', req.session.userId);

                // Generate + upload PDF (non-fatal if it fails)
                let reportMeta = null;
                try {
                    const { blobName, shareUrl } = await publishLessonsLearnedPdf({
                        year: lesson.year,
                        serverPort,
                        graphConfig,
                    });
                    await upsertLessonsLearnedReport(lesson.year, blobName, shareUrl, req.session.userId);
                    reportMeta = { blobName, shareUrl };
                } catch (pdfErr) {
                    (logError || console.error)('[publish PDF]', pdfErr);
                }

                const updated = await getLessonById(id);
                return res.json({ success: true, lesson: updated, report: reportMeta });
            } catch (err) {
                logError('[POST /api/lessons-learned/:id/publish]', err);
                return res.status(500).json({ success: false });
            }
        },
    );

    // ─────────────────────────────────────────────
    //  API — photo upload
    // ─────────────────────────────────────────────

    /**
     * POST /api/lessons-learned/:id/photos
     * Upload a single photo attachment for a lesson.
     * Submitter or OVERSEER+ only.  Multipart field name: "photo".
     */
    router.post(
        '/api/lessons-learned/:id/photos',
        requireAuth,
        lessonPhotoUpload.single('photo'),
        async (req, res) => {
            try {
                const id     = Number(req.params.id);
                const lesson = await getLessonById(id);
                if (!lesson) return res.status(404).json({ success: false });
                if (!canEdit(req, lesson)) return res.status(403).json({ success: false });
                if (!req.file) return res.status(400).json({ success: false, message: 'No image file provided.' });

                const blobName = await uploadLessonPhoto(id, req.file.buffer);
                const photoId  = await addLessonPhotoRecord(
                    id,
                    blobName,
                    req.file.originalname || 'photo.jpg',
                    req.session.userId,
                );
                return res.status(201).json({ success: true, photo: { id: photoId, blobName, originalFilename: req.file.originalname } });
            } catch (err) {
                logError('[POST /api/lessons-learned/:id/photos]', err);
                return res.status(500).json({ success: false });
            }
        },
    );

    // ─────────────────────────────────────────────
    //  API — photo delete
    // ─────────────────────────────────────────────

    /**
     * DELETE /api/lessons-learned/:id/photos/:pid
     * Delete a photo attachment. Submitter or OVERSEER+ only.
     */
    router.delete(
        '/api/lessons-learned/:id/photos/:pid',
        requireAuth,
        csrfProtection,
        async (req, res) => {
            try {
                const id     = Number(req.params.id);
                const photoId = Number(req.params.pid);
                const lesson  = await getLessonById(id);
                if (!lesson) return res.status(404).json({ success: false });
                if (!canEdit(req, lesson)) return res.status(403).json({ success: false });

                const photos = await getLessonPhotos(id);
                const photo  = photos.find((p) => p.id === photoId);
                if (!photo) return res.status(404).json({ success: false });

                // Delete blob first (non-fatal), then DB record
                try { await deleteLessonPhotoBlob(photo.blob_name); } catch { /* ok */ }
                await deleteLessonPhotoRecord(photoId);
                return res.json({ success: true });
            } catch (err) {
                logError('[DELETE /api/lessons-learned/:id/photos/:pid]', err);
                return res.status(500).json({ success: false });
            }
        },
    );

    // ─────────────────────────────────────────────
    //  API — archive / unarchive
    // ─────────────────────────────────────────────

    /**
     * POST /api/lessons-learned/:id/archive
     * Mark a lesson as archived. OVERSEER+ only.
     * The lesson's current status (submitted/approved/published) is preserved.
     */
    router.post(
        '/api/lessons-learned/:id/archive',
        requireAuth,
        csrfProtection,
        requirePermission('editVolunteerInfo'),
        async (req, res) => {
            try {
                const id     = Number(req.params.id);
                const lesson = await getLessonById(id);
                if (!lesson) return res.status(404).json({ success: false });
                if (lesson.archived) return res.status(409).json({ success: false, message: 'Already archived.' });
                if (lesson.status === 'published') return res.status(409).json({ success: false, message: 'Published lessons cannot be archived.' });
                await setLessonArchived(id, true, req.session.userId);
                const updated = await getLessonById(id);
                return res.json({ success: true, lesson: updated });
            } catch (err) {
                logError('[POST /api/lessons-learned/:id/archive]', err);
                return res.status(500).json({ success: false });
            }
        },
    );

    /**
     * POST /api/lessons-learned/:id/unarchive
     * Remove a lesson from the archive. OVERSEER+ only.
     */
    router.post(
        '/api/lessons-learned/:id/unarchive',
        requireAuth,
        csrfProtection,
        requirePermission('editVolunteerInfo'),
        async (req, res) => {
            try {
                const id     = Number(req.params.id);
                const lesson = await getLessonById(id);
                if (!lesson) return res.status(404).json({ success: false });
                if (!lesson.archived) return res.status(409).json({ success: false, message: 'Not archived.' });
                await setLessonArchived(id, false, req.session.userId);
                const updated = await getLessonById(id);
                return res.json({ success: true, lesson: updated });
            } catch (err) {
                logError('[POST /api/lessons-learned/:id/unarchive]', err);
                return res.status(500).json({ success: false });
            }
        },
    );

    // ─────────────────────────────────────────────
    //  Resources page — published PDF (OVERSEER+)
    // ─────────────────────────────────────────────

    /**
     * GET /lessons-learned
     * Public-facing resources page showing the consolidated published PDF.
     * Requires OVERSEER+ (editVolunteerInfo).
     */
    router.get(
        '/lessons-learned',
        requireAuth,
        requirePermission('editVolunteerInfo'),
        csrfProtection,
        async (req, res) => {
            try {
                const years  = await getLessonsLearnedYears();
                const year   = Number(req.query.year) || (years[0]?.year ?? new Date().getFullYear());
                const report = await getLessonsLearnedReport(year);
                return res.render('lessonsLearnedResources', {
                    csrfToken:  req.csrfToken(),
                    userRole:   req.session.userRole || '',
                    isAdmin:    isOverseer(req) && req.session.userRole !== 'OVERSEER',
                    year,
                    years:      years.map((r) => r.year),
                    report:     report || null,
                    nav:        res.locals.nav,
                });
            } catch (err) {
                logError('[GET /lessons-learned]', err);
                return res.status(500).send('Error loading Lessons Learned resources.');
            }
        },
    );

    // ─────────────────────────────────────────────
    //  API — PDF proxy
    // ─────────────────────────────────────────────

    /**
     * GET /lessons-learned/pdf/:blobName
     * Proxy route to stream a lessons-learned report PDF from Azure Blob Storage.
     * Requires OVERSEER+ so the PDF stays gated.
     *
     * @param {string} req.params.blobName  Blob name returned by publishLessonsLearnedPdf.
     */
    router.get(
        '/lessons-learned/pdf/:blobName',
        requireAuth,
        requirePermission('editVolunteerInfo'),
        async (req, res) => {
            try {
                const { blobName } = req.params;
                res.setHeader(
                    'Content-Disposition',
                    `inline; filename="lessons-learned-${blobName.replace(/[^a-z0-9._-]/gi, '_')}.pdf"`,
                );
                await streamPublishedFileToResponse(blobName, res);
            } catch (err) {
                logError('[GET /lessons-learned/pdf/:blobName]', err);
                if (!res.headersSent) res.status(404).send('Report not found.');
            }
        },
    );

    // ─────────────────────────────────────────────
    //  API — batch publish
    // ─────────────────────────────────────────────

    /**
     * POST /api/lessons-learned/batch-publish
     * Explicitly regenerate the consolidated PDF for a given year from all
     * currently-published lessons. Uploads to Blob + SharePoint and upserts
     * the lessons_learned_reports row.
     *
     * No lesson status changes — only re-renders the PDF.
     *
     * @param {{ year?: number }} req.body
     * @returns {{ success: boolean, report?: { blobName: string, shareUrl: string, lessonCount: number } }}
     */
    router.post(
        '/api/lessons-learned/batch-publish',
        requireAuth,
        csrfProtection,
        requirePermission('editVolunteerInfo'),
        async (req, res) => {
            try {
                const year    = Number(req.body.year) || new Date().getFullYear();
                const lessons = await getLessonsLearned({ year, status: 'published' });

                if (!lessons.length) {
                    return res.status(400).json({
                        success: false,
                        message: `No published lessons found for ${year}.`,
                    });
                }

                const { blobName, shareUrl } = await publishLessonsLearnedPdf({
                    year,
                    serverPort,
                    graphConfig,
                });

                await upsertLessonsLearnedReport(year, blobName, shareUrl, req.session.userId);

                return res.json({
                    success:  true,
                    report:   { blobName, shareUrl, lessonCount: lessons.length },
                });
            } catch (err) {
                logError('[POST /api/lessons-learned/batch-publish]', err);
                return res.status(500).json({ success: false, message: 'PDF generation failed.' });
            }
        },
    );

    return router;
}
