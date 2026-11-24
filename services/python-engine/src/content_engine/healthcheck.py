"""Docker health check: healthy while the worker loop keeps beating."""

import os
import sys
import time
from pathlib import Path


def is_healthy(path: Path, poll_interval: float, now: float | None = None) -> bool:
    try:
        beat = float(path.read_text())
    except (OSError, ValueError):
        return False
    # Allow a few missed loops (a slow API call) before calling it unhealthy.
    return ((now if now is not None else time.time()) - beat) <= max(30.0, poll_interval * 3)


def main() -> int:
    path = Path(os.environ.get("WORKER_HEARTBEAT_FILE", "/tmp/content-engine.heartbeat"))  # noqa: S108
    interval = float(os.environ.get("WORKER_POLL_INTERVAL_SECONDS", "10"))
    return 0 if is_healthy(path, interval) else 1


if __name__ == "__main__":
    sys.exit(main())
