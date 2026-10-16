import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.storage import LocalStorage
from app.models import ListeningHistory, User
from app.seed.seed import seed_catalog
from tests.samples import PNG, WAV, make_wav

TITLE = "Zephyr Lullaby"


@pytest.fixture(autouse=True)
async def catalog(session: AsyncSession) -> None:
    await seed_catalog(session)


async def make_piece(client: AsyncClient, auth, *, title: str = TITLE, cover: bytes | None = None):
    files = {"audio": ("song.wav", WAV, "audio/wav")}
    if cover is not None:
        files["cover"] = ("c.png", cover, "image/png")
    response = await client.post(
        "/api/studio/pieces", files=files, data={"title": title}, headers=auth
    )
    assert response.status_code == 201, response.text
    return response.json()


async def publish(client: AsyncClient, auth, piece_id: str, **body):
    return await client.post(
        f"/api/studio/pieces/{piece_id}/publish",
        json={"rights_confirmed": True, **body},
        headers=auth,
    )


async def published_piece(client: AsyncClient, auth, **kwargs) -> dict:
    piece = await make_piece(client, auth, **kwargs)
    response = await publish(client, auth, piece["id"])
    assert response.status_code == 200, response.text
    return response.json()


async def unpublish(client: AsyncClient, auth, piece_id: str):
    return await client.post(f"/api/studio/pieces/{piece_id}/unpublish", headers=auth)


async def in_search(client: AsyncClient, query: str = TITLE) -> dict:
    return (await client.get("/api/search", params={"q": query})).json()


async def in_tracks(client: AsyncClient, title: str = TITLE) -> list[dict]:
    tracks = (await client.get("/api/tracks", params={"limit": 50, "sort": "title"})).json()
    return [t for t in tracks if t["title"] == title]


async def visible_everywhere(client: AsyncClient, title: str = TITLE) -> dict[str, bool]:
    search = await in_search(client, title)
    albums = (await client.get("/api/albums", params={"limit": 50})).json()
    return {
        "tracks": bool(await in_tracks(client, title)),
        "search_tracks": any(t["title"] == title for t in search["tracks"]),
        "search_albums": any(a["title"] == title for a in search["albums"]),
        "albums": any(a["title"] == title for a in albums),
    }


# ----------------------------------------------------------------- the draft state


