import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, uuid_pk


def _trgm_index(table: str, column: str) -> Index:
    return Index(
        f"ix_{table}_{column}_trgm",
        column,
        postgresql_using="gin",
        postgresql_ops={column: "gin_trgm_ops"},
    )


class Artist(Base):
    __tablename__ = "artists"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    bio: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(2048))
    # Set for the artist profile that belongs to a user who publishes from My Studio.
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )

    albums: Mapped[list["Album"]] = relationship(back_populates="artist")

    __table_args__ = (_trgm_index("artists", "name"),)


class Album(Base):
    __tablename__ = "albums"

    id: Mapped[uuid.UUID] = uuid_pk()
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    artist_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("artists.id", ondelete="CASCADE"), nullable=False
    )
    cover_url: Mapped[str | None] = mapped_column(String(2048))
    release_year: Mapped[int | None] = mapped_column(SmallInteger)
    # The artist pulled it back from the catalog; it stays only as a greyed-out reference.
    is_hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    artist: Mapped[Artist] = relationship(back_populates="albums")
    tracks: Mapped[list["Track"]] = relationship(
        back_populates="album", order_by="Track.track_number"
    )

    __table_args__ = (
        Index("ix_albums_artist_id", "artist_id"),
        _trgm_index("albums", "title"),
    )


class Genre(Base):
    __tablename__ = "genres"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)


class Track(Base):
    __tablename__ = "tracks"

    id: Mapped[uuid.UUID] = uuid_pk()
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    album_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("albums.id", ondelete="CASCADE"), nullable=False
    )
    track_number: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="1")
    duration_sec: Mapped[int] = mapped_column(Integer, nullable=False)
    audio_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    # Where story previews start inside the full track.
    preview_start_sec: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    is_hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    album: Mapped[Album] = relationship(back_populates="tracks")
    genres: Mapped[list[Genre]] = relationship(secondary="track_genres")

    __table_args__ = (
        CheckConstraint("duration_sec > 0", name="duration_positive"),
        CheckConstraint(
            "preview_start_sec >= 0 AND preview_start_sec < duration_sec",
            name="preview_start_in_range",
        ),
        Index("ix_tracks_album_id", "album_id"),
        _trgm_index("tracks", "title"),
    )


class TrackGenre(Base):
    __tablename__ = "track_genres"

    track_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tracks.id", ondelete="CASCADE"), primary_key=True
    )
    genre_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("genres.id", ondelete="CASCADE"), primary_key=True
    )

    __table_args__ = (Index("ix_track_genres_genre_id", "genre_id"),)
