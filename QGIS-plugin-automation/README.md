# Hydro Doplnenie — QGIS Automation Plugin & CLI (v0.3.0)

**Hydro Doplnenie** replaces a tedious manual GIS workflow in QGIS: zooming to individual hydrological features across model folders, clicking new point geometries by hand, and copying dozens of attributes and Excel rating-curve values into `Hydrologia_SK_doplnenie.shp`.

The specialist stays in control: the plugin scans model folders, validates schemas and duplicates, previews every row in an interactive table, and writes selected records only after creating a timestamped backup.

---

## What It Automates

1. **Multi-Model Discovery** — Scans `Hydrological_data` folders across hydrological models (e.g. `SL_10`, `VH_39`, `VH_40`, `VH_64`, etc.) for:
   - `Qn.shp` → mapped with `Druh_bodu = "prietok"` and peak discharges (`Qmax_5` .. `Qmax_1000`)
   - `Gauge_Refrence_Level.shp` → mapped with `Druh_bodu = "QH"` and `F0_vodočt` → `nula_vodoc`
   - `Waves` shapefiles & MIKE `*.dfs0` time-series files → matched to stations/rivers within `250 m` and labeled `"vlna Q10 Q100 ..."`
   - `Rating_Curves` + Excel curve workbooks (`*.xls` / `*.xlsx`) → interpolates water levels `H_Q5`, `H_Q10`, `H_Q20`, `H_Q50`, `H_Q100`, `H_Q1000` and marks overbank discharges as `"vybrežuje"`
2. **Attribute Mapping & Coordinate Transform** — Maps `Tok → tok`, `Profil → profil`, `rkm → rkm_DHI`, `Plocha_pov → A_Povodia`, `hydro_cislo → Hydrolog_C`, `tr_spolah → Presnost` (preserving matching column names and reprojecting CRS cleanly into the destination layer).
3. **Interactive Preview & Deduplication** — Shows every candidate point with status (`New`, `Already in layer`, `Wave not placed`, `Error`, `Scenario info`) so specialists can review and uncheck rows before importing.
4. **Automatic Backups & Audit Report** — Creates a timestamped shapefile backup under `_backups/` before any write and exports `last_import_report.csv`.

---

## Project Layout

```text
QGIS-plugin-automation/
  hydro_automation/
    hydro_doplnenie/          # Installable QGIS >= 3.34 plugin
      __init__.py
      plugin.py
      dialog.py               # PyQt5 interactive preview & selection UI
      engine.py               # Shared discovery, mapping, rating-curve & shapefile engine
      metadata.txt
    dist/
      hydro_doplnenie-0.3.0.zip
    build_plugin.py           # Packages hydro_doplnenie-<version>.zip
    import_to_doplnenie.py    # Standalone CLI runner (--apply / dry-run)
    last_import_report.csv    # Sample dry-run/import audit report
    requirements.txt          # fiona>=1.9, pandas>=2.0, openpyxl>=3.1, xlrd>=2.0
  SL_10-Hydrological_data/    # Sample model inputs
  VH_*-Hydrological_data/     # Sample model inputs
```

*(Note: The 8.3 GB `QGIS-FILES/` raw dataset directory containing full Slovak river networks and destination layers is excluded from Git via `.gitignore`.)*

---

## Usage

### Option A — Install as a QGIS Plugin (Recommended)
1. In QGIS (3.34+), open **Plugins → Manage and Install Plugins → Install from ZIP**.
2. Select `hydro_automation/dist/hydro_doplnenie-0.3.0.zip` (or rebuild it with `python hydro_automation/build_plugin.py`).
3. Open **Hydro Doplnenie**, select the destination layer (`Hydrologia_SK_doplnenie`) and model folders, click **Scan**, review the preview table, and click **Import selected**.

### Option B — Command Line (Dry-Run & Apply)
```bash
cd QGIS-plugin-automation
pip install -r hydro_automation/requirements.txt

# Dry-run preview (writes last_import_report.csv)
python hydro_automation/import_to_doplnenie.py

# Apply import with automatic backup (close destination shapefile in QGIS first)
python hydro_automation/import_to_doplnenie.py --apply
```
