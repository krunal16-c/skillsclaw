# SkillsClaw — Architecture

## Overview

SkillsClaw is a **workflow-to-skill compiler**. Users upload a workflow video/audio recording or a SOP document (PDF, DOCX, text, markdown), or paste text directly. The platform:

1. Extracts the underlying workflow using an AI pipeline
2. Generates a distributable Claude Code `SKILL.md` package
3. Delivers it as a ZIP download, GitHub-hosted package, CLAUDE.md snippet, or marketplace listing

---

## System diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (React SPA)                                                │
│  Upload (Video / SOP / Paste) → Status (SSE) → Review → Publish    │
└─────────────────────┬───────────────────────────────────────────────┘
                      │ HTTP / SSE
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│  FastAPI (Python)                                                   │
│  /api/upload  /api/jobs  /api/skills  /api/marketplace  /api/auth  │
└──────┬──────────────────────────────┬──────────────────────────────┘
       │                              │
       │ Enqueue job                  │ Read/write
       ▼                              ▼
┌─────────────┐              ┌────────────────┐
│  Redis      │              │  PostgreSQL     │
│  (Celery    │              │  Users, Jobs,   │
│   queue)    │              │  Skills         │
└──────┬──────┘              └────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Celery Worker                                                      │
│                                                                     │
│  1. PROCESSING    transcribe.py / extract_sop.py  (audio or doc)   │
│  2. SYNTHESIZING  synthesize.py  → WorkflowStep[] JSON → DB        │
│  3. GENERATING    generate_skill.py → SKILL.md → Skill record      │
└──────┬──────────────────────────────────────────────────────────────┘
       │
       │ Upload / download files
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  MinIO (S3-compatible, self-hosted via Docker)                      │
│  jobs/{job_id}/video/{filename}   — uploaded video / audio         │
│  jobs/{job_id}/sop/{filename}     — uploaded SOP document          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Input paths

SkillsClaw accepts three input types that share the same downstream synthesis and skill-generation pipeline:

| Input | Endpoint | Processing step |
|-------|----------|-----------------|
| Video / audio (MP4, WebM, MOV, AVI, MP3, M4A ≤ 500 MB) | `POST /api/upload/presign` → direct upload → `POST /api/upload/complete` | faster-whisper transcription |
| SOP document (PDF, DOCX, TXT, MD ≤ 20 MB) | `POST /api/upload/presign` → direct upload → `POST /api/upload/complete` | pypdf / python-docx text extraction |
| Pasted text (50–100 000 chars) | `POST /api/upload/paste` | None — text used directly, skips PROCESSING step |

---

## Request lifecycle

### Video / SOP file upload flow

```
Browser
  → POST /api/upload/presign        (filename, content_type, file_size, llm_provider?, llm_model?)
  ← { job_id, presigned_url, fields, r2_key, llm_provider, llm_model }

Browser
  → PUT file directly to MinIO      (presigned URL — no backend bandwidth used)

Browser
  → POST /api/upload/complete       (job_id)
  ← { job_id, status: "pending" }

FastAPI
  → Celery: process_job.delay(job_id)

Browser
  → GET /api/jobs/{id}/status       (SSE — events streamed every 2 s)
  ← event: { status, progress, current_step }
```

### Paste text flow

```
Browser
  → POST /api/upload/paste          (text, llm_provider?, llm_model?)
  ← { job_id, status: "synthesizing" }
  (no file upload — pipeline starts immediately at SYNTHESIZING step)

Browser
  → GET /api/jobs/{id}/status       (SSE)
  ← event: { status, progress, current_step }
```

### Processing pipeline

Each step runs sequentially inside a single Celery task. Status and progress are written to the `jobs` table after each step; the SSE endpoint reads the DB and streams updates to the browser.

| Step | Module | Status written | Progress |
|------|--------|---------------|----------|
| Start | worker.py | `processing` | 10% |
| Extract content | transcribe.py (video) or extract_sop.py (sop) | — | 40% |
| Workflow synthesis | synthesize.py | `synthesizing` | 45–75% |
| Skill generation | generate_skill.py | `generating_skill` | 80–100% |
| Done | worker.py | `ready_for_review` | 100% |

On failure at any step, status is set to `failed` and the error message is stored in `jobs.error`.

Paste-text jobs start at `synthesizing` and skip the PROCESSING step entirely.

---

## AI pipeline — detail

### Step 1: Content extraction

