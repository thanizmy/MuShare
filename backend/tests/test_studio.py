import uuid
from io import BytesIO

import pytest
from httpx import AsyncClient
from PIL import Image

from app.core.config import get_settings
from app.core.ratelimit import get_upload_limiter
from app.core.storage import LocalStorage
from tests.samples import JPEG, NOT_AUDIO, PNG, WAV, make_image, make_mp3, make_silent_wav, make_wav


def stored(storage: LocalStorage, pattern: str = "*") -> list:
    return sorted(p for p in storage.root.rglob(pattern) if p.is_file())


async def upload(
    client: AsyncClient,
    auth,
    *,
    audio: bytes = WAV,
    filename: str = "my_song.wav",
    cover: bytes | None = None,
    **fields,
):
    files = {"audio": (filename, audio, "application/octet-stream")}
    if cover is not None:
        files["cover"] = ("cover.png", cover, "application/octet-stream")
    return await client.post("/api/studio/pieces", files=files, data=fields, headers=auth)


async def make_piece(client: AsyncClient, auth, **kwargs) -> dict:
    response = await upload(client, auth, **kwargs)
    assert response.status_code == 201, response.text
    return response.json()


# ----------------------------------------------------------------------- upload


async def test_upload_creates_a_private_draft(client: AsyncClient, signup, storage):
    auth = await signup("maker")
    response = await upload(client, auth, title="  First Sketch  ", description="  rough take ")

    assert response.status_code == 201
    piece = response.json()
    assert piece["title"] == "First Sketch"
    assert piece["description"] == "rough take"
    assert piece["status"] == "draft"
    assert piece["duration_sec"] == 1
    assert piece["audio_bytes"] == len(WAV)
    assert piece["cover_url"] is None
    assert piece["track_id"] is None and piece["album_id"] is None and piece["artist_id"] is None
    assert piece["published_at"] is None
    assert piece["audio_url"].startswith(f"/api/media/pieces/{piece['id']}/audio?token=")
    assert len(stored(storage, "*.wav")) == 1


async def test_title_defaults_to_the_files_own_title_then_its_name(client: AsyncClient, signup):
    auth = await signup("maker")
    tagged = await make_piece(client, auth, audio=make_mp3(title="From The Tag"), filename="x.mp3")
    assert tagged["title"] == "From The Tag"

    named = await make_piece(client, auth, filename="late_night_demo.wav")
    assert named["title"] == "late night demo"

    anonymous = await make_piece(client, auth, filename="_.wav")
    assert anonymous["title"] == "Untitled"


