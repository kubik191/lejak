from __future__ import annotations

import csv
import io
from collections import Counter, defaultdict
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Annotated, Optional

from fastapi import Depends, FastAPI, Form, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from collector import __version__
from collector.config import get_settings
from collector.db import get_session, init_db
from collector.models import Measurement, Run, RunEvent, RunStatus, SourceSetting, Station
from collector.notify import send_email
from collector.services import enqueue_run, worker_status
from collector.sources import SOURCES, get_source
from collector.web import formatting as F

HERE = Path(__file__).resolve().parent
PAGE_SIZE = 50


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="VESNA Collector", version=__version__, lifespan=lifespan)
app.mount("/static", StaticFiles(directory=HERE / "static"), name="static")
templates = Jinja2Templates(directory=HERE / "templates")
templates.env.filters.update(
    dt=F.fmt_dt, ago=F.fmt_ago, duration=F.fmt_duration, num=F.fmt_int, cron=F.describe_cron
)
templates.env.globals.update(
    SOURCES=SOURCES, STATUS_STYLES=F.STATUS_STYLES, HEALTH_STYLES=F.HEALTH_STYLES, version=__version__
)

DB = Annotated[Session, Depends(get_session)]


def render(request: Request, name: str, **ctx) -> HTMLResponse:
    return templates.TemplateResponse(request, name, ctx)


def redirect(url: str, request: Request) -> Response:
    if request.headers.get("HX-Request"):
        return Response(status_code=204, headers={"HX-Redirect": url})
    return RedirectResponse(url, status_code=303)


def _health_counts(session: Session) -> dict[str, Counter]:
    s = get_settings()
    now = datetime.now()
    out: dict[str, Counter] = defaultdict(Counter)
    for st in session.scalars(select(Station)).all():
        out[st.source_key][st.health(s.failing_after, s.stale_data_hours, now)] += 1
    return out


def _active_runs(session: Session) -> list[Run]:
    return session.scalars(select(Run).where(Run.status.in_(RunStatus.ACTIVE)).order_by(Run.id)).all()


# --------------------------------------------------------------------- dashboard
@app.get("/", response_class=HTMLResponse)
def dashboard(request: Request, session: DB):
    settings = {s.key: s for s in session.scalars(select(SourceSetting)).all()}
    health = _health_counts(session)
    last_runs = {}
    for key in SOURCES:
        last_runs[key] = session.scalar(
            select(Run).where(Run.source_key == key, Run.status.in_(RunStatus.FINISHED)).order_by(Run.id.desc())
        )
    latest_obs = dict(
        session.execute(select(Station.source_key, func.max(Station.last_observed_at)).group_by(Station.source_key)).all()
    )

    since = datetime.now() - timedelta(days=7)
    recent = session.scalars(select(Run).where(Run.queued_at >= since, Run.status.in_(RunStatus.FINISHED))).all()
    good = sum(1 for r in recent if r.status == RunStatus.SUCCESS)
    attempted = sum(r.stations_total for r in recent)
    kpis = {
        "measurements": session.scalar(select(func.count()).select_from(Measurement)) or 0,
        "stations": session.scalar(select(func.count()).select_from(Station).where(Station.enabled.is_(True))) or 0,
        "runs_7d": len(recent),
        "runs_ok_7d": good,
        "station_rate": round(100 * sum(r.stations_ok for r in recent) / attempted, 1) if attempted else None,
        "rows_7d": sum(r.rows_new for r in recent),
        "requests_7d": sum(r.requests_made for r in recent),
        "failing": sum(c["failing"] for c in health.values()),
        "stale": sum(c["stale"] for c in health.values()),
    }
    recent_runs = session.scalars(select(Run).order_by(Run.id.desc()).limit(10)).all()
    return render(
        request, "dashboard.html",
        settings=settings, health=health, last_runs=last_runs, latest_obs=latest_obs,
        kpis=kpis, recent_runs=recent_runs, worker=worker_status(session), active_runs=_active_runs(session),
    )


