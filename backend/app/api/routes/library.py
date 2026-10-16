import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from app.api.deps import get_current_user, get_library_service
from app.models import User
from app.schemas.catalog import TrackRead
from app.schemas.library import HistoryCreate
from app.services.library_service import LibraryService

router = APIRouter(prefix="/library", tags=["library"])


@router.get("/favorites", response_model=list[TrackRead])
async def list_favorites(
    user: User = Depends(get_current_user),
    service: LibraryService = Depends(get_library_service),
):
    return await service.favorite_tracks(user.id)


@router.get("/favorites/ids", response_model=list[uuid.UUID])
async def list_favorite_ids(
    user: User = Depends(get_current_user),
    service: LibraryService = Depends(get_library_service),
):
    """Just the ids, so hearts across the app can render without loading every track."""
    return await service.favorite_ids(user.id)


@router.put("/favorites/{track_id}", status_code=status.HTTP_204_NO_CONTENT)
async def add_favorite(
    track_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: LibraryService = Depends(get_library_service),
):
    await service.add_favorite(user.id, track_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/favorites/{track_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_favorite(
    track_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: LibraryService = Depends(get_library_service),
):
    await service.remove_favorite(user.id, track_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/history", status_code=status.HTTP_204_NO_CONTENT)
async def record_play(
    data: HistoryCreate,
    user: User = Depends(get_current_user),
    service: LibraryService = Depends(get_library_service),
):
    await service.record_play(user.id, data.track_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/recently-played", response_model=list[TrackRead])
async def recently_played(
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    user: User = Depends(get_current_user),
    service: LibraryService = Depends(get_library_service),
):
    return await service.recently_played(user.id, limit)
