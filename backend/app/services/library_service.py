import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.repositories.library_repo import LibraryRepository
from app.schemas.catalog import TrackRead

# A repeated report of the same play (double-click, retry, two tabs) is not a new play.
PLAY_DEDUPE_WINDOW = timedelta(seconds=30)


class LibraryService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = LibraryRepository(session)

    async def _require_track(self, track_id: uuid.UUID) -> None:
        if not await self.repo.track_exists(track_id):
            raise NotFoundError("Track not found")

    # -------------------------------------------------------------- favorites
    async def favorite_ids(self, user_id: uuid.UUID) -> list[uuid.UUID]:
        return list(await self.repo.favorite_ids(user_id))

    async def favorite_tracks(self, user_id: uuid.UUID) -> list[TrackRead]:
        return [TrackRead.model_validate(t) for t in await self.repo.favorite_tracks(user_id)]

    async def add_favorite(self, user_id: uuid.UUID, track_id: uuid.UUID) -> None:
        await self._require_track(track_id)
        await self.repo.add_favorite(user_id, track_id)
        await self.session.commit()

    async def remove_favorite(self, user_id: uuid.UUID, track_id: uuid.UUID) -> None:
        await self.repo.remove_favorite(user_id, track_id)
        await self.session.commit()

    # ---------------------------------------------------------------- history
    async def record_play(self, user_id: uuid.UUID, track_id: uuid.UUID) -> bool:
        """Log a play. Returns False when it duplicates one logged moments ago."""
        await self._require_track(track_id)
        now = datetime.now(UTC)
        last = await self.repo.last_play(user_id, track_id)
        if last is not None and now - last < PLAY_DEDUPE_WINDOW:
            return False
        await self.repo.add_play(user_id, track_id, now)
        await self.session.commit()
        return True

    async def recently_played(self, user_id: uuid.UUID, limit: int) -> list[TrackRead]:
        tracks = await self.repo.recently_played(user_id, limit)
        return [TrackRead.model_validate(t) for t in tracks]
