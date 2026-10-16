import uuid
from datetime import datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import Story
from app.seed.seed import seed_catalog
from app.services.story_service import StoryService


@pytest.fixture(autouse=True)
async def catalog(session: AsyncSession) -> None:
    await seed_catalog(session)


async def track_ids(client: AsyncClient, n: int = 3) -> list[str]:
    tracks = (await client.get("/api/tracks", params={"sort": "title", "limit": n})).json()
    return [t["id"] for t in tracks]


async def post_story(client: AsyncClient, auth, track_id: str, **extra) -> dict:
    response = await client.post(
        "/api/stories", json={"track_id": track_id, **extra}, headers=auth
    )
    assert response.status_code == 201, response.text
    return response.json()


async def age(session: AsyncSession, story_id: str, hours: float) -> None:
    """Shift a story into the past (keeping expires_at after created_at, as the DB requires)."""
    delta = timedelta(hours=hours)
    row = await session.get(Story, uuid.UUID(story_id))
    await session.execute(
        update(Story)
        .where(Story.id == row.id)
        .values(created_at=row.created_at - delta, expires_at=row.expires_at - delta)
    )
    session.expire_all()


# ---------------------------------------------------------------------- create


async def test_create_story_returns_track_author_and_24h_expiry(client: AsyncClient, signup):
    auth = await signup("author")
    tid = (await track_ids(client, 1))[0]

    story = await post_story(
        client, auth, tid, caption="  on repeat  ", background_color="#ff00aa,#220044"
    )

    assert story["caption"] == "on repeat"
    assert story["background_color"] == "#FF00AA,#220044"  # normalised
    assert story["track"]["id"] == tid
    assert story["track"]["audio_url"].startswith("https://")
    assert story["track"]["album"]["artist"]["name"]
    assert story["user"]["username"] == "author"
    created = datetime.fromisoformat(story["created_at"])
    expires = datetime.fromisoformat(story["expires_at"])
    assert expires - created == timedelta(hours=get_settings().story_ttl_hours)


async def test_caption_is_optional_and_background_has_a_default(client: AsyncClient, signup):
    auth = await signup("author")
    story = await post_story(client, auth, (await track_ids(client, 1))[0])
    assert story["caption"] is None
    assert story["background_color"] == "#1DB954,#0B3D2E"
    blank = await post_story(client, auth, (await track_ids(client, 1))[0], caption="   ")
    assert blank["caption"] is None


async def test_create_validates_input(client: AsyncClient, signup):
    auth = await signup("author")
    tid = (await track_ids(client, 1))[0]
    bad_bodies = [
        {"track_id": tid, "caption": "x" * 281},
        {"track_id": tid, "background_color": "red"},
        {"track_id": tid, "background_color": "#12345,#123456"},
        {"track_id": tid, "background_color": "#1DB954"},
        {"track_id": tid, "background_color": "url(javascript:alert(1)),#000000"},
        {"track_id": "not-a-uuid"},
        {},
    ]
    for body in bad_bodies:
        response = await client.post("/api/stories", json=body, headers=auth)
        assert response.status_code == 422, body


async def test_create_requires_auth_and_an_existing_track(client: AsyncClient, signup):
    tid = (await track_ids(client, 1))[0]
    assert (await client.post("/api/stories", json={"track_id": tid})).status_code == 401
    auth = await signup("author")
    missing = await client.post("/api/stories", json={"track_id": str(uuid.uuid4())}, headers=auth)
    assert missing.status_code == 404


async def test_active_story_limit(client: AsyncClient, signup, monkeypatch):
    from app.services import story_service

    monkeypatch.setattr(story_service, "MAX_ACTIVE_STORIES", 2)
    auth = await signup("prolific")
    tid = (await track_ids(client, 1))[0]
    await post_story(client, auth, tid)
    await post_story(client, auth, tid)
    response = await client.post("/api/stories", json={"track_id": tid}, headers=auth)
    assert response.status_code == 409


