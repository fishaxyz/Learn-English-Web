# content-engine

The platform's Python worker (AGENTS.md §8). It reads and writes platform data only through the GraphQL API; it has no database schema of its own.

Phase 0: the loop checks the API's health and writes a heartbeat file that Docker's health check reads. Jobs arrive in Phase 4.

```sh
uv sync --locked          # install the locked dependencies into .venv
uv run pytest             # tests
uv run ruff check . && uv run ruff format --check . && uv run mypy src tests
GRAPHQL_API_URL=http://localhost:4400 uv run content-engine-worker
```
