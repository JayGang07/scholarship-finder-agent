/**
 * Digest composer — builds a formatted HTML email from matched scholarships.
 * Groups by country, then by deadline urgency.
 */

/**
 * Compose a digest HTML string from an array of matched scholarships.
 * If no scholarships, returns a "nothing new" message.
 */
function composeDigest(scholarships, profile) {
  if (!scholarships || scholarships.length === 0) {
    return wrapEmail(`
      <div style="text-align:center;padding:40px 20px;">
        <h2 style="color:#94a3b8;margin:0 0 12px;">Nothing new this week</h2>
        <p style="color:#64748b;font-size:15px;margin:0;">
          Your scholarship agent ran its weekly check and found no new matches or approaching deadlines.
          We'll keep looking — sit tight!
        </p>
      </div>
    `);
  }

  // Group by country
  const groups = {};
  for (const s of scholarships) {
    const country = s.country || 'Other';
    if (!groups[country]) groups[country] = [];
    groups[country].push(s);
  }

  // Sort each group: urgent first, then by deadline
  for (const country of Object.keys(groups)) {
    groups[country].sort((a, b) => {
      if (a._isUrgent && !b._isUrgent) return -1;
      if (!a._isUrgent && b._isUrgent) return 1;
      return (a.deadline || '').localeCompare(b.deadline || '');
    });
  }

  let body = `
    <p style="color:#cbd5e1;font-size:15px;margin:0 0 24px;">
      Hi! Your Scholarship Finder found <strong style="color:#818cf8;">${scholarships.length}</strong> scholarship${scholarships.length !== 1 ? 's' : ''}
      matching your profile: <em>${profile.field_and_level}</em>.
    </p>
  `;

  for (const [country, items] of Object.entries(groups)) {
    body += `
      <div style="margin-bottom:28px;">
        <h2 style="color:#e2e8f0;font-size:18px;margin:0 0 16px;padding-bottom:8px;border-bottom:1px solid #334155;">
          ${getCountryEmoji(country)} ${country}
        </h2>
    `;

    for (const s of items) {
      const deadline = s.deadline || 'Not specified';
      const isUrgent = s._isUrgent;
      const isNew = s._isNew;
      const status = s.eligibilityStatus || '';
      const statusColor = status === 'Strong Match' ? '#34d399' : status === 'Partial Match' ? '#fbbf24' : '#94a3b8';

      body += `
        <div style="background:#1e293b;border-radius:10px;padding:18px;margin-bottom:14px;border-left:3px solid ${isUrgent ? '#f59e0b' : '#6366f1'};">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            ${isNew ? '<span style="background:#6366f1;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;text-transform:uppercase;">New</span>' : ''}
            ${isUrgent ? '<span style="background:#f59e0b;color:#1e293b;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;text-transform:uppercase;">Deadline Soon</span>' : ''}
            ${status ? `<span style="color:${statusColor};font-size:11px;font-weight:600;">${status}</span>` : ''}
          </div>
          <h3 style="color:#f1f5f9;font-size:16px;margin:0 0 4px;">
            ${s.name || 'Unnamed Scholarship'}
          </h3>
          <p style="color:#94a3b8;font-size:13px;margin:0 0 10px;">
            ${s.provider || ''} · ${s.fundingType || s.funding_type || ''} · ${s.amount || ''}
          </p>
          ${s.whyItFits || s.why_it_fits ? `
            <p style="color:#a5b4fc;font-size:14px;font-style:italic;margin:0 0 10px;">
              "${s.whyItFits || s.why_it_fits}"
            </p>
          ` : ''}
          <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
            <span style="color:${isUrgent ? '#fbbf24' : '#94a3b8'};font-size:13px;">
              📅 Deadline: <strong>${deadline}</strong>
            </span>
            ${(s.applicationLink || s.application_link) ? `
              <a href="${s.applicationLink || s.application_link}" style="color:#818cf8;font-size:13px;font-weight:600;text-decoration:none;">
                Apply →
              </a>
            ` : ''}
          </div>
          ${(s.requiredDocuments || s.required_documents) ? `
            <p style="color:#64748b;font-size:12px;margin:10px 0 0;">
              📋 Docs needed: ${s.requiredDocuments || s.required_documents}
            </p>
          ` : ''}
        </div>
      `;
    }

    body += '</div>';
  }

  return wrapEmail(body);
}

function wrapEmail(body) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;margin-bottom:28px;">
      <h1 style="color:#e2e8f0;font-size:22px;margin:0;">
        🎓 Scholarship Finder — Weekly Digest
      </h1>
      <p style="color:#64748b;font-size:13px;margin:6px 0 0;">
        ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </div>
    ${body}
    <div style="text-align:center;margin-top:32px;padding-top:20px;border-top:1px solid #1e293b;">
      <p style="color:#475569;font-size:12px;margin:0;">
        Sent by your Scholarship Finder Agent · 
        <a href="#" style="color:#6366f1;text-decoration:none;">View Dashboard</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

function getCountryEmoji(country) {
  const map = {
    'Germany': '🇩🇪',
    'United States': '🇺🇸',
    'United Kingdom': '🇬🇧',
    'Canada': '🇨🇦',
  };
  return map[country] || '🌍';
}

module.exports = { composeDigest };
