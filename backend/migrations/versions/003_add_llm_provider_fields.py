"""Add llm_provider and llm_model fields to jobs

Revision ID: 003_add_llm_provider_fields
Revises: 002_simplify_pipeline
Create Date: 2026-03-14
"""

from alembic import op
import sqlalchemy as sa


revision = "003_add_llm_provider_fields"
down_revision = "002_simplify_pipeline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "jobs" not in inspector.get_table_names():
        return

    columns = {c["name"] for c in inspector.get_columns("jobs")}
    if "llm_provider" not in columns:
        op.add_column("jobs", sa.Column("llm_provider", sa.String(length=50), nullable=True))
    if "llm_model" not in columns:
        op.add_column("jobs", sa.Column("llm_model", sa.String(length=255), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "jobs" not in inspector.get_table_names():
        return

    columns = {c["name"] for c in inspector.get_columns("jobs")}
    if "llm_model" in columns:
        op.drop_column("jobs", "llm_model")
    if "llm_provider" in columns:
        op.drop_column("jobs", "llm_provider")
