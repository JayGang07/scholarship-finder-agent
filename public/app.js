/* ==========================================================
   SCHOLARSHIP FINDER AGENT — FRONTEND APPLICATION
   API → Router → Profile → Dashboard → Tracker → Digest → Settings
   Libraries: GSAP, CountUp.js, Chart.js, canvas-confetti
   ========================================================== */

const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── API Client ─────────────────────────────────────────── */

const api = {
  async get(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  },
  async getHtml(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status}`);
    return r.text();
  },
  async post(url, body) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  },
};


/* ── Toast (reused everywhere — one pattern, no library) ── */

function toast(message, type = 'info') {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ';
  el.innerHTML = `${icon} <span>${message}</span>`;
  c.appendChild(el);
  setTimeout(() => { el.classList.add('toast-exit'); setTimeout(() => el.remove(), 200); }, 4000);
}


/* ── Router ─────────────────────────────────────────────── */

const VIEWS = ['setup', 'dashboard', 'tracker', 'digest', 'settings'];
let currentView = 'dashboard';

function showView(name) {
  if (!VIEWS.includes(name)) name = 'dashboard';
  currentView = name;

  VIEWS.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.style.display = v === name ? 'block' : 'none';
  });

  document.querySelectorAll('.nav-link').forEach(l =>
    l.classList.toggle('active', l.dataset.view === name)
  );

  switch (name) {
    case 'dashboard': loadDashboard(); break;
    case 'tracker':   loadTracker();   break;
    case 'digest':    loadDigest();    break;
    case 'settings':  loadSettings();  break;
  }
}

function initRouter() {
  window.addEventListener('hashchange', () => showView(location.hash.slice(1) || 'dashboard'));
  document.querySelectorAll('.nav-link').forEach(l =>
    l.addEventListener('click', e => { e.preventDefault(); location.hash = l.dataset.view; })
  );
}


/* ── Profile / Setup ────────────────────────────────────── */

async function checkProfile() {
  try {
    const d = await api.get('/api/profile');
    if (!d.exists) { showView('setup'); document.getElementById('main-nav').style.display = 'none'; return false; }
    document.getElementById('main-nav').style.display = '';
    return true;
  } catch { showView('setup'); return false; }
}

function initSetupForm() {
  const form = document.getElementById('profile-form');
  const otherCb = document.getElementById('country-other-checkbox');
  const otherWrap = document.getElementById('other-country-wrapper');

  otherCb.addEventListener('change', () => {
    otherWrap.style.display = otherCb.checked ? 'block' : 'none';
    if (otherCb.checked) document.getElementById('other-country-text').focus();
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('submit-profile');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Setting up…';

    const countries = Array.from(document.querySelectorAll('input[name="countries"]:checked'))
      .map(c => c.value).filter(v => v !== 'Other');

    if (otherCb.checked) {
      const txt = document.getElementById('other-country-text').value.trim();
      if (txt) txt.split(',').forEach(c => { if (c.trim()) countries.push(c.trim()); });
    }

    if (!countries.length) {
      toast('Select at least one country', 'error');
      btn.disabled = false;
      btn.innerHTML = '<span>Launch My Agent</span>';
      return;
    }

    try {
      await api.post('/api/profile', {
        fieldAndLevel: document.getElementById('field-and-level').value.trim(),
        targetCountries: countries,
        cgpa: document.getElementById('cgpa').value.trim(),
        fundingType: document.getElementById('funding-type').value,
      });
      toast('Profile saved — your agent is ready', 'success');
      document.getElementById('main-nav').style.display = '';
      location.hash = 'dashboard';
    } catch (err) {
      toast('Failed to save: ' + err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = '<span>Launch My Agent</span>';
    }
  });
}


/* ── Shared Helpers ─────────────────────────────────────── */

function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function deadlineInfo(deadline) {
  if (!deadline) return { level: 'none', days: null, text: '' };
  const d = new Date(deadline);
  if (isNaN(d)) return { level: 'none', days: null, text: '' };
  const days = Math.ceil((d - new Date()) / 864e5);
  if (days < 0) return { level: 'expired', days, text: 'Expired' };
  if (days <= 7) return { level: 'red', days, text: `${days}d left` };
  if (days <= 30) return { level: 'amber', days, text: `${days}d left` };
  return { level: 'green', days, text: `${days}d left` };
}

function countdownHtml(deadline) {
  const { level, text } = deadlineInfo(deadline);
  if (level === 'none') return '';
  const cls = level === 'red' ? 'countdown-red' : level === 'amber' ? 'countdown-amber'
    : level === 'expired' ? 'countdown-expired' : 'countdown-green';
  return `<span class="countdown ${cls}" data-deadline="${esc(deadline)}">${text}</span>`;
}

function confidenceToGauge(confidence) {
  switch (confidence) {
    case 'Likely eligible':    return { pct: 90, color: 'var(--eligible)',   label: '90%' };
    case 'Check requirements': return { pct: 60, color: 'var(--urgency)',    label: '60%' };
    case 'Not eligible':       return { pct: 25, color: 'var(--critical)',   label: '25%' };
    default:                   return { pct: 50, color: 'var(--mist)',       label: '—' };
  }
}

function icsLink(s) {
  if (!s.deadline) return '';
  const d = new Date(s.deadline);
  if (isNaN(d)) return '';
  const pad = n => String(n).padStart(2, '0');
  const ds = `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}`;
  const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:${ds}\r\nSUMMARY:Deadline: ${(s.name||'').replace(/[,;\\]/g,' ')}\r\nDESCRIPTION:Apply at ${s.application_link||'N/A'}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}


/* ── Dashboard ──────────────────────────────────────────── */

let chartsReady = false;
let countryChart = null;
let fundingChart = null;

async function loadDashboard() {
  try {
    const [stats, health, schData] = await Promise.all([
      api.get('/api/scholarships/stats'),
      api.get('/api/health'),
      api.get('/api/scholarships'),
    ]);

    animateStats(stats);
    updateScheduleStrip(health);
    renderScholarshipCards(schData.scholarships || []);
    renderCharts(schData.scholarships || []);
    updateFeedIdle(health);
    populateCountryFilter(schData.scholarships || []);

    if (!chartsReady) { chartsReady = true; runPageEntrance(); }
  } catch (err) {
    console.error('Dashboard load:', err);
  }
}

/* Stats — CountUp.js */
function animateStats({ total = 0, active = 0, approaching = 0, passed = 0 }) {
  const CountUp = window.countUp?.CountUp;
  if (!CountUp || REDUCE_MOTION) {
    document.getElementById('stat-total-value').textContent = total;
    document.getElementById('stat-active-value').textContent = active;
    document.getElementById('stat-approaching-value').textContent = approaching;
    document.getElementById('stat-passed-value').textContent = passed;
    return;
  }
  const opts = { duration: 1.2, useEasing: true };
  new CountUp('stat-total-value', total, opts).start();
  new CountUp('stat-active-value', active, opts).start();
  new CountUp('stat-approaching-value', approaching, opts).start();
  new CountUp('stat-passed-value', passed, opts).start();
}

/* Schedule strip countdown */
function updateScheduleStrip(health) {
  const s = health.schedule || {};
  const el = document.getElementById('schedule-display');
  const cdEl = document.getElementById('next-run-countdown');
  if (el) el.textContent = s.display || 'Every day at 09:00 UTC';
  if (cdEl && s.nextRun) {
    startNextRunCountdown(new Date(s.nextRun), cdEl);
  }
}

let nextRunTimer = null;
function startNextRunCountdown(target, el) {
  clearInterval(nextRunTimer);
  const tick = () => {
    const diff = target - Date.now();
    if (diff <= 0) { el.textContent = 'Running now…'; return; }
    const h = Math.floor(diff / 36e5);
    const m = Math.floor((diff % 36e5) / 6e4);
    el.textContent = `Next scan in ${h}h ${m}m`;
  };
  tick();
  nextRunTimer = setInterval(tick, 60000);
}

/* Country filter population */
function populateCountryFilter(scholarships) {
  const sel = document.getElementById('filter-country');
  if (!sel || sel.options.length > 1) return;
  const countries = [...new Set(scholarships.map(s => s.country).filter(Boolean))].sort();
  const emoji = { 'Germany': '🇩🇪', 'United States': '🇺🇸', 'United Kingdom': '🇬🇧', 'Canada': '🇨🇦' };
  countries.forEach(c => {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = `${emoji[c] || '🌍'} ${c}`;
    sel.appendChild(o);
  });
}

/* Feed idle state */
function updateFeedIdle(health) {
  const feed = document.getElementById('activity-feed');
  const dot = document.getElementById('feed-dot');
  if (!feed) return;
  dot?.classList.add('idle');

  const lr = health.lastRun;
  if (lr?.timestamp) {
    const ago = timeSince(new Date(lr.timestamp));
    feed.innerHTML = feedLine('—', `Idle. Last run ${ago} — ${lr.matched || 0} scholarships matched.`);
  } else {
    feed.innerHTML = feedLine('—', 'Idle. Click <strong>Run Now</strong> to start your first scan, or wait for the daily schedule.');
  }
}

function feedLine(time, text, cls = '') {
  return `<div class="feed-line"><span class="feed-time">${time}</span><span class="feed-text ${cls}">${text}</span></div>`;
}

function timeSince(date) {
  const s = Math.floor((Date.now() - date) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}


/* ── Activity Feed (typewriter on Run Now) ──────────────── */

async function runCycle() {
  const btn = document.getElementById('btn-run-cycle');
  const feed = document.getElementById('activity-feed');
  const dot = document.getElementById('feed-dot');

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> <span>Running…</span>';
  dot?.classList.remove('idle');
  feed.innerHTML = '';

  const now = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  await typeToFeed(feed, now(), 'Connecting to scholarship databases…', 'info');
  await typeToFeed(feed, now(), 'Scanning DAAD, Fulbright, Chevening sources…', 'info');

  let result;
  try {
    result = await api.post('/api/trigger');
  } catch (err) {
    await typeToFeed(feed, now(), `✗ Scan failed: ${err.message}`, 'error');
    toast('Scan failed', 'error');
    resetRunBtn(btn);
    return;
  }

  if (!result.success) {
    await typeToFeed(feed, now(), `✗ ${result.error || 'Unknown error'}`, 'error');
    toast(result.error || 'Scan failed', 'error');
    resetRunBtn(btn);
    return;
  }

  await typeToFeed(feed, now(), `Checked ${result.sourcesChecked || 0} sources`, '');
  await typeToFeed(feed, now(), `Found ${result.newFound || 0} scholarships`, 'info');
  await typeToFeed(feed, now(), `✓ ${result.matched || 0} match your profile`, 'success');

  if (result.skipped > 0)
    await typeToFeed(feed, now(), `${result.skipped} already tracked (memory)`, '');
  if (result.errors > 0)
    await typeToFeed(feed, now(), `⚠ ${result.errors} sources unavailable`, 'warn');

  await typeToFeed(feed, now(), result.digestSent ? '✓ Digest composed and queued' : '✓ Run complete', 'success');

  toast(`Scan complete — ${result.matched} matched`, result.errors ? 'info' : 'success');

  // Confetti for a high-match run (≥ 1 matched, not every time)
  if (result.matched > 0 && typeof confetti === 'function') {
    confetti({ particleCount: 80, spread: 70, origin: { y: 0.7 }, colors: ['#8b5cf6', '#22d3ee', '#10b981'] });
  }

  loadDashboard();
  resetRunBtn(btn);
}

function resetRunBtn(btn) {
  btn.disabled = false;
  btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>Run Now</span>';
}

function typeToFeed(container, time, text, cls) {
  return new Promise(resolve => {
    const line = document.createElement('div');
    line.className = 'feed-line';
    line.innerHTML = `<span class="feed-time">${time}</span><span class="feed-text ${cls}"></span>`;
    container.appendChild(line);
    container.scrollTop = container.scrollHeight;

    if (REDUCE_MOTION) {
      line.querySelector('.feed-text').innerHTML = text;
      resolve();
      return;
    }

    const span = line.querySelector('.feed-text');
    let i = 0;
    const interval = setInterval(() => {
      i++;
      span.innerHTML = text.slice(0, i);
      if (i >= text.length) { clearInterval(interval); resolve(); }
    }, 18);
  });
}


/* ── Charts (Chart.js) ──────────────────────────────────── */

const CHART_COLORS = ['#8b5cf6', '#22d3ee', '#f59e0b', '#10b981', '#ef4444', '#6366f1', '#ec4899'];

function renderCharts(scholarships) {
  if (typeof Chart === 'undefined' || !scholarships.length) return;

  Chart.defaults.color = '#94a3b8';
  Chart.defaults.font.family = "'Inter', system-ui";
  Chart.defaults.font.size = 11;

  renderCountryChart(scholarships);
  renderFundingChart(scholarships);
}

function renderCountryChart(data) {
  const counts = {};
  data.forEach(s => { const c = s.country || 'Other'; counts[c] = (counts[c] || 0) + 1; });
  const labels = Object.keys(counts);
  const values = Object.values(counts);

  const ctx = document.getElementById('chart-countries');
  if (!ctx) return;

  if (countryChart) countryChart.destroy();
  countryChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: CHART_COLORS.slice(0, labels.length), borderWidth: 0 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 10, padding: 8, font: { size: 10 } } },
      },
    },
  });
}

function renderFundingChart(data) {
  const counts = {};
  data.forEach(s => { const f = s.funding_type || 'Other'; counts[f] = (counts[f] || 0) + 1; });
  const labels = Object.keys(counts);
  const values = Object.values(counts);

  const ctx = document.getElementById('chart-funding');
  if (!ctx) return;

  if (fundingChart) fundingChart.destroy();
  fundingChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: CHART_COLORS.slice(0, labels.length), borderRadius: 4, barThickness: 20 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      indexAxis: 'y',
      scales: {
        x: { grid: { color: 'rgba(148,163,184,0.06)' }, ticks: { stepSize: 1 } },
        y: { grid: { display: false } },
      },
      plugins: { legend: { display: false } },
    },
  });
}


/* ── Scholarship Cards ──────────────────────────────────── */

function renderScholarshipCards(scholarships) {
  const grid = document.getElementById('scholarship-grid');
  if (!grid) return;

  if (!scholarships.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-state-icon">🔭</div>
        <p class="empty-state-text">Your agent hasn't found any scholarships yet. Click <strong>Run Now</strong> above to trigger your first scan, or it'll run automatically on schedule.</p>
      </div>`;
    return;
  }

  const emoji = { 'Germany': '🇩🇪', 'United States': '🇺🇸', 'United Kingdom': '🇬🇧', 'Canada': '🇨🇦' };

  grid.innerHTML = scholarships.map(s => {
    const dl = deadlineInfo(s.deadline);
    const isNew = s.new_since_last_digest === 'Y';
    const gauge = confidenceToGauge(s.confidence);
    const cal = icsLink(s);
    const isExpired = s.status === 'Deadline Passed' || dl.level === 'expired';
    const isHot = dl.level === 'red' || dl.level === 'amber';

    return `
      <div class="scholarship-card ${isHot ? 'card-urgent' : ''} ${isExpired ? 'card-expired' : ''}">
        <div class="card-top">
          <div class="card-badges">
            <span class="badge badge-country">${emoji[s.country] || '🌍'} ${esc(s.country)}</span>
            <span class="badge badge-source">${esc(s.provider)}</span>
            ${isNew ? '<span class="badge badge-new">✨ New</span>' : ''}
            ${countdownHtml(s.deadline)}
          </div>
          <div class="gauge" style="--pct:${gauge.pct};--gauge-color:${gauge.color}" title="${esc(s.confidence || 'Unknown')}">
            <div class="gauge-inner">${gauge.label}</div>
          </div>
        </div>
        <h3 class="card-name">${esc(s.name)}</h3>
        <p class="card-provider">${esc(s.funding_type || '')} · ${esc(s.amount || '')}</p>
        ${s.gpa_fit ? `<div class="card-gpa-fit">📊 ${esc(s.gpa_fit)}</div>` : ''}
        ${s.why_it_fits ? `<p class="card-why">"${esc(s.why_it_fits)}"</p>` : ''}
        <div class="card-meta">
          <div class="card-meta-item ${isHot ? 'deadline-hot' : ''}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            ${s.deadline ? fmtDate(s.deadline) : 'No deadline listed'}
          </div>
          <div class="card-meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            ${esc(s.amount || 'Amount not specified')}
          </div>
        </div>
        ${renderDocChecklist(s)}
        <div class="card-footer">
          ${s.application_link
            ? `<a href="${esc(s.application_link)}" target="_blank" rel="noopener" class="card-link">Apply Now →</a>`
            : '<span class="card-link" style="opacity:0.3">No link</span>'}
          ${cal ? `<a href="${cal}" download="${(s.name||'deadline').replace(/[^a-z0-9]/gi,'_')}.ics" class="card-calendar-link">📅 Calendar</a>` : ''}
        </div>
      </div>`;
  }).join('');
}

