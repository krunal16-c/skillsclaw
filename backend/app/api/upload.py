import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.job import Job, JobStatus
from app.models.user import User
from app.schemas.job import PresignRequest, PresignResponse, UploadCompleteRequest, UploadCompleteResponse
from app.services.r2 import generate_presigned_upload_url, object_exists
from app.api.auth import get_optional_user
from app.services.stripe_service import check_quota

router = APIRouter(prefix="/api/upload", tags=["upload"])

MAX_VIDEO_SIZE = 500 * 1024 * 1024   # 500MB
MAX_SOP_SIZE = 20 * 1024 * 1024      # 20MB

VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "audio/mpeg", "audio/mp4", "audio/m4a"}
SOP_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
}


@router.post("/presign", response_model=PresignResponse)
async def presign_upload(
    body: PresignRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    is_video = body.content_type in VIDEO_TYPES
    is_sop = body.content_type in SOP_TYPES

    if not is_video and not is_sop:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{body.content_type}'. "
                   f"Accepted: video (MP4/WebM/MOV), audio (MP3/M4A), "
                   f"or documents (PDF/DOCX/TXT/MD).",
        )

    max_size = MAX_VIDEO_SIZE if is_video else MAX_SOP_SIZE
    if body.file_size > max_size:
        limit_mb = max_size // (1024 * 1024)
        raise HTTPException(status_code=400, detail=f"File too large. Maximum {limit_mb}MB.")

    if current_user and not check_quota(current_user):
        raise HTTPException(
            status_code=402,
            detail="Monthly skill limit reached. Upgrade to Pro for unlimited skills.",
        )

    job_id = uuid.uuid4()
    input_type = "video" if is_video else "sop"
    folder = "video" if is_video else "sop"
    r2_key = f"jobs/{job_id}/{folder}/{body.filename}"

    presigned = generate_presigned_upload_url(r2_key, body.content_type, max_size)

    job = Job(
        id=job_id,
        user_id=current_user.id if current_user else None,
        input_type=input_type,
        r2_key=r2_key,
        original_filename=body.filename,
        file_size=body.file_size,
        status=JobStatus.PENDING,
        progress=0,
    )
    db.add(job)
    await db.commit()

    return PresignResponse(
        job_id=job_id,
        presigned_url=presigned["url"],
        fields=presigned.get("fields", {}),
        r2_key=r2_key,
    )


@router.post("/complete", response_model=UploadCompleteResponse)
async def complete_upload(
    body: UploadCompleteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    result = await db.execute(select(Job).where(Job.id == body.job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if not object_exists(job.r2_key):
        raise HTTPException(
            status_code=400,
            detail="Upload not found in storage. Please upload the file first.",
        )

    job.status = JobStatus.PENDING
    job.current_step = "Queued for processing"
    job.progress = 2
    await db.commit()

    from app.pipeline.worker import process_job
    process_job.delay(str(job.id))

    return UploadCompleteResponse(job_id=job.id, status=job.status)


class PasteTextRequest(BaseModel):
    text: str

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 50:
            raise ValueError("Text must be at least 50 characters")
        if len(v) > 100_000:
            raise ValueError("Text must be under 100,000 characters")
        return v


class PasteTextResponse(BaseModel):
    job_id: uuid.UUID
    status: str


@router.post("/paste", response_model=PasteTextResponse)
async def paste_text(
    body: PasteTextRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """
    Accept raw SOP text directly (no file upload needed).
    Jumps straight to the synthesis step.
    """
    if current_user and not check_quota(current_user):
        raise HTTPException(
            status_code=402,
            detail="Monthly skill limit reached. Upgrade to Pro for unlimited skills.",
        )

    job_id = uuid.uuid4()
    job = Job(
        id=job_id,
        user_id=current_user.id if current_user else None,
        input_type="sop",
        r2_key=None,
        sop_text=body.text,
        status=JobStatus.SYNTHESIZING,
        current_step="Queued for processing",
        progress=2,
    )
    db.add(job)
    await db.commit()

    from app.pipeline.worker import process_job
    process_job.delay(str(job.id))

    return PasteTextResponse(job_id=job_id, status=JobStatus.SYNTHESIZING)
