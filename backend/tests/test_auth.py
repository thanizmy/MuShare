import uuid
from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import create_access_token, hash_refresh_token
from app.models import RefreshToken, User

PASSWORD = "correct-horse-9"


def payload(**overrides):
    body = {"email": "Ada@Example.com", "username": "ada_l", "password": PASSWORD}
    body.update(overrides)
    return body


async def register(client: AsyncClient, **overrides):
    return await client.post("/api/auth/register", json=payload(**overrides))


def refresh_cookie_header(token: str) -> dict[str, str]:
    return {"Cookie": f"refresh_token={token}"}


# ---------------------------------------------------------------- registration


async def test_register_creates_user_and_signs_in(client: AsyncClient, session: AsyncSession):
    response = await register(client)

    assert response.status_code == 201
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == "ada@example.com"  # normalised
    assert body["user"]["username"] == "ada_l"
    assert "password" not in body["user"] and "password_hash" not in body["user"]

    user = await session.scalar(select(User).where(User.username == "ada_l"))
    assert user is not None
    assert user.password_hash.startswith("$argon2id$")
    assert PASSWORD not in user.password_hash


async def test_register_sets_secure_refresh_cookie(client: AsyncClient):
    response = await register(client)
    cookie = response.headers["set-cookie"].lower()
    assert "refresh_token=" in cookie
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert "path=/api/auth" in cookie


async def test_register_stores_only_a_hash_of_the_refresh_token(
    client: AsyncClient, session: AsyncSession
):
    response = await register(client)
    raw = response.cookies["refresh_token"]
    stored = (await session.scalars(select(RefreshToken))).all()
    assert [t.token_hash for t in stored] == [hash_refresh_token(raw)]
    assert raw not in stored[0].token_hash


async def test_register_rejects_duplicate_email_any_case(client: AsyncClient):
    assert (await register(client)).status_code == 201
    response = await register(client, email="ADA@example.com", username="someone_else")
    assert response.status_code == 409
    assert "email" in response.json()["detail"].lower()


async def test_register_rejects_duplicate_username_any_case(client: AsyncClient):
    assert (await register(client)).status_code == 201
    response = await register(client, email="new@example.com", username="ADA_L")
    assert response.status_code == 409
    assert "username" in response.json()["detail"].lower()


async def test_register_validates_input(client: AsyncClient):
    cases = [
        {"email": "not-an-email"},
        {"username": "ab"},
        {"username": "has space"},
        {"username": "x" * 31},
        {"password": "short1"},
        {"password": "onlyletters"},
        {"password": "12345678"},
        {"password": "a1" * 100},
    ]
    for overrides in cases:
        response = await register(client, **overrides)
        assert response.status_code == 422, overrides


# ------------------------------------------------------------------------ login


async def test_login_succeeds_with_correct_credentials(client: AsyncClient):
    await register(client)
    response = await client.post(
        "/api/auth/login", json={"email": "ADA@example.com", "password": PASSWORD}
    )
    assert response.status_code == 200
    assert response.json()["access_token"]
    assert "refresh_token=" in response.headers["set-cookie"]


async def test_login_failures_are_indistinguishable(client: AsyncClient):
    await register(client)
    wrong_password = await client.post(
        "/api/auth/login", json={"email": "ada@example.com", "password": "wrong-pass-1"}
    )
    unknown_email = await client.post(
        "/api/auth/login", json={"email": "nobody@example.com", "password": PASSWORD}
    )
    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()
    assert "set-cookie" not in wrong_password.headers


# --------------------------------------------------------------------------- me


async def test_me_requires_authentication(client: AsyncClient):
    response = await client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


async def test_me_returns_current_user(client: AsyncClient):
    token = (await register(client)).json()["access_token"]
    response = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["username"] == "ada_l"


async def test_me_rejects_bad_tokens(client: AsyncClient):
    await register(client)
    for token in ("garbage", create_access_token(uuid.uuid4(), get_settings())):
        # The second is validly signed but names a user that does not exist.
        response = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401


