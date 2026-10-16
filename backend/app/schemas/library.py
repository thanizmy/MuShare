import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator

from app.schemas.catalog import TrackRead

PlaylistTitle = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
]
PlaylistDescription = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]

MAX_PLAYLIST_TRACKS = 500


class PlaylistCreate(BaseModel):
    title: PlaylistTitle
    description: PlaylistDescription | None = None
    is_public: bool = False

    @field_validator("description")
    @classmethod
    def _blank_is_none(cls, value: str | None) -> str | None:
        return value or None


class PlaylistUpdate(BaseModel):
    title: PlaylistTitle | None = None
    description: PlaylistDescription | None = None
    is_public: bool | None = None

    @model_validator(mode="after")
    def _something_to_change(self) -> "PlaylistUpdate":
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update")
        if "title" in self.model_fields_set and self.title is None:
            raise ValueError("Title cannot be empty")
        if "is_public" in self.model_fields_set and self.is_public is None:
            raise ValueError("is_public must be true or false")
        return self


class OwnerSummary(BaseModel):
    id: uuid.UUID
    username: str


class PlaylistSummary(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    is_public: bool
    track_count: int
    cover_url: str | None
    owner: OwnerSummary
    created_at: datetime


class PlaylistEntry(BaseModel):
    """One slot in a playlist. `entry_id` identifies the slot, not the track."""

    entry_id: uuid.UUID
    position: int
    track: TrackRead


class PlaylistDetail(PlaylistSummary):
    entries: list[PlaylistEntry]


class AddPlaylistTrack(BaseModel):
    track_id: uuid.UUID


class ReorderRequest(BaseModel):
    """The complete new order, as entry ids."""

    entry_ids: list[uuid.UUID] = Field(max_length=MAX_PLAYLIST_TRACKS)

    @field_validator("entry_ids")
    @classmethod
    def _unique(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(set(value)) != len(value):
            raise ValueError("entry_ids must be unique")
        return value


class HistoryCreate(BaseModel):
    track_id: uuid.UUID
