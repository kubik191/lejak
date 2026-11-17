"use client";

import { useState } from "react";

const CAPABILITIES = [
  {
    id: "booking",
    num: "01",
    tabLabel: "Booking & Inbox",
    shortRole: "Calendar & email assistant",
    tag: "Booking & automation",
    title: "Booking and inbox, without the back-and-forth",
    summary:
      "Built for venues, clinics, studios, and local facilities that still manage bookings by email and paper. An assistant reads incoming requests, checks your live calendar, holds open slots with a payment link, and answers everyday questions—while unusual requests go straight to a person.",
    stay: "Unusual requests — like custom discounts, long-term agreements, or special terms — go to your team instead of automatic booking.",
    before: "Manual email back-and-forth, paper or spreadsheet schedules, and forgotten unpaid holds.",
    after: "Instant calendar checks, 48-hour payment holds (REF-4821), and automated customer Q&A.",
    metrics: [
      { value: "Multi-zone", label: "Full venue or split rooms" },
      { value: "48h hold", label: "Auto-expires if unpaid" },
      { value: "100%", label: "Special deals routed to staff" },
    ],
    stack: ["Email AI Assistant", "Live Calendar", "Payment Links", "Knowledge Base"],
  },
  {
    id: "collector",
    num: "02",
    tabLabel: "Scheduled Data Collector",
    shortRole: "Monitoring & alerts",
    tag: "Automation & monitoring",
    title: "Data collection that watches itself",
    summary:
      "Built for teams that still pull numbers by hand from portals, supplier feeds, or field sensors—or rely on overnight scripts that fail silently. A scheduled collector fetches sources in parallel, stores a clean deduplicated history, shows live health on a dashboard, and alerts you only when something breaks.",
    stay: "People get involved only when a feed fails repeatedly or needs attention — never for routine fetches.",
    before: "Manual downloads or slow sequential scripts (~35 min) with duplicate CSV files and silent failures.",
    after: "Concurrent scheduled collection (~6 min), clean time-series history, and actionable email alerts.",
    metrics: [
      { value: "35m → 6m", label: "Parallel collection speed" },
      { value: "1,000+", label: "Endpoints monitored" },
      { value: "3-strike", label: "Smart alert escalation" },
    ],
    stack: ["Scheduled Workers", "Web Dashboard", "Deduplicated DB", "Email Alerts"],
  },
  {
    id: "mapper",
    num: "03",
    tabLabel: "Workflow & Data Mapper",
    shortRole: "Batch mapping & import",
    tag: "Workflow tool",
    title: "Software that does the tedious copying",
    summary:
      "Built for specialists in GIS, engineering, finance, or operations who spend hours zooming, clicking, and copy-pasting records between folders, spreadsheets, and specialist software. A custom tool scans inputs, maps fields, computes lookup values, shows a clear preview, and imports selected rows with a backup.",
    stay: "The specialist still reviews, filters, and confirms every record. The tool takes over the repetitive copying.",
    before: "Opening folders one by one and copying coordinates, fields, and spreadsheet lookups row by row.",
    after: "Batch folder scan, automated field mapping, interactive review table, and snapshot backups.",
    metrics: [
      { value: "Multi-file", label: "Layers + spreadsheet lookups" },
      { value: "Preview", label: "Human review before import" },
      { value: "Auto backup", label: "Snapshot before every write" },
    ],
    stack: ["Custom Plugin / Tool", "Field Mapping", "Spreadsheet Lookup", "Automatic Backups"],
  },
];

