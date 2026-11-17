from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[3]
BACKEND_DIR = Path(__file__).resolve().parents[2]

try:
    from dotenv import load_dotenv
except Exception:  # pragma: no cover - optional dependency during bootstrap
    load_dotenv = None  # type: ignore[assignment]

if load_dotenv is not None:
    load_dotenv(BACKEND_DIR / ".env")
    load_dotenv(ROOT_DIR / ".env")


def resolve_db_path() -> Path:
    db_env = os.getenv("SCIIP_DB_PATH")
    if db_env:
        candidate = Path(db_env)
        if candidate.is_absolute():
            return candidate
        b_cand = (BACKEND_DIR / db_env).resolve()
        if b_cand.exists():
            return b_cand
        r_cand = (ROOT_DIR / db_env).resolve()
        if r_cand.exists():
            return r_cand
    return (ROOT_DIR / "data" / "sciip.db").resolve()


DB_PATH = resolve_db_path()



def _parse_csv(value: str | None, fallback: list[str]) -> list[str]:
    if not value:
        return fallback
    items = [item.strip() for item in value.split(",")]
    return [item for item in items if item]


def _groq_key() -> str | None:
    return os.getenv("GROQ_API_KEY") or os.getenv("GROK_API_KEY")


def _provider() -> str:
    return os.getenv("AI_PROVIDER", "ollama").strip().lower()


def _configured_base_url() -> str | None:
    provider = _provider()
    if provider == "ollama":
        return os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1").rstrip("/")
    if provider in {"groq", "grok"}:
        return os.getenv("GROQ_BASE_URL") or "https://api.groq.com/openai/v1"
    return os.getenv("OPENAI_BASE_URL")


def _default_model() -> str:
    provider = _provider()
    if provider == "ollama":
        return os.getenv("OLLAMA_MODEL", "qwen2.5:7b")
    if provider in {"groq", "grok"}:
        return os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
    return os.getenv("OPENAI_MODEL", "gpt-5.6")


def _configured_api_key() -> str | None:
    provider = _provider()
    if provider == "ollama":
        return "ollama"
    if provider in {"groq", "grok"}:
        return _groq_key()
    return os.getenv("OPENAI_API_KEY")


@dataclass(frozen=True)
class Settings:
    app_name: str = "SCIIP API"
    db_path: Path = field(default_factory=resolve_db_path)
    ai_provider: str = field(default_factory=_provider)
    # Groq exposes an OpenAI-compatible API, so the existing client can be shared.
    openai_api_key: str | None = field(default_factory=_configured_api_key)
    openai_base_url: str | None = field(default_factory=_configured_base_url)
    openai_model: str = field(default_factory=_default_model)
    allowed_origins: list[str] = None  # type: ignore[assignment]
    max_copilot_turns: int = field(default_factory=lambda: int(os.getenv("SCIIP_COPILOT_MAX_TURNS", "8")))

    def __post_init__(self):
        object.__setattr__(
            self,
            "allowed_origins",
            _parse_csv(
                os.getenv("SCIIP_CORS_ORIGINS"),
                ["http://localhost:5173", "http://127.0.0.1:5173"],
            ),
        )

    @property
    def ai_provider_is_supported(self) -> bool:
        return self.ai_provider in {"groq", "grok", "openai", "ollama"}

    @property
    def has_openai_key(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def key_looks_like_groq(self) -> bool:
        return False

    def ai_configuration_status(self) -> tuple[str, str]:
        if not self.ai_provider_is_supported:
            return "provider_misconfigured", (
                f"AI_PROVIDER must be one of 'ollama', 'groq', or 'openai', not '{self.ai_provider}'."
            )
        if self.ai_provider == "ollama":
            return "configured", f"Ollama is configured at {self.openai_base_url} with model {self.openai_model}."
        if not self.has_openai_key:
            key_name = "GROQ_API_KEY" if self.ai_provider in {"groq", "grok"} else "OPENAI_API_KEY"
            return "missing_api_key", f"{key_name} is missing."
        return "configured", f"{self.ai_provider.capitalize()} provider is configured."


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