async def test_an_explicit_title_beats_the_file_tag(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await make_piece(
        client, auth, audio=make_mp3(title="Tag"), title="Mine", filename="a.mp3"
    )
    assert piece["title"] == "Mine"


async def test_mp3_uploads_are_stored_as_mp3(client: AsyncClient, signup, storage):
    auth = await signup("maker")
    piece = await make_piece(client, auth, audio=make_mp3(frames=200), filename="song.mp3")
    assert piece["duration_sec"] >= 5
    assert len(stored(storage, "*.mp3")) == 1


async def test_the_stored_name_comes_from_the_content_never_from_the_upload(
    client: AsyncClient, signup, storage
):
    auth = await signup("maker")
    # A hostile filename, and a wrong extension on real audio.
    await make_piece(client, auth, filename="../../etc/passwd.php", audio=WAV)
    [file] = stored(storage)
    assert file.suffix == ".wav"
    assert file.parent == storage.root / "audio"
    assert "passwd" not in file.name
    assert "php" not in file.name


async def test_cover_art_is_re_encoded_resized_and_stripped(client: AsyncClient, signup, storage):
    auth = await signup("maker")
    big = make_image("JPEG", size=(2400, 1200), exif=True)
    piece = await make_piece(client, auth, cover=big)

    assert piece["cover_url"].startswith(f"/api/media/pieces/{piece['id']}/cover?token=")
    [cover] = stored(storage, "*.jpg")
    data = cover.read_bytes()
    assert b"SecretCameraMaker" not in data
    image = Image.open(BytesIO(data))
    assert image.format == "JPEG" and max(image.size) == 1000


@pytest.mark.parametrize(
    ("audio", "message"),
    [
        (NOT_AUDIO, "isn't audio"),
        (b"plain text pretending to be a song", "isn't audio"),
        (PNG, "isn't audio"),
        (WAV[:40], None),
    ],
    ids=["executable", "text", "image", "truncated"],
)
async def test_non_audio_is_refused_and_stores_nothing(
    client: AsyncClient, signup, storage, audio, message
):
    auth = await signup("maker")
    response = await upload(client, auth, audio=audio, filename="song.mp3")

    assert response.status_code == 422
    if message:
        assert message in response.json()["detail"]
    assert stored(storage) == []
    assert (await client.get("/api/studio/pieces", headers=auth)).json() == []


async def test_over_long_audio_is_refused_with_a_clear_message(
    client: AsyncClient, signup, storage
):
    auth = await signup("maker")
    response = await upload(client, auth, audio=make_silent_wav(11 * 60))
    assert response.status_code == 422
    assert "10 minutes" in response.json()["detail"]
    assert stored(storage) == []


async def test_oversized_audio_is_refused_with_413(
    client: AsyncClient, signup, storage, monkeypatch
):
    monkeypatch.setattr(get_settings(), "studio_max_audio_bytes", 5_000)
    auth = await signup("maker")
    response = await upload(client, auth, audio=make_wav(3.0))  # ~48 KB
    assert response.status_code == 413
    assert "too large" in response.json()["detail"]
    assert stored(storage) == []


async def test_empty_files_are_refused(client: AsyncClient, signup):
    auth = await signup("maker")
    assert (await upload(client, auth, audio=b"")).status_code == 422


async def test_a_bad_cover_rejects_the_whole_upload_atomically(
    client: AsyncClient, signup, storage
):
    auth = await signup("maker")
    response = await upload(client, auth, cover=NOT_AUDIO)
    assert response.status_code == 422
    assert stored(storage) == []  # the good audio was not kept either
    assert (await client.get("/api/studio/pieces", headers=auth)).json() == []


async def test_oversized_cover_is_refused(client: AsyncClient, signup, monkeypatch):
    monkeypatch.setattr(get_settings(), "studio_max_cover_bytes", 500)
    auth = await signup("maker")
    assert (await upload(client, auth, cover=make_image("PNG", size=(300, 300)))).status_code == 413


async def test_upload_validates_text_fields_and_requires_a_file(client: AsyncClient, signup):
    auth = await signup("maker")
    assert (await upload(client, auth, title="x" * 121)).status_code == 422
    assert (await upload(client, auth, description="d" * 501)).status_code == 422
    missing = await client.post("/api/studio/pieces", data={"title": "no file"}, headers=auth)
    assert missing.status_code == 422


async def test_upload_requires_authentication(client: AsyncClient):
    response = await client.post("/api/studio/pieces", files={"audio": ("a.wav", WAV)})
    assert response.status_code == 401


# --------------------------------------------------------------- limits & quotas


async def test_piece_count_limit(client: AsyncClient, signup, monkeypatch):
    monkeypatch.setattr(get_settings(), "studio_max_pieces", 2)
    auth = await signup("maker")
    await make_piece(client, auth)
    await make_piece(client, auth)
    response = await upload(client, auth)
    assert response.status_code == 409
    assert "full" in response.json()["detail"]


async def test_total_storage_limit(client: AsyncClient, signup, monkeypatch):
    monkeypatch.setattr(get_settings(), "studio_max_total_bytes", int(len(WAV) * 1.5))
    auth = await signup("maker")
    await make_piece(client, auth)
    response = await upload(client, auth)
    assert response.status_code == 409
    assert "storage" in response.json()["detail"]


async def test_limits_are_per_person(client: AsyncClient, signup, monkeypatch):
    monkeypatch.setattr(get_settings(), "studio_max_pieces", 1)
    first, second = await signup("maker"), await signup("other_maker")
    await make_piece(client, first)
    assert (await upload(client, first)).status_code == 409
    assert (await upload(client, second)).status_code == 201


async def test_uploads_are_rate_limited_and_failures_count_too(
    client: AsyncClient, signup, monkeypatch
):
    monkeypatch.setattr(get_upload_limiter(), "max_attempts", 3)
    auth = await signup("maker")
    assert (await upload(client, auth)).status_code == 201
    assert (await upload(client, auth, audio=NOT_AUDIO)).status_code == 422  # still counted
    assert (await upload(client, auth)).status_code == 201

    blocked = await upload(client, auth)
    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) > 0
    # Someone else is unaffected.
    other = await signup("patient")
    assert (await upload(client, other)).status_code == 201


