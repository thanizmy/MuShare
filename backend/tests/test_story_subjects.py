import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import Album, Artist, ListeningHistory, Story, Track, User
from app.seed.seed import seed_catalog
from app.services.story_service import StoryService


@pytest.fixture(autouse=True)
async def catalog(session: AsyncSession) -> None:
    await seed_catalog(session)


async def artist_named(client: AsyncClient, name: str) -> dict:
    return next(a for a in (await client.get("/api/artists")).json() if a["name"] == name)


async def album_titled(client: AsyncClient, title: str) -> dict:
    return next(a for a in (await client.get("/api/albums")).json() if a["title"] == title)


async def share(client: AsyncClient, auth, **body) -> dict:
    response = await client.post("/api/stories", json=body, headers=auth)
    assert response.status_code == 201, response.text
    return response.json()


# ----------------------------------------------------------------------- albums


async def test_share_an_album(client: AsyncClient, signup):
    auth = await signup("author")
    album = await album_titled(client, "Neon Horizons")

    story = await share(client, auth, album_id=album["id"], caption="  this one  ")

    assert story["kind"] == "album"
    assert story["caption"] == "this one"
    assert story["album"]["id"] == album["id"]
    assert story["album"]["title"] == "Neon Horizons"
    assert story["album"]["cover_url"]  # the cover is what gets shown
    assert story["album"]["artist"]["name"] == "Nova Drift"
    assert story["track"] is None
    assert story["artist"] is None


async def test_album_story_plays_the_albums_first_track(client: AsyncClient, signup):
    auth = await signup("author")
    album = await album_titled(client, "Neon Horizons")
    detail = (await client.get(f"/api/albums/{album['id']}")).json()

    story = await share(client, auth, album_id=album["id"])

    assert story["preview_track"]["id"] == detail["tracks"][0]["id"]
    assert story["preview_track"]["title"] == "Afterglow"
    assert story["preview_track"]["audio_url"].startswith("https://")
    assert story["preview_track"]["preview_start_sec"] >= 0


async def test_an_album_with_no_tracks_still_makes_a_story_with_nothing_to_play(
    client: AsyncClient, signup, session: AsyncSession
):
    auth = await signup("author")
    artist = Artist(name="Silent Type")
    session.add(artist)
    await session.flush()
    empty = Album(title="Untitled", artist_id=artist.id)
    session.add(empty)
    await session.flush()

    story = await share(client, auth, album_id=str(empty.id))

    assert story["kind"] == "album"
    assert story["preview_track"] is None


# ---------------------------------------------------------------------- artists


async def test_share_an_artist(client: AsyncClient, signup):
    auth = await signup("author")
    artist = await artist_named(client, "Kestrel Run")

    story = await share(client, auth, artist_id=artist["id"], background_color="#ff7a59,#7b2cbf")

    assert story["kind"] == "artist"
    assert story["artist"] == {
        "id": artist["id"],
        "name": "Kestrel Run",
        "image_url": artist["image_url"],
    }
    assert story["background_color"] == "#FF7A59,#7B2CBF"
    assert story["track"] is None
    assert story["album"] is None


async def test_artist_story_plays_their_most_played_track(
    client: AsyncClient, signup, session: AsyncSession
):
    auth = await signup("author")
    artist = await artist_named(client, "Nova Drift")
    tracks = (await client.get(f"/api/artists/{artist['id']}")).json()["top_tracks"]
    favourite = tracks[-1]  # alphabetically last, so only plays can make it win

    await signup("listener")
    listener_id = await session.scalar(select(User.id).where(User.username == "listener"))
    for _ in range(3):
        session.add(ListeningHistory(user_id=listener_id, track_id=uuid.UUID(favourite["id"])))
    await session.flush()

    story = await share(client, auth, artist_id=artist["id"])

    assert story["preview_track"]["id"] == favourite["id"]


async def test_artist_story_preview_falls_back_to_title_order_without_plays(
    client: AsyncClient, signup
):
    auth = await signup("author")
    artist = await artist_named(client, "Nova Drift")
    tracks = (await client.get(f"/api/artists/{artist['id']}")).json()["top_tracks"]

    story = await share(client, auth, artist_id=artist["id"])

    assert story["preview_track"]["id"] == tracks[0]["id"]  # unplayed ties sort by title


# ------------------------------------------------------------------- validation


async def test_exactly_one_subject_is_required(client: AsyncClient, signup):
    auth = await signup("author")
    track = (await client.get("/api/tracks", params={"limit": 1})).json()[0]
    album = await album_titled(client, "Neon Horizons")
    artist = await artist_named(client, "Nova Drift")

    bad_bodies = [
        {},
        {"caption": "nothing attached"},
        {"track_id": track["id"], "album_id": album["id"]},
        {"album_id": album["id"], "artist_id": artist["id"]},
        {"track_id": track["id"], "album_id": album["id"], "artist_id": artist["id"]},
    ]
    for body in bad_bodies:
        response = await client.post("/api/stories", json=body, headers=auth)
        assert response.status_code == 422, body
        assert "exactly one" in response.text.lower()


async def test_unknown_subjects_are_404(client: AsyncClient, signup):
    auth = await signup("author")
    for key, message in (
        ("track_id", "Track not found"),
        ("album_id", "Album not found"),
        ("artist_id", "Artist not found"),
    ):
        response = await client.post("/api/stories", json={key: str(uuid.uuid4())}, headers=auth)
        assert response.status_code == 404
        assert response.json() == {"detail": message}


