"""The polling worker. Phase 0: it only checks the API and keeps a heartbeat; jobs arrive in Phase 4."""

import logging
import signal
import threading
import time
from pathlib import Path
from types import FrameType
from typing import Protocol

from .config import Settings, SettingsError, load_settings
from .graphql_client import GraphQLClient, GraphQLResponseError, GraphQLTransportError
from .logs import setup_logging

HEALTH_QUERY = "query WorkerHealth { health { status database } }"


class Executor(Protocol):
    def execute(self, query: str, variables: dict[str, object] | None = None) -> dict[str, object]: ...


class Worker:
    def __init__(self, client: Executor, settings: Settings, log: logging.Logger) -> None:
        self._client = client
        self._settings = settings
        self._log = log
        self._stop = threading.Event()
        self.api_healthy = False
        self._first = True

    def run_once(self) -> None:
        """One loop: check the API, then beat. The heartbeat shows the loop is alive, healthy API or not."""
        reason = None
        try:
            data = self._client.execute(HEALTH_QUERY)
            health = data.get("health")
            healthy = isinstance(health, dict) and health.get("status") == "OK"
        except (GraphQLTransportError, GraphQLResponseError) as error:
            healthy, reason = False, str(error)
        # Log changes only, so a long outage is one line, not one per loop.
        if healthy != self.api_healthy or self._first:
            level = logging.INFO if healthy else logging.WARNING
            self._log.log(level, "api status", extra={"api": "ok" if healthy else "down", "reason": reason})
        self._first = False
        self.api_healthy = healthy
        write_heartbeat(self._settings.worker_heartbeat_file)

    def run(self) -> None:
        self._log.info("worker started", extra={"poll_interval_seconds": self._settings.worker_poll_interval_seconds})
        while not self._stop.is_set():
            self.run_once()
            self._stop.wait(self._settings.worker_poll_interval_seconds)
        self._log.info("worker stopped")

    def stop(self) -> None:
        """Graceful: the current loop finishes, then the worker exits (AGENTS.md §12)."""
        self._stop.set()


def write_heartbeat(path: Path) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(str(time.time()))
    tmp.replace(path)  # atomic, so the health check never reads half a file


def main() -> int:
    try:
        settings = load_settings()
    except SettingsError as error:
        print(error)  # logging isn't set up without settings
        return 2
    log = setup_logging(settings.log_level)
    with GraphQLClient(
        str(settings.graphql_api_url),
        token=settings.worker_service_token,
        timeout=settings.worker_request_timeout_seconds,
    ) as client:
        worker = Worker(client, settings, log)

        def on_signal(signum: int, _frame: FrameType | None) -> None:
            log.info("stopping", extra={"signal": signal.Signals(signum).name})
            worker.stop()

        signal.signal(signal.SIGTERM, on_signal)
        signal.signal(signal.SIGINT, on_signal)
        worker.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
