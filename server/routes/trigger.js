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
    let relevantSources = sourcesData.filter((s) =>
      targetCountries.some((c) => s.country.toLowerCase().includes(c) || c.includes(s.country.toLowerCase()))
    );
    
    // Fallback: if no specific sources match (e.g. user selected "Other"), scan ALL sources
    if (relevantSources.length === 0) {
      console.log('[Trigger] No specific sources matched target countries, defaulting to all sources');
      relevantSources = sourcesData;
    }

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
        gpaFit: s.gpa_fit,
        confidence: s.confidence,
        documentsChecklist: s.documents_checklist,
      }));
    }

    stats.newFound = allExtracted.length;

    // 4. Dedup against existing tracker (DO THIS FIRST to save AI tokens)
    const { toInclude, skipped } = dedup(allExtracted);
    stats.skipped = skipped;

    // 5. Match against profile (eligibility check) ONLY for the new/urgent ones
    const matched = await matchScholarships(toInclude, profile);
    stats.matched = matched.length;

    // 6. Store results (Publish Gate — data written to persistent store)
    for (const s of matched) {
      db.upsertScholarship({
        ...s,
        status: s.status || 'Active',
        newSinceLastDigest: s._isNew ? 'Y' : 'N',
      });
    }

    // 7. Compose and send digest (ALWAYS SEND, even if 0 results)
    const html = composeDigest(matched, profile);
    const recipient = process.env.RECIPIENT_EMAIL || process.env.SMTP_USER || '';

    // Store digest log regardless of send status
    db.saveDigestLog(html, matched.length, recipient || 'console');

    if (recipient) {
      await sendDigest(recipient, html);
      if (matched.length > 0) {
        db.markSent(matched.map((s) => {
          // Find the ID from the DB after upsert
          const row = db.queryOne('SELECT id FROM scholarships WHERE name = ? AND provider = ?', [s.name, s.provider]);
          return row ? row.id : null;
        }).filter(Boolean));
      }
    }

    stats.errorDetails = errorList.join('; ');
    db.updateRunLog(runId, stats);

    return { success: true, runId, ...stats, digestSent: true };
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