**Video / audio path (`pipeline/transcribe.py`)**
- Downloads file from MinIO to a temp path
- Runs `faster-whisper` (model `base` or `small`) locally — no external API needed
- Outputs: `transcript` (full text string) + `transcript_segments` (JSONB array of `{start, end, text}`)
- Stored in `jobs.transcript` + `jobs.transcript_segments`

**SOP document path (`pipeline/extract_sop.py`)**
- Downloads file from MinIO to a temp path
- Detects type from original filename extension:
  - `.pdf` → `pypdf.PdfReader` — all pages concatenated
  - `.docx` → `python-docx Document` — all paragraphs joined
  - `.txt` / `.md` → UTF-8 decode
- Stored in `jobs.sop_text`

**Paste text path**
- `jobs.sop_text` is already populated at job creation — this step is skipped

### Step 2: Workflow synthesis (`pipeline/synthesize.py`)

- Uses `jobs.transcript` (video) or `jobs.sop_text` (SOP/paste) as the sole input
- Sends text to the configured LLM via `app.services.llm.generate_text()`
- Prompt instructs the model to extract discrete, reusable workflow steps
- Output: `WorkflowStep[]` JSON — **persisted to `jobs.workflow_steps` (JSONB) in the DB**
  - Persisting to DB (not an in-process dict) means the next step survives worker restarts

```json
[{
  "step_number": 1,
  "name": "Create feature branch",
  "description": "...",
  "tool": "Terminal",
  "command_or_action": "git checkout -b feature/my-feature",
  "input": "Clean main branch",
  "output": "New branch checked out"
}]
```

### Step 3: Skill generation (`pipeline/generate_skill.py`)

- Reads `job.workflow_steps` from DB
- Sends workflow steps to the configured LLM
- Generates a complete `SKILL.md` string matching the real `anthropics/skills` format
- Creates the `Skill` record in the DB with `status=ready_for_review`

---

## LLM provider abstraction

All LLM calls route through `app/services/llm.py` → `generate_text()`. The provider is chosen per-job via `job.llm_provider` / `job.llm_model`, falling back to the global `LLM_PROVIDER` setting.

| Provider | Env value | Required key |
|----------|-----------|-------------|
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` |
| OpenAI | `openai` | `OPENAI_API_KEY` |
| Gemini | `gemini` | `GOOGLE_API_KEY` |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` |
| Ollama (local) | `ollama` | none |

Per-job override: the presign and paste endpoints accept optional `llm_provider` and `llm_model` body fields that override the global default for that specific job.

---

## SKILL.md output format

Generated skills match the real `anthropics/skills` repository format exactly:

```markdown
---
name: deploy-to-staging
description: >-
  Use this skill when the user asks to deploy to staging, push their branch to
  the staging environment, or run a staging deploy. Also activate when someone
  says "ship to staging," "deploy this feature to staging," or "can you run the
  staging deploy for me."
---

# Deploy to Staging

## Overview
Deploys the current feature branch to the staging environment...

## Prerequisites
- Feature branch checked out (not main)
- Docker running locally
- kubectl configured for staging cluster

## Steps
1. Verify on feature branch: `git branch --show-current`
2. Run build: `npm run build`
...

## When to use this skill
- "deploy to staging"
- "push this to staging so QA can test it"
- "run the staging deploy"
```

Key rules:
- Frontmatter: **only `name` and `description`** — no `version`, no `allowed-tools`
- Description: `>-` YAML block scalar (folded, strip trailing newline), prose sentences not a bulleted list
- Description is "slightly pushy" — written broadly enough to prevent undertriggering

---

## Skill package structure

```
deploy-to-staging/
├── SKILL.md          ← the skill definition (frontmatter + instructions)
├── README.md         ← human-readable description and install instructions
└── evals/
    └── evals.json    ← starter eval stubs for CI testing
```

---

## Delivery methods

### ZIP download
Packages `{skill-name}/SKILL.md`, `{skill-name}/README.md`, and `{skill-name}/evals/evals.json` into a zip. User extracts and places the folder in `~/.claude/skills/` or their project's `.claude/skills/`.

### GitHub auto-publish
1. User connects GitHub via OAuth
2. SkillsClaw creates `{username}/skillsclaw-skills` repo (if not exists)
3. Commits skill under `skills/{name}/SKILL.md`
4. Returns install command: `npx skills add {username}/skillsclaw-skills@{name}`

