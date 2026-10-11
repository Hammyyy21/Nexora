"""Server-only configuration. No setting is supplied by chat requests."""
import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = Path(__file__).resolve().parent


@dataclass(frozen=True)
class Settings:
    api_key: str = field(default="", repr=False)
    model: str = "gpt-6.1-sol"
    origins: tuple[str, ...] = ("http://127.0.0.1:5173", "http://localhost:5173")
    timeout_seconds: float = 25
    requests_per_minute: int = 20

    def __post_init__(self):
        if not self.model.strip() or not 1 <= self.timeout_seconds <= 60:
            raise ValueError("Configure a model and a timeout between 1 and 60 seconds.")
        if not 1 <= self.requests_per_minute <= 120:
            raise ValueError("AI_REQUESTS_PER_MINUTE must be between 1 and 120.")
        for origin in self.origins:
            parsed = urlsplit(origin)
            if (parsed.scheme not in ("http", "https") or not parsed.netloc
                    or parsed.path or parsed.query or parsed.fragment
                    or parsed.username or parsed.password or "*" in origin):
                raise ValueError("CORS_ORIGINS must contain exact HTTP(S) origins, without paths.")

    @classmethod
    def from_env(cls):
        load_dotenv(BACKEND_DIR / ".env", override=False)
        return cls(
            api_key=os.getenv("OPENAI_API_KEY", "").strip(),
            model=os.getenv("OPENAI_MODEL", "gpt-6.1-sol").strip(),
            origins=tuple(o.strip() for o in os.getenv(
                "CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173"
            ).split(",") if o.strip()),
            timeout_seconds=float(os.getenv("AI_TIMEOUT_SECONDS", "25")),
            requests_per_minute=int(os.getenv("AI_REQUESTS_PER_MINUTE", "20")),
        )
