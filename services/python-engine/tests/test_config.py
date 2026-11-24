import pytest

from content_engine.config import SettingsError, load_settings


def test_needs_the_api_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GRAPHQL_API_URL", raising=False)
    with pytest.raises(SettingsError) as error:
        load_settings()
    assert any("GRAPHQL_API_URL" in p for p in error.value.problems)


def test_reads_the_environment_and_hides_the_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GRAPHQL_API_URL", "http://api:4400")
    monkeypatch.setenv("WORKER_SERVICE_TOKEN", "placeholder-token")
    monkeypatch.setenv("WORKER_POLL_INTERVAL_SECONDS", "2.5")
    settings = load_settings()
    assert str(settings.graphql_api_url) == "http://api:4400/"
    assert settings.worker_poll_interval_seconds == 2.5
    assert "placeholder-token" not in repr(settings)


def test_bad_values_are_named_not_printed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GRAPHQL_API_URL", "not a url secret-ish")
    monkeypatch.setenv("WORKER_POLL_INTERVAL_SECONDS", "-1")
    with pytest.raises(SettingsError) as error:
        load_settings()
    text = str(error.value)
    assert "GRAPHQL_API_URL" in text and "WORKER_POLL_INTERVAL_SECONDS" in text
    assert "secret-ish" not in text
