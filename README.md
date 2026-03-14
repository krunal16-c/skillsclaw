# SkillsClaw

Turn your Loom and Zoom workflow recordings into Claude Code slash commands.

Upload a video → AI extracts your workflow → Get a ready-to-use `SKILL.md` you can install in Claude Code.

---

## How it works

1. **Upload** a screen recording (MP4, WebM, MOV — up to 500MB)
2. **Process** — the AI pipeline transcribes audio, extracts frames, and analyzes your workflow
3. **Review** — edit the generated skill name, trigger phrases, and steps
4. **Install** — download as ZIP, auto-publish to GitHub, or copy a CLAUDE.md snippet

---

## Quick start (local dev)

### Prerequisites

- Docker + Docker Compose
- Node.js 20+
- Python 3.11+
- [Ollama](https://ollama.com) (for local vision model)
- An [Anthropic API key](https://console.anthropic.com) (for synthesis and skill generation)

### 1. Clone and configure

```bash
git clone <repo-url>
cd skillsclaw
cp .env.example .env
```

Edit `.env` — at minimum you need:
```
ANTHROPIC_API_KEY=sk-ant-...
```

Everything else has working defaults for local dev (`DEV_MODE=true` skips auth, SQLite-style local services via Docker).

### 2. Pull the local vision model

```bash
# Install Ollama: https://ollama.com/download
ollama pull qwen2.5vl:7b-q4_K_M
```

This is a 4-bit quantized Qwen2.5-VL 7B (~4.7GB). Requires ~6GB VRAM or runs on Apple Silicon unified memory.

### 3. Start the backend services

```bash
docker-compose up -d postgres redis
```

### 4. Run the backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

In a second terminal, start the Celery worker:

```bash
cd backend
source .venv/bin/activate
celery -A app.pipeline.worker worker --loglevel=info --concurrency=2
```

### 5. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Dev mode (no auth)

`DEV_MODE=true` is set by default in `.env.example`. When active:

- All auth checks are skipped
- A fixed **Dev User** (`dev@skillsclaw.local`) is auto-created and used for every request
- No GitHub OAuth or JWT setup needed
- The `/api/auth/me` endpoint returns the dev user

To test auth flows, set `DEV_MODE=false` and configure `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.

---

## Vision provider

The frame analysis step supports three backends, controlled by `VISION_PROVIDER` in `.env`:

| Provider | Env value | When to use |
|----------|-----------|-------------|
| Ollama (local Qwen2.5-VL) | `ollama` | Local dev — free, private, no API key needed |
| Google Gemini | `gemini` | Production — fast, requires `GOOGLE_API_KEY` |
| Anthropic Claude | `anthropic` | Production — highest quality, requires `ANTHROPIC_API_KEY` |

Switch by changing one line in `.env` — no code changes needed.

---

## Project structure

```
skillsclaw/
├── backend/            FastAPI API + Celery pipeline
│   └── app/
│       ├── api/        REST endpoints
│       ├── models/     SQLAlchemy models
│       ├── pipeline/   AI processing steps
│       ├── services/   R2, GitHub, Stripe clients
│       └── schemas/    Pydantic schemas
├── frontend/           React + Vite + TypeScript
│   └── src/
│       ├── pages/      Route-level components
│       ├── components/ Shared UI components
│       └── lib/        API client + SSE hook
├── docs/
│   └── architecture.md Full system design
├── docker-compose.yml  Local dev services
└── .env.example        All config options documented
```

See [docs/architecture.md](docs/architecture.md) for the full system design.

---

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `REDIS_URL` | Yes | — | Redis connection string |
| `SECRET_KEY` | Yes | — | JWT signing secret |
| `DEV_MODE` | No | `false` | Skip auth, use fixed dev user |
| `ANTHROPIC_API_KEY` | No* | — | Required for synthesis + skill gen |
| `VISION_PROVIDER` | No | `ollama` | `ollama` / `gemini` / `anthropic` |
| `OLLAMA_BASE_URL` | No | `http://localhost:11434` | Local Ollama server |
| `OLLAMA_VISION_MODEL` | No | `qwen2.5vl:7b-q4_K_M` | Vision model tag |
| `GOOGLE_API_KEY` | No* | — | Required when `VISION_PROVIDER=gemini` |
| `GEMINI_VISION_MODEL` | No | `gemini-1.5-flash` | Gemini model name |
| `R2_ACCOUNT_ID` | Yes | — | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | Yes | — | R2 access key |
| `R2_SECRET_ACCESS_KEY` | Yes | — | R2 secret key |
| `R2_BUCKET_NAME` | Yes | — | R2 bucket name |
| `R2_PUBLIC_URL` | Yes | — | Public R2 URL |
| `GITHUB_CLIENT_ID` | No* | — | Required when `DEV_MODE=false` |
| `GITHUB_CLIENT_SECRET` | No* | — | Required when `DEV_MODE=false` |
| `STRIPE_SECRET_KEY` | No | — | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | No | — | Stripe webhook signing secret |
| `RESEND_API_KEY` | No | — | Email notifications |
| `FRONTEND_URL` | No | `http://localhost:5173` | Frontend origin for CORS + redirects |

---

## API

Base URL: `http://localhost:8000`

```
GET  /health                         → Service health check

POST /api/upload/presign             → Get R2 presigned URL + create Job
POST /api/upload/complete            → Trigger video processing

GET  /api/jobs/{id}                  → Job details
GET  /api/jobs/{id}/status           → SSE stream: live progress updates

GET  /api/skills                     → List your skills
GET  /api/skills/{id}                → Skill detail + full SKILL.md
PATCH /api/skills/{id}               → Update skill
POST /api/skills/{id}/publish        → Publish (zip/github/snippet/marketplace)
GET  /api/skills/{id}/download       → Download as ZIP
POST /api/skills/{id}/snippet        → Generate CLAUDE.md snippet
POST /api/skills/{id}/regenerate     → Re-run skill generation

GET  /api/marketplace                → Public skills directory
GET  /api/marketplace/{id}           → Public skill detail

GET  /api/auth/github/login          → GitHub OAuth redirect
GET  /api/auth/github/callback       → OAuth callback
GET  /api/auth/me                    → Current user
POST /api/auth/logout                → Logout
```

Full interactive docs at [http://localhost:8000/docs](http://localhost:8000/docs) (Swagger UI).

---

## Tech stack

- **Backend**: FastAPI, Celery, SQLAlchemy, Alembic, PostgreSQL, Redis
- **Frontend**: React, Vite, TypeScript, Tailwind CSS
- **AI**: Anthropic Claude Sonnet 4.6, Qwen2.5-VL (via Ollama), Google Gemini
- **Transcription**: faster-whisper
- **Frame extraction**: ffmpeg
- **Storage**: Cloudflare R2
- **Auth**: GitHub OAuth + JWT
- **Payments**: Stripe
