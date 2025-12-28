
// routes/volunteers.js
import express from 'express';
import * as db from '../lib/dbSync.js';
const router = express.Router();

/**
 * Quick existence check used by the frontend to pre-block duplicate emails.
 * GET /api/volunteers/exists?email=...
 * Returns: { exists: true|false }
 */
router.get('/volunteers/exists', async (req, res, next) => {
  try {
    const email = String(req.query?.email ?? '').trim();
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    // Optional domain block: keep consistent with your frontend
    if (email.toLowerCase().endsWith('@jwpub.org')) {
      return res.status(200).json({ exists: false }); // we block later anyway
    }

    const exists = await db.emailExists(email);
    return res.json({ exists });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/volunteers
 * Body: { email, password }
 * Returns 201 inserted row or 409 if already exists.
 */

router.post('/volunteers', async (req, res, next) => {
  try {
    const disableNameFields = req.query.disableNameFields === 'true'; // or from session
    const email = String(req.body?.email ?? '').trim();
    const password = String(req.body?.password ?? '').trim();
    const firstName = String(req.body?.firstName ?? '').trim();
    const lastName = String(req.body?.lastName ?? '').trim();
    const suffix = String(req.body?.suffix ?? '').trim();
    const phone = String(req.body?.phone ?? '').trim();

    // ✅ Validate required fields
    if (disableNameFields && (!email || !password)) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    if (!disableNameFields && (!firstName || !lastName || !phone || !email)) {
      return res.status(400).json({ error: 'First name, last name, phone, and email are required.' });
    }

    let row;
    if (disableNameFields) {
      row = await db.insertEmailPass(email, password);
    } else {
      row = await db.insertNameEmail(firstName, lastName, suffix, email);
    }

    if (!row) {
      return res.status(409).json({ error: 'User already registered.' });
    }

    return res.status(201).json(row);
  } catch (err) {
    if (err?.number === 2627 || err?.number === 2601) {
      return res.status(409).json({ error: 'User already registered.' });
    }
    next(err);
  }
});



export default router;

