import json

import httpx
import pytest
from pydantic import SecretStr

from content_engine.graphql_client import GraphQLClient, GraphQLResponseError, GraphQLTransportError


def client(handler: httpx.MockTransport, token: str | None = None) -> GraphQLClient:
    return GraphQLClient("http://api.test/", token=SecretStr(token) if token else None, transport=handler)


def test_posts_the_query_with_the_token() -> None:
    seen: dict[str, object] = {}

    def handle(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"data": {"health": {"status": "OK"}}})

    with client(httpx.MockTransport(handle), token="t0ken") as c:
        assert c.execute("{ health { status } }", {"a": 1}) == {"health": {"status": "OK"}}
    assert seen == {
        "url": "http://api.test/graphql",
        "auth": "Bearer t0ken",
        "body": {"query": "{ health { status } }", "variables": {"a": 1}},
    }


def test_graphql_errors_carry_their_codes() -> None:
    def handle(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"errors": [{"message": "no", "extensions": {"code": "FORBIDDEN"}}]})

    with client(httpx.MockTransport(handle)) as c, pytest.raises(GraphQLResponseError) as error:
        c.execute("{ x }")
    assert error.value.codes == ["FORBIDDEN"]


@pytest.mark.parametrize(
    "response",
    [httpx.Response(502, text="Bad gateway"), httpx.Response(500, json={"nope": True})],
)
def test_http_failures_are_transport_errors(response: httpx.Response) -> None:
    with client(httpx.MockTransport(lambda _: response)) as c, pytest.raises(GraphQLTransportError):
        c.execute("{ x }")


def test_connection_failure_is_a_transport_error() -> None:
    def handle(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    with client(httpx.MockTransport(handle)) as c, pytest.raises(GraphQLTransportError):
        c.execute("{ x }")