async def test_malformed_ids_are_rejected(client: AsyncClient, signup):
    auth = await signup("author")
    for key in ("album_id", "artist_id"):
        response = await client.post("/api/stories", json={key: "not-a-uuid"}, headers=auth)
        assert response.status_code == 422


# ---------------------------------------------------- shared behaviour, new kinds


async def test_album_and_artist_stories_follow_the_same_visibility_rules(
    client: AsyncClient, signup
):
    author, follower, stranger = await signup("author"), await signup("follower"), await signup("stranger")
    await client.put("/api/users/author/follow", headers=follower)
    album = await album_titled(client, "Neon Horizons")
    artist = await artist_named(client, "Kestrel Run")
    await share(client, author, album_id=album["id"])
    await share(client, author, artist_id=artist["id"])

    seen = (await client.get("/api/users/author/stories", headers=follower)).json()
    assert [s["kind"] for s in seen] == ["album", "artist"]
    assert (await client.get("/api/users/author/stories", headers=stranger)).json() == []
    assert (await client.get("/api/users/author/stories")).json() == []


async def test_feed_mixes_all_three_kinds_in_order_with_previews(client: AsyncClient, signup, session):
    me, friend = await signup("viewer"), await signup("friend_acct")
    await client.put("/api/users/friend_acct/follow", headers=me)
    track = (await client.get("/api/tracks", params={"limit": 1})).json()[0]
    album = await album_titled(client, "Soft Static")
    artist = await artist_named(client, "Orion Park")

    first = await share(client, friend, track_id=track["id"])
    second = await share(client, friend, album_id=album["id"])
    third = await share(client, friend, artist_id=artist["id"])
    for offset, story in zip((3, 2, 1), (first, second, third), strict=True):
        row = await session.get(Story, uuid.UUID(story["id"]))
        await session.execute(
            text("UPDATE stories SET created_at = :c, expires_at = :e WHERE id = :id"),
            {
                "c": row.created_at - timedelta(hours=offset),
                "e": row.expires_at - timedelta(hours=offset),
                "id": row.id,
            },
        )
    session.expire_all()

    feed = (await client.get("/api/stories/feed", headers=me)).json()

    stories = feed[0]["stories"]
    assert [s["kind"] for s in stories] == ["track", "album", "artist"]
    assert all(s["preview_track"] for s in stories)
    assert stories[0]["preview_track"]["id"] == track["id"]
    assert stories[1]["preview_track"]["album"]["id"] == album["id"]
    assert stories[2]["preview_track"]["album"]["artist"]["id"] == artist["id"]


async def test_new_story_kinds_expire_and_purge_like_tracks(client: AsyncClient, signup, session):
    auth = await signup("author")
    album = await album_titled(client, "Neon Horizons")
    artist = await artist_named(client, "Nova Drift")
    stale_album = await share(client, auth, album_id=album["id"])
    stale_artist = await share(client, auth, artist_id=artist["id"])
    fresh = await share(client, auth, artist_id=artist["id"])
    for story in (stale_album, stale_artist):
        row = await session.get(Story, uuid.UUID(story["id"]))
        await session.execute(
            text("UPDATE stories SET created_at = :c, expires_at = :e WHERE id = :id"),
            {
                "c": row.created_at - timedelta(hours=30),
                "e": row.expires_at - timedelta(hours=30),
                "id": row.id,
            },
        )
    session.expire_all()

    listed = (await client.get("/api/users/author/stories", headers=auth)).json()
    assert [s["id"] for s in listed] == [fresh["id"]]  # hidden the moment they expire

    assert await StoryService(session, get_settings()).purge_expired() == 2
    assert (await session.scalars(select(Story.id))).all() == [uuid.UUID(fresh["id"])]


async def test_author_can_delete_an_album_story(client: AsyncClient, signup):
    auth = await signup("author")
    album = await album_titled(client, "Neon Horizons")
    story = await share(client, auth, album_id=album["id"])

    assert (await client.delete(f"/api/stories/{story['id']}", headers=auth)).status_code == 204
    assert (await client.get("/api/users/author/stories", headers=auth)).json() == []


# ---------------------------------------------------------------- database rules


async def test_stories_vanish_when_their_album_or_artist_is_deleted(
    client: AsyncClient, signup, session: AsyncSession
):
    auth = await signup("author")
    album = await album_titled(client, "Neon Horizons")
    artist = await artist_named(client, "Kestrel Run")
    await share(client, auth, album_id=album["id"])
    await share(client, auth, artist_id=artist["id"])

    await session.execute(delete(Album).where(Album.id == uuid.UUID(album["id"])))
    assert [s["kind"] for s in (await client.get("/api/users/author/stories", headers=auth)).json()] == ["artist"]

    await session.execute(delete(Artist).where(Artist.id == uuid.UUID(artist["id"])))
    assert (await client.get("/api/users/author/stories", headers=auth)).json() == []


async def test_the_database_itself_refuses_stories_with_zero_or_many_subjects(
    client: AsyncClient, signup, session: AsyncSession
):
    await signup("author")
    user_id = await session.scalar(select(User.id).where(User.username == "author"))
    track = await session.scalar(select(Track).limit(1))
    now = datetime.now(UTC)

    for subjects in ({}, {"track_id": track.id, "album_id": track.album_id}):
        async with session.begin_nested():
            session.add(
                Story(user_id=user_id, created_at=now, expires_at=now + timedelta(hours=1), **subjects)
            )
            with pytest.raises(IntegrityError):
                await session.flush()
            await session.rollback()
