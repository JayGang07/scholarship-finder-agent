# 🎓 Scholarship Finder Agent

AI-powered scholarship finder that scrapes curated public sources, matches scholarships to your academic profile, tracks deadlines, and delivers a weekly digest email — on autopilot.

## Quick Start

```bash
# Install dependencies
npm install

# Start the development server
npm run dev

# Open in browser
# → http://localhost:3000
```

## How It Works

1. **Setup** — Answer 4 questions about your profile (field, countries, GPA, funding preference)
2. **Discover** — The agent scrapes curated scholarship sources (DAAD, Fulbright, Chevening, etc.)
3. **Match** — AI extracts scholarship data and checks your eligibility (handles GPA scale conversion)
4. **Track** — All findings are stored in a SQLite database with deduplication and deadline tracking
5. **Deliver** — A weekly digest email with matched scholarships, grouped by country and urgency

## Architecture

```
server/
├── index.js              # Express server + cron scheduler
├── db.js                 # SQLite database (profile, scholarships, run log)
├── routes/
│   ├── profile.js        # CRUD for the 4 setup questions
│   ├── scholarships.js   # Scholarship tracker API
│   ├── digest.js         # Email digest preview + send
│   └── trigger.js        # Full scraping cycle orchestrator
├── services/
│   ├── scraper.js        # HTTP fetch + HTML cleanup
│   ├── extractor.js      # AI structured data extraction
│   ├── matcher.js        # Deterministic + AI eligibility matching
│   ├── dedup.js          # Deduplication against seen log
│   ├── digest.js         # HTML email composition
│   └── mailer.js         # SMTP email delivery
└── data/
    ├── sources.json      # Curated scholarship source URLs
    └── seed.json         # Sample data for first run

public/
├── index.html            # SPA shell
├── style.css             # Dark-mode design system
└── app.js                # Frontend logic
```

## Configuration

Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `AI_BASE_URL` | No | OpenAI-compatible API endpoint (default: OpenAI) |
| `AI_API_KEY` | No | API key for AI extraction/matching (uses seed data if not set) |
| `AI_MODEL` | No | Model name (default: gpt-4o-mini) |
| `SMTP_HOST` | No | SMTP server (default: smtp.gmail.com) |
| `SMTP_PORT` | No | SMTP port (default: 587) |
| `SMTP_USER` | No | SMTP username/email |
| `SMTP_PASS` | No | SMTP password or app password |
| `RECIPIENT_EMAIL` | No | Digest recipient (defaults to SMTP_USER) |
| `CRON_SCHEDULE` | No | Cron expression (default: `0 9 * * 1` = Monday 9 AM) |
| `PORT` | No | Server port (default: 3000) |

> **Note:** The app works out of the box without any env vars — it uses seed scholarship data and logs emails to the console.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Server health + config status |
| `GET` | `/api/profile` | Get current profile |
| `POST` | `/api/profile` | Save/update profile |
| `GET` | `/api/scholarships` | List scholarships (filters: `country`, `status`) |
| `GET` | `/api/scholarships/stats` | Dashboard summary stats |
| `GET` | `/api/digest/preview` | Preview digest HTML |
| `POST` | `/api/digest/send` | Send digest email |
| `POST` | `/api/trigger` | Run a full scraping cycle |

## Curated Sources

| Country | Provider |
|---------|----------|
| 🇩🇪 Germany | DAAD, Deutschlandstipendium, Heinrich Böll Foundation |
| 🇺🇸 United States | Fulbright, EducationUSA, Humphrey Fellowship, AAUW |
| 🇬🇧 United Kingdom | Chevening |
| 🇨🇦 Canada | Vanier CGS |

## License

MIT
