"""Simplify pipeline: remove frames table, add input_type/sop_text/workflow_steps to jobs

Revision ID: 002_simplify_pipeline
Revises: 001
Create Date: 2026-03-14
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "002_simplify_pipeline"
down_revision = None   # set to your previous migration id if one exists
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    table_names = set(inspector.get_table_names())

    # 1. Drop frames table only if it exists.
    if "frames" in table_names:
        op.drop_table("frames")

    # 2. Add new columns to jobs only when missing.
    if "jobs" in table_names:
        job_columns = {col["name"] for col in inspector.get_columns("jobs")}

        if "input_type" not in job_columns:
            op.add_column(
                "jobs",
                sa.Column("input_type", sa.String(10), nullable=False, server_default="video"),
            )

        if "sop_text" not in job_columns:
            op.add_column("jobs", sa.Column("sop_text", sa.Text, nullable=True))

        if "workflow_steps" not in job_columns:
            op.add_column("jobs", sa.Column("workflow_steps", JSONB, nullable=True))

    # 3. Update enum only if legacy enum type exists.
    enum_exists = bind.execute(
        sa.text("SELECT 1 FROM pg_type WHERE typname = 'jobstatus' LIMIT 1")
    ).scalar()
    if enum_exists:
        op.execute("ALTER TYPE jobstatus ADD VALUE IF NOT EXISTS 'processing'")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "jobs" in inspector.get_table_names():
        job_columns = {col["name"] for col in inspector.get_columns("jobs")}

        if "workflow_steps" in job_columns:
            op.drop_column("jobs", "workflow_steps")
        if "sop_text" in job_columns:
            op.drop_column("jobs", "sop_text")
        if "input_type" in job_columns:
            op.drop_column("jobs", "input_type")

    op.create_table(
        "frames",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("job_id", sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("r2_key", sa.String(1024), nullable=False),
        sa.Column("timestamp", sa.Float, nullable=True),
        sa.Column("index", sa.Integer, nullable=True),
        sa.Column("tool", sa.String(255), nullable=True),
        sa.Column("action", sa.String(255), nullable=True),
        sa.Column("description", sa.Text, nullable=True),
    )
