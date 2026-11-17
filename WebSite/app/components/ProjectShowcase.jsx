"use client";

import { useState } from "react";

const REPO_URL = "https://github.com/kubik191/lejak";

const PROJECTS = [
  {
    id: "hallbook",
    num: "01",
    tabLabel: "HallBook",
    shortRole: "Booking & AI inbox",
    tag: "Booking & automation",
    title: "Booking and inbox, without the back-and-forth",
    summary:
      "Built for a Danish school sports hall that previously took bookings only by email and a paper schedule. An assistant reads incoming mail, checks availability across Full Hall, Half A, and Half B, holds slots for 48 hours with a MobilePay or bank-transfer link, and escalates special requests to the manager.",
    stay: "Unusual requests — like discounts or full-season agreements — go to manager Lars Mikkelsen instead of automatic booking.",
    before: "Manual email replies, paper wall calendar, and forgotten unpaid holds.",
    after: "Instant calendar check, 48h payment hold (HAL-xxxx), and automated hall Q&A.",
    metrics: [
      { value: "3 zones", label: "Full hall · Half A · Half B" },
      { value: "48h hold", label: "Auto-expires if unpaid" },
      { value: "100%", label: "Discounts routed to human" },
    ],
    stack: ["Next.js 16", "TypeScript", "Tailwind CSS", "Email AI Agent"],
    githubUrl: `${REPO_URL}/tree/main/SportsHall-booking-system`,
  },
  {
    id: "vesna",
    num: "02",
    tabLabel: "VESNA Collector",
    shortRole: "Data & monitoring",
    tag: "Automation & monitoring",
    title: "Data collection that watches itself",
    summary:
      "Replaces a fragile sequential scraping script for the Slovak Hydrometeorological Institute (SHMÚ). A standalone worker collects ~1,100 stations in parallel on per-source cron schedules, deduplicates measurements into a clean time series, shows live health in a FastAPI dashboard, and emails alerts only when something actually breaks.",
    stay: "People get involved only when a source fails or a station goes down 3 runs in a row — never for routine fetches.",
    before: "~33 min sequential runs, duplicate CSV files, and silent multi-day failures.",
    after: "~6 min concurrent collection, deduplicated DB history, and heartbeat alerts.",
    metrics: [
      { value: "33m → 6m", label: "5.5× faster full run" },
      { value: "~1,100", label: "SHMÚ stations monitored" },
      { value: "3-strike", label: "Auto email escalation" },
    ],
    stack: ["Python", "FastAPI", "SQLite / PostgreSQL", "htmx & Chart.js", "Docker"],
    githubUrl: `${REPO_URL}/tree/main/vesna-collector`,
  },
  {
    id: "qgis",
    num: "03",
    tabLabel: "Hydro Doplnenie",
    shortRole: "QGIS workflow plugin",
    tag: "Workflow tool · QGIS 3.34+",
    title: "Software that does the tedious copying",
    summary:
      "Automates a repetitive QGIS workflow where hydrologists had to zoom to every point across model folders, click new features by hand, and copy attributes plus Excel rating curves into Hydrologia_SK_doplnenie. The plugin scans model directories, maps fields, interpolates flood water levels, previews every record, and writes selected points only after a timestamped backup.",
    stay: "The specialist reviews, filters, and confirms every row. The plugin handles the mapping, matching, and backup.",
    before: "Zoom, click, copy-paste row by row across shapefiles and Excel rating curves.",
    after: "Batch scan, smart 250 m wave matching, preview table, and automatic _backups/.",
    metrics: [
      { value: "3 layers", label: "Qn · Gauge · Waves + Excel" },
      { value: "250 m", label: "Wave-to-gauge matching" },
      { value: "Auto backup", label: "Snapshot before every write" },
    ],
    stack: ["PyQGIS 3.34+", "PyQt5", "Fiona", "Pandas", "OpenPyXL"],
    githubUrl: `${REPO_URL}/tree/main/QGIS-plugin-automation`,
  },
];

