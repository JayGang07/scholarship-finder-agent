<div align="center">

# 🎓 Scholarship Finder Agent

### AI-Powered Scholarship Discovery, Matching & Delivery — On Autopilot

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com)
[![SQLite](https://img.shields.io/badge/SQLite-sql.js-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://sql.js.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

<br/>

*Scholarship money goes unclaimed because eligible students never see the listing in time.*  
*This agent fixes that — it finds, matches, tracks, and delivers scholarship opportunities to your inbox every day.*

<br/>

[🚀 Live Demo](#-deployment) · [📖 How It Works](#-how-it-works) · [⚡ Quick Start](#-quick-start) · [🏗️ Architecture](#%EF%B8%8F-architecture)

</div>

---

## 🧠 What This Agent Does

Every cycle (daily by default), with **zero manual searching** after initial setup:

| # | Capability | Implementation |
|:-:|---|---|
| 1 | **Discovers** scholarships from curated, credible public sources | HTTP scraping of DAAD, Fulbright, Chevening, etc. |
| 2 | **Extracts** structured data from unstructured web pages | AI-powered extraction (OpenAI-compatible) |
| 3 | **Matches** against your actual academic profile | Deterministic filters + AI eligibility judgment |
| 4 | **Tracks** everything in a persistent database with memory | SQLite — dedup, deadline tracking, status management |
| 5 | **Composes** a punchy, personalized digest | "Why this fits you" lines, grouped by country & urgency |
| 6 | **Delivers** via email — or previews in the dashboard | SMTP (Gmail-compatible) with HTML-formatted emails |

---

## ⚡ Quick Start

```bash
# Clone the repository
git clone https://github.com/JayGang07/scholarship-finder-agent.git
cd scholarship-finder-agent

# Install dependencies (zero native builds — pure JavaScript)
npm install

# Start the development server
npm run dev

# Open your browser
# → http://localhost:3000
```

> **That's it.** The app works out of the box with seed data — no API keys, no database setup, no configuration required for first run.

### Optional: Configure AI & Email

```bash
cp .env.example .env
# Edit .env with your preferred AI provider and SMTP credentials
```

| Variable | Required | Default |
|----------|:--------:|---------|
| `AI_API_KEY` | ❌ | Uses seed scholarship data |
| `AI_BASE_URL` | ❌ | `https://api.openai.com/v1` |
| `AI_MODEL` | ❌ | `gpt-4o-mini` |
| `SMTP_HOST` | ❌ | Logs digest to console |
| `SMTP_USER` | ❌ | — |
| `SMTP_PASS` | ❌ | — |
| `RECIPIENT_EMAIL` | ❌ | Defaults to `SMTP_USER` |
| `CRON_SCHEDULE` | ❌ | `0 9 * * *` (Every day at 9 AM) |

---

## 📖 How It Works

### The 4 Builder Questions

On first launch, the user answers exactly 4 questions — nothing more:

| # | Question | Example Answer |
|:-:|---|---|
| 1 | What are you studying, and at what level? | `MS in Computer Science` |
| 2 | Which countries are you targeting? | `United States, Germany` |
| 3 | What's your CGPA/GPA and scale? | `8.5/10` |
| 4 | What kind of funding? | `Any funding` |

### The Pipeline

```
┌──────────┐     ┌──────────┐     ┌───────────┐     ┌─────────┐
│ Schedule │────▶│  Scrape  │────▶│  Extract  │────▶│  Match  │
│ (Cron)   │     │ (HTTP)   │     │   (AI)    │     │(Det+AI) │
└──────────┘     └──────────┘     └───────────┘     └────┬────┘
                                                         │
┌──────────┐     ┌──────────┐     ┌───────────┐         │
│  Email   │◀────│  Digest  │◀────│   Dedup   │◀────────┘
│ (SMTP)   │     │ (Compose)│     │ (Memory)  │
└──────────┘     └──────────┘     └───────────┘
```

1. **Schedule** — `node-cron` fires weekly (configurable)
2. **Scrape** — Fetches curated public sources via HTTP; strips HTML boilerplate (nav, footer, scripts) before AI sees it
3. **Extract** — AI converts cleaned page text into typed scholarship records (name, deadline, amount, eligibility, link)
4. **Match** — Two-stage: deterministic filter (country, degree, field) → AI eligibility check (handles GPA scale conversion like 8.5/10 vs 3.5/4.0)
5. **Dedup** — Checks against the tracker: skip if recently sent, re-include if deadline approaching (≤30 days), mark expired
6. **Digest** — Composes HTML email grouped by country with urgency badges and a punchy "why this fits you" line per entry
7. **Email** — Sends via SMTP (or logs to console if not configured)

### Curated Sources

All sources are **public pages** — no API keys, no logins, no OAuth:

| Country | Provider | Type |
|---------|----------|------|
| 🇩🇪 Germany | DAAD Scholarship Database | HTML |
| 🇩🇪 Germany | Deutschlandstipendium | HTML |
| 🇩🇪 Germany | Heinrich Böll Foundation | HTML |
| 🇺🇸 United States | Fulbright Foreign Student Program | HTML |
| 🇺🇸 United States | EducationUSA | HTML |
| 🇺🇸 United States | Humphrey Fellowship Program | HTML |
| 🇬🇧 United Kingdom | Chevening Scholarships | HTML |
| 🇨🇦 Canada | Vanier Canada Graduate Scholarships | HTML |

---

## 🏗️ Architecture

```
scholarship-finder-agent/
│
├── server/                        # Backend (Node.js + Express)
│   ├── index.js                   # Server entry + cron scheduler
│   ├── db.js                      # SQLite via sql.js (pure JS, no native build)
│   │
│   ├── data/
│   │   ├── sources.json           # 8 curated scholarship source URLs
│   │   └── seed.json              # 7 real scholarship records for first run
│   │
│   ├── routes/
│   │   ├── profile.js             # GET/POST /api/profile
│   │   ├── scholarships.js        # GET /api/scholarships + /stats
│   │   ├── digest.js              # GET /api/digest/preview, POST /send
│   │   └── trigger.js             # POST /api/trigger (full pipeline)
│   │
│   └── services/
│       ├── scraper.js             # HTTP fetch + boilerplate stripping
│       ├── extractor.js           # AI structured data extraction
│       ├── matcher.js             # Deterministic + AI eligibility
│       ├── dedup.js               # Memory / dedup against tracker
│       ├── digest.js              # HTML email composition
│       └── mailer.js              # Nodemailer SMTP delivery
│
├── public/                        # Frontend (Vanilla HTML/CSS/JS)
│   ├── index.html                 # SPA shell — 5 views
│   ├── style.css                  # 700+ line dark-mode design system
│   └── app.js                     # Router, API client, rendering
│
├── render.yaml                    # One-click Render deployment
├── .env.example                   # Environment variable reference
└── package.json                   # 4 dependencies only
```

### Design Decisions (Why This, Not That)

| Decision | Rationale |
|----------|-----------|
| **sql.js** instead of `better-sqlite3` | Pure JS — no C++ compiler, no `node-gyp`, installs everywhere |
| **Express** instead of Next.js/Vite | Backend-heavy agent, not a content site. Express is minimal and sufficient |
| **Vanilla HTML/CSS/JS** frontend | Dashboard doesn't need React. Zero build step, instant load |
| **Native `fetch()`** for HTTP | Node 18+ built-in. No `axios` dependency needed |
| **4 dependencies total** | `express`, `sql.js`, `node-cron`, `nodemailer` — nothing unnecessary |
| **Model-agnostic AI** | Configurable endpoint — works with OpenAI, Gemini, Ollama, anything compatible |

---

## 🔌 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Server health + config status |
| `GET` | `/api/profile` | Current student profile |
| `POST` | `/api/profile` | Save/update profile (4 fields) |
| `GET` | `/api/scholarships` | List all (filters: `?country=`, `?status=`) |
| `GET` | `/api/scholarships/stats` | Dashboard stats (total, active, approaching, expired) |
| `GET` | `/api/digest/preview` | Rendered HTML digest preview |
| `POST` | `/api/digest/send` | Send digest email via SMTP |
| `POST` | `/api/trigger` | Run full scraping cycle manually |

---

## 🚀 Deployment

### Render (Free Tier) — Recommended

This repo includes a `render.yaml` blueprint for one-click deployment:

1. Fork this repo / push to your GitHub
2. Go to [render.com](https://render.com) → **New+** → **Web Service**
3. Connect your GitHub → select `scholarship-finder-agent`
4. Render auto-detects settings from `render.yaml`
5. Click **Create Web Service** → live in ~2 minutes

### Other Platforms

| Platform | Command |
|----------|---------|
| **Local** | `npm install && npm run dev` |
| **Railway** | Connect repo → auto-detects `package.json` |
| **Fly.io** | `fly launch` → `fly deploy` |
| **Docker** | `docker build -t sf . && docker run -p 3000:3000 sf` |

---

## 🛡️ Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| No matching scholarships this cycle | Sends "nothing new this week" note — not an empty email |
| Source page structure changes | Skips that source, doesn't crash the whole flow |
| Deadline already passed | Marks `Status = Deadline Passed`, excludes from digest |
| GPA scale mismatch (4.0 vs 10.0 vs %) | AI eligibility check handles conversion |
| Same scholarship on two sources | Deduped by (name + provider) composite key |
| No AI key configured | Falls back to seed data — app still fully functional |
| No SMTP configured | Logs digest HTML to console — dashboard still works |

---

## 📋 Assignment Rule Compliance

| # | Rule | How Satisfied |
|:-:|------|---------------|
| 1 | **OAuth-only / no API keys** | All scholarship sources are public pages fetched via HTTP — no auth |
| 2 | **≤4 questions** | Exactly 4 builder questions (field, countries, GPA, funding) |
| 3 | **Agent creates its own structure** | SQLite DB auto-creates tables + seeds sample data on first run |
| 4 | **Real trigger** | `node-cron` weekly schedule — set once, runs forever |
| 5 | **Memory** | Dedup service + `last_sent` tracking prevents re-sending |
| 6 | **Approval gates** | Not needed — agent only emails the student themselves |
| 7 | **Trim before prompting AI** | HTML boilerplate stripped; content capped at 6000 chars |

---

## 📜 License

MIT — use it, fork it, build on it.

---

<div align="center">

**Built with ❤️ for students who deserve every scholarship they qualify for.**

</div>
