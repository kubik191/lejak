from fastapi.testclient import TestClient
from sqlalchemy import select

from collector.db import session_scope
from collector.models import Run, RunStatus, SourceSetting, Station


def _client():
    from collector.web.app import app

    return TestClient(app)


def test_pages_render(temp_db):
    with _client() as c:
        with session_scope() as s:
            station_id = s.scalar(select(Station.id).limit(1))
        for path in ["/", "/runs", "/stations", "/stations?health=new&q=Mor", f"/stations/{station_id}",
                     "/schedules", "/export", "/api/activity", "/health", "/partials/live"]:
            r = c.get(path)
            assert r.status_code == 200, path


def test_manual_run_is_queued_once(temp_db):
    with _client() as c:
        r = c.post("/runs", data={"source": "groundwater"}, follow_redirects=False)
        assert r.status_code == 303
        c.post("/runs", data={"source": "groundwater"})
        with session_scope() as s:
            runs = s.scalars(select(Run)).all()
            assert len(runs) == 1 and runs[0].status == RunStatus.QUEUED and runs[0].trigger == "manual"
        c.post(f"/runs/{runs[0].id}/cancel")
        with session_scope() as s:
            assert s.get(Run, runs[0].id).status == RunStatus.CANCELLED


def test_schedule_validation(temp_db):
    with _client() as c:
        r = c.post("/schedules/water_level", data={"schedule": "not a cron", "enabled": "on"}, follow_redirects=False)
        assert "error" in r.headers["location"]
        c.post("/schedules/water_level", data={"schedule": "0 7 * * *"})
        with session_scope() as s:
            setting = s.get(SourceSetting, "water_level")
            assert setting.schedule == "0 7 * * *" and setting.enabled is False


def test_bulk_disable_and_export(temp_db):
    with _client() as c:
        with session_scope() as s:
            ids = s.scalars(select(Station.id).limit(3)).all()
        c.post("/stations/bulk", data={"action": "disable", "ids": ids})
        with session_scope() as s:
            assert all(not s.get(Station, i).enabled for i in ids)
        r = c.get("/export/download?fmt=csv")
        assert r.status_code == 200 and r.text.lstrip("\ufeff").startswith("source,station_id")
        assert c.get("/export/download?fmt=xlsx").status_code == 200
