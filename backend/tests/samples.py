"""Small real files, generated in code, for upload tests."""

import math
import struct
import wave
from io import BytesIO

from mutagen.id3 import ID3, TIT2
from PIL import Image


def make_wav(seconds: float = 1.0, rate: int = 8000) -> bytes:
    """A mono 16-bit WAV containing a quiet sine tone."""
    frames = int(seconds * rate)
    samples = b"".join(
        struct.pack("<h", int(3000 * math.sin(2 * math.pi * 440 * i / rate))) for i in range(frames)
    )
    out = BytesIO()
    with wave.open(out, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(samples)
    return out.getvalue()


def make_silent_wav(seconds: float, rate: int = 8000) -> bytes:
    """A long, cheap WAV (8-bit mono silence) for duration-limit tests."""
    out = BytesIO()
    with wave.open(out, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(1)
        wav.setframerate(rate)
        wav.writeframes(b"\x80" * int(seconds * rate))
    return out.getvalue()


def make_mp3(frames: int = 40, title: str | None = None) -> bytes:
    """Valid MPEG-1 Layer III frames (128 kbps, 44.1 kHz, ~26 ms each), optionally tagged."""
    frame = b"\xff\xfb\x90\x00" + b"\x00" * 413  # 417 bytes
    body = frame * frames
    if title is None:
        return body
    tag = ID3()
    tag.add(TIT2(encoding=3, text=title))
    out = BytesIO()
    tag.save(out)
    return out.getvalue() + body


def make_image(fmt: str = "PNG", size: tuple[int, int] = (64, 64), exif: bool = False) -> bytes:
    image = Image.new("RGB", size, (200, 60, 120))
    out = BytesIO()
    kwargs: dict = {}
    if exif:
        data = Image.Exif()
        data[0x010F] = "SecretCameraMaker"  # Make
        data[0x013B] = "Someone Private"  # Artist
        kwargs["exif"] = data
    image.save(out, format=fmt, **kwargs)
    return out.getvalue()


WAV = make_wav()
PNG = make_image("PNG")
JPEG = make_image("JPEG")
NOT_AUDIO = b"MZ\x90\x00 this is an executable pretending to be music " * 20
