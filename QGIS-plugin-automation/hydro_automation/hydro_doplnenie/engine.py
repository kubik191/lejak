"""
Copy hydrological point layers into Hydrologia_SK_doplnenie.

Replaces the QGIS workflow: zoom to a source feature, add a point in
Doplnenie at the same place, then copy attributes.

Sources (per model folder, usually Hydrological_data):
  Qn.shp                  -> Druh_bodu = prietok, with Qmax_*
  Gauge_Refrence_Level    -> Druh_bodu = QH, F0_vodočt -> nula_vodoc
  Rating_Curves           -> not copied as points (same places as gauges);
                             Excel merne krivky are used for H_Q* instead
  Waves                   -> Druh_bodu = "vlna Q10 Q100 ..." (one label per wave
                             referenced in the Q10/Q100/... columns); Qmax_N is
                             the peak of the matching Waves_*.xls file
  *.dfs0 (MIKE)           -> wave without a Waves layer; placed on the Qn point
                             whose Qmax_N equals the wave peak (name as tie-break)
  *.docx                  -> scenario / boundary-condition notes, shown as info only

Used by the QGIS plugin and by the command line wrapper
(hydro_automation/import_to_doplnenie.py).
"""

from __future__ import annotations

import csv
import html
import math
import re
import shutil
import struct
import sys
import unicodedata
import zipfile
from datetime import datetime
from pathlib import Path

import fiona
import pandas as pd
from fiona.crs import from_epsg
from fiona.transform import transform as transform_xy

SOURCE_LAYERS = ("Qn", "Gauge_Refrence_Level", "Rating_Curves", "Waves")
IGNORE_DATE_FIELDS = ("Geodesy_st",)

# Wave points in Doplnenie are often placed by hand next to the gauge and named
# after the reservoir/profile from the wave sheet, so match them by river + distance.
WAVE_MATCH_RADIUS_M = 250.0
WAVE_FIELD_RE = re.compile(r"^Q(\d+)(_\w+)?$", re.IGNORECASE)

EXPLICIT_MAP = {
    "tok": ("Tok", "tok"),
    "profil": ("Profil", "profil"),
    "rkm_DHI": ("rkm", "rkm_DHI"),
    "A_Povodia": ("Plocha_pov", "A_Povodia"),
    "Hydrolog_C": ("hydro_cisl", "hydro_cislo", "Hydrolog_C"),
    "Presnost": ("tr_spolah", "Presnost"),
    "nula_vodoc": ("F0_vodočt", "F0_vodoc", "F0_vodočt", "nula_vodoc"),
}

QMAX_TO_H = {
    "Qmax_5": "H_Q5",
    "Qmax_10": "H_Q10",
    "Qmax_20": "H_Q20",
    "Qmax_50": "H_Q50",
    "Qmax_100": "H_Q100",
    "Qmax_1000": "H_Q1000",
}

VYBREZUJE = "vybrežuje"


def norm_text(value) -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return ""
    return str(value).strip()


def fold_key(value) -> str:
    return " ".join(norm_text(value).lower().split())


def fold_druh(value) -> str:
    text = fold_key(value)
    if text in {"prieotk", "prietoky"}:
        return "prietok"
    return text


def is_missing(value) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    return False


def get_prop(props: dict, *names):
    folded = {fold_key(k): v for k, v in props.items()}
    for name in names:
        if name in props and not is_missing(props[name]):
            return props[name]
        key = fold_key(name)
        if key in folded and not is_missing(folded[key]):
            return folded[key]
    for name in names:
        if name in props:
            return props[name]
        key = fold_key(name)
        if key in folded:
            return folded[key]
    return None


