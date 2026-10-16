import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ListeningHistory
from app.seed.seed import seed_catalog


@pytest.fixture(autouse=True)
async def catalog(session: AsyncSession) -> None:
    await seed_catalog(session)


async def track_ids(client: AsyncClient, n: int = 4) -> list[str]:
    tracks = (await client.get("/api/tracks", params={"sort": "title", "limit": n})).json()
    return [t["id"] for t in tracks]


# -------------------------------------------------------------------- favorites


async def test_library_requires_authentication(client: AsyncClient):
    tid = (await track_ids(client, 1))[0]
    for method, url in [
        ("GET", "/api/library/favorites"),
        ("GET", "/api/library/favorites/ids"),
        ("PUT", f"/api/library/favorites/{tid}"),
        ("DELETE", f"/api/library/favorites/{tid}"),
        ("POST", "/api/library/history"),
        ("GET", "/api/library/recently-played"),
    ]:
        response = await client.request(method, url)
        assert response.status_code == 401, (method, url)


async def test_favorite_add_list_and_remove(client: AsyncClient, signup):
    auth = await signup("fan")
    a, b, _, _ = await track_ids(client)

    assert (await client.get("/api/library/favorites/ids", headers=auth)).json() == []

    assert (await client.put(f"/api/library/favorites/{a}", headers=auth)).status_code == 204
    assert (await client.put(f"/api/library/favorites/{b}", headers=auth)).status_code == 204

    ids = (await client.get("/api/library/favorites/ids", headers=auth)).json()
    assert ids == [b, a]  # newest first

    tracks = (await client.get("/api/library/favorites", headers=auth)).json()
    assert [t["id"] for t in tracks] == [b, a]
    assert tracks[0]["album"]["artist"]["name"]

    assert (await client.delete(f"/api/library/favorites/{b}", headers=auth)).status_code == 204
    assert (await client.get("/api/library/favorites/ids", headers=auth)).json() == [a]


async def test_favorite_calls_are_idempotent(client: AsyncClient, signup):
    auth = await signup("steady")
    a = (await track_ids(client, 1))[0]

    for _ in range(2):
        assert (await client.put(f"/api/library/favorites/{a}", headers=auth)).status_code == 204
    assert (await client.get("/api/library/favorites/ids", headers=auth)).json() == [a]

    for _ in range(2):
        assert (await client.delete(f"/api/library/favorites/{a}", headers=auth)).status_code == 204
    assert (await client.get("/api/library/favorites/ids", headers=auth)).json() == []


async def test_favoriting_unknown_track_is_404(client: AsyncClient, signup):
    auth = await signup("lost")
    response = await client.put(f"/api/library/favorites/{uuid.uuid4()}", headers=auth)
    assert response.status_code == 404
    assert (await client.put("/api/library/favorites/nope", headers=auth)).status_code == 422


async def test_favorites_are_private_to_each_user(client: AsyncClient, signup):
    alice, bob = await signup("alice"), await signup("bob")
    a = (await track_ids(client, 1))[0]
    await client.put(f"/api/library/favorites/{a}", headers=alice)

    assert (await client.get("/api/library/favorites/ids", headers=bob)).json() == []
    assert (await client.get("/api/library/favorites", headers=bob)).json() == []

    # Bob "removing" the track must not touch Alice's favorite.
    await client.delete(f"/api/library/favorites/{a}", headers=bob)
    assert (await client.get("/api/library/favorites/ids", headers=alice)).json() == [a]


# ---------------------------------------------------------------------- history


async def test_record_play_and_recently_played_order(client: AsyncClient, signup, session):
    auth = await signup("listener")
    a, b, c, _ = await track_ids(client)

    for tid in (a, b, c):
        assert (
            await client.post("/api/library/history", json={"track_id": tid}, headers=auth)
        ).status_code == 204
    # Push the first plays into the past so "a" can be played again as a new play.
    await session.execute(
        update(ListeningHistory).values(played_at=datetime.now(UTC) - timedelta(hours=1))
    )
    await client.post("/api/library/history", json={"track_id": a}, headers=auth)

    recent = (await client.get("/api/library/recently-played", headers=auth)).json()
    ids = [t["id"] for t in recent]
    assert ids[0] == a
    assert sorted(ids) == sorted([a, b, c])  # distinct, even though "a" was played twice
    assert recent[0]["album"]["artist"]["name"]


async def test_recently_played_respects_limit_and_is_per_user(
    client: AsyncClient, signup, session
):
    me, other = await signup("myself"), await signup("other")
    tids = await track_ids(client, 4)
    for tid in tids:
        await client.post("/api/library/history", json={"track_id": tid}, headers=me)

    assert len((await client.get("/api/library/recently-played?limit=2", headers=me)).json()) == 2
    assert (await client.get("/api/library/recently-played", headers=other)).json() == []
    assert (await client.get("/api/library/recently-played?limit=0", headers=me)).status_code == 422


async def test_repeated_play_reports_are_deduplicated(client: AsyncClient, signup, session):
    auth = await signup("doubleclick")
    a = (await track_ids(client, 1))[0]

    for _ in range(3):
        response = await client.post("/api/library/history", json={"track_id": a}, headers=auth)
        assert response.status_code == 204

    count = await session.scalar(select(func.count()).select_from(ListeningHistory))
    assert count == 1


async def test_history_validates_the_track(client: AsyncClient, signup):
    auth = await signup("careful")
    unknown = await client.post(
        "/api/library/history", json={"track_id": str(uuid.uuid4())}, headers=auth
    )
    assert unknown.status_code == 404
    bad = await client.post("/api/library/history", json={"track_id": "x"}, headers=auth)
    assert bad.status_code == 422


async def test_plays_feed_the_popular_ranking(client: AsyncClient, signup):
    auth = await signup("trendsetter")
    target = (await track_ids(client, 17))[-1]
    await client.post("/api/library/history", json={"track_id": target}, headers=auth)

    popular = (await client.get("/api/tracks", params={"sort": "popular", "limit": 1})).json()
    assert popular[0]["id"] == target