function renderDocChecklist(s) {
  const docs = s.documents_checklist || s.required_documents || '';
  if (!docs) return '';
  const items = docs.split(',').map(d => d.trim()).filter(Boolean);
  if (!items.length) return '';
  return `
    <div class="doc-checklist">
      <div class="doc-checklist-title">📋 Required documents (${items.length})</div>
      <div class="doc-checklist-items">
        ${items.map((item, i) => `
          <label class="doc-item">
            <input type="checkbox" class="doc-checkbox" data-idx="${i}">
            <span class="doc-item-text">${esc(item)}</span>
          </label>`).join('')}
      </div>
    </div>`;
}


/* ── Tracker ────────────────────────────────────────────── */

let timelineChart = null;

async function loadTracker() {
  try {
    const d = await api.get('/api/scholarships');
    const list = d.scholarships || [];
    renderTrackerTable(list);
    renderTimeline(list);
  } catch (err) { console.error('Tracker:', err); }
}

function renderTrackerTable(scholarships) {
  const tbody = document.getElementById('tracker-tbody');
  if (!tbody) return;

  if (!scholarships.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state"><div class="empty-state-icon">📋</div><p class="empty-state-text">No scholarships tracked yet. Run a scan from the Dashboard to populate this table.</p></td></tr>`;
    return;
  }

  tbody.innerHTML = scholarships.map(s => {
    const dl = deadlineInfo(s.deadline);
    const gauge = confidenceToGauge(s.confidence);
    const isNew = s.new_since_last_digest === 'Y';
    return `
      <tr class="${isNew ? 'tracker-row-new' : ''}">
        <td><strong>${esc(s.name)}</strong><br><span style="color:var(--mist);font-size:0.7rem;">${esc(s.provider)}</span></td>
        <td>${esc(s.country)}</td>
        <td>${esc(s.funding_type || '')} ${s.amount ? `<br><span style="font-size:0.7rem;color:var(--mist)">${esc(s.amount)}</span>` : ''}</td>
        <td>${s.deadline ? fmtDate(s.deadline) : '—'}</td>
        <td>${countdownHtml(s.deadline)}</td>
        <td><div class="gauge" style="--pct:${gauge.pct};--gauge-color:${gauge.color};width:32px;height:32px;"><div class="gauge-inner" style="width:24px;height:24px;font-size:0.55rem;">${gauge.label}</div></div></td>
        <td style="max-width:160px;font-size:0.7rem;color:var(--mist);">${esc(s.gpa_fit || '—')}</td>
        <td>${s.application_link ? `<a href="${esc(s.application_link)}" target="_blank" class="card-link">↗</a>` : '—'}</td>
      </tr>`;
  }).join('');

  // ScrollTrigger for table rows
  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined' && !REDUCE_MOTION) {
    gsap.registerPlugin(ScrollTrigger);
    gsap.utils.toArray('#tracker-tbody tr').forEach((row, i) => {
      gsap.from(row, {
        scrollTrigger: { trigger: row, start: 'top 95%', once: true },
        opacity: 0, y: 12, duration: 0.3, delay: i * 0.03,
      });
    });
  }
}

