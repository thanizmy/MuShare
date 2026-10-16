import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models import Album, Artist, StudioPiece, Track


class StudioRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_for_owner(self, owner_id: uuid.UUID) -> Sequence[StudioPiece]:
        stmt = (
            select(StudioPiece)
            .where(StudioPiece.owner_id == owner_id)
            .options(joinedload(StudioPiece.track).joinedload(Track.album))
            .order_by(StudioPiece.created_at.desc(), StudioPiece.id)
        )
        return (await self.session.scalars(stmt)).unique().all()

    async def get(self, piece_id: uuid.UUID, *, lock: bool = False) -> StudioPiece | None:
        stmt = (
            select(StudioPiece)
            .where(StudioPiece.id == piece_id)
            .options(joinedload(StudioPiece.track).joinedload(Track.album))
        )
        if lock:
            # Row lock on the piece itself (not the joined track) so edits and publishes queue up.
            stmt = stmt.with_for_update(of=StudioPiece)
        return (await self.session.scalars(stmt)).unique().first()

    async def add(self, piece: StudioPiece) -> StudioPiece:
        self.session.add(piece)
        await self.session.flush()
        return piece

    async def delete(self, piece: StudioPiece) -> None:
        await self.session.delete(piece)
        await self.session.flush()

    async def usage(self, owner_id: uuid.UUID) -> tuple[int, int]:
        """(number of pieces, total audio bytes) for one owner."""
        row = (
            await self.session.execute(
                select(func.count(), func.coalesce(func.sum(StudioPiece.audio_bytes), 0)).where(
                    StudioPiece.owner_id == owner_id
                )
            )
        ).one()
        return row[0], int(row[1])

    # ------------------------------------------------------- catalog counterparts
    async def artist_for_owner(self, owner_id: uuid.UUID) -> Artist | None:
        return await self.session.scalar(select(Artist).where(Artist.owner_id == owner_id))

    async def album_of_track(self, track: Track) -> Album | None:
        return await self.session.get(Album, track.album_id)
