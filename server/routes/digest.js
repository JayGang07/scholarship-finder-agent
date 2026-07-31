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
  if (scholarships.length === 0) {
    return res.type('html').send(`
      <!DOCTYPE html><html><head><meta charset="utf-8"></head>
      <body style="margin:0;padding:40px 20px;background:#0f172a;font-family:system-ui,sans-serif;text-align:center;">
        <div style="max-width:500px;margin:0 auto;">
          <div style="font-size:3rem;margin-bottom:16px;">📭</div>
          <h2 style="color:#94a3b8;margin:0 0 12px;">Your first digest appears after the next run</h2>
          <p style="color:#64748b;font-size:14px;">Click "Run Now" on the Dashboard to trigger your first scholarship scan, or wait for the scheduled daily run.</p>
        </div>
      </body></html>
    `);
  }

  const html = composeDigest(scholarships, profile);
  res.type('html').send(html);
});

// GET /api/digest/last — return the last generated digest HTML
router.get('/last', (req, res) => {
  const lastDigest = db.getLastDigest();
  if (!lastDigest) {
    return res.json({ exists: false, html: null });
  }
  res.json({
    exists: true,
    html: lastDigest.html,
    createdAt: lastDigest.created_at,
    scholarshipCount: lastDigest.scholarship_count,
    sentTo: lastDigest.sent_to,
  });
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

  // Store the digest log
  db.saveDigestLog(html, scholarships.length, recipient);

  // Mark all included scholarships as sent
  if (result.sent) {
    db.markSent(scholarships.map((s) => s.id));
  }

  res.json(result);
});

module.exports = router;
