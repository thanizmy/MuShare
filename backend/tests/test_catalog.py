import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ListeningHistory, Track, User
from app.seed.seed import load_seed_data, seed_catalog


@pytest.fixture(autouse=True)
async def catalog(session: AsyncSession) -> dict:
    data = load_seed_data()
    await seed_catalog(session, data)
    return data


async def first_track(client: AsyncClient) -> dict:
    return (await client.get("/api/tracks", params={"limit": 1, "sort": "title"})).json()[0]


async def test_list_tracks_returns_playable_tracks_with_context(client: AsyncClient):
    response = await client.get("/api/tracks")
    assert response.status_code == 200
    tracks = response.json()
    assert len(tracks) == 17
    track = tracks[0]
    assert track["audio_url"].startswith("https://")
    assert track["duration_sec"] > 0
    assert track["album"]["cover_url"]
    assert track["album"]["artist"]["name"]
    assert track["genres"] and all(isinstance(g, str) for g in track["genres"])


async def test_tracks_sorted_by_title_and_paginated(client: AsyncClient):
    everything = (await client.get("/api/tracks", params={"sort": "title", "limit": 50})).json()
    titles = [t["title"] for t in everything]
    assert titles == sorted(titles)

    page = (
        await client.get("/api/tracks", params={"sort": "title", "limit": 5, "offset": 5})
    ).json()
    assert [t["id"] for t in page] == [t["id"] for t in everything[5:10]]


async def test_popular_sort_ranks_by_listening_history(
    client: AsyncClient, session: AsyncSession
):
    target = (await client.get("/api/tracks", params={"sort": "title", "limit": 50})).json()[-1]
    user = User(email="p@example.com", username="listener", password_hash="x" * 60)
    session.add(user)
    await session.flush()
    session.add_all(
        ListeningHistory(
            user_id=user.id, track_id=uuid.UUID(target["id"]), played_at=datetime.now(UTC)
        )
        for _ in range(3)
    )
    await session.flush()

    popular = (await client.get("/api/tracks", params={"sort": "popular"})).json()
    assert popular[0]["id"] == target["id"]


async def test_pagination_bounds_are_validated(client: AsyncClient):
    for params in ({"limit": 0}, {"limit": 51}, {"offset": -1}, {"sort": "random"}):
        assert (await client.get("/api/tracks", params=params)).status_code == 422


async def test_get_track_and_missing_track(client: AsyncClient):
    track = await first_track(client)
    found = await client.get(f"/api/tracks/{track['id']}")
    assert found.status_code == 200
    assert found.json()["id"] == track["id"]

    missing = await client.get(f"/api/tracks/{uuid.uuid4()}")
    assert missing.status_code == 404
    assert missing.json() == {"detail": "Track not found"}

    assert (await client.get("/api/tracks/not-a-uuid")).status_code == 422


async def test_albums_newest_first_and_detail_has_ordered_tracks(
    client: AsyncClient, catalog: dict
):
    albums = (await client.get("/api/albums")).json()
    assert len(albums) == 7
    years = [a["release_year"] for a in albums]
    assert years == sorted(years, reverse=True)

    expected = next(
        al for a in catalog["artists"] for al in a["albums"] if al["title"] == albums[0]["title"]
    )
    detail = (await client.get(f"/api/albums/{albums[0]['id']}")).json()
    assert detail["artist"]["name"]
    assert [t["title"] for t in detail["tracks"]] == [t["title"] for t in expected["tracks"]]
    assert all(t["album"]["id"] == detail["id"] for t in detail["tracks"])


async def test_missing_album_404(client: AsyncClient):
    assert (await client.get(f"/api/albums/{uuid.uuid4()}")).status_code == 404


async def test_artists_listing_and_detail(client: AsyncClient):
    artists = (await client.get("/api/artists")).json()
    assert [a["name"] for a in artists] == sorted(a["name"] for a in artists)
    assert len(artists) == 6

    nova = next(a for a in artists if a["name"] == "Nova Drift")
    detail = (await client.get(f"/api/artists/{nova['id']}")).json()
    assert detail["bio"]
    assert len(detail["albums"]) == 2
    assert len(detail["top_tracks"]) == 5
    assert all(t["album"]["artist"]["id"] == nova["id"] for t in detail["top_tracks"])


async def test_missing_artist_404(client: AsyncClient):
    assert (await client.get(f"/api/artists/{uuid.uuid4()}")).status_code == 404


async def test_catalog_is_public(client: AsyncClient, session: AsyncSession):
    # No Authorization header anywhere above; double-check the DB wasn't empty by accident.
    assert await session.get(Track, uuid.UUID((await first_track(client))["id"])) is not None
