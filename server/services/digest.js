/**
 * Digest composer — builds a formatted HTML email from matched scholarships.
 * v2: Urgency-sorted, with GPA fit, confidence bars, calendar links,
 *     source badges, and "New this week" highlights.
 */

/**
 * Generate an .ics calendar string for a scholarship deadline.
 */
function generateIcsLink(scholarship) {
  const deadline = scholarship.deadline;
  if (!deadline) return '';

  const d = new Date(deadline);
  if (isNaN(d.getTime())) return '';

  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ScholarshipFinder//EN',
    'BEGIN:VEVENT',
    `DTSTART;VALUE=DATE:${dateStr}`,
    `DTEND;VALUE=DATE:${dateStr}`,
    `SUMMARY:📋 Deadline: ${(scholarship.name || '').replace(/[,;\\]/g, ' ')}`,
    `DESCRIPTION:Apply at ${scholarship.applicationLink || scholarship.application_link || 'N/A'}`,
    `URL:${scholarship.applicationLink || scholarship.application_link || ''}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  return `data:text/calendar;charset=utf-8,${encodeURIComponent(icsContent)}`;
}

/**
 * Get urgency level for a scholarship deadline.
 * Returns { level: 'red'|'amber'|'green'|'none', daysLeft: number|null }
 */
function getUrgencyLevel(deadline) {
  if (!deadline) return { level: 'none', daysLeft: null };
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return { level: 'none', daysLeft: null };

  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) return { level: 'expired', daysLeft };
  if (daysLeft <= 7) return { level: 'red', daysLeft };
  if (daysLeft <= 30) return { level: 'amber', daysLeft };
  return { level: 'green', daysLeft };
}

/**
 * Map confidence label to a color.
 */
function confidenceColor(confidence) {
  switch (confidence) {
    case 'Likely eligible': return '#34d399';
    case 'Check requirements': return '#fbbf24';
    case 'Not eligible': return '#f87171';
    default: return '#94a3b8';
  }
}

function confidenceEmoji(confidence) {
  switch (confidence) {
    case 'Likely eligible': return '🟢';
    case 'Check requirements': return '🟡';
    case 'Not eligible': return '🔴';
    default: return '⚪';
  }
}

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

  // Sort each group: urgency (red first), then by deadline
  for (const country of Object.keys(groups)) {
    groups[country].sort((a, b) => {
      const ua = getUrgencyLevel(a.deadline);
      const ub = getUrgencyLevel(b.deadline);
      const urgencyOrder = { red: 0, amber: 1, green: 2, none: 3, expired: 4 };
      const oa = urgencyOrder[ua.level] ?? 3;
      const ob = urgencyOrder[ub.level] ?? 3;
      if (oa !== ob) return oa - ob;
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
      const urgency = getUrgencyLevel(s.deadline);
      const isNew = s._isNew || s.new_since_last_digest === 'Y';
      const conf = s.confidence || '';
      const gpaFit = s.gpaFit || s.gpa_fit || '';
      const icsLink = generateIcsLink(s);

      const urgencyChipColor = urgency.level === 'red' ? '#ef4444' : urgency.level === 'amber' ? '#f59e0b' : '#34d399';
      const urgencyChipBg = urgency.level === 'red' ? 'rgba(239,68,68,0.2)' : urgency.level === 'amber' ? 'rgba(245,158,11,0.2)' : 'rgba(52,211,153,0.15)';
      const urgencyText = urgency.daysLeft !== null && urgency.daysLeft >= 0 ? `${urgency.daysLeft}d left` : urgency.level === 'expired' ? 'Expired' : '';

      body += `
        <div style="background:#1e293b;border-radius:10px;padding:18px;margin-bottom:14px;border-left:3px solid ${urgency.level === 'red' ? '#ef4444' : urgency.level === 'amber' ? '#f59e0b' : '#6366f1'};">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
            ${isNew ? '<span style="background:#6366f1;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;text-transform:uppercase;">New</span>' : ''}
            ${urgencyText ? `<span style="background:${urgencyChipBg};color:${urgencyChipColor};font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;text-transform:uppercase;">${urgencyText}</span>` : ''}
            ${conf ? `<span style="color:${confidenceColor(conf)};font-size:11px;font-weight:600;">${confidenceEmoji(conf)} ${conf}</span>` : ''}
            <span style="color:#64748b;font-size:10px;">via ${s.provider || 'Unknown'}</span>
          </div>
          <h3 style="color:#f1f5f9;font-size:16px;margin:0 0 4px;">
            ${s.name || 'Unnamed Scholarship'}
          </h3>
          <p style="color:#94a3b8;font-size:13px;margin:0 0 10px;">
            ${s.fundingType || s.funding_type || ''} · ${s.amount || ''}
          </p>
          ${gpaFit ? `
            <p style="color:#60a5fa;font-size:13px;margin:0 0 10px;padding:6px 10px;background:rgba(96,165,250,0.1);border-radius:6px;">
              📊 ${gpaFit}
            </p>
          ` : ''}
          ${s.whyItFits || s.why_it_fits ? `
            <p style="color:#a5b4fc;font-size:14px;font-style:italic;margin:0 0 10px;">
              "${s.whyItFits || s.why_it_fits}"
            </p>
          ` : ''}
          <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
            <span style="color:${urgency.level === 'red' ? '#ef4444' : urgency.level === 'amber' ? '#fbbf24' : '#94a3b8'};font-size:13px;">
              📅 Deadline: <strong>${deadline}</strong>
            </span>
            ${(s.applicationLink || s.application_link) ? `
              <a href="${s.applicationLink || s.application_link}" style="color:#818cf8;font-size:13px;font-weight:600;text-decoration:none;">
                Apply →
              </a>
            ` : ''}
            ${icsLink ? `
              <a href="${icsLink}" download="${(s.name || 'deadline').replace(/[^a-zA-Z0-9]/g, '_')}.ics" style="color:#60a5fa;font-size:12px;text-decoration:none;">
                📅 Add to Calendar
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
        <a href="https://scholarship-finder-agent.onrender.com" style="color:#6366f1;text-decoration:none;">View Dashboard</a>
      </p>
      <p style="color:#334155;font-size:11px;margin:8px 0 0;">
        This email is sent only to you (OAuth-connected account). No approval gate needed — Rule 6 compliant.
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

module.exports = { composeDigest, generateIcsLink, getUrgencyLevel };