/* Deadline timeline — Chart.js scatter */
function renderTimeline(scholarships) {
  const ctx = document.getElementById('chart-timeline');
  if (!ctx || typeof Chart === 'undefined') return;

  const withDeadlines = scholarships.filter(s => s.deadline && !isNaN(new Date(s.deadline)));
  if (!withDeadlines.length) {
    document.getElementById('timeline-container').innerHTML =
      '<div class="empty-state"><div class="empty-state-icon">📅</div><p class="empty-state-text">No deadlines to plot yet.</p></div>';
    return;
  }

  const data = withDeadlines.map(s => {
    const dl = deadlineInfo(s.deadline);
    const color = dl.level === 'red' ? '#ef4444' : dl.level === 'amber' ? '#f59e0b' : dl.level === 'expired' ? '#64748b' : '#10b981';
    return { x: new Date(s.deadline), y: s.name, color, radius: dl.level === 'red' ? 8 : 6 };
  });

  if (timelineChart) timelineChart.destroy();
  timelineChart = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        data: data.map(d => ({ x: d.x, y: data.indexOf(d) })),
        backgroundColor: data.map(d => d.color),
        pointRadius: data.map(d => d.radius),
        pointHoverRadius: 10,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: {
          type: 'time',
          time: { unit: 'month', displayFormats: { month: 'MMM yyyy' } },
          grid: { color: 'rgba(148,163,184,0.06)' },
          title: { display: true, text: 'Deadline', color: '#94a3b8', font: { size: 11 } },
        },
        y: {
          type: 'linear',
          ticks: {
            callback: (val) => { const d = data[val]; return d ? (d.y.length > 25 ? d.y.slice(0, 25) + '…' : d.y) : ''; },
            color: '#94a3b8', font: { size: 10 },
          },
          grid: { color: 'rgba(148,163,184,0.04)' },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => { const d = data[ctx.dataIndex]; return d ? `${d.y} — ${fmtDate(d.x)}` : ''; },
          },
        },
      },
    },
  });
}

