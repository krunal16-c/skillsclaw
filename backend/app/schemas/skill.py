from datetime import datetime
from uuid import UUID
from pydantic import BaseModel
from typing import Literal


class SkillRead(BaseModel):
    id: UUID
    job_id: UUID
    user_id: UUID | None
    name: str
    title: str
    description: str
    content: str
    workflow_steps: list | None
    trigger_phrases: list[str] | None
    visibility: str
    published_at: datetime | None
    github_repo_url: str | None
    install_command: str | None
    download_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SkillUpdate(BaseModel):
    name: str | None = None
    title: str | None = None
    description: str | None = None
    content: str | None = None
    trigger_phrases: list[str] | None = None
    workflow_steps: list | None = None


class SkillPublishRequest(BaseModel):
    delivery_method: Literal["zip", "github", "snippet", "marketplace"]


class SkillPublishResponse(BaseModel):
    skill_id: UUID
    delivery_method: str
    install_command: str | None = None
    github_repo_url: str | None = None
    snippet: str | None = None
    download_url: str | None = None
    marketplace_url: str | None = None


class MarketplaceSkillRead(BaseModel):
    id: UUID
    name: str
    title: str
    description: str
    trigger_phrases: list[str] | None
    install_command: str | None
    download_count: int
    published_at: datetime | None
    user_github_username: str | None = None

    model_config = {"from_attributes": True}