def parse_number(value):
    if is_missing(value):
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    text = str(value).strip().replace(" ", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def clip_value(value, field_type: str):
    if is_missing(value):
        return None
    kind = field_type.split(":")[0]
    if kind.startswith("str"):
        text = str(value)
        if ":" in field_type:
            width = int(field_type.split(":")[1])
            text = text[:width]
        return text
    if kind.startswith("float"):
        number = parse_number(value)
        return None if number is None else float(number)
    if kind.startswith("int"):
        number = parse_number(value)
        return None if number is None else int(round(number))
    return value


def point_coords(geom) -> tuple[float, float] | None:
    if not geom:
        return None
    if geom.get("type") == "Point":
        x, y = geom["coordinates"][:2]
        return float(x), float(y)
    if geom.get("type") == "MultiPoint" and geom.get("coordinates"):
        x, y = geom["coordinates"][0][:2]
        return float(x), float(y)
    return None


def identity_key(tok, profil, rkm, druh, xy=None) -> tuple:
    rkm_n = parse_number(rkm)
    rkm_r = round(rkm_n, 4) if rkm_n is not None else None
    xy_r = None
    if xy:
        xy_r = (round(xy[0], 1), round(xy[1], 1))
    return (fold_key(tok), fold_key(profil), rkm_r, fold_druh(druh), xy_r)


CPG_ENCODINGS = {
    "utf-8": "utf-8",
    "utf8": "utf-8",
    "65001": "utf-8",
    "1250": "cp1250",
    "ansi 1250": "cp1250",
    "1252": "cp1252",
    "ansi 1252": "cp1252",
    "iso-8859-2": "iso-8859-2",
    "88592": "iso-8859-2",
}


def shapefile_encoding(path: Path) -> str | None:
    # QGIS sets SHAPE_ENCODING="" for GDAL, so without an explicit encoding
    # fiona inside QGIS returns mis-decoded text (e.g. "VarÃ­nka").
    for suffix in (".cpg", ".CPG"):
        cpg = path.with_suffix(suffix)
        if cpg.exists():
            text = cpg.read_text(encoding="ascii", errors="ignore").strip().lower()
            return CPG_ENCODINGS.get(text, text or None)
    return None


def read_features(path: Path) -> tuple[list[dict], dict, object]:
    ignore = []
    encoding = shapefile_encoding(path) if path.suffix.lower() == ".shp" else None
    open_kwargs = {"encoding": encoding} if encoding else {}
    with fiona.open(path, **open_kwargs) as src:
        schema = src.schema
        crs = src.crs
        for name in IGNORE_DATE_FIELDS:
            if name in schema.get("properties", {}):
                ignore.append(name)
    kwargs = dict(open_kwargs)
    if ignore:
        kwargs["ignore_fields"] = ignore
    with fiona.open(path, **kwargs) as src:
        features = []
        for feat in src:
            features.append(
                {
                    "geometry": feat.get("geometry"),
                    "properties": dict(feat.get("properties") or {}),
                }
            )
        return features, src.schema, src.crs


def discover_source_dirs(roots: list[Path]) -> list[Path]:
    found = []
    seen = set()
    for root in roots:
        root = root.resolve()
        if not root.exists():
            continue
        candidates = []
        if root.is_file() and root.suffix.lower() == ".shp":
            candidates.append(root.parent)
        elif (root / "Qn.shp").exists() or (root / "Gauge_Refrence_Level.shp").exists():
            candidates.append(root)
        else:
            for shp in root.rglob("Qn.shp"):
                candidates.append(shp.parent)
            for shp in root.rglob("Gauge_Refrence_Level.shp"):
                candidates.append(shp.parent)
        for folder in candidates:
            key = str(folder.resolve()).lower()
            if key not in seen:
                seen.add(key)
                found.append(folder.resolve())
    return found


KNOWN_STEMS = {layer.lower() for layer in SOURCE_LAYERS}
IMPORTABLE_ROLES = ("Qn", "Gauge_Refrence_Level", "Waves")


def find_unknown_shapefiles(roots: list[Path], exclude: list[Path] = ()) -> list[Path]:
    """Shapefiles under roots whose name is not one of SOURCE_LAYERS."""
    skip = {str(p.resolve()).lower() for p in exclude}
    found, seen = [], set()
    for root in roots:
        root = root.resolve()
        files = [root] if root.is_file() else root.rglob("*.shp") if root.is_dir() else []
        for shp in files:
            if shp.suffix.lower() != ".shp" or shp.stem.lower() in KNOWN_STEMS:
                continue
            if any(part.lower() == "_backups" for part in shp.parts):
                continue
            key = str(shp.resolve()).lower()
            if key in skip or key in seen:
                continue
            seen.add(key)
            found.append(shp.resolve())
    return sorted(found)


def shapefile_summary(path: Path) -> dict:
    """Geometry type, feature count, field names and a guessed role, without reading features."""
    open_kwargs = {}
    encoding = shapefile_encoding(path)
    if encoding:
        open_kwargs["encoding"] = encoding
    with fiona.open(path, **open_kwargs) as src:
        geometry = str(src.schema.get("geometry") or "")
        fields = list(src.schema.get("properties", {}))
        count = len(src)
    folded = {fold_ascii(name) for name in fields}
    if folded & {"f0_vodoct", "f0_vodoc", "nula_vodoc"}:
        guess = "Gauge_Refrence_Level"
    elif {"q10", "q100"} <= folded and list(path.parent.glob("Waves_*.xls*")):
        guess = "Waves"
    else:
        guess = "Qn"
    return {
        "path": path,
        "geometry": geometry,
        "is_point": "point" in geometry.lower(),
        "count": count,
        "fields": fields,
        "guess": guess,
    }


def load_rating_curves(folder: Path) -> dict[str, pd.DataFrame]:
    curves = {}
    for path in sorted(folder.glob("*.xls.xlsx")) + sorted(folder.glob("*.xlsx")):
        if path.name.startswith("~"):
            continue
        try:
            xl = pd.ExcelFile(path)
        except Exception as exc:
            print(f"warning: could not read {path.name}: {exc}", file=sys.stderr)
            continue
        for sheet in xl.sheet_names:
            df = pd.read_excel(path, sheet_name=sheet, header=None)
            parsed = parse_curve_sheet(df)
            if parsed is None or parsed.empty:
                continue
            curves[str(sheet).strip()] = parsed
    return curves


def parse_curve_sheet(df: pd.DataFrame) -> pd.DataFrame | None:
    header_row = None
    for i, row in df.iterrows():
        cells = [norm_text(v).lower() for v in row.tolist()]
        joined = " ".join(cells)
        if "h abs" in joined and any(c == "q" or c.startswith("q") for c in cells):
            header_row = i
            break
        if "h abs" in joined:
            header_row = i
            break
    if header_row is None:
        return None
    header = [norm_text(v).lower() for v in df.iloc[header_row].tolist()]
    h_col = q_col = None
    for idx, name in enumerate(header):
        if name == "h" or name.startswith("h ["):
            h_col = idx
        if name.startswith("h abs"):
            pass
        if name == "q" or name.startswith("q ["):
            q_col = idx
    if h_col is None:
        h_col = 1 if df.shape[1] > 1 else 0
    if q_col is None:
        q_col = 3 if df.shape[1] > 3 else df.shape[1] - 1
    start = header_row + 1
    if start < len(df):
        units = [norm_text(v).lower() for v in df.iloc[start].tolist()]
        if any("[cm]" in u or "[m3" in u or "m n.m" in u for u in units):
            start += 1
    block = df.iloc[start:, [h_col, q_col]].copy()
    block.columns = ["H_cm", "Q"]
    block["H_cm"] = block["H_cm"].map(parse_number)
    block["Q"] = block["Q"].map(parse_number)
    block = block.dropna(subset=["H_cm", "Q"]).sort_values("Q")
    if block.empty:
        return None
    return block.reset_index(drop=True)


def lookup_h(curve: pd.DataFrame, q: float) -> str | None:
    if curve is None or curve.empty or q is None:
        return None
    q_min = float(curve["Q"].iloc[0])
    q_max = float(curve["Q"].iloc[-1])
    if q > q_max + 1e-6:
        return VYBREZUJE
    if q <= q_min:
        h = float(curve["H_cm"].iloc[0])
        return format_h(h)
    qs = curve["Q"].to_numpy(dtype=float)
    hs = curve["H_cm"].to_numpy(dtype=float)
    for i in range(1, len(qs)):
        if q <= qs[i] or i == len(qs) - 1:
            q0, q1 = qs[i - 1], qs[i]
            h0, h1 = hs[i - 1], hs[i]
            if q1 == q0:
                return format_h(h1)
            h = h0 + (h1 - h0) * (q - q0) / (q1 - q0)
            return format_h(h)
    return format_h(float(hs[-1]))


def format_h(h: float) -> str:
    if abs(h - round(h)) < 0.05:
        return str(int(round(h)))
    return f"{h:.1f}"


def parse_wave_sheet(df: pd.DataFrame) -> dict | None:
    label = None
    peak = None
    contract_id = None
    data_start = None
    for i in range(len(df)):
        key = fold_key(df.iat[i, 0])
        value = df.iat[i, 1] if df.shape[1] > 1 else None
        if key.startswith("typ vlny"):
            match = re.search(r"Q\d+(_\w+)?", norm_text(value))
            if match:
                label = match.group(0)
        elif key.startswith("qmax"):
            peak = parse_number(value)
        elif key.startswith("id zmluva"):
            number = parse_number(value)
            contract_id = str(int(number)) if number is not None else norm_text(value)
        elif key.startswith("t [") or key == "t":
            data_start = i + 1
            break
    if data_start is not None and df.shape[1] > 1:
        flows = [parse_number(v) for v in df.iloc[data_start:, 1].tolist()]
        flows = [q for q in flows if q is not None]
        if flows and peak is None:
            peak = max(flows)
    if label is None and peak is None:
        return None
    return {"label": label, "peak": peak, "contract_id": contract_id}


def load_waves(folder: Path) -> dict[str, dict]:
    waves = {}
    for path in sorted(folder.glob("Waves_*.xls*")):
        if path.name.startswith("~"):
            continue
        try:
            xl = pd.ExcelFile(path)
        except Exception as exc:
            print(f"warning: could not read {path.name}: {exc}", file=sys.stderr)
            continue
        for sheet in xl.sheet_names:
            parsed = parse_wave_sheet(pd.read_excel(path, sheet_name=sheet, header=None))
            if parsed is None:
                continue
            stem = path.name.split(".xls")[0][len("Waves_"):]
            parsed["file"] = path.name
            waves[fold_key(stem)] = parsed
            break
    return waves


def apply_waves(props: dict, mapped: dict, waves: dict[str, dict], dest_fields: dict) -> list[str]:
    labels = []
    notes = []
    wave_fields = []
    for name, value in props.items():
        match = WAVE_FIELD_RE.match(name)
        if match and not is_missing(value):
            wave_fields.append((int(match.group(1)), name, value))
    for period, name, value in sorted(wave_fields):
        wave = waves.get(fold_key(value))
        peak = wave["peak"] if wave else parse_number(value)
        label = (wave or {}).get("label") or name
        labels.append(label)
        if wave is None and peak is None:
            notes.append(f"{name}: wave file '{value}' not found")
            continue
        qmax_field = f"Qmax_{period}"
        if qmax_field in dest_fields and peak is not None:
            mapped[qmax_field] = clip_value(peak, dest_fields[qmax_field])
            notes.append(f"{qmax_field}={peak:g}")
    mapped["Druh_bodu"] = clip_value(
        "vlna " + " ".join(labels) if labels else "vlna", dest_fields["Druh_bodu"]
    )
    return notes


def infer_druh(props: dict, layer_name: str) -> str:
    existing = get_prop(props, "Druh_bodu")
    if not is_missing(existing):
        return norm_text(existing)
    if layer_name.lower().startswith("wave"):
        return "vlna"
    f0 = get_prop(props, "F0_vodočt", "F0_vodoc", "nula_vodoc")
    if not is_missing(f0) or layer_name.lower().startswith("gauge"):
        return "QH"
    return "prietok"


def map_properties(props: dict, dest_fields: dict, layer_name: str) -> dict:
    out = {name: None for name in dest_fields}
    druh = infer_druh(props, layer_name)
    out["Druh_bodu"] = druh

    for dest_name, sources in EXPLICIT_MAP.items():
        if dest_name not in dest_fields:
            continue
        if dest_name == "nula_vodoc" and druh != "QH":
            continue
        value = get_prop(props, *sources)
        if dest_name == "Presnost" and isinstance(value, str):
            value = value.strip().rstrip(".")
        out[dest_name] = value

    for dest_name in dest_fields:
        if dest_name in ("Id", "Druh_bodu"):
            continue
        if dest_name.startswith("H_"):
            continue
        if not is_missing(out.get(dest_name)):
            continue
        if dest_name in ("Qmax_1", "Qmax_2", "Qmax_5", "Qmax_10", "Qmax_20", "Qmax_50", "Qmax_100", "Qmax_1000"):
            if druh == "QH":
                continue
        value = get_prop(props, dest_name)
        if not is_missing(value):
            out[dest_name] = value

    for name, field_type in dest_fields.items():
        out[name] = clip_value(out.get(name), field_type)
    return out


def fill_water_levels(props: dict, curve: pd.DataFrame | None, dest_fields: dict) -> list[str]:
    notes = []
    if curve is None or props.get("Druh_bodu") == "QH":
        return notes
    for q_field, h_field in QMAX_TO_H.items():
        if h_field not in dest_fields:
            continue
        q = parse_number(props.get(q_field))
        if q is None:
            continue
        h = lookup_h(curve, q)
        if h is None:
            continue
        props[h_field] = clip_value(h, dest_fields[h_field])
        notes.append(f"{h_field}={h}")
    return notes


def same_crs(a, b) -> bool:
    if not a or not b:
        return True
    try:
        epsg_a, epsg_b = a.to_epsg(), b.to_epsg()
        if epsg_a and epsg_b:
            return epsg_a == epsg_b
        return a.to_wkt() == b.to_wkt()
    except Exception:
        return str(a) == str(b)


def model_name(folder: Path, props: dict | None = None) -> str:
    name = folder.name
    if name.lower() == "hydrological_data":
        name = folder.parent.name
    name = name.split("-Hydrological_data")[0]
    return name or norm_text(get_prop(props or {}, "model_id"))


# MIKE Zero .dfs0 time series ---------------------------------------------------

DFS_ITEM_NAME_TAG = b"\xff\xfe\x35\x75"
DFS_DATA_START = b"\xff\xfe\x50\xc3"
DFS_RECORD = b"\xfe\x51\xc3\xff"
DFS_VALUE_FORMATS = {1: ("f", 4), 2: ("d", 8)}


def _dfs_string(data: bytes, pos: int) -> str | None:
    if data[pos] != 3:
        return None
    (length,) = struct.unpack_from("<i", data, pos + 1)
    raw = data[pos + 5 : pos + 5 + length].rstrip(b"\0")
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("cp1252", errors="replace")


def read_dfs0(path: Path) -> dict[str, list[float]]:
    """Item name -> values for an equidistant .dfs0 file (no mikeio needed)."""
    data = path.read_bytes()
    if not data.startswith(b"DHI_DFS_"):
        raise ValueError(f"{path.name} is not a DFS file")
    start = data.find(DFS_DATA_START)
    if start < 0:
        raise ValueError(f"{path.name}: no data section")

    names = []
    pos = data.find(DFS_ITEM_NAME_TAG)
    while 0 <= pos < start:
        name_pos = pos + 4
        if data[name_pos] == 4:
            (count,) = struct.unpack_from("<i", data, name_pos + 1)
            name_pos += 5 + 4 * count
        name = _dfs_string(data, name_pos)
        if name:
            names.append(name)
        pos = data.find(DFS_ITEM_NAME_TAG, pos + 4)
    names = names or [path.stem]

    values = []
    pos = data.find(DFS_RECORD, start)
    while pos >= 0 and data[pos : pos + 4] == DFS_RECORD and pos + 9 <= len(data):
        kind = data[pos + 4]
        (count,) = struct.unpack_from("<i", data, pos + 5)
        fmt = DFS_VALUE_FORMATS.get(kind)
        if fmt is None or count <= 0:
            break
        code, size = fmt
        values.extend(struct.unpack_from(f"<{count}{code}", data, pos + 9))
        pos += 9 + count * size

    def valid(v):
        return math.isfinite(v) and 1e-30 < abs(v) < 1e30

    return {name: [v for v in values[i :: len(names)] if valid(v)] for i, name in enumerate(names)}


def fold_ascii(value) -> str:
    text = unicodedata.normalize("NFKD", norm_text(value).lower())
    return "".join(ch for ch in text if not unicodedata.combining(ch))


def load_dfs0_waves(folder: Path) -> tuple[list[dict], list[dict]]:
    waves, problems = [], []
    for path in sorted(folder.glob("*.dfs0")):
        try:
            series = read_dfs0(path)
        except Exception as exc:
            problems.append({"file": path.name, "note": f"could not read: {exc}"})
            continue
        for item, values in series.items():
            match = re.search(r"Q[_ ]?(\d+)", f"{item} {path.stem}", re.IGNORECASE)
            if not values or not match:
                problems.append({"file": path.name, "note": f"item '{item}': no Q period in name or no data"})
                continue
            waves.append(
                {
                    "file": path.name,
                    "item": item,
                    "period": int(match.group(1)),
                    "label": f"Q{match.group(1)}",
                    "peak": max(values),
                    "steps": len(values),
                    "name_key": fold_ascii(f"{item} {path.stem}"),
                }
            )
    return waves, problems


def match_wave_to_point(wave: dict, candidates: list[dict]) -> tuple[dict | None, str]:
    field = f"Qmax_{wave['period']}"
    tolerance = max(1.0, 0.01 * wave["peak"])
    best, best_score = None, None
    for cand in candidates:
        q = parse_number(cand["mapped"].get(field))
        diff = abs(q - wave["peak"]) if q is not None else math.inf
        text = fold_ascii(f"{cand['mapped'].get('tok')} {cand['mapped'].get('profil')}")
        tokens = {t for t in re.split(r"[^a-z0-9]+", text) if len(t) >= 3}
        name_score = sum(1 for t in tokens if t[:6] in wave["name_key"])
        peak_ok = diff <= tolerance
        if not (peak_ok or name_score):
            continue
        score = (diff <= 0.5, peak_ok, name_score, -diff)
        if best_score is None or score > best_score:
            best, best_score = cand, score
    if best is None:
        return None, f"no Qn point with {field} ≈ {wave['peak']:g} m3/s or a matching name"
    profil = norm_text(best["mapped"].get("profil"))
    if best_score[1]:
        return best, f"peak {wave['peak']:g} m3/s = {field} of '{profil}'"
    return best, f"matched by name to '{profil}'; peak {wave['peak']:g} differs from its {field}"


# Scenario notes (.docx) -----------------------------------------------------

def read_docx_paragraphs(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as archive:
        xml = archive.read("word/document.xml").decode("utf-8")
    out = []
    for para in re.findall(r"<w:p[ >].*?</w:p>", xml, flags=re.S):
        text = "".join(re.findall(r"<w:t(?:\s[^>]*)?>(.*?)</w:t>", para, flags=re.S))
        text = html.unescape(text).strip()
        if text:
            out.append(text)
    return out


def scenario_notes(folder: Path) -> list[str]:
    notes = []
    for path in sorted(folder.glob("*.docx")):
        if path.name.startswith("~"):
            continue
        try:
            paragraphs = read_docx_paragraphs(path)
        except Exception as exc:
            notes.append(f"{path.name}: could not read ({exc})")
            continue
        if paragraphs:
            notes.append(f"{path.name}: {paragraphs[0]}")
        notes.extend(p for p in paragraphs[1:] if re.search(r"\d", p))
    return notes


# Planning -------------------------------------------------------------------

def collect_new_features(
    source_dirs: list[Path],
    dest_features: list[dict],
    dest_fields: dict,
    fill_levels: bool,
    dest_crs=None,
    progress=None,
    extra_layers: list[tuple[Path, str]] = (),
) -> tuple[list[dict], list[dict]]:
    """Plan the import.

    Returns (planned features, report rows). Every report row for a point also
    carries "_xy" (destination CRS) and, when action == "add", "_feature".
    progress(index, total, folder) is called before each source folder.
    extra_layers are user-approved shapefiles with other names, each paired with
    the SOURCE_LAYERS role it is read as; they are picked up with their folder.
    """
    existing_keys = set()
    existing_xy = []
    for feat in dest_features:
        props = feat["properties"]
        xy = point_coords(feat.get("geometry"))
        existing_keys.add(
            identity_key(props.get("tok"), props.get("profil"), props.get("rkm_DHI"), props.get("Druh_bodu"), xy)
        )
        if xy:
            existing_xy.append((xy, fold_druh(props.get("Druh_bodu")), fold_key(props.get("tok")), props.get("profil")))

    planned = []
    report = []

    def plain_row(folder, layer, action, note, **extra):
        row = {
            "model": model_name(folder),
            "source_dir": str(folder),
            "layer": layer,
            "action": action,
            "tok": "",
            "profil": "",
            "rkm": "",
            "Druh_bodu": "",
            "note": note,
        }
        row.update(extra)
        report.append(row)

    def emit(folder, layer, mapped, xy, notes, is_wave):
        key = identity_key(mapped.get("tok"), mapped.get("profil"), mapped.get("rkm_DHI"), mapped.get("Druh_bodu"), xy)
        druh_key = fold_druh(mapped.get("Druh_bodu"))
        tok_key = fold_key(mapped.get("tok"))
        action = "add"
        if key in existing_keys:
            action = "skip_existing"
            notes.append("already in destination")
        elif xy:
            for (ex, ey), druh, ex_tok, ex_profil in existing_xy:
                dist = math.hypot(xy[0] - ex, xy[1] - ey)
                if druh_key == druh and dist < 0.5:
                    action = "skip_existing"
                    notes.append("same coordinates already in destination")
                    break
                if is_wave and druh.startswith("vlna") and ex_tok == tok_key and dist <= WAVE_MATCH_RADIUS_M:
                    action = "skip_existing"
                    notes.append(
                        f"wave point already in destination {dist:.0f} m away ('{norm_text(ex_profil)}', {druh})"
                    )
                    break
        row = {
            "model": model_name(folder),
            "source_dir": str(folder),
            "layer": layer,
            "action": action,
            "tok": mapped.get("tok"),
            "profil": mapped.get("profil"),
            "rkm": mapped.get("rkm_DHI"),
            "Druh_bodu": mapped.get("Druh_bodu"),
            "note": "; ".join(notes),
            "_xy": xy,
        }
        report.append(row)
        if action != "add":
            return
        existing_keys.add(key)
        if xy:
            existing_xy.append((xy, druh_key, tok_key, mapped.get("profil")))
        feature = {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": (xy[0], xy[1])} if xy else None,
            "properties": mapped,
        }
        row["_feature"] = feature
        planned.append(feature)

    for index, folder in enumerate(source_dirs):
        if progress:
            progress(index, len(source_dirs), folder)
        curves = load_rating_curves(folder) if fill_levels else {}
        waves = load_waves(folder)
        qn_points = []
        layers = [(folder / f"{layer}.shp", layer, layer) for layer in SOURCE_LAYERS]
        folder_key = str(folder.resolve()).lower()
        for shp, role in extra_layers:
            if str(shp.resolve().parent).lower() == folder_key:
                layers.append((shp, role, shp.stem))
        for shp, layer, label in layers:
            if not shp.exists():
                continue
            if layer == "Rating_Curves":
                plain_row(folder, label, "skip_layer", "same stations as Gauge; Excel curves used for H_Q*")
                continue
            features, _, src_crs = read_features(shp)
            reproject = not same_crs(src_crs, dest_crs)
            for feat in features:
                props = feat["properties"]
                mapped = map_properties(props, dest_fields, layer)
                notes = apply_waves(props, mapped, waves, dest_fields) if layer == "Waves" else []
                if label != layer:
                    notes.insert(0, f"{shp.name} read as {layer}")
                xy = point_coords(feat.get("geometry"))
                if xy and reproject:
                    xs, ys = transform_xy(src_crs, dest_crs, [xy[0]], [xy[1]])
                    xy = (xs[0], ys[0])
                excel_id = get_prop(props, "EXCEL_ID", "ID_Zmluva")
                excel_key = str(int(excel_id)) if parse_number(excel_id) is not None else norm_text(excel_id)
                if fill_levels:
                    notes += fill_water_levels(mapped, curves.get(excel_key), dest_fields)
                if layer == "Qn":
                    qn_points.append({"mapped": dict(mapped), "xy": xy})
                emit(folder, label, mapped, xy, notes, is_wave=layer == "Waves")

        dfs_waves, dfs_problems = load_dfs0_waves(folder)
        for problem in dfs_problems:
            plain_row(folder, problem["file"], "unmatched", problem["note"])
        grouped: dict[int, list] = {}
        for wave in dfs_waves:
            cand, why = match_wave_to_point(wave, qn_points)
            if cand is None:
                plain_row(folder, wave["file"], "unmatched", f"wave {wave['label']} not placed: {why}")
                continue
            grouped.setdefault(id(cand), [cand, []])[1].append((wave, why))
        for cand, matched in grouped.values():
            mapped = dict(cand["mapped"])
            matched.sort(key=lambda m: m[0]["period"])
            notes = []
            for wave, why in matched:
                qmax_field = f"Qmax_{wave['period']}"
                if qmax_field in dest_fields:
                    mapped[qmax_field] = clip_value(wave["peak"], dest_fields[qmax_field])
                notes.append(f"{wave['file']} ({wave['steps']} steps): {why}")
            labels = " ".join(w["label"] for w, _ in matched)
            mapped["Druh_bodu"] = clip_value(f"vlna {labels}", dest_fields["Druh_bodu"])
            emit(folder, "dfs0", mapped, cand["xy"], notes, is_wave=True)

        for text in scenario_notes(folder):
            plain_row(folder, "docx", "info", text)
    return planned, report


def backup_shapefile(shp: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    bak_dir = shp.parent / "_backups" / stamp
    bak_dir.mkdir(parents=True, exist_ok=True)
    stem = shp.stem
    for sibling in shp.parent.glob(stem + ".*"):
        shutil.copy2(sibling, bak_dir / sibling.name)
    return bak_dir


def write_shapefile(path: Path, schema: dict, crs, features: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    for leftover in path.parent.glob(path.stem + ".*"):
        if leftover.suffix.lower() == ".xml":
            continue
        leftover.unlink()
    with fiona.open(
        path,
        "w",
        driver="ESRI Shapefile",
        schema=schema,
        crs=crs or from_epsg(5514),
        encoding="utf-8",
    ) as dst:
        for feat in features:
            dst.write(feat)
    cpg = path.with_suffix(".cpg")
    cpg.write_text("UTF-8", encoding="ascii")


REPORT_FIELDS = ["model", "source_dir", "layer", "action", "tok", "profil", "rkm", "Druh_bodu", "note"]


def write_report(path: Path, report: list[dict]) -> None:
    if not report:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=REPORT_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(report)

