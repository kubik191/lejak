from __future__ import annotations

import logging

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from collector.models import SourceSetting, Station
from collector.sources.base import BulkRecord, Observation, ParseError, Source, StationSpec, Variable
from collector.sources.groundwater import GroundwaterSource
from collector.sources.hydro_report import HydroReportSource
from collector.sources.precipitation import PrecipitationSource
from collector.sources.water_level import WaterLevelSource

logger = logging.getLogger(__name__)

# To add a new data source: implement a Source subclass and register it here.
SOURCES: dict[str, Source] = {
    s.key: s
    for s in (WaterLevelSource(), PrecipitationSource(), HydroReportSource(), GroundwaterSource())
}

__all__ = [
    "SOURCES",
    "BulkRecord",
    "Observation",
    "ParseError",
    "Source",
    "StationSpec",
    "Variable",
    "get_source",
    "ensure_defaults",
]


def get_source(key: str) -> Source:
    try:
        return SOURCES[key]
    except KeyError:
        raise KeyError(f"Unknown source {key!r}; available: {', '.join(SOURCES)}") from None


def ensure_defaults(session: Session) -> None:
    """Create schedule rows and seed station lists on first start (idempotent)."""
    for source in SOURCES.values():
        if session.get(SourceSetting, source.key) is None:
            session.add(SourceSetting(key=source.key, enabled=True, schedule=source.default_schedule))

        has_stations = session.scalar(
            select(func.count()).select_from(Station).where(Station.source_key == source.key)
        )
        if not has_stations:
            specs = source.seed_stations()
            for spec in specs:
                session.add(
                    Station(
                        source_key=source.key,
                        external_id=spec.external_id,
                        name=spec.name,
                        river=spec.river,
                        basin=spec.basin,
                        url=spec.url,
                        meta=spec.meta,
                        enabled=True,
                    )
                )
            if specs:
                logger.info("Seeded %d stations for %s", len(specs), source.key)
