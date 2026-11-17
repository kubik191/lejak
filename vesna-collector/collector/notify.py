from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from sqlalchemy.orm import Session

from collector.config import Settings
from collector.models import Run, RunStatus, Station
from collector.sources import get_source

logger = logging.getLogger(__name__)


def send_email(settings: Settings, subject: str, body: str) -> None:
    """Send a plain-text email to the configured recipients. Raises on SMTP errors."""
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.alert_from
    msg["To"] = ", ".join(settings.alert_recipients)
    msg.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
        if settings.smtp_starttls:
            smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)


def _run_is_alarming(run: Run, settings: Settings) -> bool:
    if run.status == RunStatus.FAILED:
        return True
    if run.status == RunStatus.PARTIAL and run.stations_total:
        return run.stations_failed / run.stations_total >= settings.alert_failure_ratio
    return False


def build_alert(run: Run, newly_failing: list[Station], settings: Settings) -> tuple[str, str] | None:
    alarming = _run_is_alarming(run, settings)
    if not alarming and not newly_failing:
        return None
    source = get_source(run.source_key)
    lines = []
    if alarming:
        subject = f"[VESNA Collector] {source.name}: run #{run.id} {run.status}"
        lines += [
            f"Run #{run.id} of '{source.name}' finished with status: {run.status.upper()}",
            f"Stations OK: {run.stations_ok}/{run.stations_total}, failed: {run.stations_failed}",
        ]
        if run.error:
            lines.append(f"Error: {run.error}")
    else:
        subject = f"[VESNA Collector] {source.name}: {len(newly_failing)} station(s) started failing"
    if newly_failing:
        lines += ["", f"Stations that have now failed {settings.failing_after} runs in a row:"]
        lines += [f"  - {s.display_name}: {s.last_error}" for s in newly_failing[:50]]
        if len(newly_failing) > 50:
            lines.append(f"  … and {len(newly_failing) - 50} more")
    lines += ["", f"Details: {settings.public_url.rstrip('/')}/runs/{run.id}"]
    return subject, "\n".join(lines)


def after_run(session: Session, run: Run, newly_failing: list[Station], settings: Settings) -> None:
    alert = build_alert(run, newly_failing, settings)
    if alert is None:
        return
    if not settings.email_enabled:
        logger.info("Alert not sent (email not configured): %s", alert[0])
        return
    try:
        send_email(settings, *alert)
        logger.info("Alert email sent: %s", alert[0])
    except Exception as e:  # noqa: BLE001 — alerting must never break collection
        logger.error("Could not send alert email: %s", e)
