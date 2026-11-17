"""End-to-end run execution with SHMÚ mocked by respx (no network)."""
import asyncio

import httpx
import respx
from sqlalchemy import func, select, update

from collector import notify
from collector.db import session_scope
from collector.engine import execute_run
from collector.models import Measurement, Run, RunStatus, Station
from collector.services import enqueue_run, recover_interrupted_runs


def _run(source_key: str, settings) -> Run:
    with session_scope() as s:
        run_id = enqueue_run(s, source_key, "test")[0].id
    asyncio.run(execute_run(run_id, settings))
    with session_scope() as s:
        return s.get(Run, run_id)


def _only_stations(source_key: str, n: int) -> list[Station]:
    with session_scope() as s:
        ids = s.scalars(select(Station.id).where(Station.source_key == source_key).order_by(Station.id)).all()
        s.execute(update(Station).where(Station.id.in_(ids[n:])).values(enabled=False))
        return s.scalars(select(Station).where(Station.id.in_(ids[:n]))).all()


@respx.mock
def test_bulk_run_discovers_stations_and_deduplicates(temp_db, fixture_html):
    respx.get(url__startswith="https://www.shmu.sk/sk/?page=1&id=pzv_kvantita").mock(
        return_value=httpx.Response(200, text=fixture_html("groundwater.html"))
    )
    first = _run("groundwater", temp_db)
    assert first.status == RunStatus.SUCCESS
    assert first.stations_total == first.stations_ok > 100
    assert first.rows_new > 0

    second = _run("groundwater", temp_db)
    assert second.status == RunStatus.SUCCESS
    assert second.rows_new == 0, "re-collecting the same page must not duplicate rows"
    with session_scope() as s:
        assert s.scalar(select(func.count()).select_from(Measurement)) == first.rows_new


@respx.mock
def test_per_station_run_partial_failure_and_health(temp_db, fixture_html):
    ok, bad = _only_stations("water_level", 2)
    respx.get(ok.url).mock(return_value=httpx.Response(200, text=fixture_html("water_level.html")))
    respx.get(bad.url).mock(return_value=httpx.Response(503))

    run = _run("water_level", temp_db)
    assert run.status == RunStatus.PARTIAL
    assert (run.stations_ok, run.stations_failed) == (1, 1)
    with session_scope() as s:
        good, broken = s.get(Station, ok.id), s.get(Station, bad.id)
        assert good.consecutive_failures == 0 and good.last_observed_at is not None
        assert broken.consecutive_failures == 1 and "503" in broken.last_error
        assert broken.health(3, 24) == "warning"
        events = s.get(Run, run.id).events
        assert any(e.station_id == bad.id and e.level == "error" for e in events)


@respx.mock
def test_station_becomes_failing_and_triggers_alert(temp_db, monkeypatch):
    (station,) = _only_stations("water_level", 1)
    respx.get(station.url).mock(return_value=httpx.Response(200, text="<html>nothing here</html>"))
    sent = []
    monkeypatch.setattr(notify, "send_email", lambda settings, subject, body: sent.append(subject))
    monkeypatch.setattr(type(temp_db), "email_enabled", property(lambda self: True))

    for _ in range(temp_db.failing_after):
        run = _run("water_level", temp_db)
        assert run.status == RunStatus.FAILED
    with session_scope() as s:
        assert s.get(Station, station.id).health(temp_db.failing_after, 24) == "failing"
    assert len(sent) == temp_db.failing_after  # every fully-failed run alerts
    assert "failed" in sent[-1]


def test_enqueue_is_idempotent_and_recovery(temp_db):
    with session_scope() as s:
        a, created_a = enqueue_run(s, "groundwater", "manual")
        b, created_b = enqueue_run(s, "groundwater", "schedule")
        assert created_a and not created_b and a.id == b.id
        a.status = RunStatus.RUNNING
    with session_scope() as s:
        assert recover_interrupted_runs(s) == 1
        assert s.get(Run, a.id).status == RunStatus.FAILED


def test_alert_rules(temp_db):
    run = Run(id=1, source_key="water_level", trigger="t", status=RunStatus.PARTIAL, stations_total=100, stations_failed=5, stations_ok=95)
    assert notify.build_alert(run, [], temp_db) is None
    run.stations_failed, run.stations_ok = 30, 70
    subject, body = notify.build_alert(run, [], temp_db)
    assert "partial" in subject and "30" in body