const HALL_SCENARIOS = [
  {
    id: "book",
    label: "1. Booking request",
    from: "Mads Jensen <mads@amager-badminton.dk>",
    subject: "Badminton booking Saturday 14:00–16:00",
    body: "Hi Søndervang Hall, could we book Half A for badminton this Saturday from 14:00 to 16:00? Thanks, Mads",
    intent: "booking_request",
    badge: "48h payment hold created",
    badgeKind: "info",
    reply:
      "Hi Mads — Half A is available this Saturday 14:00–16:00. We have placed a 48-hour hold (Ref: HAL-4821, 700 DKK — 2 hrs × 350 DKK/hr). Complete payment with MobilePay or bank transfer to confirm your booking and receive the gate door code.",
    canPay: true,
  },
  {
    id: "question",
    label: "2. Hall question",
    from: "Sofie Holm <sofie.holm@gmail.com>",
    subject: "Changing rooms & birthday cake?",
    body: "Hi! Are changing rooms with showers included in the price, and can we serve birthday cake anywhere?",
    intent: "info_question",
    badge: "Answered from knowledge base",
    badgeKind: "success",
    reply:
      "Hi Sofie — yes, 2 changing rooms with showers are included in the hall price. Water only is allowed inside the sports hall itself, while cake and snacks are very welcome in the foyer. Please remind guests to wear non-marking indoor shoes.",
    canPay: false,
  },
  {
    id: "discount",
    label: "3. Needs manager",
    from: "København Volley <bestyrelse@kbhvolley.dk>",
    subject: "Full winter season + 25% club discount",
    body: "Hello, we would like to reserve every Tuesday 19:00–21:00 for the whole winter season if we can get a 25% club discount.",
    intent: "escalate_human",
    badge: "Escalated to Lars Mikkelsen",
    badgeKind: "warn",
    reply:
      "Hi København Volley — seasonal agreements and club discounts require manager approval. I have forwarded your request to hall manager Lars Mikkelsen, who will reply directly without auto-booking the calendar.",
    canPay: false,
  },
];

const INITIAL_HALL_SLOTS = [
  { day: "Mon–Fri", time: "08:00–15:00", area: "Full hall", label: "School PE lessons", status: "blocked" },
  { day: "Wed", time: "18:00–20:00", area: "Half A / B", label: "Volleyball & Floorball", status: "confirmed" },
  { day: "Sat", time: "09:00–11:00", area: "Full hall", label: "Kids gymnastics", status: "confirmed" },
];

const VESNA_SOURCES = [
  { id: "water_level", name: "Water levels (15 min)", stations: 400, schedule: "Every 6h", newRows: 19200 },
  { id: "precip", name: "Precipitation (1–24h)", stations: 480, schedule: "Every 6h", newRows: 11520 },
  { id: "daily_report", name: "Daily hydro report (06:00)", stations: 80, schedule: "Daily 08:30", newRows: 640 },
  { id: "groundwater", name: "Groundwater & springs", stations: 120, schedule: "Every 6h", newRows: 1440 },
];