const BOOKING_SCENARIOS = [
  {
    id: "book",
    label: "1. Booking request",
    from: "Alex Carter <alex@community-club.org>",
    subject: "Room booking Saturday 14:00–16:00",
    body: "Hi there, could we book Studio A this Saturday from 14:00 to 16:00 for a group session? Thanks, Alex",
    intent: "booking_request",
    badge: "48h payment hold created",
    badgeKind: "info",
    reply:
      "Hi Alex — Studio A is open this Saturday 14:00–16:00. We have placed a 48-hour hold (Ref: REF-4821, €70 for 2 hours). Complete your online payment or bank transfer to confirm the booking and receive your entry code.",
    canPay: true,
  },
  {
    id: "question",
    label: "2. Facility question",
    from: "Hannah Brooks <hannah.brooks@mail.com>",
    subject: "Changing rooms & visitor parking?",
    body: "Hi! Are changing rooms and basic equipment included in the booking price, and where can visitors park?",
    intent: "info_question",
    badge: "Answered from knowledge base",
    badgeKind: "success",
    reply:
      "Hi Hannah — yes, access to two changing rooms with showers and standard venue equipment is included in the rate. Visitors have 20 free parking spaces right outside the main entrance on weekends and after 16:00 on weekdays.",
    canPay: false,
  },
  {
    id: "discount",
    label: "3. Needs manager",
    from: "Northside Athletics <board@northside.org>",
    subject: "Full winter season + 25% discount",
    body: "Hello, we would like to reserve every Tuesday evening for the entire winter season if you can offer a 25% group discount.",
    intent: "escalate_human",
    badge: "Forwarded to manager",
    badgeKind: "warn",
    reply:
      "Hi Northside Athletics — seasonal agreements and custom group discounts are reviewed personally by our venue manager. I have forwarded your message to them right away rather than booking anything automatically.",
    canPay: false,
  },
];

const INITIAL_SCHEDULE_SLOTS = [
  { day: "Mon–Fri", time: "08:00–15:00", area: "Main space", label: "Recurring daytime sessions", status: "blocked" },
  { day: "Wed", time: "18:00–20:00", area: "Studio A & B", label: "Weekly club training", status: "confirmed" },
  { day: "Sat", time: "09:00–11:00", area: "Main space", label: "Weekend youth group", status: "confirmed" },
];

const COLLECTOR_SOURCES = [
  { id: "registry", name: "Public Registry Feed", endpoints: 400, schedule: "Every 6h", newRows: 19200 },
  { id: "supplier", name: "Supplier Stock & Pricing", endpoints: 480, schedule: "Every 6h", newRows: 11520 },
  { id: "summary", name: "Daily Operations Summary", endpoints: 80, schedule: "Daily 08:30", newRows: 640 },
  { id: "sensors", name: "Regional Sensor Network", endpoints: 120, schedule: "Every 6h", newRows: 1440 },
];

const MAPPER_ROWS = [
  {
    id: "r1",
    batch: "Batch_10",
    source: "Flow_Points.shp",
    status: "add",
    recordType: "Flow measurement",
    zone: "North Valley",
    station: "Station A (Bridge)",
    refKm: "26.2",
    mapping: "Site_Name → site · Profile → station · km → ref_km",
    lookup: "Level_10yr=242.8 cm · Level_100yr=350.1 cm · Level_1000yr=Exceeds bank (review)",
    flagged: true,
  },
  {
    id: "r2",
    batch: "Batch_10",
    source: "Gauge_Levels.shp",
    status: "add",
    recordType: "Reference gauge",
    zone: "North Valley",
    station: "Station B (Weir)",
    refKm: "51.9",
    mapping: "Zero_Level → gauge_zero · Type='Reference gauge'",
    lookup: "Level_10yr=212.0 cm · Level_100yr=276.9 cm · Level_1000yr=Exceeds bank (review)",
    flagged: true,
  },
  {
    id: "r3",
    batch: "Batch_39",
    source: "Flow_Points.shp",
    status: "add",
    recordType: "Flow measurement",
    zone: "Upper Basin",
    station: "Meadow Creek",
    refKm: "0.95",
    mapping: "Area_km2 → basin_area · Grade → accuracy_class",
    lookup: "Level_10yr=163.1 cm · Level_100yr=300.0 cm · Level_1000yr=Within channel",
    flagged: false,
  },
  {
    id: "r4",
    batch: "Batch_40",
    source: "Flow_Points.shp",
    status: "add",
    recordType: "Flow measurement",
    zone: "West Ridge",
    station: "Mill Stream",
    refKm: "14.8",
    mapping: "Site_Name → site · Station_ID → external_id",
    lookup: "Level_10yr=205.0 cm · Level_100yr=Exceeds bank (review)",
    flagged: true,
  },
  {
    id: "r5",
    batch: "Batch_64",
    source: "Wave_Series.xlsx",
    status: "add",
    recordType: "Peak wave series",
    zone: "Central Basin",
    station: "Reservoir Outlet",
    refKm: "5.1",
    mapping: "Matched to nearest gauge within 69 m (< 250 m threshold)",
    lookup: "Peak_100yr=230 m³/s · Level_100yr=320.2 cm",
    flagged: false,
  },
  {
    id: "r6",
    batch: "Batch_10",
    source: "Flow_Points.shp",
    status: "skip_existing",
    recordType: "Flow measurement",
    zone: "North Valley",
    station: "Lower Crossing",
    refKm: "21.1",
    mapping: "Exact coordinate & ID match found in destination",
    lookup: "Skipped automatically (no duplicate created)",
    flagged: false,
  },
];

