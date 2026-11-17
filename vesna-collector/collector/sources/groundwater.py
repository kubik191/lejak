from __future__ import annotations

from collector.sources.base import BulkRecord, Observation, ParseError, Source, StationSpec, Variable
from collector.sources.parsing import cell_texts, clean, parse_datetime, parse_number, soup


def _col(header: list[str], *needles: str) -> int:
    for i, h in enumerate(header):
        low = h.lower()
        if all(n in low for n in needles):
            return i
    raise ParseError(f"Column {needles} not found in groundwater header {header}")


class GroundwaterSource(Source):
    key = "groundwater"
    name = "Groundwater"
    description = "Latest groundwater level in ~90 boreholes and yield of ~30 springs (one value per station per update)."
    mode = "bulk"
    default_schedule = "0 */6 * * *"
    bulk_urls = ["https://www.shmu.sk/sk/?page=1&id=pzv_kvantita"]
    variables = [
        Variable("groundwater_level_m", "Groundwater level", "m a.s.l."),
        Variable("spring_yield_ls", "Spring yield", "l/s"),
    ]

    def parse_bulk_page(self, html: str, url: str) -> list[BulkRecord]:
        tables = soup(html).select("table.dynamictable")
        records: list[BulkRecord] = []
        for table in tables:
            caption = clean(table.caption.get_text(" ")).lower() if table.caption else ""
            if "sondy" in caption:
                kind = "borehole"
            elif "pramene" in caption:
                kind = "spring"
            else:
                continue
            rows = table.find_all("tr")
            header = cell_texts(rows[0])
            i_id, i_loc = _col(header, "číslo"), _col(header, "lokality")
            i_basin, i_time = _col(header, "povodie"), _col(header, "dátum")
            if kind == "borehole":
                i_val, var = _col(header, "úroveň"), "groundwater_level_m"
                i_spring = None
                extra = {"depth_m": _col(header, "hĺbka"), "elevation_m": _col(header, "výška")}
            else:
                i_val, var = _col(header, "výdatnosť"), "spring_yield_ls"
                i_spring = _col(header, "prameňa")
                extra = {"elevation_m": _col(header, "výška")}

            for row in rows[1:]:
                cells = cell_texts(row)
                if len(cells) <= max(i_val, i_time) or not cells[i_id]:
                    continue
                name = cells[i_loc] if i_spring is None else f"{cells[i_loc]} – {cells[i_spring]}"
                meta = {"kind": kind, "shmu_number": cells[i_id]}
                meta.update({k: parse_number(cells[i]) for k, i in extra.items()})
                obs = []
                if cells[i_time] and cells[i_time] != "-":
                    obs.append(Observation(parse_datetime(cells[i_time]), var, parse_number(cells[i_val])))
                records.append(
                    BulkRecord(
                        StationSpec(
                            external_id=f"{kind}-{cells[i_id]}",
                            name=name,
                            basin=cells[i_basin] or None,
                            url=url,
                            meta=meta,
                        ),
                        obs,
                    )
                )
        if not records:
            raise ParseError("No borehole/spring tables found on groundwater page (layout may have changed)")
        return records
