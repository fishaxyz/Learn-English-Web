"""Claimed jobs and what to do with them. The worker reads and writes only through the API (AGENTS.md §3)."""

import contextlib
import hashlib
import logging
from typing import Any, Literal, Protocol
from urllib.parse import urlsplit, urlunsplit

import httpx
from pydantic import BaseModel, Field, ValidationError

from .graphql_client import GraphQLResponseError, GraphQLTransportError
from .questions.draft import draft_questions
from .tts.alignment import Block, WordTiming, turn_timings, word_timings
from .tts.providers import ProviderError, Speech, SpeechProvider, join_audio
from .vocab.llm import LanguageModel
from .vocab.suggest import suggest

CLAIM = "mutation Claim($types: [String!]!) { claimJob(types: $types) { id type payload claimToken attempt } }"
UPLOAD = """mutation Upload($job: ID!, $token: String!, $type: String!) {
  createJobUpload(jobId: $job, claimToken: $token, contentType: $type) { objectKey uploadUrl } }"""
COMPLETE = """mutation Complete($job: ID!, $token: String!, $result: JobPayload!) {
  completeJob(jobId: $job, claimToken: $token, result: $result) }"""
FAIL = """mutation Fail($job: ID!, $token: String!, $error: String!, $retryable: Boolean!) {
  failJob(jobId: $job, claimToken: $token, error: $error, retryable: $retryable) }"""

RENEW = """mutation Renew($job: ID!, $token: String!) { renewJobLease(jobId: $job, claimToken: $token) }"""

JOB_TYPES = ["tts.generate", "vocab.suggest", "questions.suggest"]


class Executor(Protocol):
    def execute(self, query: str, variables: dict[str, object] | None = None) -> dict[str, Any]: ...


class TtsPayload(BaseModel):
    """What the API asks for: one voice reading one text (validated here too, AGENTS.md §5.4)."""

    mode: Literal["single"] = "single"
    trackId: str
    voiceId: str = Field(min_length=1, max_length=100)
    modelId: str | None = Field(default=None, max_length=100)
    text: str = Field(min_length=1, max_length=10_000)
    blocks: list[Block]


class Turn(BaseModel):
    voiceId: str = Field(min_length=1, max_length=100)
    text: str = Field(min_length=1, max_length=5_000)
    blockId: str
    offset: int = Field(ge=0)


class ConversationPayload(BaseModel):
    """Two hosts taking turns: each turn read by its host's voice, all in one audio file."""

    mode: Literal["conversation"]
    trackId: str
    modelId: str = Field(min_length=1, max_length=100)
    maxPartCharacters: int = Field(default=2_000, ge=100, le=5_000)
    turns: list[Turn] = Field(min_length=1, max_length=1_000)


def parts_of(turns: list[Turn], limit: int) -> list[list[Turn]]:
    """Consecutive turns grouped so each request stays under the provider's limit (a turn is never split)."""
    parts: list[list[Turn]] = []
    size = 0
    for turn in turns:
        if parts and size + len(turn.text) <= limit:
            parts[-1].append(turn)
            size += len(turn.text)
        else:
            parts.append([turn])
            size = len(turn.text)
    return parts


class VocabPayload(BaseModel):
    """A script to find vocabulary in: its blocks' text, and the learners' level."""

    revisionId: str
    textHash: str
    level: Literal["A1", "A2", "B1", "B2", "C1", "C2"] | None = None
    blocks: list[dict[str, str]] = Field(max_length=500)


class Claimed(BaseModel):
    id: str
    type: str
    payload: dict[str, Any]
    claimToken: str
    attempt: int