async def test_a_draft_exists_nowhere_in_the_catalog(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await make_piece(client, auth)

    assert piece["status"] == "draft"
    assert not any((await visible_everywhere(client)).values())
    artists = (await client.get("/api/artists", params={"limit": 50})).json()
    assert "maker" not in [a["name"] for a in artists]


async def test_a_draft_audio_is_not_reachable_without_its_signed_link(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await make_piece(client, auth, cover=PNG)
    bare_audio = f"/api/media/pieces/{piece['id']}/audio"
    bare_cover = f"/api/media/pieces/{piece['id']}/cover"

    assert (await client.get(bare_audio)).status_code == 404
    assert (await client.get(bare_cover)).status_code == 404
    # The same refusal as for something that doesn't exist at all.
    assert (await client.get(f"/api/media/pieces/{uuid.uuid4()}/audio")).status_code == 404

    signed = await client.get(piece["audio_url"])
    assert signed.status_code == 200
    assert signed.content == WAV
    assert signed.headers["content-type"] == "audio/wav"
    assert (await client.get(piece["cover_url"])).headers["content-type"] == "image/jpeg"


# ----------------------------------------------------------------------- publishing


async def test_publishing_requires_the_owner_to_confirm_the_rights(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await make_piece(client, auth)
    url = f"/api/studio/pieces/{piece['id']}/publish"

    for body in ({}, {"rights_confirmed": False}, {"rights_confirmed": None}):
        response = await client.post(url, json=body, headers=auth)
        assert response.status_code == 422, body

    assert (await client.get(f"/api/studio/pieces/{piece['id']}", headers=auth)).json()[
        "status"
    ] == "draft"
    assert not any((await visible_everywhere(client)).values())


async def test_publishing_puts_the_piece_in_the_catalog(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await make_piece(client, auth, cover=PNG)

    response = await publish(client, auth, piece["id"])

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "published"
    assert body["published_at"] is not None
    assert body["track_id"] and body["album_id"] and body["artist_id"]
    assert all((await visible_everywhere(client)).values())

    [track] = await in_tracks(client)
    assert track["id"] == body["track_id"]
    assert track["audio_url"] == f"/api/media/pieces/{piece['id']}/audio"
    assert track["album"]["cover_url"] == f"/api/media/pieces/{piece['id']}/cover"
    assert track["album"]["artist"]["name"] == "maker"  # defaults to the username
    assert track["duration_sec"] == 1 and track["is_hidden"] is False
    assert (await client.get(f"/api/tracks/{track['id']}")).status_code == 200


async def test_the_owner_gets_an_artist_profile_with_their_music_on_it(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await published_piece(client, auth)

    artist = (await client.get(f"/api/artists/{piece['artist_id']}")).json()
    assert artist["name"] == "maker"
    assert [a["title"] for a in artist["albums"]] == [TITLE]
    assert [t["title"] for t in artist["top_tracks"]] == [TITLE]
    names = [a["name"] for a in (await client.get("/api/artists", params={"limit": 50})).json()]
    assert "maker" in names

    album = (await client.get(f"/api/albums/{piece['album_id']}")).json()
    assert [t["id"] for t in album["tracks"]] == [piece["track_id"]]


async def test_publishing_can_set_the_artist_name(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await make_piece(client, auth)
    response = await publish(client, auth, piece["id"], artist_name="  DJ Zephyr  ")
    artist = (await client.get(f"/api/artists/{response.json()['artist_id']}")).json()
    assert artist["name"] == "DJ Zephyr"

    second = await make_piece(client, auth, title="Second")
    await publish(client, auth, second["id"], artist_name="Zephyr & Co")
    assert (await client.get(f"/api/artists/{artist['id']}")).json()["name"] == "Zephyr & Co"


async def test_all_of_a_users_pieces_share_one_artist_profile(client: AsyncClient, signup):
    auth = await signup("maker")
    first = await published_piece(client, auth, title="First")
    second = await published_piece(client, auth, title="Second")

    assert first["artist_id"] == second["artist_id"]
    assert first["album_id"] != second["album_id"]
    artist = (await client.get(f"/api/artists/{first['artist_id']}")).json()
    assert sorted(a["title"] for a in artist["albums"]) == ["First", "Second"]


async def test_publishing_twice_changes_nothing(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await published_piece(client, auth)
    again = await publish(client, auth, piece["id"])
    assert again.status_code == 200
    assert again.json()["track_id"] == piece["track_id"]
    assert len(await in_tracks(client)) == 1


async def test_a_published_piece_streams_to_anyone_with_range_support(client: AsyncClient, signup):
    owner = await signup("maker")
    piece = await published_piece(client, owner)
    bare = f"/api/media/pieces/{piece['id']}/audio"  # no token, no login

    whole = await client.get(bare)
    assert whole.status_code == 200 and whole.content == WAV
    assert whole.headers["x-content-type-options"] == "nosniff"
    assert whole.headers["cache-control"] == "public, max-age=300"

    part = await client.get(bare, headers={"Range": "bytes=0-99"})
    assert part.status_code == 206
    assert part.content == WAV[:100]
    assert part.headers["content-range"].startswith("bytes 0-99/")


async def test_a_signed_link_gets_private_caching(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await make_piece(client, auth)
    response = await client.get(piece["audio_url"])
    assert response.headers["cache-control"] == "private, max-age=300"


# --------------------------------------------------------------- editing & syncing


async def test_renaming_updates_the_catalog_entry_live_or_hidden(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await published_piece(client, auth)
    url = f"/api/studio/pieces/{piece['id']}"

    await client.patch(url, json={"title": "Renamed"}, headers=auth)
    assert (await client.get(f"/api/tracks/{piece['track_id']}")).json()["title"] == "Renamed"
    assert (await client.get(f"/api/albums/{piece['album_id']}")).json()["title"] == "Renamed"

    await unpublish(client, auth, piece["id"])
    await client.patch(url, json={"title": "Renamed While Hidden"}, headers=auth)
    await publish(client, auth, piece["id"])
    assert (await client.get(f"/api/tracks/{piece['track_id']}")).json()[
        "title"
    ] == "Renamed While Hidden"


async def test_changing_the_cover_after_publishing_updates_the_album(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await published_piece(client, auth)
    assert (await client.get(f"/api/albums/{piece['album_id']}")).json()["cover_url"] is None

    await client.put(
        f"/api/studio/pieces/{piece['id']}/cover", files={"cover": ("c.png", PNG)}, headers=auth
    )
    album = (await client.get(f"/api/albums/{piece['album_id']}")).json()
    assert album["cover_url"] == f"/api/media/pieces/{piece['id']}/cover"
    assert (await client.get(album["cover_url"])).status_code == 200  # public while published

    await client.delete(f"/api/studio/pieces/{piece['id']}/cover", headers=auth)
    assert (await client.get(f"/api/albums/{piece['album_id']}")).json()["cover_url"] is None


# ------------------------------------------------------------------------ unpublishing


async def test_unpublishing_removes_it_from_every_discovery_surface(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await published_piece(client, auth)
    assert all((await visible_everywhere(client)).values())

    response = await unpublish(client, auth, piece["id"])

    assert response.status_code == 200 and response.json()["status"] == "hidden"
    assert not any((await visible_everywhere(client)).values())
    assert (await client.get(f"/api/tracks/{piece['track_id']}")).status_code == 404
    assert (await client.get(f"/api/albums/{piece['album_id']}")).status_code == 404
    # Their only content is hidden, so the artist page goes too.
    assert (await client.get(f"/api/artists/{piece['artist_id']}")).status_code == 404
    names = [a["name"] for a in (await client.get("/api/artists", params={"limit": 50})).json()]
    assert "maker" not in names
    assert "maker" not in [a["name"] for a in (await in_search(client, "maker"))["artists"]]


async def test_unpublishing_cuts_off_public_streaming_but_not_the_owner(
    client: AsyncClient, signup
):
    auth = await signup("maker")
    piece = await published_piece(client, auth)
    bare = f"/api/media/pieces/{piece['id']}/audio"
    assert (await client.get(bare)).status_code == 200

    await unpublish(client, auth, piece["id"])

    assert (await client.get(bare)).status_code == 404
    owner_view = (await client.get(f"/api/studio/pieces/{piece['id']}", headers=auth)).json()
    assert (await client.get(owner_view["audio_url"])).status_code == 200


async def test_an_artist_with_other_published_work_stays_visible(client: AsyncClient, signup):
    auth = await signup("maker")
    keep = await published_piece(client, auth, title="Keeper")
    gone = await published_piece(client, auth, title="Retired")

    await unpublish(client, auth, gone["id"])

    artist = (await client.get(f"/api/artists/{keep['artist_id']}")).json()
    assert [a["title"] for a in artist["albums"]] == ["Keeper"]
    assert [t["title"] for t in artist["top_tracks"]] == ["Keeper"]


async def test_seeded_artists_are_never_affected(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await published_piece(client, auth)
    await unpublish(client, auth, piece["id"])
    names = [a["name"] for a in (await client.get("/api/artists", params={"limit": 50})).json()]
    assert "Nova Drift" in names and len(names) >= 6


async def test_unpublish_and_republish_state_rules(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await make_piece(client, auth)

    assert (await unpublish(client, auth, piece["id"])).status_code == 409  # a draft isn't live
    await publish(client, auth, piece["id"])
    assert (await unpublish(client, auth, piece["id"])).status_code == 200
    assert (await unpublish(client, auth, piece["id"])).status_code == 409  # already hidden
    assert (await publish(client, auth, piece["id"])).status_code == 200


async def test_republishing_brings_back_the_same_entry(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await published_piece(client, auth)
    await unpublish(client, auth, piece["id"])

    again = await publish(client, auth, piece["id"])

    assert again.json()["status"] == "published"
    assert again.json()["track_id"] == piece["track_id"]
    assert all((await visible_everywhere(client)).values())
    assert (await client.get(f"/api/artists/{piece['artist_id']}")).status_code == 200
    assert (await client.get(f"/api/media/pieces/{piece['id']}/audio")).status_code == 200
    assert len(await in_tracks(client)) == 1


# ----------------------------------------- "hidden by the artist" for everyone else


async def fan_saves_everything(client: AsyncClient, fan, track_id: str) -> dict:
    """A listener favourites the track, adds it to a playlist and plays it."""
    assert (await client.put(f"/api/library/favorites/{track_id}", headers=fan)).status_code == 204
    playlist = (await client.post("/api/playlists", json={"title": "Mine"}, headers=fan)).json()
    added = await client.post(
        f"/api/playlists/{playlist['id']}/tracks", json={"track_id": track_id}, headers=fan
    )
    assert added.status_code == 201
    played = await client.post("/api/library/history", json={"track_id": track_id}, headers=fan)
    assert played.status_code == 204
    return playlist


async def test_other_peoples_copies_become_hidden_placeholders_not_deletions(
    client: AsyncClient, signup
):
    owner, fan = await signup("maker"), await signup("listener")
    piece = await published_piece(client, owner)
    playlist = await fan_saves_everything(client, fan, piece["track_id"])

    await unpublish(client, owner, piece["id"])

    favourites = (await client.get("/api/library/favorites", headers=fan)).json()
    assert [t["id"] for t in favourites] == [piece["track_id"]]
    hidden = favourites[0]
    assert hidden["is_hidden"] is True
    assert hidden["audio_url"] == ""  # the way to play it is gone
    assert hidden["title"] == TITLE  # but you can still tell what it was

    assert (await client.get("/api/library/favorites/ids", headers=fan)).json() == [
        piece["track_id"]
    ]
    detail = (await client.get(f"/api/playlists/{playlist['id']}", headers=fan)).json()
    assert detail["track_count"] == 1
    assert detail["entries"][0]["track"]["is_hidden"] is True
    assert detail["entries"][0]["track"]["audio_url"] == ""

    recent = (await client.get("/api/library/recently-played", headers=fan)).json()
    assert [t["id"] for t in recent] == [piece["track_id"]]
    assert recent[0]["is_hidden"] is True and recent[0]["audio_url"] == ""


async def test_hidden_tracks_cannot_be_newly_saved_played_or_shared(client: AsyncClient, signup):
    owner, fan = await signup("maker"), await signup("listener")
    piece = await published_piece(client, owner)
    playlist = (await client.post("/api/playlists", json={"title": "P"}, headers=fan)).json()
    await unpublish(client, owner, piece["id"])
    tid = piece["track_id"]

    assert (await client.put(f"/api/library/favorites/{tid}", headers=fan)).status_code == 404
    added = await client.post(
        f"/api/playlists/{playlist['id']}/tracks", json={"track_id": tid}, headers=fan
    )
    assert added.status_code == 404
    assert (
        await client.post("/api/library/history", json={"track_id": tid}, headers=fan)
    ).status_code == 404
    story = await client.post("/api/stories", json={"track_id": tid}, headers=fan)
    assert story.status_code == 404


async def test_a_hidden_track_can_still_be_removed_from_favourites(client: AsyncClient, signup):
    owner, fan = await signup("maker"), await signup("listener")
    piece = await published_piece(client, owner)
    await client.put(f"/api/library/favorites/{piece['track_id']}", headers=fan)
    await unpublish(client, owner, piece["id"])

    removed = await client.delete(f"/api/library/favorites/{piece['track_id']}", headers=fan)
    assert removed.status_code == 204
    assert (await client.get("/api/library/favorites", headers=fan)).json() == []


async def test_republishing_makes_other_peoples_copies_playable_again(client: AsyncClient, signup):
    owner, fan = await signup("maker"), await signup("listener")
    piece = await published_piece(client, owner)
    playlist = await fan_saves_everything(client, fan, piece["track_id"])
    await unpublish(client, owner, piece["id"])
    await publish(client, owner, piece["id"])

    entry = (await client.get(f"/api/playlists/{playlist['id']}", headers=fan)).json()["entries"][0]
    assert entry["track"]["is_hidden"] is False
    assert entry["track"]["audio_url"] == f"/api/media/pieces/{piece['id']}/audio"
    favourite = (await client.get("/api/library/favorites", headers=fan)).json()[0]
    assert favourite["is_hidden"] is False and favourite["audio_url"]


async def test_wrapped_keeps_a_hidden_track_but_masks_it(
    client: AsyncClient, signup, session: AsyncSession
):
    owner = await signup("maker")
    await signup("listener")
    piece = await published_piece(client, owner)
    fan_id = await session.scalar(select(User.id).where(User.username == "listener"))
    for _ in range(2):
        session.add(ListeningHistory(user_id=fan_id, track_id=uuid.UUID(piece["track_id"])))
    await session.flush()
    await unpublish(client, owner, piece["id"])

    wrapped = (await client.get("/api/users/listener/wrapped")).json()
    [top] = wrapped["top_tracks"]
    assert top["plays"] == 2
    assert top["track"]["is_hidden"] is True and top["track"]["audio_url"] == ""


async def test_the_audio_url_of_a_hidden_track_never_appears_in_any_response(
    client: AsyncClient, signup
):
    owner, fan = await signup("maker"), await signup("listener")
    piece = await published_piece(client, owner)
    await fan_saves_everything(client, fan, piece["track_id"])
    await unpublish(client, owner, piece["id"])
    needle = f"/api/media/pieces/{piece['id']}/audio"

    for url in (
        "/api/library/favorites",
        "/api/library/recently-played",
        "/api/playlists",
        "/api/tracks?limit=50",
        "/api/users/listener/wrapped",
    ):
        assert needle not in (await client.get(url, headers=fan)).text, url


# ---------------------------------------------------------------------- tokens


async def test_media_tokens_are_tied_to_one_piece_and_one_kind(client: AsyncClient, signup):
    auth = await signup("maker")
    one = await make_piece(client, auth, title="One", cover=PNG)
    two = await make_piece(client, auth, title="Two", cover=PNG)

    token_one = one["audio_url"].split("token=")[1]
    assert (
        await client.get(f"/api/media/pieces/{two['id']}/audio?token={token_one}")
    ).status_code == 404
    assert (
        await client.get(f"/api/media/pieces/{one['id']}/cover?token={token_one}")
    ).status_code == 404
    assert (
        await client.get(f"/api/media/pieces/{one['id']}/audio?token=garbage")
    ).status_code == 404
    assert (await client.get(f"/api/media/pieces/{one['id']}/audio?token=")).status_code == 404


async def test_expired_media_tokens_stop_working(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await make_piece(client, auth)
    settings = get_settings()
    expired = jwt.encode(
        {
            "typ": "media",
            "sub": piece["id"],
            "kind": "audio",
            "iat": datetime.now(UTC) - timedelta(hours=2),
            "exp": datetime.now(UTC) - timedelta(hours=1),
        },
        settings.secret_key,
        algorithm=settings.jwt_algorithm,
    )
    assert (
        await client.get(f"/api/media/pieces/{piece['id']}/audio?token={expired}")
    ).status_code == 404


async def test_a_login_token_is_not_a_media_token(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await make_piece(client, auth)
    login_token = auth["Authorization"].split()[1]
    response = await client.get(f"/api/media/pieces/{piece['id']}/audio?token={login_token}")
    assert response.status_code == 404


async def test_a_piece_without_a_cover_has_no_cover_to_fetch(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await published_piece(client, auth)
    assert (await client.get(f"/api/media/pieces/{piece['id']}/cover")).status_code == 404


async def test_the_media_route_only_serves_audio_and_cover(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await published_piece(client, auth)
    for kind in ("../audio", "secrets", "audio.php", "AUDIO"):
        response = await client.get(f"/api/media/pieces/{piece['id']}/{kind}")
        assert response.status_code in (404, 422), kind


# ----------------------------------------------------------------------- deleting


async def test_deleting_a_published_piece_removes_it_everywhere(
    client: AsyncClient, signup, storage: LocalStorage
):
    owner, fan = await signup("maker"), await signup("listener")
    piece = await published_piece(client, owner, cover=PNG)
    playlist = await fan_saves_everything(client, fan, piece["track_id"])
    assert len(list(storage.root.rglob("*.*"))) == 2

    assert (
        await client.delete(f"/api/studio/pieces/{piece['id']}", headers=owner)
    ).status_code == 204

    assert not any((await visible_everywhere(client)).values())
    assert (await client.get(f"/api/albums/{piece['album_id']}")).status_code == 404
    assert (await client.get("/api/library/favorites", headers=fan)).json() == []
    assert (await client.get("/api/library/recently-played", headers=fan)).json() == []
    detail = (await client.get(f"/api/playlists/{playlist['id']}", headers=fan)).json()
    assert detail["entries"] == [] and detail["track_count"] == 0
    assert (await client.get(f"/api/media/pieces/{piece['id']}/audio")).status_code == 404
    assert list(storage.root.rglob("*.*")) == []


async def test_deleting_a_hidden_piece_works_too(
    client: AsyncClient, signup, storage: LocalStorage
):
    auth = await signup("maker")
    piece = await published_piece(client, auth)
    await unpublish(client, auth, piece["id"])
    assert (
        await client.delete(f"/api/studio/pieces/{piece['id']}", headers=auth)
    ).status_code == 204
    assert list(storage.root.rglob("*.*")) == []


async def test_deleting_one_piece_leaves_the_others(client: AsyncClient, signup):
    auth = await signup("maker")
    keep = await published_piece(client, auth, title="Keeper")
    gone = await published_piece(client, auth, title="Goner")

    await client.delete(f"/api/studio/pieces/{gone['id']}", headers=auth)

    assert (await client.get(f"/api/tracks/{keep['track_id']}")).status_code == 200
    artist = (await client.get(f"/api/artists/{keep['artist_id']}")).json()
    assert [a["title"] for a in artist["albums"]] == ["Keeper"]


async def test_each_pieces_files_are_separate(client: AsyncClient, signup, storage: LocalStorage):
    auth = await signup("maker")
    first = await make_piece(client, auth, title="A")
    second = await make_piece(client, auth, title="B")
    await client.delete(f"/api/studio/pieces/{first['id']}", headers=auth)
    assert len(list(storage.root.rglob("*.wav"))) == 1
    assert (await client.get(second["audio_url"])).content == WAV


async def test_a_users_published_music_is_playable_by_other_users(client: AsyncClient, signup):
    owner, fan = await signup("maker"), await signup("listener")
    await published_piece(client, owner)
    [track] = await in_tracks(client)
    # What a player does: fetch the track URL as an ordinary listener, no special credentials.
    assert (await client.get(track["audio_url"], headers=fan)).content == WAV
    assert make_wav(1.0) == WAV  # the sample really is the deterministic fixture
