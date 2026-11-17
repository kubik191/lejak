"""
Package the QGIS plugin as a zip for Plugins > Manage and Install Plugins > Install from ZIP.

  python hydro_automation/build_plugin.py
"""

import configparser
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
PLUGIN_DIR = HERE / "hydro_doplnenie"
DIST = HERE / "dist"


def main() -> int:
    meta = configparser.ConfigParser()
    meta.read(PLUGIN_DIR / "metadata.txt", encoding="utf-8")
    version = meta["general"]["version"]
    DIST.mkdir(exist_ok=True)
    target = DIST / f"hydro_doplnenie-{version}.zip"
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(PLUGIN_DIR.rglob("*")):
            if path.is_dir() or "__pycache__" in path.parts or path.suffix == ".pyc":
                continue
            zf.write(path, Path(PLUGIN_DIR.name) / path.relative_to(PLUGIN_DIR))
    print(target)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
