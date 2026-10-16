import uuid

from sqlalchemy import Row
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.models import Playlist, User
from app.repositories.library_repo import LibraryRepository
from app.repositories.playlist_repo import PlaylistRepository
from app.schemas.catalog import TrackRead
from app.schemas.library import (
    MAX_PLAYLIST_TRACKS,
    OwnerSummary,
    PlaylistCreate,
    PlaylistDetail,
    PlaylistEntry,
    PlaylistSummary,
    PlaylistUpdate,
    ReorderRequest,
)

MAX_PLAYLISTS_PER_USER = 100
NOT_FOUND = "Playlist not found"


def _summary(row: Row) -> PlaylistSummary:
    playlist: Playlist = row.Playlist
    return PlaylistSummary(
        id=playlist.id,
        title=playlist.title,
        description=playlist.description,
        is_public=playlist.is_public,
        track_count=row.track_count,
        cover_url=row.cover_url,
        owner=OwnerSummary(id=row.owner_id, username=row.owner_username),
        created_at=playlist.created_at,
    )


class PlaylistService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = PlaylistRepository(session)
        self.library = LibraryRepository(session)

    # ----------------------------------------------------------------- access
    async def _owned(self, user: User, playlist_id: uuid.UUID) -> Playlist:
        """Fetch (and row-lock) a playlist the caller may edit.

        Private playlists of other users are indistinguishable from missing ones.
        """
        playlist = await self.repo.get(playlist_id, lock=True)
        if playlist is None:
            raise NotFoundError(NOT_FOUND)
        if playlist.user_id != user.id:
            if playlist.is_public:
                raise ForbiddenError("Only the owner can change this playlist")
            raise NotFoundError(NOT_FOUND)
        return playlist

    async def _summary_for(self, playlist_id: uuid.UUID) -> PlaylistSummary:
        row = await self.repo.get_summary(playlist_id)
        assert row is not None
        return _summary(row)

    async def _detail(self, summary: PlaylistSummary) -> PlaylistDetail:
        entries = await self.repo.entries(summary.id)
        return PlaylistDetail(
            **summary.model_dump(),
            entries=[
                PlaylistEntry(
                    entry_id=e.id, position=e.position, track=TrackRead.model_validate(e.track)
                )
                for e in entries
            ],
        )

    # ------------------------------------------------------------------- CRUD
    async def list_mine(self, user: User) -> list[PlaylistSummary]:
        return [_summary(r) for r in await self.repo.list_for_user(user.id)]

    async def create(self, user: User, data: PlaylistCreate) -> PlaylistSummary:
        if await self.repo.count_for_user(user.id) >= MAX_PLAYLISTS_PER_USER:
            raise ConflictError(f"You can have at most {MAX_PLAYLISTS_PER_USER} playlists")
        playlist = await self.repo.add(
            Playlist(
                user_id=user.id,
                title=data.title,
                description=data.description,
                is_public=data.is_public,
            )
        )
        await self.session.commit()
        return await self._summary_for(playlist.id)

    async def get(self, user: User, playlist_id: uuid.UUID) -> PlaylistDetail:
        row = await self.repo.get_summary(playlist_id)
        if row is None:
            raise NotFoundError(NOT_FOUND)
        summary = _summary(row)
        if summary.owner.id != user.id and not summary.is_public:
            raise NotFoundError(NOT_FOUND)
        return await self._detail(summary)

    async def update(
        self, user: User, playlist_id: uuid.UUID, data: PlaylistUpdate
    ) -> PlaylistSummary:
        playlist = await self._owned(user, playlist_id)
        fields = data.model_dump(exclude_unset=True)
        if "title" in fields:
            playlist.title = fields["title"]
        if "description" in fields:
            playlist.description = fields["description"] or None
        if "is_public" in fields:
            playlist.is_public = fields["is_public"]
        await self.session.commit()
        return await self._summary_for(playlist_id)

    async def delete(self, user: User, playlist_id: uuid.UUID) -> None:
        playlist = await self._owned(user, playlist_id)
        await self.repo.delete(playlist)
        await self.session.commit()

    # ----------------------------------------------------------------- tracks
    async def add_track(
        self, user: User, playlist_id: uuid.UUID, track_id: uuid.UUID
    ) -> PlaylistDetail:
        await self._owned(user, playlist_id)
        if not await self.library.track_exists(track_id):
            raise NotFoundError("Track not found")
        if await self.repo.has_track(playlist_id, track_id):
            raise ConflictError("This track is already in the playlist")
        if await self.repo.entry_count(playlist_id) >= MAX_PLAYLIST_TRACKS:
            raise ConflictError(f"A playlist can hold at most {MAX_PLAYLIST_TRACKS} tracks")
        await self.repo.append(playlist_id, track_id)
        await self.session.commit()
        return await self._detail(await self._summary_for(playlist_id))

    async def remove_entry(
        self, user: User, playlist_id: uuid.UUID, entry_id: uuid.UUID
    ) -> PlaylistDetail:
        await self._owned(user, playlist_id)
        entry = await self.repo.get_entry(playlist_id, entry_id)
        if entry is None:
            raise NotFoundError("That track is not in the playlist")
        await self.repo.remove_entry(entry)
        await self.session.commit()
        return await self._detail(await self._summary_for(playlist_id))

    async def reorder(
        self, user: User, playlist_id: uuid.UUID, data: ReorderRequest
    ) -> PlaylistDetail:
        await self._owned(user, playlist_id)
        entries = await self.repo.entries(playlist_id)
        if {e.id for e in entries} != set(data.entry_ids):
            raise ConflictError("The playlist changed. Reload it and try again.")
        await self.repo.apply_order(entries, data.entry_ids)
        await self.session.commit()
        return await self._detail(await self._summary_for(playlist_id))
