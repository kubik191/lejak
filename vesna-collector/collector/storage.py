from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from collector.models import Measurement, Station
from collector.sources.base import Observation, StationSpec

_CHUNK = 500


def _insert_ignore(session: Session):
    dialect = session.get_bind().dialect.name
    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    # RETURNING yields only rows actually inserted, which gives an exact "new rows" count.
    return (
        insert(Measurement)
        .on_conflict_do_nothing(index_elements=["station_id", "observed_at", "variable"])
        .returning(Measurement.id)
    )


def store_observations(session: Session, station: Station, observations: list[Observation]) -> int:
    """Insert observations, skipping ones already stored. Returns the number of new rows."""
    if not observations:
        return 0
    now = datetime.now()
    rows = [
        {
            "station_id": station.id,
            "observed_at": o.observed_at,
            "variable": o.variable,
            "value": o.value,
            "value_text": o.value_text,
            "collected_at": now,
        }
        for o in observations
    ]
    new = 0
    stmt = _insert_ignore(session)
    for i in range(0, len(rows), _CHUNK):
        new += len(session.execute(stmt, rows[i : i + _CHUNK]).all())

    latest = max(o.observed_at for o in observations)
    if station.last_observed_at is None or latest > station.last_observed_at:
        station.last_observed_at = latest
    return new


def mark_success(station: Station, when: datetime) -> None:
    station.last_attempt_at = when
    station.last_success_at = when
    station.consecutive_failures = 0
    station.last_error = None


def mark_failure(station: Station, when: datetime, error: str) -> None:
    station.last_attempt_at = when
    station.consecutive_failures = (station.consecutive_failures or 0) + 1
    station.last_error = error[:1000]


def upsert_station(session: Session, source_key: str, spec: StationSpec, index: dict[str, Station]) -> Station:
    """Get or create a station discovered on a bulk page; refresh descriptive fields."""
    station = index.get(spec.external_id)
    if station is None:
        station = Station(
            source_key=source_key,
            external_id=spec.external_id,
            name=spec.name,
            river=spec.river,
            basin=spec.basin,
            url=spec.url,
            meta=spec.meta,
            enabled=True,
            consecutive_failures=0,
        )
        session.add(station)
        session.flush()
        index[spec.external_id] = station
    else:
        station.name = spec.name
        station.river = spec.river
        station.basin = spec.basin
        station.url = spec.url
        station.meta = spec.meta
    return station
