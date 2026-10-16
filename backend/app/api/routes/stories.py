import uuid

from fastapi import APIRouter, Depends, Response, status

from app.api.deps import get_current_user, get_story_service
from app.models import User
from app.schemas.stories import StoryCreate, StoryGroup, StoryRead
from app.services.story_service import StoryService

router = APIRouter(prefix="/stories", tags=["stories"])


@router.get("/feed", response_model=list[StoryGroup])
async def story_feed(
    user: User = Depends(get_current_user),
    service: StoryService = Depends(get_story_service),
):
    """Active stories from you and the people you follow, grouped by person."""
    return await service.feed(user)


@router.post("", response_model=StoryRead, status_code=status.HTTP_201_CREATED)
async def create_story(
    data: StoryCreate,
    user: User = Depends(get_current_user),
    service: StoryService = Depends(get_story_service),
):
    return await service.create(user, data)


@router.delete("/{story_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_story(
    story_id: uuid.UUID,
    user: User = Depends(get_current_user),
    service: StoryService = Depends(get_story_service),
):
    await service.delete(user, story_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
