import asyncio
import os

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from alembic import command
from app.models import Base
from tests.conftest import alembic_config, make_url, recreate_database

EXPECTED_TABLES = {
    "users",
    "friendships",
    "artists",
    "albums",
    "tracks",
    "genres",
    "track_genres",
    "playlists",
    "playlist_tracks",
    "favorite_tracks",
    "listening_history",
    "stories",
    "profile_likes",
    "refresh_tokens",
    "studio_pieces",
}


async def _inspect(url: str) -> tuple[set[str], list]:
    engine = create_async_engine(url, poolclass=NullPool)
    try:
        async with engine.connect() as conn:

            def work(sync_conn):
                tables = set(inspect(sync_conn).get_table_names()) - {"alembic_version"}
                ctx = MigrationContext.configure(sync_conn, opts={"compare_type": True})
                return tables, compare_metadata(ctx, Base.metadata)

            return await conn.run_sync(work)
    finally:
        await engine.dispose()


def test_migration_round_trip_matches_models():
    url = (
        make_url(os.environ["DATABASE_URL"])
        .set(database="mushare_migration_test")
        .render_as_string(hide_password=False)
    )
    recreate_database(url)
    cfg = alembic_config(url)

    command.upgrade(cfg, "head")
    tables, diff = asyncio.run(_inspect(url))
    assert tables == EXPECTED_TABLES
    assert diff == [], f"models drifted from migrations: {diff}"

    command.downgrade(cfg, "base")
    tables, _ = asyncio.run(_inspect(url))
    assert tables == set()

    command.upgrade(cfg, "head")
    tables, _ = asyncio.run(_inspect(url))
    assert tables == EXPECTED_TABLES