async def test_usage_reports_limits_and_consumption(client: AsyncClient, signup):
    auth = await signup("maker")
    empty = (await client.get("/api/studio/usage", headers=auth)).json()
    assert empty["pieces_used"] == 0 and empty["bytes_used"] == 0
    assert empty["pieces_limit"] == 25
    assert empty["max_audio_bytes"] == 30 * 1024 * 1024
    assert empty["max_duration_sec"] == 600
    assert "audio/mpeg" in empty["allowed_types"] and "audio/wav" in empty["allowed_types"]
    assert empty["artist_name"] is None

    await make_piece(client, auth)
    used = (await client.get("/api/studio/usage", headers=auth)).json()
    assert used["pieces_used"] == 1 and used["bytes_used"] == len(WAV)


# ------------------------------------------------------------------ reading


async def test_pieces_are_private_to_their_owner(client: AsyncClient, signup):
    owner, other = await signup("maker"), await signup("nosy")
    piece = await make_piece(client, owner)
    url = f"/api/studio/pieces/{piece['id']}"

    assert (await client.get("/api/studio/pieces", headers=other)).json() == []
    assert (await client.get(url, headers=other)).status_code == 404
    assert (await client.patch(url, json={"title": "stolen"}, headers=other)).status_code == 404
    assert (await client.delete(url, headers=other)).status_code == 404
    assert (await client.post(f"{url}/unpublish", headers=other)).status_code == 404
    publish = await client.post(f"{url}/publish", json={"rights_confirmed": True}, headers=other)
    assert publish.status_code == 404
    assert (await client.delete(f"{url}/cover", headers=other)).status_code == 404
    cover = await client.put(f"{url}/cover", files={"cover": ("c.png", PNG)}, headers=other)
    assert cover.status_code == 404

    # None of it touched the piece.
    assert (await client.get(url, headers=owner)).json()["title"] == "my song"


async def test_studio_requires_authentication(client: AsyncClient):
    for method, url in [
        ("GET", "/api/studio/pieces"),
        ("GET", "/api/studio/usage"),
        ("GET", f"/api/studio/pieces/{uuid.uuid4()}"),
        ("DELETE", f"/api/studio/pieces/{uuid.uuid4()}"),
        ("POST", f"/api/studio/pieces/{uuid.uuid4()}/publish"),
    ]:
        assert (await client.request(method, url)).status_code == 401, (method, url)


async def test_list_is_newest_first(client: AsyncClient, signup, session):
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import update

    from app.models import StudioPiece

    auth = await signup("maker")
    old = await make_piece(client, auth, title="Old")
    await make_piece(client, auth, title="New")
    await session.execute(
        update(StudioPiece)
        .where(StudioPiece.id == uuid.UUID(old["id"]))
        .values(created_at=datetime.now(UTC) - timedelta(days=1))
    )

    titles = [p["title"] for p in (await client.get("/api/studio/pieces", headers=auth)).json()]
    assert titles == ["New", "Old"]


async def test_unknown_and_malformed_ids(client: AsyncClient, signup):
    auth = await signup("maker")
    assert (await client.get(f"/api/studio/pieces/{uuid.uuid4()}", headers=auth)).status_code == 404
    assert (await client.get("/api/studio/pieces/not-a-uuid", headers=auth)).status_code == 422


