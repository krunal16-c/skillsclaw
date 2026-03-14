import uuid
from datetime import datetime
from enum import Enum
from sqlalchemy import String, Integer, Float, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base


class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"          # transcribing audio OR extracting SOP text
    SYNTHESIZING = "synthesizing"      # converting text → workflow steps
    GENERATING_SKILL = "generating_skill"
    READY_FOR_REVIEW = "ready_for_review"
    PUBLISHED = "published"
    FAILED = "failed"


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # "video" or "sop"
    input_type: Mapped[str] = mapped_column(String(10), nullable=False, default="video")
    r2_key: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    original_filename: Mapped[str | None] = mapped_column(String(512), nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default=JobStatus.PENDING)
    current_step: Mapped[str | None] = mapped_column(String(255), nullable=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    # Video path: audio transcript from faster-whisper
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    transcript_segments: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # SOP path: text extracted from document or pasted directly
    sop_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Persisted after synthesis step (replaces the old in-process _workflow_cache)
    workflow_steps: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Provider/model used for synthesis + skill generation (per-job override)
    llm_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    llm_model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship("User", back_populates="jobs")
    skill: Mapped["Skill"] = relationship(
        "Skill", back_populates="job", uselist=False, lazy="select"
    )