async def test_expired_stories_do_not_count_towards_the_limit(
    client: AsyncClient, signup, session: AsyncSession, monkeypatch
):
    from app.services import story_service

    monkeypatch.setattr(story_service, "MAX_ACTIVE_STORIES", 1)
    auth = await signup("prolific")
    tid = (await track_ids(client, 1))[0]
    old = await post_story(client, auth, tid)
    await age(session, old["id"], 25)
    await post_story(client, auth, tid)  # allowed: the first one has expired


# ------------------------------------------------------------------ visibility


async def test_author_sees_their_own_stories(client: AsyncClient, signup):
    auth = await signup("author")
    tid = (await track_ids(client, 1))[0]
    story = await post_story(client, auth, tid)

    own = (await client.get("/api/users/author/stories", headers=auth)).json()
    assert [s["id"] for s in own] == [story["id"]]


async def test_followers_see_stories_but_strangers_do_not(client: AsyncClient, signup):
    author, follower, stranger = await signup("author"), await signup("follower"), await signup("stranger")
    await client.put("/api/users/author/follow", headers=follower)
    tid = (await track_ids(client, 1))[0]
    story = await post_story(client, author, tid)

    seen = (await client.get("/api/users/author/stories", headers=follower)).json()
    assert [s["id"] for s in seen] == [story["id"]]
    assert (await client.get("/api/users/author/stories", headers=stranger)).json() == []
    assert (await client.get("/api/users/author/stories")).json() == []  # anonymous


async def test_following_is_one_way_for_stories(client: AsyncClient, signup):
    author, fan = await signup("author"), await signup("fan_acct")
    await client.put("/api/users/author/follow", headers=fan)
    tid = (await track_ids(client, 1))[0]
    await post_story(client, fan, tid)

    # The author doesn't follow the fan back, so cannot see the fan's story.
    assert (await client.get("/api/users/fan_acct/stories", headers=author)).json() == []


async def test_unfollowing_removes_access(client: AsyncClient, signup):
    author, follower = await signup("author"), await signup("follower")
    await client.put("/api/users/author/follow", headers=follower)
    await post_story(client, author, (await track_ids(client, 1))[0])
    assert len((await client.get("/api/users/author/stories", headers=follower)).json()) == 1

    await client.delete("/api/users/author/follow", headers=follower)
    assert (await client.get("/api/users/author/stories", headers=follower)).json() == []


async def test_stories_of_unknown_user_is_404(client: AsyncClient, signup):
    auth = await signup("someone")
    assert (await client.get("/api/users/ghost/stories", headers=auth)).status_code == 404


async def test_expired_stories_are_hidden_everywhere(client: AsyncClient, signup, session):
    author, follower = await signup("author"), await signup("follower")
    await client.put("/api/users/author/follow", headers=follower)
    tid = (await track_ids(client, 1))[0]
    fresh = await post_story(client, author, tid)
    stale = await post_story(client, author, tid)
    await age(session, stale["id"], 24.5)

    for viewer in (author, follower):
        listed = (await client.get("/api/users/author/stories", headers=viewer)).json()
        assert [s["id"] for s in listed] == [fresh["id"]]
        feed = (await client.get("/api/stories/feed", headers=viewer)).json()
        assert [s["id"] for g in feed for s in g["stories"]] == [fresh["id"]]


async def test_stories_are_listed_oldest_first(client: AsyncClient, signup, session):
    auth = await signup("author")
    a, b, c = await track_ids(client, 3)
    first = await post_story(client, auth, a)
    second = await post_story(client, auth, b)
    third = await post_story(client, auth, c)
    await age(session, first["id"], 3)
    await age(session, second["id"], 2)
    await age(session, third["id"], 1)

    listed = (await client.get("/api/users/author/stories", headers=auth)).json()
    assert [s["track"]["id"] for s in listed] == [a, b, c]


# ------------------------------------------------------------------------ feed


async def test_feed_requires_auth(client: AsyncClient):
    assert (await client.get("/api/stories/feed")).status_code == 401


