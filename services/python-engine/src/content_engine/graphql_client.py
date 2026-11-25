"""The worker's only way to read and write platform data: authenticated GraphQL calls to the API."""

from types import TracebackType
from typing import Any, Self

import httpx
from pydantic import SecretStr


class GraphQLTransportError(Exception):
    """The API couldn't be reached, or answered with an HTTP error."""


class GraphQLResponseError(Exception):
    """The API answered, with GraphQL errors. Carries their codes (UNAUTHENTICATED, FORBIDDEN...)."""

    def __init__(self, messages: list[str], codes: list[str]) -> None:
        self.messages = messages
        self.codes = codes
        super().__init__("; ".join(messages))


class GraphQLClient:
    def __init__(
        self,
        api_url: str,
        *,
        token: SecretStr | None = None,
        timeout: float = 10.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        headers = {"content-type": "application/json", "user-agent": "content-engine"}
        if token is not None:
            headers["x-worker-token"] = token.get_secret_value()
        self._http = httpx.Client(base_url=api_url.rstrip("/"), headers=headers, timeout=timeout, transport=transport)

    def execute(self, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        try:
            response = self._http.post("/graphql", json={"query": query, "variables": variables or {}})
        except httpx.HTTPError as error:
            raise GraphQLTransportError(type(error).__name__) from None
        try:
            body = response.json()
        except ValueError:
            raise GraphQLTransportError(f"HTTP {response.status_code}, not JSON") from None
        errors = body.get("errors") if isinstance(body, dict) else None
        if errors:
            raise GraphQLResponseError(
                [str(e.get("message", "")) for e in errors],
                [str((e.get("extensions") or {}).get("code", "UNKNOWN")) for e in errors],
            )
        if response.is_error:
            raise GraphQLTransportError(f"HTTP {response.status_code}")
        data = body.get("data")
        if not isinstance(data, dict):
            raise GraphQLTransportError("response has no data")
        return data

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self, exc_type: type[BaseException] | None, exc: BaseException | None, tb: TracebackType | None
    ) -> None:
        self.close()
