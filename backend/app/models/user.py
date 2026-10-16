import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at_column, uuid_pk


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = uuid_pk()
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    username: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(2048))
    bio: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_column()

    __table_args__ = (
        # "Alice" and "alice" must not coexist.
        Index("uq_users_username_lower", text("lower(username)"), unique=True),
        Index(
            "ix_users_username_trgm",
            "username",
            postgresql_using="gin",
            postgresql_ops={"username": "gin_trgm_ops"},
        ),
    )


class FriendshipStatus(enum.StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"


class Friendship(Base):
    """A one-way follow edge: follower_id follows following_id."""

    __tablename__ = "friendships"

    follower_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    following_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    status: Mapped[FriendshipStatus] = mapped_column(
        Enum(
            FriendshipStatus,
            name="friendship_status",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        default=FriendshipStatus.ACCEPTED,
        server_default=FriendshipStatus.ACCEPTED.value,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint("follower_id <> following_id", name="no_self_follow"),
        Index("ix_friendships_following_id", "following_id"),
    )
