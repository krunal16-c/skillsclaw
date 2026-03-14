# SkillsClaw - Video-to-Claude-Skill Platform

## Context

Users record Loom/Zoom workflow videos. SkillsClaw processes those videos through an AI pipeline (transcription -> frame analysis -> workflow synthesis -> skill generation) and outputs a ready-to-use Claude Code `SKILL.md` package. The platform supports a full marketplace with GitHub publishing, ZIP download, copy-paste snippets, and a hosted skills registry.

### User Preferences

- Output: Claude Code `SKILL.md` (slash command format)
- Stack: Python backend (FastAPI) + React frontend
- Scope: Full product (marketplace, GitHub publishing, team sharing, billing)
- Delivery: All four - ZIP download, GitHub auto-publish, copy-paste snippet, hosted marketplace

---

## Architecture Overview

```text
React SPA (Vite)
    |
    v
FastAPI (Python)              <- API + orchestration
    |
    +-- Celery + Redis          <- Async job queue for video processing
    |
    +-- AI Pipeline
    |   +-- faster-whisper (transcription)
    |   +-- ffmpeg (frame extraction)
    |   +-- Claude Vision (frame analysis)
    |   `-- Claude Sonnet (synthesis + SKILL.md generation)
    |
    +-- PostgreSQL (SQLAlchemy/Alembic)
    +-- Cloudflare R2 (video + frame storage)
    `-- GitHub API (publish skills to user repos)
```

---

## Tech Stack

| Layer | Choice | Reason |
| --- | --- | --- |
| Frontend | React + Vite + TypeScript | Fast iteration, ecosystem |
| UI | Tailwind CSS + shadcn/ui | Rapid UI, consistent design |
| Backend API | FastAPI (Python) | Native AI libs, async, fast |
| Task Queue | Celery + Redis (Upstash) | Video processing is long-running |
| Database | PostgreSQL + SQLAlchemy + Alembic | Relational, migrations |
| Storage | Cloudflare R2 | Cheap egress, S3-compatible |
| Transcription | faster-whisper (self-hosted) | Cost-effective, fast |
| Frame extraction | ffmpeg | Industry standard |
| AI | Anthropic API (Claude Sonnet 4.6 + Vision) | Skills are Claude artifacts |
| Auth | Auth.js or custom JWT | GitHub OAuth + email |
| Payments | Stripe | Free tier (3 skills/mo) + Pro |
| Hosting | Railway or Fly.io (backend) + Vercel (frontend) | Simple Python deploys |

---

## File Structure

```text
skillsclaw/
|- backend/
|  |- app/
|  |  |- main.py                  <- FastAPI app entrypoint
|  |  |- config.py                <- Settings (env vars)
|  |  |- database.py              <- SQLAlchemy engine + session
|  |  |- models/
|  |  |  |- user.py
|  |  |  |- job.py                <- Job, JobStatus enum
|  |  |  |- skill.py              <- Skill, SkillVisibility
|  |  |  `- frame.py
|  |  |- api/
|  |  |  |- auth.py               <- /auth/github, /auth/me
|  |  |  |- upload.py             <- POST /upload (presign + job create)
|  |  |  |- jobs.py               <- GET /jobs/{id} (SSE status)
|  |  |  |- skills.py             <- CRUD + publish endpoints
|  |  |  `- marketplace.py        <- GET /marketplace (public skills)
|  |  |- pipeline/
|  |  |  |- worker.py             <- Celery app + task router
|  |  |  |- transcribe.py         <- faster-whisper transcription
|  |  |  |- frames.py             <- ffmpeg frame extraction
|  |  |  |- vision.py             <- Claude Vision frame analysis
|  |  |  |- synthesize.py         <- Workflow step extraction
|  |  |  `- generate_skill.py     <- SKILL.md generation
|  |  |- services/
|  |  |  |- r2.py                 <- Cloudflare R2 client
|  |  |  |- github.py             <- GitHub API (create repo, push)
|  |  |  `- stripe.py             <- Billing + quota checks
|  |  `- schemas/
|  |     |- job.py                <- Pydantic schemas
|  |     `- skill.py
|  |- migrations/                 <- Alembic migrations
|  |- requirements.txt
|  `- Dockerfile
|- frontend/
|  |- src/
|  |  |- pages/
|  |  |  |- Landing.tsx           <- Marketing page
|  |  |  |- Dashboard.tsx         <- User's skills list
|  |  |  |- Upload.tsx            <- Upload flow (Uppy)
|  |  |  |- JobStatus.tsx         <- Live processing status (SSE)
|  |  |  |- SkillReview.tsx       <- Edit + approve skill
|  |  |  |- SkillPublish.tsx      <- Choose delivery method
|  |  |  `- Marketplace.tsx       <- Public skills directory
|  |  |- components/
|  |  |  |- VideoUploader.tsx     <- Uppy chunked upload
|  |  |  |- SkillPreview.tsx      <- Rendered SKILL.md view
|  |  |  |- SkillEditor.tsx       <- Editable fields + trigger phrases
|  |  |  |- ProcessingSteps.tsx   <- Live step progress
|  |  |  `- InstallOptions.tsx    <- ZIP / GitHub / snippet tabs
|  |  |- lib/
|  |  |  |- api.ts                <- API client
|  |  |  `- sse.ts                <- SSE hook for live updates
|  |  `- main.tsx
|  |- package.json
|  `- vite.config.ts
|- docker-compose.yml             <- local dev: postgres, redis, backend, worker
`- .env.example
```

---

## Database Schema

```python
# models/job.py
class JobStatus(enum):
        PENDING, TRANSCRIBING, EXTRACTING_FRAMES,
        ANALYZING_FRAMES, SYNTHESIZING, GENERATING_SKILL,
        READY_FOR_REVIEW, PUBLISHED, FAILED


