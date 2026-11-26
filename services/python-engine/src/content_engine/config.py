"""Settings, validated once at startup. Errors name the setting, never its value."""

from pathlib import Path
from typing import Literal

from pydantic import Field, HttpUrl, SecretStr, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore", frozen=True)

    graphql_api_url: HttpUrl
    # The worker's own narrow credential (AGENTS.md §10): without it the worker only checks the API's health.
    worker_service_token: SecretStr | None = None
    # Text to speech. Without a key the "fake" provider makes silent audio (tests, and running without credits).
    elevenlabs_api_key: SecretStr | None = None
    elevenlabs_model_id: str = "eleven_multilingual_v2"
    tts_provider: Literal["elevenlabs", "fake"] | None = None

    # Translations: the local language model, or "fake" (marked copies of each sentence; browser tests only).
    translation_provider: Literal["llm", "fake"] | None = None

    @field_validator("tts_provider", "llm_base_url", "translation_provider", mode="before")
    @classmethod
    def _unset_when_empty(cls, value: object) -> object:
        # Docker Compose passes "" for a setting that's turned off: TTS_PROVIDER="" means "choose by the key",
        # LLM_BASE_URL="" means "no language model".
        return None if value == "" else value

    # The local language model for vocabulary suggestions (llama.cpp's OpenAI-compatible server). Without it,
    # suggestions come from word frequency only.
    llm_base_url: HttpUrl | None = None
    llm_model: str = "qwen3-14b"
    llm_timeout_seconds: float = Field(default=600.0, gt=0, le=1800)
    # Where upload URLs' origin should point from inside Docker (the local storage driver lives in the API).
    media_upload_origin: HttpUrl | None = None
    log_level: Literal["debug", "info", "warn", "error"] = "info"
    worker_poll_interval_seconds: float = Field(default=10.0, gt=0, le=3600)
    worker_request_timeout_seconds: float = Field(default=10.0, gt=0, le=120)
    worker_heartbeat_file: Path = Path("/tmp/content-engine.heartbeat")  # noqa: S108 - inside the container only


class SettingsError(Exception):
    def __init__(self, problems: list[str]) -> None:
        self.problems = problems
        super().__init__("Invalid environment:\n" + "\n".join(f"  - {p}" for p in problems))


def load_settings(**overrides: object) -> Settings:
    try:
        return Settings(**overrides)  # type: ignore[arg-type]
    except ValidationError as error:
        problems = [f"{'.'.join(str(p) for p in e['loc']).upper() or '(root)'}: {e['msg']}" for e in error.errors()]
        raise SettingsError(problems) from None


def tts_provider_name(settings: Settings) -> Literal["elevenlabs", "fake"]:
    """The provider to use: as configured, otherwise ElevenLabs when a key is set, otherwise the silent fake."""
    if settings.tts_provider:
        return settings.tts_provider
    return "elevenlabs" if settings.elevenlabs_api_key else "fake"
