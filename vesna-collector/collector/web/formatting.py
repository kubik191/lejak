from __future__ import annotations

from datetime import datetime
from typing import Optional

from apscheduler.triggers.cron import CronTrigger

SCHEDULE_PRESETS = [
    ("0 * * * *", "Every hour"),
    ("15 */3 * * *", "Every 3 hours"),
    ("15 */6 * * *", "Every 6 hours"),
    ("15 */12 * * *", "Every 12 hours"),
    ("30 8 * * *", "Daily at 08:30"),
    ("40 17 * * *", "Daily at 17:40"),
]

STATUS_STYLES = {
    "queued": "bg-slate-100 text-slate-700 ring-slate-300",
    "running": "bg-blue-50 text-blue-700 ring-blue-300",
    "success": "bg-emerald-50 text-emerald-700 ring-emerald-300",
    "partial": "bg-amber-50 text-amber-800 ring-amber-300",
    "failed": "bg-rose-50 text-rose-700 ring-rose-300",
    "cancelled": "bg-slate-100 text-slate-500 ring-slate-300",
}

HEALTH_STYLES = {
    "ok": ("bg-emerald-500", "Healthy"),
    "warning": ("bg-amber-400", "Recent failure"),
    "failing": ("bg-rose-500", "Failing"),
    "stale": ("bg-orange-400", "No new data"),
    "new": ("bg-slate-300", "Not collected yet"),
    "disabled": ("bg-slate-200", "Disabled"),
}


def fmt_dt(value: Optional[datetime], with_seconds: bool = False) -> str:
    if not value:
        return "—"
    return value.strftime("%d.%m.%Y %H:%M:%S" if with_seconds else "%d.%m.%Y %H:%M")


def fmt_ago(value: Optional[datetime], now: Optional[datetime] = None) -> str:
    if not value:
        return "never"
    now = now or datetime.now()
    secs = (now - value).total_seconds()
    future = secs < 0
    secs = abs(secs)
    if secs < 60:
        text = f"{int(secs)} s"
    elif secs < 3600:
        text = f"{int(secs // 60)} min"
    elif secs < 86400:
        text = f"{secs / 3600:.1f} h".replace(".0 h", " h")
    else:
        text = f"{int(secs // 86400)} d"
    return f"in {text}" if future else f"{text} ago"


def fmt_duration(seconds: Optional[float]) -> str:
    if seconds is None:
        return "—"
    seconds = int(round(seconds))
    if seconds < 60:
        return f"{seconds}s"
    m, s = divmod(seconds, 60)
    if m < 60:
        return f"{m}m {s:02d}s"
    h, m = divmod(m, 60)
    return f"{h}h {m:02d}m"


def fmt_int(value: Optional[int]) -> str:
    return f"{value or 0:,}".replace(",", " ")


def describe_cron(expr: Optional[str]) -> str:
    if not expr:
        return "—"
    for preset, label in SCHEDULE_PRESETS:
        if expr.strip() == preset:
            return label
    parts = expr.split()
    if len(parts) == 5 and parts[2:] == ["*", "*", "*"] and parts[0].isdigit():
        minute, hour = int(parts[0]), parts[1]
        if hour == "*":
            return f"Every hour at :{minute:02d}"
        if hour.startswith("*/") and hour[2:].isdigit():
            return f"Every {hour[2:]} hours at :{minute:02d}"
        if all(h.isdigit() for h in hour.split(",")):
            return "Daily at " + ", ".join(f"{int(h):02d}:{minute:02d}" for h in hour.split(","))
    return f"Cron: {expr}"


def validate_cron(expr: str, timezone: str) -> CronTrigger:
    return CronTrigger.from_crontab(expr.strip(), timezone=timezone)


def next_fire_times(expr: str, timezone: str, count: int = 3) -> list[datetime]:
    trigger = validate_cron(expr, timezone)
    out: list[datetime] = []
    prev = None
    now = datetime.now().astimezone()
    for _ in range(count):
        nxt = trigger.get_next_fire_time(prev, prev or now)
        if nxt is None:
            break
        out.append(nxt.replace(tzinfo=None))
        prev = nxt
    return out
