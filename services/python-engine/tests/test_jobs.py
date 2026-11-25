import logging
from typing import Any

import httpx

from content_engine.jobs import JobRunner
from content_engine.tts.providers import ProviderError, SilentFake, Speech


class FakeApi:
    """Answers the worker's GraphQL operations like the API would, and records what it was told."""

    def __init__(self, job: dict[str, Any] | None) -> None:
        self.job = job
        self.calls: list[tuple[str, dict[str, object] | None]] = []

    def execute(self, query: str, variables: dict[str, object] | None = None) -> dict[str, Any]:
        name = query.split()[1]
        self.calls.append((name, variables))
        if name.startswith("Claim"):
            job, self.job = self.job, None
            return {"claimJob": job}
        if name.startswith("Upload"):
            return {
                "createJobUpload": {
                    "objectKey": "site/audio/t-1.wav",
                    "uploadUrl": "http://localhost:4400/media/site/audio/t-1.wav?exp=1&sig=s",
                }
            }
        return {name.split("(")[0].lower() + "Job": True}


JOB = {
    "id": "job-1",
    "type": "tts.generate",
    "claimToken": "token-1",
    "attempt": 1,
    "payload": {
        "trackId": "t-1",
        "voiceId": "v1",
        "text": "Hi there.",
        "blocks": [{"blockId": "para-1", "start": 0, "length": 9}],
    },
}


def test_runs_a_voiceover_job_end_to_end() -> None:
    uploads: list[httpx.Request] = []

    def upload(request: httpx.Request) -> httpx.Response:
        uploads.append(request)
        return httpx.Response(201)

    api = FakeApi(dict(JOB))
    runner = JobRunner(
        api,
        SilentFake(),
        logging.getLogger("t"),
        upload_origin="http://api:4400",
        upload_transport=httpx.MockTransport(upload),
    )
    assert runner.run_next() is True
    # Uploaded to the API inside Docker, not the browser-facing address.
    assert str(uploads[0].url).startswith("http://api:4400/media/site/audio/t-1.wav?exp=1&sig=s")
    assert uploads[0].headers["content-type"] == "audio/wav"
    name, variables = api.calls[-1]
    assert name.startswith("Complete")
    assert variables is not None
    result = variables["result"]
    assert isinstance(result, dict)
    assert result["objectKey"] == "site/audio/t-1.wav" and result["mimeType"] == "audio/wav"
    assert [w["start"] for w in result["wordTimings"]] == [0, 3]
    assert runner.run_next() is False  # nothing left


def test_a_permanent_provider_error_fails_the_job_without_retrying() -> None:
    class Refusing:
        name = "refusing"

        def synthesize(self, text: str, voice_id: str) -> Speech:
            raise ProviderError("ElevenLabs answered 401", retryable=False)

    api = FakeApi(dict(JOB))
    JobRunner(api, Refusing(), logging.getLogger("t")).run_next()
    name, variables = api.calls[-1]
    assert name.startswith("Fail") and variables == {
        "job": "job-1",
        "token": "token-1",
        "error": "ElevenLabs answered 401",
        "retryable": False,
    }


def test_a_bad_payload_is_refused_not_retried() -> None:
    api = FakeApi({**JOB, "payload": {"trackId": "t-1"}})
    JobRunner(api, SilentFake(), logging.getLogger("t")).run_next()
    name, variables = api.calls[-1]
    assert name.startswith("Fail") and variables is not None and variables["retryable"] is False
