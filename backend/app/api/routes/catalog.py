import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_catalog_service
from app.schemas.catalog import (
    AlbumDetail,
    AlbumSummary,
    ArtistDetail,
    ArtistSummary,
    SearchResults,
    TrackRead,
)
from app.services.catalog_service import CatalogService

router = APIRouter(tags=["catalog"])

Limit = Annotated[int, Query(ge=1, le=50)]
Offset = Annotated[int, Query(ge=0, le=10_000)]


@router.get("/tracks", response_model=list[TrackRead])
async def list_tracks(
    sort: Literal["popular", "title"] = "popular",
    limit: Limit = 20,
    offset: Offset = 0,
    service: CatalogService = Depends(get_catalog_service),
):
    return await service.list_tracks(sort, limit, offset)


@router.get("/tracks/{track_id}", response_model=TrackRead)
async def get_track(track_id: uuid.UUID, service: CatalogService = Depends(get_catalog_service)):
    return await service.get_track(track_id)


@router.get("/albums", response_model=list[AlbumSummary])
async def list_albums(
    limit: Limit = 20,
    offset: Offset = 0,
    service: CatalogService = Depends(get_catalog_service),
):
    return await service.list_albums(limit, offset)


@router.get("/albums/{album_id}", response_model=AlbumDetail)
async def get_album(album_id: uuid.UUID, service: CatalogService = Depends(get_catalog_service)):
    return await service.get_album(album_id)


@router.get("/artists", response_model=list[ArtistSummary])
async def list_artists(
    limit: Limit = 20,
    offset: Offset = 0,
    service: CatalogService = Depends(get_catalog_service),
):
    return await service.list_artists(limit, offset)


@router.get("/artists/{artist_id}", response_model=ArtistDetail)
async def get_artist(artist_id: uuid.UUID, service: CatalogService = Depends(get_catalog_service)):
    return await service.get_artist(artist_id)


@router.get("/search", response_model=SearchResults)
async def search(
    q: Annotated[str, Query(min_length=1, max_length=100)],
    limit: Annotated[int, Query(ge=1, le=20)] = 8,
    service: CatalogService = Depends(get_catalog_service),
):
    query = " ".join(q.split())
    if not query:
        return SearchResults(query="", tracks=[], artists=[], albums=[])
    return await service.search(query, limit)
