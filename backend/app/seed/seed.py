"""Idempotent catalog seeder.

    python -m app.seed.seed            # load the catalog
    python -m app.seed.seed --verify   # also confirm every audio URL is streamable

Rows get deterministic UUIDs (uuid5 over a stable key), so re-running updates in place
instead of duplicating.
"""

import argparse
import asyncio
import json
import uuid
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import dispose_engine, get_session_factory
from app.models import Album, Artist, Genre, Track, TrackGenre

SEED_FILE = Path(__file__).with_name("seed_data.json")
NAMESPACE = uuid.UUID("6f1c2d5e-4b7a-4a8e-9d3c-2b1a0c9e8f77")


def _id(*parts: str) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE, "/".join(parts))


def load_seed_data() -> dict[str, Any]:
    return json.loads(SEED_FILE.read_text(encoding="utf-8"))


async def seed_catalog(session: AsyncSession, data: dict[str, Any] | None = None) -> dict[str, int]:
    """Upsert the catalog into `session` (caller commits). Returns row counts."""
    data = data or load_seed_data()
    counts = {"genres": 0, "artists": 0, "albums": 0, "tracks": 0}

    genre_ids: dict[str, uuid.UUID] = {}
    for name in data["genres"]:
        genre_ids[name] = _id("genre", name)
        await session.merge(Genre(id=genre_ids[name], name=name))
        counts["genres"] += 1

    for artist in data["artists"]:
        artist_id = _id("artist", artist["key"])
        await session.merge(
            Artist(
                id=artist_id,
                name=artist["name"],
                bio=artist["bio"],
                image_url=artist["image_url"],
            )
        )
        counts["artists"] += 1
        await session.flush()

        for album in artist["albums"]:
            album_id = _id("album", artist["key"], album["key"])
            await session.merge(
                Album(
                    id=album_id,
                    title=album["title"],
                    artist_id=artist_id,
                    cover_url=album["cover_url"],
                    release_year=album["release_year"],
                )
            )
            counts["albums"] += 1
            await session.flush()

            for track in album["tracks"]:
                track_id = _id("track", artist["key"], album["key"], track["title"])
                await session.merge(
                    Track(
                        id=track_id,
                        title=track["title"],
                        album_id=album_id,
                        track_number=track["track_number"],
                        duration_sec=track["duration_sec"],
                        audio_url=track["audio_url"],
                        preview_start_sec=track["preview_start_sec"],
                    )
                )
                counts["tracks"] += 1
                await session.flush()
                for genre_name in track["genres"]:
                    await session.merge(
                        TrackGenre(track_id=track_id, genre_id=genre_ids[genre_name])
                    )

    await session.flush()
    return counts


async def verify_audio_urls(data: dict[str, Any] | None = None) -> list[str]:
    """Return the audio URLs that are not streamable audio."""
    data = data or load_seed_data()
    urls = sorted(
        {
            t["audio_url"]
            for a in data["artists"]
            for al in a["albums"]
            for t in al["tracks"]
        }
    )
    broken: list[str] = []
    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:

        async def check(url: str) -> None:
            try:
                resp = await client.get(url, headers={"Range": "bytes=0-1023"})
                ok = resp.status_code in (200, 206) and resp.headers.get(
                    "content-type", ""
                ).startswith("audio/")
            except httpx.HTTPError:
                ok = False
            if not ok:
                broken.append(url)

        await asyncio.gather(*(check(u) for u in urls))
    return sorted(broken)


async def _main(verify: bool) -> int:
    async with get_session_factory()() as session:
        counts = await seed_catalog(session)
        await session.commit()
    await dispose_engine()
    print("Seeded:", ", ".join(f"{v} {k}" for k, v in counts.items()))

    if verify:
        broken = await verify_audio_urls()
        if broken:
            print("Unreachable audio URLs:", *broken, sep="\n  ")
            return 1
        print("All audio URLs are streamable.")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed the MuShare catalog")
    parser.add_argument("--verify", action="store_true", help="check audio URLs over HTTP")
    raise SystemExit(asyncio.run(_main(parser.parse_args().verify)))
