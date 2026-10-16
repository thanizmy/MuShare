import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.seed.seed import seed_catalog


@pytest.fixture(autouse=True)
async def catalog(session: AsyncSession) -> None:
    await seed_catalog(session)


async def profile(client: AsyncClient, username: str, headers=None) -> dict:
    response = await client.get(f"/api/users/{username}", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


# --------------------------------------------------------------------- profiles


async def test_profile_is_public_and_hides_private_fields(client: AsyncClient, signup):
    await signup("alice")
    body = await profile(client, "alice")  # no auth header

    assert body["username"] == "alice"
    assert body["follower_count"] == body["following_count"] == body["like_count"] == 0
    assert body["is_me"] is False and body["is_following"] is False and body["is_liked"] is False
    assert "email" not in body and "password_hash" not in body


async def test_profile_lookup_is_case_insensitive_and_404s(client: AsyncClient, signup):
    await signup("alice")
    assert (await profile(client, "ALICE"))["username"] == "alice"
    assert (await client.get("/api/users/nobody")).status_code == 404


async def test_is_me_for_own_profile(client: AsyncClient, signup):
    auth = await signup("alice")
    assert (await profile(client, "alice", auth))["is_me"] is True


async def test_update_own_profile(client: AsyncClient, signup):
    auth = await signup("alice")
    response = await client.patch(
        "/api/users/me",
        json={"bio": "  Synth enjoyer  ", "avatar_url": "https://img.example/a.png"},
        headers=auth,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["bio"] == "Synth enjoyer"
    assert body["avatar_url"] == "https://img.example/a.png"

    cleared = await client.patch("/api/users/me", json={"bio": "", "avatar_url": None}, headers=auth)
    assert cleared.json()["bio"] is None and cleared.json()["avatar_url"] is None


async def test_profile_update_validation(client: AsyncClient, signup):
    auth = await signup("alice")
    for body in (
        {},
        {"bio": "x" * 301},
        {"avatar_url": "http://insecure.example/a.png"},
        {"avatar_url": "javascript:alert(1)"},
        {"avatar_url": "https://"},
    ):
        response = await client.patch("/api/users/me", json=body, headers=auth)
        assert response.status_code == 422, body
    assert (await client.patch("/api/users/me", json={"bio": "x"})).status_code == 401


# ---------------------------------------------------------------------- follows


async def test_follow_and_unfollow_update_counts(client: AsyncClient, signup):
    alice, bob = await signup("alice"), await signup("bobby")

    followed = await client.put("/api/users/bobby/follow", headers=alice)
    assert followed.status_code == 200
    body = followed.json()
    assert body["is_following"] is True and body["follower_count"] == 1

    assert (await profile(client, "alice", alice))["following_count"] == 1
    # Follows are one-way: Bob does not follow Alice back.
    assert (await profile(client, "alice", bob))["is_following"] is False
    assert (await profile(client, "bobby", bob))["follower_count"] == 1

    gone = await client.delete("/api/users/bobby/follow", headers=alice)
    assert gone.json()["is_following"] is False and gone.json()["follower_count"] == 0


async def test_follow_calls_are_idempotent(client: AsyncClient, signup):
    alice = await signup("alice")
    await signup("bobby")
    for _ in range(2):
        assert (await client.put("/api/users/bobby/follow", headers=alice)).json()["follower_count"] == 1
    for _ in range(2):
        assert (await client.delete("/api/users/bobby/follow", headers=alice)).json()["follower_count"] == 0


async def test_cannot_follow_yourself_or_a_stranger_who_does_not_exist(client: AsyncClient, signup):
    alice = await signup("alice")
    own = await client.put("/api/users/alice/follow", headers=alice)
    assert own.status_code == 400
    assert "yourself" in own.json()["detail"]
    assert (await client.put("/api/users/ghost/follow", headers=alice)).status_code == 404


async def test_follow_requires_authentication(client: AsyncClient, signup):
    await signup("alice")
    assert (await client.put("/api/users/alice/follow")).status_code == 401
    assert (await client.delete("/api/users/alice/follow")).status_code == 401
    assert (await client.put("/api/users/alice/like")).status_code == 401


async def test_follower_and_following_lists(client: AsyncClient, signup):
    alice, bob, cara = await signup("alice"), await signup("bobby"), await signup("carol")
    await client.put("/api/users/carol/follow", headers=alice)
    await client.put("/api/users/carol/follow", headers=bob)
    await client.put("/api/users/bobby/follow", headers=alice)

    followers = (await client.get("/api/users/carol/followers", headers=alice)).json()
    assert sorted(u["username"] for u in followers) == ["alice", "bobby"]
    following = (await client.get("/api/users/alice/following", headers=cara)).json()
    assert sorted(u["username"] for u in following) == ["bobby", "carol"]

    # is_following reflects the *viewer*, not the list owner.
    by_name = {u["username"]: u for u in followers}
    assert by_name["alice"]["is_following"] is False  # Carol doesn't follow Alice
    seen_by_alice = {u["username"]: u for u in following}
    assert seen_by_alice["bobby"]["is_following"] is False  # viewer is Carol here
    as_alice = {u["username"]: u for u in (await client.get("/api/users/alice/following", headers=alice)).json()}
    assert as_alice["bobby"]["is_following"] is True and as_alice["carol"]["is_following"] is True

    assert (await client.get("/api/users/ghost/followers")).status_code == 404


async def test_lists_are_paginated_and_public(client: AsyncClient, signup):
    star = await signup("starr")
    names = ["fan_one", "fan_two", "fan_three"]
    for name in names:
        fan = await signup(name)
        await client.put("/api/users/starr/follow", headers=fan)

    page = (await client.get("/api/users/starr/followers", params={"limit": 2})).json()
    rest = (await client.get("/api/users/starr/followers", params={"limit": 2, "offset": 2})).json()
    assert len(page) == 2 and len(rest) == 1
    assert {u["username"] for u in page + rest} == set(names)
    assert all(u["is_following"] is False for u in page)  # anonymous viewer
    assert (await client.get("/api/users/starr/followers", params={"limit": 0})).status_code == 422
    del star


# ------------------------------------------------------------------------ likes


async def test_like_and_unlike_a_profile(client: AsyncClient, signup):
    alice, bob = await signup("alice"), await signup("bobby")

    liked = await client.put("/api/users/bobby/like", headers=alice)
    assert liked.json()["is_liked"] is True and liked.json()["like_count"] == 1
    assert (await profile(client, "bobby", bob))["like_count"] == 1
    assert (await profile(client, "bobby", bob))["is_liked"] is False

    again = await client.put("/api/users/bobby/like", headers=alice)
    assert again.json()["like_count"] == 1  # idempotent

    removed = await client.delete("/api/users/bobby/like", headers=alice)
    assert removed.json()["is_liked"] is False and removed.json()["like_count"] == 0


async def test_cannot_like_yourself(client: AsyncClient, signup):
    alice = await signup("alice")
    response = await client.put("/api/users/alice/like", headers=alice)
    assert response.status_code == 400


async def test_like_and_follow_are_independent(client: AsyncClient, signup):
    alice = await signup("alice")
    await signup("bobby")
    await client.put("/api/users/bobby/like", headers=alice)
    body = await profile(client, "bobby", alice)
    assert body["is_liked"] is True and body["is_following"] is False


# ----------------------------------------------------------------------- search


async def test_user_search(client: AsyncClient, signup):
    alice = await signup("alice_wonder")
    await signup("alicia_keys")
    await signup("bobby")
    await client.put("/api/users/alicia_keys/follow", headers=alice)

    found = (await client.get("/api/users/search", params={"q": "ali"}, headers=alice)).json()
    assert sorted(u["username"] for u in found) == ["alice_wonder", "alicia_keys"]
    flags = {u["username"]: u["is_following"] for u in found}
    assert flags == {"alice_wonder": False, "alicia_keys": True}

    anonymous = (await client.get("/api/users/search", params={"q": "BOB"})).json()
    assert [u["username"] for u in anonymous] == ["bobby"]
    assert "email" not in anonymous[0]


async def test_user_search_edge_cases(client: AsyncClient, signup):
    await signup("alice")
    assert (await client.get("/api/users/search", params={"q": "zzzzqq"})).json() == []
    assert (await client.get("/api/users/search", params={"q": "   "})).json() == []
    for q in ("%", "_", "\\"):
        assert (await client.get("/api/users/search", params={"q": q})).json() == []
    assert (await client.get("/api/users/search")).status_code == 422
    assert (await client.get("/api/users/search", params={"q": "x" * 51})).status_code == 422
    # "search" is a route, not a username.
    assert (await client.get("/api/users/search", params={"q": "alice"})).status_code == 200


# ----------------------------------------------------------------------- wrapped


async def tracks_by_artist(client: AsyncClient, artist_name: str) -> list[dict]:
    artists = (await client.get("/api/artists")).json()
    artist = next(a for a in artists if a["name"] == artist_name)
    return (await client.get(f"/api/artists/{artist['id']}")).json()["top_tracks"]


async def play(client: AsyncClient, headers, track_id: str, times: int, session=None) -> None:
    """Record plays, bypassing the API's duplicate-report window by writing rows directly."""
    from datetime import UTC, datetime, timedelta

    from app.models import ListeningHistory

    user_id = (await client.get("/api/auth/me", headers=headers)).json()["id"]
    for i in range(times):
        session.add(
            ListeningHistory(
                user_id=uuid.UUID(user_id),
                track_id=uuid.UUID(track_id),
                played_at=datetime.now(UTC) - timedelta(minutes=i),
            )
        )
    await session.flush()


async def test_wrapped_with_no_history_is_empty(client: AsyncClient, signup):
    await signup("quiet")
    body = (await client.get("/api/users/quiet/wrapped")).json()
    assert body["total_plays"] == 0 and body["total_minutes"] == 0
    assert body["top_artists"] == body["top_tracks"] == body["top_genres"] == []


async def test_wrapped_ranks_top_artists_tracks_and_genres(
    client: AsyncClient, signup, session: AsyncSession
):
    auth = await signup("listener")
    nova = await tracks_by_artist(client, "Nova Drift")
    kestrel = await tracks_by_artist(client, "Kestrel Run")
    await play(client, auth, nova[0]["id"], 3, session)
    await play(client, auth, nova[1]["id"], 2, session)
    await play(client, auth, kestrel[0]["id"], 4, session)

    body = (await client.get("/api/users/listener/wrapped")).json()

    assert body["total_plays"] == 9
    expected_seconds = 3 * nova[0]["duration_sec"] + 2 * nova[1]["duration_sec"] + 4 * kestrel[0]["duration_sec"]
    assert body["total_minutes"] == round(expected_seconds / 60)

    # Nova Drift: 5 plays across two tracks beats Kestrel Run's 4 on one.
    assert [(a["artist"]["name"], a["plays"]) for a in body["top_artists"]] == [
        ("Nova Drift", 5),
        ("Kestrel Run", 4),
    ]
    assert [t["plays"] for t in body["top_tracks"]] == [4, 3, 2]
    assert body["top_tracks"][0]["track"]["id"] == kestrel[0]["id"]
    assert body["top_tracks"][0]["track"]["album"]["artist"]["name"] == "Kestrel Run"

    genres = {g["genre"]: g["plays"] for g in body["top_genres"]}
    assert genres["Electronic"] == 5 and genres["Rock"] == 4
    assert body["top_genres"][0]["plays"] >= body["top_genres"][-1]["plays"]


async def test_wrapped_is_public_and_per_user(client: AsyncClient, signup, session: AsyncSession):
    auth = await signup("listener")
    other = await signup("someone")
    track = (await tracks_by_artist(client, "Nova Drift"))[0]
    await play(client, auth, track["id"], 2, session)

    anonymous = (await client.get("/api/users/listener/wrapped")).json()
    assert anonymous["total_plays"] == 2
    assert (await client.get("/api/users/someone/wrapped", headers=other)).json()["total_plays"] == 0
    assert (await client.get("/api/users/ghost/wrapped")).status_code == 404


async def test_wrapped_limit_and_period(client: AsyncClient, signup, session: AsyncSession):
    from datetime import UTC, datetime, timedelta

    from app.models import ListeningHistory

    auth = await signup("listener")
    user_id = uuid.UUID((await client.get("/api/auth/me", headers=auth)).json()["id"])
    tracks = (await client.get("/api/tracks", params={"limit": 8})).json()

    old = datetime.now(UTC) - timedelta(days=90)
    for t in tracks[:6]:
        session.add(ListeningHistory(user_id=user_id, track_id=uuid.UUID(t["id"]), played_at=old))
    session.add(
        ListeningHistory(user_id=user_id, track_id=uuid.UUID(tracks[7]["id"]), played_at=datetime.now(UTC))
    )
    await session.flush()

    everything = (await client.get("/api/users/listener/wrapped", params={"limit": 3})).json()
    assert everything["total_plays"] == 7
    assert len(everything["top_tracks"]) == 3  # capped by limit

    recent = (await client.get("/api/users/listener/wrapped", params={"period": "30d"})).json()
    assert recent["period"] == "30d"
    assert recent["total_plays"] == 1
    assert [t["track"]["id"] for t in recent["top_tracks"]] == [tracks[7]["id"]]


async def test_wrapped_validates_parameters(client: AsyncClient, signup):
    await signup("listener")
    url = "/api/users/listener/wrapped"
    for params in ({"period": "decade"}, {"limit": 0}, {"limit": 11}):
        assert (await client.get(url, params=params)).status_code == 422, params


async def test_deleting_data_does_not_leak_between_users(
    client: AsyncClient, signup, session: AsyncSession
):
    a, b = await signup("first"), await signup("second")
    track = (await tracks_by_artist(client, "Nova Drift"))[0]
    await play(client, a, track["id"], 5, session)
    await play(client, b, track["id"], 1, session)

    assert (await client.get("/api/users/first/wrapped")).json()["total_plays"] == 5
    assert (await client.get("/api/users/second/wrapped")).json()["total_plays"] == 1
