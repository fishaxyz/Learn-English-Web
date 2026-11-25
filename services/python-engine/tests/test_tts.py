import base64
import io
import json
import wave

import httpx
import pytest
from pydantic import SecretStr

from content_engine.tts.alignment import word_timings
from content_engine.tts.providers import Alignment, ElevenLabs, ProviderError, SilentFake


def even(text: str, step: float = 0.1) -> Alignment:
    return Alignment(list(text), [i * step for i in range(len(text))], [(i + 1) * step for i in range(len(text))])


def test_word_timings_per_block_in_code_points() -> None:
    text = "Zoë 🚆 don\u2019t go.\n\nRush-hour now."  # a curly apostrophe
    blocks = [{"blockId": "para-1", "start": 0, "length": 15}, {"blockId": "para-2", "start": 17, "length": 14}]
    timings = word_timings(text, blocks, even(text))  # type: ignore[arg-type]
    assert [(t["blockId"], t["start"], t["end"]) for t in timings] == [
        ("para-1", 0, 3),  # Zoë
        ("para-1", 6, 11),  # don't, curly (the emoji counts as one code point)
        ("para-1", 12, 14),  # go
        ("para-2", 0, 9),  # Rush-hour
        ("para-2", 10, 13),  # now
    ]
    assert timings[0]["startMs"] == 0 and timings[0]["endMs"] == 300


def test_no_timings_rather_than_wrong_ones() -> None:
    text = "Hello there."
    assert word_timings(text, [{"blockId": "para-1", "start": 0, "length": 12}], None) == []
    shifted = even("Hello there!")  # the provider's characters don't match what we sent
    assert word_timings(text, [{"blockId": "para-1", "start": 0, "length": 12}], shifted) == []


def test_elevenlabs_request_and_alignment() -> None:
    seen: dict[str, object] = {}

    def handle(request: httpx.Request) -> httpx.Response:
        seen["path"] = request.url.path
        seen["format"] = request.url.params.get("output_format")
        seen["key"] = request.headers.get("xi-api-key")
        seen["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "audio_base64": base64.b64encode(b"mp3-bytes").decode(),
                "alignment": {
                    "characters": ["H", "i"],
                    "character_start_times_seconds": [0.0, 0.2],
                    "character_end_times_seconds": [0.2, 0.45],
                },
            },
        )

    provider = ElevenLabs(SecretStr("test-key"), "eleven_multilingual_v2", transport=httpx.MockTransport(handle))
    speech = provider.synthesize("Hi", "voice123")
    assert seen == {
        "path": "/v1/text-to-speech/voice123/with-timestamps",
        "format": "mp3_44100_128",
        "key": "test-key",
        "body": {"text": "Hi", "model_id": "eleven_multilingual_v2"},
    }
    assert speech.audio == b"mp3-bytes" and speech.mime_type == "audio/mpeg"
    assert speech.duration_ms == 450
    assert speech.alignment is not None and speech.alignment.characters == ["H", "i"]


@pytest.mark.parametrize(("status", "retryable"), [(429, True), (503, True), (401, False), (422, False)])
def test_elevenlabs_errors_say_whether_to_retry(status: int, retryable: bool) -> None:
    provider = ElevenLabs(SecretStr("k"), "m", transport=httpx.MockTransport(lambda _: httpx.Response(status)))
    with pytest.raises(ProviderError) as error:
        provider.synthesize("Hi", "voice123")
    assert error.value.retryable is retryable


def test_silent_fake_makes_real_wav_audio_with_timings() -> None:
    speech = SilentFake().synthesize("Hello there.", "any")
    with wave.open(io.BytesIO(speech.audio)) as w:
        assert w.getframerate() == 8000 and w.getnframes() > 0
    assert speech.mime_type == "audio/wav"
    assert speech.alignment is not None and len(speech.alignment.characters) == len("Hello there.")
