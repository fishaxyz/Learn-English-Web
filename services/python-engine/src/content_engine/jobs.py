"""Claimed jobs and what to do with them. The worker reads and writes only through the API (AGENTS.md §3)."""

import contextlib
import hashlib
import logging
from typing import Any, Protocol
from urllib.parse import urlsplit, urlunsplit

import httpx
from pydantic import BaseModel, Field, ValidationError

from .graphql_client import GraphQLResponseError, GraphQLTransportError
from .tts.alignment import Block, word_timings
from .tts.providers import ProviderError, SpeechProvider

CLAIM = "mutation Claim($types: [String!]!) { claimJob(types: $types) { id type payload claimToken attempt } }"
UPLOAD = """mutation Upload($job: ID!, $token: String!, $type: String!) {
  createJobUpload(jobId: $job, claimToken: $token, contentType: $type) { objectKey uploadUrl } }"""
COMPLETE = """mutation Complete($job: ID!, $token: String!, $result: JobPayload!) {
  completeJob(jobId: $job, claimToken: $token, result: $result) }"""
FAIL = """mutation Fail($job: ID!, $token: String!, $error: String!, $retryable: Boolean!) {
  failJob(jobId: $job, claimToken: $token, error: $error, retryable: $retryable) }"""

JOB_TYPES = ["tts.generate"]


class Executor(Protocol):
    def execute(self, query: str, variables: dict[str, object] | None = None) -> dict[str, Any]: ...


class TtsPayload(BaseModel):
    """What the API asks for: one voice reading one text (validated here too, AGENTS.md §5.4)."""

    trackId: str
    voiceId: str = Field(min_length=1, max_length=100)
    text: str = Field(min_length=1, max_length=10_000)
    blocks: list[Block]


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
    ) -> None:
        self._client = client
        self._provider = provider
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
            if job.type != "tts.generate":
                raise ProviderError(f"unknown job type {job.type}", retryable=False)
            self._tts(job)
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

    def _tts(self, job: Claimed) -> None:
        payload = TtsPayload.model_validate(job.payload)
        speech = self._provider.synthesize(payload.text, payload.voiceId)
        upload = self._client.execute(UPLOAD, {"job": job.id, "token": job.claimToken, "type": speech.mime_type})
        target = upload["createJobUpload"]
        res = self._http.put(
            self._upload_url(target["uploadUrl"]), content=speech.audio, headers={"content-type": speech.mime_type}
        )
        res.raise_for_status()
        result = {
            "objectKey": target["objectKey"],
            "mimeType": speech.mime_type,
            "bytes": len(speech.audio),
            "checksumSha256": hashlib.sha256(speech.audio).hexdigest(),
            "durationMs": speech.duration_ms,
            "modelId": speech.model_id,
            "wordTimings": word_timings(payload.text, payload.blocks, speech.alignment),
        }
        self._client.execute(COMPLETE, {"job": job.id, "token": job.claimToken, "result": result})
