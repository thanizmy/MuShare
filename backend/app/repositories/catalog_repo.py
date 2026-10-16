import uuid
from collections.abc import Sequence

from sqlalchemy import ColumnElement, Select, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.models import Album, Artist, ListeningHistory, Track

_TRACK_LOAD = (
    joinedload(Track.album).joinedload(Album.artist),
    selectinload(Track.genres),
)


def escape_like(value: str) -> str:
    """Neutralise LIKE wildcards so user input is matched literally."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def artist_is_visible() -> ColumnElement[bool]:
    """Seeded artists always show. A user's own artist profile shows only while it has
    something public, so someone who has hidden everything doesn't linger as an empty page."""
    has_public_album = (
        exists().where(Album.artist_id == Artist.id, Album.is_hidden.is_(False)).correlate(Artist)
    )
    return or_(Artist.owner_id.is_(None), has_public_album)


class CatalogRepository:
    """Discovery queries. Everything here skips what an artist has hidden; the places that
    keep hidden items as placeholders (playlists, favourites, history) query on their own."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ----------------------------------------------------------------- tracks
    def _tracks(self) -> Select[tuple[Track]]:
        return select(Track).options(*_TRACK_LOAD).where(Track.is_hidden.is_(False))

    async def list_tracks(self, *, popular: bool, limit: int, offset: int) -> Sequence[Track]:
        stmt = self._tracks()
        if popular:
            plays = (
                select(ListeningHistory.track_id, func.count().label("plays"))
                .group_by(ListeningHistory.track_id)
                .subquery()
            )
            stmt = stmt.outerjoin(plays, plays.c.track_id == Track.id).order_by(
                func.coalesce(plays.c.plays, 0).desc(), Track.title, Track.id
            )
        else:
            stmt = stmt.order_by(Track.title, Track.id)
        rows = await self.session.scalars(stmt.limit(limit).offset(offset))
        return rows.unique().all()

    async def get_track(self, track_id: uuid.UUID) -> Track | None:
        rows = await self.session.scalars(self._tracks().where(Track.id == track_id))
        return rows.unique().first()

    async def tracks_for_album(self, album_id: uuid.UUID) -> Sequence[Track]:
        rows = await self.session.scalars(
            self._tracks().where(Track.album_id == album_id).order_by(Track.track_number, Track.id)
        )
        return rows.unique().all()

    async def top_tracks_for_artist(self, artist_id: uuid.UUID, limit: int) -> Sequence[Track]:
        plays = (
            select(ListeningHistory.track_id, func.count().label("plays"))
            .group_by(ListeningHistory.track_id)
            .subquery()
        )
        stmt = (
            self._tracks()
            .join(Album, Album.id == Track.album_id)
            .outerjoin(plays, plays.c.track_id == Track.id)
            .where(Album.artist_id == artist_id)
            .order_by(func.coalesce(plays.c.plays, 0).desc(), Track.title, Track.id)
            .limit(limit)
        )
        rows = await self.session.scalars(stmt)
        return rows.unique().all()

    async def album_exists(self, album_id: uuid.UUID) -> bool:
        found = await self.session.scalar(
            select(Album.id).where(Album.id == album_id, Album.is_hidden.is_(False))
        )
        return found is not None

    async def artist_exists(self, artist_id: uuid.UUID) -> bool:
        found = await self.session.scalar(
            select(Artist.id).where(Artist.id == artist_id, artist_is_visible())
        )
        return found is not None

    # ----------------------------------------------------------------- albums
    async def list_albums(self, *, limit: int, offset: int) -> Sequence[Album]:
        stmt = (
            select(Album)
            .options(joinedload(Album.artist))
            .where(Album.is_hidden.is_(False))
            .order_by(Album.release_year.desc().nulls_last(), Album.title, Album.id)
            .limit(limit)
            .offset(offset)
        )
        return (await self.session.scalars(stmt)).unique().all()

    async def get_album(self, album_id: uuid.UUID) -> Album | None:
        stmt = (
            select(Album)
            .options(joinedload(Album.artist))
            .where(Album.id == album_id, Album.is_hidden.is_(False))
        )
        return (await self.session.scalars(stmt)).unique().first()

    async def albums_for_artist(self, artist_id: uuid.UUID) -> Sequence[Album]:
        stmt = (
            select(Album)
            .options(joinedload(Album.artist))
            .where(Album.artist_id == artist_id, Album.is_hidden.is_(False))
            .order_by(Album.release_year.desc().nulls_last(), Album.title)
        )
        return (await self.session.scalars(stmt)).unique().all()

    # ---------------------------------------------------------------- artists
    async def list_artists(self, *, limit: int, offset: int) -> Sequence[Artist]:
        stmt = (
            select(Artist)
            .where(artist_is_visible())
            .order_by(Artist.name, Artist.id)
            .limit(limit)
            .offset(offset)
        )
        return (await self.session.scalars(stmt)).all()

    async def get_artist(self, artist_id: uuid.UUID) -> Artist | None:
        stmt = select(Artist).where(Artist.id == artist_id, artist_is_visible())
        return await self.session.scalar(stmt)

    # ----------------------------------------------------------------- search
    async def search_tracks(self, query: str, limit: int) -> Sequence[Track]:
        pattern = f"%{escape_like(query)}%"
        relevance = func.greatest(
            func.similarity(Track.title, query), func.similarity(Artist.name, query)
        )
        stmt = (
            self._tracks()
            .join(Album, Album.id == Track.album_id)
            .join(Artist, Artist.id == Album.artist_id)
            .where(
                or_(
                    Track.title.ilike(pattern, escape="\\"),
                    Artist.name.ilike(pattern, escape="\\"),
                    Track.title.op("%")(query),
                )
            )
            .order_by(relevance.desc(), Track.title, Track.id)
            .limit(limit)
        )
        return (await self.session.scalars(stmt)).unique().all()

    async def search_artists(self, query: str, limit: int) -> Sequence[Artist]:
        pattern = f"%{escape_like(query)}%"
        stmt = (
            select(Artist)
            .where(
                artist_is_visible(),
                or_(Artist.name.ilike(pattern, escape="\\"), Artist.name.op("%")(query)),
            )
            .order_by(func.similarity(Artist.name, query).desc(), Artist.name, Artist.id)
            .limit(limit)
        )
        return (await self.session.scalars(stmt)).all()

    async def search_albums(self, query: str, limit: int) -> Sequence[Album]:
        pattern = f"%{escape_like(query)}%"
        stmt = (
            select(Album)
            .options(joinedload(Album.artist))
            .join(Artist, Artist.id == Album.artist_id)
            .where(
                Album.is_hidden.is_(False),
                or_(
                    Album.title.ilike(pattern, escape="\\"),
                    Artist.name.ilike(pattern, escape="\\"),
                    Album.title.op("%")(query),
                ),
            )
            .order_by(func.similarity(Album.title, query).desc(), Album.title, Album.id)
            .limit(limit)
        )
        return (await self.session.scalars(stmt)).unique().all()