async def test_me_rejects_expired_token(client: AsyncClient):
    user_id = (await register(client)).json()["user"]["id"]
    settings = get_settings()
    import jwt

    expired = jwt.encode(
        {
            "sub": user_id,
            "type": "access",
            "iat": datetime.now(UTC) - timedelta(hours=2),
            "exp": datetime.now(UTC) - timedelta(hours=1),
        },
        settings.secret_key,
        algorithm=settings.jwt_algorithm,
    )
    response = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired}"})
    assert response.status_code == 401


# ---------------------------------------------------------------------- refresh


async def test_refresh_rotates_token_and_returns_new_access_token(client: AsyncClient):
    old = (await register(client)).cookies["refresh_token"]

    response = await client.post("/api/auth/refresh", headers=refresh_cookie_header(old))

    assert response.status_code == 200
    assert response.json()["access_token"]
    new = response.cookies["refresh_token"]
    assert new != old

    replay = await client.post("/api/auth/refresh", headers=refresh_cookie_header(old))
    assert replay.status_code == 401


async def test_refresh_without_cookie_is_unauthorised(client: AsyncClient):
    response = await client.post("/api/auth/refresh")
    assert response.status_code == 401


async def test_refresh_with_unknown_token_is_unauthorised_and_clears_cookie(client: AsyncClient):
    response = await client.post("/api/auth/refresh", headers=refresh_cookie_header("nope"))
    assert response.status_code == 401
    assert "max-age=0" in response.headers["set-cookie"].lower()


async def test_refresh_rejects_expired_token(client: AsyncClient, session: AsyncSession):
    raw = (await register(client)).cookies["refresh_token"]
    await session.execute(
        update(RefreshToken).values(expires_at=datetime.now(UTC) - timedelta(minutes=1))
    )
    response = await client.post("/api/auth/refresh", headers=refresh_cookie_header(raw))
    assert response.status_code == 401


async def test_reusing_an_old_refresh_token_revokes_every_session(
    client: AsyncClient, session: AsyncSession
):
    stolen = (await register(client)).cookies["refresh_token"]
    rotated = (
        await client.post("/api/auth/refresh", headers=refresh_cookie_header(stolen))
    ).cookies["refresh_token"]

    # The first rotation happened long enough ago that replay is not a benign race.
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.token_hash == hash_refresh_token(stolen))
        .values(revoked_at=datetime.now(UTC) - timedelta(minutes=5))
    )

    replay = await client.post("/api/auth/refresh", headers=refresh_cookie_header(stolen))
    assert replay.status_code == 401

    # The legitimate, rotated token is now dead too.
    legit = await client.post("/api/auth/refresh", headers=refresh_cookie_header(rotated))
    assert legit.status_code == 401


async def test_near_simultaneous_refresh_does_not_kill_the_session(client: AsyncClient):
    first = (await register(client)).cookies["refresh_token"]
    rotated = (
        await client.post("/api/auth/refresh", headers=refresh_cookie_header(first))
    ).cookies["refresh_token"]

    # A second tab presents the same token moments later: rejected, but no mass revoke.
    race = await client.post("/api/auth/refresh", headers=refresh_cookie_header(first))
    assert race.status_code == 401

    still_valid = await client.post("/api/auth/refresh", headers=refresh_cookie_header(rotated))
    assert still_valid.status_code == 200


# ----------------------------------------------------------------------- logout


async def test_logout_revokes_refresh_token_and_clears_cookie(client: AsyncClient):
    raw = (await register(client)).cookies["refresh_token"]

    response = await client.post("/api/auth/logout", headers=refresh_cookie_header(raw))

    assert response.status_code == 204
    assert "max-age=0" in response.headers["set-cookie"].lower()
    after = await client.post("/api/auth/refresh", headers=refresh_cookie_header(raw))
    assert after.status_code == 401


async def test_logout_without_session_is_a_harmless_noop(client: AsyncClient):
    response = await client.post("/api/auth/logout")
    assert response.status_code == 204