const QGIS_ROWS = [
  {
    id: "r1",
    model: "SL_10",
    layer: "Qn",
    status: "add",
    druh: "prietok",
    tok: "Slaná",
    profil: "Bretka, vodočet",
    rkm: "26.2",
    mapping: "Tok→tok · Profil→profil · rkm→rkm_DHI",
    curves: "H_Q10=242.8 · H_Q100=350.1 · H_Q1000=vybrežuje",
    vybrezuje: true,
    checked: true,
  },
  {
    id: "r2",
    model: "SL_10",
    layer: "Gauge_Refrence_Level",
    status: "add",
    druh: "QH",
    tok: "Slaná",
    profil: "Rožňava, vodočet",
    rkm: "51.9",
    mapping: "F0_vodočt→nula_vodoc · Druh_bodu='QH'",
    curves: "H_Q10=212.0 · H_Q100=276.9 · H_Q1000=vybrežuje",
    vybrezuje: true,
    checked: true,
  },
  {
    id: "r3",
    model: "VH_39",
    layer: "Qn",
    status: "add",
    druh: "prietok",
    tok: "Veselianka",
    profil: "Oravská Jasenica, vodočet",
    rkm: "0.95",
    mapping: "Plocha_pov→A_Povodia · tr_spolah→Presnost",
    curves: "H_Q10=163.1 · H_Q100=300.0 · H_Q1000=vybrežuje",
    vybrezuje: true,
    checked: true,
  },
  {
    id: "r4",
    model: "VH_40",
    layer: "Qn",
    status: "add",
    druh: "prietok",
    tok: "Polhoranka",
    profil: "Oravská Polhora, vodočet",
    rkm: "14.8",
    mapping: "Tok→tok · Profil→profil · hydro_cisl→Hydrolog_C",
    curves: "H_Q10=205.0 · H_Q100=vybrežuje · H_Q1000=vybrežuje",
    vybrezuje: true,
    checked: true,
  },
  {
    id: "r5",
    model: "VH_64",
    layer: "Waves",
    status: "add",
    druh: "vlna Q10 Q100 Q1000",
    tok: "Varínka",
    profil: "Stráža, vodočet",
    rkm: "5.1",
    mapping: "Matched within 69 m (< 250 m wave radius)",
    curves: "Qmax_100=230 · H_Q100=320.2 · H_Q1000=vybrežuje",
    vybrezuje: true,
    checked: true,
  },
  {
    id: "r6",
    model: "SL_10",
    layer: "Qn",
    status: "skip_existing",
    druh: "prietok",
    tok: "Slaná",
    profil: "Tornaľa",
    rkm: "21.1",
    mapping: "Exact coordinate & attribute match in Doplnenie",
    curves: "Skipped automatically (already in destination)",
    vybrezuje: false,
    checked: false,
  },
];

