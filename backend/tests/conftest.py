import asyncio
import os
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import asyncpg
import pytest
from dotenv import dotenv_values  # noqa: E402
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _test_database_url() -> str:
    if explicit := os.environ.get("TEST_DATABASE_URL"):
        return explicit
    base = os.environ.get("DATABASE_URL") or dotenv_values(BACKEND_DIR / ".env").get("DATABASE_URL")
    if not base:
        raise RuntimeError("Set DATABASE_URL or TEST_DATABASE_URL (see .env.example)")
    return make_url(base).set(database="mushare_test").render_as_string(hide_password=False)


# Settings must point at the test database before `app` is imported.
TEST_DATABASE_URL = _test_database_url()
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-at-least-32-characters-long")

from alembic.config import Config  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from alembic import command  # noqa: E402
from app.api.deps import get_media_storage, get_session  # noqa: E402
from app.core.ratelimit import get_login_limits, get_upload_limiter  # noqa: E402
from app.core.storage import LocalStorage  # noqa: E402
from app.main import create_app  # noqa: E402


def alembic_config(url: str) -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


def _raw_dsn(url: str, database: str | None = None) -> str:
    parsed = make_url(url)
    return parsed.set(
        drivername="postgresql", database=database or parsed.database
    ).render_as_string(hide_password=False)


async def _recreate_database(url: str) -> None:
    name = make_url(url).database
    conn = await asyncpg.connect(_raw_dsn(url, "postgres"))
    try:
        await conn.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
        await conn.execute(f'CREATE DATABASE "{name}"')
    finally:
        await conn.close()


def recreate_database(url: str) -> None:
    asyncio.run(_recreate_database(url))


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> Iterator[None]:
    """Fresh test database built by the real Alembic migrations."""
    recreate_database(TEST_DATABASE_URL)
    command.upgrade(alembic_config(TEST_DATABASE_URL), "head")
    yield


@pytest.fixture(autouse=True)
def _fresh_rate_limits():
    """Limiter state is process-wide; keep tests independent of each other."""
    get_login_limits().clear()
    get_upload_limiter().clear()
    yield
    get_login_limits().clear()
    get_upload_limiter().clear()


@pytest.fixture
async def session() -> AsyncIterator[AsyncSession]:
    """Session inside an outer transaction that is rolled back after each test."""
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    async with engine.connect() as connection:
        transaction = await connection.begin()
        async with AsyncSession(
            bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
        ) as db:
            yield db
        await transaction.rollback()
    await engine.dispose()


@pytest.fixture
def storage(tmp_path) -> LocalStorage:
    """Uploaded files go to a throwaway directory, never the real media folder."""
    return LocalStorage(tmp_path / "media")


@pytest.fixture
async def client(session: AsyncSession, storage: LocalStorage) -> AsyncIterator[AsyncClient]:
    app = create_app()

    async def _override() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_session] = _override
    app.dependency_overrides[get_media_storage] = lambda: storage
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.fixture
def signup(client: AsyncClient):
    """Register a user and return their Authorization headers."""

    async def _signup(name: str) -> dict[str, str]:
        response = await client.post(
            "/api/auth/register",
            json={"email": f"{name}@example.com", "username": name, "password": "correct-horse-9"},
        )
        assert response.status_code == 201, response.text
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    return _signup
