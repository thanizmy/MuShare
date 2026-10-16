import uuid
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.repositories.catalog_repo import CatalogRepository
from app.schemas.catalog import (
    AlbumDetail,
    AlbumSummary,
    ArtistDetail,
    ArtistSummary,
    SearchResults,
    TrackRead,
)

TOP_TRACKS_PER_ARTIST = 10


class CatalogService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = CatalogRepository(session)

    async def list_tracks(
        self, sort: Literal["popular", "title"], limit: int, offset: int
    ) -> list[TrackRead]:
        tracks = await self.repo.list_tracks(popular=sort == "popular", limit=limit, offset=offset)
        return [TrackRead.model_validate(t) for t in tracks]

    async def get_track(self, track_id: uuid.UUID) -> TrackRead:
        track = await self.repo.get_track(track_id)
        if track is None:
            raise NotFoundError("Track not found")
        return TrackRead.model_validate(track)

    async def list_albums(self, limit: int, offset: int) -> list[AlbumSummary]:
        albums = await self.repo.list_albums(limit=limit, offset=offset)
        return [AlbumSummary.model_validate(a) for a in albums]

    async def get_album(self, album_id: uuid.UUID) -> AlbumDetail:
        album = await self.repo.get_album(album_id)
        if album is None:
            raise NotFoundError("Album not found")
        tracks = await self.repo.tracks_for_album(album_id)
        return AlbumDetail(
            **AlbumSummary.model_validate(album).model_dump(),
            tracks=[TrackRead.model_validate(t) for t in tracks],
        )

    async def list_artists(self, limit: int, offset: int) -> list[ArtistSummary]:
        artists = await self.repo.list_artists(limit=limit, offset=offset)
        return [ArtistSummary.model_validate(a) for a in artists]

    async def get_artist(self, artist_id: uuid.UUID) -> ArtistDetail:
        artist = await self.repo.get_artist(artist_id)
        if artist is None:
            raise NotFoundError("Artist not found")
        albums = await self.repo.albums_for_artist(artist_id)
        top = await self.repo.top_tracks_for_artist(artist_id, TOP_TRACKS_PER_ARTIST)
        return ArtistDetail(
            **ArtistSummary.model_validate(artist).model_dump(),
            bio=artist.bio,
            albums=[AlbumSummary.model_validate(a) for a in albums],
            top_tracks=[TrackRead.model_validate(t) for t in top],
        )

    async def search(self, query: str, limit: int) -> SearchResults:
        tracks = await self.repo.search_tracks(query, limit)
        artists = await self.repo.search_artists(query, limit)
        albums = await self.repo.search_albums(query, limit)
        return SearchResults(
            query=query,
            tracks=[TrackRead.model_validate(t) for t in tracks],
            artists=[ArtistSummary.model_validate(a) for a in artists],
            albums=[AlbumSummary.model_validate(a) for a in albums],
        )
