from __future__ import annotations

import csv
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

SEED = Path(__file__).resolve().parent.parent / "seed" / "water_level_stations.csv"


class WaterLevelSource(Source):
    key = "water_level"
    name = "Water levels"
    description = "Water level (cm) at ~400 river gauging stations, 15-minute resolution, last ~24 h per page."
    mode = "per_station"
    default_schedule = "15 */6 * * *"
    variables = [Variable("water_level_cm", "Water level", "cm")]

    def seed_stations(self) -> list[StationSpec]:
        out: dict[str, StationSpec] = {}
        with open(SEED, encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                url = normalize_shmu_url(row["link"])
                ext = query_param(url, "station_id") or url
                out[ext] = StationSpec(external_id=ext, name=row["Stanice"].strip(), river=row["Toky"].strip(), url=url)
        return list(out.values())

    def parse_station_page(self, html: str) -> list[Observation]:
        table = find_table(soup(html), "table.dynamictable.w600", "water level")
        rows = table.find_all("tr")
        header = [h.lower() for h in cell_texts(rows[0])] if rows else []
        if len(header) < 2 or "čas" not in header[0]:
            raise ParseError(f"Unexpected water level table header: {header}")
        obs = []
        for row in rows[1:]:
            cells = cell_texts(row)
            if len(cells) < 2 or not cells[0]:
                continue
            obs.append(Observation(parse_datetime(cells[0]), "water_level_cm", parse_number(cells[1])))
        return obs
