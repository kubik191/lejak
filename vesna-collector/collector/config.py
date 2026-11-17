from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    data_dir: Path = BASE_DIR / "data"
    database_url: str = ""
    timezone: str = "Europe/Bratislava"

    # HTTP politeness towards shmu.sk
    http_concurrency: int = 4
    http_min_delay: float = 0.4
    http_timeout: float = 30.0
    http_retries: int = 3
    user_agent: str = "VESNA-Collector/1.0 (+research; hydrological data collection)"

    # Health thresholds
    failing_after: int = 3
    stale_data_hours: int = 24

    # Worker
    worker_poll_seconds: float = 3.0
    worker_heartbeat_seconds: float = 10.0
    run_retention_days: int = 90

    # Email alerts (disabled when smtp_host or alert_to is empty)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = True
    alert_from: str = "vesna-collector@localhost"
    alert_to: str = ""
    alert_failure_ratio: float = 0.2
    public_url: str = "http://localhost:8000"

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        self.data_dir.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{(self.data_dir / 'collector.db').as_posix()}"

    @property
    def alert_recipients(self) -> list[str]:
        return [a.strip() for a in self.alert_to.split(",") if a.strip()]

    @property
    def email_enabled(self) -> bool:
        return bool(self.smtp_host and self.alert_recipients)


@lru_cache
def get_settings() -> Settings:
    return Settings()
