"""Short-lived signed links for media that isn't public.

A browser's <audio> and <img> elements can't send an Authorization header, so private files
(drafts, hidden pieces, a piece shared only to followers' stories) are fetched with a signed
`?token=` that the API hands out only to people allowed to see them.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

import jwt

from app.core.config import Settings

MEDIA_TOKEN_TYPE = "media"
MediaKind = Literal["audio", "cover"]


def media_path(piece_id: uuid.UUID, kind: MediaKind) -> str:
    """The unsigned URL, which only works while the piece is published."""
    return f"/api/media/pieces/{piece_id}/{kind}"


def sign_media_path(
    piece_id: uuid.UUID,
    kind: MediaKind,
    settings: Settings,
    *,
    not_after: datetime | None = None,
) -> str:
    """A signed URL for one piece's audio or cover.

    Valid for `media_token_ttl_seconds`, or until `not_after` if that comes sooner (a story's
    expiry), so a link can never outlive the thing that justified issuing it.
    """
    now = datetime.now(UTC)
    expires = now + timedelta(seconds=settings.media_token_ttl_seconds)
    if not_after is not None:
        expires = min(expires, not_after)
    token = jwt.encode(
        {
            "typ": MEDIA_TOKEN_TYPE,
            "sub": str(piece_id),
            "kind": kind,
            "iat": now,
            "exp": expires,
        },
        settings.secret_key,
        algorithm=settings.jwt_algorithm,
    )
    return f"{media_path(piece_id, kind)}?token={token}"


def verify_media_token(
    token: str, piece_id: uuid.UUID, kind: MediaKind, settings: Settings
) -> bool:
    """True only for a valid, unexpired token issued for exactly this piece and kind."""
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "sub", "iat"]},
        )
    except jwt.PyJWTError:
        return False
    return (
        payload.get("typ") == MEDIA_TOKEN_TYPE
        and payload.get("sub") == str(piece_id)
        and payload.get("kind") == kind
    )
