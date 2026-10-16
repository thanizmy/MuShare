import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile, status

from app.api.deps import get_current_user, get_studio_service
from app.core.config import Settings, get_settings
from app.core.exceptions import PayloadTooLargeError, TooManyRequestsError
from app.core.ratelimit import AttemptLimiter, get_upload_limiter
from app.models import User
from app.schemas.studio import PieceRead, PieceUpdate, PublishRequest, StudioUsage
from app.services.media_processing import InvalidUploadError
from app.services.studio_service import StudioService

router = APIRouter(prefix="/studio", tags=["studio"])

CHUNK = 1024 * 1024


async def read_limited(upload: UploadFile, limit: int, what: str) -> bytes:
    """Read an upload, stopping as soon as it passes the limit instead of buffering it all."""
    chunks: list[bytes] = []
    total = 0
    while chunk := await upload.read(CHUNK):
        total += len(chunk)
        if total > limit:
            raise PayloadTooLargeError(
                f"That {what} is too large. The limit is {limit // (1024 * 1024)} MB."
            )
        chunks.append(chunk)
    if total == 0:
        raise InvalidUploadError(f"That {what} is empty.")
    return b"".join(chunks)


@router.get("/usage", response_model=StudioUsage)
async def usage(
    user: User = Depends(get_current_user),
    service: StudioService = Depends(get_studio_service),
):
    return await service.usage(user)


@router.get("/pieces", response_model=list[PieceRead])
async def list_pieces(
    user: User = Depends(get_current_user),
    service: StudioService = Depends(get_studio_service),
):
    return await service.list_pieces(user)


@router.post("/pieces", response_model=PieceRead, status_code=status.HTTP_201_CREATED)
async def upload_piece(
    audio: Annotated[UploadFile, File()],
    title: Annotated[str | None, Form(max_length=120)] = None,
    description: Annotated[str | None, Form(max_length=500)] = None,
    cover: Annotated[UploadFile | None, File()] = None,
    user: User = Depends(get_current_user),
    service: StudioService = Depends(get_studio_service),
    settings: Settings = Depends(get_settings),
    limiter: AttemptLimiter = Depends(get_upload_limiter),
):
    key = str(user.id)
    wait = limiter.retry_after(key)
    if wait:
        raise TooManyRequestsError(
            f"You're uploading too fast. Try again in {max(1, round(wait / 60))} minute(s).",
            retry_after=wait,
        )
    limiter.record(key)  # every attempt counts, so failed uploads can't be used to hammer us

    audio_bytes = await read_limited(audio, settings.studio_max_audio_bytes, "audio file")
    cover_bytes = None
    if cover is not None and cover.filename:
        cover_bytes = await read_limited(cover, settings.studio_max_cover_bytes, "cover image")
    return await service.upload(
        user,
        audio=audio_bytes,
        filename=audio.filename,
        title=title,
        description=description,
        cover=cover_bytes,
    )


@router.get("/pieces/{piece_id}", response_model=PieceRead)
async def get_piece(
    piece_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: StudioService = Depends(get_studio_service),
):
    return await service.get(user, piece_id)


@router.patch("/pieces/{piece_id}", response_model=PieceRead)
async def update_piece(
    piece_id: uuid.UUID,
    data: PieceUpdate,
    user: User = Depends(get_current_user),
    service: StudioService = Depends(get_studio_service),
):
    return await service.update(user, piece_id, data)


@router.put("/pieces/{piece_id}/cover", response_model=PieceRead)
async def set_cover(
    piece_id: uuid.UUID,
    cover: Annotated[UploadFile, File()],
    user: User = Depends(get_current_user),
    service: StudioService = Depends(get_studio_service),
    settings: Settings = Depends(get_settings),
):
    data = await read_limited(cover, settings.studio_max_cover_bytes, "cover image")
    return await service.set_cover(user, piece_id, data)


@router.delete("/pieces/{piece_id}/cover", response_model=PieceRead)
async def remove_cover(
    piece_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: StudioService = Depends(get_studio_service),
):
    return await service.remove_cover(user, piece_id)


@router.post("/pieces/{piece_id}/publish", response_model=PieceRead)
async def publish_piece(
    piece_id: uuid.UUID,
    data: PublishRequest,
    user: User = Depends(get_current_user),
    service: StudioService = Depends(get_studio_service),
):
    return await service.publish(user, piece_id, data)


@router.post("/pieces/{piece_id}/unpublish", response_model=PieceRead)
async def unpublish_piece(
    piece_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: StudioService = Depends(get_studio_service),
):
    return await service.unpublish(user, piece_id)


@router.delete("/pieces/{piece_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_piece(
    piece_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: StudioService = Depends(get_studio_service),
):
    await service.delete(user, piece_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
