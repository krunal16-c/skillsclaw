# Contributing to SkillsClaw

Thanks for contributing.

## Development setup

1. Copy `.env.example` to `.env`.
2. Start services: `docker compose up -d postgres redis minio createbuckets`.
3. Backend:
- `cd backend`
- `python -m venv .venv && source .venv/bin/activate`
- `pip install -r requirements.txt`
- `alembic upgrade head`
- `uvicorn app.main:app --reload`
4. Worker:
- `celery -A app.pipeline.worker:celery_app worker --loglevel=info --concurrency=2`
5. Frontend:
- `cd frontend && npm install && npm run dev`

## Pull requests

1. Keep PRs focused and small.
2. Add or update tests for behavior changes.
3. Update docs when adding config or API changes.
4. Avoid committing secrets; never commit `.env`.

## Coding standards

- Python: typed functions where practical, clear errors, minimal side effects.
- Frontend: TypeScript-first, accessible UI states, responsive layouts.
- Keep public API changes backward-compatible unless intentionally versioned.
