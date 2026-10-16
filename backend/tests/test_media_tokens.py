import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

import jwt
import pytest

from app.core.config import Settings
from app.core.media_tokens import media_path, sign_media_path, verify_media_token
from app.core.security import InvalidTokenError, create_access_token, decode_access_token

SECRET = "media-token-test-secret-with-enough-length"


@pytest.fixture
def settings() -> Settings:
    return Settings(
        database_url="postgres://u:p@h/db", secret_key=SECRET, media_token_ttl_seconds=3600
    )


def token_of(url: str) -> str:
    return parse_qs(urlparse(url).query)["token"][0]


def test_signed_urls_point_at_the_media_route_and_verify(settings):
    piece = uuid.uuid4()
    url = sign_media_path(piece, "audio", settings)
    assert url.startswith(f"{media_path(piece, 'audio')}?token=")
    assert verify_media_token(token_of(url), piece, "audio", settings)


def test_a_token_only_works_for_its_own_piece(settings):
    token = token_of(sign_media_path(uuid.uuid4(), "audio", settings))
    assert not verify_media_token(token, uuid.uuid4(), "audio", settings)


def test_an_audio_token_cannot_fetch_the_cover_and_vice_versa(settings):
    piece = uuid.uuid4()
    audio = token_of(sign_media_path(piece, "audio", settings))
    cover = token_of(sign_media_path(piece, "cover", settings))
    assert not verify_media_token(audio, piece, "cover", settings)
    assert not verify_media_token(cover, piece, "audio", settings)


def test_expired_tokens_are_rejected(settings):
    piece = uuid.uuid4()
    expired = jwt.encode(
        {
            "typ": "media",
            "sub": str(piece),
            "kind": "audio",
            "iat": datetime.now(UTC) - timedelta(hours=2),
            "exp": datetime.now(UTC) - timedelta(hours=1),
        },
        SECRET,
        algorithm="HS256",
    )
    assert not verify_media_token(expired, piece, "audio", settings)


def test_the_expiry_never_outlives_the_story_that_justified_it(settings):
    piece = uuid.uuid4()
    soon = datetime.now(UTC) + timedelta(minutes=5)
    token = token_of(sign_media_path(piece, "audio", settings, not_after=soon))
    exp = datetime.fromtimestamp(jwt.decode(token, SECRET, algorithms=["HS256"])["exp"], UTC)
    assert abs((exp - soon).total_seconds()) < 2

    later = datetime.now(UTC) + timedelta(days=3)
    token = token_of(sign_media_path(piece, "audio", settings, not_after=later))
    exp = datetime.fromtimestamp(jwt.decode(token, SECRET, algorithms=["HS256"])["exp"], UTC)
    assert exp - datetime.now(UTC) <= timedelta(seconds=3601)  # capped by the normal TTL


@pytest.mark.parametrize("bad", ["", "garbage", "a.b.c", "x" * 300])
def test_garbage_is_rejected(settings, bad):
    assert not verify_media_token(bad, uuid.uuid4(), "audio", settings)


def test_tampered_and_foreign_signatures_are_rejected(settings):
    piece = uuid.uuid4()
    token = token_of(sign_media_path(piece, "audio", settings))
    assert not verify_media_token(token[:-3] + "AAA", piece, "audio", settings)

    forged = jwt.encode(
        {
            "typ": "media",
            "sub": str(piece),
            "kind": "audio",
            "iat": datetime.now(UTC),
            "exp": datetime.now(UTC) + timedelta(hours=1),
        },
        "another-secret-that-is-also-long-enough-xx",
        algorithm="HS256",
    )
    assert not verify_media_token(forged, piece, "audio", settings)


def test_unsigned_tokens_are_rejected(settings):
    piece = uuid.uuid4()
    unsigned = jwt.encode(
        {
            "typ": "media",
            "sub": str(piece),
            "kind": "audio",
            "iat": datetime.now(UTC),
            "exp": datetime.now(UTC) + timedelta(hours=1),
        },
        key=None,
        algorithm="none",
    )
    assert not verify_media_token(unsigned, piece, "audio", settings)


def test_login_tokens_and_media_tokens_are_not_interchangeable(settings):
    user = uuid.uuid4()
    access = create_access_token(user, settings)
    assert not verify_media_token(access, user, "audio", settings)

    media = token_of(sign_media_path(user, "audio", settings))
    with pytest.raises(InvalidTokenError):
        decode_access_token(media, settings)
