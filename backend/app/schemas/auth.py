import re
from typing import Annotated, Literal

from pydantic import BaseModel, EmailStr, Field, StringConstraints, field_validator

from app.schemas.user import UserRead

USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_]{3,30}$")

Email = Annotated[EmailStr, StringConstraints(max_length=320)]


class RegisterRequest(BaseModel):
    email: Email
    username: str
    password: str = Field(min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def _valid_username(cls, value: str) -> str:
        if not USERNAME_PATTERN.fullmatch(value):
            raise ValueError("Username must be 3-30 characters: letters, numbers, underscores")
        return value

    @field_validator("password")
    @classmethod
    def _strong_enough(cls, value: str) -> str:
        if not (re.search(r"[A-Za-z]", value) and re.search(r"\d", value)):
            raise ValueError("Password must contain at least one letter and one number")
        return value


class LoginRequest(BaseModel):
    email: Email
    password: str = Field(min_length=1, max_length=128)


class AuthResponse(BaseModel):
    user: UserRead
    access_token: str
    token_type: Literal["bearer"] = "bearer"
