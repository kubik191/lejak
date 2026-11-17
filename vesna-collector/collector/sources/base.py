from __future__ import annotations

from abc import ABC
from dataclasses import dataclass, field
from datetime import datetime
from typing import ClassVar, Literal, Optional


class ParseError(Exception):
    """The page was fetched but did not contain the expected data (layout change, empty page)."""


@dataclass(frozen=True)
class Variable:
    key: str
    label: str
    unit: str = ""


@dataclass
class Observation:
    observed_at: datetime
    variable: str
    value: Optional[float]
    value_text: Optional[str] = None


@dataclass
class StationSpec:
    external_id: str
    name: str
    river: Optional[str] = None
    basin: Optional[str] = None
    url: Optional[str] = None
    meta: dict = field(default_factory=dict)


@dataclass
class BulkRecord:
    station: StationSpec
    observations: list[Observation]


class Source(ABC):
    """
    A data source plug-in.

    ``per_station`` sources fetch one page per enabled station (``parse_station_page``).
    ``bulk`` sources fetch a few pages that each contain many stations (``parse_bulk_page``);
    stations are discovered automatically from those pages.
    """

    key: ClassVar[str]
    name: ClassVar[str]
    description: ClassVar[str]
    mode: ClassVar[Literal["per_station", "bulk"]]
    default_schedule: ClassVar[str]  # crontab expression
    variables: ClassVar[list[Variable]]
    bulk_urls: ClassVar[list[str]] = []

    def seed_stations(self) -> list[StationSpec]:
        return []

    def parse_station_page(self, html: str) -> list[Observation]:
        raise NotImplementedError

    def parse_bulk_page(self, html: str, url: str) -> list[BulkRecord]:
        raise NotImplementedError

    @classmethod
    def variable(cls, key: str) -> Optional[Variable]:
        return next((v for v in cls.variables if v.key == key), None)
