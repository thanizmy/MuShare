import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core.config import Settings
from app.core.security import (
    InvalidTokenError,
    create_access_token,
    decode_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)

SECRET = "unit-test-secret-key-with-at-least-32-chars"


@pytest.fixture
def settings() -> Settings:
    return Settings(
        database_url="postgresql+asyncpg://u:p@localhost/db",
        secret_key=SECRET,
        access_token_expire_minutes=15,
    )


def test_password_hash_is_salted_argon2_and_verifies():
    first, second = hash_password("hunter2hunter2"), hash_password("hunter2hunter2")
    assert first.startswith("$argon2id$")
    assert first != second  # unique salt per hash
    assert "hunter2" not in first
    assert verify_password(first, "hunter2hunter2")
    assert not verify_password(first, "wrong-password1")


def test_verify_password_with_no_hash_is_always_false():
    assert verify_password(None, "anything1") is False


def test_verify_password_rejects_garbage_hash():
    assert verify_password("not-a-hash", "whatever1") is False


def test_access_token_round_trip(settings: Settings):
    user_id = uuid.uuid4()
    token = create_access_token(user_id, settings)
    assert decode_access_token(token, settings) == user_id


def test_expired_access_token_is_rejected(settings: Settings):
    payload = {
        "sub": str(uuid.uuid4()),
        "type": "access",
        "iat": datetime.now(UTC) - timedelta(hours=2),
        "exp": datetime.now(UTC) - timedelta(hours=1),
    }
    token = jwt.encode(payload, SECRET, algorithm="HS256")
    with pytest.raises(InvalidTokenError):
        decode_access_token(token, settings)


def test_tampered_or_foreign_signature_is_rejected(settings: Settings):
    token = create_access_token(uuid.uuid4(), settings)
    with pytest.raises(InvalidTokenError):
        decode_access_token(token[:-2] + "xx", settings)

    forged = jwt.encode(
        {"sub": str(uuid.uuid4()), "type": "access", "iat": datetime.now(UTC),
         "exp": datetime.now(UTC) + timedelta(minutes=5)},
        "some-other-secret-that-is-long-enough-xx",
        algorithm="HS256",
    )
    with pytest.raises(InvalidTokenError):
        decode_access_token(forged, settings)


def test_unsigned_token_is_rejected(settings: Settings):
    token = jwt.encode(
        {"sub": str(uuid.uuid4()), "type": "access", "iat": datetime.now(UTC),
         "exp": datetime.now(UTC) + timedelta(minutes=5)},
        key=None,
        algorithm="none",
    )
    with pytest.raises(InvalidTokenError):
        decode_access_token(token, settings)


def test_token_of_wrong_type_is_rejected(settings: Settings):
    token = jwt.encode(
        {"sub": str(uuid.uuid4()), "type": "refresh", "iat": datetime.now(UTC),
         "exp": datetime.now(UTC) + timedelta(minutes=5)},
        SECRET,
        algorithm="HS256",
    )
    with pytest.raises(InvalidTokenError):
        decode_access_token(token, settings)


def test_garbage_token_is_rejected(settings: Settings):
    with pytest.raises(InvalidTokenError):
        decode_access_token("not.a.jwt", settings)


def test_refresh_tokens_are_random_and_stored_hashed():
    raw1, digest1 = generate_refresh_token()
    raw2, _ = generate_refresh_token()
    assert raw1 != raw2
    assert digest1 == hash_refresh_token(raw1)
    assert raw1 not in digest1
    assert len(digest1) == 64
