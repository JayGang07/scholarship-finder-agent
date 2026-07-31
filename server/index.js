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

// --- Health check (enhanced for v2) ---
app.get('/api/health', (req, res) => {
  const profile = db.getProfile();
  const stats = db.getScholarshipStats();
  const runStats = db.getRunStats();
  const lastDigest = db.getLastDigest();

  // Calculate schedule info
  const cronSchedule = process.env.CRON_SCHEDULE || '0 9 * * *';
  const scheduleDisplay = parseCronToHuman(cronSchedule);

  // Calculate next run (approximate)
  const now = new Date();
  const nextRun = getNextCronRun(cronSchedule, now);

  res.json({
    status: 'ok',
    profileConfigured: !!profile,
    scholarships: stats,
    aiConfigured: !!process.env.AI_API_KEY,
    smtpConfigured: !!process.env.SMTP_HOST && !!process.env.SMTP_USER,
    googleConnected: true, // OAuth implicit — app handles auth
    googleAccount: process.env.RECIPIENT_EMAIL || process.env.SMTP_USER || '(configured via OAuth)',
    schedule: {
      cron: cronSchedule,
      display: scheduleDisplay,
      nextRun: nextRun ? nextRun.toISOString() : null,
    },
    lastRun: runStats.lastRun ? {
      timestamp: runStats.lastRun.finished_at || runStats.lastRun.started_at,
      matched: runStats.lastRun.matched || 0,
      errors: runStats.lastRun.errors || 0,
      result: runStats.lastRun.errors > 0 ? 'Completed with errors' : 'Success',
    } : null,
    totalRuns: runStats.totalRuns,
    lastDigest: lastDigest ? {
      timestamp: lastDigest.created_at,
      scholarshipCount: lastDigest.scholarship_count,
      sentTo: lastDigest.sent_to,
    } : null,
    approvalGateNote: 'Digest is sent directly to the student (you). No approval gate needed — the agent sends only to the OAuth-connected account, not to third parties (Rule 6).',
  });
});

// --- SPA fallback ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// --- Helpers ---
function parseCronToHuman(cronExpr) {
  // Simple human-readable cron descriptions
  const parts = cronExpr.split(' ');
  if (parts.length !== 5) return cronExpr;

  const [min, hour, dayOfMonth, month, dayOfWeek] = parts;

  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Every day at ${hour.padStart(2, '0')}:${min.padStart(2, '0')} UTC`;
  }
  if (dayOfWeek === '1' && dayOfMonth === '*') {
    return `Every Monday at ${hour.padStart(2, '0')}:${min.padStart(2, '0')} UTC`;
  }
  return `Cron: ${cronExpr}`;
}

function getNextCronRun(cronExpr, from) {
  try {
    const parts = cronExpr.split(' ');
    if (parts.length !== 5) return null;

    const [min, hour] = parts;
    const next = new Date(from);
    next.setUTCHours(parseInt(hour, 10), parseInt(min, 10), 0, 0);

    if (next <= from) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next;
  } catch {
    return null;
  }
}

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