@app.get("/partials/live", response_class=HTMLResponse)
def live_partial(request: Request, session: DB):
    return render(request, "partials/live.html", worker=worker_status(session), active_runs=_active_runs(session))


@app.get("/api/activity")
def activity(session: DB, days: int = 14):
    """New measurements per day and source, for the dashboard chart."""
    start = date.today() - timedelta(days=days - 1)
    runs = session.scalars(select(Run).where(Run.queued_at >= datetime.combine(start, datetime.min.time()))).all()
    labels = [(start + timedelta(days=i)).isoformat() for i in range(days)]
    series = {k: [0] * days for k in SOURCES}
    for r in runs:
        idx = (r.queued_at.date() - start).days
        if 0 <= idx < days and r.source_key in series:
            series[r.source_key][idx] += r.rows_new
    return {
        "labels": labels,
        "datasets": [{"key": k, "label": SOURCES[k].name, "data": v} for k, v in series.items()],
    }


# --------------------------------------------------------------------- runs
@app.post("/runs")
def start_run(request: Request, session: DB, source: Annotated[str, Form()]):
    keys = list(SOURCES) if source == "all" else [source]
    if any(k not in SOURCES for k in keys):
        raise HTTPException(400, "Unknown source")
    runs = [enqueue_run(session, k, "manual")[0] for k in keys]
    session.commit()
    return redirect(f"/runs/{runs[0].id}" if len(runs) == 1 else "/runs", request)


@app.post("/runs/{run_id}/cancel")
def cancel_run(run_id: int, request: Request, session: DB):
    run = session.get(Run, run_id)
    if run is None:
        raise HTTPException(404)
    if run.status == RunStatus.QUEUED:
        run.status, run.finished_at = RunStatus.CANCELLED, datetime.now()
        session.add(RunEvent(run_id=run.id, level="warning", message="Cancelled before it started"))
    elif run.status == RunStatus.RUNNING:
        run.cancel_requested = True
    return redirect(f"/runs/{run_id}", request)


