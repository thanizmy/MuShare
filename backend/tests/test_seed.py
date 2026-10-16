from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Album, Artist, Genre, Track, TrackGenre
from app.seed.seed import load_seed_data, seed_catalog


async def _counts(session: AsyncSession) -> dict[str, int]:
    return {
        model.__tablename__: await session.scalar(select(func.count()).select_from(model))
        for model in (Artist, Album, Track, Genre, TrackGenre)
    }


async def test_seed_matches_data_file(session: AsyncSession):
    data = load_seed_data()
    expected_tracks = sum(len(al["tracks"]) for a in data["artists"] for al in a["albums"])

    await seed_catalog(session)
    counts = await _counts(session)

    assert counts["artists"] == len(data["artists"])
    assert counts["tracks"] == expected_tracks
    assert counts["genres"] == len(data["genres"])


async def test_seed_is_idempotent(session: AsyncSession):
    await seed_catalog(session)
    first = await _counts(session)
    await seed_catalog(session)
    assert await _counts(session) == first


async def test_every_seeded_track_is_playable_and_tagged(session: AsyncSession):
    await seed_catalog(session)
    tracks = (await session.scalars(select(Track))).all()
    assert tracks
    for track in tracks:
        assert track.audio_url.startswith("https://")
        assert 0 <= track.preview_start_sec < track.duration_sec

    untagged = await session.scalar(
        select(func.count())
        .select_from(Track)
        .where(~Track.id.in_(select(TrackGenre.track_id)))
    )
    assert untagged == 0
