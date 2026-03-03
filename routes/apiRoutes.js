// routes/apiRoutes.js
import express from 'express';
import * as db from '../lib/dbSync.js';

const router = express.Router();

/**
 * Quick existence check used by the frontend to pre-block duplicate emails.
 *
 * Mounted as: app.use('/api', router)
 * So this route is available at: GET /api/volunteers/exists?email=...
 *
 * Returns: { exists: true|false }
 */
router.get('/volunteers/exists', async (req, res, next) => {
  try {
    const email = String(req.query?.email ?? '').trim();
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    // Optional domain block: keep consistent with frontend behavior
    if (email.toLowerCase().endsWith('@jwpub.org')) {
      // We treat this as "not taken" here; the domain is blocked elsewhere
      return res.status(200).json({ exists: false });
    }

    const exists = await db.emailExists(email);
    return res.json({ exists });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/volunteers
 *
 * This is a JSON-based API wrapper around your draft insert logic.
 * It is separate from the HTML form flow (/submit-emailPass, /submit-nonProfileInfo),
 * but can be useful for future SPA/AJAX flows.
 *
 * Body (when disableNameFields=true):
 *   { email, password }
 *
 * Body (when disableNameFields=false):
 *   { firstName, lastName, suffix?, phone, email }
 *
 * Returns:
 *   201 + row JSON on success
 *   400 for bad input
 *   409 if user already registered (duplicate)
 */
router.post('/volunteers', async (req, res, next) => {
  try {
    const disableNameFields = req.query.disableNameFields === 'true';

    const email     = String(req.body?.email ?? '').trim();
    const password  = String(req.body?.password ?? '').trim();
    const firstName = String(req.body?.firstName ?? '').trim();
    const lastName  = String(req.body?.lastName ?? '').trim();
    const suffix    = String(req.body?.suffix ?? '').trim();
    const phone     = String(req.body?.phone ?? '').trim();

    // Validate required fields
    if (disableNameFields && (!email || !password)) {
      return res
        .status(400)
        .json({ error: 'Email and password are required.' });
    }

    if (
      !disableNameFields &&
      (!firstName || !lastName || !phone || !email)
    ) {
      return res.status(400).json({
        error: 'First name, last name, phone, and email are required.',
      });
    }

    let row;
    if (disableNameFields) {
      row = await db.insertDraftEmailPass(email, password);
    } else {
      row = await db.insertDraftNameEmail(firstName, lastName, suffix, email);
    }

    // Your insert* functions are designed to return null when a duplicate
    // or invalid state is encountered, so treat that as a 409 conflict.
    if (!row) {
      return res.status(409).json({ error: 'User already registered.' });
    }

    return res.status(201).json(row);
  } catch (err) {
    // Handle SQL unique constraint violations (2627, 2601)
    if (err?.number === 2627 || err?.number === 2601) {
      return res.status(409).json({ error: 'User already registered.' });
    }
    return next(err);
  }
});

/**
 * Congregation dropdown autocomplete
 *
 * Mounted as: app.use('/api', router)
 * So this route is available at: GET /api/congregations
 */
router.get('/congregations', async (req, res) => {
  try {
    const congregations = await db.getCongregations();
    res.json(congregations);
  } catch (error) {
    console.error('Error fetching congregations:', error);
    res
      .status(500)
      .json({ error: 'Failed to load congregations' });
  }
});

export default router;