"""Shared fixtures. Tests run against TEST_DATABASE_URL (a separate database, see docker/initdb)."""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.config import Settings, normalize_database_url
from app.main import create_app

UNREACHABLE_DB_URL = "postgresql+psycopg://vqm:vqm@127.0.0.1:1/vqm?connect_timeout=2"
FRONTEND_ORIGIN = "http://localhost:5173"


class _TestEnv(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    test_database_url: str


@pytest.fixture(scope="session")
def test_database_url() -> str:
    try:
        return normalize_database_url(_TestEnv().test_database_url)
    except ValidationError:
        pytest.exit("TEST_DATABASE_URL is not set (see backend/.env.example)", returncode=2)


def make_settings(database_url: str, **overrides: Any) -> Settings:
    """Explicit test settings; never reads the developer's .env for app values."""
    values: dict[str, Any] = {
        "database_url": database_url,
        "cors_origins": [FRONTEND_ORIGIN],
        "threshold_fps_min": 15,
        "threshold_brightness_min": 60,
        "threshold_brightness_max": 200,
        "threshold_motion_max": 20,
        "max_samples_per_batch": 120,
        "log_level": "WARNING",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


@pytest.fixture
def app(test_database_url: str) -> FastAPI:
    return create_app(make_settings(test_database_url))


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client
