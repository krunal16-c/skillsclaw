# SkillsClaw — Architecture

## Overview

SkillsClaw is a **workflow-to-skill compiler**. Users record themselves doing work in Loom or Zoom, upload the video, and the platform:

1. Extracts the underlying workflow using an AI pipeline
2. Generates a distributable Claude Code `SKILL.md` package
3. Delivers it as a ZIP download, GitHub-hosted package, CLAUDE.md snippet, or marketplace listing

---

## System diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (React SPA)                                                │
│  Upload → Status (SSE) → Review → Publish                          │
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
│   queue)    │              │  Frames, Skills │
└──────┬──────┘              └────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Celery Worker                                                      │
│                                                                     │
│  1. transcribe.py    faster-whisper → transcript + timestamps       │
│  2. frames.py        ffmpeg → JPEG frames @ 1080p                   │
│  3. vision.py        VLM → tool/action/description per frame        │
│  4. synthesize.py    Claude Sonnet → WorkflowStep[] JSON            │
│  5. generate_skill   Claude Sonnet → SKILL.md string                │
└──────┬──────────────────────────────────────────────────────────────┘
       │                              │
       │ Upload frames                │ Read video/frames
       ▼                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Cloudflare R2                                                      │
│  videos/{job_id}/original.*   jobs/{job_id}/frames/frame_NNNN.jpg  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Request lifecycle

### Upload flow

```
Browser
  → POST /api/upload/presign        (filename, content_type, file_size)
  ← { job_id, presigned_url, fields, r2_key }

Browser
  → PUT video directly to R2        (presigned URL, no server bandwidth used)

Browser
  → POST /api/upload/complete       (job_id)
  ← { job_id, status: "pending" }

FastAPI
  → Celery: process_video.delay(job_id)

Browser
  → GET /api/jobs/{id}/status       (SSE — receives events every 2s)
  ← event: { status, progress, current_step }
```

### Processing pipeline

Each step runs sequentially inside a single Celery task. Status and progress are written to the `jobs` table after each step; the SSE endpoint polls the DB and streams updates to the browser.

| Step | Module | Status written | Progress |
|------|--------|---------------|----------|
| Start | worker.py | `transcribing` | 5% |
| Transcription | transcribe.py | — | 25% |
| Frame extraction | frames.py | `extracting_frames` | 45% |
| Frame analysis | vision.py | `analyzing_frames` | 65% |
| Workflow synthesis | synthesize.py | `synthesizing` | 80% |
| Skill generation | generate_skill.py | `generating_skill` | 95% |
| Done | worker.py | `ready_for_review` | 100% |

On failure at any step, status is set to `failed` with the error message stored in `jobs.error`.

---

## AI pipeline — detail

### Step 1: Transcription (`pipeline/transcribe.py`)

- Downloads video from R2 to a temp file
- Runs `faster-whisper` with `word_timestamps=True`, model `base` (or `small` for better accuracy)
- Outputs: `transcript` (full text) + `transcript_segments` (JSON array of `{start, end, text}`)
- Stored in `jobs.transcript` and `jobs.transcript_segments`

### Step 2: Frame extraction (`pipeline/frames.py`)

- Runs two ffmpeg passes:
  1. Scene-change detection: `select='gt(scene,0.3)'` — captures moments of significant visual change
  2. Uniform sampling fallback: one frame every 8 seconds if scene changes < 10
- Frames extracted at 1080p resolution as JPEG
- Each frame uploaded to R2 at `jobs/{job_id}/frames/frame_{i:04d}.jpg`
- A `Frame` row is created per frame with `timestamp` and `index`

### Step 3: Frame analysis (`pipeline/vision.py`)

Supports three backends via `VISION_PROVIDER` env var:

**`ollama`** — Qwen2.5-VL 7B (4-bit quantized) running locally via Ollama
Uses the OpenAI-compatible `/v1/chat/completions` endpoint at `OLLAMA_BASE_URL`. Frames sent as base64 data URLs.

**`gemini`** — Google Gemini Vision (1.5 Flash or Pro)
Uses `google-generativeai` SDK. Frames sent as inline bytes.

**`anthropic`** — Anthropic Claude Vision (claude-sonnet-4-6)
Uses `anthropic` SDK. Frames sent as base64 in message content blocks.

All three backends use the same prompt and return the same schema:
```json
[{
  "frame_index": 3,
  "tool": "VS Code",
  "action": "editing app/models/user.py",
  "description": "The user is adding a new field to the User model..."
}]
```

Frames are batched in groups of 5 per API call to stay within context limits. Failed batches are skipped (logged) rather than failing the whole job.

### Step 4: Workflow synthesis (`pipeline/synthesize.py`)

- Aligns transcript segments and frame descriptions by timestamp
- Sends the combined context to Claude Sonnet with this prompt goal: extract the discrete, reusable steps a person would follow to replicate this workflow
- Output: `WorkflowStep[]` JSON stored in `skills.workflow_steps`

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

