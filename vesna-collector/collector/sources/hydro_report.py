from __future__ import annotations

import re

from collector.sources.base import BulkRecord, Observation, ParseError, Source, StationSpec, Variable
from collector.sources.parsing import cell_texts, clean, find_table, parse_datetime, parse_number, slugify, soup

_CAPTION_DT = re.compile(r"(\d{1,2}\.\d{1,2}\.\d{4})\s*o\s*(\d{1,2}:\d{2})")

# Column index in the report table -> variable (None = text value)
_COLUMNS = {
    1: "water_level_cm",
    2: "water_level_change_cm",
    3: "discharge_m3s",
    4: "water_temp_c",
    5: "air_temp_c",
    6: "precip_mm",
    7: "discharge_return_days",
    8: "weather",
    9: "ice",
}


class HydroReportSource(Source):
    key = "hydro_report"
    name = "Daily hydrological report"
    description = "SHMÚ morning report (situation at 6:00): level, change, discharge, temperatures and weather for ~80 key stations."
    mode = "bulk"
    default_schedule = "30 8 * * *"
    bulk_urls = ["https://www.shmu.sk/sk/?page=1&id=ran_sprav"]
    variables = [
        Variable("water_level_cm", "Water level", "cm"),
        Variable("water_level_change_cm", "Level change (24 h)", "cm"),
        Variable("discharge_m3s", "Discharge", "m³/s"),
        Variable("water_temp_c", "Water temperature", "°C"),
        Variable("air_temp_c", "Air temperature", "°C"),
        Variable("precip_mm", "Precipitation", "mm"),
        Variable("discharge_return_days", "Discharge exceedance (Q M,N)", "days"),
        Variable("weather", "Weather", ""),
        Variable("ice", "Ice phenomena", ""),
    ]

    def parse_bulk_page(self, html: str, url: str) -> list[BulkRecord]:
        table = find_table(soup(html), "table.dynamictable", "hydrological report")
        caption = clean(table.caption.get_text(" ")) if table.caption else ""
        m = _CAPTION_DT.search(caption)
        if not m:
            raise ParseError(f"Report date not found in caption: {caption!r}")
        observed_at = parse_datetime(f"{m.group(1)} {m.group(2)}")

        records = []
        for row in table.find_all("tr"):
            cells = cell_texts(row)
            if len(cells) < 10 or not cells[0] or cells[0].startswith("Stanica") or cells[0].startswith("["):
                continue
            label = cells[0]
            name, _, river = label.partition(" - ")
            obs = []
            for idx, var in _COLUMNS.items():
                text = cells[idx] if idx < len(cells) else ""
                if var in ("weather", "ice"):
                    if text and text not in ("-", "//"):
                        obs.append(Observation(observed_at, var, parse_number(text), text))
                else:
                    obs.append(Observation(observed_at, var, parse_number(text)))
            records.append(
                BulkRecord(
                    StationSpec(external_id=slugify(label), name=name.strip(), river=river.strip() or None, url=url),
                    obs,
                )
            )
        if not records:
            raise ParseError("Hydrological report table has no station rows")
        return records
