import itertools
import logging
from typing import Any

import httpx

from content_engine.jobs import JobRunner, Turn, parts_of
from content_engine.tts.providers import Dialogue, ProviderError, SilentFake, Speech


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

        def synthesize(self, text: str, voice_id: str, model_id: str | None = None) -> Speech:
            raise ProviderError("ElevenLabs answered 401", retryable=False)

        def dialogue(self, turns: list[tuple[str, str]], model_id: str) -> Dialogue:
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


def last_result(api: FakeApi) -> dict[str, Any]:
    variables = api.calls[-1][1]
    assert variables is not None
    result: dict[str, Any] = variables["result"]  # type: ignore[assignment]
    return result


CONVERSATION = {
    "id": "job-2",
    "type": "tts.generate",
    "claimToken": "token-2",
    "attempt": 1,
    "payload": {
        "mode": "conversation",
        "trackId": "t-2",
        "modelId": "eleven_v3",
        "maxPartCharacters": 100,
        "turns": [
            {"voiceId": "lauren", "text": "Hi, Max.", "blockId": "para-1", "offset": 7},
            {"voiceId": "roger", "text": "Hello, Kate! How's work?", "blockId": "para-2", "offset": 7},
            {"voiceId": "lauren", "text": "Busy.", "blockId": "para-3", "offset": 6},
        ],
    },
}


def test_a_conversation_is_one_file_with_each_turn_in_its_hosts_voice() -> None:
    asked: list[list[tuple[str, str]]] = []

    class Recording(SilentFake):
        def dialogue(self, turns: list[tuple[str, str]], model_id: str) -> Dialogue:
            asked.append(turns)
            assert model_id == "eleven_v3"
            return super().dialogue(turns, model_id)

    api = FakeApi(dict(CONVERSATION))
    runner = JobRunner(
        api, Recording(), logging.getLogger("t"), upload_transport=httpx.MockTransport(lambda _: httpx.Response(201))
    )
    assert runner.run_next() is True
    assert asked == [[("Hi, Max.", "lauren"), ("Hello, Kate! How's work?", "roger"), ("Busy.", "lauren")]]
    result = last_result(api)
    words = result["wordTimings"]
    # Offsets count the "HOST1: " label that wasn't read, so they point at the words in the lesson text.
    assert words[0] == {"blockId": "para-1", "start": 7, "end": 9, "startMs": 0, "endMs": 120}
    assert [w["blockId"] for w in words] == ["para-1", "para-1", "para-2", "para-2", "para-2", "para-2", "para-3"]
    assert all(a["startMs"] <= b["startMs"] for a, b in itertools.pairwise(words))


def test_long_conversations_are_sent_in_parts_and_their_timings_follow_on() -> None:
    sizes: list[int] = []

    class Counting(SilentFake):
        def dialogue(self, turns: list[tuple[str, str]], model_id: str) -> Dialogue:
            sizes.append(len(turns))
            return super().dialogue(turns, model_id)

    turns = [
        {"voiceId": "lauren" if i % 2 else "roger", "text": "x" * 60, "blockId": f"para-{i}", "offset": 7}
        for i in range(3)
    ]
    payload = {"mode": "conversation", "trackId": "t-2", "modelId": "eleven_v3", "maxPartCharacters": 100}
    job: dict[str, Any] = {**CONVERSATION, "payload": {**payload, "turns": turns}}
    api = FakeApi(job)
    JobRunner(
        api, Counting(), logging.getLogger("t"), upload_transport=httpx.MockTransport(lambda _: httpx.Response(201))
    ).run_next()
    assert sizes == [1, 1, 1]  # 60 + 60 > 100: one turn per part
    result = last_result(api)
    starts = [w["startMs"] for w in result["wordTimings"]]
    assert starts == sorted(starts) and starts[1] > 3000  # each part starts after the previous one ends
    assert result["durationMs"] >= starts[-1]


def test_parts_never_split_a_turn() -> None:
    turns = [Turn(voiceId="v", text="a" * n, blockId="b0001", offset=0) for n in (50, 40, 30, 200)]
    assert [len(p) for p in parts_of(turns, 100)] == [2, 1, 1]
