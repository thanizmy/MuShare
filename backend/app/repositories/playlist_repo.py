import uuid
from collections.abc import Sequence

from sqlalchemy import Row, Select, delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models import Album, Playlist, PlaylistTrack, Track, User


class PlaylistRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def _summaries(self) -> Select:
        """Playlists with owner, track count and the first track's cover, in one query."""
        count = (
            select(func.count())
            .select_from(PlaylistTrack)
            .where(PlaylistTrack.playlist_id == Playlist.id)
            .correlate(Playlist)
            .scalar_subquery()
        )
        cover = (
            select(Album.cover_url)
            .select_from(PlaylistTrack)
            .join(Track, Track.id == PlaylistTrack.track_id)
            .join(Album, Album.id == Track.album_id)
            .where(PlaylistTrack.playlist_id == Playlist.id)
            .order_by(PlaylistTrack.position)
            .limit(1)
            .correlate(Playlist)
            .scalar_subquery()
        )
        return select(
            Playlist,
            count.label("track_count"),
            cover.label("cover_url"),
            User.id.label("owner_id"),
            User.username.label("owner_username"),
        ).join(User, User.id == Playlist.user_id)

    async def list_for_user(self, user_id: uuid.UUID) -> Sequence[Row]:
        stmt = (
            self._summaries()
            .where(Playlist.user_id == user_id)
            .order_by(Playlist.created_at.desc(), Playlist.id)
        )
        return (await self.session.execute(stmt)).all()

    async def get_summary(self, playlist_id: uuid.UUID) -> Row | None:
        stmt = self._summaries().where(Playlist.id == playlist_id)
        return (await self.session.execute(stmt)).first()

    async def count_for_user(self, user_id: uuid.UUID) -> int:
        return (
            await self.session.scalar(
                select(func.count()).select_from(Playlist).where(Playlist.user_id == user_id)
            )
            or 0
        )

    async def get(self, playlist_id: uuid.UUID, *, lock: bool = False) -> Playlist | None:
        stmt = select(Playlist).where(Playlist.id == playlist_id)
        if lock:
            # Serialises concurrent edits so positions stay contiguous.
            stmt = stmt.with_for_update()
        return await self.session.scalar(stmt)

    async def add(self, playlist: Playlist) -> Playlist:
        self.session.add(playlist)
        await self.session.flush()
        return playlist

    async def delete(self, playlist: Playlist) -> None:
        await self.session.delete(playlist)
        await self.session.flush()

    # ---------------------------------------------------------------- entries
    async def entries(self, playlist_id: uuid.UUID) -> Sequence[PlaylistTrack]:
        stmt = (
            select(PlaylistTrack)
            .where(PlaylistTrack.playlist_id == playlist_id)
            .options(
                joinedload(PlaylistTrack.track).joinedload(Track.album).joinedload(Album.artist),
                joinedload(PlaylistTrack.track).selectinload(Track.genres),
            )
            .order_by(PlaylistTrack.position)
            # Bulk updates bypass the identity map; always reflect what's in the database.
            .execution_options(populate_existing=True)
        )
        return (await self.session.scalars(stmt)).unique().all()

    async def entry_count(self, playlist_id: uuid.UUID) -> int:
        return (
            await self.session.scalar(
                select(func.count())
                .select_from(PlaylistTrack)
                .where(PlaylistTrack.playlist_id == playlist_id)
            )
            or 0
        )

    async def has_track(self, playlist_id: uuid.UUID, track_id: uuid.UUID) -> bool:
        found = await self.session.scalar(
            select(PlaylistTrack.id).where(
                PlaylistTrack.playlist_id == playlist_id, PlaylistTrack.track_id == track_id
            )
        )
        return found is not None

    async def append(self, playlist_id: uuid.UUID, track_id: uuid.UUID) -> PlaylistTrack:
        last = await self.session.scalar(
            select(func.max(PlaylistTrack.position)).where(PlaylistTrack.playlist_id == playlist_id)
        )
        entry = PlaylistTrack(
            playlist_id=playlist_id,
            track_id=track_id,
            position=0 if last is None else last + 1,
        )
        self.session.add(entry)
        await self.session.flush()
        return entry

    async def get_entry(self, playlist_id: uuid.UUID, entry_id: uuid.UUID) -> PlaylistTrack | None:
        return await self.session.scalar(
            select(PlaylistTrack).where(
                PlaylistTrack.playlist_id == playlist_id, PlaylistTrack.id == entry_id
            )
        )

    async def remove_entry(self, entry: PlaylistTrack) -> None:
        """Delete a slot and close the gap it leaves."""
        await self.session.execute(delete(PlaylistTrack).where(PlaylistTrack.id == entry.id))
        await self.session.execute(
            update(PlaylistTrack)
            .where(
                PlaylistTrack.playlist_id == entry.playlist_id,
                PlaylistTrack.position > entry.position,
            )
            .values(position=PlaylistTrack.position - 1)
        )

    async def apply_order(
        self, entries: Sequence[PlaylistTrack], order: Sequence[uuid.UUID]
    ) -> None:
        by_id = {e.id: e for e in entries}
        for position, entry_id in enumerate(order):
            by_id[entry_id].position = position
        # The positions constraint is deferred, so transient duplicates are fine until commit.
        await self.session.flush()
