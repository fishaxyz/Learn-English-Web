"""Speech providers behind one interface, so another vendor can be added without touching the job code."""

import base64
import io
import wave
from dataclasses import dataclass
from typing import Protocol

import httpx
from pydantic import SecretStr


@dataclass(frozen=True)
class Alignment:
    """When each character of the input is spoken, in seconds (one entry per character)."""

    characters: list[str]
    starts: list[float]
    ends: list[float]


@dataclass(frozen=True)
class Speech:
    audio: bytes
    mime_type: str
    model_id: str | None
    duration_ms: int
    alignment: Alignment | None


class ProviderError(Exception):
    """A provider failure. Retryable ones (rate limits, outages) are tried again later; others aren't."""

    def __init__(self, message: str, *, retryable: bool) -> None:
        super().__init__(message)
        self.retryable = retryable


class SpeechProvider(Protocol):
    name: str

    def synthesize(self, text: str, voice_id: str) -> Speech: ...


class ElevenLabs:
    """ElevenLabs text to speech, with character timings (the "with-timestamps" endpoint)."""

    name = "elevenlabs"

    def __init__(self, api_key: SecretStr, model_id: str, transport: httpx.BaseTransport | None = None) -> None:
        self._model_id = model_id
        self._http = httpx.Client(
            base_url="https://api.elevenlabs.io",
            headers={"xi-api-key": api_key.get_secret_value(), "content-type": "application/json"},
            timeout=httpx.Timeout(120.0, connect=10.0),
            transport=transport,
        )

    def synthesize(self, text: str, voice_id: str) -> Speech:
        if not voice_id.replace("-", "").replace("_", "").isalnum():
            raise ProviderError("invalid voice id", retryable=False)
        try:
            res = self._http.post(
                f"/v1/text-to-speech/{voice_id}/with-timestamps",
                params={"output_format": "mp3_44100_128"},
                json={"text": text, "model_id": self._model_id},
            )
        except httpx.HTTPError as error:
            raise ProviderError(f"network: {type(error).__name__}", retryable=True) from None
        if res.status_code == 429 or res.status_code >= 500:
            raise ProviderError(f"ElevenLabs answered {res.status_code}", retryable=True)
        if res.is_error:
            # 401/403: key or permission; 400/422: the request (quota, voice, text). Retrying won't help.
            raise ProviderError(f"ElevenLabs answered {res.status_code}", retryable=False)
        body = res.json()
        audio = base64.b64decode(body.get("audio_base64") or "")
        if not audio:
            raise ProviderError("ElevenLabs returned no audio", retryable=True)
        raw = body.get("alignment") or {}
        alignment = None
        if raw.get("characters") and len(raw["characters"]) == len(raw.get("character_start_times_seconds", [])):
            alignment = Alignment(
                characters=list(raw["characters"]),
                starts=[float(x) for x in raw["character_start_times_seconds"]],
                ends=[float(x) for x in raw["character_end_times_seconds"]],
            )
        duration_ms = round(alignment.ends[-1] * 1000) if alignment and alignment.ends else 0
        return Speech(audio, "audio/mpeg", self._model_id, max(duration_ms, 1), alignment)


class SilentFake:
    """Silent WAV audio with evenly spaced timings: for tests and for running without credits."""

    name = "fake"
    SECONDS_PER_CHARACTER = 0.06

    def synthesize(self, text: str, voice_id: str) -> Speech:
        seconds = max(1.0, len(text) * self.SECONDS_PER_CHARACTER)
        frames = int(8000 * seconds)
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(1)
            w.setframerate(8000)
            w.writeframes(bytes([128]) * frames)  # 8-bit silence
        step = seconds / max(1, len(text))
        alignment = Alignment(
            list(text), [i * step for i in range(len(text))], [(i + 1) * step for i in range(len(text))]
        )
        return Speech(buffer.getvalue(), "audio/wav", None, round(seconds * 1000), alignment)
