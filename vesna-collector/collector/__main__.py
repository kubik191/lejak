"""
Command line entry point.

    python -m collector web        # dashboard on http://localhost:8000
    python -m collector worker     # scheduler + run executor
    python -m collector run water_level   # one run in the foreground ("all" for every source)
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import sys


def _setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("apscheduler").setLevel(logging.WARNING)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="collector", description="VESNA Collector")
    sub = parser.add_subparsers(dest="cmd", required=True)
    web = sub.add_parser("web", help="Run the web dashboard")
    web.add_argument("--host", default="127.0.0.1")
    web.add_argument("--port", type=int, default=8000)
    sub.add_parser("worker", help="Run the scheduler/worker")
    run = sub.add_parser("run", help="Run a collection now, in the foreground")
    run.add_argument("source", help="Source key or 'all'")
    sub.add_parser("init", help="Create the database and seed stations")
    args = parser.parse_args(argv)

    _setup_logging()

    if args.cmd == "web":
        import uvicorn

        uvicorn.run("collector.web.app:app", host=args.host, port=args.port, log_level="info")
    elif args.cmd == "worker":
        from collector.worker import main as worker_main

        worker_main()
    elif args.cmd == "init":
        from collector.db import init_db

        init_db()
        print("Database ready.")
    elif args.cmd == "run":
        from collector.db import init_db, session_scope
        from collector.engine import execute_run
        from collector.services import enqueue_run
        from collector.sources import SOURCES

        init_db()
        keys = list(SOURCES) if args.source == "all" else [args.source]
        unknown = [k for k in keys if k not in SOURCES]
        if unknown:
            parser.error(f"unknown source {unknown[0]!r}; choose from: all, {', '.join(SOURCES)}")
        worst = 0
        for key in keys:
            with session_scope() as session:
                run, created = enqueue_run(session, key, "cli")
                run_id = run.id
            if not created:
                print(f"{key}: run #{run_id} is already {run.status}; skipping")
                continue
            status = asyncio.run(execute_run(run_id))
            print(f"{key}: run #{run_id} -> {status}")
            worst = max(worst, {"success": 0, "partial": 1}.get(status, 2))
        return worst
    return 0


if __name__ == "__main__":
    sys.exit(main())
