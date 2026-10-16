import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, created_at_column, uuid_pk
from app.models.catalog import Album, Artist, Track
from app.models.studio import StudioPiece
from app.models.user import User


class Story(Base):
    """A 24-hour story about exactly one thing: a track, an album or an artist.

    `background_color` holds a gradient as "#RRGGBB,#RRGGBB".
    """

    __tablename__ = "stories"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    track_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tracks.id", ondelete="CASCADE")
    )
    album_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("albums.id", ondelete="CASCADE")
    )
    artist_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("artists.id", ondelete="CASCADE")
    )
    piece_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("studio_pieces.id", ondelete="CASCADE")
    )
    caption: Mapped[str | None] = mapped_column(String(280))
    background_color: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default="#1DB954,#0B3D2E"
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = created_at_column()

    user: Mapped[User] = relationship()
    track: Mapped[Track | None] = relationship()
    album: Mapped[Album | None] = relationship()
    artist: Mapped[Artist | None] = relationship()
    piece: Mapped[StudioPiece | None] = relationship()

    __table_args__ = (
        CheckConstraint("expires_at > created_at", name="expires_after_created"),
        CheckConstraint(
            "num_nonnulls(track_id, album_id, artist_id, piece_id) = 1",
            name="exactly_one_subject",
        ),
        Index("ix_stories_user_expires", "user_id", "expires_at"),
        Index("ix_stories_expires_at", "expires_at"),
        Index("ix_stories_track_id", "track_id"),
        Index("ix_stories_album_id", "album_id"),
        Index("ix_stories_artist_id", "artist_id"),
        Index("ix_stories_piece_id", "piece_id"),
    )


class ProfileLike(Base):
    __tablename__ = "profile_likes"

    liker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    liked_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = created_at_column()

    __table_args__ = (
        CheckConstraint("liker_id <> liked_user_id", name="no_self_like"),
        Index("ix_profile_likes_liked_user_id", "liked_user_id"),
    )


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at_column()

    __table_args__ = (Index("ix_refresh_tokens_user_id", "user_id"),)
