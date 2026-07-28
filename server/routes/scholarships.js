const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/scholarships — list all tracked scholarships
router.get('/', (req, res) => {
  const { country, status } = req.query;
  const scholarships = db.getAllScholarships({ country, status });
  res.json({ scholarships, count: scholarships.length });
});

// GET /api/scholarships/stats — dashboard summary
router.get('/stats', (req, res) => {
  const stats = db.getScholarshipStats();
  res.json(stats);
});

module.exports = router;
