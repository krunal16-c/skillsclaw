from datetime import datetime
from uuid import UUID
from pydantic import BaseModel
from typing import Any


class JobCreate(BaseModel):
    filename: str
    content_type: str
    file_size: int


class JobRead(BaseModel):
    id: UUID
    user_id: UUID | None
    r2_key: str
    original_filename: str | None
    file_size: int | None
    duration_seconds: float | None
    status: str
    current_step: str | None
    progress: int
    transcript: str | None
    error: str | None
    created_at: datetime
    updated_at: datetime
    frames_count: int = 0
    skill_id: UUID | None = None

    model_config = {"from_attributes": True}


class JobStatusResponse(BaseModel):
    job_id: UUID
    status: str
    current_step: str | None
    progress: int
    error: str | None
    skill_id: UUID | None = None

    model_config = {"from_attributes": True}


class PresignRequest(BaseModel):
    filename: str
    content_type: str
    file_size: int


class PresignResponse(BaseModel):
    job_id: UUID
    presigned_url: str
    fields: dict[str, Any] = {}
    r2_key: str


class UploadCompleteRequest(BaseModel):
    job_id: UUID


class UploadCompleteResponse(BaseModel):
    job_id: UUID
    status: str
