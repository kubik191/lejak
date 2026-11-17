"""
Background worker: owns the schedule and executes queued runs one at a time.

Runs independently of the web app; the two communicate only through the database
(the web app inserts queued runs and edits schedules, the worker picks them up).
"""
from __future__ import annotations

import asyncio
import logging
import signal
import sys
import time
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import delete, select

from collector.config import get_settings
from collector.db import init_db, session_scope
from collector.engine import execute_run
from collector.models import Run, RunStatus, SourceSetting
from collector.services import enqueue_run, next_queued_run, recover_interrupted_runs, write_heartbeat
from collector.sources import SOURCES

logger = logging.getLogger("collector.worker")


class Worker:
    def __init__(self):
        self.settings = get_settings()
        self.scheduler = BackgroundScheduler(timezone=self.settings.timezone)
        self._job_schedules: dict[str, str] = {}
        self.current_run_id: int | None = None
        self.started_at = datetime.now()

    # --- scheduled jobs -------------------------------------------------
    def _enqueue_scheduled(self, source_key: str) -> None:
        with session_scope() as session:
            run, created = enqueue_run(session, source_key, "schedule")
            if created:
                logger.info("Scheduled run queued: %s (#%s)", source_key, run.id)
            else:
                logger.warning("Scheduled run for %s skipped: run #%s still %s", source_key, run.id, run.status)

    def sync_schedules(self) -> None:
        """Reconcile APScheduler jobs with the schedules stored in the database."""
        with session_scope() as session:
            for setting in session.scalars(select(SourceSetting)).all():
                if setting.key not in SOURCES:
                    continue
                job_id = f"source:{setting.key}"
                wanted = setting.schedule.strip() if setting.enabled else None
                if wanted != self._job_schedules.get(setting.key):
                    if self.scheduler.get_job(job_id):
                        self.scheduler.remove_job(job_id)
                    if wanted:
                        try:
                            trigger = CronTrigger.from_crontab(wanted, timezone=self.settings.timezone)
                        except ValueError as e:
                            logger.error("Invalid schedule %r for %s: %s", wanted, setting.key, e)
                            wanted = None
                        else:
                            self.scheduler.add_job(
                                self._enqueue_scheduled, trigger, args=[setting.key], id=job_id,
                                misfire_grace_time=3600, coalesce=True, max_instances=1,
                            )
                            logger.info("Schedule for %s: %s", setting.key, wanted)
                    self._job_schedules[setting.key] = wanted
                job = self.scheduler.get_job(job_id)
                fire = getattr(job, "next_run_time", None) if job else None
                nxt = fire.replace(tzinfo=None) if fire else None
                if setting.next_run_at != nxt:
                    setting.next_run_at = nxt

    def heartbeat(self) -> None:
        with session_scope() as session:
            write_heartbeat(session, {
                "started_at": self.started_at.isoformat(timespec="seconds"),
                "current_run_id": self.current_run_id,
            })

    def cleanup(self) -> None:
        cutoff = datetime.now() - timedelta(days=self.settings.run_retention_days)
        with session_scope() as session:
            res = session.execute(delete(Run).where(Run.queued_at < cutoff, Run.status.in_(RunStatus.FINISHED)))
            if res.rowcount:
                logger.info("Removed %d runs older than %d days", res.rowcount, self.settings.run_retention_days)

    # --- main loop ------------------------------------------------------
    def run_forever(self) -> None:
        init_db()
        with session_scope() as session:
            n = recover_interrupted_runs(session)
            if n:
                logger.warning("Marked %d interrupted run(s) as failed", n)

        self.scheduler.start()
        self.sync_schedules()
        self.heartbeat()
        self.scheduler.add_job(self.sync_schedules, "interval", seconds=15, id="sync", max_instances=1)
        self.scheduler.add_job(self.heartbeat, "interval", seconds=self.settings.worker_heartbeat_seconds, id="hb", max_instances=1)
        self.scheduler.add_job(self.cleanup, "cron", hour=3, minute=7, id="cleanup")
        logger.info("Worker started (pid-based heartbeat every %ss)", self.settings.worker_heartbeat_seconds)

        try:
            while True:
                with session_scope() as session:
                    run = next_queued_run(session)
                    run_id = run.id if run else None
                if run_id is None:
                    time.sleep(self.settings.worker_poll_seconds)
                    continue
                self.current_run_id = run_id
                self.heartbeat()
                try:
                    asyncio.run(execute_run(run_id, self.settings))
                except Exception:  # noqa: BLE001
                    logger.exception("Run %s failed unexpectedly", run_id)
                    with session_scope() as session:
                        r = session.get(Run, run_id)
                        if r and r.status in RunStatus.ACTIVE:
                            r.status, r.finished_at, r.error = RunStatus.FAILED, datetime.now(), "Worker error (see logs)"
                finally:
                    self.current_run_id = None
                    self.heartbeat()
        except (KeyboardInterrupt, SystemExit):
            logger.info("Worker stopping")
            with session_scope() as session:
                recover_interrupted_runs(session)
        finally:
            self.scheduler.shutdown(wait=False)


def main() -> None:
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    Worker().run_forever()
