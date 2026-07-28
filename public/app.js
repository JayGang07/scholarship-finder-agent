/* ===================================================================
   Scholarship Finder Agent — Frontend Application
   Vanilla JS SPA: routing, API calls, dynamic rendering, toast system
   =================================================================== */

// --- API Client ---
const api = {
  async get(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
    return res.json();
  },
  async post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${url} failed: ${res.status}`);
    return res.json();
  },
  async getHtml(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
    return res.text();
  },
};

// --- Toast System ---
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    ${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}
    <span>${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 200);
  }, 4000);
}

// --- Router ---
const views = ['setup', 'dashboard', 'tracker', 'digest', 'settings'];
let currentView = 'dashboard';

function showView(viewName) {
  if (!views.includes(viewName)) viewName = 'dashboard';
  currentView = viewName;

  // Hide all views
  views.forEach((v) => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.style.display = 'none';
  });

  // Show target view
  const target = document.getElementById(`view-${viewName}`);
  if (target) {
    target.style.display = 'block';
    // Re-trigger animation
    target.style.animation = 'none';
    target.offsetHeight; // force reflow
    target.style.animation = '';
  }

  // Update nav active state
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.view === viewName);
  });

  // Load view data
  switch (viewName) {
    case 'dashboard': loadDashboard(); break;
    case 'tracker': loadTracker(); break;
    case 'digest': loadDigestPreview(); break;
    case 'settings': loadSettings(); break;
  }
}

function initRouter() {
  // Handle hash changes
  window.addEventListener('hashchange', () => {
    const hash = location.hash.replace('#', '') || 'dashboard';
    showView(hash);
  });

  // Handle nav clicks
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.dataset.view;
      location.hash = view;
    });
  });
}

// --- Profile / Setup ---
async function checkProfile() {
  try {
    const data = await api.get('/api/profile');
    if (!data.exists) {
      showView('setup');
      document.getElementById('main-nav').style.display = 'none';
      return false;
    }
    document.getElementById('main-nav').style.display = '';
    return true;
  } catch {
    showView('setup');
    return false;
  }
}

function initProfileForm() {
  const form = document.getElementById('profile-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('submit-profile');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Setting up...';

    const fieldAndLevel = document.getElementById('field-and-level').value.trim();
    const cgpa = document.getElementById('cgpa').value.trim();
    const fundingType = document.getElementById('funding-type').value;

    const checked = document.querySelectorAll('input[name="countries"]:checked');
    const targetCountries = Array.from(checked).map((c) => c.value);

    if (targetCountries.length === 0) {
      showToast('Please select at least one country', 'error');
      btn.disabled = false;
      btn.innerHTML = '<span>Launch My Agent</span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';
      return;
    }

    try {
      await api.post('/api/profile', { fieldAndLevel, targetCountries, cgpa, fundingType });
      showToast('Profile saved! Your agent is ready.', 'success');
      document.getElementById('main-nav').style.display = '';
      location.hash = 'dashboard';
      showView('dashboard');
    } catch (err) {
      showToast('Failed to save profile: ' + err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = '<span>Launch My Agent</span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';
    }
  });
}

// --- Dashboard ---
async function loadDashboard() {
  try {
    // Load stats
    const stats = await api.get('/api/scholarships/stats');
    animateCounter('stat-total-value', stats.total);
    animateCounter('stat-active-value', stats.active);
    animateCounter('stat-approaching-value', stats.approaching);
    animateCounter('stat-passed-value', stats.passed);

    // Load scholarships
    const country = document.getElementById('filter-country')?.value || '';
    const status = document.getElementById('filter-status')?.value || '';
    let url = '/api/scholarships?';
    if (country) url += `country=${encodeURIComponent(country)}&`;
    if (status) url += `status=${encodeURIComponent(status)}&`;

    const data = await api.get(url);
    renderScholarshipCards(data.scholarships);
  } catch (err) {
    console.error('Dashboard load failed:', err);
  }
}

function animateCounter(elementId, target) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  const duration = 600;
  const startTime = performance.now();

  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = Math.round(start + (target - start) * eased);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function renderScholarshipCards(scholarships) {
  const grid = document.getElementById('scholarship-grid');
  if (!grid) return;

  if (scholarships.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-state-icon">🔍</div>
        <p class="empty-state-text">No scholarships found yet. Click "Run Now" to start searching!</p>
      </div>
    `;
    return;
  }

  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  grid.innerHTML = scholarships.map((s) => {
    const deadline = s.deadline ? new Date(s.deadline) : null;
    const isUrgent = deadline && deadline <= thirtyDays && deadline > now;
    const isExpired = s.status === 'Deadline Passed' || (deadline && deadline < now);
    const daysLeft = deadline ? Math.ceil((deadline - now) / (1000 * 60 * 60 * 24)) : null;
    const eligStatus = s.eligibility_status || '';

    const countryEmoji = { 'Germany': '🇩🇪', 'United States': '🇺🇸', 'United Kingdom': '🇬🇧', 'Canada': '🇨🇦' };
    const emoji = countryEmoji[s.country] || '🌍';

    return `
      <div class="scholarship-card ${isUrgent ? 'urgent' : ''} ${isExpired ? 'expired' : ''}">
        <div class="card-badges">
          <span class="badge badge-country">${emoji} ${s.country}</span>
          ${eligStatus === 'Strong Match' ? '<span class="badge badge-strong">Strong Match</span>' : ''}
          ${eligStatus === 'Partial Match' ? '<span class="badge badge-partial">Partial Match</span>' : ''}
          ${isUrgent ? '<span class="badge badge-urgent">⏰ Deadline Soon</span>' : ''}
          ${isExpired ? '<span class="badge badge-expired">Expired</span>' : ''}
        </div>
        <h3 class="card-name">${esc(s.name)}</h3>
        <p class="card-provider">${esc(s.provider)} · ${esc(s.funding_type || '')}</p>
        ${s.why_it_fits ? `<p class="card-why">"${esc(s.why_it_fits)}"</p>` : ''}
        <div class="card-meta">
          <div class="card-meta-item ${isUrgent ? 'deadline-soon' : ''}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            ${s.deadline ? `${formatDate(s.deadline)}${daysLeft !== null && daysLeft > 0 ? ` (${daysLeft}d left)` : ''}` : 'No deadline specified'}
          </div>
          <div class="card-meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            ${esc(s.amount || 'Amount not specified')}
          </div>
        </div>
        <div class="card-footer">
          ${s.application_link
            ? `<a href="${esc(s.application_link)}" target="_blank" rel="noopener" class="card-link">
                Apply Now
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </a>`
            : '<span class="card-link" style="opacity:0.4">No link available</span>'
          }
          ${s.required_documents
            ? `<span class="card-docs" title="${esc(s.required_documents)}">📋 ${(s.required_documents.split(',').length)} docs needed</span>`
            : ''
          }
        </div>
      </div>
    `;
  }).join('');
}

