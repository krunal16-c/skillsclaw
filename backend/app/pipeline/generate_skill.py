import json
import re
import uuid
from slugify import slugify
from app.services.llm import generate_text

SKILL_GENERATION_PROMPT = """You are writing a SKILL.md file for Claude Code (Anthropic's official CLI).

## How skills work
A skill is a directory containing SKILL.md. Claude reads the `description` field to decide whether to invoke it. The description is the PRIMARY triggering mechanism — Claude will not use the skill unless the description clearly matches what the user is asking for.

## Rules for the description field
- Write 2-4 sentences of prose (NOT a bulleted list)
- First sentence: what this skill does
- Remaining sentences: specific situations when to use it — be concrete about tools, file types, workflows
- Be slightly "pushy": list edge cases where Claude might not obviously think to use this skill but should
- Bad: "Use this skill when the user wants to deploy code."
- Good: "Use this skill to run the full staging deployment pipeline. Invoke it whenever the user mentions deploying to staging, pushing a branch to the test environment, running the staging deploy script, or asks you to 'push this to staging' even if they don't use the word 'deploy'."

## Frontmatter format (exact)
Only two fields: `name` (slug) and `description` (inline string on one line using >- for multiline prose).
Do NOT include: version, allowed-tools, compatibility, or any other fields.

## Workflow to encode
Title: {title}
Steps:
{steps_json}

## Output format
Generate the SKILL.md exactly like this — output the raw file content only, no explanation, no code fences:

---
name: {slug}
description: >-
  <First sentence: what this skill does.>
  <Second sentence: when to invoke it — be specific about tools, steps, contexts.>
  <Optional third sentence: edge cases where this skill should trigger even if not obvious.>
---

# {title}

## Overview
<1-2 sentences describing the workflow's purpose and outcome>

## When to use this skill
<2-3 bullet points describing concrete triggering scenarios, specific enough that Claude can pattern-match>

## Prerequisites
<Bullet list: required tools, access, environment setup>

## Steps

<Numbered steps. For each step extracted from the workflow:
- Use imperative form ("Run X", "Open Y", "Click Z")
- Include the exact command or action if known
- Explain the purpose briefly if it's not obvious>

## Notes
<Caveats, common errors, variations the user might encounter>

## Example prompts that trigger this skill
<3 realistic user messages — mix of formal and casual, some that don't use obvious keywords>"""


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
            provider=job.llm_provider,
            model=job.llm_model,
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
    """Extract the description value from YAML frontmatter (handles >-, |, or inline)."""
    # >- or | multiline block
    match = re.search(r"description:\s*>-?\n((?:[ \t]+.+\n?)+)", skill_content)
    if match:
        lines = [l.strip() for l in match.group(1).splitlines()]
        return " ".join(l for l in lines if l)

    # Inline single-line: description: some text
    match = re.search(r"description:\s*(.+)", skill_content)
    if match:
        return match.group(1).strip().strip('"').strip("'")

    return ""


def _extract_trigger_phrases(skill_content: str) -> list[str]:
    """
    Extract concrete trigger phrases from the 'When to use this skill' section.
    Falls back to splitting the description into sentences.
    """
    # Try the "When to use" bullet section in the body
    body_match = re.search(
        r"## When to use this skill\n((?:.*\n)*?)(?=\n##|\Z)", skill_content
    )
    if body_match:
        phrases = []
        for line in body_match.group(1).splitlines():
            stripped = line.strip().lstrip("-•*").strip()
            if len(stripped) > 10:
                phrases.append(stripped)
        if phrases:
            return phrases[:8]

    # Fallback: use sentences from the description as trigger hints
    desc = _extract_description_block(skill_content)
    if desc:
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", desc) if len(s.strip()) > 15]
        return sentences[:5]

    return []