async def test_feed_groups_by_person_with_me_first_then_most_recent(
    client: AsyncClient, signup, session
):
    me = await signup("viewer")
    bob, cara, dan = await signup("bobby"), await signup("carol"), await signup("danny")
    for name in ("bobby", "carol"):
        await client.put(f"/api/users/{name}/follow", headers=me)
    a, b, c = await track_ids(client, 3)

    bob_old = await post_story(client, bob, a)
    cara_story = await post_story(client, cara, b)
    bob_new = await post_story(client, bob, c)
    mine = await post_story(client, me, a)
    await post_story(client, dan, a)  # not followed: must not appear
    await age(session, bob_old["id"], 5)
    await age(session, cara_story["id"], 3)
    await age(session, bob_new["id"], 1)
    await age(session, mine["id"], 10)  # oldest of all, yet still listed first

    feed = (await client.get("/api/stories/feed", headers=me)).json()

    assert [g["user"]["username"] for g in feed] == ["viewer", "bobby", "carol"]
    bob_group = feed[1]
    assert [s["id"] for s in bob_group["stories"]] == [bob_old["id"], bob_new["id"]]
    assert bob_group["stories"][0]["track"]["album"]["artist"]["name"]


async def test_feed_is_empty_when_there_is_nothing(client: AsyncClient, signup):
    auth = await signup("lonely")
    assert (await client.get("/api/stories/feed", headers=auth)).json() == []


async def test_feed_excludes_people_you_do_not_follow(client: AsyncClient, signup):
    me, other = await signup("viewer"), await signup("other_one")
    await post_story(client, other, (await track_ids(client, 1))[0])
    assert (await client.get("/api/stories/feed", headers=me)).json() == []


# ---------------------------------------------------------------------- delete


async def test_author_can_delete_a_story(client: AsyncClient, signup):
    auth = await signup("author")
    story = await post_story(client, auth, (await track_ids(client, 1))[0])

    assert (await client.delete(f"/api/stories/{story['id']}", headers=auth)).status_code == 204
    assert (await client.get("/api/users/author/stories", headers=auth)).json() == []
    assert (await client.delete(f"/api/stories/{story['id']}", headers=auth)).status_code == 404


async def test_others_cannot_delete_a_story(client: AsyncClient, signup):
    author, follower = await signup("author"), await signup("follower")
    await client.put("/api/users/author/follow", headers=follower)
    story = await post_story(client, author, (await track_ids(client, 1))[0])

    response = await client.delete(f"/api/stories/{story['id']}", headers=follower)
    assert response.status_code == 404
    assert len((await client.get("/api/users/author/stories", headers=author)).json()) == 1
    assert (await client.delete(f"/api/stories/{story['id']}")).status_code == 401


async def test_deleting_the_track_owner_cascade_is_not_needed_for_story_delete(
    client: AsyncClient, signup
):
    auth = await signup("author")
    assert (await client.delete(f"/api/stories/{uuid.uuid4()}", headers=auth)).status_code == 404
    assert (await client.delete("/api/stories/nope", headers=auth)).status_code == 422


# ----------------------------------------------------------------------- purge


async def test_purge_removes_only_expired_stories(client: AsyncClient, signup, session):
    auth = await signup("author")
    tid = (await track_ids(client, 1))[0]
    fresh = await post_story(client, auth, tid)
    stale_a = await post_story(client, auth, tid)
    stale_b = await post_story(client, auth, tid)
    await age(session, stale_a["id"], 30)
    await age(session, stale_b["id"], 48)

    removed = await StoryService(session, get_settings()).purge_expired()

    assert removed == 2
    remaining = (await session.scalars(select(Story.id))).all()
    assert remaining == [uuid.UUID(fresh["id"])]


async def test_purge_with_nothing_expired_is_a_noop(client: AsyncClient, signup, session):
    auth = await signup("author")
    await post_story(client, auth, (await track_ids(client, 1))[0])
    assert await StoryService(session, get_settings()).purge_expired() == 0
    assert await session.scalar(select(func.count()).select_from(Story)) == 1