class Job(Base):
        id, user_id, r2_key, status, current_step,
        progress (0-100), transcript, error, created_at


class Frame(Base):
        id, job_id, r2_key, timestamp, tool,
        action, description, index


# models/skill.py
class Skill(Base):
        id, job_id, user_id, name (slug), title,
        description, content (full SKILL.md),
        workflow_steps (JSON), trigger_phrases (array),
        visibility (private/public), published_at,
        github_repo_url, install_command, download_count
```

---

## AI Pipeline (Step-by-Step)

### Step 1: Transcription (`transcribe.py`)

- Download video from R2
- Run faster-whisper with word-level timestamps
- Store `{text, segments[{start, end, text}]}` in DB

### Step 2: Frame Extraction (`frames.py`)

- ffmpeg scene-change detection + uniform 8s sampling
- Extract ~30-60 JPEG frames @ 1080p
- Upload frames to R2, store Frame records

### Step 3: Frame Analysis (`vision.py`)

- Batch 5 frames at a time to Claude Vision
- Prompt: identify tool/app, action being performed, workflow context
- Store `{tool, action, description}` per frame

### Step 4: Workflow Synthesis (`synthesize.py`)

- Align transcript segments + frame analyses by timestamp
- Claude Sonnet prompt -> extract `WorkflowStep[]` as JSON
- Each step: `{name, description, tool, command, input, output}`

### Step 5: Skill Generation (`generate_skill.py`)

- Claude Sonnet -> complete `SKILL.md` string
- Focus: generate 5-8 specific natural-language trigger phrases in `description` field
- Output format:

```markdown
---
name: deploy-to-staging
version: 1.0.0
description: |
    Use when: "deploy to staging", "push to staging", ...