export default function ProjectShowcase() {
  const [activeId, setActiveId] = useState("booking");

  // Booking demo state
  const [bookingScenarioId, setBookingScenarioId] = useState("book");
  const [bookingSlotState, setBookingSlotState] = useState("idle"); // "idle" | "held" | "paid"
  const [bookingTriggerCount, setBookingTriggerCount] = useState(0);

  // Collector demo state
  const [collectorRunState, setCollectorRunState] = useState("idle"); // "idle" | "running" | "done"
  const [collectorOutage, setCollectorOutage] = useState(false);

  // Mapper demo state
  const [mapperFilter, setMapperFilter] = useState("all");
  const [mapperSelectedIds, setMapperSelectedIds] = useState(["r1", "r2", "r3", "r4", "r5"]);
  const [mapperInspectId, setMapperInspectId] = useState("r1");
  const [mapperImportedIds, setMapperImportedIds] = useState([]);
  const [mapperBackupCreated, setMapperBackupCreated] = useState(false);

  const activeCapability = CAPABILITIES.find((p) => p.id === activeId) || CAPABILITIES[0];
  const bookingScenario = BOOKING_SCENARIOS.find((s) => s.id === bookingScenarioId) || BOOKING_SCENARIOS[0];

  function selectBookingScenario(id) {
    setBookingScenarioId(id);
    setBookingTriggerCount((c) => c + 1);
    if (id === "book" && bookingSlotState === "idle") {
      setBookingSlotState("held");
    }
  }

  function resetBookingDemo() {
    setBookingScenarioId("book");
    setBookingSlotState("idle");
    setBookingTriggerCount(0);
  }

  function triggerCollectorRun() {
    setCollectorRunState("running");
    setTimeout(() => {
      setCollectorRunState("done");
    }, 650);
  }

  function toggleMapperRow(id) {
    setMapperSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function runMapperImport() {
    const readyToImport = MAPPER_ROWS.filter(
      (r) => r.status === "add" && mapperSelectedIds.includes(r.id) && !mapperImportedIds.includes(r.id)
    ).map((r) => r.id);
    if (readyToImport.length === 0) return;
    setMapperBackupCreated(true);
    setMapperImportedIds((prev) => [...new Set([...prev, ...readyToImport])]);
  }

  function resetMapperDemo() {
    setMapperSelectedIds(["r1", "r2", "r3", "r4", "r5"]);
    setMapperImportedIds([]);
    setMapperBackupCreated(false);
    setMapperFilter("all");
    setMapperInspectId("r1");
  }

  const visibleMapperRows = MAPPER_ROWS.filter((row) => {
    if (mapperFilter === "ready") return row.status === "add" && !mapperImportedIds.includes(row.id);
    if (mapperFilter === "flagged") return row.flagged;
    if (mapperFilter === "existing") return row.status === "skip_existing" || mapperImportedIds.includes(row.id);
    return true;
  });

  const inspectedMapperRow = MAPPER_ROWS.find((r) => r.id === mapperInspectId) || MAPPER_ROWS[0];
  const pendingSelectedCount = MAPPER_ROWS.filter(
    (r) => r.status === "add" && mapperSelectedIds.includes(r.id) && !mapperImportedIds.includes(r.id)
  ).length;

  return (
    <div className="showcase">
      <div className="showcase-tabs" role="tablist" aria-label="Interactive workflow capabilities">
        {CAPABILITIES.map((cap) => {
          const selected = cap.id === activeId;
          return (
            <button
              key={cap.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`showcase-tab ${selected ? "is-active" : ""}`}
              onClick={() => setActiveId(cap.id)}
            >
              <span className="showcase-tab-num">{cap.num}</span>
              <span className="showcase-tab-text">
                <strong>{cap.tabLabel}</strong>
                <span>{cap.shortRole}</span>
              </span>
            </button>
          );
        })}
      </div>

      <article className="showcase-panel" role="tabpanel">
        <div className="showcase-header">
          <div>
            <div className="showcase-meta">
              <span className="tag">{activeCapability.tag}</span>
              <div className="stack-list">
                {activeCapability.stack.map((item) => (
                  <span key={item} className="stack-pill">{item}</span>
                ))}
              </div>
            </div>
            <h3>{activeCapability.title}</h3>
            <p className="showcase-summary">{activeCapability.summary}</p>
          </div>
          <a className="button button-ghost repo-link" href="/#contact">
            Request something similar →
          </a>
        </div>

        <div className="before-after">
          <div className="ba-box ba-before">
            <span className="ba-label">Before</span>
            <p>{activeCapability.before}</p>
          </div>
          <div className="ba-box ba-after">
            <span className="ba-label">With automation</span>
            <p>{activeCapability.after}</p>
          </div>
        </div>

        <div className="metrics-row">
          {activeCapability.metrics.map((metric) => (
            <div key={metric.label} className="metric-card">
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </div>
          ))}
        </div>

        {activeId === "booking" && (
          <div className="demo-workbench">
            <div className="demo-bar">
              <div>
                <strong>Interactive walkthrough — Email &amp; calendar booking assistant</strong>
                <span>Click an incoming email to see how the assistant handles bookings, Q&amp;A, and escalations</span>
              </div>
              <button type="button" className="mini-btn" onClick={resetBookingDemo}>
                Reset demo
              </button>
            </div>

            <div className="demo-grid">
              <div className="demo-pane">
                <p className="pane-label">1. Incoming customer emails</p>
                <div className="scenario-pills">
                  {BOOKING_SCENARIOS.map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      className={`scenario-btn ${bookingScenarioId === sc.id ? "is-selected" : ""}`}
                      onClick={() => selectBookingScenario(sc.id)}
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>

                <div className="email-card">
                  <div className="email-head">
                    <span><strong>From:</strong> {bookingScenario.from}</span>
                    <span><strong>Subject:</strong> {bookingScenario.subject}</span>
                  </div>
                  <p className="email-body">{bookingScenario.body}</p>
                </div>

                <div className="ai-reply-card">
                  <div className="ai-reply-top">
                    <span className={`status-pill is-${bookingScenario.badgeKind}`}>{bookingScenario.badge}</span>
                    <span className="intent-tag">intent: {bookingScenario.intent}</span>
                  </div>
                  <p>{bookingScenario.reply}</p>
                  {bookingScenario.canPay && (
                    <div className="pay-action-row">
                      {bookingSlotState === "paid" ? (
                        <span className="paid-confirmed">✓ Payment received · Access code sent automatically</span>
                      ) : (
                        <button
                          type="button"
                          className="button button-primary button-sm"
                          onClick={() => setBookingSlotState("paid")}
                        >
                          Simulate instant payment (€70)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="demo-pane">
                <p className="pane-label">2. Live venue calendar</p>
                <div className="calendar-list">
                  {INITIAL_SCHEDULE_SLOTS.map((slot) => (
                    <div key={`${slot.day}-${slot.time}`} className={`cal-row is-${slot.status}`}>
                      <div>
                        <strong>{slot.day} · {slot.time}</strong>
                        <span>{slot.label} ({slot.area})</span>
                      </div>
                      <span className="cal-badge">{slot.status === "blocked" ? "Recurring" : "Confirmed"}</span>
                    </div>
                  ))}
                  <div
                    className={`cal-row ${
                      bookingSlotState === "paid"
                        ? "is-confirmed"
                        : bookingSlotState === "held" || (bookingScenarioId === "book" && bookingTriggerCount > 0)
                        ? "is-hold"
                        : "is-open"
                    }`}
                  >
                    <div>
                      <strong>Sat · 14:00–16:00</strong>
                      <span>
                        {bookingSlotState === "paid"
                          ? "REF-4821 · Group session (Studio A)"
                          : bookingSlotState === "held"
                          ? "REF-4821 · Held 48h awaiting payment (Studio A)"
                          : "Open slot · Studio A (€35/hr)"}
                      </span>
                    </div>
                    <span className="cal-badge">
                      {bookingSlotState === "paid"
                        ? "Paid ✓"
                        : bookingSlotState === "held"
                        ? "Hold 48h"
                        : "Available"}
                    </span>
                  </div>
                  {bookingScenarioId === "discount" && (
                    <div className="cal-row is-escalated">
                      <div>
                        <strong>Staff Escalation · Winter Season</strong>
                        <span>25% group discount request held for manager review</span>
                      </div>
                      <span className="cal-badge">Needs human</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeId === "collector" && (
          <div className="demo-workbench">
            <div className="demo-bar">
              <div>
                <strong>Interactive walkthrough — Scheduled data collector</strong>
                <span>Run a parallel collection across 1,000+ endpoints or simulate an outage alert</span>
              </div>
              <button
                type="button"
                className="mini-btn"
                onClick={() => {
                  setCollectorRunState("idle");
                  setCollectorOutage(false);
                }}
              >
                Reset monitor
              </button>
            </div>

            <div className="demo-grid">
              <div className="demo-pane">
                <div className="collector-controls">
                  <button
                    type="button"
                    className="button button-primary button-sm"
                    onClick={triggerCollectorRun}
                    disabled={collectorRunState === "running"}
                  >
                    {collectorRunState === "running" ? "Collecting feeds…" : "Run all collectors now"}
                  </button>
                  <button
                    type="button"
                    className={`mini-btn ${collectorOutage ? "is-danger" : ""}`}
                    onClick={() => setCollectorOutage((v) => !v)}
                  >
                    {collectorOutage ? "Clear outage simulation" : "Simulate 3× source failure"}
                  </button>
                </div>

                <div className="source-list">
                  {COLLECTOR_SOURCES.map((src, idx) => {
                    const isFailing = collectorOutage && idx === 0;
                    const statusLabel = isFailing
                      ? "1 endpoint failing (3/3)"
                      : collectorRunState === "running"
                      ? "Fetching…"
                      : collectorRunState === "done"
                      ? `+${src.newRows.toLocaleString()} stored`
                      : "Healthy";
                    return (
                      <div key={src.id} className={`source-row ${isFailing ? "is-alert" : ""}`}>
                        <div>
                          <strong>{src.name}</strong>
                          <span>
                            ~{src.endpoints} endpoints · {src.schedule}
                          </span>
                        </div>
                        <span className={`cal-badge ${isFailing ? "badge-danger" : collectorRunState === "done" ? "badge-ok" : ""}`}>
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
                    <strong>(source, timestamp, metric) unique</strong>
                  </div>
                  <div className="hb-row">
                    <span>Last full run duration</span>
                    <strong>{collectorRunState === "done" ? "5m 48s (parallel, rate-limited)" : "~6 min average"}</strong>
                  </div>
                </div>

                {collectorOutage ? (
                  <div className="alert-email-box">
                    <span className="status-pill is-warn">Email alert triggered</span>
                    <p>
                      <strong>Subject:</strong> [Data Collector] Endpoint failing 3 runs in a row
                    </p>
                    <p>
                      <code>Endpoint 14 (North Region)</code> returned{" "}
                      <em>&ldquo;Service temporarily unavailable&rdquo;</em> for 3 consecutive runs.
                      All other 1,079 endpoints remain healthy and stored.
                    </p>
                  </div>
                ) : (
                  <div className="quiet-box">
                    <strong>Quiet when healthy</strong>
                    <p>
                      All 4 scheduled sources validated cleanly. No alert email sent — your team only hears
                      from the collector when human attention is genuinely needed.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeId === "mapper" && (
          <div className="demo-workbench">
            <div className="demo-bar">
              <div>
                <strong>Interactive walkthrough — Batch data mapping &amp; import preview</strong>
                <span>Filter records, inspect automatic field mapping and spreadsheet lookups, and import with backup</span>
              </div>
              <button type="button" className="mini-btn" onClick={resetMapperDemo}>
                Reset preview
              </button>
            </div>

            <div className="qgis-filters">
              <div className="scenario-pills">
                <button
                  type="button"
                  className={`scenario-btn ${mapperFilter === "all" ? "is-selected" : ""}`}
                  onClick={() => setMapperFilter("all")}
                >
                  All ({MAPPER_ROWS.length})
                </button>
                <button
                  type="button"
                  className={`scenario-btn ${mapperFilter === "ready" ? "is-selected" : ""}`}
                  onClick={() => setMapperFilter("ready")}
                >
                  Ready to import ({MAPPER_ROWS.filter((r) => r.status === "add" && !mapperImportedIds.includes(r.id)).length})
                </button>
                <button
                  type="button"
                  className={`scenario-btn ${mapperFilter === "flagged" ? "is-selected" : ""}`}
                  onClick={() => setMapperFilter("flagged")}
                >
                  Flagged threshold ({MAPPER_ROWS.filter((r) => r.flagged).length})
                </button>
                <button
                  type="button"
                  className={`scenario-btn ${mapperFilter === "existing" ? "is-selected" : ""}`}
                  onClick={() => setMapperFilter("existing")}
                >
                  Already imported ({MAPPER_ROWS.filter((r) => r.status === "skip_existing" || mapperImportedIds.includes(r.id)).length})
                </button>
              </div>
              <button
                type="button"
                className="button button-primary button-sm"
                onClick={runMapperImport}
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
                    <th>Batch</th>
                    <th>Source file</th>
                    <th>Status</th>
                    <th>Record type</th>
                    <th>Site / Zone</th>
                    <th>Station</th>
                    <th>Ref km</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMapperRows.map((row) => {
                    const isImported = mapperImportedIds.includes(row.id);
                    const isExisting = row.status === "skip_existing";
                    const isChecked = mapperSelectedIds.includes(row.id);
                    const isActiveRow = inspectedMapperRow.id === row.id;
                    return (
                      <tr
                        key={row.id}
                        className={`${isActiveRow ? "is-row-active" : ""} ${isExisting ? "is-muted-row" : ""}`}
                        onClick={() => setMapperInspectId(row.id)}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${row.zone} ${row.station}`}
                            disabled={isExisting || isImported}
                            checked={isChecked || isImported}
                            onChange={() => toggleMapperRow(row.id)}
                          />
                        </td>
                        <td>{row.batch}</td>
                        <td><code>{row.source}</code></td>
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
                        <td>{row.recordType}</td>
                        <td>{row.zone}</td>
                        <td>{row.station}</td>
                        <td>{row.refKm}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="qgis-inspector">
              <div>
                <span className="pane-label">Selected record mapping &amp; lookup preview</span>
                <p className="inspector-title">
                  <strong>{inspectedMapperRow.zone}</strong> — {inspectedMapperRow.station} (km {inspectedMapperRow.refKm})
                </p>
                <p className="inspector-detail">
                  <strong>Field mapping:</strong> {inspectedMapperRow.mapping}
                </p>
                <p className="inspector-detail">
                  <strong>Calculated lookup values:</strong> {inspectedMapperRow.lookup}
                </p>
              </div>
              {mapperBackupCreated && (
                <div className="backup-toast">
                  <strong>✓ Timestamped backup created</strong>
                  <span>
                    Saved snapshot to <code>_backups/destination_layer_backup.zip</code> and imported{" "}
                    {mapperImportedIds.length} records cleanly.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <p className="stay">{activeCapability.stay}</p>
      </article>
    </div>
  );
}
