const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/profile — return current profile
router.get('/', (req, res) => {
  const profile = db.getProfile();
  if (!profile) return res.json({ exists: false, profile: null });
  res.json({ exists: true, profile });
});

// POST /api/profile — save/update profile
router.post('/', (req, res) => {
  const { fieldAndLevel, targetCountries, cgpa, fundingType } = req.body;

  // Validate all 4 fields present
  if (!fieldAndLevel || !targetCountries || !cgpa || !fundingType) {
    return res.status(400).json({
      error: 'All 4 fields are required: fieldAndLevel, targetCountries, cgpa, fundingType',
    });
  }

  const profile = db.upsertProfile({ fieldAndLevel, targetCountries, cgpa, fundingType });
  res.json({ success: true, profile });
});

module.exports = router;
