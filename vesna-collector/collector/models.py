from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# All datetimes are naive local time (settings.timezone), matching what SHMÚ publishes.


class Base(DeclarativeBase):
    pass


class RunStatus:
    QUEUED = "queued"
    RUNNING = "running"
    SUCCESS = "success"
    PARTIAL = "partial"
    FAILED = "failed"
    CANCELLED = "cancelled"

    ACTIVE = (QUEUED, RUNNING)
    FINISHED = (SUCCESS, PARTIAL, FAILED, CANCELLED)


class SourceSetting(Base):
    __tablename__ = "source_settings"

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    schedule: Mapped[str] = mapped_column(String(100))
    next_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)


class Station(Base):
    __tablename__ = "stations"
    __table_args__ = (UniqueConstraint("source_key", "external_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_key: Mapped[str] = mapped_column(String(50), index=True)
    external_id: Mapped[str] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(255))
    river: Mapped[Optional[str]] = mapped_column(String(255))
    basin: Mapped[Optional[str]] = mapped_column(String(255))
    url: Mapped[Optional[str]] = mapped_column(String(500))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    last_attempt_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_success_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_observed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[Optional[str]] = mapped_column(Text)

    measurements: Mapped[list[Measurement]] = relationship(
        back_populates="station", cascade="all, delete-orphan", passive_deletes=True
    )

    @property
    def display_name(self) -> str:
        return f"{self.name} – {self.river}" if self.river else self.name

    def health(self, failing_after: int, stale_data_hours: int, now: Optional[datetime] = None) -> str:
        """One of: disabled, new, ok, warning, failing, stale."""
        now = now or datetime.now()
        if not self.enabled:
            return "disabled"
        if self.last_attempt_at is None:
            return "new"
        if self.consecutive_failures >= failing_after:
            return "failing"
        if self.consecutive_failures > 0:
            return "warning"
        if self.last_observed_at and self.last_observed_at < now - timedelta(hours=stale_data_hours):
            return "stale"
        return "ok"


class Measurement(Base):
    __tablename__ = "measurements"
    __table_args__ = (
        UniqueConstraint("station_id", "observed_at", "variable", name="uq_measurement"),
        Index("ix_measurement_series", "station_id", "variable", "observed_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id", ondelete="CASCADE"))
    observed_at: Mapped[datetime] = mapped_column(DateTime)
    variable: Mapped[str] = mapped_column(String(50))
    value: Mapped[Optional[float]] = mapped_column(Float)
    value_text: Mapped[Optional[str]] = mapped_column(String(255))
    collected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    station: Mapped[Station] = relationship(back_populates="measurements")


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_key: Mapped[str] = mapped_column(String(50), index=True)
    trigger: Mapped[str] = mapped_column(String(20))  # schedule | manual | cli
    status: Mapped[str] = mapped_column(String(20), default=RunStatus.QUEUED, index=True)
    queued_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, index=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    stations_total: Mapped[int] = mapped_column(Integer, default=0)
    stations_done: Mapped[int] = mapped_column(Integer, default=0)
    stations_ok: Mapped[int] = mapped_column(Integer, default=0)
    stations_failed: Mapped[int] = mapped_column(Integer, default=0)
    rows_new: Mapped[int] = mapped_column(Integer, default=0)
    requests_made: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[Optional[str]] = mapped_column(Text)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)

    events: Mapped[list[RunEvent]] = relationship(
        back_populates="run", cascade="all, delete-orphan", order_by="RunEvent.id"
    )

    @property
    def duration_seconds(self) -> Optional[float]:
        if not self.started_at:
            return None
        end = self.finished_at or datetime.now()
        return (end - self.started_at).total_seconds()

    @property
    def progress_pct(self) -> int:
        if not self.stations_total:
            return 0
        return min(100, round(100 * self.stations_done / self.stations_total))


class RunEvent(Base):
    __tablename__ = "run_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), index=True)
    station_id: Mapped[Optional[int]] = mapped_column(ForeignKey("stations.id", ondelete="SET NULL"))
    level: Mapped[str] = mapped_column(String(10))  # info | warning | error
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    run: Mapped[Run] = relationship(back_populates="events")
    station: Mapped[Optional[Station]] = relationship()


class AppState(Base):
    """Small key/value store, e.g. the worker heartbeat."""

    __tablename__ = "app_state"

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    value: Mapped[Optional[str]] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
