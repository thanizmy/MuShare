import uuid

from fastapi import APIRouter, Depends, Response, status

from app.api.deps import get_current_user, get_playlist_service
from app.models import User
from app.schemas.library import (
    AddPlaylistTrack,
    PlaylistCreate,
    PlaylistDetail,
    PlaylistSummary,
    PlaylistUpdate,
    ReorderRequest,
)
from app.services.playlist_service import PlaylistService

router = APIRouter(prefix="/playlists", tags=["playlists"])


@router.get("", response_model=list[PlaylistSummary])
async def list_my_playlists(
    user: User = Depends(get_current_user),
    service: PlaylistService = Depends(get_playlist_service),
):
    return await service.list_mine(user)


@router.post("", response_model=PlaylistSummary, status_code=status.HTTP_201_CREATED)
async def create_playlist(
    data: PlaylistCreate,
    user: User = Depends(get_current_user),
    service: PlaylistService = Depends(get_playlist_service),
):
    return await service.create(user, data)


@router.get("/{playlist_id}", response_model=PlaylistDetail)
async def get_playlist(
    playlist_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: PlaylistService = Depends(get_playlist_service),
):
    return await service.get(user, playlist_id)


@router.patch("/{playlist_id}", response_model=PlaylistSummary)
async def update_playlist(
    playlist_id: uuid.UUID,
    data: PlaylistUpdate,
    user: User = Depends(get_current_user),
    service: PlaylistService = Depends(get_playlist_service),
):
    return await service.update(user, playlist_id, data)


@router.delete("/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_playlist(
    playlist_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: PlaylistService = Depends(get_playlist_service),
):
    await service.delete(user, playlist_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{playlist_id}/tracks", response_model=PlaylistDetail, status_code=status.HTTP_201_CREATED
)
async def add_track(
    playlist_id: uuid.UUID,
    data: AddPlaylistTrack,
    user: User = Depends(get_current_user),
    service: PlaylistService = Depends(get_playlist_service),
):
    return await service.add_track(user, playlist_id, data.track_id)


@router.put("/{playlist_id}/tracks/order", response_model=PlaylistDetail)
async def reorder_tracks(
    playlist_id: uuid.UUID,
    data: ReorderRequest,
    user: User = Depends(get_current_user),
    service: PlaylistService = Depends(get_playlist_service),
):
    return await service.reorder(user, playlist_id, data)


@router.delete("/{playlist_id}/tracks/{entry_id}", response_model=PlaylistDetail)
async def remove_track(
    playlist_id: uuid.UUID,
    entry_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: PlaylistService = Depends(get_playlist_service),
):
    return await service.remove_entry(user, playlist_id, entry_id)