class JobRunner:
    def __init__(
        self,
        client: Executor,
        provider: SpeechProvider,
        log: logging.Logger,
        upload_origin: str | None = None,
        upload_transport: httpx.BaseTransport | None = None,
        language_model: LanguageModel | None = None,
    ) -> None:
        self._client = client
        self._provider = provider
        self._model = language_model
        self._log = log
        self._upload_origin = upload_origin
        self._http = httpx.Client(timeout=120.0, transport=upload_transport)

    def run_next(self) -> bool:
        """Claims and runs one job. Returns whether there was one."""
        data = self._client.execute(CLAIM, {"types": JOB_TYPES})
        if not data.get("claimJob"):
            return False
        job = Claimed.model_validate(data["claimJob"])
        log = {"job": job.id, "type": job.type, "attempt": job.attempt}
        self._log.info("job claimed", extra=log)
        try:
            if job.type == "vocab.suggest":
                self._vocabulary(job)
            elif job.type == "questions.suggest":
                self._questions(job)
            elif job.type == "tts.generate":
                self._tts(job)
            else:
                raise ProviderError(f"unknown job type {job.type}", retryable=False)
            self._log.info("job done", extra=log)
        except ProviderError as error:
            self._fail(job, str(error), error.retryable)
        except ValidationError:
            self._fail(job, "invalid job payload", retryable=False)
        except (GraphQLTransportError, GraphQLResponseError, httpx.HTTPError) as error:
            self._fail(job, f"api: {type(error).__name__}", retryable=True)
        return True

    def _fail(self, job: Claimed, error: str, retryable: bool) -> None:
        self._log.warning("job failed", extra={"job": job.id, "retryable": retryable, "reason": error})
        # If even this fails, the lease runs out and the job is claimed again.
        with contextlib.suppress(GraphQLTransportError, GraphQLResponseError):
            self._client.execute(FAIL, {"job": job.id, "token": job.claimToken, "error": error, "retryable": retryable})

    def _upload_url(self, url: str) -> str:
        if not self._upload_origin:
            return url
        u, o = urlsplit(url), urlsplit(self._upload_origin)
        return urlunsplit((o.scheme, o.netloc, u.path, u.query, ""))

    def _vocabulary(self, job: Claimed) -> None:
        payload = VocabPayload.model_validate(job.payload)

        # The language model is slow on a CPU: keep the job claimed between paragraphs.
        def renew() -> None:
            self._client.execute(RENEW, {"job": job.id, "token": job.claimToken})

        result = suggest(payload.blocks, payload.level, self._model, self._log, keep_alive=renew)
        self._client.execute(COMPLETE, {"job": job.id, "token": job.claimToken, "result": result})

    def _questions(self, job: Claimed) -> None:
        payload = VocabPayload.model_validate(job.payload)

        def renew() -> None:
            self._client.execute(RENEW, {"job": job.id, "token": job.claimToken})

        result = draft_questions(payload.blocks, payload.level, self._model, self._log, keep_alive=renew)
        self._client.execute(COMPLETE, {"job": job.id, "token": job.claimToken, "result": result})

    def _tts(self, job: Claimed) -> None:
        if job.payload.get("mode") == "conversation":
            self._conversation(job, ConversationPayload.model_validate(job.payload))
            return
        payload = TtsPayload.model_validate(job.payload)
        speech = self._provider.synthesize(payload.text, payload.voiceId, payload.modelId)
        timings = word_timings(payload.text, payload.blocks, speech.alignment)
        self._finish(job, speech.audio, speech.mime_type, speech.duration_ms, speech.model_id, timings)

    def _conversation(self, job: Claimed, payload: ConversationPayload) -> None:
        speeches: list[Speech] = []
        timings: list[WordTiming] = []
        elapsed_ms = 0
        for part in parts_of(payload.turns, payload.maxPartCharacters):
            result = self._provider.dialogue([(t.text, t.voiceId) for t in part], payload.modelId)
            for turn, alignment in zip(part, result.turns, strict=True):
                timings.extend(turn_timings(turn.text, turn.blockId, turn.offset, alignment, elapsed_ms))
            speeches.append(result.speech)
            elapsed_ms += result.speech.duration_ms
        self._finish(job, join_audio(speeches), speeches[0].mime_type, elapsed_ms, payload.modelId, timings)

    def _finish(
        self,
        job: Claimed,
        audio: bytes,
        mime_type: str,
        duration_ms: int,
        model_id: str | None,
        timings: list[WordTiming],
    ) -> None:
        upload = self._client.execute(UPLOAD, {"job": job.id, "token": job.claimToken, "type": mime_type})
        target = upload["createJobUpload"]
        res = self._http.put(self._upload_url(target["uploadUrl"]), content=audio, headers={"content-type": mime_type})
        res.raise_for_status()
        result = {
            "objectKey": target["objectKey"],
            "mimeType": mime_type,
            "bytes": len(audio),
            "checksumSha256": hashlib.sha256(audio).hexdigest(),
            "durationMs": max(1, duration_ms),
            "modelId": model_id,
            "wordTimings": timings,
        }
        self._client.execute(COMPLETE, {"job": job.id, "token": job.claimToken, "result": result})
