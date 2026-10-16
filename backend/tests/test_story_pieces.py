import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.storage import LocalStorage
from app.models import Story
from app.seed.seed import seed_catalog
from app.services.story_service import StoryService
from tests.samples import PNG, WAV


@pytest.fixture(autouse=True)
async def catalog(session: AsyncSession) -> None:
    await seed_catalog(session)


async def make_piece(
    client: AsyncClient, auth, *, title="Secret Demo", cover=None, description=None
):
    files = {"audio": ("demo.wav", WAV, "audio/wav")}
    if cover:
        files["cover"] = ("c.png", cover, "image/png")
    data = {"title": title}
    if description:
        data["description"] = description
    response = await client.post("/api/studio/pieces", files=files, data=data, headers=auth)
    assert response.status_code == 201, response.text
    return response.json()


async def share(client: AsyncClient, auth, piece_id: str, **extra):
    return await client.post("/api/stories", json={"piece_id": piece_id, **extra}, headers=auth)


async def follow(client: AsyncClient, follower, username: str):
    await client.put(f"/api/users/{username}/follow", headers=follower)


def token_exp(url: str) -> datetime:
    token = url.split("token=")[1]
    claims = jwt.decode(token, get_settings().secret_key, algorithms=["HS256"])
    return datetime.fromtimestamp(claims["exp"], UTC)


# -------------------------------------------------------------------- sharing


