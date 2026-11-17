"""
Command line version of the Hydro Doplnenie importer.

The import rules live in hydro_doplnenie/engine.py (shared with the QGIS plugin).
Run from the project root, dry-run first:

  python hydro_automation/import_to_doplnenie.py

  python hydro_automation/import_to_doplnenie.py --apply

Close the layer in QGIS before --apply; Windows locks open shapefiles.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from hydro_doplnenie.engine import (  # noqa: E402
    IMPORTABLE_ROLES,
    backup_shapefile,
    collect_new_features,
    discover_source_dirs,
    find_unknown_shapefiles,
    read_features,
    shapefile_summary,
    write_report,
    write_shapefile,
)

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DEST = ROOT / "QGIS-FILES" / "HYDROLOGY-ADDITION" / "Hydrologia_SK_doplnenie.shp"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Copy Qn / Gauge / Waves points into Hydrologia_SK_doplnenie with field mapping."
    )
    parser.add_argument("--dest", type=Path, default=DEFAULT_DEST, help="Destination shapefile (Doplnenie).")
    parser.add_argument(
        "--source",
        type=Path,
        action="append",
        default=None,
        help="Source folder (Hydrological_data) or project root to scan. Repeatable.",
    )
    parser.add_argument(
        "--use",
        action="append",
        default=[],
        metavar="FILE.shp=ROLE",
        help=f"Also read a shapefile with another name, as one of {', '.join(IMPORTABLE_ROLES)}. Repeatable.",
    )
    parser.add_argument("--apply", action="store_true", help="Write the destination shapefile. Default is dry-run.")
    parser.add_argument(
        "--no-fill-levels", action="store_true", help="Do not interpolate H_Q* from Excel rating curves."
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=None,
        help="CSV report path. Default: hydro_automation/last_import_report.csv",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    dest = args.dest.resolve()
    if not dest.exists():
        print(f"destination shapefile not found: {dest}", file=sys.stderr)
        return 1

    roots = args.source or [ROOT]
    source_dirs = discover_source_dirs(roots)
    source_dirs = [p for p in source_dirs if dest.parent.resolve() not in p.parents and p != dest.parent.resolve()]

    extra_layers = []
    for spec in args.use:
        file_part, _, role = spec.rpartition("=")
        shp = Path(file_part).resolve()
        if role not in IMPORTABLE_ROLES or not shp.exists():
            print(f"bad --use {spec!r}: need an existing FILE.shp=ROLE, ROLE one of {IMPORTABLE_ROLES}", file=sys.stderr)
            return 1
        extra_layers.append((shp, role))
        if shp.parent not in source_dirs:
            source_dirs.append(shp.parent)
    used = {shp for shp, _ in extra_layers}
    for shp in find_unknown_shapefiles(roots, exclude=[dest]):
        if shp in used:
            continue
        try:
            summary = shapefile_summary(shp)
        except Exception as exc:
            print(f"other shapefile (cannot open, not used): {shp}: {exc}")
            continue
        if summary["is_point"]:
            print(f"other point shapefile, not used: {shp} ({summary['count']} points); "
                  f"add --use \"{shp}={summary['guess']}\" to include it")

    if not source_dirs:
        print("no source folders with Qn.shp or Gauge_Refrence_Level.shp found", file=sys.stderr)
        return 1

    dest_features, dest_schema, dest_crs = read_features(dest)
    planned, report = collect_new_features(
        source_dirs,
        dest_features,
        dest_schema["properties"],
        fill_levels=not args.no_fill_levels,
        dest_crs=dest_crs,
        extra_layers=extra_layers,
    )

    counts: dict[str, int] = {}
    for row in report:
        counts[row["action"]] = counts.get(row["action"], 0) + 1

    print(f"destination: {dest} ({len(dest_features)} existing points)")
    print("source folders:")
    for folder in source_dirs:
        print(f"  {folder}")
    print("actions:")
    for action, n in sorted(counts.items()):
        print(f"  {action}: {n}")
    print(f"new points: {len(planned)}")

    report_path = args.report or (Path(__file__).resolve().parent / "last_import_report.csv")
    write_report(report_path, report)
    print(f"report: {report_path}")

    if not planned:
        print("nothing new to add; destination left unchanged")
        return 0

    if not args.apply:
        print("dry-run only; pass --apply to write the destination shapefile (a backup is created first)")
        return 0

    bak = backup_shapefile(dest)
    print(f"backup: {bak}")
    write_shapefile(dest, dest_schema, dest_crs, dest_features + planned)
    print(f"wrote {len(dest_features) + len(planned)} points to {dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
