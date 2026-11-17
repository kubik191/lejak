"""Parsers are tested against real SHMÚ pages saved in tests/fixtures (refresh them if SHMÚ changes its layout)."""
from datetime import datetime

import pytest

from collector.sources import SOURCES, ParseError
from collector.sources.parsing import normalize_shmu_url, parse_datetime, parse_number


@pytest.mark.parametrize(
    "text,expected",
    [("21", 21.0), ("-1.1", -1.1), ("0,5", 0.5), ("-", None), ("//", None), ("", None), ("abc", None)],
)
def test_parse_number(text, expected):
    assert parse_number(text) == expected


def test_parse_datetime_accepts_unpadded():
    assert parse_datetime("6.7.2026 5:00") == datetime(2026, 7, 6, 5, 0)
    with pytest.raises(ParseError):
        parse_datetime("yesterday")


def test_normalize_url_avoids_redirect():
    url = normalize_shmu_url("https://www.shmu.sk?page=1&id=hydro_zra_all&stationId=AHS5020&uhrny=24")
    assert url == "https://www.shmu.sk/sk/?page=1&id=hydro_zra_all&stationId=AHS5020&uhrny=24"


def test_water_level_page(fixture_html):
    obs = SOURCES["water_level"].parse_station_page(fixture_html("water_level.html"))
    assert len(obs) > 90
    assert {o.variable for o in obs} == {"water_level_cm"}
    assert all(o.value is not None for o in obs)
    assert obs[0].observed_at > obs[-1].observed_at


def test_precipitation_page(fixture_html):
    obs = SOURCES["precipitation"].parse_station_page(fixture_html("precipitation.html"))
    assert {o.variable for o in obs} == {"precip_1h", "precip_3h", "precip_6h", "precip_12h", "precip_24h"}
    assert len(obs) == 5 * len({o.observed_at for o in obs})


def test_hydro_report_page(fixture_html):
    records = SOURCES["hydro_report"].parse_bulk_page(fixture_html("hydro_report.html"), "u")
    assert len(records) > 70
    first = records[0]
    assert (first.station.name, first.station.river) == ("Moravský Sv. Ján", "Morava")
    values = {o.variable: o for o in first.observations}
    assert values["water_level_cm"].value == 133
    assert values["weather"].value_text == "Jasno"
    assert len({r.station.external_id for r in records}) == len(records)
    assert all(o.observed_at == datetime(2026, 10, 28, 6, 0) for r in records for o in r.observations)


def test_groundwater_page(fixture_html):
    records = SOURCES["groundwater"].parse_bulk_page(fixture_html("groundwater.html"), "u")
    kinds = {r.station.meta["kind"] for r in records}
    assert kinds == {"borehole", "spring"}
    borehole = next(r for r in records if r.station.external_id == "borehole-5")
    assert borehole.station.name == "Kopčany"
    assert borehole.observations[0].variable == "groundwater_level_m"
    spring = next(r for r in records if r.station.meta["kind"] == "spring")
    assert spring.observations[0].variable == "spring_yield_ls"


def test_unavailable_station_has_clear_error():
    html = "<html><body><p>Stanica nie je momentálne dostupná!</p></body></html>"
    with pytest.raises(ParseError, match="unavailable"):
        SOURCES["water_level"].parse_station_page(html)
    faulty = "<p>Zrážkomerná stanica má poruchu a nie je možné prezerať jej dáta!</p>"
    with pytest.raises(ParseError, match="fault"):
        SOURCES["precipitation"].parse_station_page(faulty)


def test_layout_change_is_detected():
    with pytest.raises(ParseError, match="layout"):
        SOURCES["precipitation"].parse_station_page("<html><table class='other'></table></html>")


def test_seed_lists_have_unique_ids():
    for key in ("water_level", "precipitation"):
        specs = SOURCES[key].seed_stations()
        assert len(specs) > 300
        assert len({s.external_id for s in specs}) == len(specs)
