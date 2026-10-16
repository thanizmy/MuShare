import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, StringConstraints, field_validator, model_validator

from app.models.studio import PieceStatus

PieceTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
PieceDescription = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
ArtistName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class PieceRead(BaseModel):
    """A piece as its owner sees it. The signed URLs work for an hour, for the owner's own
    player and thumbnails; they are never included in anyone else's view."""

    id: uuid.UUID
    title: str
    description: str | None
    status: PieceStatus
    duration_sec: int
    audio_bytes: int
    audio_url: str
    cover_url: str | None
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None
    # Present once published (kept while hidden), so the owner can link to the catalog page.
    track_id: uuid.UUID | None
    album_id: uuid.UUID | None
    artist_id: uuid.UUID | None


class PieceUpdate(BaseModel):
    title: PieceTitle | None = None
    description: PieceDescription | None = None

    @model_validator(mode="after")
    def _something_to_change(self) -> "PieceUpdate":
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update")
        if "title" in self.model_fields_set and self.title is None:
            raise ValueError("Title cannot be empty")
        return self

    @field_validator("description")
    @classmethod
    def _blank_is_none(cls, value: str | None) -> str | None:
        return value or None


class PublishRequest(BaseModel):
    """Publishing is the owner's explicit decision, and they must say they hold the rights."""

    rights_confirmed: bool
    artist_name: ArtistName | None = None

    @field_validator("rights_confirmed")
    @classmethod
    def _must_confirm(cls, value: bool) -> bool:
        if value is not True:
            raise ValueError("Confirm that you own the rights to publish this piece")
        return value


class StudioUsage(BaseModel):
    """What's been used against the per-person limits, and what the limits are."""

    pieces_used: int
    pieces_limit: int
    bytes_used: int
    bytes_limit: int
    max_audio_bytes: int
    max_cover_bytes: int
    max_duration_sec: int
    allowed_types: list[str]
    artist_name: str | None
