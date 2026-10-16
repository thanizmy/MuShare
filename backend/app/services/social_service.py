from datetime import UTC, datetime, timedelta

from sqlalchemy import Row
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, NotFoundError
from app.models import User
from app.repositories.social_repo import SocialRepository
from app.schemas.catalog import ArtistSummary, TrackRead
from app.schemas.social import (
    ProfileUpdate,
    TopArtist,
    TopGenre,
    TopTrack,
    UserProfile,
    UserSummary,
    Wrapped,
    WrappedPeriod,
)

USER_NOT_FOUND = "User not found"
PERIOD_DAYS = {"30d": 30}


def _summary(row: Row) -> UserSummary:
    user: User = row.User
    return UserSummary(
        id=user.id,
        username=user.username,
        avatar_url=user.avatar_url,
        bio=user.bio,
        is_following=bool(row.is_following),
    )


class SocialService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = SocialRepository(session)

    async def _target(self, username: str) -> User:
        user = await self.repo.get_by_username(username)
        if user is None:
            raise NotFoundError(USER_NOT_FOUND)
        return user

    # --------------------------------------------------------------- profiles
    async def _profile(self, user: User, viewer: User | None) -> UserProfile:
        followers, following, likes = await self.repo.counts(user.id)
        signed_in = viewer is not None
        return UserProfile(
            id=user.id,
            username=user.username,
            avatar_url=user.avatar_url,
            bio=user.bio,
            created_at=user.created_at,
            follower_count=followers,
            following_count=following,
            like_count=likes,
            is_me=signed_in and viewer.id == user.id,
            is_following=signed_in and await self.repo.is_following(viewer.id, user.id),
            is_liked=signed_in and await self.repo.is_liked(viewer.id, user.id),
        )

    async def get_profile(self, viewer: User | None, username: str) -> UserProfile:
        return await self._profile(await self._target(username), viewer)

    async def update_me(self, me: User, data: ProfileUpdate) -> UserProfile:
        fields = data.model_dump(exclude_unset=True)
        if "bio" in fields:
            me.bio = fields["bio"]
        if "avatar_url" in fields:
            me.avatar_url = fields["avatar_url"]
        await self.session.commit()
        return await self._profile(me, me)

    # ---------------------------------------------------------------- follows
    async def follow(self, me: User, username: str) -> UserProfile:
        target = await self._target(username)
        if target.id == me.id:
            raise AppError("You can't follow yourself")
        await self.repo.follow(me.id, target.id)
        await self.session.commit()
        return await self._profile(target, me)

    async def unfollow(self, me: User, username: str) -> UserProfile:
        target = await self._target(username)
        await self.repo.unfollow(me.id, target.id)
        await self.session.commit()
        return await self._profile(target, me)

    async def followers(
        self, viewer: User | None, username: str, limit: int, offset: int
    ) -> list[UserSummary]:
        target = await self._target(username)
        rows = await self.repo.followers(target.id, viewer.id if viewer else None, limit, offset)
        return [_summary(r) for r in rows]

    async def following(
        self, viewer: User | None, username: str, limit: int, offset: int
    ) -> list[UserSummary]:
        target = await self._target(username)
        rows = await self.repo.following(target.id, viewer.id if viewer else None, limit, offset)
        return [_summary(r) for r in rows]

    # ------------------------------------------------------------------ likes
    async def like(self, me: User, username: str) -> UserProfile:
        target = await self._target(username)
        if target.id == me.id:
            raise AppError("You can't like your own profile")
        await self.repo.like(me.id, target.id)
        await self.session.commit()
        return await self._profile(target, me)

    async def unlike(self, me: User, username: str) -> UserProfile:
        target = await self._target(username)
        await self.repo.unlike(me.id, target.id)
        await self.session.commit()
        return await self._profile(target, me)

    # ----------------------------------------------------------------- search
    async def search(self, viewer: User | None, query: str, limit: int) -> list[UserSummary]:
        rows = await self.repo.search_users(query, viewer.id if viewer else None, limit)
        return [_summary(r) for r in rows]

    # ----------------------------------------------------------------- wrapped
    async def wrapped(self, username: str, period: WrappedPeriod, limit: int) -> Wrapped:
        user = await self._target(username)
        days = PERIOD_DAYS.get(period)
        since = datetime.now(UTC) - timedelta(days=days) if days else None

        plays, seconds = await self.repo.totals(user.id, since)
        tracks = await self.repo.top_tracks(user.id, since, limit)
        artists = await self.repo.top_artists(user.id, since, limit)
        genres = await self.repo.top_genres(user.id, since, limit)

        return Wrapped(
            username=user.username,
            period=period,
            total_plays=plays,
            total_minutes=round(seconds / 60),
            top_artists=[
                TopArtist(artist=ArtistSummary.model_validate(a), plays=n) for a, n in artists
            ],
            top_tracks=[TopTrack(track=TrackRead.model_validate(t), plays=n) for t, n in tracks],
            top_genres=[TopGenre(genre=g, plays=n) for g, n in genres],
        )
