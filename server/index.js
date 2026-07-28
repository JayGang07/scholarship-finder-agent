const express = require('express');
const path = require('path');
const cron = require('node-cron');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- API Routes ---
app.use('/api/profile', require('./routes/profile'));
app.use('/api/scholarships', require('./routes/scholarships'));
app.use('/api/digest', require('./routes/digest'));
app.use('/api/trigger', require('./routes/trigger'));

// --- Health check ---
app.get('/api/health', (req, res) => {
  const profile = db.getProfile();
  const stats = db.getScholarshipStats();
  res.json({
    status: 'ok',
    profileConfigured: !!profile,
    scholarships: stats,
    aiConfigured: !!process.env.AI_API_KEY,
    smtpConfigured: !!process.env.SMTP_HOST && !!process.env.SMTP_USER,
  });
});

// --- SPA fallback ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// --- Start ---
async function start() {
  // Initialize DB (async for sql.js WASM loading)
  await db.initDb();

  // Cron scheduler
  const cronSchedule = process.env.CRON_SCHEDULE || '0 9 * * *';
  if (cron.validate(cronSchedule)) {
    cron.schedule(cronSchedule, async () => {
      console.log(`\n[Cron] Scheduled cycle running at ${new Date().toISOString()}`);
      const { runCycle } = require('./routes/trigger');
      const result = await runCycle();
      console.log('[Cron] Cycle complete:', JSON.stringify(result, null, 2));
    });
    console.log(`[Cron] Scheduled: "${cronSchedule}"`);
  } else {
    console.warn(`[Cron] Invalid schedule "${cronSchedule}" — scheduler disabled`);
  }

  // Start server
  app.listen(PORT, () => {
    const profile = db.getProfile();
    console.log(`\n🎓 Scholarship Finder Agent`);
    console.log(`   Server:  http://localhost:${PORT}`);
    console.log(`   Profile: ${profile ? '✓ configured' : '✗ needs setup'}`);
    console.log(`   AI:      ${process.env.AI_API_KEY ? '✓ configured' : '✗ not set (seed data will be used)'}`);
    console.log(`   SMTP:    ${process.env.SMTP_HOST ? '✓ configured' : '✗ not set (digests logged to console)'}`);
    console.log('');
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
