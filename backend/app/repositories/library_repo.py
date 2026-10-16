import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.models import Album, FavoriteTrack, ListeningHistory, Track

_TRACK_LOAD = (
    joinedload(Track.album).joinedload(Album.artist),
    selectinload(Track.genres),
)


class LibraryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def track_exists(self, track_id: uuid.UUID) -> bool:
        """Whether a track can be saved, played or shared. A track its artist has hidden stays
        in the places that already hold it, but can't be newly added anywhere."""
        found = await self.session.scalar(
            select(Track.id).where(Track.id == track_id, Track.is_hidden.is_(False))
        )
        return found is not None

    # -------------------------------------------------------------- favorites
    async def favorite_ids(self, user_id: uuid.UUID) -> Sequence[uuid.UUID]:
        rows = await self.session.scalars(
            select(FavoriteTrack.track_id)
            .where(FavoriteTrack.user_id == user_id)
            .order_by(FavoriteTrack.saved_at.desc(), FavoriteTrack.track_id)
        )
        return rows.all()

    async def favorite_tracks(self, user_id: uuid.UUID) -> Sequence[Track]:
        stmt = (
            select(Track)
            .join(FavoriteTrack, FavoriteTrack.track_id == Track.id)
            .where(FavoriteTrack.user_id == user_id)
            .options(*_TRACK_LOAD)
            .order_by(FavoriteTrack.saved_at.desc(), Track.id)
        )
        return (await self.session.scalars(stmt)).unique().all()

    async def add_favorite(self, user_id: uuid.UUID, track_id: uuid.UUID) -> None:
        await self.session.execute(
            insert(FavoriteTrack)
            .values(user_id=user_id, track_id=track_id)
            .on_conflict_do_nothing(index_elements=["user_id", "track_id"])
        )

    async def remove_favorite(self, user_id: uuid.UUID, track_id: uuid.UUID) -> None:
        await self.session.execute(
            delete(FavoriteTrack).where(
                FavoriteTrack.user_id == user_id, FavoriteTrack.track_id == track_id
            )
        )

    # ---------------------------------------------------------------- history
    async def last_play(self, user_id: uuid.UUID, track_id: uuid.UUID) -> datetime | None:
        return await self.session.scalar(
            select(func.max(ListeningHistory.played_at)).where(
                ListeningHistory.user_id == user_id, ListeningHistory.track_id == track_id
            )
        )

    async def add_play(self, user_id: uuid.UUID, track_id: uuid.UUID, played_at: datetime) -> None:
        self.session.add(ListeningHistory(user_id=user_id, track_id=track_id, played_at=played_at))
        await self.session.flush()

    async def recently_played(self, user_id: uuid.UUID, limit: int) -> Sequence[Track]:
        """Distinct tracks, most recently played first."""
        recent = (
            select(
                ListeningHistory.track_id,
                func.max(ListeningHistory.played_at).label("last_played"),
            )
            .where(ListeningHistory.user_id == user_id)
            .group_by(ListeningHistory.track_id)
            .subquery()
        )
        stmt = (
            select(Track)
            .join(recent, recent.c.track_id == Track.id)
            .options(*_TRACK_LOAD)
            .order_by(recent.c.last_played.desc(), Track.id)
            .limit(limit)
        )
        return (await self.session.scalars(stmt)).unique().all()
