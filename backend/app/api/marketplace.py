from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.skill import Skill, SkillVisibility
from app.models.user import User
from app.schemas.skill import MarketplaceSkillRead

router = APIRouter(prefix="/api/marketplace", tags=["marketplace"])


@router.get("", response_model=list[MarketplaceSkillRead])
async def list_marketplace_skills(
    q: str | None = Query(None, description="Search query"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * limit
    query = (
        select(Skill)
        .where(Skill.visibility == SkillVisibility.PUBLIC)
        .options(selectinload(Skill.user))
        .order_by(Skill.download_count.desc(), Skill.published_at.desc())
        .offset(offset)
        .limit(limit)
    )

    if q:
        search_term = f"%{q}%"
        query = query.where(
            or_(
                Skill.title.ilike(search_term),
                Skill.name.ilike(search_term),
                Skill.description.ilike(search_term),
            )
        )

    result = await db.execute(query)
    skills = result.scalars().all()

    output = []
    for skill in skills:
        item = MarketplaceSkillRead(
            id=skill.id,
            name=skill.name,
            title=skill.title,
            description=skill.description,
            trigger_phrases=skill.trigger_phrases,
            install_command=skill.install_command,
            download_count=skill.download_count,
            published_at=skill.published_at,
            user_github_username=skill.user.github_username if skill.user else None,
        )
        output.append(item)

    return output


@router.get("/{skill_id}", response_model=MarketplaceSkillRead)
async def get_marketplace_skill(
    skill_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Skill)
        .where(Skill.id == skill_id, Skill.visibility == SkillVisibility.PUBLIC)
        .options(selectinload(Skill.user))
    )
    skill = result.scalar_one_or_none()
    if not skill:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Skill not found")

    skill.download_count = (skill.download_count or 0) + 1
    await db.commit()

    return MarketplaceSkillRead(
        id=skill.id,
        name=skill.name,
        title=skill.title,
        description=skill.description,
        trigger_phrases=skill.trigger_phrases,
        install_command=skill.install_command,
        download_count=skill.download_count,
        published_at=skill.published_at,
        user_github_username=skill.user.github_username if skill.user else None,
    )
