from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import (
    get_current_user,
    get_optional_user,
    get_social_service,
    get_story_service,
)
from app.models import User
from app.schemas.social import ProfileUpdate, UserProfile, UserSummary, Wrapped, WrappedPeriod
from app.schemas.stories import StoryRead
from app.services.social_service import SocialService
from app.services.story_service import StoryService

router = APIRouter(prefix="/users", tags=["users"])

Limit = Annotated[int, Query(ge=1, le=50)]
Offset = Annotated[int, Query(ge=0, le=10_000)]


# Fixed paths first, so "search" and "me" are never read as usernames.
@router.get("/search", response_model=list[UserSummary])
async def search_users(
    q: Annotated[str, Query(min_length=1, max_length=50)],
    limit: Annotated[int, Query(ge=1, le=20)] = 8,
    viewer: User | None = Depends(get_optional_user),
    service: SocialService = Depends(get_social_service),
):
    query = " ".join(q.split())
    return await service.search(viewer, query, limit) if query else []


@router.patch("/me", response_model=UserProfile)
async def update_me(
    data: ProfileUpdate,
    me: User = Depends(get_current_user),
    service: SocialService = Depends(get_social_service),
):
    return await service.update_me(me, data)


@router.get("/{username}", response_model=UserProfile)
async def get_profile(
    username: str,
    viewer: User | None = Depends(get_optional_user),
    service: SocialService = Depends(get_social_service),
):
    return await service.get_profile(viewer, username)


@router.get("/{username}/wrapped", response_model=Wrapped)
async def get_wrapped(
    username: str,
    period: WrappedPeriod = "all",
    limit: Annotated[int, Query(ge=1, le=10)] = 5,
    service: SocialService = Depends(get_social_service),
):
    """Anyone can see a user's top artists, songs and genres."""
    return await service.wrapped(username, period, limit)


@router.get("/{username}/followers", response_model=list[UserSummary])
async def list_followers(
    username: str,
    limit: Limit = 20,
    offset: Offset = 0,
    viewer: User | None = Depends(get_optional_user),
    service: SocialService = Depends(get_social_service),
):
    return await service.followers(viewer, username, limit, offset)


@router.get("/{username}/following", response_model=list[UserSummary])
async def list_following(
    username: str,
    limit: Limit = 20,
    offset: Offset = 0,
    viewer: User | None = Depends(get_optional_user),
    service: SocialService = Depends(get_social_service),
):
    return await service.following(viewer, username, limit, offset)


@router.put("/{username}/follow", response_model=UserProfile)
async def follow(
    username: str,
    me: User = Depends(get_current_user),
    service: SocialService = Depends(get_social_service),
):
    return await service.follow(me, username)


@router.delete("/{username}/follow", response_model=UserProfile)
async def unfollow(
    username: str,
    me: User = Depends(get_current_user),
    service: SocialService = Depends(get_social_service),
):
    return await service.unfollow(me, username)


@router.put("/{username}/like", response_model=UserProfile)
async def like(
    username: str,
    me: User = Depends(get_current_user),
    service: SocialService = Depends(get_social_service),
):
    return await service.like(me, username)


@router.delete("/{username}/like", response_model=UserProfile)
async def unlike(
    username: str,
    me: User = Depends(get_current_user),
    service: SocialService = Depends(get_social_service),
):
    return await service.unlike(me, username)


@router.get("/{username}/stories", response_model=list[StoryRead])
async def user_stories(
    username: str,
    viewer: User | None = Depends(get_optional_user),
    service: StoryService = Depends(get_story_service),
):
    """Active stories, oldest first. Only the author and their followers get any."""
    return await service.for_user(viewer, username)
