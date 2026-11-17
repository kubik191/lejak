from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def fixture_html():
    def load(name: str) -> str:
        return (FIXTURES / name).read_text(encoding="utf-8")

    return load


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    """Point the app at an empty SQLite database in a temp dir."""
    from collector import config, db

    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("DATABASE_URL", "")
    monkeypatch.setenv("HTTP_MIN_DELAY", "0")
    monkeypatch.setenv("HTTP_RETRIES", "1")
    monkeypatch.setenv("SMTP_HOST", "")
    config.get_settings.cache_clear()
    db.reset_engine()
    db.init_db()
    yield config.get_settings()
    db.reset_engine()
    config.get_settings.cache_clear()
