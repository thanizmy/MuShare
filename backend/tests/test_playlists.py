import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Playlist
from app.seed.seed import seed_catalog


@pytest.fixture(autouse=True)
async def catalog(session: AsyncSession) -> None:
    await seed_catalog(session)


async def track_ids(client: AsyncClient, n: int = 4) -> list[str]:
    tracks = (await client.get("/api/tracks", params={"sort": "title", "limit": n})).json()
    return [t["id"] for t in tracks]


async def create(client: AsyncClient, auth, title="Road Trip", **extra) -> dict:
    response = await client.post("/api/playlists", json={"title": title, **extra}, headers=auth)
    assert response.status_code == 201, response.text
    return response.json()


async def add(client: AsyncClient, auth, playlist_id: str, track_id: str):
    return await client.post(
        f"/api/playlists/{playlist_id}/tracks", json={"track_id": track_id}, headers=auth
    )


def titles(detail: dict) -> list[str]:
    return [e["track"]["title"] for e in detail["entries"]]


# ------------------------------------------------------------------------ CRUD


async def test_playlists_require_authentication(client: AsyncClient):
    assert (await client.get("/api/playlists")).status_code == 401
    assert (await client.post("/api/playlists", json={"title": "x"})).status_code == 401


async def test_create_and_list_playlists(client: AsyncClient, signup, session: AsyncSession):
    auth = await signup("curator")
    made = await create(client, auth, "  Road Trip  ", description="  Windows down ")

    assert made["title"] == "Road Trip"
    assert made["description"] == "Windows down"
    assert made["is_public"] is False
    assert made["track_count"] == 0
    assert made["cover_url"] is None
    assert made["owner"]["username"] == "curator"

    # now() is frozen inside the test transaction, so make "Road Trip" explicitly older.
    await session.execute(
        update(Playlist)
        .where(Playlist.id == uuid.UUID(made["id"]))
        .values(created_at=datetime.now(UTC) - timedelta(hours=1))
    )
    await create(client, auth, "Focus")
    mine = (await client.get("/api/playlists", headers=auth)).json()
    assert [p["title"] for p in mine] == ["Focus", "Road Trip"]  # newest first


async def test_create_validates_input(client: AsyncClient, signup):
    auth = await signup("strict")
    for body in (
        {"title": ""},
        {"title": "   "},
        {"title": "x" * 121},
        {"title": "ok", "description": "d" * 501},
        {},
    ):
        response = await client.post("/api/playlists", json=body, headers=auth)
        assert response.status_code == 422, body


async def test_blank_description_is_stored_as_none(client: AsyncClient, signup):
    auth = await signup("blank")
    made = await create(client, auth, "P", description="   ")
    assert made["description"] is None


