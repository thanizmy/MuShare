import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.exceptions import ConflictError, NotFoundError
from app.core.media_tokens import sign_media_path
from app.models import PieceStatus, Story, StudioPiece, Track, User
from app.repositories.catalog_repo import CatalogRepository
from app.repositories.library_repo import LibraryRepository
from app.repositories.social_repo import SocialRepository
from app.repositories.story_repo import StoryRepository
from app.repositories.studio_repo import StudioRepository
from app.schemas.catalog import AlbumSummary, ArtistSummary, TrackRead
from app.schemas.stories import (
    StoryAuthor,
    StoryCreate,
    StoryGroup,
    StoryPiece,
    StoryPreview,
    StoryRead,
)

MAX_ACTIVE_STORIES = 30


def _author(user: User) -> StoryAuthor:
    return StoryAuthor(id=user.id, username=user.username, avatar_url=user.avatar_url)


class StoryService:
    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self.session = session
        self.settings = settings
        self.repo = StoryRepository(session)
        self.social = SocialRepository(session)
        self.library = LibraryRepository(session)
        self.catalog = CatalogRepository(session)
        self.studio = StudioRepository(session)

    # ------------------------------------------------------------- read helpers
    async def _previews(self, stories: Sequence[Story]) -> dict[uuid.UUID, Track]:
        """Pick the catalog track that plays behind each story, in two queries per batch."""
        albums = await self.repo.first_tracks_for_albums(
            list({s.album_id for s in stories if s.album_id})
        )
        artists = await self.repo.top_tracks_for_artists(
            list({s.artist_id for s in stories if s.artist_id})
        )
        previews: dict[uuid.UUID, Track] = {}
        for story in stories:
            if story.track is not None:
                previews[story.id] = story.track
            elif story.album_id in albums:
                previews[story.id] = albums[story.album_id]
            elif story.artist_id in artists:
                previews[story.id] = artists[story.artist_id]
        return previews

    def _piece_view(self, story: Story, piece: StudioPiece) -> tuple[StoryPiece, StoryPreview]:
        """A shared studio piece, with links that stop working when the story does.

        These signed links are the only way anyone but the owner can reach an unpublished
        piece's audio, and they are issued here only because this story is being shown to
        someone who is allowed to see it (the author, or one of their followers).
        """
        live = piece.status == PieceStatus.PUBLISHED and piece.track is not None
        view = StoryPiece(
            id=piece.id,
            title=piece.title,
            cover_url=(
                sign_media_path(piece.id, "cover", self.settings, not_after=story.expires_at)
                if piece.cover_key
                else None
            ),
            duration_sec=piece.duration_sec,
            album_id=piece.track.album_id if live and piece.track else None,
            artist_id=piece.track.album.artist_id
            if live and piece.track and piece.track.album
            else None,
        )
        preview = StoryPreview(
            audio_url=sign_media_path(piece.id, "audio", self.settings, not_after=story.expires_at),
            start_sec=min(45, piece.duration_sec // 4),
        )
        return view, preview

    def _read(self, story: Story, previews: dict[uuid.UUID, Track]) -> StoryRead:
        """Build the API shape of one story."""
        piece_view = preview = None
        if story.piece is not None:
            kind = "piece"
            piece_view, preview = self._piece_view(story, story.piece)
        else:
            kind = "track" if story.track else "album" if story.album else "artist"

        preview_track = previews.get(story.id)
        if preview is None and preview_track is not None and not preview_track.is_hidden:
            preview = StoryPreview(
                audio_url=preview_track.audio_url, start_sec=preview_track.preview_start_sec
            )
        return StoryRead(
            id=story.id,
            kind=kind,
            caption=story.caption,
            background_color=story.background_color,
            created_at=story.created_at,
            expires_at=story.expires_at,
            user=_author(story.user),
            track=TrackRead.model_validate(story.track) if story.track else None,
            album=AlbumSummary.model_validate(story.album) if story.album else None,
            artist=ArtistSummary.model_validate(story.artist) if story.artist else None,
            piece=piece_view,
            preview_track=TrackRead.model_validate(preview_track) if preview_track else None,
            preview=preview,
        )

    async def _read_all(self, stories: Sequence[Story]) -> list[StoryRead]:
        previews = await self._previews(stories)
        return [self._read(s, previews) for s in stories]

    async def _require_subject(self, user: User, data: StoryCreate) -> None:
        if data.track_id is not None and not await self.library.track_exists(data.track_id):
            raise NotFoundError("Track not found")
        if data.album_id is not None and not await self.catalog.album_exists(data.album_id):
            raise NotFoundError("Album not found")
        if data.artist_id is not None and not await self.catalog.artist_exists(data.artist_id):
            raise NotFoundError("Artist not found")
        if data.piece_id is not None:
            # You can only share your own pieces. Someone else's looks like a missing one.
            piece = await self.studio.get(data.piece_id)
            if piece is None or piece.owner_id != user.id:
                raise NotFoundError("Piece not found")

    # ----------------------------------------------------------------- commands
    async def create(self, user: User, data: StoryCreate) -> StoryRead:
        await self._require_subject(user, data)
        now = datetime.now(UTC)
        if await self.repo.count_active(user.id, now) >= MAX_ACTIVE_STORIES:
            raise ConflictError(f"You can have at most {MAX_ACTIVE_STORIES} active stories")
        story = await self.repo.add(
            Story(
                user_id=user.id,
                track_id=data.track_id,
                album_id=data.album_id,
                artist_id=data.artist_id,
                piece_id=data.piece_id,
                caption=data.caption,
                background_color=data.background_color,
                # Set both explicitly so the "expires after created" rule always holds.
                created_at=now,
                expires_at=now + timedelta(hours=self.settings.story_ttl_hours),
            )
        )
        await self.session.commit()
        created = await self.repo.get(story.id)
        assert created is not None
        return (await self._read_all([created]))[0]

    async def delete(self, user: User, story_id: uuid.UUID) -> None:
        story = await self.repo.get(story_id)
        # Someone else's story is indistinguishable from a missing one.
        if story is None or story.user_id != user.id:
            raise NotFoundError("Story not found")
        await self.repo.delete(story_id)
        await self.session.commit()

    # ------------------------------------------------------------------- queries
    async def feed(self, viewer: User) -> list[StoryGroup]:
        """Bubbles for the viewer and everyone they follow: the viewer first, then
        whoever posted most recently."""
        stories = await self.repo.active_feed(viewer.id, datetime.now(UTC))
        groups: dict[uuid.UUID, list[Story]] = {}
        for story in stories:  # already oldest-first
            groups.setdefault(story.user_id, []).append(story)

        ordered = sorted(
            groups.items(),
            key=lambda item: (item[0] != viewer.id, -item[1][-1].created_at.timestamp()),
        )
        previews = await self._previews(stories)
        return [
            StoryGroup(
                user=_author(items[0].user), stories=[self._read(s, previews) for s in items]
            )
            for _, items in ordered
        ]

    async def for_user(self, viewer: User | None, username: str) -> list[StoryRead]:
        """A user's active stories, visible only to them and their followers."""
        target = await self.social.get_by_username(username)
        if target is None:
            raise NotFoundError("User not found")
        allowed = viewer is not None and (
            viewer.id == target.id or await self.social.is_following(viewer.id, target.id)
        )
        if not allowed:
            return []
        stories = await self.repo.active_for_user(target.id, datetime.now(UTC))
        return await self._read_all(stories)

    async def purge_expired(self) -> int:
        removed = await self.repo.purge_expired(datetime.now(UTC))
        await self.session.commit()
        return removed