# ------------------------------------------------------------------- editing


async def test_edit_title_and_description(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await make_piece(client, auth)
    url = f"/api/studio/pieces/{piece['id']}"

    edited = await client.patch(
        url, json={"title": " Better ", "description": " liner notes "}, headers=auth
    )
    assert edited.status_code == 200
    assert (edited.json()["title"], edited.json()["description"]) == ("Better", "liner notes")

    cleared = await client.patch(url, json={"description": ""}, headers=auth)
    assert cleared.json()["description"] is None
    assert cleared.json()["title"] == "Better"


async def test_edit_validation(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await make_piece(client, auth)
    url = f"/api/studio/pieces/{piece['id']}"
    for body in ({}, {"title": ""}, {"title": "   "}, {"title": None}, {"title": "x" * 121}):
        assert (await client.patch(url, json=body, headers=auth)).status_code == 422, body


async def test_replace_and_remove_cover_and_clean_up_old_files(
    client: AsyncClient, signup, storage
):
    auth = await signup("maker")
    piece = await make_piece(client, auth, cover=PNG)
    url = f"/api/studio/pieces/{piece['id']}/cover"
    [first_cover] = stored(storage, "*.jpg")

    replaced = await client.put(url, files={"cover": ("new.jpg", JPEG)}, headers=auth)
    assert replaced.status_code == 200 and replaced.json()["cover_url"]
    [second_cover] = stored(storage, "*.jpg")
    assert second_cover != first_cover  # the old file is gone, not orphaned

    removed = await client.delete(url, headers=auth)
    assert removed.status_code == 200 and removed.json()["cover_url"] is None
    assert stored(storage, "*.jpg") == []


async def test_add_a_cover_to_a_piece_that_had_none(client: AsyncClient, signup):
    auth = await signup("maker")
    piece = await make_piece(client, auth)
    response = await client.put(
        f"/api/studio/pieces/{piece['id']}/cover", files={"cover": ("c.png", PNG)}, headers=auth
    )
    assert response.json()["cover_url"]


async def test_a_bad_replacement_cover_keeps_the_old_one(client: AsyncClient, signup, storage):
    auth = await signup("maker")
    piece = await make_piece(client, auth, cover=PNG)
    [before] = stored(storage, "*.jpg")

    response = await client.put(
        f"/api/studio/pieces/{piece['id']}/cover",
        files={"cover": ("c.png", NOT_AUDIO)},
        headers=auth,
    )

    assert response.status_code == 422
    assert stored(storage, "*.jpg") == [before]
    assert (await client.get(f"/api/studio/pieces/{piece['id']}", headers=auth)).json()["cover_url"]


# ------------------------------------------------------------------- deleting


async def test_delete_removes_the_piece_and_its_files(client: AsyncClient, signup, storage):
    auth = await signup("maker")
    piece = await make_piece(client, auth, cover=PNG)
    assert len(stored(storage)) == 2

    assert (
        await client.delete(f"/api/studio/pieces/{piece['id']}", headers=auth)
    ).status_code == 204

    assert stored(storage) == []
    assert (await client.get(f"/api/studio/pieces/{piece['id']}", headers=auth)).status_code == 404
    assert (
        await client.delete(f"/api/studio/pieces/{piece['id']}", headers=auth)
    ).status_code == 404
    assert (await client.get("/api/studio/usage", headers=auth)).json()["pieces_used"] == 0


async def test_deleting_frees_room_for_new_uploads(client: AsyncClient, signup, monkeypatch):
    monkeypatch.setattr(get_settings(), "studio_max_pieces", 1)
    auth = await signup("maker")
    piece = await make_piece(client, auth)
    assert (await upload(client, auth)).status_code == 409
    await client.delete(f"/api/studio/pieces/{piece['id']}", headers=auth)
    assert (await upload(client, auth)).status_code == 201