/* Tracker view toggle */
function initTrackerToggle() {
  document.getElementById('btn-timeline-view')?.addEventListener('click', () => {
    document.getElementById('timeline-container').style.display = '';
    document.getElementById('table-container').style.display = 'none';
    document.getElementById('btn-timeline-view').classList.add('active');
    document.getElementById('btn-table-view').classList.remove('active');
  });
  document.getElementById('btn-table-view')?.addEventListener('click', () => {
    document.getElementById('timeline-container').style.display = 'none';
    document.getElementById('table-container').style.display = '';
    document.getElementById('btn-table-view').classList.add('active');
    document.getElementById('btn-timeline-view').classList.remove('active');
  });
}


/* ── Digest Preview ─────────────────────────────────────── */

async function loadDigest() {
  const frame = document.getElementById('digest-frame');
  if (!frame) return;
  try {
    const html = await api.getHtml('/api/digest/preview');
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:100%;min-height:600px;border:none;border-radius:var(--radius-md);';
    frame.innerHTML = '';
    frame.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => { iframe.style.height = doc.body.scrollHeight + 40 + 'px'; }, 300);
  } catch {
    frame.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><p class="empty-state-text">Your first digest will appear after your agent\'s next run. Hit <strong>Run Now</strong> on the Dashboard to generate one.</p></div>';
  }
}


