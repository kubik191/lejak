# LEJAK — Agency Website & Automation Prototypes

**LEJAK** is a tech agency started by two friends (Jakub Kucera & Leo Gurtner). We build websites, chatbots, and booking/automation solutions, and we train people to use everyday tools and AI confidently.

> **We don't replace people. We help them work faster by taking over repetitive tasks, so they can focus on what matters.**  
> Owners save money. Employees save time and nerves.

- **Live Website:** https://lejakweb.vercel.app
- **Interactive Demos Page:** https://lejakweb.vercel.app/projects
- **Repository:** https://github.com/kubik191/lejak

---

## Documentation Index

| Document | Scope |
|---|---|
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Master technical reference, cross-system invariants, Mermaid diagrams & module breakdowns |
| [`WebSite/README.md`](./WebSite/README.md) | Agency site (`/`, `/projects`), generalized interactive walkthroughs, contact form & Vercel setup |
| [`SportsHall-booking-system/README.md`](./SportsHall-booking-system/README.md) | **HallBook**: Email AI pipeline, booking conflict/hold engine, data schema, & REST API |
| [`vesna-collector/README.md`](./vesna-collector/README.md) | **VESNA Collector**: Decoupled worker, polite async HTTP fetcher, SHMÚ parsers, Docker & alerts |
| [`QGIS-plugin-automation/README.md`](./QGIS-plugin-automation/README.md) | **Hydro Doplnenie**: PyQGIS plugin, shapefile encoding/CRS fixes, rating curves & `.dfs0` parser |

---

## Projects in This Repository

| Folder | Project | What it solves | Tech stack |
|---|---|---|---|
| [`WebSite/`](./WebSite) | **LEJAK Website** | Agency landing page (`/`) and dedicated generalized interactive capability demos (`/projects`) | Next.js 15, React 19, CSS, Vercel Analytics |
| [`SportsHall-booking-system/`](./SportsHall-booking-system) | **HallBook** | Turns a sports hall's email inbox and paper schedule into an automated booking system while escalating special requests to the manager | Next.js 16, TypeScript, Tailwind CSS v4, OpenAI API + Demo Fallback |
| [`vesna-collector/`](./vesna-collector) | **VESNA Collector** | Scheduled, monitored hydrological data collection across ~1,100 SHMÚ stations with health dashboard & email alerts | Python, FastAPI, SQLAlchemy, APScheduler, SQLite/PostgreSQL, htmx, Chart.js, Docker |
| [`QGIS-plugin-automation/`](./QGIS-plugin-automation) | **Hydro Doplnenie** | QGIS 3.34+ plugin & CLI tool that maps hydrological layers, Excel rating curves & MIKE `.dfs0` waves into `Hydrologia_SK_doplnenie` with automatic backups | Python, PyQGIS 3.34+, PyQt5, Fiona, Pandas, OpenPyXL |

---

## Quick Start per Project

### 1. LEJAK Website ([`WebSite/`](./WebSite))
```bash
cd WebSite
npm.cmd install
npm.cmd run dev      # http://localhost:3000 & http://localhost:3000/projects
```

### 2. HallBook ([`SportsHall-booking-system/`](./SportsHall-booking-system))
```bash
cd SportsHall-booking-system
npm.cmd install
npm.cmd run dev      # http://localhost:3000 (/calendar, /inbox, /payments, /settings, /book)
```

### 3. VESNA Collector ([`vesna-collector/`](./vesna-collector))
```bash
cd vesna-collector
docker compose up -d --build   # http://localhost:8000 (web + worker)
```

### 4. Hydro Doplnenie QGIS Plugin ([`QGIS-plugin-automation/`](./QGIS-plugin-automation))
```bash
cd QGIS-plugin-automation
pip install -r hydro_automation/requirements.txt
python hydro_automation/import_to_doplnenie.py          # Dry-run -> last_import_report.csv
python hydro_automation/build_plugin.py                # Rebuilds dist/hydro_doplnenie-0.3.0.zip
```

*(Note: Large raw GIS base maps in `QGIS-plugin-automation/QGIS-FILES/` (~8.3 GB) and local runtime databases/env files are excluded via [`.gitignore`](./.gitignore).)*
