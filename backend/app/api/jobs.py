import asyncio
import json
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sse_starlette.sse import EventSourceResponse

from app.database import get_db, SessionLocal
from app.models.job import Job
from app.models.skill import Skill
from app.schemas.job import JobRead, JobStatusResponse
from app.api.auth import get_optional_user
from app.models.user import User

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/{job_id}", response_model=JobRead)
async def get_job(
    job_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Frames table was removed in simplified pipeline; derive a lightweight count
    # from synthesized workflow steps if present.
    frames_count = len(job.workflow_steps) if isinstance(job.workflow_steps, list) else 0

    skill_result = await db.execute(select(Skill).where(Skill.job_id == job_id))
    skill = skill_result.scalar_one_or_none()

    response = JobRead.model_validate(job)
    response.frames_count = frames_count
    response.skill_id = skill.id if skill else None
    return response


@router.get("/{job_id}/status")
async def job_status_sse(job_id: UUID, db: AsyncSession = Depends(get_db)):
    async def event_generator():
        previous_status = None
        consecutive_done = 0

        while True:
            async with SessionLocal() as session:
                result = await session.execute(select(Job).where(Job.id == job_id))
                job = result.scalar_one_or_none()

                if job is None:
                    yield {
                        "event": "error",
                        "data": json.dumps({"error": "Job not found"}),
                    }
                    return

                skill_result = await session.execute(
                    select(Skill).where(Skill.job_id == job_id)
                )
                skill = skill_result.scalar_one_or_none()

                data = JobStatusResponse(
                    job_id=job.id,
                    status=job.status,
                    current_step=job.current_step,
                    progress=job.progress,
                    error=job.error,
                    skill_id=skill.id if skill else None,
                )

                yield {
                    "event": "status",
                    "data": data.model_dump_json(),
                }

                terminal_statuses = {"ready_for_review", "published", "failed"}
                if job.status in terminal_statuses:
                    consecutive_done += 1
                    if consecutive_done >= 2:
                        yield {"event": "done", "data": json.dumps({"status": job.status})}
                        return
                else:
                    consecutive_done = 0

                previous_status = job.status

            await asyncio.sleep(2)

    return EventSourceResponse(event_generator())