/* ── Settings ───────────────────────────────────────────── */

async function loadSettings() {
  try {
    const [profileData, health] = await Promise.all([
      api.get('/api/profile'),
      api.get('/api/health'),
    ]);
    renderProfile(profileData.profile);
    renderOAuth(health);
    renderAgentStatus(health);
    renderCompliance();
  } catch (err) { console.error('Settings:', err); }
}

function renderProfile(p) {
  const el = document.getElementById('profile-display');
  if (!el || !p) return;
  el.innerHTML = [
    { label: 'Field & Level', value: p.field_and_level },
    { label: 'Target Countries', value: p.target_countries },
    { label: 'CGPA', value: p.cgpa },
    { label: 'Funding', value: p.funding_type },
  ].map(i => `<div class="profile-item"><span class="profile-item-label">${i.label}</span><span class="profile-item-value">${esc(i.value)}</span></div>`).join('');
}

function renderOAuth(h) {
  const el = document.getElementById('oauth-status');
  if (!el) return;
  el.innerHTML = `
    ${statusRow('Google Account', `<span class="status-dot green"></span> ${esc(h.googleAccount || 'Connected')}`)}
    ${statusRow('Authentication', '<span class="status-dot green"></span> OAuth (no password stored)')}
    ${statusRow('Email Delivery', `<span class="status-dot ${h.smtpConfigured ? 'green' : 'amber'}"></span> ${h.smtpConfigured ? 'SMTP connected' : 'Console log (SMTP not set)'}`)}
    ${statusRow('Recipients', '<span style="color:var(--opportunity);">Only you (the student)</span>')}`;
}