### CLAUDE.md snippet
Generates a self-contained markdown block with the full `SKILL.md` content embedded inside `<skill>…</skill>` tags. User pastes it directly into `~/.claude/CLAUDE.md` or their project CLAUDE.md — no installation or file management needed, works in any Claude Code session.

### Marketplace
Public skills are listed at `/marketplace`. Each has a slug-based URL. Other users can view the skill and copy the install command.

---

## Data model

```
User
  id (UUID PK)
  email, name, github_username, github_token
  plan (free | pro), skills_this_month
  stripe_customer_id

Job
  id (UUID PK)
  user_id (FK → User, nullable — anonymous uploads allowed)
  input_type          — "video" or "sop"
  r2_key              — MinIO object path (nullable for paste-text jobs)
  original_filename   — original upload filename (nullable for paste)
  file_size           — bytes (nullable for paste)
  duration_seconds    — video duration (nullable)
  status (JobStatus)  — pending | processing | synthesizing | generating_skill
                        | ready_for_review | published | failed
  progress (0-100)
  current_step        — human-readable label for SSE display
  transcript (Text)   — faster-whisper output (video path)
  transcript_segments (JSONB)
  sop_text (Text)     — extracted doc text or pasted text (SOP/paste path)
  workflow_steps (JSONB) — synthesized WorkflowStep[] array; persisted to DB
  llm_provider        — per-job provider override (nullable → uses global default)
  llm_model           — per-job model override (nullable → uses provider default)
  error (Text)

Skill
  id (UUID PK)
  job_id (FK → Job, unique)
  user_id (FK → User)
  name (slug)         — e.g. "deploy-to-staging"
  title               — human-readable title
  description (Text)  — prose trigger description
  content (Text)      — complete SKILL.md string
  workflow_steps (JSONB)
  trigger_phrases (array)
  visibility (private | public)
  published_at, github_repo_url, install_command
  download_count
```

---

## Authentication

### Development (`DEV_MODE=true`)
- All auth checks are bypassed
- A fixed dev user (`dev@skillsclaw.local`, UUID `00000000-0000-0000-0000-000000000001`) is returned for every request
- Auto-created in DB on first request
- No token, no OAuth setup needed

### Production (`DEV_MODE=false`)
- GitHub OAuth 2.0 flow
- On callback: user upserted in DB, JWT issued (7-day expiry)
- All protected endpoints require `Authorization: Bearer <token>`

---

## Storage layout (MinIO)

MinIO runs as a Docker service on ports 9000 (API) and 9001 (console). A one-shot `createbuckets` container runs `mc` on startup to create the `skillsclaw` bucket.

```
skillsclaw/                      ← bucket
└── jobs/
    └── {job_id}/
        ├── video/{filename}     ← uploaded video or audio file
        └── sop/{filename}       ← uploaded SOP document (PDF/DOCX/TXT/MD)
```

Paste-text jobs store no file — `r2_key` is null and MinIO is not accessed.

In production, MinIO can be swapped for any S3-compatible service (AWS S3, Cloudflare R2, Backblaze B2) by changing the four `S3_*` environment variables.

---

## Concurrency model

- FastAPI runs async (asyncio) — handles many concurrent HTTP requests
- Long-running processing is offloaded to Celery workers — the API never blocks
- SSE endpoint polls the DB every 2 seconds — simple, no WebSocket complexity
- Celery concurrency: `--concurrency=2` by default; scale by adding more workers or increasing concurrency

---

## Environment-based configuration

All behaviour is controlled via environment variables — no code changes needed to switch between local dev and production:

| Concern | Dev | Production |
|---------|-----|-----------|
| Auth | `DEV_MODE=true` | `DEV_MODE=false` + GitHub OAuth |
| LLM | `LLM_PROVIDER=ollama` (local) | Any provider; per-job selectable |
| Storage | MinIO via Docker | Any S3-compatible service |
| DB | Local PostgreSQL via Docker | Managed PostgreSQL (Neon, RDS, etc.) |
| Queue | Local Redis via Docker | Upstash Redis or managed Redis |

---

## Adding a new LLM provider

1. Add a new `elif provider == "name":` branch in `app/services/llm.py` → `generate_text()`
2. Add the provider name to `SUPPORTED_LLM_PROVIDERS` set
3. Add any new config vars to `app/config.py` and `.env.example`
4. No changes needed in the pipeline — all steps call `generate_text()` uniformly