// --- Tracker ---
async function loadTracker() {
  try {
    const data = await api.get('/api/scholarships');
    renderTrackerTable(data.scholarships);
  } catch (err) {
    console.error('Tracker load failed:', err);
  }
}

function renderTrackerTable(scholarships) {
  const tbody = document.getElementById('tracker-tbody');
  if (!tbody) return;

  if (scholarships.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          <div class="empty-state-icon">📋</div>
          <p class="empty-state-text">No scholarships tracked yet</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = scholarships.map((s) => {
    const isActive = s.status === 'Active';
    return `
      <tr>
        <td>
          <strong>${esc(s.name)}</strong>
          <br><span style="color:var(--text-muted);font-size:var(--font-xs);">${esc(s.provider)}</span>
        </td>
        <td>${esc(s.country)}</td>
        <td>${esc(s.funding_type || '')} ${s.amount ? `<br><span style="color:var(--text-muted);font-size:var(--font-xs);">${esc(s.amount)}</span>` : ''}</td>
        <td>${s.deadline ? formatDate(s.deadline) : '—'}</td>
        <td><span class="table-status ${isActive ? 'active' : 'expired'}">${isActive ? 'Active' : 'Expired'}</span></td>
        <td style="max-width:200px;font-size:var(--font-xs);color:var(--text-secondary);">${esc(s.eligibility_status || '—')}</td>
        <td>${s.application_link ? `<a href="${esc(s.application_link)}" target="_blank" rel="noopener" class="card-link">Link ↗</a>` : '—'}</td>
      </tr>
    `;
  }).join('');
}

// --- Digest Preview ---
async function loadDigestPreview() {
  const frame = document.getElementById('digest-frame');
  if (!frame) return;

  try {
    const html = await api.getHtml('/api/digest/preview');
    // Render in an iframe for isolation
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.minHeight = '600px';
    iframe.style.border = 'none';
    iframe.style.borderRadius = 'var(--radius-md)';
    frame.innerHTML = '';
    frame.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    // Auto-resize iframe
    setTimeout(() => {
      iframe.style.height = doc.body.scrollHeight + 40 + 'px';
    }, 200);
  } catch (err) {
    frame.innerHTML = `<div class="empty-state"><p class="empty-state-text">Could not load digest preview. Set up your profile first.</p></div>`;
  }
}

// --- Settings ---
async function loadSettings() {
  try {
    const profileData = await api.get('/api/profile');
    const healthData = await api.get('/api/health');
    renderProfileDisplay(profileData.profile);
    renderAgentStatus(healthData);
  } catch (err) {
    console.error('Settings load failed:', err);
  }
}

function renderProfileDisplay(profile) {
  const el = document.getElementById('profile-display');
  if (!el || !profile) return;

  el.innerHTML = `
    <div class="profile-item">
      <span class="profile-item-label">Field & Level</span>
      <span class="profile-item-value">${esc(profile.field_and_level)}</span>
    </div>
    <div class="profile-item">
      <span class="profile-item-label">Target Countries</span>
      <span class="profile-item-value">${esc(profile.target_countries)}</span>
    </div>
    <div class="profile-item">
      <span class="profile-item-label">CGPA</span>
      <span class="profile-item-value">${esc(profile.cgpa)}</span>
    </div>
    <div class="profile-item">
      <span class="profile-item-label">Funding Preference</span>
      <span class="profile-item-value">${esc(profile.funding_type)}</span>
    </div>
  `;
}

function renderAgentStatus(health) {
  const el = document.getElementById('agent-status');
  if (!el) return;

  el.innerHTML = `
    <div class="status-row">
      <span class="status-key">Profile</span>
      <span class="status-value">
        <span class="status-dot ${health.profileConfigured ? 'green' : 'red'}"></span>
        ${health.profileConfigured ? 'Configured' : 'Not set up'}
      </span>
    </div>
    <div class="status-row">
      <span class="status-key">AI Provider</span>
      <span class="status-value">
        <span class="status-dot ${health.aiConfigured ? 'green' : 'amber'}"></span>
        ${health.aiConfigured ? 'Connected' : 'Not set (using seed data)'}
      </span>
    </div>
    <div class="status-row">
      <span class="status-key">Email (SMTP)</span>
      <span class="status-value">
        <span class="status-dot ${health.smtpConfigured ? 'green' : 'amber'}"></span>
        ${health.smtpConfigured ? 'Connected' : 'Not set (console log)'}
      </span>
    </div>
    <div class="status-row">
      <span class="status-key">Total Scholarships</span>
      <span class="status-value" style="color:var(--text-primary);">
        ${health.scholarships?.total || 0}
      </span>
    </div>
    <div class="status-row">
      <span class="status-key">Active</span>
      <span class="status-value" style="color:var(--accent-green);">
        ${health.scholarships?.active || 0}
      </span>
    </div>
  `;
}

// --- Actions ---
function initActions() {
  // Run cycle button
  document.getElementById('btn-run-cycle')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-run-cycle');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> <span>Running...</span>';
    showToast('Scholarship scan started...', 'info');

    try {
      const result = await api.post('/api/trigger');
      if (result.success) {
        showToast(
          `Scan complete! ${result.matched} matched, ${result.skipped} skipped, ${result.errors} errors`,
          result.errors > 0 ? 'info' : 'success'
        );
        loadDashboard(); // Refresh
      } else {
        showToast(result.error || 'Scan failed', 'error');
      }
    } catch (err) {
      showToast('Scan failed: ' + err.message, 'error');
    }

    btn.disabled = false;
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>Run Now</span>';
  });

  // Refresh button
  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    loadDashboard();
    showToast('Dashboard refreshed', 'info');
  });

  // Send digest button
  document.getElementById('btn-send-digest')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-send-digest');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> <span>Sending...</span>';

    try {
      const result = await api.post('/api/digest/send');
      showToast(result.message || 'Digest sent!', result.sent ? 'success' : 'info');
    } catch (err) {
      showToast('Failed to send: ' + err.message, 'error');
    }

    btn.disabled = false;
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg><span>Send Email</span>';
  });

  // Edit profile button
  document.getElementById('btn-edit-profile')?.addEventListener('click', () => {
    location.hash = 'setup';
    showView('setup');
    document.getElementById('main-nav').style.display = '';
    // Pre-fill form with existing data
    prefillProfileForm();
  });

  // Filter changes
  document.getElementById('filter-country')?.addEventListener('change', loadDashboard);
  document.getElementById('filter-status')?.addEventListener('change', loadDashboard);
}

async function prefillProfileForm() {
  try {
    const data = await api.get('/api/profile');
    if (!data.profile) return;
    const p = data.profile;
    document.getElementById('field-and-level').value = p.field_and_level || '';
    document.getElementById('cgpa').value = p.cgpa || '';
    document.getElementById('funding-type').value = p.funding_type || '';

    // Check country boxes
    const countries = (p.target_countries || '').split(',').map((c) => c.trim());
    document.querySelectorAll('input[name="countries"]').forEach((cb) => {
      cb.checked = countries.includes(cb.value);
    });
  } catch {}
}

// --- Utilities ---
function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// --- Init ---
async function init() {
  initRouter();
  initProfileForm();
  initActions();

  const hasProfile = await checkProfile();
  if (hasProfile) {
    const hash = location.hash.replace('#', '') || 'dashboard';
    showView(hash);
  }
}

document.addEventListener('DOMContentLoaded', init);
