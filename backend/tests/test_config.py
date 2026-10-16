import pytest
from pydantic import ValidationError

from app.core.config import Settings, normalize_database_url

SECRET = "x" * 40


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        ("postgresql+asyncpg://u:p@h:5432/db", "postgresql+asyncpg://u:p@h:5432/db"),
        ("postgres://u:p@h:5432/db", "postgresql+asyncpg://u:p@h:5432/db"),
        ("postgresql://u:p@h/db", "postgresql+asyncpg://u:p@h/db"),
        ("postgres://u:p@h/db?sslmode=require", "postgresql+asyncpg://u:p@h/db?ssl=require"),
        ("postgresql://u:p@h/db?sslmode=disable", "postgresql+asyncpg://u:p@h/db?ssl=disable"),
    ],
)
def test_database_urls_from_hosting_platforms_are_normalised(given, expected):
    assert normalize_database_url(given) == expected


def test_password_with_special_characters_survives():
    out = normalize_database_url("postgres://user:p%40ss%2Fword@h/db")
    assert out.startswith("postgresql+asyncpg://user:")
    assert "@h/db" in out


@pytest.mark.parametrize("bad", ["mysql://u:p@h/db", "sqlite:///x.db", "not a url", ""])
def test_non_postgres_urls_are_rejected(bad):
    with pytest.raises(ValueError):
        normalize_database_url(bad)


def test_settings_normalise_and_enforce_a_strong_secret():
    settings = Settings(database_url="postgres://u:p@h/db", secret_key=SECRET)
    assert settings.database_url.startswith("postgresql+asyncpg://")

    with pytest.raises(ValidationError):
        Settings(database_url="postgres://u:p@h/db", secret_key="short")
    with pytest.raises(ValidationError):
        Settings(database_url="mysql://u:p@h/db", secret_key=SECRET)


def test_production_flag_and_docs():
    prod = Settings(database_url="postgres://u:p@h/db", secret_key=SECRET, environment="production")
    dev = Settings(database_url="postgres://u:p@h/db", secret_key=SECRET)
    assert prod.is_production and not dev.is_production
