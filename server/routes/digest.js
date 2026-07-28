const express = require('express');
const router = express.Router();
const db = require('../db');
const { composeDigest } = require('../services/digest');
const { sendDigest } = require('../services/mailer');

// GET /api/digest/preview — generate and return digest HTML without sending
router.get('/preview', (req, res) => {
  const profile = db.getProfile();
  if (!profile) {
    return res.status(400).json({ error: 'Profile not set up yet' });
  }

  const scholarships = db.getAllScholarships({ status: 'Active' });
  const html = composeDigest(scholarships, profile);
  res.type('html').send(html);
});

// POST /api/digest/send — generate and send the digest email
router.post('/send', async (req, res) => {
  const profile = db.getProfile();
  if (!profile) {
    return res.status(400).json({ error: 'Profile not set up yet' });
  }

  const scholarships = db.getAllScholarships({ status: 'Active' });
  const html = composeDigest(scholarships, profile);

  const recipient = process.env.RECIPIENT_EMAIL || process.env.SMTP_USER || 'demo@example.com';

  const result = await sendDigest(recipient, html);

  // Mark all included scholarships as sent
  if (result.sent) {
    db.markSent(scholarships.map((s) => s.id));
  }

  res.json(result);
});

module.exports = router;
