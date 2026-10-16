import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict, field_validator, model_validator


class ArtistSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    image_url: str | None


class AlbumSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    cover_url: str | None
    release_year: int | None
    artist: ArtistSummary


class TrackRead(BaseModel):
    """A playable track with enough context (album, artist, cover) to render a player."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    track_number: int
    duration_sec: int
    audio_url: str
    preview_start_sec: int
    album: AlbumSummary
    genres: list[str]
    # The artist pulled this back. It is kept only as a greyed-out reference (in a playlist,
    # favourites, history...), and it can't be played.
    is_hidden: bool = False

    @field_validator("genres", mode="before")
    @classmethod
    def _genre_names(cls, value: Any) -> Any:
        return [getattr(g, "name", g) for g in value]

    @model_validator(mode="after")
    def _never_expose_hidden_audio(self) -> "TrackRead":
        # Enforced here, in the one schema every track response goes through, so no endpoint
        # can leak the audio link of a hidden track by forgetting to check.
        if self.is_hidden:
            self.audio_url = ""
        return self


class ArtistDetail(ArtistSummary):
    bio: str | None
    albums: list[AlbumSummary]
    top_tracks: list[TrackRead]


class AlbumDetail(AlbumSummary):
    tracks: list[TrackRead]


class SearchResults(BaseModel):
    query: str
    tracks: list[TrackRead]
    artists: list[ArtistSummary]
    albums: list[AlbumSummary]
