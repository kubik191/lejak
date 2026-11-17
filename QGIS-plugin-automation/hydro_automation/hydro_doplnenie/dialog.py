import json
import shutil
from datetime import datetime
from pathlib import Path

from fiona.crs import CRS
from qgis.core import (
    Qgis,
    QgsCoordinateTransform,
    QgsFeature,
    QgsGeometry,
    QgsMapLayerProxyModel,
    QgsPointXY,
    QgsProject,
    QgsSettings,
    QgsWkbTypes,
)
from qgis.gui import QgsFileWidget, QgsMapLayerComboBox, QgsMessageBar
from qgis.PyQt.QtCore import Qt, QVariant
from qgis.PyQt.QtGui import QBrush, QColor
from qgis.PyQt.QtWidgets import (
    QAbstractItemView,
    QApplication,
    QCheckBox,
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QFileDialog,
    QFormLayout,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QMessageBox,
    QProgressDialog,
    QPushButton,
    QSizePolicy,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
)

from . import engine

SETTINGS_PREFIX = "hydro_doplnenie/"
SHP_CHOICES_KEY = SETTINGS_PREFIX + "unknown_shapefile_choices"
DECLINED = "no"

ROLE_LABELS = {
    "Qn": "Qn – flow points (prietok)",
    "Gauge_Refrence_Level": "Gauge – water gauges (QH)",
    "Waves": "Waves – flood waves (vlna)",
}

COLUMNS = ["", "Model", "Source", "Status", "Druh_bodu", "Tok", "Profil", "rkm", "Note"]
COL_CHECK, COL_MODEL, COL_SOURCE, COL_STATUS, COL_DRUH, COL_TOK, COL_PROFIL, COL_RKM, COL_NOTE = range(len(COLUMNS))

STATUS_LABELS = {
    "add": "New",
    "skip_existing": "Already in layer",
    "skip_layer": "Not imported",
    "error": "Error",
    "unmatched": "Wave not placed",
    "skip_unknown": "Not used",
    "info": "Scenario info",
    "imported": "Imported",
}

GREY = QBrush(QColor(130, 130, 130))
RED = QBrush(QColor(180, 30, 30))
GREEN = QBrush(QColor(30, 120, 50))
BLUE = QBrush(QColor(30, 70, 160))


def to_py(value):
    if isinstance(value, QVariant):
        return None if value.isNull() else value.value()
    return value


def field_type_string(field) -> str:
    kind = field.type()
    if kind == QVariant.String:
        return f"str:{field.length() or 254}"
    if kind == QVariant.Double:
        return "float"
    if kind in (QVariant.Int, QVariant.LongLong, QVariant.UInt, QVariant.ULongLong):
        return "int"
    return "str"


def layer_file_path(layer) -> Path | None:
    if layer.providerType() != "ogr":
        return None
    path = Path(layer.dataProvider().dataSourceUri().split("|")[0])
    return path if path.exists() else None


def backup_layer_file(path: Path) -> Path:
    if path.suffix.lower() == ".shp":
        return engine.backup_shapefile(path)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    bak_dir = path.parent / "_backups" / stamp
    bak_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, bak_dir / path.name)
    return bak_dir


def fiona_crs(layer_crs):
    if not layer_crs.isValid():
        return None
    authid = layer_crs.authid()
    try:
        return CRS.from_user_input(authid) if authid else CRS.from_wkt(layer_crs.toWkt())
    except Exception:
        return None


