import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_media_storage, get_session
from app.core.config import Settings, get_settings
from app.core.exceptions import NotFoundError
from app.core.media_tokens import verify_media_token
from app.core.storage import Storage
from app.models import PieceStatus
from app.repositories.studio_repo import StudioRepository

router = APIRouter(prefix="/media", tags=["media"])

COVER_MIME = "image/jpeg"


@router.get("/pieces/{piece_id}/{kind}")
async def piece_media(
    piece_id: uuid.UUID,
    kind: Literal["audio", "cover"],
    token: str | None = Query(default=None, max_length=2000),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    storage: Storage = Depends(get_media_storage),
) -> Response:
    """Audio or cover art of an uploaded piece.

    Open to everyone while the piece is published. Otherwise only with a signed token, which
    the API gives to the owner, and to the author's followers for a story that shares it.
    Every refusal is the same 404, so nothing reveals that a private piece exists.
    """
    piece = await StudioRepository(session).get(piece_id)
    published = piece is not None and piece.status == PieceStatus.PUBLISHED
    signed = bool(token) and verify_media_token(token or "", piece_id, kind, settings)
    if piece is None or not (published or signed):
        raise NotFoundError("Not found")

    key = piece.audio_key if kind == "audio" else piece.cover_key
    if key is None:
        raise NotFoundError("Not found")

    response = storage.serve(key, piece.audio_mime if kind == "audio" else COVER_MIME)
    # Short caching, so unpublishing takes effect quickly; "private" keeps shared caches
    # from holding on to something that was only reachable with a signed link.
    scope = "public" if published and not signed else "private"
    response.headers["Cache-Control"] = f"{scope}, max-age=300"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Content-Disposition"] = "inline"
    return response
