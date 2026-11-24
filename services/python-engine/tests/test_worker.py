import logging
import threading
import time
from pathlib import Path

from content_engine.config import load_settings
from content_engine.graphql_client import GraphQLTransportError
from content_engine.healthcheck import is_healthy
from content_engine.worker import Worker


class FakeClient:
    def __init__(self, *answers: object) -> None:
        self.answers = list(answers)
        self.calls = 0

    def execute(self, query: str, variables: dict[str, object] | None = None) -> dict[str, object]:
        self.calls += 1
        answer = self.answers.pop(0) if self.answers else {"health": {"status": "OK", "database": "OK"}}
        if isinstance(answer, Exception):
            raise answer
        assert isinstance(answer, dict)
        return answer


def make(tmp_path: Path, client: FakeClient, interval: float = 10) -> Worker:
    settings = load_settings(
        graphql_api_url="http://api.test",
        worker_heartbeat_file=tmp_path / "beat",
        worker_poll_interval_seconds=interval,
    )
    return Worker(client, settings, logging.getLogger("test"))


def test_beats_and_tracks_api_health(tmp_path: Path) -> None:
    worker = make(tmp_path, FakeClient({"health": {"status": "OK", "database": "OK"}}, GraphQLTransportError("x")))
    worker.run_once()
    assert worker.api_healthy
    assert is_healthy(tmp_path / "beat", 10)
    worker.run_once()  # API down: still beats, so Docker doesn't restart a worker that's only waiting
    assert not worker.api_healthy
    assert is_healthy(tmp_path / "beat", 10)


def test_stops_gracefully(tmp_path: Path) -> None:
    client = FakeClient()
    worker = make(tmp_path, client, interval=0.05)
    thread = threading.Thread(target=worker.run)
    thread.start()
    time.sleep(0.2)
    worker.stop()
    thread.join(timeout=2)
    assert not thread.is_alive()
    assert client.calls >= 2


def test_stale_or_missing_heartbeat_is_unhealthy(tmp_path: Path) -> None:
    beat = tmp_path / "beat"
    assert not is_healthy(beat, 10)
    beat.write_text(str(time.time() - 120))
    assert not is_healthy(beat, 10)
    beat.write_text("garbage")
    assert not is_healthy(beat, 10)