class UnknownShapefilesDialog(QDialog):
    """Asks which shapefiles with unrecognised names may be used, and as what."""

    def __init__(self, summaries: list[dict], root: Path, parent=None):
        super().__init__(parent)
        self.summaries = summaries
        self.setWindowTitle("Hydro Doplnenie – unrecognised shapefiles")
        self.resize(950, 420)
        layout = QVBoxLayout(self)

        intro = QLabel(
            f"Found {len(summaries)} point shapefile(s) that aren't named Qn, Gauge_Refrence_Level "
            "or Waves. Nothing from them is imported unless you allow it here.\n"
            "Tick the ones that may be used and say how to read them. You still review every point "
            "before anything is imported."
        )
        intro.setWordWrap(True)
        layout.addWidget(intro)

        self.table = QTableWidget(len(summaries), 5, self)
        self.table.setHorizontalHeaderLabels(["Use", "File", "Points", "Read as", "Fields"])
        self.table.verticalHeader().setVisible(False)
        self.table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.combos = []
        for r, summary in enumerate(summaries):
            use = QTableWidgetItem()
            use.setFlags(Qt.ItemIsUserCheckable | Qt.ItemIsEnabled)
            use.setCheckState(Qt.Unchecked)
            self.table.setItem(r, 0, use)
            path = summary["path"]
            try:
                folder = str(path.parent.relative_to(root))
            except ValueError:
                folder = str(path.parent)
            file_item = QTableWidgetItem(f"{path.name}   (in {folder})")
            file_item.setToolTip(str(path))
            self.table.setItem(r, 1, file_item)
            self.table.setItem(r, 2, QTableWidgetItem(f"{summary['count']:,}".replace(",", " ")))
            combo = QComboBox(self.table)
            for role in engine.IMPORTABLE_ROLES:
                combo.addItem(ROLE_LABELS[role], role)
            combo.setCurrentIndex(engine.IMPORTABLE_ROLES.index(summary["guess"]))
            self.table.setCellWidget(r, 3, combo)
            self.combos.append(combo)
            fields = ", ".join(summary["fields"][:12]) + (" …" if len(summary["fields"]) > 12 else "")
            self.table.setItem(r, 4, QTableWidgetItem(fields))
        self.table.resizeColumnsToContents()
        self.table.setColumnWidth(1, min(self.table.columnWidth(1), 420))
        self.table.horizontalHeader().setSectionResizeMode(4, QHeaderView.Stretch)
        layout.addWidget(self.table, 1)

        self.remember_check = QCheckBox("Remember my answers for these files (don't ask again)")
        self.remember_check.setChecked(True)
        layout.addWidget(self.remember_check)

        self.answered = False
        buttons = QDialogButtonBox(self)
        buttons.addButton("Use ticked files", QDialogButtonBox.AcceptRole)
        buttons.addButton("Don't use any", QDialogButtonBox.RejectRole)
        buttons.accepted.connect(lambda: self._finish(True))
        buttons.rejected.connect(lambda: self._finish(False))
        layout.addWidget(buttons)

    def _finish(self, accepted: bool):
        # Closing the window with X leaves answered False, which cancels the scan.
        self.answered = True
        self.accept() if accepted else self.reject()

    def choices(self) -> dict[Path, str]:
        """path -> role for ticked files, DECLINED for the rest."""
        out = {}
        accepted = self.result() == QDialog.Accepted
        for r, summary in enumerate(self.summaries):
            ticked = accepted and self.table.item(r, 0).checkState() == Qt.Checked
            out[summary["path"]] = self.combos[r].currentData() if ticked else DECLINED
        return out


