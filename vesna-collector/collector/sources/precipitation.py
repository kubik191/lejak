from __future__ import annotations

import csv
import re
from pathlib import Path

from collector.sources.base import Observation, ParseError, Source, StationSpec, Variable
from collector.sources.parsing import (
    cell_texts,
    find_table,
    normalize_shmu_url,
    parse_datetime,
    parse_number,
    query_param,
    soup,
)

SEED = Path(__file__).resolve().parent.parent / "seed" / "precipitation_stations.csv"
_HOURS = re.compile(r"(\d+)\s*h", re.I)


class PrecipitationSource(Source):
    key = "precipitation"
    name = "Precipitation"
    description = "Hourly rainfall totals (1/3/6/12/24 h windows) at ~480 rain gauges, last 24 h per page."
    mode = "per_station"
    default_schedule = "30 */6 * * *"
    variables = [Variable(f"precip_{h}h", f"Precipitation {h} h", "mm") for h in (1, 3, 6, 12, 24)]

    def seed_stations(self) -> list[StationSpec]:
        out: dict[str, StationSpec] = {}
        with open(SEED, encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                url = normalize_shmu_url(row["Link"])
                ext = query_param(url, "stationId") or url
                label = row["Name"].strip()
                name, _, river = label.partition(" - ")
                out[ext] = StationSpec(external_id=ext, name=name.strip(), river=river.strip() or None, url=url)
        return list(out.values())

    def parse_station_page(self, html: str) -> list[Observation]:
        table = find_table(soup(html), "table.dynamictable.w-small-width-max", "precipitation")
        rows = table.find_all("tr")
        header = cell_texts(rows[0]) if rows else []
        if not header or "čas" not in header[0].lower():
            raise ParseError(f"Unexpected precipitation table header: {header}")

        columns: list[str | None] = [None]
        for h in header[1:]:
            m = _HOURS.search(h)
            columns.append(f"precip_{m.group(1)}h" if m else None)

        obs = []
        for row in rows[1:]:
            cells = cell_texts(row)
            if len(cells) < 2 or not cells[0]:
                continue
            ts = parse_datetime(cells[0])
            for var, text in zip(columns[1:], cells[1:]):
                if var and self.variable(var):
                    obs.append(Observation(ts, var, parse_number(text)))
        return obs
