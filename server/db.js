/**
 * Database layer — SQLite via sql.js (pure JavaScript, no native build).
 * Persists to disk by writing the DB buffer to a file on every mutation.
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'scholarships.db');
const SEED_PATH = path.join(__dirname, 'data', 'seed.json');

let db = null;
let dbReady = null; // Promise that resolves when DB is initialized

function initDb() {
  if (dbReady) return dbReady;

  dbReady = (async () => {
    const SQL = await initSqlJs();

    // Ensure data directory exists
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

    // Load existing DB or create new
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }

    // Create tables
    db.run(`
      CREATE TABLE IF NOT EXISTS profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        field_and_level TEXT NOT NULL,
        target_countries TEXT NOT NULL,
        cgpa TEXT NOT NULL,
        funding_type TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS scholarships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        country TEXT NOT NULL,
        degree_level TEXT DEFAULT '',
        field TEXT DEFAULT '',
        funding_type TEXT DEFAULT '',
        amount TEXT DEFAULT '',
        deadline TEXT DEFAULT '',
        required_documents TEXT DEFAULT '',
        eligibility_text TEXT DEFAULT '',
        eligibility_status TEXT DEFAULT '',
        why_it_fits TEXT DEFAULT '',
        application_link TEXT DEFAULT '',
        first_seen TEXT DEFAULT (datetime('now')),
        last_sent TEXT DEFAULT '',
        status TEXT DEFAULT 'Active',
        source_url TEXT DEFAULT '',
        gpa_fit TEXT DEFAULT '',
        confidence TEXT DEFAULT '',
        new_since_last_digest TEXT DEFAULT 'Y',
        documents_checklist TEXT DEFAULT '',
        UNIQUE(name, provider)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS run_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT DEFAULT (datetime('now')),
        finished_at TEXT,
        sources_checked INTEGER DEFAULT 0,
        new_found INTEGER DEFAULT 0,
        matched INTEGER DEFAULT 0,
        skipped INTEGER DEFAULT 0,
        errors INTEGER DEFAULT 0,
        error_details TEXT DEFAULT ''
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS digest_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT DEFAULT (datetime('now')),
        html TEXT NOT NULL,
        scholarship_count INTEGER DEFAULT 0,
        sent_to TEXT DEFAULT ''
      )
    `);

    // --- Migration: add new columns to existing DBs ---
    migrateSchema();

    // Seed scholarships if table is empty
    const countResult = db.exec('SELECT COUNT(*) as c FROM scholarships');
    const count = countResult[0]?.values[0]?.[0] || 0;
    if (count === 0) {
      seedScholarships();
    }

    save();
    console.log('[DB] Initialized (sql.js)');
    return db;
  })();

  return dbReady;
}

function migrateSchema() {
  // Add columns if they don't exist (safe for fresh + existing DBs)
  const cols = getColumnNames('scholarships');
  const migrations = [
    { col: 'gpa_fit', sql: "ALTER TABLE scholarships ADD COLUMN gpa_fit TEXT DEFAULT ''" },
    { col: 'confidence', sql: "ALTER TABLE scholarships ADD COLUMN confidence TEXT DEFAULT ''" },
    { col: 'new_since_last_digest', sql: "ALTER TABLE scholarships ADD COLUMN new_since_last_digest TEXT DEFAULT 'Y'" },
    { col: 'documents_checklist', sql: "ALTER TABLE scholarships ADD COLUMN documents_checklist TEXT DEFAULT ''" },
  ];

  for (const m of migrations) {
    if (!cols.includes(m.col)) {
      try {
        db.run(m.sql);
        console.log(`[DB] Migrated: added column '${m.col}'`);
      } catch (err) {
        // Column may already exist — ignore
      }
    }
  }
}

function getColumnNames(tableName) {
  try {
    const result = db.exec(`PRAGMA table_info(${tableName})`);
    if (!result[0]) return [];
    return result[0].values.map((row) => row[1]); // column name is index 1
  } catch {
    return [];
  }
}

function save() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function getDb() {
  if (!db) throw new Error('DB not initialized — call initDb() first');
  return db;
}

function seedScholarships() {
  if (!fs.existsSync(SEED_PATH)) return;

  const seeds = JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8'));
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO scholarships
      (name, provider, country, degree_level, field, funding_type, amount,
       deadline, required_documents, eligibility_text, application_link, status,
       gpa_fit, confidence, new_since_last_digest, documents_checklist)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?, 'Y', ?)
  `);

  for (const item of seeds) {
    stmt.run([
      item.name, item.provider, item.country, item.degreeLevel,
      item.field, item.fundingType, item.amount, item.deadline,
      item.requiredDocuments, item.eligibilityText, item.applicationLink,
      item.gpaFit || '', item.confidence || '', item.documentsChecklist || '',
    ]);
  }
  stmt.free();
  save();
  console.log(`[DB] Seeded ${seeds.length} scholarships`);
}

// --- Helper to run SELECT and return array of objects ---
function query(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);

  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const rows = query(sql, params);
  return rows[0] || null;
}

function execute(sql, params = []) {
  if (params.length) {
    const stmt = db.prepare(sql);
    stmt.run(params);
    stmt.free();
  } else {
    db.run(sql);
  }
  save();
}

// --- Profile helpers ---

function getProfile() {
  return queryOne('SELECT * FROM profile WHERE id = 1');
}

function upsertProfile({ fieldAndLevel, targetCountries, cgpa, fundingType }) {
  const countries = Array.isArray(targetCountries)
    ? targetCountries.join(', ')
    : targetCountries;

  execute(`
    INSERT INTO profile (id, field_and_level, target_countries, cgpa, funding_type)
    VALUES (1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      field_and_level = excluded.field_and_level,
      target_countries = excluded.target_countries,
      cgpa = excluded.cgpa,
      funding_type = excluded.funding_type,
      updated_at = datetime('now')
  `, [fieldAndLevel, countries, cgpa, fundingType]);

  return getProfile();
}

// --- Scholarship helpers ---

function getAllScholarships(filters = {}) {
  let sql = 'SELECT * FROM scholarships WHERE 1=1';
  const params = [];

  if (filters.country) {
    sql += ' AND country = ?';
    params.push(filters.country);
  }
  if (filters.status) {
    sql += ' AND status = ?';
    params.push(filters.status);
  }

  sql += ' ORDER BY deadline ASC';
  return query(sql, params);
}

function getScholarshipStats() {
  const total = queryOne('SELECT COUNT(*) as c FROM scholarships')?.c || 0;
  const active = queryOne("SELECT COUNT(*) as c FROM scholarships WHERE status = 'Active'")?.c || 0;
  const approaching = queryOne(`
    SELECT COUNT(*) as c FROM scholarships
    WHERE status = 'Active'
      AND deadline != ''
      AND date(deadline) <= date('now', '+30 days')
      AND date(deadline) >= date('now')
  `)?.c || 0;
  const passed = queryOne("SELECT COUNT(*) as c FROM scholarships WHERE status = 'Deadline Passed'")?.c || 0;
  const newCount = queryOne("SELECT COUNT(*) as c FROM scholarships WHERE new_since_last_digest = 'Y'")?.c || 0;

  return { total, active, approaching, passed, newCount };
}

function upsertScholarship(s) {
  execute(`
    INSERT INTO scholarships
      (name, provider, country, degree_level, field, funding_type, amount,
       deadline, required_documents, eligibility_text, eligibility_status,
       why_it_fits, application_link, source_url, status,
       gpa_fit, confidence, new_since_last_digest, documents_checklist)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name, provider) DO UPDATE SET
      deadline = excluded.deadline,
      amount = excluded.amount,
      eligibility_text = excluded.eligibility_text,
      eligibility_status = excluded.eligibility_status,
      why_it_fits = excluded.why_it_fits,
      application_link = excluded.application_link,
      status = excluded.status,
      gpa_fit = excluded.gpa_fit,
      confidence = excluded.confidence,
      new_since_last_digest = excluded.new_since_last_digest,
      documents_checklist = excluded.documents_checklist
  `, [
    s.name || '', s.provider || '', s.country || '',
    s.degreeLevel || s.degree_level || '', s.field || '',
    s.fundingType || s.funding_type || '', s.amount || '',
    s.deadline || '', s.requiredDocuments || s.required_documents || '',
    s.eligibilityText || s.eligibility_text || '',
    s.eligibilityStatus || s.eligibility_status || '',
    s.whyItFits || s.why_it_fits || '',
    s.applicationLink || s.application_link || '',
    s.sourceUrl || s.source_url || '',
    s.status || 'Active',
    s.gpaFit || s.gpa_fit || '',
    s.confidence || '',
    s.newSinceLastDigest || s.new_since_last_digest || 'Y',
    s.documentsChecklist || s.documents_checklist || '',
  ]);
}

function markSent(ids) {
  for (const id of ids) {
    execute("UPDATE scholarships SET last_sent = datetime('now'), new_since_last_digest = 'N' WHERE id = ?", [id]);
  }
}

function markDeadlinesPassed() {
  execute(`
    UPDATE scholarships
    SET status = 'Deadline Passed'
    WHERE status = 'Active'
      AND deadline != ''
      AND date(deadline) < date('now')
  `);
}

// --- Run log helpers ---

function createRunLog() {
  execute("INSERT INTO run_log (started_at) VALUES (datetime('now'))");
  const row = queryOne('SELECT last_insert_rowid() as id');
  return row?.id || 0;
}

function updateRunLog(id, data) {
  execute(`
    UPDATE run_log SET
      finished_at = datetime('now'),
      sources_checked = ?,
      new_found = ?,
      matched = ?,
      skipped = ?,
      errors = ?,
      error_details = ?
    WHERE id = ?
  `, [
    data.sourcesChecked || 0, data.newFound || 0, data.matched || 0,
    data.skipped || 0, data.errors || 0, data.errorDetails || '', id,
  ]);
}

function getLastRun() {
  return queryOne('SELECT * FROM run_log ORDER BY id DESC LIMIT 1');
}

function getRunStats() {
  const lastRun = getLastRun();
  const totalRuns = queryOne('SELECT COUNT(*) as c FROM run_log')?.c || 0;
  return { lastRun, totalRuns };
}

// --- Digest log helpers ---

function saveDigestLog(html, scholarshipCount, sentTo) {
  execute(`
    INSERT INTO digest_log (html, scholarship_count, sent_to)
    VALUES (?, ?, ?)
  `, [html, scholarshipCount, sentTo]);
}

function getLastDigest() {
  return queryOne('SELECT * FROM digest_log ORDER BY id DESC LIMIT 1');
}

module.exports = {
  initDb,
  getDb,
  getProfile,
  upsertProfile,
  getAllScholarships,
  getScholarshipStats,
  upsertScholarship,
  markSent,
  markDeadlinesPassed,
  createRunLog,
  updateRunLog,
  getLastRun,
  getRunStats,
  saveDigestLog,
  getLastDigest,
  queryOne,
};
