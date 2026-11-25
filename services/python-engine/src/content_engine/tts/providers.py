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


@dataclass(frozen=True)
class Dialogue:
    """One part of a conversation: its audio, and for each turn sent, when its characters are spoken."""

    speech: Speech
    turns: list[Alignment | None]


class SpeechProvider(Protocol):
    name: str

    def synthesize(self, text: str, voice_id: str, model_id: str | None = None) -> Speech: ...

    def dialogue(self, turns: list[tuple[str, str]], model_id: str) -> Dialogue: ...


def split_alignment(whole: Alignment | None, texts: list[str]) -> list[Alignment | None]:
    """
    Cuts a dialogue's alignment into one per turn, finding each turn's text in order. A turn the provider read
    differently (its characters don't match) gets none: timings are never guessed.
    """
    if whole is None:
        return [None for _ in texts]
    spoken = "".join(whole.characters)
    out: list[Alignment | None] = []
    cursor = 0
    for text in texts:
        at = spoken.find(text, cursor)
        if at < 0:
            out.append(None)
            continue
        end = at + len(text)
        out.append(Alignment(whole.characters[at:end], whole.starts[at:end], whole.ends[at:end]))
        cursor = end
    return out


def _check_voice(voice_id: str) -> None:
    if not voice_id.replace("-", "").replace("_", "").isalnum():
        raise ProviderError("invalid voice id", retryable=False)


def _alignment_of(raw: dict[str, list[object]] | None) -> Alignment | None:
    raw = raw or {}
    chars = raw.get("characters") or []
    starts = raw.get("character_start_times_seconds") or []
    ends = raw.get("character_end_times_seconds") or []
    if not chars or len(chars) != len(starts) or len(chars) != len(ends):
        return None
    return Alignment([str(c) for c in chars], [float(str(x)) for x in starts], [float(str(x)) for x in ends])


# mp3_44100_128 is constant bit rate: 128 kbit/s, so 16 bytes are one millisecond.
MP3_BYTES_PER_MS = 16


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

    def _post(self, path: str, body: dict[str, object]) -> dict[str, object]:
        try:
            res = self._http.post(path, params={"output_format": "mp3_44100_128"}, json=body)
        except httpx.HTTPError as error:
            raise ProviderError(f"network: {type(error).__name__}", retryable=True) from None
        if res.status_code == 429 or res.status_code >= 500:
            raise ProviderError(f"ElevenLabs answered {res.status_code}", retryable=True)
        if res.is_error:
            # 401/403: key or permission; 400/422: the request (quota, voice, text, model). Retrying won't help.
            raise ProviderError(f"ElevenLabs answered {res.status_code}", retryable=False)
        data: dict[str, object] = res.json()
        return data

    @staticmethod
    def _audio(body: dict[str, object]) -> bytes:
        audio = base64.b64decode(str(body.get("audio_base64") or ""))
        if not audio:
            raise ProviderError("ElevenLabs returned no audio", retryable=True)
        return audio

    def synthesize(self, text: str, voice_id: str, model_id: str | None = None) -> Speech:
        _check_voice(voice_id)
        model = model_id or self._model_id
        body = self._post(f"/v1/text-to-speech/{voice_id}/with-timestamps", {"text": text, "model_id": model})
        audio = self._audio(body)
        alignment = _alignment_of(body.get("alignment"))  # type: ignore[arg-type]
        duration_ms = round(alignment.ends[-1] * 1000) if alignment and alignment.ends else 0
        return Speech(audio, "audio/mpeg", model, max(duration_ms, 1), alignment)

    def dialogue(self, turns: list[tuple[str, str]], model_id: str) -> Dialogue:
        """Several voices in one file (the text-to-dialogue endpoint: v3 models only)."""
        for _, voice_id in turns:
            _check_voice(voice_id)
        body = self._post(
            "/v1/text-to-dialogue/with-timestamps",
            {"inputs": [{"text": text, "voice_id": voice} for text, voice in turns], "model_id": model_id},
        )
        audio = self._audio(body)
        whole = _alignment_of(body.get("alignment"))  # type: ignore[arg-type]
        speech = Speech(audio, "audio/mpeg", model_id, max(1, len(audio) // MP3_BYTES_PER_MS), whole)
        return Dialogue(speech, split_alignment(whole, [text for text, _ in turns]))


class SilentFake:
    """Silent WAV audio with evenly spaced timings: for tests and for running without credits."""

    name = "fake"
    SECONDS_PER_CHARACTER = 0.06

    def synthesize(self, text: str, voice_id: str, model_id: str | None = None) -> Speech:
        seconds = max(1.0, len(text) * self.SECONDS_PER_CHARACTER)
        step = seconds / max(1, len(text))
        alignment = Alignment(
            list(text), [i * step for i in range(len(text))], [(i + 1) * step for i in range(len(text))]
        )
        return Speech(silent_wav(seconds), "audio/wav", None, round(seconds * 1000), alignment)

    def dialogue(self, turns: list[tuple[str, str]], model_id: str) -> Dialogue:
        """The turns one after another, with a short silence between them."""
        gap = 0.3
        chars: list[str] = []
        starts: list[float] = []
        ends: list[float] = []
        alignments: list[Alignment | None] = []
        clock = 0.0
        for text, _ in turns:
            first = len(chars)
            for ch in text:
                chars.append(ch)
                starts.append(clock)
                clock += self.SECONDS_PER_CHARACTER
                ends.append(clock)
            alignments.append(Alignment(chars[first:], starts[first:], ends[first:]))
            clock += gap
        seconds = max(1.0, clock)
        return Dialogue(
            Speech(silent_wav(seconds), "audio/wav", None, round(seconds * 1000), Alignment(chars, starts, ends)),
            alignments,
        )


def silent_wav(seconds: float) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(1)
        w.setframerate(8000)
        w.writeframes(bytes([128]) * int(8000 * seconds))  # 8-bit silence
    return buffer.getvalue()


def join_audio(parts: list[Speech]) -> bytes:
    """
    One file from parts of the same format: MP3 frames can follow one another; WAV parts are rewritten as one.
    """
    if parts[0].mime_type != "audio/wav":
        return b"".join(p.audio for p in parts)
    frames = []
    params = None
    for part in parts:
        with wave.open(io.BytesIO(part.audio), "rb") as r:
            params = params or r.getparams()
            frames.append(r.readframes(r.getnframes()))
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as w:
        assert params is not None
        w.setparams(params)
        w.writeframes(b"".join(frames))
    return buffer.getvalue()
