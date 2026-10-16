from collections.abc import AsyncIterator

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.exceptions import AuthenticationError
from app.core.security import InvalidTokenError, decode_access_token
from app.core.storage import Storage, get_storage
from app.models import User
from app.repositories.user_repo import UserRepository
from app.services.auth_service import AuthService
from app.services.catalog_service import CatalogService
from app.services.library_service import LibraryService
from app.services.playlist_service import PlaylistService
from app.services.social_service import SocialService
from app.services.story_service import StoryService
from app.services.studio_service import StudioService

_bearer = HTTPBearer(auto_error=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    """Route-level DB session dependency (tests override this one)."""
    async for session in get_db():
        yield session


def get_auth_service(
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> AuthService:
    return AuthService(session, settings)


def get_catalog_service(session: AsyncSession = Depends(get_session)) -> CatalogService:
    return CatalogService(session)


def get_library_service(session: AsyncSession = Depends(get_session)) -> LibraryService:
    return LibraryService(session)


def get_playlist_service(session: AsyncSession = Depends(get_session)) -> PlaylistService:
    return PlaylistService(session)


def get_social_service(session: AsyncSession = Depends(get_session)) -> SocialService:
    return SocialService(session)


def get_story_service(
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> StoryService:
    return StoryService(session, settings)


def get_media_storage() -> Storage:
    """The file store. A dependency so tests can swap in a temporary directory."""
    return get_storage()


def get_studio_service(
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    storage: Storage = Depends(get_media_storage),
) -> StudioService:
    return StudioService(session, settings, storage)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> User:
    if credentials is None:
        raise AuthenticationError("Not authenticated")
    try:
        user_id = decode_access_token(credentials.credentials, settings)
    except InvalidTokenError as exc:
        raise AuthenticationError("Invalid or expired token") from exc
    user = await UserRepository(session).get(user_id)
    if user is None:
        raise AuthenticationError("Invalid or expired token")
    return user


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> User | None:
    """For public endpoints that personalise when a valid token is present."""
    if credentials is None:
        return None
    try:
        return await get_current_user(credentials, session, settings)
    except AuthenticationError:
        return None
