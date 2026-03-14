from celery import Celery
from app.config import settings

celery_app = Celery(
    "skillsclaw",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.pipeline.worker"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)


def _get_sync_db():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    sync_url = settings.DATABASE_URL.replace("+asyncpg", "+psycopg2")
    engine = create_engine(sync_url, pool_pre_ping=True)
    Session = sessionmaker(bind=engine)
    return Session()


def _update_job_status(
    job_id: str, status: str, progress: int, current_step: str = None, error: str = None
):
    from app.models.job import Job
    session = _get_sync_db()
    try:
        job = session.query(Job).filter(Job.id == job_id).first()
        if job:
            job.status = status
            job.progress = progress
            if current_step is not None:
                job.current_step = current_step
            if error is not None:
                job.error = error
            session.commit()
    finally:
        session.close()


@celery_app.task(bind=True, max_retries=3, name="process_job")
def process_job(self, job_id: str):
    """
    3-step pipeline shared by both input types:
      - video: transcribe audio → synthesize → generate skill
      - sop:   extract text   → synthesize → generate skill
    Paste-text jobs skip step 1 entirely (sop_text already set).
    """
    from app.models.job import JobStatus
    from app.pipeline.synthesize import synthesize_workflow
    from app.pipeline.generate_skill import generate_skill_md

    try:
        session = _get_sync_db()
        try:
            from app.models.job import Job
            job = session.query(Job).filter(Job.id == job_id).first()
            input_type = job.input_type if job else "video"
            has_text_already = bool(job.sop_text) if job else False
        finally:
            session.close()

        # Step 1: Extract text (skip for paste-text SOPs — text already in DB)
        if not has_text_already:
            if input_type == "video":
                from app.pipeline.transcribe import transcribe_video
                _update_job_status(
                    job_id, JobStatus.PROCESSING, progress=10,
                    current_step="Transcribing audio...",
                )
                transcribe_video(job_id)
            else:
                from app.pipeline.extract_sop import extract_sop_text
                _update_job_status(
                    job_id, JobStatus.PROCESSING, progress=10,
                    current_step="Extracting text from document...",
                )
                extract_sop_text(job_id)

        _update_job_status(job_id, JobStatus.PROCESSING, progress=40)

        # Step 2: Synthesize workflow steps
        _update_job_status(
            job_id, JobStatus.SYNTHESIZING, progress=45,
            current_step="Building workflow steps...",
        )
        synthesize_workflow(job_id)
        _update_job_status(job_id, JobStatus.SYNTHESIZING, progress=75)

        # Step 3: Generate SKILL.md
        _update_job_status(
            job_id, JobStatus.GENERATING_SKILL, progress=80,
            current_step="Generating SKILL.md...",
        )
        generate_skill_md(job_id)

        _update_job_status(
            job_id, JobStatus.READY_FOR_REVIEW, progress=100,
            current_step="Ready for review!",
        )

    except Exception as exc:
        _update_job_status(
            job_id, "failed", progress=0,
            current_step="Failed", error=str(exc),
        )
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=30)
        raise


# Keep old name as an alias so any existing queued tasks don't break
process_video = process_job