async def test_update_playlist(client: AsyncClient, signup):
    auth = await signup("editor")
    made = await create(client, auth)

    response = await client.patch(
        f"/api/playlists/{made['id']}",
        json={"title": "Night Drive", "is_public": True},
        headers=auth,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Night Drive"
    assert body["is_public"] is True
    assert body["description"] is None

    cleared = await client.patch(
        f"/api/playlists/{made['id']}", json={"description": "now with words"}, headers=auth
    )
    assert cleared.json()["description"] == "now with words"
    cleared = await client.patch(
        f"/api/playlists/{made['id']}", json={"description": ""}, headers=auth
    )
    assert cleared.json()["description"] is None


async def test_update_rejects_empty_or_invalid_patches(client: AsyncClient, signup):
    auth = await signup("fussy")
    made = await create(client, auth)
    url = f"/api/playlists/{made['id']}"
    for body in ({}, {"title": None}, {"title": " "}, {"is_public": None}):
        assert (await client.patch(url, json=body, headers=auth)).status_code == 422, body


async def test_delete_playlist_cascades_entries(client: AsyncClient, signup):
    auth = await signup("remover")
    made = await create(client, auth)
    await add(client, auth, made["id"], (await track_ids(client, 1))[0])

    assert (await client.delete(f"/api/playlists/{made['id']}", headers=auth)).status_code == 204
    assert (await client.get(f"/api/playlists/{made['id']}", headers=auth)).status_code == 404
    assert (await client.get("/api/playlists", headers=auth)).json() == []


async def test_missing_playlist_is_404(client: AsyncClient, signup):
    auth = await signup("seeker")
    ghost = uuid.uuid4()
    assert (await client.get(f"/api/playlists/{ghost}", headers=auth)).status_code == 404
    patched = await client.patch(f"/api/playlists/{ghost}", json={"title": "x"}, headers=auth)
    assert patched.status_code == 404
    assert (await client.delete(f"/api/playlists/{ghost}", headers=auth)).status_code == 404
    assert (await add(client, auth, str(ghost), str(uuid.uuid4()))).status_code == 404


# ---------------------------------------------------------------------- tracks


async def test_add_tracks_appends_in_order_and_updates_summary(client: AsyncClient, signup):
    auth = await signup("builder")
    made = await create(client, auth)
    a, b, c, _ = await track_ids(client)

    first = await add(client, auth, made["id"], a)
    assert first.status_code == 201
    await add(client, auth, made["id"], b)
    detail = (await add(client, auth, made["id"], c)).json()

    assert [e["track"]["id"] for e in detail["entries"]] == [a, b, c]
    assert [e["position"] for e in detail["entries"]] == [0, 1, 2]
    assert detail["track_count"] == 3
    assert detail["cover_url"] == detail["entries"][0]["track"]["album"]["cover_url"]
    assert detail["entries"][0]["track"]["album"]["artist"]["name"]

    listed = (await client.get("/api/playlists", headers=auth)).json()
    assert listed[0]["track_count"] == 3


async def test_duplicate_and_unknown_tracks_are_rejected(client: AsyncClient, signup):
    auth = await signup("picky")
    made = await create(client, auth)
    a = (await track_ids(client, 1))[0]
    await add(client, auth, made["id"], a)

    dup = await add(client, auth, made["id"], a)
    assert dup.status_code == 409
    assert "already" in dup.json()["detail"].lower()

    assert (await add(client, auth, made["id"], str(uuid.uuid4()))).status_code == 404
    assert (await add(client, auth, made["id"], "nope")).status_code == 422


async def test_remove_track_closes_the_gap(client: AsyncClient, signup):
    auth = await signup("trimmer")
    made = await create(client, auth)
    a, b, c, _ = await track_ids(client)
    for tid in (a, b, c):
        detail = (await add(client, auth, made["id"], tid)).json()
    middle = detail["entries"][1]["entry_id"]

    response = await client.delete(f"/api/playlists/{made['id']}/tracks/{middle}", headers=auth)

    assert response.status_code == 200
    body = response.json()
    assert [e["track"]["id"] for e in body["entries"]] == [a, c]
    assert [e["position"] for e in body["entries"]] == [0, 1]
    assert body["track_count"] == 2

    # Appending afterwards continues from the closed-up end.
    again = (await add(client, auth, made["id"], b)).json()
    assert [e["position"] for e in again["entries"]] == [0, 1, 2]


async def test_remove_unknown_entry_is_404(client: AsyncClient, signup):
    auth = await signup("nope")
    made = await create(client, auth)
    response = await client.delete(
        f"/api/playlists/{made['id']}/tracks/{uuid.uuid4()}", headers=auth
    )
    assert response.status_code == 404


async def test_reorder_tracks(client: AsyncClient, signup):
    auth = await signup("shuffler")
    made = await create(client, auth)
    a, b, c, _ = await track_ids(client)
    for tid in (a, b, c):
        detail = (await add(client, auth, made["id"], tid)).json()
    ids = [e["entry_id"] for e in detail["entries"]]

    response = await client.put(
        f"/api/playlists/{made['id']}/tracks/order",
        json={"entry_ids": [ids[2], ids[0], ids[1]]},
        headers=auth,
    )

    assert response.status_code == 200
    body = response.json()
    assert [e["track"]["id"] for e in body["entries"]] == [c, a, b]
    assert [e["position"] for e in body["entries"]] == [0, 1, 2]

    # And it sticks.
    reloaded = (await client.get(f"/api/playlists/{made['id']}", headers=auth)).json()
    assert [e["track"]["id"] for e in reloaded["entries"]] == [c, a, b]


async def test_reorder_swap_of_two_works_despite_unique_positions(client: AsyncClient, signup):
    auth = await signup("swapper")
    made = await create(client, auth)
    a, b, _, _ = await track_ids(client)
    await add(client, auth, made["id"], a)
    detail = (await add(client, auth, made["id"], b)).json()
    first, second = (e["entry_id"] for e in detail["entries"])

    response = await client.put(
        f"/api/playlists/{made['id']}/tracks/order",
        json={"entry_ids": [second, first]},
        headers=auth,
    )
    assert [e["track"]["id"] for e in response.json()["entries"]] == [b, a]


async def test_reorder_must_name_exactly_the_current_entries(client: AsyncClient, signup):
    auth = await signup("careless")
    made = await create(client, auth)
    a, b, _, _ = await track_ids(client)
    await add(client, auth, made["id"], a)
    detail = (await add(client, auth, made["id"], b)).json()
    ids = [e["entry_id"] for e in detail["entries"]]
    url = f"/api/playlists/{made['id']}/tracks/order"

    missing = await client.put(url, json={"entry_ids": ids[:1]}, headers=auth)
    assert missing.status_code == 409
    foreign = await client.put(url, json={"entry_ids": [ids[0], str(uuid.uuid4())]}, headers=auth)
    assert foreign.status_code == 409
    duplicate = await client.put(url, json={"entry_ids": [ids[0], ids[0]]}, headers=auth)
    assert duplicate.status_code == 422


async def test_playlist_track_limit(client: AsyncClient, signup, monkeypatch):
    from app.services import playlist_service

    monkeypatch.setattr(playlist_service, "MAX_PLAYLIST_TRACKS", 2)
    auth = await signup("hoarder")
    made = await create(client, auth)
    a, b, c, _ = await track_ids(client)
    await add(client, auth, made["id"], a)
    await add(client, auth, made["id"], b)
    assert (await add(client, auth, made["id"], c)).status_code == 409


async def test_playlist_count_limit(client: AsyncClient, signup, monkeypatch):
    from app.services import playlist_service

    monkeypatch.setattr(playlist_service, "MAX_PLAYLISTS_PER_USER", 2)
    auth = await signup("collector")
    await create(client, auth, "one")
    await create(client, auth, "two")
    response = await client.post("/api/playlists", json={"title": "three"}, headers=auth)
    assert response.status_code == 409


# ---------------------------------------------------------------------- access


async def test_private_playlists_are_invisible_to_others(client: AsyncClient, signup):
    owner, stranger = await signup("owner"), await signup("stranger")
    made = await create(client, owner, "Secret")
    a = (await track_ids(client, 1))[0]
    url = f"/api/playlists/{made['id']}"

    assert (await client.get(url, headers=stranger)).status_code == 404
    assert (await client.patch(url, json={"title": "x"}, headers=stranger)).status_code == 404
    assert (await client.delete(url, headers=stranger)).status_code == 404
    assert (await add(client, stranger, made["id"], a)).status_code == 404
    assert (await client.get("/api/playlists", headers=stranger)).json() == []

    # None of that touched it.
    assert (await client.get(url, headers=owner)).json()["title"] == "Secret"


async def test_public_playlists_are_readable_but_not_editable_by_others(
    client: AsyncClient, signup
):
    owner, fan = await signup("disc_jockey"), await signup("fan")
    made = await create(client, owner, "Open Decks", is_public=True)
    a, b, _, _ = await track_ids(client)
    detail = (await add(client, owner, made["id"], a)).json()
    entry = detail["entries"][0]["entry_id"]
    url = f"/api/playlists/{made['id']}"

    seen = (await client.get(url, headers=fan)).json()
    assert seen["title"] == "Open Decks"
    assert seen["owner"]["username"] == "disc_jockey"
    assert [e["track"]["id"] for e in seen["entries"]] == [a]

    assert (await client.patch(url, json={"title": "mine"}, headers=fan)).status_code == 403
    assert (await client.delete(url, headers=fan)).status_code == 403
    assert (await add(client, fan, made["id"], b)).status_code == 403
    assert (await client.delete(f"{url}/tracks/{entry}", headers=fan)).status_code == 403
    assert (
        await client.put(f"{url}/tracks/order", json={"entry_ids": [entry]}, headers=fan)
    ).status_code == 403

    # Public playlists don't show up in someone else's "my playlists".
    assert (await client.get("/api/playlists", headers=fan)).json() == []


async def test_making_a_playlist_private_again_hides_it(client: AsyncClient, signup):
    owner, fan = await signup("flipper"), await signup("watcher")
    made = await create(client, owner, "Flip", is_public=True)
    url = f"/api/playlists/{made['id']}"
    assert (await client.get(url, headers=fan)).status_code == 200

    await client.patch(url, json={"is_public": False}, headers=owner)
    assert (await client.get(url, headers=fan)).status_code == 404
