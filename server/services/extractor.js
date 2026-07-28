/**
 * AI-powered structured data extractor.
 * Sends cleaned page text to an OpenAI-compatible endpoint and returns
 * typed scholarship records. Falls back to an empty array on failure.
 */

const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

const EXTRACTION_PROMPT = `You are a scholarship data extraction assistant. Extract all scholarship listings from the following text. Return a JSON array of objects with these exact fields:

- name (string): scholarship name
- provider (string): organization offering it
- country (string): country where you study
- degreeLevel (string): e.g. "Master's", "PhD", "Bachelor's"
- field (string): eligible fields of study
- fundingType (string): "Full tuition", "Partial tuition", "Living stipend", or "Other"
- amount (string): funding amount/details
- deadline (string): application deadline in YYYY-MM-DD format if possible, otherwise as stated
- requiredDocuments (string): comma-separated list of required documents
- eligibilityText (string): full eligibility criteria as stated
- applicationLink (string): direct application URL if found in the text

If you cannot find a value, use an empty string. If no scholarships are found, return an empty array.
Return ONLY the JSON array, no markdown formatting, no explanation.`;

/**
 * Extract scholarship records from page text using AI.
 * Returns an array of scholarship objects.
 */
async function extractScholarships(pageContent, sourceMetadata) {
  if (!AI_API_KEY) {
    console.warn('[Extractor] No AI_API_KEY set — skipping AI extraction');
    return [];
  }

  try {
    const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: EXTRACTION_PROMPT },
          {
            role: 'user',
            content: `Source: ${sourceMetadata.provider} (${sourceMetadata.country})\nURL: ${sourceMetadata.url}\n\n---\n\n${pageContent}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      console.warn(`[Extractor] AI API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '[]';

    // Parse JSON — handle potential markdown code fences
    const cleaned = text.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();
    const scholarships = JSON.parse(cleaned);

    if (!Array.isArray(scholarships)) return [];

    // Attach source metadata
    return scholarships.map((s) => ({
      ...s,
      country: s.country || sourceMetadata.country,
      provider: s.provider || sourceMetadata.provider,
      sourceUrl: sourceMetadata.url,
    }));
  } catch (err) {
    console.warn(`[Extractor] Extraction failed: ${err.message}`);
    return [];
  }
}

module.exports = { extractScholarships };
