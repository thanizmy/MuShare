"""stories can be about an album or an artist, not only a track

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-16 15:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("stories", "track_id", existing_type=sa.UUID(), nullable=True)
    op.add_column("stories", sa.Column("album_id", sa.UUID(), nullable=True))
    op.add_column("stories", sa.Column("artist_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        op.f("fk_stories_album_id_albums"), "stories", "albums", ["album_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        op.f("fk_stories_artist_id_artists"), "stories", "artists", ["artist_id"], ["id"],
        ondelete="CASCADE",
    )
    # Every existing story has a track, so the rule holds for old rows too.
    op.create_check_constraint(
        op.f("ck_stories_exactly_one_subject"),
        "stories",
        "num_nonnulls(track_id, album_id, artist_id) = 1",
    )
    op.create_index("ix_stories_album_id", "stories", ["album_id"], unique=False)
    op.create_index("ix_stories_artist_id", "stories", ["artist_id"], unique=False)


def downgrade() -> None:
    # Album and artist stories have no track to fall back to, so they cannot survive.
    op.execute("DELETE FROM stories WHERE track_id IS NULL")
    op.drop_index("ix_stories_artist_id", table_name="stories")
    op.drop_index("ix_stories_album_id", table_name="stories")
    op.drop_constraint(op.f("ck_stories_exactly_one_subject"), "stories", type_="check")
    op.drop_constraint(op.f("fk_stories_artist_id_artists"), "stories", type_="foreignkey")
    op.drop_constraint(op.f("fk_stories_album_id_albums"), "stories", type_="foreignkey")
    op.drop_column("stories", "artist_id")
    op.drop_column("stories", "album_id")
    op.alter_column("stories", "track_id", existing_type=sa.UUID(), nullable=False)
