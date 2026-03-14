import io
import zipfile
from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.skill import Skill, SkillVisibility
from app.models.user import User
from app.schemas.skill import SkillRead, SkillUpdate, SkillPublishRequest, SkillPublishResponse
from app.api.auth import get_current_user
from app.services.r2 import generate_presigned_download_url
from app.config import settings

router = APIRouter(prefix="/api/skills", tags=["skills"])


async def get_skill_or_404(skill_id: UUID, db: AsyncSession) -> Skill:
    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return skill


@router.get("", response_model=list[SkillRead])
async def list_skills(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Skill).where(Skill.user_id == current_user.id).order_by(Skill.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{skill_id}", response_model=SkillRead)
async def get_skill(
    skill_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    skill = await get_skill_or_404(skill_id, db)
    if skill.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    return skill


@router.patch("/{skill_id}", response_model=SkillRead)
async def update_skill(
    skill_id: UUID,
    body: SkillUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    skill = await get_skill_or_404(skill_id, db)
    if skill.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(skill, field, value)

    await db.commit()
    await db.refresh(skill)
    return skill


@router.post("/{skill_id}/publish", response_model=SkillPublishResponse)
async def publish_skill(
    skill_id: UUID,
    body: SkillPublishRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    skill = await get_skill_or_404(skill_id, db)
    if skill.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if body.delivery_method == "github":
        if not current_user.github_token or not current_user.github_username:
            raise HTTPException(status_code=400, detail="GitHub not connected")

        from app.services.github import publish_skill as gh_publish_skill, create_or_get_skills_repo
        repo_url = create_or_get_skills_repo(
            current_user.github_token, current_user.github_username
        )
        readme = f"# {skill.title}\n\n{skill.description}\n"
        install_command = gh_publish_skill(
            current_user.github_token,
            current_user.github_username,
            skill.name,
            skill.content,
            readme,
        )
        skill.github_repo_url = repo_url
        skill.install_command = install_command
        skill.visibility = SkillVisibility.PUBLIC
        skill.published_at = datetime.now(timezone.utc)
        await db.commit()

        return SkillPublishResponse(
            skill_id=skill.id,
            delivery_method="github",
            install_command=install_command,
            github_repo_url=repo_url,
        )

    elif body.delivery_method == "marketplace":
        skill.visibility = SkillVisibility.PUBLIC
        skill.published_at = datetime.now(timezone.utc)
        marketplace_url = f"{settings.FRONTEND_URL}/marketplace/{skill.id}"
        skill.install_command = f"npx claude-skill install skillsclaw:{skill.name}"
        await db.commit()

        return SkillPublishResponse(
            skill_id=skill.id,
            delivery_method="marketplace",
            marketplace_url=marketplace_url,
            install_command=skill.install_command,
        )

    elif body.delivery_method == "snippet":
        snippet = _generate_claude_md_snippet(skill)
        return SkillPublishResponse(
            skill_id=skill.id,
            delivery_method="snippet",
            snippet=snippet,
        )

    elif body.delivery_method == "zip":
        download_url = f"{settings.FRONTEND_URL}/api/skills/{skill.id}/download"
        return SkillPublishResponse(
            skill_id=skill.id,
            delivery_method="zip",
            download_url=download_url,
        )

    raise HTTPException(status_code=400, detail="Invalid delivery method")


@router.get("/{skill_id}/download")
async def download_skill(
    skill_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    skill = await get_skill_or_404(skill_id, db)
    if skill.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    import json as _json

    # Build ZIP as a proper skill package directory
    # Structure matches the anthropics/skills convention:
    #   skill-name/
    #   ├── SKILL.md          ← the skill itself
    #   ├── README.md         ← human docs + install instructions
    #   └── evals/
    #       └── evals.json    ← starter eval set for the skill-creator workflow
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"{skill.name}/SKILL.md", skill.content)

        readme = (
            f"# {skill.title}\n\n"
            f"{skill.description}\n\n"
            f"## Install\n\n"
            f"```bash\n"
            f"mkdir -p ~/.claude/skills/{skill.name}\n"
            f"cp SKILL.md ~/.claude/skills/{skill.name}/\n"
            f"```\n\n"
            f"Or add the contents of `SKILL.md` inline to your `CLAUDE.md`.\n"
        )
        zf.writestr(f"{skill.name}/README.md", readme)

        # Starter evals for use with the skill-creator skill
        evals_stub = _json.dumps({
            "skill_name": skill.name,
            "evals": [
                {
                    "id": 1,
                    "prompt": f"[Replace with a realistic prompt that should trigger '{skill.name}']",
                    "expected_output": "[Describe what a good response looks like]",
                    "files": [],
                    "assertions": []
                }
            ]
        }, indent=2)
        zf.writestr(f"{skill.name}/evals/evals.json", evals_stub)

    buffer.seek(0)
    skill.download_count = (skill.download_count or 0) + 1
    await db.commit()

    return Response(
        content=buffer.read(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{skill.name}.zip"'},
    )


@router.post("/{skill_id}/snippet")
async def get_snippet(
    skill_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    skill = await get_skill_or_404(skill_id, db)
    if skill.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    snippet = _generate_claude_md_snippet(skill)
    return {"snippet": snippet}


@router.post("/{skill_id}/regenerate", response_model=SkillRead)
async def regenerate_skill(
    skill_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    skill = await get_skill_or_404(skill_id, db)
    if skill.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    from app.pipeline.generate_skill import generate_skill_md
    generate_skill_md(str(skill.job_id))

    await db.refresh(skill)
    return skill


def _generate_claude_md_snippet(skill: Skill) -> str:
    """
    Generate a CLAUDE.md snippet that embeds the full SKILL.md inline.
    This is the zero-install delivery path — users paste this directly into their CLAUDE.md.
    The skill content already has the correct frontmatter (name + description) so Claude
    will trigger on it naturally without any extra wrapper.
    """
    snippet = f"""<!-- SkillsClaw generated skill: {skill.name} -->
<!-- Paste the block below into your ~/.claude/CLAUDE.md or project CLAUDE.md -->

<skill>
{skill.content}
</skill>
"""
    return snippet
