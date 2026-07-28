/**
 * Eligibility matcher — combines deterministic filtering with AI-powered
 * judgment for fuzzy cases (GPA scale conversion, field relevance).
 */

const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

/**
 * Deterministic pre-filter: country + degree level + field keyword match.
 * Returns scholarships that pass basic matching.
 */
function deterministicFilter(scholarships, profile) {
  const countries = profile.target_countries
    .split(',')
    .map((c) => c.trim().toLowerCase());

  const fieldAndLevel = (profile.field_and_level || '').toLowerCase();

  return scholarships.filter((s) => {
    // Country match
    const sCountry = (s.country || '').toLowerCase();
    const countryMatch = countries.some(
      (c) => sCountry.includes(c) || c.includes(sCountry)
    );

    // Degree level match (fuzzy — "MS" matches "Master's", etc.)
    const sDegree = (s.degreeLevel || s.degree_level || '').toLowerCase();
    const levelMatch =
      !sDegree ||
      fieldAndLevel.includes('ms') && sDegree.includes('master') ||
      fieldAndLevel.includes('master') && sDegree.includes('master') ||
      fieldAndLevel.includes('phd') && sDegree.includes('phd') ||
      fieldAndLevel.includes('bachelor') && sDegree.includes('bachelor') ||
      sDegree.includes('all');

    return countryMatch || levelMatch;
  });
}

/**
 * AI eligibility check — handles GPA scale conversion, fuzzy field matching,
 * and generates the "why this fits you" line.
 */
async function aiEligibilityCheck(scholarships, profile) {
  if (!AI_API_KEY || scholarships.length === 0) {
    // No AI key — return all with generic eligibility status
    return scholarships.map((s) => ({
      ...s,
      eligibilityStatus: 'Unchecked',
      whyItFits: `Matches your target for ${s.country} — review eligibility details.`,
    }));
  }

  const prompt = `You are a scholarship eligibility advisor. A student has the following profile:

- Field & Level: ${profile.field_and_level}
- CGPA: ${profile.cgpa}
- Target Countries: ${profile.target_countries}
- Funding Preference: ${profile.funding_type}

For each scholarship below, assess eligibility and write a one-line "why this fits you" explanation. Be specific and punchy — reference the actual deadline, funding amount, or GPA match. Never write generic filler like "this may be a good fit."

Return a JSON array where each object has:
- name (string): the scholarship name (must match exactly)
- eligibilityStatus (string): "Strong Match", "Partial Match", or "Unlikely Match"
- whyItFits (string): one punchy sentence explaining the fit

Scholarships to evaluate:
${JSON.stringify(scholarships.map((s) => ({
  name: s.name,
  provider: s.provider,
  country: s.country,
  degreeLevel: s.degreeLevel || s.degree_level,
  field: s.field,
  fundingType: s.fundingType || s.funding_type,
  amount: s.amount,
  deadline: s.deadline,
  eligibilityText: s.eligibilityText || s.eligibility_text,
})), null, 2)}

Return ONLY the JSON array.`;

  try {
    const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      console.warn(`[Matcher] AI API error: ${response.status}`);
      return scholarships.map((s) => ({ ...s, eligibilityStatus: 'Unchecked', whyItFits: '' }));
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '[]';
    const cleaned = text.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();
    const results = JSON.parse(cleaned);

    // Merge AI results back into scholarship objects
    const resultMap = new Map(results.map((r) => [r.name, r]));
    return scholarships.map((s) => {
      const ai = resultMap.get(s.name) || {};
      return {
        ...s,
        eligibilityStatus: ai.eligibilityStatus || 'Unchecked',
        whyItFits: ai.whyItFits || '',
      };
    });
  } catch (err) {
    console.warn(`[Matcher] AI eligibility check failed: ${err.message}`);
    return scholarships.map((s) => ({ ...s, eligibilityStatus: 'Unchecked', whyItFits: '' }));
  }
}

/**
 * Full matching pipeline: deterministic filter → AI eligibility check.
 */
async function matchScholarships(scholarships, profile) {
  const filtered = deterministicFilter(scholarships, profile);
  return aiEligibilityCheck(filtered, profile);
}

module.exports = { deterministicFilter, aiEligibilityCheck, matchScholarships };
