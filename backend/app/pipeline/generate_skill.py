import json
import re
import uuid
from slugify import slugify
from app.services.llm import generate_text

SKILL_GENERATION_PROMPT = """You are writing a Claude Code SKILL.md file. This file teaches Claude how to perform a specific workflow when a user asks.

CRITICAL: The `description` field in the YAML frontmatter is how Claude decides to activate this skill. It MUST contain 5-8 specific, varied natural-language phrases that a user would actually say to trigger this workflow. Be concrete and specific, not generic.

Workflow title: {title}
Workflow steps:
{steps_json}

Generate a complete, valid SKILL.md with this exact structure:
---
name: {slug}
version: 1.0.0
description: |
  Use this skill when the user says things like:
  - "<specific trigger phrase 1>"
  - "<specific trigger phrase 2>"
  ... (5-8 total, be specific to THIS workflow)
allowed-tools:
  - <list only tools actually needed: Bash, Read, Write, Edit, Grep, Glob>
---

# <Workflow Title>

## Overview
<1-2 sentences describing what this workflow accomplishes>

## Prerequisites
<Bullet list of tools, access, or setup needed>

## Steps
<Numbered list of steps Claude should follow, with specific commands where known>

## Notes
<Any important caveats, variations, or tips>

## Example Invocations
<2-3 example user messages that would trigger this skill>

Output the SKILL.md content only. No explanation. No code blocks."""


def _get_sync_session():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.config import settings

    sync_url = settings.DATABASE_URL.replace("+asyncpg", "+psycopg2")
    engine = create_engine(sync_url, pool_pre_ping=True)
    Session = sessionmaker(bind=engine)
    return Session()


def generate_skill_md(job_id: str) -> str:
    from app.models.job import Job
    from app.models.skill import Skill, SkillVisibility
    from app.pipeline.synthesize import synthesize_workflow

    session = _get_sync_session()

    try:
        job = session.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise ValueError(f"Job {job_id} not found")

        # Read workflow_steps from DB (persisted by synthesize step)
        workflow_steps = job.workflow_steps
        if not workflow_steps:
            # Synthesis may not have run yet — run it now
            workflow_steps = synthesize_workflow(job_id)
            # Re-fetch job after synthesize updated it
            session.refresh(job)
            workflow_steps = job.workflow_steps or []

        if not workflow_steps:
            workflow_steps = [{
                "step_number": 1,
                "name": "Complete workflow",
                "description": "Follow the recorded workflow",
                "tool": "Unknown",
                "command_or_action": None,
                "input": "None",
                "output": "Completed task",
            }]

        # Derive title from filename or first tool
        if job.original_filename:
            name_base = job.original_filename.rsplit(".", 1)[0].replace("-", " ").replace("_", " ")
            title = name_base.title()
        else:
            tools = [s.get("tool", "") for s in workflow_steps if s.get("tool")]
            title = f"{tools[0]} Workflow" if tools else "Workflow"

        skill_slug = slugify(title) or f"skill-{job_id[:8]}"
        steps_json = json.dumps(workflow_steps, indent=2)

        prompt = SKILL_GENERATION_PROMPT.format(
            title=title,
            slug=skill_slug,
            steps_json=steps_json,
        )

        skill_content = generate_text(
            prompt,
            max_tokens=4096,
            temperature=0.1,
        ).strip()
        if skill_content.startswith("```"):
            lines = skill_content.split("\n")
            end = -1 if lines[-1].strip() == "```" else len(lines)
            skill_content = "\n".join(lines[1:end])

        trigger_phrases = _extract_trigger_phrases(skill_content)
        description_block = _extract_description_block(skill_content)

        existing_skill = session.query(Skill).filter(Skill.job_id == job_id).first()
        if existing_skill:
            existing_skill.name = skill_slug
            existing_skill.title = title
            existing_skill.description = description_block
            existing_skill.content = skill_content
            existing_skill.workflow_steps = workflow_steps
            existing_skill.trigger_phrases = trigger_phrases
            session.commit()
        else:
            skill = Skill(
                id=uuid.uuid4(),
                job_id=job_id,
                user_id=job.user_id,
                name=skill_slug,
                title=title,
                description=description_block,
                content=skill_content,
                workflow_steps=workflow_steps,
                trigger_phrases=trigger_phrases,
                visibility=SkillVisibility.PRIVATE,
            )
            session.add(skill)
            session.commit()

        return skill_content
    finally:
        session.close()


def _extract_description_block(skill_content: str) -> str:
    match = re.search(r"description:\s*\|\n((?:  .*\n?)*)", skill_content)
    return match.group(1).strip() if match else ""


def _extract_trigger_phrases(skill_content: str) -> list[str]:
    match = re.search(r"description:\s*\|\n((?:  .*\n?)*)", skill_content)
    if not match:
        return []
    phrases = []
    for line in match.group(1).split("\n"):
        stripped = line.strip()
        if stripped.startswith("- "):
            phrase = stripped[2:].strip().strip('"').strip("'")
            if phrase:
                phrases.append(phrase)
    return phrases
