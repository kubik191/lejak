from qgis.core import QgsApplication
from qgis.PyQt.QtWidgets import QAction, QMessageBox


class HydroDoplneniePlugin:
    def __init__(self, iface):
        self.iface = iface
        self.action = None
        self.dialog = None

    def initGui(self):
        icon = QgsApplication.getThemeIcon("/mActionAddLayer.svg")
        self.action = QAction(icon, "Hydro Doplnenie import…", self.iface.mainWindow())
        self.action.triggered.connect(self.run)
        self.iface.addToolBarIcon(self.action)
        self.iface.addPluginToVectorMenu("Hydro Doplnenie", self.action)

    def unload(self):
        if self.action:
            self.iface.removePluginVectorMenu("Hydro Doplnenie", self.action)
            self.iface.removeToolBarIcon(self.action)
        if self.dialog:
            self.dialog.close()
            self.dialog = None

    def run(self):
        try:
            from .dialog import HydroDoplnenieDialog
        except ImportError as exc:
            QMessageBox.critical(
                self.iface.mainWindow(),
                "Hydro Doplnenie",
                f"A required Python package is missing: {exc}\n\n"
                "The plugin needs pandas, openpyxl, xlrd and fiona (bundled with QGIS 3.34+).",
            )
            return
        if self.dialog is None:
            self.dialog = HydroDoplnenieDialog(self.iface, self.iface.mainWindow())
        self.dialog.show()
        self.dialog.raise_()
        self.dialog.activateWindow()
