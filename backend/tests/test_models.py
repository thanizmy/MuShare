import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Album,
    Artist,
    FavoriteTrack,
    Friendship,
    FriendshipStatus,
    Playlist,
    PlaylistTrack,
    ProfileLike,
    Story,
    Track,
    User,
)


def make_user(name: str) -> User:
    return User(email=f"{name}@example.com", username=name, password_hash="x" * 60)


async def make_track(session: AsyncSession, title: str = "Song") -> Track:
    artist = Artist(name="Artist")
    session.add(artist)
    await session.flush()
    album = Album(title="Album", artist_id=artist.id)
    session.add(album)
    await session.flush()
    track = Track(title=title, album_id=album.id, duration_sec=200, audio_url="https://a/b.mp3")
    session.add(track)
    await session.flush()
    return track


async def test_user_defaults_and_unique_email(session: AsyncSession):
    user = make_user("alice")
    session.add(user)
    await session.flush()
    await session.refresh(user)
    assert isinstance(user.id, uuid.UUID)
    assert user.created_at is not None

    duplicate = User(email="alice@example.com", username="other", password_hash="x" * 60)
    session.add(duplicate)
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_username_unique(session: AsyncSession):
    session.add(make_user("bob"))
    await session.flush()
    session.add(User(email="b2@example.com", username="bob", password_hash="x" * 60))
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_follow_defaults_to_accepted_and_blocks_self_follow(session: AsyncSession):
    a, b = make_user("a"), make_user("b")
    session.add_all([a, b])
    await session.flush()

    edge = Friendship(follower_id=a.id, following_id=b.id)
    session.add(edge)
    await session.flush()
    await session.refresh(edge)
    assert edge.status is FriendshipStatus.ACCEPTED

    session.add(Friendship(follower_id=a.id, following_id=a.id))
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_follow_edge_is_unique(session: AsyncSession):
    a, b = make_user("fa"), make_user("fb")
    session.add_all([a, b])
    await session.flush()
    session.add(Friendship(follower_id=a.id, following_id=b.id))
    await session.flush()
    session.add(Friendship(follower_id=a.id, following_id=b.id))
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_profile_like_blocks_self_like(session: AsyncSession):
    user = make_user("narcissus")
    session.add(user)
    await session.flush()
    session.add(ProfileLike(liker_id=user.id, liked_user_id=user.id))
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_favorite_is_unique_per_user_and_track(session: AsyncSession):
    user = make_user("fav")
    session.add(user)
    track = await make_track(session)
    session.add(FavoriteTrack(user_id=user.id, track_id=track.id))
    await session.flush()
    session.add(FavoriteTrack(user_id=user.id, track_id=track.id))
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_track_constraints(session: AsyncSession):
    track = await make_track(session)
    bad_duration = Track(
        title="Zero", album_id=track.album_id, duration_sec=0, audio_url="https://a/z.mp3"
    )
    session.add(bad_duration)
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_track_preview_start_must_fall_inside_track(session: AsyncSession):
    track = await make_track(session)
    session.add(
        Track(
            title="Late",
            album_id=track.album_id,
            duration_sec=100,
            preview_start_sec=100,
            audio_url="https://a/l.mp3",
        )
    )
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_playlist_positions_unique_but_swappable_in_one_transaction(session: AsyncSession):
    user = make_user("dj")
    session.add(user)
    t1, t2 = await make_track(session, "One"), await make_track(session, "Two")
    playlist = Playlist(user_id=user.id, title="Mix")
    session.add(playlist)
    await session.flush()
    first = PlaylistTrack(playlist_id=playlist.id, track_id=t1.id, position=0)
    second = PlaylistTrack(playlist_id=playlist.id, track_id=t2.id, position=1)
    session.add_all([first, second])
    await session.flush()

    # Deferred constraint: swapping positions is legal as long as the end state is unique.
    await session.execute(text("SET CONSTRAINTS ALL DEFERRED"))
    first.position, second.position = 1, 0
    await session.flush()
    await session.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))

    # A genuine duplicate position is still rejected once constraints are immediate.
    second.position = 1
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_story_must_expire_after_creation(session: AsyncSession):
    user = make_user("story")
    session.add(user)
    track = await make_track(session)
    now = datetime.now(UTC)
    session.add(
        Story(
            user_id=user.id,
            track_id=track.id,
            created_at=now,
            expires_at=now - timedelta(hours=1),
        )
    )
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_deleting_user_cascades_to_owned_rows(session: AsyncSession):
    user = make_user("leaver")
    session.add(user)
    track = await make_track(session)
    await session.flush()
    session.add(FavoriteTrack(user_id=user.id, track_id=track.id))
    session.add(Playlist(user_id=user.id, title="Mine"))
    session.add(
        Story(
            user_id=user.id,
            track_id=track.id,
            expires_at=datetime.now(UTC) + timedelta(hours=24),
        )
    )
    await session.flush()

    await session.execute(text("DELETE FROM users WHERE id = :id"), {"id": user.id})

    for table in (FavoriteTrack, Playlist, Story):
        count = await session.scalar(select(func.count()).select_from(table))
        assert count == 0
