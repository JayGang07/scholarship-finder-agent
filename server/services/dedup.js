/**
 * Deduplication service — prevents re-sending the same scholarship every week.
 * Only new listings or approaching deadlines re-appear in the digest.
 */

const db = require('../db');

/**
 * Deduplicate scholarships against the existing tracker.
 *
 * Logic:
 * - If never seen → include (new)
 * - If seen + last_sent within 7 days + deadline > 30 days → skip
 * - If seen + deadline ≤ 30 days → re-include with urgency flag
 * - If deadline passed → mark as "Deadline Passed", exclude
 *
 * Returns { toInclude: [...], skipped: number }
 */
function dedup(scholarships) {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Mark any expired deadlines first
  db.markDeadlinesPassed();

  const existing = db.getAllScholarships();
  const existingMap = new Map(
    existing.map((s) => [`${normalize(s.name)}|${normalize(s.provider)}`, s])
  );

  const toInclude = [];
  let skipped = 0;

  for (const s of scholarships) {
    const key = `${normalize(s.name)}|${normalize(s.provider)}`;
    const prev = existingMap.get(key);

    // Check if deadline has passed
    const deadlineDate = parseDate(s.deadline);
    if (deadlineDate && deadlineDate < now) {
      s.status = 'Deadline Passed';
      skipped++;
      continue;
    }

    if (!prev) {
      // Never seen — include as new
      s._isNew = true;
      toInclude.push(s);
      continue;
    }

    // Already seen — check recency + urgency
    const lastSent = prev.last_sent ? new Date(prev.last_sent) : null;
    const recentlySent = lastSent && lastSent > sevenDaysAgo;
    const deadlineApproaching = deadlineDate && deadlineDate <= thirtyDaysFromNow;

    if (recentlySent && !deadlineApproaching) {
      // Sent recently and deadline isn't close — skip
      skipped++;
      continue;
    }

    if (deadlineApproaching) {
      s._isUrgent = true;
    }

    toInclude.push(s);
  }

  return { toInclude, skipped };
}

function normalize(str) {
  return (str || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

module.exports = { dedup };
