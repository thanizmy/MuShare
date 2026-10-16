import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, catalog, health, library, media, playlists, stories, studio, users
from app.core.config import get_settings
from app.core.database import dispose_engine, get_session_factory
from app.core.exceptions import register_exception_handlers
from app.services.story_service import StoryService

logger = logging.getLogger("mushare")


async def _purge_expired_stories() -> None:
    settings = get_settings()
    async with get_session_factory()() as session:
        removed = await StoryService(session, settings).purge_expired()
    if removed:
        logger.info("Purged %d expired stories", removed)


async def _purge_loop(interval: int) -> None:
    """Expired stories are already hidden by every query; this just reclaims the rows."""
    while True:
        try:
            await _purge_expired_stories()
        except Exception:  # never let housekeeping take the API down
            logger.exception("Story purge failed")
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    purge = asyncio.create_task(_purge_loop(get_settings().story_purge_interval_seconds))
    yield
    purge.cancel()
    with suppress(asyncio.CancelledError):
        await purge
    await dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="MuShare API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None if settings.is_production else "/docs",
        openapi_url=None if settings.is_production else "/openapi.json",
        redoc_url=None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_exception_handlers(app)
    app.include_router(health.router, prefix="/api")
    app.include_router(auth.router, prefix="/api")
    app.include_router(catalog.router, prefix="/api")
    app.include_router(library.router, prefix="/api")
    app.include_router(playlists.router, prefix="/api")
    app.include_router(users.router, prefix="/api")
    app.include_router(stories.router, prefix="/api")
    app.include_router(studio.router, prefix="/api")
    app.include_router(media.router, prefix="/api")
    return app


app = create_app()