allowed-tools: [Bash, Read, Write]
---
# Deploy to Staging
## Steps
...
```

---

## Key Synthesis Prompt (Step 4)

```text
You are a workflow analyst. Given a transcript + frame-by-frame screen descriptions,
extract discrete reusable workflow steps as JSON:
[{
    "step_number": int,
    "name": "verb + object (e.g. Create feature branch)",
    "description": "what and why",
    "tool": "primary app/tool",
    "command_or_action": "specific CLI or UI action",
    "input": "what's needed before",
    "output": "what this step produces"
}]
```

## Key Skill Generation Prompt (Step 5)

```text
Write a SKILL.md for Claude Code. The description field MUST contain 5-8 specific
natural-language phrases a user would say to trigger this workflow. Be specific, not generic.
Workflow steps: {steps}
Output SKILL.md only, no explanation.
```

---

## API Endpoints

### Upload and Jobs

- `POST /api/upload/presign` -> R2 presigned URL + create Job
- `POST /api/upload/complete` -> Enqueue Celery job
- `GET /api/jobs/{id}/status` -> SSE stream (status + progress %)
- `GET /api/jobs/{id}` -> Job details

### Skills

- `GET /api/skills` -> User's skills list
- `GET /api/skills/{id}` -> Skill detail + `SKILL.md` content
- `PATCH /api/skills/{id}` -> Update name/description/steps
- `POST /api/skills/{id}/publish` -> Trigger publish (GitHub/ZIP/marketplace)
- `GET /api/skills/{id}/download` -> ZIP download
- `POST /api/skills/{id}/snippet` -> Generate `CLAUDE.md` snippet

### Marketplace

- `GET /api/marketplace` -> Public skills (paginated, searchable)
- `GET /api/marketplace/{id}` -> Public skill detail + install command

### Auth and Billing

- `POST /api/auth/github` -> GitHub OAuth
- `GET /api/auth/me` -> Current user
- `POST /api/webhooks/stripe` -> Billing events

---

## Delivery Methods

1. ZIP Download - Packages `{skill-name}/SKILL.md` + `README.md` as ZIP.
2. GitHub Auto-publish - Creates `{user}/skillsclaw-skills` repo, commits skill under `skills/{name}/SKILL.md`, returns `npx skills add {user}/skillsclaw-skills@{name}`.
3. Copy-paste Snippet - Generates a self-contained `CLAUDE.md` block with trigger phrases + steps inline.
4. Hosted Marketplace - Skills listed at `skillsclaw.com/marketplace/{slug}`, discoverable and one-click installable.

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

- Scaffold FastAPI + React + Docker Compose
- Prisma schema -> SQLAlchemy models + Alembic migrations
- R2 client + presigned upload endpoint
- React upload page with Uppy (chunked, resumable)
- Celery worker skeleton + job status SSE

### Phase 2: AI Pipeline (Week 2)

- faster-whisper transcription worker task
- ffmpeg frame extraction + R2 upload
- Claude Vision batch frame analysis
- Claude Sonnet workflow synthesis
- Claude Sonnet `SKILL.md` generation
- End-to-end: video in -> `SKILL.md` out

### Phase 3: Review and Edit UI (Week 3)

- Skill review page (rendered `SKILL.md` preview)
- Editable fields: name, trigger phrases, steps
- Regenerate button (re-runs Step 5 with user constraints)
- Approve -> move to publish flow

### Phase 4: Delivery and Publishing (Week 4)

- ZIP download endpoint
- GitHub OAuth + auto-publish to user repo
- `CLAUDE.md` snippet generator
- Marketplace listing (public skills, search, install command)

### Phase 5: Auth, Billing, Polish (Week 5)

- GitHub + Google OAuth (JWT sessions)
- User dashboard (skills list, status badges)
- Stripe integration (Free: 3 skills/month, Pro: unlimited)
- Email notifications (Resend) - "Your skill is ready!"
- Landing page with demo

---

## Key Technical Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Long processing time (5-15 min) | SSE live progress, email notification on completion |
| Poor trigger phrase quality | Dedicated synthesis step, editable in review UI |
| Large video uploads failing | Uppy TUS resumable uploads, 500MB cap for MVP |
| Claude Vision missing small UI text | Use transcript as primary signal, vision as secondary |
| Celery worker cold start | Keep warm workers, show "preparing" status immediately |
| API cost at scale ($0.10-0.30/video) | Batch API (50% discount), skip duplicate frames via hash, Haiku for filtering |

---

## Critical Files to Create First

1. `backend/app/main.py` - FastAPI app + CORS + router registration
2. `backend/app/models/job.py` - Core data model everything depends on
3. `backend/app/pipeline/worker.py` - Celery app + task chaining
4. `backend/app/pipeline/generate_skill.py` - Product value lives here
5. `frontend/src/pages/Upload.tsx` - Entry point for users
6. `docker-compose.yml` - Local dev environment

---

## Verification and Testing

1. Unit: Test each pipeline step in isolation with a short sample video.
2. Integration: Upload a 5-minute Loom recording end-to-end, verify `SKILL.md` is syntactically valid and trigger phrases are accurate.
3. Skill validation: Install generated skill in Claude Code, invoke with trigger phrase, verify it executes the correct workflow.
4. Load test: Queue 10 concurrent jobs, verify Celery handles them without data corruption.
5. GitHub publish: Verify skill appears in user's repo and `npx skills add` resolves correctly.