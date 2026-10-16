import uuid
from datetime import datetime
from typing import Annotated, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, StringConstraints, field_validator, model_validator

from app.schemas.catalog import ArtistSummary, TrackRead


class UserSummary(BaseModel):
    """A user as shown in lists and search results."""

    id: uuid.UUID
    username: str
    avatar_url: str | None
    bio: str | None
    is_following: bool


class UserProfile(BaseModel):
    id: uuid.UUID
    username: str
    avatar_url: str | None
    bio: str | None
    created_at: datetime
    follower_count: int
    following_count: int
    like_count: int
    is_me: bool
    is_following: bool
    is_liked: bool


class ProfileUpdate(BaseModel):
    bio: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None = None
    avatar_url: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=2048)] | None
    ) = None

    @model_validator(mode="after")
    def _something_to_change(self) -> "ProfileUpdate":
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update")
        return self

    @field_validator("avatar_url")
    @classmethod
    def _https_only(cls, value: str | None) -> str | None:
        if not value:
            return None
        parsed = urlparse(value)
        # Avatars are loaded by other users' browsers, so only plain https images are allowed.
        if parsed.scheme != "https" or not parsed.netloc:
            raise ValueError("Avatar must be an https:// image URL")
        return value

    @field_validator("bio")
    @classmethod
    def _blank_bio_is_none(cls, value: str | None) -> str | None:
        return value or None


WrappedPeriod = Literal["all", "30d"]


class TopArtist(BaseModel):
    artist: ArtistSummary
    plays: int


class TopTrack(BaseModel):
    track: TrackRead
    plays: int


class TopGenre(BaseModel):
    genre: str
    plays: int


class Wrapped(BaseModel):
    username: str
    period: WrappedPeriod
    total_plays: int
    total_minutes: int
    top_artists: list[TopArtist]
    top_tracks: list[TopTrack]
    top_genres: list[TopGenre]