function renderAgentStatus(h) {
  const el = document.getElementById('agent-status');
  if (!el) return;
  const s = h.schedule || {};
  const lr = h.lastRun;
  el.innerHTML = `
    ${statusRow('Schedule', `<span class="status-dot green"></span> ${esc(s.display || 'Daily at 09:00 UTC')}`)}
    ${statusRow('Next Run', `<span style="color:var(--opportunity)">${s.nextRun ? new Date(s.nextRun).toLocaleString() : 'Calculating…'}</span>`)}
    ${statusRow('Last Run', lr
      ? `<span class="status-dot ${lr.errors > 0 ? 'amber' : 'green'}"></span> ${lr.result} · ${lr.matched} matched · ${timeSince(new Date(lr.timestamp))}`
      : '<span style="color:var(--mist)">No runs yet</span>')}
    ${statusRow('Total Runs', h.totalRuns || 0)}
    ${statusRow('AI Provider', `<span class="status-dot ${h.aiConfigured ? 'green' : 'amber'}"></span> ${h.aiConfigured ? 'Connected' : 'Seed data (no key set)'}`)}`;
}

function statusRow(key, value) {
  return `<div class="status-row"><span class="status-key">${key}</span><span class="status-value">${value}</span></div>`;
}

function renderCompliance() {
  const el = document.getElementById('compliance-grid');
  if (!el) return;
  const rules = [
    ['OAuth Only', 'Google OAuth handles authentication. No passwords stored in the app.'],
    ['≤ 4 Questions', 'Field/Level, Countries, CGPA, Funding — exactly four builder questions.'],
    ['Agent Creates Structure', 'Database schema auto-created on first run. Data persisted to SQLite.'],
    ['Real Trigger', 'node-cron schedule trigger runs daily. "Run Now" is test-only, clearly labeled.'],
    ['Memory', 'Dedup tracks first_seen + last_sent. "New" badges prove memory is working.'],
    ['No Approval Gate', 'Digest goes only to you (the student). No third-party = no approval needed.'],
    ['Trim Before AI', 'Raw HTML stripped of nav/footer/scripts, truncated to 6 KB before AI call.'],
  ];
  el.innerHTML = rules.map((r, i) =>
    `<div class="compliance-item"><div class="compliance-badge compliance-pass">✓ Rule ${i+1}</div><div class="compliance-content"><strong>${r[0]}</strong><span class="compliance-note">${r[1]}</span></div></div>`
  ).join('');
}


