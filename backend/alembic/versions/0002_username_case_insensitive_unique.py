"""case-insensitive unique usernames

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-16 02:30:00
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("uq_users_username_lower", "users", [sa.text("lower(username)")], unique=True)


def downgrade() -> None:
    op.drop_index("uq_users_username_lower", table_name="users")
