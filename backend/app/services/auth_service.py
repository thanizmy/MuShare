from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.exceptions import AuthenticationError, ConflictError
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    password_needs_rehash,
    verify_password,
)
from app.models import User
from app.repositories.user_repo import RefreshTokenRepository, UserRepository
from app.schemas.auth import LoginRequest, RegisterRequest

# Two tabs refreshing at once can present the same token a moment apart. A revoked token
# seen inside this window is rejected without treating it as theft.
REUSE_GRACE = timedelta(seconds=10)

INVALID_CREDENTIALS = "Incorrect email or password"
INVALID_REFRESH = "Session expired. Please sign in again."


@dataclass(frozen=True)
class AuthSession:
    user: User
    access_token: str
    refresh_token: str


class AuthService:
    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self.session = session
        self.settings = settings
        self.users = UserRepository(session)
        self.tokens = RefreshTokenRepository(session)

    async def register(self, data: RegisterRequest) -> AuthSession:
        email = data.email.lower()
        email_taken, username_taken = await self.users.find_conflicts(email, data.username)
        if email_taken:
            raise ConflictError("An account with this email already exists")
        if username_taken:
            raise ConflictError("That username is taken")

        user = User(
            email=email, username=data.username, password_hash=hash_password(data.password)
        )
        try:
            await self.users.add(user)
        except IntegrityError as exc:  # lost a race with a concurrent registration
            await self.session.rollback()
            raise ConflictError("An account with this email or username already exists") from exc
        return await self._start_session(user)

    async def login(self, data: LoginRequest) -> AuthSession:
        user = await self.users.get_by_email(data.email.lower())
        if not verify_password(user.password_hash if user else None, data.password):
            raise AuthenticationError(INVALID_CREDENTIALS)
        assert user is not None
        if password_needs_rehash(user.password_hash):
            user.password_hash = hash_password(data.password)
        return await self._start_session(user)

    async def refresh(self, raw_token: str) -> AuthSession:
        """Rotate: the presented token is revoked and a fresh one issued."""
        now = datetime.now(UTC)
        stored = await self.tokens.get_by_hash(hash_refresh_token(raw_token))
        if stored is None:
            raise AuthenticationError(INVALID_REFRESH)

        if stored.revoked_at is not None:
            if now - stored.revoked_at > REUSE_GRACE:
                # An old token resurfaced: assume it leaked and end every session.
                await self.tokens.revoke_all_for_user(stored.user_id, now)
                await self.session.commit()
            raise AuthenticationError(INVALID_REFRESH)

        if stored.expires_at <= now:
            raise AuthenticationError(INVALID_REFRESH)

        user = await self.users.get(stored.user_id)
        if user is None:
            raise AuthenticationError(INVALID_REFRESH)

        stored.revoked_at = now
        return await self._start_session(user)

    async def logout(self, raw_token: str | None) -> None:
        if not raw_token:
            return
        stored = await self.tokens.get_by_hash(hash_refresh_token(raw_token))
        if stored is not None and stored.revoked_at is None:
            stored.revoked_at = datetime.now(UTC)
            await self.session.commit()

    async def _start_session(self, user: User) -> AuthSession:
        raw, digest = generate_refresh_token()
        expires_at = datetime.now(UTC) + timedelta(days=self.settings.refresh_token_expire_days)
        await self.tokens.add(user.id, digest, expires_at)
        await self.session.commit()
        await self.session.refresh(user)
        return AuthSession(
            user=user,
            access_token=create_access_token(user.id, self.settings),
            refresh_token=raw,
        )
