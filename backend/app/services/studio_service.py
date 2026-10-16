import logging
import uuid
from datetime import UTC, datetime
from pathlib import PurePath

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.exceptions import ConflictError, NotFoundError
from app.core.media_tokens import media_path, sign_media_path
from app.core.storage import Storage
from app.models import Album, Artist, PieceStatus, StudioPiece, Track, User
from app.repositories.studio_repo import StudioRepository
from app.schemas.studio import PieceRead, PieceUpdate, PublishRequest, StudioUsage
from app.services.media_processing import (
    AUDIO_TYPES,
    inspect_audio,
    process_cover,
)

logger = logging.getLogger("mushare.studio")

NOT_FOUND = "Piece not found"
COVER_MIME = "image/jpeg"


def _title_from_filename(filename: str | None) -> str | None:
    if not filename:
        return None
    stem = PurePath(filename.replace("\\", "/")).stem.replace("_", " ").strip()
    return stem or None


class StudioService:
    def __init__(self, session: AsyncSession, settings: Settings, storage: Storage) -> None:
        self.session = session
        self.settings = settings
        self.storage = storage
        self.repo = StudioRepository(session)

    # ------------------------------------------------------------------ helpers
    async def _owned(self, user: User, piece_id: uuid.UUID, *, lock: bool = False) -> StudioPiece:
        """The caller's own piece. Anyone else's looks exactly like a missing one."""
        piece = await self.repo.get(piece_id, lock=lock)
        if piece is None or piece.owner_id != user.id:
            raise NotFoundError(NOT_FOUND)
        return piece

    def _read(self, piece: StudioPiece) -> PieceRead:
        track = piece.track
        return PieceRead(
            id=piece.id,
            title=piece.title,
            description=piece.description,
            status=piece.status,
            duration_sec=piece.duration_sec,
            audio_bytes=piece.audio_bytes,
            audio_url=sign_media_path(piece.id, "audio", self.settings),
            cover_url=sign_media_path(piece.id, "cover", self.settings)
            if piece.cover_key
            else None,
            created_at=piece.created_at,
            updated_at=piece.updated_at,
            published_at=piece.published_at,
            track_id=piece.track_id,
            album_id=track.album_id if track else None,
            artist_id=track.album.artist_id if track and track.album else None,
        )

    async def _discard_files(self, *keys: str | None) -> None:
        """Best-effort cleanup. A file we fail to remove is only wasted space, never an error
        for the person; the database no longer points at it."""
        for key in keys:
            if not key:
                continue
            try:
                await self.storage.delete(key)
            except Exception:
                logger.exception("Could not delete stored file %s", key)

    # --------------------------------------------------------------------- reads
    async def usage(self, user: User) -> StudioUsage:
        count, used = await self.repo.usage(user.id)
        artist = await self.repo.artist_for_owner(user.id)
        s = self.settings
        return StudioUsage(
            pieces_used=count,
            pieces_limit=s.studio_max_pieces,
            bytes_used=used,
            bytes_limit=s.studio_max_total_bytes,
            max_audio_bytes=s.studio_max_audio_bytes,
            max_cover_bytes=s.studio_max_cover_bytes,
            max_duration_sec=s.studio_max_duration_sec,
            allowed_types=sorted({mime for mime, _ in AUDIO_TYPES.values()}),
            artist_name=artist.name if artist else None,
        )

    async def list_pieces(self, user: User) -> list[PieceRead]:
        return [self._read(p) for p in await self.repo.list_for_owner(user.id)]

    async def get(self, user: User, piece_id: uuid.UUID) -> PieceRead:
        return self._read(await self._owned(user, piece_id))

    # ------------------------------------------------------------------- uploads
    async def upload(
        self,
        user: User,
        *,
        audio: bytes,
        filename: str | None,
        title: str | None,
        description: str | None,
        cover: bytes | None,
    ) -> PieceRead:
        s = self.settings
        count, used = await self.repo.usage(user.id)
        if count >= s.studio_max_pieces:
            raise ConflictError(
                f"Your studio is full ({s.studio_max_pieces} pieces). Delete one to upload another."
            )
        if used + len(audio) > s.studio_max_total_bytes:
            raise ConflictError("You're out of studio storage. Delete a piece to make room.")

        info = inspect_audio(audio, max_duration_sec=s.studio_max_duration_sec)
        cover_jpeg = process_cover(cover) if cover else None

        chosen = (title or "").strip() or info.tag_title or _title_from_filename(filename)
        piece_title = (chosen or "Untitled")[:120]

        audio_key = f"audio/{uuid.uuid4().hex}.{info.extension}"
        cover_key = f"covers/{uuid.uuid4().hex}.jpg" if cover_jpeg else None
        await self.storage.put(audio_key, audio, info.mime)
        if cover_key and cover_jpeg:
            await self.storage.put(cover_key, cover_jpeg, COVER_MIME)

        try:
            piece = await self.repo.add(
                StudioPiece(
                    owner_id=user.id,
                    title=piece_title,
                    description=(description or "").strip() or None,
                    audio_key=audio_key,
                    audio_mime=info.mime,
                    audio_bytes=len(audio),
                    duration_sec=info.duration_sec,
                    cover_key=cover_key,
                )
            )
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            await self._discard_files(audio_key, cover_key)
            raise
        return self._read(await self._owned(user, piece.id))

    # --------------------------------------------------------------------- edits
    async def update(self, user: User, piece_id: uuid.UUID, data: PieceUpdate) -> PieceRead:
        piece = await self._owned(user, piece_id, lock=True)
        fields = data.model_dump(exclude_unset=True)
        if "title" in fields:
            piece.title = fields["title"]
        if "description" in fields:
            piece.description = fields["description"]
        if "title" in fields and piece.track is not None:
            # The catalog entry follows the piece, whether it is live or hidden.
            piece.track.title = piece.title
            album = await self.repo.album_of_track(piece.track)
            if album is not None:
                album.title = piece.title
        await self.session.commit()
        return self._read(await self._owned(user, piece_id))

    async def set_cover(self, user: User, piece_id: uuid.UUID, cover: bytes) -> PieceRead:
        piece = await self._owned(user, piece_id, lock=True)
        cover_jpeg = process_cover(cover)
        old_key = piece.cover_key
        new_key = f"covers/{uuid.uuid4().hex}.jpg"
        await self.storage.put(new_key, cover_jpeg, COVER_MIME)
        piece.cover_key = new_key
        await self._sync_album_cover(piece)
        await self.session.commit()
        await self._discard_files(old_key)
        return self._read(await self._owned(user, piece_id))

    async def remove_cover(self, user: User, piece_id: uuid.UUID) -> PieceRead:
        piece = await self._owned(user, piece_id, lock=True)
        old_key = piece.cover_key
        piece.cover_key = None
        await self._sync_album_cover(piece)
        await self.session.commit()
        await self._discard_files(old_key)
        return self._read(await self._owned(user, piece_id))

    async def _sync_album_cover(self, piece: StudioPiece) -> None:
        if piece.track is None:
            return
        album = await self.repo.album_of_track(piece.track)
        if album is not None:
            album.cover_url = media_path(piece.id, "cover") if piece.cover_key else None

    # ---------------------------------------------------------- publish & unpublish
    async def publish(self, user: User, piece_id: uuid.UUID, data: PublishRequest) -> PieceRead:
        """Put the piece in the public catalog. Only the owner can, and only deliberately."""
        piece = await self._owned(user, piece_id, lock=True)
        now = datetime.now(UTC)

        artist = await self.repo.artist_for_owner(user.id)
        if artist is None:
            artist = Artist(
                owner_id=user.id,
                name=data.artist_name or user.username,
                image_url=user.avatar_url,
            )
            self.session.add(artist)
            await self.session.flush()
        elif data.artist_name:
            artist.name = data.artist_name

        if piece.track is None:
            # Built with relationships (not bare ids), so the in-memory objects are fully
            # linked and can be read straight away without another query.
            album = Album(
                title=piece.title,
                artist=artist,
                cover_url=media_path(piece.id, "cover") if piece.cover_key else None,
                release_year=now.year,
            )
            track = Track(
                title=piece.title,
                album=album,
                track_number=1,
                duration_sec=piece.duration_sec,
                audio_url=media_path(piece.id, "audio"),
                preview_start_sec=min(45, piece.duration_sec // 4),
            )
            self.session.add_all([album, track])
            await self.session.flush()
            piece.track = track
        else:
            # Republishing: the same catalog entry comes back, so playlists and favourites
            # that kept it as a placeholder light up again.
            piece.track.is_hidden = False
            album = await self.repo.album_of_track(piece.track)
            if album is not None:
                album.is_hidden = False

        piece.status = PieceStatus.PUBLISHED
        piece.published_at = now
        piece.rights_confirmed_at = now
        await self.session.commit()
        return self._read(await self._owned(user, piece_id))

    async def unpublish(self, user: User, piece_id: uuid.UUID) -> PieceRead:
        """Pull it from the catalog. It stays as a greyed-out "hidden by the artist" entry
        wherever other people saved it, and can be published again."""
        piece = await self._owned(user, piece_id, lock=True)
        if piece.status != PieceStatus.PUBLISHED or piece.track is None:
            raise ConflictError("This piece isn't published.")
        piece.track.is_hidden = True
        album = await self.repo.album_of_track(piece.track)
        if album is not None:
            album.is_hidden = True
        piece.status = PieceStatus.HIDDEN
        await self.session.commit()
        return self._read(await self._owned(user, piece_id))

    # -------------------------------------------------------------------- delete
    async def delete(self, user: User, piece_id: uuid.UUID) -> None:
        """Remove the piece for good, including its catalog entry and files. Unlike
        unpublishing, this also takes it out of other people's playlists and favourites."""
        piece = await self._owned(user, piece_id, lock=True)
        audio_key, cover_key = piece.audio_key, piece.cover_key
        album_id = piece.track.album_id if piece.track else None

        await self.repo.delete(piece)
        if album_id is not None:
            # Deleting the album removes its track, and with it favourites, playlist entries,
            # history and stories that pointed at it.
            await self.session.execute(delete(Album).where(Album.id == album_id))
        await self.session.commit()
        await self._discard_files(audio_key, cover_key)
