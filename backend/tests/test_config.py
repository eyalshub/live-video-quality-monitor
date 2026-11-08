from pathlib import Path

import pytest

from app.core.config import ConfigError, load_settings, normalize_database_url

REQUIRED = {
    "DATABASE_URL": "postgresql+psycopg://u:p@localhost:5432/db",
    "CORS_ORIGINS": "http://localhost:5173, https://app.example.com/",
    "THRESHOLD_FPS_MIN": "15",
    "THRESHOLD_BRIGHTNESS_MIN": "60",
    "THRESHOLD_BRIGHTNESS_MAX": "200",
    "THRESHOLD_MOTION_MAX": "20",
    "MAX_SAMPLES_PER_BATCH": "120",
}


@pytest.fixture
def clean_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> pytest.MonkeyPatch:
    """No .env file and none of our variables in the process environment."""
    monkeypatch.chdir(tmp_path)
    for name in [*REQUIRED, "LOG_LEVEL"]:
        monkeypatch.delenv(name, raising=False)
    return monkeypatch


def _set(monkeypatch: pytest.MonkeyPatch, **overrides: str) -> None:
    for name, value in {**REQUIRED, **overrides}.items():
        monkeypatch.setenv(name, value)


def test_valid_environment_is_parsed(clean_env: pytest.MonkeyPatch) -> None:
    _set(clean_env)
    settings = load_settings()
    assert settings.cors_origins == ["http://localhost:5173", "https://app.example.com"]
    assert settings.threshold_fps_min == 15
    assert settings.threshold_brightness_max == 200
    assert settings.max_samples_per_batch == 120
    assert settings.log_level == "INFO"  # the only setting with a default


def test_missing_required_variables_are_all_named(clean_env: pytest.MonkeyPatch) -> None:
    with pytest.raises(ConfigError) as exc_info:
        load_settings()
    message = str(exc_info.value)
    for name in REQUIRED:
        assert name in message


def test_missing_threshold_has_no_default(clean_env: pytest.MonkeyPatch) -> None:
    _set(clean_env)
    clean_env.delenv("THRESHOLD_MOTION_MAX")
    with pytest.raises(ConfigError, match="THRESHOLD_MOTION_MAX"):
        load_settings()


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("THRESHOLD_FPS_MIN", "abc"),
        ("THRESHOLD_FPS_MIN", "121"),
        ("THRESHOLD_BRIGHTNESS_MAX", "300"),
        ("MAX_SAMPLES_PER_BATCH", "0"),
        ("CORS_ORIGINS", " , "),
        ("CORS_ORIGINS", "*"),
        ("LOG_LEVEL", "LOUD"),
    ],
)
def test_invalid_values_are_rejected(clean_env: pytest.MonkeyPatch, name: str, value: str) -> None:
    _set(clean_env, **{name: value})
    with pytest.raises(ConfigError, match=name):
        load_settings()


def test_brightness_min_must_be_below_max(clean_env: pytest.MonkeyPatch) -> None:
    _set(clean_env, THRESHOLD_BRIGHTNESS_MIN="200", THRESHOLD_BRIGHTNESS_MAX="60")
    with pytest.raises(ConfigError, match="THRESHOLD_BRIGHTNESS_MIN must be lower"):
        load_settings()


def test_log_level_is_case_insensitive(clean_env: pytest.MonkeyPatch) -> None:
    _set(clean_env, LOG_LEVEL="debug")
    assert load_settings().log_level == "DEBUG"


@pytest.mark.parametrize(
    "url",
    ["postgres://u:p@h/db", "postgresql://u:p@h/db", "postgresql+psycopg://u:p@h/db"],
)
def test_database_url_is_normalized_to_psycopg(url: str) -> None:
    assert normalize_database_url(url) == "postgresql+psycopg://u:p@h/db"
