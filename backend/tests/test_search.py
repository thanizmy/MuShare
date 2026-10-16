import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.seed.seed import seed_catalog


@pytest.fixture(autouse=True)
async def catalog(session: AsyncSession) -> None:
    await seed_catalog(session)


async def search(client: AsyncClient, q: str, **params):
    response = await client.get("/api/search", params={"q": q, **params})
    assert response.status_code == 200, response.text
    return response.json()


async def test_finds_tracks_by_title_case_insensitively(client: AsyncClient):
    body = await search(client, "AFTERGLOW")
    assert [t["title"] for t in body["tracks"]] == ["Afterglow"]
    assert body["query"] == "AFTERGLOW"


async def test_finds_artists_by_partial_name(client: AsyncClient):
    body = await search(client, "kest")
    assert [a["name"] for a in body["artists"]] == ["Kestrel Run"]


async def test_finds_albums_by_title(client: AsyncClient):
    body = await search(client, "blue room")
    assert [a["title"] for a in body["albums"]] == ["Blue Room Sessions"]


async def test_artist_name_surfaces_their_tracks_and_albums(client: AsyncClient):
    body = await search(client, "Nova Drift")
    # Fuzzy matching may add loose hits (e.g. "Driftwood"), but the artist's own work ranks first.
    top_five = body["tracks"][:5]
    assert {t["album"]["artist"]["name"] for t in top_five} == {"Nova Drift"}
    assert {a["title"] for a in body["albums"][:2]} == {"Neon Horizons", "Static Bloom"}


async def test_tolerates_a_typo(client: AsyncClient):
    body = await search(client, "Aftergow")
    assert "Afterglow" in [t["title"] for t in body["tracks"]]


async def test_no_matches_returns_empty_lists(client: AsyncClient):
    body = await search(client, "zzzzqqqq")
    assert body["tracks"] == body["artists"] == body["albums"] == []


async def test_like_wildcards_are_matched_literally(client: AsyncClient):
    for q in ("%", "_", "\\"):
        body = await search(client, q)
        assert body["tracks"] == body["artists"] == body["albums"] == []


async def test_whitespace_is_normalised(client: AsyncClient):
    body = await search(client, "  nova    drift ")
    assert body["query"] == "nova drift"
    assert body["artists"]


async def test_blank_query_returns_nothing_instead_of_everything(client: AsyncClient):
    body = await search(client, "   ")
    assert body["tracks"] == body["artists"] == body["albums"] == []


async def test_limit_caps_each_section(client: AsyncClient):
    body = await search(client, "a", limit=2)
    assert len(body["tracks"]) <= 2
    assert len(body["artists"]) <= 2
    assert len(body["albums"]) <= 2


async def test_query_validation(client: AsyncClient):
    assert (await client.get("/api/search")).status_code == 422
    assert (await client.get("/api/search", params={"q": ""})).status_code == 422
    assert (await client.get("/api/search", params={"q": "x" * 101})).status_code == 422
    assert (await client.get("/api/search", params={"q": "a", "limit": 21})).status_code == 422


async def test_sql_injection_attempt_is_inert(client: AsyncClient):
    body = await search(client, "'; DROP TABLE tracks; --")
    assert body["tracks"] == []
    assert (await client.get("/api/tracks")).status_code == 200
