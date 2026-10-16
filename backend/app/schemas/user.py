import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserRead(BaseModel):
    """The signed-in user's own account. Public profile views get their own schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    username: str
    avatar_url: str | None
    bio: str | None
    created_at: datetime
