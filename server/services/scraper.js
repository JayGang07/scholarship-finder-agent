/**
 * Scraper service — fetches curated scholarship source pages via HTTP.
 * Strips navigation/footer/ads before returning content for AI extraction.
 * Handles timeouts, HTTP errors, and network failures gracefully (skip, don't crash).
 */

const TIMEOUT_MS = 10_000;

/**
 * Fetch a single source URL and return cleaned text content.
 * Returns null on failure (caller skips this source).
 */
async function fetchSource(source) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'ScholarshipFinder/1.0 (Educational Research Tool)',
        'Accept': 'text/html,application/xhtml+xml,text/plain',
      },
    });

    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[Scraper] HTTP ${res.status} for ${source.url}`);
      return null;
    }

    const html = await res.text();
    return {
      ...source,
      rawContent: stripBoilerplate(html),
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn(`[Scraper] Failed to fetch ${source.url}: ${err.message}`);
    return null;
  }
}

/**
 * Fetch all sources, returning only the successful ones.
 */
async function fetchAllSources(sources) {
  const results = await Promise.allSettled(
    sources.map((s) => fetchSource(s))
  );

  const successes = [];
  const failures = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value) {
      successes.push(r.value);
    } else {
      failures.push(sources[i].url);
    }
  }

  if (failures.length) {
    console.warn(`[Scraper] Skipped ${failures.length} sources: ${failures.join(', ')}`);
  }

  return { successes, failures };
}

/**
 * Strip HTML boilerplate (nav, footer, aside, script, style, comments)
 * and collapse whitespace. Rule 7 compliance — trim before prompting AI.
 */
function stripBoilerplate(html) {
  let text = html
    // Remove script/style/noscript blocks entirely
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    // Remove nav, footer, aside, header (boilerplate)
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, '')
    // Remove all remaining tags but keep text
    .replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();

  // Truncate to ~6000 chars — keeps AI prompt manageable
  if (text.length > 6000) {
    text = text.slice(0, 6000) + '\n[...truncated]';
  }

  return text;
}

module.exports = { fetchSource, fetchAllSources, stripBoilerplate };
