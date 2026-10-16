import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import Row, delete, exists, false, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.models import (
    Album,
    Artist,
    Friendship,
    FriendshipStatus,
    Genre,
    ListeningHistory,
    ProfileLike,
    Track,
    TrackGenre,
    User,
)
from app.repositories.catalog_repo import escape_like

_TRACK_LOAD = (
    joinedload(Track.album).joinedload(Album.artist),
    selectinload(Track.genres),
)


class SocialRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ------------------------------------------------------------------ users
    async def get_by_username(self, username: str) -> User | None:
        return await self.session.scalar(
            select(User).where(func.lower(User.username) == username.lower())
        )

    def _following(self, viewer_id: uuid.UUID | None):
        """Boolean column: does the viewer follow User (as a correlated EXISTS)?"""
        if viewer_id is None:
            return false()
        return (
            exists()
            .where(
                Friendship.follower_id == viewer_id,
                Friendship.following_id == User.id,
                Friendship.status == FriendshipStatus.ACCEPTED,
            )
            # Correlate only to User; the outer query may also join Friendship itself.
            .correlate(User)
        )

    async def counts(self, user_id: uuid.UUID) -> tuple[int, int, int]:
        """(followers, following, likes) for a user."""
        accepted = Friendship.status == FriendshipStatus.ACCEPTED
        followers = await self.session.scalar(
            select(func.count()).where(Friendship.following_id == user_id, accepted)
        )
        following = await self.session.scalar(
            select(func.count()).where(Friendship.follower_id == user_id, accepted)
        )
        likes = await self.session.scalar(
            select(func.count()).where(ProfileLike.liked_user_id == user_id)
        )
        return followers or 0, following or 0, likes or 0

    async def is_following(self, follower_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        return bool(
            await self.session.scalar(
                select(
                    exists().where(
                        Friendship.follower_id == follower_id,
                        Friendship.following_id == user_id,
                        Friendship.status == FriendshipStatus.ACCEPTED,
                    )
                )
            )
        )

    async def is_liked(self, liker_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        return bool(
            await self.session.scalar(
                select(
                    exists().where(
                        ProfileLike.liker_id == liker_id, ProfileLike.liked_user_id == user_id
                    )
                )
            )
        )

    # ---------------------------------------------------------------- follows
    async def follow(self, follower_id: uuid.UUID, following_id: uuid.UUID) -> None:
        await self.session.execute(
            insert(Friendship)
            .values(
                follower_id=follower_id,
                following_id=following_id,
                status=FriendshipStatus.ACCEPTED,
            )
            .on_conflict_do_nothing(index_elements=["follower_id", "following_id"])
        )

    async def unfollow(self, follower_id: uuid.UUID, following_id: uuid.UUID) -> None:
        await self.session.execute(
            delete(Friendship).where(
                Friendship.follower_id == follower_id, Friendship.following_id == following_id
            )
        )

    async def followers(
        self, user_id: uuid.UUID, viewer_id: uuid.UUID | None, limit: int, offset: int
    ) -> Sequence[Row]:
        stmt = (
            select(User, self._following(viewer_id).label("is_following"))
            .join(Friendship, Friendship.follower_id == User.id)
            .where(
                Friendship.following_id == user_id,
                Friendship.status == FriendshipStatus.ACCEPTED,
            )
            .order_by(Friendship.created_at.desc(), User.username)
            .limit(limit)
            .offset(offset)
        )
        return (await self.session.execute(stmt)).all()

    async def following(
        self, user_id: uuid.UUID, viewer_id: uuid.UUID | None, limit: int, offset: int
    ) -> Sequence[Row]:
        stmt = (
            select(User, self._following(viewer_id).label("is_following"))
            .join(Friendship, Friendship.following_id == User.id)
            .where(
                Friendship.follower_id == user_id,
                Friendship.status == FriendshipStatus.ACCEPTED,
            )
            .order_by(Friendship.created_at.desc(), User.username)
            .limit(limit)
            .offset(offset)
        )
        return (await self.session.execute(stmt)).all()

    # ------------------------------------------------------------------ likes
    async def like(self, liker_id: uuid.UUID, liked_user_id: uuid.UUID) -> None:
        await self.session.execute(
            insert(ProfileLike)
            .values(liker_id=liker_id, liked_user_id=liked_user_id)
            .on_conflict_do_nothing(index_elements=["liker_id", "liked_user_id"])
        )

    async def unlike(self, liker_id: uuid.UUID, liked_user_id: uuid.UUID) -> None:
        await self.session.execute(
            delete(ProfileLike).where(
                ProfileLike.liker_id == liker_id, ProfileLike.liked_user_id == liked_user_id
            )
        )

    # ----------------------------------------------------------------- search
    async def search_users(
        self, query: str, viewer_id: uuid.UUID | None, limit: int
    ) -> Sequence[Row]:
        pattern = f"%{escape_like(query)}%"
        stmt = (
            select(User, self._following(viewer_id).label("is_following"))
            .where(or_(User.username.ilike(pattern, escape="\\"), User.username.op("%")(query)))
            .order_by(func.similarity(User.username, query).desc(), User.username)
            .limit(limit)
        )
        return (await self.session.execute(stmt)).all()

    # ---------------------------------------------------------------- wrapped
    def _plays(self, user_id: uuid.UUID, since: datetime | None):
        conditions = [ListeningHistory.user_id == user_id]
        if since is not None:
            conditions.append(ListeningHistory.played_at >= since)
        return conditions

    async def totals(self, user_id: uuid.UUID, since: datetime | None) -> tuple[int, int]:
        """(play count, total seconds listened)."""
        row = (
            await self.session.execute(
                select(func.count(), func.coalesce(func.sum(Track.duration_sec), 0))
                .select_from(ListeningHistory)
                .join(Track, Track.id == ListeningHistory.track_id)
                .where(*self._plays(user_id, since))
            )
        ).one()
        return row[0], int(row[1])

    async def top_tracks(
        self, user_id: uuid.UUID, since: datetime | None, limit: int
    ) -> list[tuple[Track, int]]:
        plays = func.count().label("plays")
        ranked = (
            await self.session.execute(
                select(ListeningHistory.track_id, plays)
                .join(Track, Track.id == ListeningHistory.track_id)
                .where(*self._plays(user_id, since))
                .group_by(ListeningHistory.track_id, Track.title)
                .order_by(plays.desc(), Track.title, ListeningHistory.track_id)
                .limit(limit)
            )
        ).all()
        if not ranked:
            return []
        tracks = (
            await self.session.scalars(
                select(Track).options(*_TRACK_LOAD).where(Track.id.in_([r[0] for r in ranked]))
            )
        ).unique()
        by_id = {t.id: t for t in tracks}
        return [(by_id[track_id], count) for track_id, count in ranked]

    async def top_artists(
        self, user_id: uuid.UUID, since: datetime | None, limit: int
    ) -> list[tuple[Artist, int]]:
        plays = func.count().label("plays")
        stmt = (
            select(Artist, plays)
            .select_from(ListeningHistory)
            .join(Track, Track.id == ListeningHistory.track_id)
            .join(Album, Album.id == Track.album_id)
            .join(Artist, Artist.id == Album.artist_id)
            .where(*self._plays(user_id, since))
            .group_by(Artist.id)
            .order_by(plays.desc(), Artist.name, Artist.id)
            .limit(limit)
        )
        return [(row[0], row[1]) for row in (await self.session.execute(stmt)).all()]

    async def top_genres(
        self, user_id: uuid.UUID, since: datetime | None, limit: int
    ) -> list[tuple[str, int]]:
        plays = func.count().label("plays")
        stmt = (
            select(Genre.name, plays)
            .select_from(ListeningHistory)
            .join(TrackGenre, TrackGenre.track_id == ListeningHistory.track_id)
            .join(Genre, Genre.id == TrackGenre.genre_id)
            .where(*self._plays(user_id, since))
            .group_by(Genre.name)
            .order_by(plays.desc(), Genre.name)
            .limit(limit)
        )
        return [(row[0], row[1]) for row in (await self.session.execute(stmt)).all()]