### Step 5: Skill generation (`pipeline/generate_skill.py`)

- Sends `WorkflowStep[]` to Claude Sonnet
- Outputs a complete `SKILL.md` string with YAML frontmatter
- The `description` field is the most critical part — it contains 5-8 natural-language trigger phrases that Claude Code uses to decide when to invoke the skill
- Creates the `Skill` record in the DB with `status=ready_for_review`

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
  user_id (FK → User, nullable for anon uploads)
  r2_key              — path to original video in R2
  status (JobStatus enum)
  progress (0-100)
  current_step        — human-readable label for SSE display
  transcript (Text)
  transcript_segments (JSON)
  error (Text)

Frame
  id (UUID PK)
  job_id (FK → Job)
  r2_key              — path to JPEG in R2
  timestamp (float)   — seconds from video start
  index (int)         — sequential frame number
  tool, action, description  — from vision analysis

Skill
  id (UUID PK)
  job_id (FK → Job, unique)
  user_id (FK → User)
  name (slug)         — e.g. "deploy-to-staging"
  title               — human-readable
  description (Text)  — full trigger phrases block
  content (Text)      — complete SKILL.md string
  workflow_steps (JSON)
  trigger_phrases (array)
  visibility (private | public)
  published_at, github_repo_url, install_command
  download_count
```

---

## SKILL.md output format

```markdown
---
name: deploy-to-staging
version: 1.0.0
description: |
  Use this skill when the user says things like:
  - "deploy to staging"
  - "push my branch to staging"
  - "run the staging deploy"
  - "deploy this feature to staging"
  - "can you deploy to staging for me"
allowed-tools:
  - Bash
  - Read
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

## Example Invocations
- "deploy to staging"
- "push this to staging so QA can test it"
```

The `description` field is what makes a skill actually activate. SkillsClaw dedicates a dedicated synthesis pass specifically to generating accurate, varied, concrete trigger phrases.

---

## Delivery methods

### ZIP download
Packages `{skill-name}/SKILL.md` and `{skill-name}/README.md` into a zip. User extracts and places the folder in `~/.claude/skills/` or their project's `.claude/skills/`.

### GitHub auto-publish
1. User connects GitHub via OAuth
2. SkillsClaw creates `{username}/skillsclaw-skills` repo (if not exists)
3. Commits skill under `skills/{name}/SKILL.md`
4. Returns install command: `npx skills add {username}/skillsclaw-skills@{name}`

### CLAUDE.md snippet
Generates a self-contained markdown block the user pastes directly into their `CLAUDE.md` or `~/.claude/CLAUDE.md`. No installation, works immediately in any Claude Code session.

### Marketplace
Public skills are listed at `/marketplace`. Each has a slug-based URL. Other users can view the skill and copy the install command.

---

## Authentication

### Production (`DEV_MODE=false`)
- GitHub OAuth 2.0 flow
- On callback: user upserted in DB, JWT issued (7-day expiry)
- All protected endpoints require `Authorization: Bearer <token>`

### Development (`DEV_MODE=true`)
- All auth checks are bypassed
- A fixed dev user (`dev@skillsclaw.local`, UUID `00000000-0000-0000-0000-000000000001`) is returned for every request
- Auto-created in DB on first request
- No token, no OAuth setup needed

---

## Concurrency model

- FastAPI runs async (asyncio) — handles many concurrent HTTP requests efficiently
- Long-running video processing is offloaded to Celery workers — the API never blocks
- SSE endpoint polls the DB every 2 seconds — simple, avoids WebSocket complexity
- Celery concurrency set to 2 by default (`--concurrency=2`) — each worker handles 2 videos simultaneously; scale by adding workers

---

## Storage layout (Cloudflare R2)

```
skillsclaw-videos/
├── videos/
│   └── {job_id}/
│       └── original.mp4         ← uploaded video
└── jobs/
    └── {job_id}/
        └── frames/
            ├── frame_0001.jpg   ← extracted frames
            ├── frame_0002.jpg
            └── ...
```

---

## Environment-based configuration

All behaviour is controlled via environment variables — no code changes needed to switch between local dev and production:

| Concern | Dev | Production |
|---------|-----|-----------|
| Auth | `DEV_MODE=true` | `DEV_MODE=false` + GitHub OAuth |
| Vision | `VISION_PROVIDER=ollama` | `VISION_PROVIDER=gemini` |
| Synthesis | `ANTHROPIC_API_KEY` required | Same |
| Storage | Cloudflare R2 | Same |
| DB | Local PostgreSQL via Docker | Neon / managed PG |
| Queue | Local Redis via Docker | Upstash Redis |

---

## Adding a new vision provider

1. Add a new `_analyze_batch_{name}` function in `pipeline/vision.py`
2. Add the new value to the `if/elif` chain in `analyze_frames()`
3. Add any new config vars to `app/config.py` and `.env.example`
4. No changes needed anywhere else — the pipeline is provider-agnostic
