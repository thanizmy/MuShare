import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, created_at_column, uuid_pk
from app.models.catalog import Track


class PieceStatus(enum.StrEnum):
    DRAFT = "draft"  # uploaded, private to its owner
    PUBLISHED = "published"  # in the catalog, public
    HIDDEN = "hidden"  # was published; the owner pulled it back


class StudioPiece(Base):
    """A piece of audio someone uploaded to My Studio.

    Until the owner publishes it, it exists only here, never in the public catalog tables.
    """

    __tablename__ = "studio_pieces"

    id: Mapped[uuid.UUID] = uuid_pk()
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))

    # Where the files live in the storage backend. Server-generated, never user input.
    audio_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    audio_mime: Mapped[str] = mapped_column(String(50), nullable=False)
    audio_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    duration_sec: Mapped[int] = mapped_column(Integer, nullable=False)
    cover_key: Mapped[str | None] = mapped_column(String(255), unique=True)

    status: Mapped[PieceStatus] = mapped_column(
        Enum(PieceStatus, name="piece_status", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=PieceStatus.DRAFT,
        server_default=PieceStatus.DRAFT.value,
    )
    rights_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # The catalog track created when the piece is first published (kept when hidden).
    track_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tracks.id", ondelete="SET NULL"), unique=True
    )
    track: Mapped[Track | None] = relationship()

    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint("duration_sec > 0", name="duration_positive"),
        CheckConstraint("audio_bytes > 0", name="size_positive"),
        Index("ix_studio_pieces_owner_created", "owner_id", "created_at"),
    )
