from io import BytesIO
from types import SimpleNamespace

import pytest
from PIL import Image

from app.services import media_processing
from app.services.media_processing import InvalidUploadError, inspect_audio, process_cover
from tests.samples import NOT_AUDIO, WAV, make_image, make_mp3, make_silent_wav, make_wav

MAX = 600


# ------------------------------------------------------------------------ audio


def test_wav_is_identified_and_measured():
    info = inspect_audio(make_wav(2.0), max_duration_sec=MAX)
    assert (info.mime, info.extension, info.duration_sec) == ("audio/wav", "wav", 2)
    assert info.tag_title is None


def test_mp3_is_identified_by_its_frames_not_by_a_name():
    info = inspect_audio(make_mp3(frames=80), max_duration_sec=MAX)
    assert (info.mime, info.extension) == ("audio/mpeg", "mp3")
    assert info.duration_sec >= 1


def test_mp3_title_tag_is_read():
    info = inspect_audio(make_mp3(title="Night Drive"), max_duration_sec=MAX)
    assert info.tag_title == "Night Drive"


@pytest.mark.parametrize(
    "data",
    [b"", b"\x00" * 100, NOT_AUDIO, b"just some text", b"<html></html>" * 50, make_image("PNG")],
    ids=["empty", "zeros", "executable", "text", "html", "an image"],
)
def test_things_that_are_not_audio_are_refused(data):
    with pytest.raises(InvalidUploadError, match="audio"):
        inspect_audio(data, max_duration_sec=MAX)


def test_a_truncated_audio_file_is_refused_cleanly():
    with pytest.raises(InvalidUploadError):
        inspect_audio(WAV[:30], max_duration_sec=MAX)


def test_over_long_pieces_are_refused_with_the_limit_in_the_message():
    with pytest.raises(InvalidUploadError, match=r"10 minutes"):
        inspect_audio(make_silent_wav(11 * 60), max_duration_sec=MAX)


def test_exactly_at_the_limit_is_allowed():
    info = inspect_audio(make_silent_wav(MAX), max_duration_sec=MAX)
    assert info.duration_sec == MAX


@pytest.mark.parametrize(
    ("kind", "mime", "extension"),
    [
        ("OggVorbis", "audio/ogg", "ogg"),
        ("OggOpus", "audio/ogg", "ogg"),
        ("MP4", "audio/mp4", "m4a"),
    ],
)
def test_other_supported_containers_map_to_the_right_type(monkeypatch, kind, mime, extension):
    parsed = type(kind, (), {})()
    parsed.info = SimpleNamespace(length=30.0, codec="mp4a.40.2")
    monkeypatch.setattr(media_processing, "MutagenFile", lambda *a, **k: parsed)
    info = inspect_audio(b"x", max_duration_sec=MAX)
    assert (info.mime, info.extension, info.duration_sec) == (mime, extension, 30)


def test_unsupported_audio_formats_are_named_in_the_refusal(monkeypatch):
    parsed = type("FLAC", (), {})()
    parsed.info = SimpleNamespace(length=30.0)
    monkeypatch.setattr(media_processing, "MutagenFile", lambda *a, **k: parsed)
    with pytest.raises(InvalidUploadError, match="isn't supported"):
        inspect_audio(b"x", max_duration_sec=MAX)


def test_mp4_that_is_not_plain_aac_is_refused(monkeypatch):
    parsed = type("MP4", (), {})()
    parsed.info = SimpleNamespace(length=30.0, codec="alac")
    monkeypatch.setattr(media_processing, "MutagenFile", lambda *a, **k: parsed)
    with pytest.raises(InvalidUploadError, match="AAC"):
        inspect_audio(b"x", max_duration_sec=MAX)


def test_a_parser_crash_becomes_a_clean_refusal(monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("parser exploded")

    monkeypatch.setattr(media_processing, "MutagenFile", boom)
    with pytest.raises(InvalidUploadError, match="isn't audio"):
        inspect_audio(b"x", max_duration_sec=MAX)


# ------------------------------------------------------------------------ covers


def reopen(data: bytes) -> Image.Image:
    return Image.open(BytesIO(data))


@pytest.mark.parametrize("fmt", ["PNG", "JPEG", "WEBP"])
def test_supported_images_become_jpegs(fmt):
    out = process_cover(make_image(fmt))
    assert out[:3] == b"\xff\xd8\xff"
    assert reopen(out).format == "JPEG"


def test_large_images_are_scaled_down_keeping_proportions():
    out = process_cover(make_image("PNG", size=(3000, 1500)))
    image = reopen(out)
    assert max(image.size) == 1000
    assert image.size == (1000, 500)


def test_small_images_are_not_enlarged():
    assert reopen(process_cover(make_image("PNG", size=(40, 30)))).size == (40, 30)


def test_exif_metadata_is_stripped():
    original = make_image("JPEG", exif=True)
    assert b"SecretCameraMaker" in original  # it really was in the upload
    out = process_cover(original)
    assert b"SecretCameraMaker" not in out
    assert b"Someone Private" not in out
    assert len(reopen(out).getexif()) == 0


def test_transparent_png_is_flattened():
    image = Image.new("RGBA", (20, 20), (255, 0, 0, 0))
    out = BytesIO()
    image.save(out, format="PNG")
    assert reopen(process_cover(out.getvalue())).mode == "RGB"


def test_appended_payload_does_not_survive_re_encoding():
    sneaky = make_image("PNG") + b"<?php system($_GET['c']); ?>"
    assert b"<?php" not in process_cover(sneaky)


@pytest.mark.parametrize(
    "data",
    [b"", b"not an image", NOT_AUDIO, WAV, make_image("GIF"), make_image("BMP")],
    ids=["empty", "text", "executable", "audio", "gif", "bmp"],
)
def test_non_images_and_unsupported_formats_are_refused(data):
    with pytest.raises(InvalidUploadError):
        process_cover(data)


def test_decompression_bombs_are_refused():
    # 6000 x 6000 = 36 megapixels: tiny on disk (it's one flat colour) but huge in memory.
    bomb = Image.new("L", (6000, 6000))
    out = BytesIO()
    bomb.save(out, format="PNG", optimize=True)
    assert len(out.getvalue()) < 100_000
    with pytest.raises(InvalidUploadError, match="megapixels"):
        process_cover(out.getvalue())


def test_truncated_image_is_refused():
    with pytest.raises(InvalidUploadError):
        process_cover(make_image("PNG")[:40])
