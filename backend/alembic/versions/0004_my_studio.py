"""My Studio: uploaded pieces, owner artists, hidden catalog items, piece stories

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-16 18:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "studio_pieces",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("owner_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("audio_key", sa.String(length=255), nullable=False),
        sa.Column("audio_mime", sa.String(length=50), nullable=False),
        sa.Column("audio_bytes", sa.BigInteger(), nullable=False),
        sa.Column("duration_sec", sa.Integer(), nullable=False),
        sa.Column("cover_key", sa.String(length=255), nullable=True),
        sa.Column(
            "status",
            sa.Enum("draft", "published", "hidden", name="piece_status"),
            server_default="draft",
            nullable=False,
        ),
        sa.Column("rights_confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("track_id", sa.UUID(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.CheckConstraint("audio_bytes > 0", name=op.f("ck_studio_pieces_size_positive")),
        sa.CheckConstraint("duration_sec > 0", name=op.f("ck_studio_pieces_duration_positive")),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name=op.f("fk_studio_pieces_owner_id_users"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["track_id"], ["tracks.id"], name=op.f("fk_studio_pieces_track_id_tracks"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_studio_pieces")),
        sa.UniqueConstraint("audio_key", name=op.f("uq_studio_pieces_audio_key")),
        sa.UniqueConstraint("cover_key", name=op.f("uq_studio_pieces_cover_key")),
        sa.UniqueConstraint("track_id", name=op.f("uq_studio_pieces_track_id")),
    )
    op.create_index(
        "ix_studio_pieces_owner_created", "studio_pieces", ["owner_id", "created_at"], unique=False
    )

    # Catalog: an artist profile can belong to a user, and items can be hidden by their artist.
    op.add_column("artists", sa.Column("owner_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        op.f("fk_artists_owner_id_users"), "artists", "users", ["owner_id"], ["id"], ondelete="CASCADE"
    )
    op.create_unique_constraint(op.f("uq_artists_owner_id"), "artists", ["owner_id"])
    op.add_column(
        "albums", sa.Column("is_hidden", sa.Boolean(), server_default="false", nullable=False)
    )
    op.add_column(
        "tracks", sa.Column("is_hidden", sa.Boolean(), server_default="false", nullable=False)
    )

    # Stories: a fourth possible subject, a studio piece.
    op.add_column("stories", sa.Column("piece_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        op.f("fk_stories_piece_id_studio_pieces"),
        "stories",
        "studio_pieces",
        ["piece_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_constraint(op.f("ck_stories_exactly_one_subject"), "stories", type_="check")
    op.create_check_constraint(
        op.f("ck_stories_exactly_one_subject"),
        "stories",
        "num_nonnulls(track_id, album_id, artist_id, piece_id) = 1",
    )
    op.create_index("ix_stories_piece_id", "stories", ["piece_id"], unique=False)


def downgrade() -> None:
    # Piece stories and uploaded pieces have no older equivalent, so they go.
    op.execute("DELETE FROM stories WHERE piece_id IS NOT NULL")
    op.drop_index("ix_stories_piece_id", table_name="stories")
    op.drop_constraint(op.f("ck_stories_exactly_one_subject"), "stories", type_="check")
    op.create_check_constraint(
        op.f("ck_stories_exactly_one_subject"),
        "stories",
        "num_nonnulls(track_id, album_id, artist_id) = 1",
    )
    op.drop_constraint(op.f("fk_stories_piece_id_studio_pieces"), "stories", type_="foreignkey")
    op.drop_column("stories", "piece_id")

    op.drop_column("tracks", "is_hidden")
    op.drop_column("albums", "is_hidden")
    op.drop_constraint(op.f("uq_artists_owner_id"), "artists", type_="unique")
    op.drop_constraint(op.f("fk_artists_owner_id_users"), "artists", type_="foreignkey")
    op.drop_column("artists", "owner_id")

    op.drop_index("ix_studio_pieces_owner_created", table_name="studio_pieces")
    op.drop_table("studio_pieces")
    op.execute("DROP TYPE IF EXISTS piece_status")
