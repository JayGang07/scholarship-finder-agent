const express = require('express');
const router = express.Router();
const path = require('path');
const db = require('../db');
const { fetchAllSources } = require('../services/scraper');
const { extractScholarships } = require('../services/extractor');
const { matchScholarships } = require('../services/matcher');
const { dedup } = require('../services/dedup');
const { composeDigest } = require('../services/digest');
const { sendDigest } = require('../services/mailer');

const sourcesData = require(path.join(__dirname, '..', 'data', 'sources.json'));

/**
 * Run a full scraping cycle: fetch → extract → match → dedup → store → digest → email.
 * Exposed as POST /api/trigger and also called by the cron scheduler.
 */
async function runCycle() {
  const profile = db.getProfile();
  if (!profile) {
    return { success: false, error: 'Profile not configured — complete setup first' };
  }

  const runId = db.createRunLog();
  const stats = { sourcesChecked: 0, newFound: 0, matched: 0, skipped: 0, errors: 0, errorDetails: '' };
  const errorList = [];

  try {
    // 1. Filter sources by user's target countries
    const targetCountries = profile.target_countries.split(',').map((c) => c.trim().toLowerCase());
    const relevantSources = sourcesData.filter((s) =>
      targetCountries.some((c) => s.country.toLowerCase().includes(c) || c.includes(s.country.toLowerCase()))
    );

    // 2. Fetch all relevant sources
    const { successes, failures } = await fetchAllSources(relevantSources);
    stats.sourcesChecked = relevantSources.length;
    stats.errors = failures.length;
    if (failures.length) errorList.push(`Failed to fetch: ${failures.join(', ')}`);

    // 3. Extract scholarships from each successful fetch
    let allExtracted = [];
    for (const source of successes) {
      try {
        const extracted = await extractScholarships(source.rawContent, source);
        allExtracted = allExtracted.concat(extracted);
      } catch (err) {
        errorList.push(`Extraction error for ${source.url}: ${err.message}`);
        stats.errors++;
      }
    }

    // If no AI key, use seed data that's already in the DB for matching
    if (allExtracted.length === 0) {
      console.log('[Trigger] No new extractions — running eligibility check on existing data');
      const existing = db.getAllScholarships({ status: 'Active' });
      allExtracted = existing.map((s) => ({
        name: s.name,
        provider: s.provider,
        country: s.country,
        degreeLevel: s.degree_level,
        field: s.field,
        fundingType: s.funding_type,
        amount: s.amount,
        deadline: s.deadline,
        requiredDocuments: s.required_documents,
        eligibilityText: s.eligibility_text,
        applicationLink: s.application_link,
        sourceUrl: s.source_url,
      }));
    }

    stats.newFound = allExtracted.length;

    // 4. Match against profile
    const matched = await matchScholarships(allExtracted, profile);
    stats.matched = matched.length;

    // 5. Dedup against existing tracker
    const { toInclude, skipped } = dedup(matched);
    stats.skipped = skipped;

    // 6. Store results
    for (const s of toInclude) {
      db.upsertScholarship({
        ...s,
        status: s.status || 'Active',
      });
    }

    // 7. Compose and send digest
    if (toInclude.length > 0) {
      const html = composeDigest(toInclude, profile);
      const recipient = process.env.RECIPIENT_EMAIL || process.env.SMTP_USER || '';
      if (recipient) {
        await sendDigest(recipient, html);
        db.markSent(toInclude.map((s) => {
          // Find the ID from the DB after upsert
          const row = db.getDb().prepare('SELECT id FROM scholarships WHERE name = ? AND provider = ?')
            .get(s.name, s.provider);
          return row ? row.id : null;
        }).filter(Boolean));
      }
    }

    stats.errorDetails = errorList.join('; ');
    db.updateRunLog(runId, stats);

    return { success: true, runId, ...stats, digestSent: toInclude.length > 0 };
  } catch (err) {
    stats.errorDetails = err.message;
    stats.errors++;
    db.updateRunLog(runId, stats);
    return { success: false, runId, error: err.message, ...stats };
  }
}

// POST /api/trigger — manually trigger a full cycle
router.post('/', async (req, res) => {
  console.log('[Trigger] Manual cycle triggered');
  const result = await runCycle();
  res.json(result);
});

module.exports = router;
module.exports.runCycle = runCycle;
