import re
import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints, field_validator, model_validator

from app.schemas.catalog import AlbumSummary, ArtistSummary, TrackRead

DEFAULT_GRADIENT = "#1DB954,#0B3D2E"
_GRADIENT = re.compile(r"^#[0-9A-Fa-f]{6},#[0-9A-Fa-f]{6}$")

Caption = Annotated[str, StringConstraints(strip_whitespace=True, max_length=280)]
StoryKind = Literal["track", "album", "artist", "piece"]


class StoryCreate(BaseModel):
    """Share one track, album, artist or studio piece: exactly one of the four ids."""

    track_id: uuid.UUID | None = None
    album_id: uuid.UUID | None = None
    artist_id: uuid.UUID | None = None
    # One of the sharer's own My Studio pieces, published or not.
    piece_id: uuid.UUID | None = None
    caption: Caption | None = None
    # Two hex colours, "#RRGGBB,#RRGGBB"; the page renders them as a gradient.
    background_color: str = DEFAULT_GRADIENT

    @model_validator(mode="after")
    def _exactly_one_subject(self) -> "StoryCreate":
        ids = (self.track_id, self.album_id, self.artist_id, self.piece_id)
        if sum(x is not None for x in ids) != 1:
            raise ValueError("Share exactly one of track_id, album_id, artist_id or piece_id")
        return self

    @field_validator("caption")
    @classmethod
    def _blank_caption_is_none(cls, value: str | None) -> str | None:
        return value or None

    @field_validator("background_color")
    @classmethod
    def _valid_gradient(cls, value: str) -> str:
        if not _GRADIENT.fullmatch(value):
            raise ValueError("Background must be two hex colours like #1DB954,#0B3D2E")
        return value.upper()


class StoryAuthor(BaseModel):
    id: uuid.UUID
    username: str
    avatar_url: str | None


class StoryPiece(BaseModel):
    """What viewers see of a shared studio piece. Never its description, and the links are
    signed, expiring ones issued only to people allowed to see the story."""

    id: uuid.UUID
    title: str
    cover_url: str | None
    duration_sec: int
    # Where to go for more, but only once the owner has published it.
    album_id: uuid.UUID | None
    artist_id: uuid.UUID | None


class StoryPreview(BaseModel):
    """The audio that plays behind a story, whatever the story is about."""

    audio_url: str
    start_sec: int


class StoryRead(BaseModel):
    id: uuid.UUID
    kind: StoryKind
    caption: str | None
    background_color: str
    created_at: datetime
    expires_at: datetime
    user: StoryAuthor
    # Whichever of these the story is about; the other two are null.
    track: TrackRead | None
    album: AlbumSummary | None
    artist: ArtistSummary | None
    piece: StoryPiece | None
    # What plays behind the story: the track itself, an album's first track, or an
    # artist's most-played track. Null when there is nothing to play.
    preview_track: TrackRead | None
    # What the viewer actually plays; null when there is nothing to play.
    preview: StoryPreview | None


class StoryGroup(BaseModel):
    """One person's active stories, oldest first, as shown in a story bubble."""

    user: StoryAuthor
    stories: list[StoryRead]