async def test_you_can_share_a_private_draft_to_your_story(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await make_piece(client, auth, cover=PNG)

    response = await share(client, auth, piece["id"], caption="  first listen  ")

    assert response.status_code == 201
    story = response.json()
    assert story["kind"] == "piece"
    assert story["caption"] == "first listen"
    assert story["track"] is None and story["album"] is None and story["artist"] is None
    assert story["preview_track"] is None
    assert story["piece"]["id"] == piece["id"]
    assert story["piece"]["title"] == "Secret Demo"
    assert story["piece"]["duration_sec"] == 1
    assert story["piece"]["cover_url"].startswith(f"/api/media/pieces/{piece['id']}/cover?token=")
    # A draft is not on the catalog, so there is nowhere to send people.
    assert story["piece"]["album_id"] is None and story["piece"]["artist_id"] is None
    assert story["preview"]["audio_url"].startswith(f"/api/media/pieces/{piece['id']}/audio?token=")
    assert story["preview"]["start_sec"] == 0  # a one-second clip plays from the top


async def test_you_can_only_share_your_own_pieces(client: AsyncClient, signup):
    owner, other = await signup("maker"), await signup("thief")
    piece = await make_piece(client, owner)

    stolen = await share(client, other, piece["id"])
    assert stolen.status_code == 404
    assert stolen.json() == {"detail": "Piece not found"}
    assert (await share(client, other, str(uuid.uuid4()))).status_code == 404
    assert (await client.get("/api/users/thief/stories", headers=other)).json() == []


async def test_exactly_one_subject_still_applies(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await make_piece(client, auth)
    track = (await client.get("/api/tracks", params={"limit": 1})).json()[0]

    both = await client.post(
        "/api/stories", json={"piece_id": piece["id"], "track_id": track["id"]}, headers=auth
    )
    assert both.status_code == 422
    assert (
        await client.post("/api/stories", json={"piece_id": "nope"}, headers=auth)
    ).status_code == 422


async def test_the_pieces_description_is_not_shared(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await make_piece(client, auth, description="private liner notes")
    story = (await share(client, auth, piece["id"])).json()
    assert "private liner notes" not in str(story)


# ----------------------------------------------------- who can hear a private piece


async def test_followers_can_watch_and_hear_it_but_strangers_cannot(client: AsyncClient, signup):
    maker, follower, stranger = await signup("maker"), await signup("fan"), await signup("passerby")
    await follow(client, follower, "maker")
    piece = await make_piece(client, maker)
    await share(client, maker, piece["id"])

    seen = (await client.get("/api/users/maker/stories", headers=follower)).json()
    assert [s["kind"] for s in seen] == ["piece"]
    audio = await client.get(seen[0]["preview"]["audio_url"])
    assert audio.status_code == 200 and audio.content == WAV

    assert (await client.get("/api/users/maker/stories", headers=stranger)).json() == []
    assert (await client.get("/api/users/maker/stories")).json() == []
    feed = (await client.get("/api/stories/feed", headers=stranger)).json()
    assert feed == []  # nothing for the stranger to be handed a link from


async def test_sharing_never_makes_the_audio_public(client: AsyncClient, signup):
    maker, follower = await signup("maker"), await signup("fan")
    await follow(client, follower, "maker")
    piece = await make_piece(client, maker, cover=PNG)
    await share(client, maker, piece["id"])

    # No token: still a 404, even though a story is live and a follower is signed in.
    for kind in ("audio", "cover"):
        bare = await client.get(f"/api/media/pieces/{piece['id']}/{kind}", headers=follower)
        assert bare.status_code == 404, kind
    # And it is not in the catalog.
    search = (await client.get("/api/search", params={"q": "Secret Demo"})).json()
    assert search["tracks"] == [] and search["albums"] == []


async def test_story_links_expire_with_the_story_and_within_the_hour(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await make_piece(client, auth, cover=PNG)
    story = (await share(client, auth, piece["id"])).json()
    story_end = datetime.fromisoformat(story["expires_at"])

    for url in (story["preview"]["audio_url"], story["piece"]["cover_url"]):
        expiry = token_exp(url)
        assert expiry <= story_end + timedelta(seconds=1)
        assert expiry - datetime.now(UTC) <= timedelta(
            seconds=get_settings().media_token_ttl_seconds + 2
        )


async def test_a_story_that_is_nearly_over_gets_a_short_lived_link(
    client: AsyncClient, signup, session: AsyncSession
):
    auth = await signup("maker")
    piece = await make_piece(client, auth)
    story = (await share(client, auth, piece["id"])).json()
    soon = datetime.now(UTC) + timedelta(minutes=2)
    await session.execute(
        text("UPDATE stories SET expires_at = :soon WHERE id = :id"),
        {"soon": soon, "id": uuid.UUID(story["id"])},
    )
    session.expire_all()

    [fresh] = (await client.get("/api/users/maker/stories", headers=auth)).json()
    assert token_exp(fresh["preview"]["audio_url"]) <= soon + timedelta(seconds=1)


async def test_a_link_for_one_piece_cannot_play_another(client: AsyncClient, signup):
    auth = await signup("maker")
    shared = await make_piece(client, auth, title="Shared")
    private = await make_piece(client, auth, title="Still Private")
    story = (await share(client, auth, shared["id"])).json()
    token = story["preview"]["audio_url"].split("token=")[1]

    other = await client.get(f"/api/media/pieces/{private['id']}/audio?token={token}")
    assert other.status_code == 404


# ----------------------------------------------------------- piece lifecycle


async def test_publishing_adds_links_to_the_catalog_for_story_viewers(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await make_piece(client, auth)
    await share(client, auth, piece["id"])
    published = (
        await client.post(
            f"/api/studio/pieces/{piece['id']}/publish",
            json={"rights_confirmed": True},
            headers=auth,
        )
    ).json()

    [story] = (await client.get("/api/users/maker/stories", headers=auth)).json()
    assert story["piece"]["album_id"] == published["album_id"]
    assert story["piece"]["artist_id"] == published["artist_id"]


async def test_unpublishing_leaves_a_story_the_owner_chose_to_share(client: AsyncClient, signup):
    maker, follower = await signup("maker"), await signup("fan")
    await follow(client, follower, "maker")
    piece = await make_piece(client, maker)
    await client.post(
        f"/api/studio/pieces/{piece['id']}/publish", json={"rights_confirmed": True}, headers=maker
    )
    await share(client, maker, piece["id"])
    await client.post(f"/api/studio/pieces/{piece['id']}/unpublish", headers=maker)

    [story] = (await client.get("/api/users/maker/stories", headers=follower)).json()
    assert story["piece"]["album_id"] is None  # nothing public to link to any more
    assert (
        await client.get(story["preview"]["audio_url"])
    ).status_code == 200  # but it still plays


async def test_deleting_the_piece_takes_its_stories_with_it(
    client: AsyncClient, signup, storage: LocalStorage
):
    auth = await signup("maker")
    piece = await make_piece(client, auth)
    story = (await share(client, auth, piece["id"])).json()

    await client.delete(f"/api/studio/pieces/{piece['id']}", headers=auth)

    assert (await client.get("/api/users/maker/stories", headers=auth)).json() == []
    assert (await client.get(story["preview"]["audio_url"])).status_code == 404
    assert list(storage.root.rglob("*.*")) == []


async def test_deleting_a_story_keeps_the_piece_and_its_files(
    client: AsyncClient, signup, storage: LocalStorage
):
    auth = await signup("maker")
    piece = await make_piece(client, auth)
    story = (await share(client, auth, piece["id"])).json()

    assert (await client.delete(f"/api/stories/{story['id']}", headers=auth)).status_code == 204

    assert (await client.get(f"/api/studio/pieces/{piece['id']}", headers=auth)).status_code == 200
    assert len(list(storage.root.rglob("*.wav"))) == 1


async def test_expired_piece_stories_vanish_and_are_purged(
    client: AsyncClient, signup, session: AsyncSession
):
    auth = await signup("maker")
    piece = await make_piece(client, auth)
    story = (await share(client, auth, piece["id"])).json()
    await session.execute(
        text(
            "UPDATE stories SET created_at = created_at - interval '30 hours', "
            "expires_at = expires_at - interval '30 hours' WHERE id = :id"
        ),
        {"id": uuid.UUID(story["id"])},
    )
    session.expire_all()

    assert (await client.get("/api/users/maker/stories", headers=auth)).json() == []
    assert await StoryService(session, get_settings()).purge_expired() == 1
    assert (await session.scalars(select(Story.id))).all() == []
    # The piece itself is untouched.
    assert (await client.get(f"/api/studio/pieces/{piece['id']}", headers=auth)).status_code == 200


async def test_piece_stories_appear_in_the_feed_with_other_kinds(client: AsyncClient, signup):
    maker, viewer = await signup("maker"), await signup("viewer")
    await follow(client, viewer, "maker")
    piece = await make_piece(client, maker)
    track = (await client.get("/api/tracks", params={"limit": 1})).json()[0]
    await client.post("/api/stories", json={"track_id": track["id"]}, headers=maker)
    await share(client, maker, piece["id"])

    [group] = (await client.get("/api/stories/feed", headers=viewer)).json()
    assert sorted(s["kind"] for s in group["stories"]) == ["piece", "track"]
    for story in group["stories"]:
        assert story["preview"] is not None  # every kind has something to play


async def test_existing_story_kinds_now_also_carry_a_preview(client: AsyncClient, signup):
    auth = await signup("maker")
    track = (await client.get("/api/tracks", params={"limit": 1})).json()[0]
    created = (
        await client.post("/api/stories", json={"track_id": track["id"]}, headers=auth)
    ).json()
    assert created["preview"] == {
        "audio_url": track["audio_url"],
        "start_sec": track["preview_start_sec"],
    }
    assert created["piece"] is None
