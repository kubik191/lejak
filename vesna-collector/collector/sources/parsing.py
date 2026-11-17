from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from typing import Optional
from urllib.parse import parse_qs, urlencode, urlparse

from bs4 import BeautifulSoup, Tag

from collector.sources.base import ParseError

# SHMÚ uses these to mean "no value"
_EMPTY = {"", "-", "--", "//", "/", "n/a", "x"}

_DT_FORMATS = ("%d.%m.%Y %H:%M", "%d.%m.%Y %H:%M:%S", "%d.%m.%Y")


def soup(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "lxml")


def clean(text: Optional[str]) -> str:
    return re.sub(r"\s+", " ", (text or "").replace("\xa0", " ")).strip()


def parse_number(text: Optional[str]) -> Optional[float]:
    t = clean(text).replace(",", ".").replace(" ", "")
    if t.lower() in _EMPTY:
        return None
    try:
        return float(t)
    except ValueError:
        return None


def parse_datetime(text: Optional[str]) -> datetime:
    t = clean(text)
    for fmt in _DT_FORMATS:
        try:
            return datetime.strptime(t, fmt)
        except ValueError:
            continue
    raise ParseError(f"Unrecognised date/time: {t!r}")


def cell_texts(row: Tag) -> list[str]:
    return [clean(c.get_text(" ", strip=True)) for c in row.find_all(["td", "th"])]


def find_table(doc: BeautifulSoup, selector: str, what: str) -> Tag:
    table = doc.select_one(selector)
    if table is None:
        text = doc.get_text(" ").lower()
        if "nie je momentálne dostupná" in text:
            raise ParseError("Station is currently unavailable on SHMÚ (no data published)")
        if "má poruchu" in text:
            raise ParseError("SHMÚ reports a fault at this station (no data published)")
        if "captcha" in text:
            raise ParseError(f"Blocked by SHMÚ (captcha page) while looking for {what}")
        raise ParseError(f"No {what} table found on page (layout may have changed)")
    return table


def slugify(text: str) -> str:
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")


def normalize_shmu_url(url: str) -> str:
    """Canonical https://www.shmu.sk/sk/?... form, avoiding a redirect per request."""
    parsed = urlparse(url.strip())
    query = urlencode({k: v[0] for k, v in parse_qs(parsed.query).items()})
    return f"https://www.shmu.sk/sk/?{query}"


def query_param(url: str, *names: str) -> Optional[str]:
    q = parse_qs(urlparse(url).query)
    for n in names:
        if q.get(n):
            return q[n][0]
    return None
