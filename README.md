# LEJAK — Agency Website & Automation Prototypes

**LEJAK** is a tech agency started by two friends (Jakub Kucera & Leo Gurtner). We build websites, chatbots, and booking/automation solutions, and we train teams to use everyday tools and AI confidently.

> **We don't replace people. We help them work faster by taking over repetitive tasks, so they can focus on what matters.**  
> Owners save money. Employees save time and nerves.

- **Live Website:** https://lejakweb.vercel.app
- **Repository:** https://github.com/kubik191/lejak

---

## Projects in This Repository

| Folder | Project | What it solves | Tech stack |
|---|---|---|---|
| [`WebSite/`](./WebSite) | **LEJAK Website** | Agency homepage with an interactive client showcase for all three automation prototypes | Next.js 15, React 19, CSS |
| [`SportsHall-booking-system/`](./SportsHall-booking-system) | **HallBook** | Turns a sports hall's email inbox and paper schedule into an automated booking system while escalating special requests to the manager | Next.js 16, TypeScript, Tailwind CSS |
| [`vesna-collector/`](./vesna-collector) | **VESNA Collector** | Scheduled, monitored hydrological data collection across ~1,100 SHMÚ stations with health dashboard & email alerts | Python, FastAPI, SQLite/PostgreSQL, htmx, Chart.js, Docker |
| [`QGIS-plugin-automation/`](./QGIS-plugin-automation) | **Hydro Doplnenie** | QGIS 3.34+ plugin & CLI tool that maps hydrological layers & Excel rating curves into `Hydrologia_SK_doplnenie` with preview and automatic backups | Python, PyQGIS, PyQt5, Fiona, Pandas, OpenPyXL |

---

## Quick Overview

### 1. [`WebSite/`](./WebSite) — LEJAK Agency Website & Interactive Showcase
Our main client-facing site deployed at **lejakweb.vercel.app**. Includes our positioning, services, team details, direct contact form, and an interactive **Projects & Demos** workbench where clients can test-drive **HallBook**, **VESNA Collector**, and **Hydro Doplnenie** right in the browser.

### 2. [`SportsHall-booking-system/`](./SportsHall-booking-system) — HallBook
Built for school sports halls and local clubs that still manage bookings by email and paper. An assistant reads incoming emails, checks the calendar, holds open slots, and sends a MobilePay or bank-transfer payment link (`HAL-xxxx`). Unusual requests—like discounts or full-season deals—are escalated to the hall manager rather than auto-booked. See [`SportsHall-booking-system/README.md`](./SportsHall-booking-system/README.md).

### 3. [`vesna-collector/`](./vesna-collector) — VESNA Collector
Replaces fragile sequential scraping (~33 min) with an independent worker and FastAPI dashboard (~6 min for ~1,100 SHMÚ stations across water levels, precipitation, daily reports, and groundwater). Stores de-duplicated measurements, monitors station health, and sends email alerts only when attention is needed. See [`vesna-collector/README.md`](./vesna-collector/README.md).

### 4. [`QGIS-plugin-automation/`](./QGIS-plugin-automation) — Hydro Doplnenie (QGIS Plugin v0.3.0)
Automates tedious point-by-point copying across QGIS hydrological shapefiles (`Qn`, `Gauge_Refrence_Level`, `Waves`, MIKE `.dfs0` waves) and interpolates flood water levels (`H_Q5`–`H_Q1000`, flagging overbank flows as `"vybrežuje"`) from Excel rating curves. The specialist previews every mapped row and confirms before importing with timestamped backups. See [`QGIS-plugin-automation/README.md`](./QGIS-plugin-automation/README.md).

*(Note: Large raw GIS base maps in `QGIS-plugin-automation/QGIS-FILES/` (~8.3 GB) and local runtime databases are excluded via `.gitignore`.)*
