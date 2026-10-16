import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.models import (
    Album,
    Friendship,
    FriendshipStatus,
    ListeningHistory,
    Story,
    StudioPiece,
    Track,
)

_TRACK_LOAD = (
    joinedload(Track.album).joinedload(Album.artist),
    selectinload(Track.genres),
)

_LOAD = (
    joinedload(Story.user),
    joinedload(Story.track).joinedload(Track.album).joinedload(Album.artist),
    joinedload(Story.track).selectinload(Track.genres),
    joinedload(Story.album).joinedload(Album.artist),
    joinedload(Story.artist),
    joinedload(Story.piece).joinedload(StudioPiece.track).joinedload(Track.album),
)


class StoryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, story: Story) -> Story:
        self.session.add(story)
        await self.session.flush()
        return story

    async def get(self, story_id: uuid.UUID) -> Story | None:
        stmt = select(Story).where(Story.id == story_id).options(*_LOAD)
        return (await self.session.scalars(stmt)).unique().first()

    async def delete(self, story_id: uuid.UUID) -> None:
        await self.session.execute(delete(Story).where(Story.id == story_id))

    async def count_active(self, user_id: uuid.UUID, now: datetime) -> int:
        return (
            await self.session.scalar(
                select(func.count()).where(Story.user_id == user_id, Story.expires_at > now)
            )
            or 0
        )

    async def active_for_user(self, user_id: uuid.UUID, now: datetime) -> Sequence[Story]:
        stmt = (
            select(Story)
            .where(Story.user_id == user_id, Story.expires_at > now)
            .options(*_LOAD)
            .order_by(Story.created_at, Story.id)
        )
        return (await self.session.scalars(stmt)).unique().all()

    async def active_feed(self, viewer_id: uuid.UUID, now: datetime) -> Sequence[Story]:
        """Active stories by the viewer and by everyone the viewer follows."""
        followed = select(Friendship.following_id).where(
            Friendship.follower_id == viewer_id,
            Friendship.status == FriendshipStatus.ACCEPTED,
        )
        stmt = (
            select(Story)
            .where(
                Story.expires_at > now,
                (Story.user_id == viewer_id) | Story.user_id.in_(followed),
            )
            .options(*_LOAD)
            .order_by(Story.created_at, Story.id)
        )
        return (await self.session.scalars(stmt)).unique().all()

    async def purge_expired(self, now: datetime) -> int:
        result = await self.session.execute(delete(Story).where(Story.expires_at <= now))
        return result.rowcount or 0

    # ------------------------------------------------- preview tracks (batched)
    async def first_tracks_for_albums(
        self, album_ids: Sequence[uuid.UUID]
    ) -> dict[uuid.UUID, Track]:
        """Each album's opening track."""
        if not album_ids:
            return {}
        stmt = (
            select(Track)
            .where(Track.album_id.in_(album_ids), Track.is_hidden.is_(False))
            .options(*_TRACK_LOAD)
            .order_by(Track.album_id, Track.track_number, Track.id)
        )
        found: dict[uuid.UUID, Track] = {}
        for track in (await self.session.scalars(stmt)).unique():
            found.setdefault(track.album_id, track)
        return found

    async def top_tracks_for_artists(
        self, artist_ids: Sequence[uuid.UUID]
    ) -> dict[uuid.UUID, Track]:
        """Each artist's most-played track (ties broken by title)."""
        if not artist_ids:
            return {}
        plays = (
            select(ListeningHistory.track_id, func.count().label("plays"))
            .group_by(ListeningHistory.track_id)
            .subquery()
        )
        stmt = (
            select(Track, Album.artist_id)
            .join(Album, Album.id == Track.album_id)
            .outerjoin(plays, plays.c.track_id == Track.id)
            .where(Album.artist_id.in_(artist_ids), Track.is_hidden.is_(False))
            .options(*_TRACK_LOAD)
            .order_by(
                Album.artist_id, func.coalesce(plays.c.plays, 0).desc(), Track.title, Track.id
            )
        )
        found: dict[uuid.UUID, Track] = {}
        for track, artist_id in (await self.session.execute(stmt)).unique().all():
            found.setdefault(artist_id, track)
        return found
