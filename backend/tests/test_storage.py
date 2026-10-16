import os
import uuid

import pytest
from fastapi import FastAPI
from fastapi.responses import FileResponse, Response
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.core.storage import LocalStorage, build_storage

DATA = bytes(range(256)) * 40  # 10,240 recognisable bytes


@pytest.fixture
def store(tmp_path) -> LocalStorage:
    return LocalStorage(tmp_path / "media")


async def test_put_exists_and_delete(store: LocalStorage):
    assert not await store.exists("audio/abc.wav")
    await store.put("audio/abc.wav", DATA, "audio/wav")
    assert await store.exists("audio/abc.wav")
    assert (store.root / "audio" / "abc.wav").read_bytes() == DATA

    await store.delete("audio/abc.wav")
    assert not await store.exists("audio/abc.wav")


async def test_delete_of_a_missing_file_is_harmless(store: LocalStorage):
    await store.delete("audio/never-existed.wav")


async def test_put_overwrites_atomically_and_leaves_no_temp_files(store: LocalStorage):
    await store.put("covers/a.jpg", b"first", "image/jpeg")
    await store.put("covers/a.jpg", b"second", "image/jpeg")
    assert (store.root / "covers" / "a.jpg").read_bytes() == b"second"
    assert [p.name for p in (store.root / "covers").iterdir()] == ["a.jpg"]


@pytest.mark.parametrize(
    "key",
    [
        "../escape.wav",
        "audio/../../escape.wav",
        "/etc/passwd",
        "audio//double.wav",
        "AUDIO/Upper.wav",
        "audio/with space.wav",
        "audio/back\\slash.wav",
        "",
        ".hidden",
    ],
)
async def test_unsafe_keys_are_refused_everywhere(store: LocalStorage, key: str):
    with pytest.raises(ValueError):
        await store.put(key, b"x", "audio/wav")
    with pytest.raises(ValueError):
        await store.exists(key)
    with pytest.raises(ValueError):
        await store.delete(key)
    with pytest.raises(ValueError):
        store.serve(key, "audio/wav")


async def test_a_symlink_cannot_lead_out_of_the_root(store: LocalStorage, tmp_path):
    outside = tmp_path / "outside.txt"
    outside.write_text("secret")
    link = store.root / "audio" / "link.wav"
    link.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.symlink(outside, link)
    except (OSError, NotImplementedError):
        pytest.skip("symlinks unavailable on this platform")
    with pytest.raises(ValueError):
        store.serve("audio/link.wav", "audio/wav")


async def test_serve_supports_range_requests(store: LocalStorage):
    await store.put("audio/clip.wav", DATA, "audio/wav")
    app = FastAPI()

    @app.get("/f")
    async def serve() -> Response:
        return store.serve("audio/clip.wav", "audio/wav")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        whole = await client.get("/f")
        assert whole.status_code == 200
        assert whole.content == DATA
        assert whole.headers["content-type"] == "audio/wav"
        assert whole.headers["accept-ranges"] == "bytes"

        part = await client.get("/f", headers={"Range": "bytes=100-199"})
        assert part.status_code == 206
        assert part.content == DATA[100:200]
        assert part.headers["content-range"] == f"bytes 100-199/{len(DATA)}"

        tail = await client.get("/f", headers={"Range": "bytes=-50"})
        assert tail.status_code == 206
        assert tail.content == DATA[-50:]


async def test_serve_returns_a_file_response(store: LocalStorage):
    await store.put("audio/x.wav", DATA, "audio/wav")
    assert isinstance(store.serve("audio/x.wav", "audio/wav"), FileResponse)


def test_backend_choice_follows_settings(tmp_path):
    base = {"database_url": "postgres://u:p@h/db", "secret_key": "x" * 40}
    local = build_storage(Settings(**base, media_root=str(tmp_path / "m")))
    assert isinstance(local, LocalStorage)
    with pytest.raises(RuntimeError, match="S3_BUCKET"):
        build_storage(Settings(**base, storage_backend="s3"))
    with pytest.raises(ValueError):
        Settings(**base, storage_backend="ftp")


# --------------------------------------------------------------- S3 (opt-in)
# Runs against a real S3-compatible server (SeaweedFS via `docker compose --profile s3 up -d s3`, or any bucket):
#   S3_TEST_ENDPOINT=http://127.0.0.1:9000 S3_TEST_BUCKET=mushare-test \
#   S3_TEST_ACCESS_KEY=mushare-dev S3_TEST_SECRET_KEY=mushare-dev-secret pytest tests/test_storage.py

S3_ENDPOINT = os.environ.get("S3_TEST_ENDPOINT")


@pytest.mark.skipif(not S3_ENDPOINT, reason="set S3_TEST_ENDPOINT to run against a real S3 store")
async def test_s3_storage_round_trip_and_range_via_presigned_redirect():
    settings = Settings(
        database_url="postgres://u:p@h/db",
        secret_key="x" * 40,
        storage_backend="s3",
        s3_bucket=os.environ["S3_TEST_BUCKET"],
        s3_endpoint_url=S3_ENDPOINT,
        s3_access_key_id=os.environ["S3_TEST_ACCESS_KEY"],
        s3_secret_access_key=os.environ["S3_TEST_SECRET_KEY"],
    )
    storage = build_storage(settings)
    key = f"audio/{uuid.uuid4().hex}.wav"

    assert not await storage.exists(key)
    await storage.put(key, DATA, "audio/wav")
    try:
        assert await storage.exists(key)

        redirect = storage.serve(key, "audio/wav")
        assert redirect.status_code == 307
        url = redirect.headers["location"]
        assert "X-Amz-Signature" in url  # time-limited, never a public object URL

        async with AsyncClient() as http:
            whole = await http.get(url)
            assert whole.status_code == 200 and whole.content == DATA
            assert whole.headers["content-type"] == "audio/wav"
            part = await http.get(url, headers={"Range": "bytes=10-19"})
            assert part.status_code == 206 and part.content == DATA[10:20]
    finally:
        await storage.delete(key)
    assert not await storage.exists(key)
