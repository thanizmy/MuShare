from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url


def normalize_database_url(url: str) -> str:
    """Accept what hosting platforms hand out and return a SQLAlchemy asyncpg URL.

    Render and Fly give ``postgres://`` or ``postgresql://`` URLs, sometimes with libpq's
    ``sslmode=`` option; asyncpg wants its own scheme and spells that option ``ssl=``.
    """
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            url = "postgresql+asyncpg://" + url[len(prefix) :]
            break
    if not url.startswith("postgresql+asyncpg://"):
        raise ValueError("DATABASE_URL must be a PostgreSQL URL (postgresql+asyncpg://...)")

    parsed = make_url(url)
    query = dict(parsed.query)
    if "sslmode" in query:
        query["ssl"] = query.pop("sslmode")
    return parsed.set(query=query).render_as_string(hide_password=False)


class Settings(BaseSettings):
    """Application settings. Every value comes from the environment / .env file."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str
    secret_key: str = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(default=15, gt=0)
    refresh_token_expire_days: int = Field(default=14, gt=0)
    cors_origins: list[str] = ["http://localhost:5173"]
    story_ttl_hours: int = Field(default=24, gt=0)
    story_purge_interval_seconds: int = Field(default=600, gt=0)
    login_rate_limit_attempts: int = Field(default=5, gt=0)
    login_rate_limit_window_seconds: int = Field(default=900, gt=0)

    # My Studio: where uploaded audio lives, and how much one person may upload.
    storage_backend: str = Field(default="local", pattern="^(local|s3)$")
    media_root: str = "media"
    s3_bucket: str | None = None
    s3_endpoint_url: str | None = None  # set for MinIO / R2 / other S3-compatible stores
    s3_region: str = "us-east-1"
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None
    studio_max_audio_bytes: int = Field(default=30 * 1024 * 1024, gt=0)
    studio_max_cover_bytes: int = Field(default=3 * 1024 * 1024, gt=0)
    studio_max_duration_sec: int = Field(default=600, gt=0)
    studio_max_pieces: int = Field(default=25, gt=0)
    studio_max_total_bytes: int = Field(default=300 * 1024 * 1024, gt=0)
    studio_uploads_per_hour: int = Field(default=10, gt=0)
    media_token_ttl_seconds: int = Field(default=3600, gt=0)

    @field_validator("database_url", mode="before")
    @classmethod
    def _normalise_database_url(cls, value: object) -> object:
        return normalize_database_url(value) if isinstance(value, str) else value

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