@app.get("/runs", response_class=HTMLResponse)
def runs_list(request: Request, session: DB, source: str = "", status: str = "", page: int = Query(1, ge=1)):
    q = select(Run)
    if source:
        q = q.where(Run.source_key == source)
    if status:
        q = q.where(Run.status == status)
    total = session.scalar(select(func.count()).select_from(q.subquery())) or 0
    runs = session.scalars(q.order_by(Run.id.desc()).offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE)).all()
    return render(
        request, "runs.html", runs=runs, source=source, status=status, page=page,
        pages=max(1, -(-total // PAGE_SIZE)), total=total, statuses=list(F.STATUS_STYLES),
    )


@app.get("/runs/{run_id}", response_class=HTMLResponse)
def run_detail(run_id: int, request: Request, session: DB, level: str = ""):
    run = session.get(Run, run_id)
    if run is None:
        raise HTTPException(404, "Run not found")
    q = select(RunEvent).where(RunEvent.run_id == run_id)
    if level:
        q = q.where(RunEvent.level == level)
    events = session.scalars(q.order_by(RunEvent.id).limit(1000)).all()
    template = "partials/run_progress.html" if request.headers.get("HX-Request") else "run_detail.html"
    return render(request, template, run=run, events=events, level=level, source=get_source(run.source_key))


# --------------------------------------------------------------------- stations
@app.get("/stations", response_class=HTMLResponse)
def stations_list(
    request: Request, session: DB, source: str = "", q: str = "", health: str = "", page: int = Query(1, ge=1)
):
    s = get_settings()
    stmt = select(Station)
    if source:
        stmt = stmt.where(Station.source_key == source)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Station.name.ilike(like), Station.river.ilike(like), Station.external_id.ilike(like)))
    stations = session.scalars(stmt.order_by(Station.source_key, Station.name)).all()
    now = datetime.now()
    rows = [(st, st.health(s.failing_after, s.stale_data_hours, now)) for st in stations]
    counts = Counter(h for _, h in rows)
    if health:
        rows = [r for r in rows if r[1] == health]
    total = len(rows)
    rows = rows[(page - 1) * PAGE_SIZE : page * PAGE_SIZE]
    return render(
        request, "stations.html", rows=rows, source=source, q=q, health=health, page=page,
        pages=max(1, -(-total // PAGE_SIZE)), total=total, counts=counts,
    )


@app.post("/stations/bulk")
def stations_bulk(
    request: Request,
    session: DB,
    action: Annotated[str, Form()],
    ids: Annotated[list[int], Form()] = [],
    back: Annotated[str, Form()] = "/stations",
):
    if action not in ("enable", "disable"):
        raise HTTPException(400)
    if ids:
        session.execute(update(Station).where(Station.id.in_(ids)).values(enabled=action == "enable"))
    return redirect(back if back.startswith("/") else "/stations", request)


@app.post("/stations/{station_id}/toggle")
def station_toggle(station_id: int, request: Request, session: DB):
    st = session.get(Station, station_id)
    if st is None:
        raise HTTPException(404)
    st.enabled = not st.enabled
    return redirect(f"/stations/{station_id}", request)


@app.get("/stations/{station_id}", response_class=HTMLResponse)
def station_detail(station_id: int, request: Request, session: DB, variable: str = "", days: int = 7):
    s = get_settings()
    st = session.get(Station, station_id)
    if st is None:
        raise HTTPException(404, "Station not found")
    source = get_source(st.source_key)
    present = set(session.scalars(select(Measurement.variable).where(Measurement.station_id == st.id).distinct()).all())
    variables = [v for v in source.variables if v.key in present] or source.variables[:1]
    var = source.variable(variable) or variables[0]
    latest = session.scalars(
        select(Measurement).where(Measurement.station_id == st.id).order_by(Measurement.observed_at.desc(), Measurement.variable).limit(40)
    ).all()
    count = session.scalar(select(func.count()).select_from(Measurement).where(Measurement.station_id == st.id)) or 0
    errors = session.scalars(
        select(RunEvent).where(RunEvent.station_id == st.id).order_by(RunEvent.id.desc()).limit(10)
    ).all()
    return render(
        request, "station_detail.html", st=st, source=source, variables=variables, var=var, days=days,
        latest=latest, count=count, errors=errors, health=st.health(s.failing_after, s.stale_data_hours),
    )


@app.get("/api/stations/{station_id}/series")
def station_series(station_id: int, session: DB, variable: str, days: int = Query(7, ge=1, le=3650)):
    since = datetime.now() - timedelta(days=days)
    rows = session.execute(
        select(Measurement.observed_at, Measurement.value)
        .where(Measurement.station_id == station_id, Measurement.variable == variable, Measurement.observed_at >= since)
        .order_by(Measurement.observed_at)
    ).all()
    return {"points": [{"x": t.isoformat(), "y": v} for t, v in rows]}


# --------------------------------------------------------------------- schedules & notifications
@app.get("/schedules", response_class=HTMLResponse)
def schedules(request: Request, session: DB, saved: str = "", error: str = "", email: str = ""):
    tz = get_settings().timezone
    rows = []
    for key, source in SOURCES.items():
        setting = session.get(SourceSetting, key)
        try:
            preview = F.next_fire_times(setting.schedule, tz) if setting.enabled else []
        except ValueError:
            preview = []
        rows.append((source, setting, preview))
    return render(
        request, "schedules.html", rows=rows, presets=F.SCHEDULE_PRESETS, saved=saved, error=error,
        email=email, settings=get_settings(), worker=worker_status(session),
    )


@app.post("/schedules/{key}")
def save_schedule(
    key: str,
    request: Request,
    session: DB,
    schedule: Annotated[str, Form()],
    enabled: Annotated[Optional[str], Form()] = None,
):
    setting = session.get(SourceSetting, key)
    if setting is None:
        raise HTTPException(404)
    try:
        F.validate_cron(schedule, get_settings().timezone)
    except ValueError as e:
        return redirect(f"/schedules?error={key}:{e}", request)
    setting.schedule = schedule.strip()
    setting.enabled = enabled is not None
    return redirect(f"/schedules?saved={key}", request)


@app.post("/notifications/test")
def test_email(request: Request):
    s = get_settings()
    if not s.email_enabled:
        return redirect("/schedules?email=not-configured", request)
    try:
        send_email(s, "[VESNA Collector] Test email", "Email alerts are configured correctly.")
    except Exception as e:  # noqa: BLE001
        return redirect(f"/schedules?email=error:{e}", request)
    return redirect("/schedules?email=sent", request)


# --------------------------------------------------------------------- export
def _parse_day(value: str, default: date) -> date:
    try:
        return date.fromisoformat(value) if value else default
    except ValueError:
        raise HTTPException(400, f"Invalid date: {value}") from None


@app.get("/export", response_class=HTMLResponse)
def export_page(request: Request):
    today = date.today()
    return render(request, "export.html", start=(today - timedelta(days=7)).isoformat(), end=today.isoformat())


@app.get("/export/download")
def export_download(
    session: DB,
    source: str = "",
    station_id: Optional[int] = None,
    start: str = "",
    end: str = "",
    fmt: str = "csv",
):
    if fmt not in ("csv", "xlsx"):
        raise HTTPException(400, "fmt must be csv or xlsx")
    d_end = _parse_day(end, date.today())
    d_start = _parse_day(start, d_end - timedelta(days=7))
    t0 = datetime.combine(d_start, datetime.min.time())
    t1 = datetime.combine(d_end + timedelta(days=1), datetime.min.time())

    stmt = (
        select(Station.source_key, Station.external_id, Station.name, Station.river,
               Measurement.observed_at, Measurement.variable, Measurement.value, Measurement.value_text)
        .join(Station, Station.id == Measurement.station_id)
        .where(Measurement.observed_at >= t0, Measurement.observed_at < t1)
        .order_by(Station.source_key, Station.name, Measurement.observed_at, Measurement.variable)
    )
    if station_id:
        st = session.get(Station, station_id)
        if st is None:
            raise HTTPException(404)
        stmt = stmt.where(Measurement.station_id == station_id)
        label = f"{st.source_key}_{st.external_id}"
    elif source:
        if source not in SOURCES:
            raise HTTPException(400, "Unknown source")
        stmt = stmt.where(Station.source_key == source)
        label = source
    else:
        label = "all"
    filename = f"vesna_{label}_{d_start:%Y%m%d}-{d_end:%Y%m%d}.{fmt}"
    header = ["source", "station_id", "station", "river", "observed_at", "variable", "unit", "value", "value_text"]

    def row_values(r):
        var = SOURCES[r.source_key].variable(r.variable)
        return [r.source_key, r.external_id, r.name, r.river or "", r.observed_at.strftime("%Y-%m-%d %H:%M"),
                r.variable, var.unit if var else "", r.value, r.value_text or ""]

    result = session.execute(stmt.execution_options(yield_per=5000))
    if fmt == "csv":
        def stream():
            buf = io.StringIO()
            writer = csv.writer(buf)
            buf.write("\ufeff")  # BOM so Excel opens UTF-8 (Slovak names) correctly
            writer.writerow(header)
            for i, r in enumerate(result, 1):
                writer.writerow(row_values(r))
                if i % 2000 == 0:
                    yield buf.getvalue()
                    buf.seek(0)
                    buf.truncate()
            yield buf.getvalue()

        return StreamingResponse(stream(), media_type="text/csv; charset=utf-8",
                                 headers={"Content-Disposition": f'attachment; filename="{filename}"'})

    from openpyxl import Workbook

    wb = Workbook(write_only=True)
    ws = wb.create_sheet("measurements")
    ws.append(header)
    for r in result:
        ws.append(row_values(r))
    out = io.BytesIO()
    wb.save(out)
    return Response(out.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# --------------------------------------------------------------------- health
@app.get("/health")
def health(session: DB):
    w = worker_status(session)
    return JSONResponse({"status": "ok", "worker_online": w.online, "worker_last_seen": F.fmt_dt(w.last_seen, True)})
