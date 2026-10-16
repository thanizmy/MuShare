"""Inspecting and sanitising uploaded files. Nothing here trusts a filename or a
browser-supplied content type: files are identified by what they actually contain."""

from dataclasses import dataclass
from io import BytesIO

from mutagen import File as MutagenFile
from PIL import Image, UnidentifiedImageError

from app.core.exceptions import AppError

# Decompression bombs are a real attack on image uploads: a tiny file that expands to gigabytes.
# Pillow only warns between its limit and twice it, so the pixel count is checked explicitly
# (before any pixel data is decoded) rather than relying on a warning filter.
COVER_MAX_PIXELS = 25_000_000
Image.MAX_IMAGE_PIXELS = COVER_MAX_PIXELS * 2

COVER_MAX_EDGE = 1000
_TOO_BIG_IMAGE = "Cover art must be a JPEG, PNG or WebP image under 25 megapixels."
COVER_FORMATS = {"JPEG", "PNG", "WEBP"}

# mutagen's detected type -> (what we serve it as, file extension we store it under)
AUDIO_TYPES: dict[str, tuple[str, str]] = {
    "MP3": ("audio/mpeg", "mp3"),
    "MP4": ("audio/mp4", "m4a"),
    "OggVorbis": ("audio/ogg", "ogg"),
    "OggOpus": ("audio/ogg", "ogg"),
    "WAVE": ("audio/wav", "wav"),
}
ALLOWED_AUDIO_LABEL = "MP3, M4A, OGG or WAV"


class InvalidUploadError(AppError):
    """The file isn't something we accept. Surfaces as 422 with a message for the person."""

    status_code = 422


@dataclass(frozen=True)
class AudioInfo:
    mime: str
    extension: str
    duration_sec: int
    tag_title: str | None


def inspect_audio(data: bytes, *, max_duration_sec: int) -> AudioInfo:
    """Identify the audio in `data` and measure it, or explain why it's refused."""
    try:
        parsed = MutagenFile(BytesIO(data))
    except Exception as exc:  # mutagen raises many unrelated error types on bad input
        raise InvalidUploadError(
            f"That file isn't audio we can read. Use {ALLOWED_AUDIO_LABEL}."
        ) from exc
    if parsed is None or parsed.info is None:
        raise InvalidUploadError(f"That file isn't audio we can read. Use {ALLOWED_AUDIO_LABEL}.")

    kind = type(parsed).__name__
    if kind not in AUDIO_TYPES:
        raise InvalidUploadError(f"That audio format isn't supported. Use {ALLOWED_AUDIO_LABEL}.")
    # MP4 also holds video and lossless ALAC, which browsers won't play as audio.
    if kind == "MP4" and not str(getattr(parsed.info, "codec", "")).startswith("mp4a"):
        raise InvalidUploadError("That MP4 isn't plain audio. Export it as AAC (M4A).")

    length = float(getattr(parsed.info, "length", 0) or 0)
    if length <= 0:
        raise InvalidUploadError("That file has no playable audio in it.")
    if length > max_duration_sec:
        raise InvalidUploadError(
            f"That piece is {round(length / 60, 1)} minutes long. The limit is "
            f"{max_duration_sec // 60} minutes."
        )

    mime, extension = AUDIO_TYPES[kind]
    return AudioInfo(
        mime=mime,
        extension=extension,
        duration_sec=max(1, round(length)),
        tag_title=_tag_title(data),
    )


def _tag_title(data: bytes) -> str | None:
    try:
        easy = MutagenFile(BytesIO(data), easy=True)
        titles = easy.get("title") if easy is not None else None
        title = (titles or [None])[0]
        return str(title).strip() or None if title else None
    except Exception:  # a missing or broken tag must never fail an upload
        return None


def process_cover(data: bytes) -> bytes:
    """Validate an image and re-encode it as a bounded JPEG.

    Re-encoding is the point: it discards EXIF/GPS metadata, any appended payload and anything
    that only pretended to be an image.
    """
    try:
        with Image.open(BytesIO(data)) as probe:
            if probe.format not in COVER_FORMATS:
                raise InvalidUploadError("Cover art must be a JPEG, PNG or WebP image.")
            if probe.width * probe.height > COVER_MAX_PIXELS:
                raise InvalidUploadError(_TOO_BIG_IMAGE)
            probe.verify()
        with Image.open(BytesIO(data)) as image:
            image.load()
            rgb = image.convert("RGB")
    except InvalidUploadError:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise InvalidUploadError(
            "Cover art must be a JPEG, PNG or WebP image under 25 megapixels."
        ) from None
    except Exception as exc:
        raise InvalidUploadError("That cover image couldn't be read.") from exc

    rgb.thumbnail((COVER_MAX_EDGE, COVER_MAX_EDGE))
    out = BytesIO()
    rgb.save(out, format="JPEG", quality=85, optimize=True, progressive=True)
    return out.getvalue()
