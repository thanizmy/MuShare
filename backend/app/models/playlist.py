import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Index, SmallInteger, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, created_at_column, uuid_pk
from app.models.catalog import Track


class Playlist(Base):
    __tablename__ = "playlists"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    created_at: Mapped[datetime] = created_at_column()

    entries: Mapped[list["PlaylistTrack"]] = relationship(
        back_populates="playlist",
        order_by="PlaylistTrack.position",
        cascade="all, delete-orphan",
    )

    __table_args__ = (Index("ix_playlists_user_id", "user_id"),)


class PlaylistTrack(Base):
    __tablename__ = "playlist_tracks"

    id: Mapped[uuid.UUID] = uuid_pk()
    playlist_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("playlists.id", ondelete="CASCADE"), nullable=False
    )
    track_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    playlist: Mapped[Playlist] = relationship(back_populates="entries")
    track: Mapped[Track] = relationship()

    __table_args__ = (
        # Deferred so a reorder can shuffle positions inside one transaction.
        UniqueConstraint(
            "playlist_id",
            "position",
            name="uq_playlist_tracks_playlist_position",
            deferrable=True,
            initially="DEFERRED",
        ),
        Index("ix_playlist_tracks_track_id", "track_id"),
    )