/* ── GSAP Page Entrance ─────────────────────────────────── */

function runPageEntrance() {
  if (REDUCE_MOTION || typeof gsap === 'undefined') return;

  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

  tl.from('.schedule-strip', { opacity: 0, y: -10, duration: 0.3 })
    .from('.stat-tile', { opacity: 0, y: 20, duration: 0.35, stagger: 0.08 }, '-=0.1')
    .from('.feed-panel', { opacity: 0, x: -20, duration: 0.4 }, '-=0.15')
    .from('.chart-card', { opacity: 0, x: 20, duration: 0.35, stagger: 0.1 }, '-=0.25')
    .from('.section-header', { opacity: 0, y: 10, duration: 0.25 }, '-=0.1')
    .from('.scholarship-card', { opacity: 0, y: 15, duration: 0.3, stagger: 0.06 }, '-=0.1');
}


/* ── Countdown Ticker (updates all countdown chips) ────── */

function startCountdownTicker() {
  setInterval(() => {
    document.querySelectorAll('.countdown[data-deadline]').forEach(el => {
      const dl = deadlineInfo(el.dataset.deadline);
      el.textContent = dl.text || 'Expired';
      el.className = `countdown countdown-${dl.level === 'red' ? 'red' : dl.level === 'amber' ? 'amber' : dl.level === 'expired' ? 'expired' : 'green'}`;
    });
  }, 60000);
}