class HydroDoplnenieDialog(QDialog):
    def __init__(self, iface, parent=None):
        super().__init__(parent)
        self.iface = iface
        self.rows: list[dict] = []
        self.settings = QgsSettings()
        self.setWindowTitle("Hydro Doplnenie – bulk import")
        self.resize(1150, 650)
        self._build_ui()
        self._restore_settings()

    # UI -------------------------------------------------------------------

    def _build_ui(self):
        layout = QVBoxLayout(self)

        self.message_bar = QgsMessageBar(self)
        self.message_bar.setSizePolicy(QSizePolicy.Minimum, QSizePolicy.Fixed)
        layout.addWidget(self.message_bar)

        intro = QLabel(
            "1. Pick the Doplnenie layer.  2. Pick a folder that contains the model folders "
            "(e.g. VH_64-Hydrological_data).  3. Scan, check the preview, import the ticked points.\n"
            "If the scan finds point shapefiles with other names, it asks before using them.\n"
            "Double-click a row to zoom the map to that point."
        )
        intro.setWordWrap(True)
        layout.addWidget(intro)

        form = QFormLayout()
        self.layer_combo = QgsMapLayerComboBox(self)
        self.layer_combo.setFilters(QgsMapLayerProxyModel.PointLayer)
        form.addRow("Doplnenie layer:", self.layer_combo)

        self.folder_widget = QgsFileWidget(self)
        self.folder_widget.setStorageMode(QgsFileWidget.GetDirectory)
        self.folder_widget.setDialogTitle("Folder with model data")
        form.addRow("Data folder:", self.folder_widget)

        self.fill_levels_check = QCheckBox("Fill H_Q* water levels from rating curves (merné krivky)")
        self.fill_levels_check.setChecked(True)
        form.addRow("", self.fill_levels_check)
        layout.addLayout(form)

        scan_row = QHBoxLayout()
        self.scan_button = QPushButton("Scan folders")
        self.scan_button.clicked.connect(self.scan)
        scan_row.addWidget(self.scan_button)
        forget_button = QPushButton("Forget answers")
        forget_button.setToolTip("Ask again about shapefiles with other names on the next scan")
        forget_button.clicked.connect(self.forget_shp_choices)
        scan_row.addWidget(forget_button)
        self.only_new_check = QCheckBox("Show only new points and scenario info")
        self.only_new_check.toggled.connect(self._apply_filter)
        scan_row.addWidget(self.only_new_check)
        scan_row.addStretch(1)
        self.summary_label = QLabel("")
        scan_row.addWidget(self.summary_label)
        layout.addLayout(scan_row)

        self.table = QTableWidget(0, len(COLUMNS), self)
        self.table.setHorizontalHeaderLabels(COLUMNS)
        self.table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.table.verticalHeader().setVisible(False)
        header = self.table.horizontalHeader()
        header.setSectionResizeMode(QHeaderView.Interactive)
        header.setSectionResizeMode(COL_NOTE, QHeaderView.Stretch)
        self.table.cellDoubleClicked.connect(self._zoom_to_row)
        self.table.itemChanged.connect(self._update_import_button)
        layout.addWidget(self.table, 1)

        buttons = QHBoxLayout()
        select_all = QPushButton("Tick all new")
        select_all.clicked.connect(lambda: self._set_all_checked(True))
        buttons.addWidget(select_all)
        select_none = QPushButton("Untick all")
        select_none.clicked.connect(lambda: self._set_all_checked(False))
        buttons.addWidget(select_none)
        export = QPushButton("Export report…")
        export.clicked.connect(self.export_report)
        buttons.addWidget(export)
        buttons.addStretch(1)
        self.import_button = QPushButton("Import ticked points")
        self.import_button.setEnabled(False)
        self.import_button.clicked.connect(self.import_selected)
        buttons.addWidget(self.import_button)
        close = QPushButton("Close")
        close.clicked.connect(self.close)
        buttons.addWidget(close)
        layout.addLayout(buttons)

    def _restore_settings(self):
        folder = self.settings.value(SETTINGS_PREFIX + "source_folder", "")
        if folder:
            self.folder_widget.setFilePath(folder)
        layer_id = self.settings.value(SETTINGS_PREFIX + "layer_id", "")
        layer = QgsProject.instance().mapLayer(layer_id) if layer_id else None
        if layer is None:
            for candidate in QgsProject.instance().mapLayers().values():
                if "doplnenie" in candidate.name().lower():
                    layer = candidate
                    break
        if layer is not None:
            self.layer_combo.setLayer(layer)

    def _save_settings(self):
        self.settings.setValue(SETTINGS_PREFIX + "source_folder", self.folder_widget.filePath())
        layer = self.layer_combo.currentLayer()
        if layer is not None:
            self.settings.setValue(SETTINGS_PREFIX + "layer_id", layer.id())

    # Scan -----------------------------------------------------------------

    def _read_destination(self, layer):
        fields = {field.name(): field_type_string(field) for field in layer.fields()}
        names = layer.fields().names()
        features = []
        for feat in layer.getFeatures():
            props = {name: to_py(value) for name, value in zip(names, feat.attributes())}
            geometry = None
            geom = feat.geometry()
            if geom and not geom.isEmpty():
                point = geom.asMultiPoint()[0] if geom.isMultipart() else geom.asPoint()
                geometry = {"type": "Point", "coordinates": (point.x(), point.y())}
            features.append({"geometry": geometry, "properties": props})
        return features, fields

    def scan(self):
        layer = self.layer_combo.currentLayer()
        folder = self.folder_widget.filePath().strip()
        if layer is None:
            self._warn("Pick the Doplnenie layer first.")
            return
        if not folder or not Path(folder).is_dir():
            self._warn("Pick an existing data folder.")
            return
        missing = [name for name in ("tok", "profil", "Druh_bodu") if layer.fields().indexOf(name) < 0]
        if missing:
            self._warn(f"Layer '{layer.name()}' has no {', '.join(missing)} field(s); is it the Doplnenie layer?")
            return
        self._save_settings()

        dest_path = layer_file_path(layer)
        source_dirs = engine.discover_source_dirs([Path(folder)])
        if dest_path is not None:
            source_dirs = [d for d in source_dirs if d != dest_path.parent.resolve()]
        extra_layers, rows = self._resolve_unknown_shapefiles(Path(folder), dest_path)
        if extra_layers is None:
            return
        for shp, _ in extra_layers:
            if shp.parent not in source_dirs:
                source_dirs.append(shp.parent)
        if not source_dirs:
            self.rows = rows
            self._fill_table()
            self.summary_label.setText("no model folders found")
            self._warn("No model folders with Qn.shp or Gauge_Refrence_Level.shp found under that folder.")
            return

        dest_features, dest_fields = self._read_destination(layer)
        dest_crs = fiona_crs(layer.crs())
        planned_so_far: list[dict] = []

        progress = QProgressDialog("Scanning model folders…", "Cancel", 0, len(source_dirs), self)
        progress.setWindowTitle("Hydro Doplnenie")
        progress.setWindowModality(Qt.WindowModal)
        progress.setMinimumDuration(0)
        QApplication.setOverrideCursor(Qt.WaitCursor)
        try:
            for index, source_dir in enumerate(source_dirs):
                progress.setValue(index)
                progress.setLabelText(f"Reading {engine.model_name(source_dir, {})} ({index + 1}/{len(source_dirs)})…")
                QApplication.processEvents()
                if progress.wasCanceled():
                    break
                try:
                    planned, report = engine.collect_new_features(
                        [source_dir],
                        dest_features + planned_so_far,
                        dest_fields,
                        fill_levels=self.fill_levels_check.isChecked(),
                        dest_crs=dest_crs,
                        extra_layers=extra_layers,
                    )
                except Exception as exc:
                    rows.append(
                        {
                            "model": engine.model_name(source_dir, {}),
                            "source_dir": str(source_dir),
                            "layer": "",
                            "action": "error",
                            "note": f"{type(exc).__name__}: {exc}",
                        }
                    )
                    continue
                planned_so_far.extend(planned)
                rows.extend(report)
            progress.setValue(len(source_dirs))
        finally:
            QApplication.restoreOverrideCursor()
            progress.close()

        self.rows = rows
        self._fill_table()
        counts = {}
        for row in rows:
            counts[row["action"]] = counts.get(row["action"], 0) + 1
        parts = [f"{len(source_dirs)} model folder(s)", f"{counts.get('add', 0)} new"]
        if counts.get("skip_existing"):
            parts.append(f"{counts['skip_existing']} already in layer")
        if counts.get("unmatched"):
            parts.append(f"{counts['unmatched']} wave(s) not placed")
        if counts.get("skip_unknown"):
            parts.append(f"{counts['skip_unknown']} other shapefile(s) not used")
        if counts.get("error"):
            parts.append(f"{counts['error']} error(s)")
        self.summary_label.setText(" · ".join(parts))
        if not counts.get("add"):
            self.message_bar.pushMessage("Nothing new to import.", Qgis.Info, 5)

    def _resolve_unknown_shapefiles(self, root: Path, dest_path: Path | None):
        """Returns ([(shp, role)], report rows), or (None, []) if the user cancelled."""
        unknown = engine.find_unknown_shapefiles([root], exclude=[dest_path] if dest_path else [])
        remembered = self._load_shp_choices()
        rows, to_ask, extra = [], [], []

        def row(shp, note):
            rows.append(
                {
                    "model": engine.model_name(shp.parent),
                    "source_dir": str(shp.parent),
                    "layer": shp.name,
                    "action": "skip_unknown",
                    "note": note,
                }
            )

        for shp in unknown:
            choice = remembered.get(str(shp).lower())
            if choice == DECLINED:
                row(shp, "you chose not to use this file (Forget answers to be asked again)")
                continue
            if choice in engine.IMPORTABLE_ROLES and shp.exists():
                extra.append((shp, choice))
                continue
            try:
                summary = engine.shapefile_summary(shp)
            except Exception as exc:
                row(shp, f"cannot open: {exc}")
                rows[-1]["action"] = "error"
                continue
            if not summary["is_point"]:
                row(shp, f"{summary['geometry'] or 'no'} geometry, only point layers can be imported")
                continue
            to_ask.append(summary)

        if to_ask:
            ask = UnknownShapefilesDialog(to_ask, root, self)
            ask.exec_()
            if not ask.answered:
                return None, []
            answers = ask.choices()
            if ask.remember_check.isChecked():
                remembered.update({str(path).lower(): role for path, role in answers.items()})
                self._save_shp_choices(remembered)
            for path, role in answers.items():
                if role == DECLINED:
                    row(path, "you chose not to use this file")
                else:
                    extra.append((path, role))
        return extra, rows

    def _load_shp_choices(self) -> dict:
        try:
            data = json.loads(self.settings.value(SHP_CHOICES_KEY, "") or "{}")
        except ValueError:
            return {}
        return data if isinstance(data, dict) else {}

    def _save_shp_choices(self, choices: dict):
        self.settings.setValue(SHP_CHOICES_KEY, json.dumps(choices, ensure_ascii=False))

    def forget_shp_choices(self):
        self.settings.remove(SHP_CHOICES_KEY)
        self.message_bar.pushMessage(
            "Forgot your answers about other shapefiles; the next scan will ask again.", Qgis.Info, 5
        )

    def _fill_table(self):
        self.table.blockSignals(True)
        self.table.setSortingEnabled(False)
        self.table.setRowCount(0)
        for index, row in enumerate(self.rows):
            r = self.table.rowCount()
            self.table.insertRow(r)
            action = row.get("action", "")
            check = QTableWidgetItem()
            check.setData(Qt.UserRole, index)
            if action == "add" and row.get("_xy"):
                check.setFlags(Qt.ItemIsUserCheckable | Qt.ItemIsEnabled | Qt.ItemIsSelectable)
                check.setCheckState(Qt.Checked)
            else:
                check.setFlags(Qt.ItemIsEnabled | Qt.ItemIsSelectable)
            self.table.setItem(r, COL_CHECK, check)
            values = {
                COL_MODEL: row.get("model", ""),
                COL_SOURCE: row.get("layer", ""),
                COL_STATUS: STATUS_LABELS.get(action, action),
                COL_DRUH: row.get("Druh_bodu", ""),
                COL_TOK: row.get("tok", ""),
                COL_PROFIL: row.get("profil", ""),
                COL_RKM: "" if row.get("rkm") in (None, "") else f"{row['rkm']:g}" if isinstance(row["rkm"], float) else str(row["rkm"]),
                COL_NOTE: row.get("note", ""),
            }
            for col, value in values.items():
                item = QTableWidgetItem("" if value is None else str(value))
                item.setData(Qt.UserRole, index)
                if action in ("error", "unmatched"):
                    item.setForeground(RED)
                elif action == "info":
                    item.setForeground(BLUE)
                elif action == "imported":
                    item.setForeground(GREEN)
                elif action != "add":
                    item.setForeground(GREY)
                self.table.setItem(r, col, item)
        self.table.setSortingEnabled(True)
        self.table.resizeColumnsToContents()
        self.table.setColumnWidth(COL_PROFIL, min(self.table.columnWidth(COL_PROFIL), 260))
        self.table.horizontalHeader().setSectionResizeMode(COL_NOTE, QHeaderView.Stretch)
        self.table.blockSignals(False)
        self._apply_filter()
        self._update_import_button()

    def _apply_filter(self):
        only_new = self.only_new_check.isChecked()
        for r in range(self.table.rowCount()):
            row = self.rows[self.table.item(r, COL_CHECK).data(Qt.UserRole)]
            self.table.setRowHidden(r, only_new and row.get("action") not in ("add", "info", "unmatched"))

    def _checked_rows(self) -> list[dict]:
        out = []
        for r in range(self.table.rowCount()):
            item = self.table.item(r, COL_CHECK)
            if item and item.flags() & Qt.ItemIsUserCheckable and item.checkState() == Qt.Checked:
                out.append(self.rows[item.data(Qt.UserRole)])
        return out

    def _set_all_checked(self, checked: bool):
        self.table.blockSignals(True)
        for r in range(self.table.rowCount()):
            item = self.table.item(r, COL_CHECK)
            if item and item.flags() & Qt.ItemIsUserCheckable:
                item.setCheckState(Qt.Checked if checked else Qt.Unchecked)
        self.table.blockSignals(False)
        self._update_import_button()

    def _update_import_button(self, *_):
        n = len(self._checked_rows())
        self.import_button.setEnabled(n > 0)
        self.import_button.setText(f"Import {n} ticked point(s)" if n else "Import ticked points")

    # Map ------------------------------------------------------------------

    def _zoom_to_row(self, r, _col):
        item = self.table.item(r, COL_CHECK)
        layer = self.layer_combo.currentLayer()
        if item is None or layer is None:
            return
        xy = self.rows[item.data(Qt.UserRole)].get("_xy")
        if not xy:
            return
        canvas = self.iface.mapCanvas()
        point = QgsPointXY(xy[0], xy[1])
        transform = QgsCoordinateTransform(layer.crs(), canvas.mapSettings().destinationCrs(), QgsProject.instance())
        canvas.setCenter(transform.transform(point))
        canvas.zoomScale(5000)
        canvas.flashGeometries([QgsGeometry.fromPointXY(point)], layer.crs())
        canvas.refresh()

    # Import ---------------------------------------------------------------

    def import_selected(self):
        layer = self.layer_combo.currentLayer()
        selected = self._checked_rows()
        if layer is None or not selected:
            return
        if layer.isEditable():
            self._warn(f"'{layer.name()}' is in edit mode. Save or discard your edits first, then import.")
            return
        answer = QMessageBox.question(
            self,
            "Hydro Doplnenie",
            f"Add {len(selected)} point(s) to '{layer.name()}'?\nA backup copy of the layer is made first.",
        )
        if answer != QMessageBox.Yes:
            return

        backup_dir = None
        path = layer_file_path(layer)
        if path is not None:
            try:
                backup_dir = backup_layer_file(path)
            except OSError as exc:
                self._warn(f"Backup failed, nothing was imported: {exc}")
                return

        fields = layer.fields()
        multi = QgsWkbTypes.isMultiType(layer.wkbType())
        features = []
        for row in selected:
            feat = QgsFeature(fields)
            for name, value in row["_feature"]["properties"].items():
                idx = fields.indexOf(name)
                if idx >= 0 and value is not None:
                    feat.setAttribute(idx, value)
            point = QgsPointXY(*row["_xy"])
            feat.setGeometry(QgsGeometry.fromMultiPointXY([point]) if multi else QgsGeometry.fromPointXY(point))
            features.append(feat)

        ok, _ = layer.dataProvider().addFeatures(features)
        if not ok:
            error = layer.dataProvider().lastError() or "unknown error"
            self._warn(f"Import failed: {error}")
            return
        layer.updateExtents()
        layer.triggerRepaint()

        for row in selected:
            row["action"] = "imported"
        if backup_dir is not None:
            engine.write_report(backup_dir / "import_report.csv", self.rows)
        self._fill_table()

        where = f" Backup: {backup_dir}" if backup_dir else ""
        self.message_bar.pushMessage(
            f"Added {len(features)} point(s) to '{layer.name()}'.{where}", Qgis.Success, 10
        )
        self.summary_label.setText(f"{len(features)} point(s) imported · scan again to refresh")

    def export_report(self):
        if not self.rows:
            self._warn("Scan first; there is nothing to export yet.")
            return
        path, _ = QFileDialog.getSaveFileName(self, "Export report", "hydro_doplnenie_report.csv", "CSV (*.csv)")
        if path:
            engine.write_report(Path(path), self.rows)
            self.message_bar.pushMessage(f"Report saved to {path}", Qgis.Success, 5)

    def _warn(self, text: str):
        self.message_bar.pushMessage(text, Qgis.Warning, 8)
