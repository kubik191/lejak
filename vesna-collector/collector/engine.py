from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from collector import notify
from collector.config import Settings, get_settings
from collector.db import session_scope
from collector.http import FetchError, Fetcher
from collector.models import Run, RunEvent, RunStatus, Station
from collector.sources import ParseError, Source, get_source
from collector.storage import mark_failure, mark_success, store_observations, upsert_station

logger = logging.getLogger(__name__)


@dataclass
class _Outcome:
    station_id: int
    observations: list = field(default_factory=list)
    error: Optional[str] = None


class RunContext:
    """Bookkeeping for one run: counters, events, stations that just started failing."""

    def __init__(self, session: Session, run: Run, settings: Settings):
        self.session = session
        self.run = run
        self.settings = settings
        self.newly_failing: list[Station] = []

    def event(self, level: str, message: str, station: Optional[Station] = None) -> None:
        self.session.add(RunEvent(run_id=self.run.id, station_id=station.id if station else None, level=level, message=message))
        log = logger.error if level == "error" else logger.warning if level == "warning" else logger.info
        log("[run %s] %s%s", self.run.id, f"{station.display_name}: " if station else "", message)

    def succeeded(self, station: Station, observations: list) -> None:
        now = datetime.now()
        new = store_observations(self.session, station, observations)
        mark_success(station, now)
        self.run.stations_ok += 1
        self.run.stations_done += 1
        self.run.rows_new += new

    def failed(self, station: Station, error: str) -> None:
        mark_failure(station, datetime.now(), error)
        if station.consecutive_failures == self.settings.failing_after:
            self.newly_failing.append(station)
        self.run.stations_failed += 1
        self.run.stations_done += 1
        self.event("error", error, station)

    def cancel_requested(self) -> bool:
        return bool(self.session.scalar(select(Run.cancel_requested).where(Run.id == self.run.id)))


async def _fetch_station(fetcher: Fetcher, source: Source, station_id: int, url: str) -> _Outcome:
    try:
        html = await fetcher.get_text(url)
        obs = source.parse_station_page(html)
        if not obs:
            return _Outcome(station_id, error="Page contained no measurements")
        return _Outcome(station_id, obs)
    except (FetchError, ParseError) as e:
        return _Outcome(station_id, error=str(e))
    except Exception as e:  # noqa: BLE001 — one bad page must not stop the run
        logger.exception("Unexpected error for station %s", station_id)
        return _Outcome(station_id, error=f"Unexpected error: {e.__class__.__name__}: {e}")


async def _run_per_station(ctx: RunContext, source: Source, fetcher: Fetcher) -> bool:
    stations = ctx.session.scalars(
        select(Station).where(Station.source_key == source.key, Station.enabled.is_(True)).order_by(Station.id)
    ).all()
    by_id = {s.id: s for s in stations}
    ctx.run.stations_total = len(stations)
    ctx.session.commit()

    tasks = [asyncio.create_task(_fetch_station(fetcher, source, s.id, s.url)) for s in stations if s.url]
    for s in stations:
        if not s.url:
            ctx.failed(s, "Station has no URL configured")
    try:
        for i, fut in enumerate(asyncio.as_completed(tasks), 1):
            outcome = await fut
            station = by_id[outcome.station_id]
            if outcome.error:
                ctx.failed(station, outcome.error)
            else:
                ctx.succeeded(station, outcome.observations)
            ctx.run.requests_made = fetcher.requests_made
            ctx.session.commit()
            if i % 10 == 0 and ctx.cancel_requested():
                return False
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
    return True


async def _run_bulk(ctx: RunContext, source: Source, fetcher: Fetcher) -> bool:
    known = {
        s.external_id: s
        for s in ctx.session.scalars(select(Station).where(Station.source_key == source.key)).all()
    }
    seen: set[str] = set()
    page_errors: list[str] = []

    for url in source.bulk_urls:
        try:
            records = source.parse_bulk_page(await fetcher.get_text(url), url)
        except (FetchError, ParseError) as e:
            page_errors.append(f"{url}: {e}")
            ctx.event("error", f"Page failed: {url}: {e}")
            continue

        new_stations = 0
        for rec in records:
            is_new = rec.station.external_id not in known
            station = upsert_station(ctx.session, source.key, rec.station, known)
            new_stations += is_new
            seen.add(station.external_id)
            if not station.enabled:
                continue
            ctx.run.stations_total += 1
            ctx.succeeded(station, rec.observations)
        if new_stations:
            ctx.event("info", f"Discovered {new_stations} new station(s) on {url}")
        ctx.run.requests_made = fetcher.requests_made
        ctx.session.commit()

    reason = "; ".join(page_errors) if page_errors else "Station no longer listed on the source page"
    for ext_id, station in known.items():
        if station.enabled and ext_id not in seen:
            ctx.run.stations_total += 1
            ctx.failed(station, reason)
    ctx.session.commit()
    return True


async def execute_run(run_id: int, settings: Optional[Settings] = None, client: Optional[httpx.AsyncClient] = None) -> str:
    """Execute a queued run to completion. Returns the final status."""
    settings = settings or get_settings()
    with session_scope() as session:
        run = session.get(Run, run_id)
        if run is None:
            raise ValueError(f"Run {run_id} not found")
        run.status = RunStatus.RUNNING
        run.started_at = datetime.now()
        session.commit()

        ctx = RunContext(session, run, settings)
        source = get_source(run.source_key)
        logger.info("Run %s started: %s (%s)", run.id, source.name, run.trigger)
        completed = True
        try:
            async with Fetcher(settings, client) as fetcher:
                if source.mode == "per_station":
                    completed = await _run_per_station(ctx, source, fetcher)
                else:
                    completed = await _run_bulk(ctx, source, fetcher)
                run.requests_made = fetcher.requests_made
        except Exception as e:  # noqa: BLE001
            logger.exception("Run %s crashed", run.id)
            session.rollback()
            run.error = f"{e.__class__.__name__}: {e}"

        if not completed:
            run.status = RunStatus.CANCELLED
            ctx.event("warning", f"Cancelled by user after {run.stations_done}/{run.stations_total} stations")
        elif run.error:
            run.status = RunStatus.FAILED
        elif run.stations_total == 0:
            run.status = RunStatus.FAILED
            run.error = "No enabled stations for this source"
        elif run.stations_failed == 0:
            run.status = RunStatus.SUCCESS
        elif run.stations_ok > 0:
            run.status = RunStatus.PARTIAL
        else:
            run.status = RunStatus.FAILED
            run.error = "All stations failed"
        run.finished_at = datetime.now()
        session.commit()

        logger.info(
            "Run %s %s in %.0fs: %d/%d stations ok, %d new rows, %d requests",
            run.id, run.status, run.duration_seconds or 0, run.stations_ok, run.stations_total, run.rows_new, run.requests_made,
        )
        notify.after_run(session, run, ctx.newly_failing, settings)
        return run.status