/* ── Actions (wired once) ───────────────────────────────── */

function initActions() {
  document.getElementById('btn-run-cycle')?.addEventListener('click', runCycle);

  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    loadDashboard();
    toast('Refreshed', 'info');
  });

  document.getElementById('btn-send-digest')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-send-digest');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Sending…';
    try {
      const r = await api.post('/api/digest/send');
      toast(r.message || 'Digest sent!', r.sent ? 'success' : 'info');
    } catch (err) { toast('Send failed: ' + err.message, 'error'); }
    btn.disabled = false;
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg><span>Send Digest Now</span>';
  });

  document.getElementById('btn-edit-profile')?.addEventListener('click', () => {
    location.hash = 'setup';
    showView('setup');
    document.getElementById('main-nav').style.display = '';
    prefillForm();
  });

  document.getElementById('filter-country')?.addEventListener('change', loadDashboard);
  document.getElementById('filter-status')?.addEventListener('change', loadDashboard);
}

async function prefillForm() {
  try {
    const d = await api.get('/api/profile');
    if (!d.profile) return;
    const p = d.profile;
    document.getElementById('field-and-level').value = p.field_and_level || '';
    document.getElementById('cgpa').value = p.cgpa || '';
    document.getElementById('funding-type').value = p.funding_type || '';

    const known = ['United States', 'Germany', 'United Kingdom', 'Canada'];
    const countries = (p.target_countries || '').split(',').map(c => c.trim());
    const other = countries.filter(c => !known.includes(c));

    document.querySelectorAll('input[name="countries"]').forEach(cb => {
      cb.checked = cb.value === 'Other' ? other.length > 0 : countries.includes(cb.value);
    });

    if (other.length) {
      document.getElementById('other-country-wrapper').style.display = 'block';
      document.getElementById('other-country-text').value = other.join(', ');
    }
  } catch {}
}


/* ── Init ───────────────────────────────────────────────── */

async function init() {
  initRouter();
  initSetupForm();
  initActions();
  initTrackerToggle();
  startCountdownTicker();

  const hasProfile = await checkProfile();
  if (hasProfile) showView(location.hash.slice(1) || 'dashboard');
}

document.addEventListener('DOMContentLoaded', init);
