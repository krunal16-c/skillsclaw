import json
from app.services.llm import generate_text

SYNTHESIS_PROMPT = """You are a workflow analyst. Given the following workflow description (from an audio transcription or written documentation), extract the discrete, reusable steps a person can follow to replicate this workflow.

Workflow description:
{workflow_text}

Respond with a JSON array ONLY, no explanation:
[{{
  "step_number": <int>,
  "name": "<verb + object, e.g. 'Create feature branch'>",
  "description": "<what the user does and why, 2-3 sentences>",
  "tool": "<primary tool/app used>",
  "command_or_action": "<specific CLI command or UI action if known, else null>",
  "input": "<what's needed before this step>",
  "output": "<what this step produces>"
}}]"""


def _get_sync_session():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.config import settings

    sync_url = settings.DATABASE_URL.replace("+asyncpg", "+psycopg2")
    engine = create_engine(sync_url, pool_pre_ping=True)
    Session = sessionmaker(bind=engine)
    return Session()


def synthesize_workflow(job_id: str) -> list:
    from app.models.job import Job

    session = _get_sync_session()

    try:
        job = session.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise ValueError(f"Job {job_id} not found")

        # Use transcript for video, sop_text for documents/paste
        workflow_text = job.transcript if job.input_type == "video" else job.sop_text
        if not workflow_text:
            # Fallback: try whichever is populated
            workflow_text = job.transcript or job.sop_text or ""
        if not workflow_text.strip():
            raise ValueError("No text available to synthesize workflow from")

        prompt = SYNTHESIS_PROMPT.format(workflow_text=workflow_text)

        response_text = generate_text(
            prompt,
            max_tokens=4096,
            temperature=0.1,
        ).strip()
        if response_text.startswith("```"):
            lines = response_text.split("\n")
            end = -1 if lines[-1].strip() == "```" else len(lines)
            response_text = "\n".join(lines[1:end])

        try:
            workflow_steps = json.loads(response_text)
            if not isinstance(workflow_steps, list):
                workflow_steps = []
        except json.JSONDecodeError:
            workflow_steps = []

        # Persist to DB — no in-process cache
        job.workflow_steps = workflow_steps
        session.commit()
        return workflow_steps
    finally:
        session.close()