export default function ProjectShowcase() {
  const [activeId, setActiveId] = useState("hallbook");

  // HallBook interactive state
  const [hallScenarioId, setHallScenarioId] = useState("book");
  const [hallBookingState, setHallBookingState] = useState("idle"); // "idle" | "held" | "paid"
  const [hallSentCount, setHallSentCount] = useState(0);

  // VESNA Collector interactive state
  const [vesnaView, setVesnaView] = useState("simulator"); // "simulator" | "screenshot"
  const [vesnaRunState, setVesnaRunState] = useState("idle"); // "idle" | "running" | "done"
  const [vesnaOutage, setVesnaOutage] = useState(false);

  // Hydro Doplnenie interactive state
  const [qgisFilter, setQgisFilter] = useState("all");
  const [qgisSelectedIds, setQgisSelectedIds] = useState(["r1", "r2", "r3", "r4", "r5"]);
  const [qgisInspectId, setQgisInspectId] = useState("r1");
  const [qgisImportedIds, setQgisImportedIds] = useState([]);
  const [qgisBackupCreated, setQgisBackupCreated] = useState(false);

  const activeProject = PROJECTS.find((p) => p.id === activeId) || PROJECTS[0];
  const hallScenario = HALL_SCENARIOS.find((s) => s.id === hallScenarioId) || HALL_SCENARIOS[0];

  function selectHallScenario(id) {
    setHallScenarioId(id);
    setHallSentCount((c) => c + 1);
    if (id === "book" && hallBookingState === "idle") {
      setHallBookingState("held");
    }
  }

  function resetHallDemo() {
    setHallScenarioId("book");
    setHallBookingState("idle");
    setHallSentCount(0);
  }

  function triggerVesnaRun() {
    setVesnaRunState("running");
    setTimeout(() => {
      setVesnaRunState("done");
    }, 650);
  }

  function toggleQgisRow(id) {
    setQgisSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function runQgisImport() {
    const readyToImport = QGIS_ROWS.filter(
      (r) => r.status === "add" && qgisSelectedIds.includes(r.id) && !qgisImportedIds.includes(r.id)
    ).map((r) => r.id);
    if (readyToImport.length === 0) return;
    setQgisBackupCreated(true);
    setQgisImportedIds((prev) => [...new Set([...prev, ...readyToImport])]);
  }

  function resetQgisDemo() {
    setQgisSelectedIds(["r1", "r2", "r3", "r4", "r5"]);
    setQgisImportedIds([]);
    setQgisBackupCreated(false);
    setQgisFilter("all");
    setQgisInspectId("r1");
  }

  const visibleQgisRows = QGIS_ROWS.filter((row) => {
    if (qgisFilter === "ready") return row.status === "add" && !qgisImportedIds.includes(row.id);
    if (qgisFilter === "vybrezuje") return row.vybrezuje;
    if (qgisFilter === "existing") return row.status === "skip_existing" || qgisImportedIds.includes(row.id);
    return true;
  });

  const inspectedQgisRow = QGIS_ROWS.find((r) => r.id === qgisInspectId) || QGIS_ROWS[0];
  const pendingSelectedCount = QGIS_ROWS.filter(
    (r) => r.status === "add" && qgisSelectedIds.includes(r.id) && !qgisImportedIds.includes(r.id)
  ).length;

  return (
    <div className="showcase">
      <div className="showcase-tabs" role="tablist" aria-label="LEJAK client project prototypes">
        {PROJECTS.map((project) => {
          const selected = project.id === activeId;
          return (
            <button
              key={project.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`showcase-tab ${selected ? "is-active" : ""}`}
              onClick={() => setActiveId(project.id)}
            >
              <span className="showcase-tab-num">{project.num}</span>
              <span className="showcase-tab-text">
                <strong>{project.tabLabel}</strong>
                <span>{project.shortRole}</span>
              </span>
            </button>
          );
        })}
      </div>

      <article className="showcase-panel" role="tabpanel">
        <div className="showcase-header">
          <div>
            <div className="showcase-meta">
              <span className="tag">{activeProject.tag}</span>
              <div className="stack-list">
                {activeProject.stack.map((tech) => (
                  <span key={tech} className="stack-pill">{tech}</span>
                ))}
              </div>
            </div>
            <h3>{activeProject.title}</h3>
            <p className="showcase-summary">{activeProject.summary}</p>
          </div>
          <a
            className="button button-ghost repo-link"
            href={activeProject.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            View source on GitHub ↗
          </a>
        </div>

        <div className="before-after">
          <div className="ba-box ba-before">
            <span className="ba-label">Before</span>
            <p>{activeProject.before}</p>
          </div>
          <div className="ba-box ba-after">
            <span className="ba-label">After LEJAK</span>
            <p>{activeProject.after}</p>
          </div>
        </div>

        <div className="metrics-row">
          {activeProject.metrics.map((metric) => (
            <div key={metric.label} className="metric-card">
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </div>
          ))}
        </div>

        {activeId === "hallbook" && (
          <div className="demo-workbench">
            <div className="demo-bar">
              <div>
                <strong>Interactive demo — HallBook email assistant</strong>
                <span>Click a customer email to watch how the assistant handles it</span>
              </div>
              <button type="button" className="mini-btn" onClick={resetHallDemo}>
                Reset demo
              </button>
            </div>

            <div className="demo-grid">
              <div className="demo-pane">
                <p className="pane-label">1. Incoming customer emails</p>
                <div className="scenario-pills">
                  {HALL_SCENARIOS.map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      className={`scenario-btn ${hallScenarioId === sc.id ? "is-selected" : ""}`}
                      onClick={() => selectHallScenario(sc.id)}
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>

                <div className="email-card">
                  <div className="email-head">
                    <span><strong>From:</strong> {hallScenario.from}</span>
                    <span><strong>Subject:</strong> {hallScenario.subject}</span>
                  </div>
                  <p className="email-body">{hallScenario.body}</p>
                </div>

                <div className="ai-reply-card">
                  <div className="ai-reply-top">
                    <span className={`status-pill is-${hallScenario.badgeKind}`}>{hallScenario.badge}</span>
                    <span className="intent-tag">intent: {hallScenario.intent}</span>
                  </div>
                  <p>{hallScenario.reply}</p>
                  {hallScenario.canPay && (
                    <div className="pay-action-row">
                      {hallBookingState === "paid" ? (
                        <span className="paid-confirmed">✓ Paid via simulated MobilePay · Door code sent</span>
                      ) : (
                        <button
                          type="button"
                          className="button button-primary button-sm"
                          onClick={() => setHallBookingState("paid")}
                        >
                          Simulate MobilePay payment (700 DKK)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="demo-pane">
                <p className="pane-label">2. Live manager calendar (Søndervang Skole)</p>
                <div className="calendar-list">
                  {INITIAL_HALL_SLOTS.map((slot) => (
                    <div key={`${slot.day}-${slot.time}`} className={`cal-row is-${slot.status}`}>
                      <div>
                        <strong>{slot.day} · {slot.time}</strong>
                        <span>{slot.label} ({slot.area})</span>
                      </div>
                      <span className="cal-badge">{slot.status === "blocked" ? "School PE" : "Confirmed"}</span>
                    </div>
                  ))}
                  <div
                    className={`cal-row ${
                      hallBookingState === "paid"
                        ? "is-confirmed"
                        : hallBookingState === "held" || (hallScenarioId === "book" && hallSentCount > 0)
                        ? "is-hold"
                        : "is-open"
                    }`}
                  >
                    <div>
                      <strong>Sat · 14:00–16:00</strong>
                      <span>
                        {hallBookingState === "paid"
                          ? "HAL-4821 · Badminton (Half A)"
                          : hallBookingState === "held"
                          ? "HAL-4821 · Held 48h awaiting payment (Half A)"
                          : "Open slot · Half A (350 DKK/hr)"}
                      </span>
                    </div>
                    <span className="cal-badge">
                      {hallBookingState === "paid"
                        ? "Paid ✓"
                        : hallBookingState === "held"
                        ? "Hold 48h"
                        : "Available"}
                    </span>
                  </div>
                  {hallScenarioId === "discount" && (
                    <div className="cal-row is-escalated">
                      <div>
                        <strong>Inbox Escalation · Winter Season</strong>
                        <span>25% club discount request forwarded to Lars Mikkelsen</span>
                      </div>
                      <span className="cal-badge">Needs human</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeId === "vesna" && (
          <div className="demo-workbench">
            <div className="demo-bar">
              <div>
                <strong>Interactive demo — VESNA Collector</strong>
                <span>Trigger a parallel run across ~1,080+ stations or inspect the real FastAPI UI</span>
              </div>
              <div className="bar-actions">
                <button
                  type="button"
                  className={`mini-btn ${vesnaView === "simulator" ? "is-active" : ""}`}
                  onClick={() => setVesnaView("simulator")}
                >
                  Interactive monitor
                </button>
                <button
                  type="button"
                  className={`mini-btn ${vesnaView === "screenshot" ? "is-active" : ""}`}
                  onClick={() => setVesnaView("screenshot")}
                >
                  Real dashboard screenshot
                </button>
              </div>
            </div>

            {vesnaView === "screenshot" ? (
              <div className="screenshot-frame">
                <img
                  src="https://raw.githubusercontent.com/kubik191/lejak/main/WebSite/public/vesna-dashboard.png"
                  alt="VESNA Collector FastAPI dashboard showing monitored SHMÚ hydrological stations, run history, and worker heartbeat"
                />
                <p className="caption">
                  Actual FastAPI + htmx + Tailwind dashboard running in Docker, monitoring ~1,100 SHMÚ stations.
                </p>
              </div>
            ) : (
              <div className="demo-grid">
                <div className="demo-pane">
                  <div className="vesna-controls">
                    <button
                      type="button"
                      className="button button-primary button-sm"
                      onClick={triggerVesnaRun}
                      disabled={vesnaRunState === "running"}
                    >
                      {vesnaRunState === "running" ? "Fetching SHMÚ pages…" : "Run all sources now"}
                    </button>
                    <button
                      type="button"
                      className={`mini-btn ${vesnaOutage ? "is-danger" : ""}`}
                      onClick={() => setVesnaOutage((v) => !v)}
                    >
                      {vesnaOutage ? "Clear outage simulation" : "Simulate 3× station failure"}
                    </button>
                  </div>

                  <div className="source-list">
                    {VESNA_SOURCES.map((src, idx) => {
                      const isFailing = vesnaOutage && idx === 0;
                      const statusLabel = isFailing
                        ? "1 station failing (3/3)"
                        : vesnaRunState === "running"
                        ? "Fetching…"
                        : vesnaRunState === "done"
                        ? `+${src.newRows.toLocaleString()} stored`
                        : "Healthy";
                      return (
                        <div key={src.id} className={`source-row ${isFailing ? "is-alert" : ""}`}>
                          <div>
                            <strong>{src.name}</strong>
                            <span>
                              ~{src.stations} stations · {src.schedule}
                            </span>
                          </div>
                          <span className={`cal-badge ${isFailing ? "badge-danger" : vesnaRunState === "done" ? "badge-ok" : ""}`}>
                            {statusLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="demo-pane">
                  <p className="pane-label">Worker heartbeat &amp; escalation log</p>
                  <div className="heartbeat-card">
                    <div className="hb-row">
                      <span>Worker process</span>
                      <strong className="hb-ok">● Alive (cron scheduler + queue)</strong>
                    </div>
                    <div className="hb-row">
                      <span>Deduplication</span>
                      <strong>(station, observed_at, variable) unique</strong>
                    </div>
                    <div className="hb-row">
                      <span>Last full run duration</span>
                      <strong>{vesnaRunState === "done" ? "5m 48s (parallel, rate-limited)" : "~6 min average"}</strong>
                    </div>
                  </div>

                  {vesnaOutage ? (
                    <div className="alert-email-box">
                      <span className="status-pill is-warn">Email alert triggered</span>
                      <p>
                        <strong>Subject:</strong> [VESNA Collector] Station failing 3 runs in a row
                      </p>
                      <p>
                        Station <code>5010 (Slaná – Bretka)</code> returned{" "}
                        <em>&ldquo;Stanica nie je momentálne dostupná&rdquo;</em> for 3 consecutive runs.
                        Other 1,079 stations remain healthy and stored.
                      </p>
                    </div>
                  ) : (
                    <div className="quiet-box">
                      <strong>Quiet when healthy</strong>
                      <p>
                        All 4 SHMÚ sources validated cleanly. No alert email sent — your team only hears from
                        VESNA when human attention is needed.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeId === "qgis" && (
          <div className="demo-workbench">
            <div className="demo-bar">
              <div>
                <strong>Interactive demo — Hydro Doplnenie v0.3.0 (QGIS preview)</strong>
                <span>Filter points, inspect attribute/rating-curve mapping, and import with backup</span>
              </div>
              <button type="button" className="mini-btn" onClick={resetQgisDemo}>
                Reset preview
              </button>
            </div>

            <div className="qgis-filters">
              <div className="scenario-pills">
                <button
                  type="button"
                  className={`scenario-btn ${qgisFilter === "all" ? "is-selected" : ""}`}
                  onClick={() => setQgisFilter("all")}
                >
                  All ({QGIS_ROWS.length})
                </button>
                <button
                  type="button"
                  className={`scenario-btn ${qgisFilter === "ready" ? "is-selected" : ""}`}
                  onClick={() => setQgisFilter("ready")}
                >
                  Ready to import ({QGIS_ROWS.filter((r) => r.status === "add" && !qgisImportedIds.includes(r.id)).length})
                </button>
                <button
                  type="button"
                  className={`scenario-btn ${qgisFilter === "vybrezuje" ? "is-selected" : ""}`}
                  onClick={() => setQgisFilter("vybrezuje")}
                >
                  Overbank (&ldquo;vybrežuje&rdquo;) ({QGIS_ROWS.filter((r) => r.vybrezuje).length})
                </button>
                <button
                  type="button"
                  className={`scenario-btn ${qgisFilter === "existing" ? "is-selected" : ""}`}
                  onClick={() => setQgisFilter("existing")}
                >
                  In destination ({QGIS_ROWS.filter((r) => r.status === "skip_existing" || qgisImportedIds.includes(r.id)).length})
                </button>
              </div>
              <button
                type="button"
                className="button button-primary button-sm"
                onClick={runQgisImport}
                disabled={pendingSelectedCount === 0}
              >
                {pendingSelectedCount > 0
                  ? `Backup & import ${pendingSelectedCount} selected`
                  : "All selected imported ✓"}
              </button>
            </div>

            <div className="qgis-table-wrap">
              <table className="qgis-table">
                <thead>
                  <tr>
                    <th aria-label="Select"></th>
                    <th>Model</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th>Druh_bodu</th>
                    <th>Tok</th>
                    <th>Profil</th>
                    <th>rkm</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleQgisRows.map((row) => {
                    const isImported = qgisImportedIds.includes(row.id);
                    const isExisting = row.status === "skip_existing";
                    const isChecked = qgisSelectedIds.includes(row.id);
                    const isActiveRow = inspectedQgisRow.id === row.id;
                    return (
                      <tr
                        key={row.id}
                        className={`${isActiveRow ? "is-row-active" : ""} ${isExisting ? "is-muted-row" : ""}`}
                        onClick={() => setQgisInspectId(row.id)}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${row.tok} ${row.profil}`}
                            disabled={isExisting || isImported}
                            checked={isChecked || isImported}
                            onChange={() => toggleQgisRow(row.id)}
                          />
                        </td>
                        <td>{row.model}</td>
                        <td><code>{row.layer}</code></td>
                        <td>
                          <span
                            className={`status-pill ${
                              isImported
                                ? "is-success"
                                : isExisting
                                ? "is-muted"
                                : "is-info"
                            }`}
                          >
                            {isImported ? "Imported" : isExisting ? "Already in layer" : "New"}
                          </span>
                        </td>
                        <td>{row.druh}</td>
                        <td>{row.tok}</td>
                        <td>{row.profil}</td>
                        <td>{row.rkm}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="qgis-inspector">
              <div>
                <span className="pane-label">Selected row mapping &amp; rating-curve preview</span>
                <p className="inspector-title">
                  <strong>{inspectedQgisRow.tok}</strong> — {inspectedQgisRow.profil} (rkm {inspectedQgisRow.rkm})
                </p>
                <p className="inspector-detail">
                  <strong>Field mapping:</strong> {inspectedQgisRow.mapping}
                </p>
                <p className="inspector-detail">
                  <strong>Interpolated levels:</strong> {inspectedQgisRow.curves}
                </p>
              </div>
              {qgisBackupCreated && (
                <div className="backup-toast">
                  <strong>✓ Timestamped backup created</strong>
                  <span>
                    Saved snapshot to <code>_backups/Hydrologia_SK_doplnenie.shp</code> and imported{" "}
                    {qgisImportedIds.length} points cleanly.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <p className="stay">{activeProject.stay}</p>
      </article>
    </div>
  );
}
