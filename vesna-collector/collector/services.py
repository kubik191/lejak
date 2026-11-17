from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from collector.models import AppState, Run, RunStatus

HEARTBEAT_KEY = "worker_heartbeat"


def enqueue_run(session: Session, source_key: str, trigger: str) -> tuple[Run, bool]:
    """Queue a run unless one is already queued/running for this source. Returns (run, created)."""
    existing = session.scalar(
        select(Run).where(Run.source_key == source_key, Run.status.in_(RunStatus.ACTIVE)).order_by(Run.id)
    )
    if existing:
        return existing, False
    run = Run(source_key=source_key, trigger=trigger, status=RunStatus.QUEUED, queued_at=datetime.now())
    session.add(run)
    session.flush()
    return run, True


def next_queued_run(session: Session) -> Optional[Run]:
    return session.scalar(select(Run).where(Run.status == RunStatus.QUEUED).order_by(Run.queued_at, Run.id))


def recover_interrupted_runs(session: Session) -> int:
    runs = session.scalars(select(Run).where(Run.status == RunStatus.RUNNING)).all()
    for run in runs:
        run.status = RunStatus.FAILED
        run.finished_at = datetime.now()
        run.error = "Interrupted: the worker stopped while this run was in progress"
    return len(runs)


def write_heartbeat(session: Session, info: dict) -> None:
    payload = json.dumps({"pid": os.getpid(), **info})
    state = session.get(AppState, HEARTBEAT_KEY)
    if state is None:
        session.add(AppState(key=HEARTBEAT_KEY, value=payload, updated_at=datetime.now()))
    else:
        state.value = payload
        state.updated_at = datetime.now()


@dataclass
class WorkerStatus:
    online: bool
    last_seen: Optional[datetime]
    info: dict


def worker_status(session: Session, max_age_seconds: int = 45) -> WorkerStatus:
    state = session.get(AppState, HEARTBEAT_KEY)
    if state is None:
        return WorkerStatus(False, None, {})
    online = state.updated_at > datetime.now() - timedelta(seconds=max_age_seconds)
    try:
        info = json.loads(state.value or "{}")
    except ValueError:
        info = {}
    return WorkerStatus(online, state.updated_at, info)
