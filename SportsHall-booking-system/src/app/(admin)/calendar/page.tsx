"use client";

import { useMemo, useState } from "react";
import BookingModal, { type BookingDraft } from "@/components/BookingModal";
import { refreshAppState, useAppState } from "@/components/useAppState";
import { addDays, fromMinutes, parseISODate, startOfWeek, toISODate, toMinutes, weekday } from "@/lib/time";
import type { AreaId, Booking } from "@/lib/types";

const HOUR_PX = 46;
const FIRST_HOUR = 7;
const LAST_HOUR = 22;
const VISIBLE = ["confirmed", "awaiting_payment", "blocked"];

function isoWeek(date: string) {
  const d = parseISODate(date);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function blockStyle(b: Booking) {
  if (b.status === "blocked") return "blocked-stripes border-slate-300 text-slate-600";
  if (b.status === "awaiting_payment") return "bg-amber-50 border-amber-400 border-dashed text-amber-900";
  if (b.paymentMethod === "invoice") return "bg-sky-50 border-sky-400 text-sky-900";
  return "bg-emerald-50 border-emerald-500 text-emerald-900";
}

function lane(area: AreaId) {
  if (area === "a") return { left: "2px", width: "calc(50% - 3px)" };
  if (area === "b") return { left: "calc(50% + 1px)", width: "calc(50% - 3px)" };
  return { left: "2px", width: "calc(100% - 4px)" };
}

export default function CalendarPage() {
  const { state } = useAppState();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(toISODate(new Date())));
  const [editing, setEditing] = useState<Booking | null>(null);
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const today = toISODate(new Date());

  const weekBookings = useMemo(
    () => (state?.bookings ?? []).filter((b) => VISIBLE.includes(b.status) && b.date >= days[0] && b.date <= days[6]),
    [state, days],
  );

  const stats = useMemo(() => {
    const bookable = weekBookings.filter((b) => b.status !== "blocked");
    const awaiting = (state?.bookings ?? []).filter((b) => b.status === "awaiting_payment");
    const aiBookings = (state?.bookings ?? []).filter((b) => b.source === "email" && VISIBLE.includes(b.status));
    const emailsHandled = (state?.threads ?? []).reduce((n, t) => n + t.messages.filter((m) => m.sender === "ai").length, 0);
    return {
      bookings: bookable.length,
      awaitingCount: awaiting.length,
      awaitingSum: awaiting.reduce((s, b) => s + b.amount, 0),
      aiBookings: aiBookings.length,
      emailsHandled,
    };
  }, [weekBookings, state]);

  if (!state) return <div className="p-8 text-slate-500">Loading…</div>;
  const hall = state.hall;

  function onDayClick(date: string, e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minutes = FIRST_HOUR * 60 + Math.floor((y / HOUR_PX) * 2) * 30;
    const x = e.clientX - rect.left;
    setDraft({
      date,
      start: fromMinutes(minutes),
      end: fromMinutes(Math.min(minutes + 60, LAST_HOUR * 60)),
      area: x < rect.width / 2 ? "a" : "b",
    });
  }

  function saved(message?: string) {
    setEditing(null);
    setDraft(null);
    refreshAppState();
    if (message) {
      setToast(message);
      setTimeout(() => setToast(null), 5000);
    }
  }

  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i);
  const gridHeight = (LAST_HOUR - FIRST_HOUR) * HOUR_PX;
  const monthLabel = `${parseISODate(days[0]).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${parseISODate(days[6]).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Booking calendar</h1>
          <p className="text-sm text-slate-500">Click an empty spot to add a booking, or a booking to edit it.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</button>
          <button className="btn-secondary" onClick={() => setWeekStart(startOfWeek(today))}>Today</button>
          <button className="btn-secondary" onClick={() => setWeekStart(addDays(weekStart, 7))}>›</button>
          <div className="ml-2 min-w-48 text-sm">
            <div className="font-semibold">Week {isoWeek(weekStart)}</div>
            <div className="text-slate-500">{monthLabel}</div>
          </div>
          <button
            className="btn-primary"
            onClick={() => setDraft({ date: today < days[0] ? days[0] : today, start: "16:00", end: "17:00", area: "full" })}
          >
            + New booking
          </button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Bookings this week" value={stats.bookings} />
        <Stat label="Awaiting payment" value={stats.awaitingCount} sub={`${stats.awaitingSum.toLocaleString("da-DK")} DKK`} tone="amber" />
        <Stat label="Booked automatically by AI" value={stats.aiBookings} tone="indigo" />
        <Stat label="Emails answered by AI" value={stats.emailsHandled} tone="indigo" />
      </div>

      <div className="card overflow-hidden">
        <div className="grid border-b border-slate-200" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
          <div />
          {days.map((d) => {
            const oh = hall.openingHours[weekday(d)];
            return (
              <div key={d} className={`border-l border-slate-100 px-2 py-2 text-center ${d === today ? "bg-emerald-50" : ""}`}>
                <div className={`text-xs uppercase tracking-wide ${d === today ? "text-emerald-800" : "text-slate-500"}`}>
                  {parseISODate(d).toLocaleDateString("en-GB", { weekday: "short" })}
                </div>
                <div className={`text-lg font-semibold ${d === today ? "text-emerald-800" : ""}`}>{parseISODate(d).getDate()}</div>
                <div className="text-[10px] text-slate-400">{oh ? `${oh.open}–${oh.close}` : "closed"}</div>
              </div>
            );
          })}
        </div>

        <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
          <div className="grid" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
            <div className="relative" style={{ height: gridHeight }}>
              {hours.map((h) => (
                <div key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-slate-400" style={{ top: (h - FIRST_HOUR) * HOUR_PX }}>
                  {h > FIRST_HOUR ? `${String(h).padStart(2, "0")}:00` : ""}
                </div>
              ))}
            </div>

            {days.map((d) => {
              const oh = hall.openingHours[weekday(d)];
              const openTop = oh ? ((toMinutes(oh.open) - FIRST_HOUR * 60) / 60) * HOUR_PX : gridHeight;
              const closeTop = oh ? ((toMinutes(oh.close) - FIRST_HOUR * 60) / 60) * HOUR_PX : gridHeight;
              return (
                <div
                  key={d}
                  className={`relative cursor-cell border-l border-slate-100 ${d === today ? "bg-emerald-50/30" : ""}`}
                  style={{
                    height: gridHeight,
                    backgroundImage: `repeating-linear-gradient(to bottom, #eef2f7 0, #eef2f7 1px, transparent 1px, transparent ${HOUR_PX}px)`,
                  }}
                  onClick={(e) => onDayClick(d, e)}
                >
                  {openTop > 0 && <div className="pointer-events-none absolute inset-x-0 top-0 bg-slate-100/80" style={{ height: openTop }} />}
                  {closeTop < gridHeight && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-slate-100/80" style={{ top: Math.max(closeTop, 0) }} />
                  )}
                  <div className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-dashed border-slate-100" />

                  {weekBookings
                    .filter((b) => b.date === d)
                    .map((b) => {
                      const top = ((toMinutes(b.start) - FIRST_HOUR * 60) / 60) * HOUR_PX;
                      const height = ((toMinutes(b.end) - toMinutes(b.start)) / 60) * HOUR_PX;
                      return (
                        <button
                          key={b.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditing(b);
                          }}
                          className={`absolute overflow-hidden rounded-md border-l-4 border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition hover:z-10 hover:shadow-md ${blockStyle(b)}`}
                          style={{ top: top + 1, height: height - 2, ...lane(b.area) }}
                          title={`${b.title}\n${b.start}–${b.end} · ${hall.areas.find((a) => a.id === b.area)?.name}`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="truncate font-semibold">{b.title}</span>
                            {b.source === "email" && (
                              <span className="shrink-0 rounded bg-emerald-700 px-1 text-[9px] font-bold text-white">AI</span>
                            )}
                            {b.source === "web" && (
                              <span className="shrink-0 rounded bg-teal-700 px-1 text-[9px] font-bold text-white">WEB</span>
                            )}
                          </div>
                          <div className="truncate opacity-75">
                            {b.start}–{b.end}
                            {b.area !== "full" ? ` · ${b.area.toUpperCase()}` : ""}
                          </div>
                          {b.status === "awaiting_payment" && height > 40 && <div className="truncate font-medium">Awaiting payment</div>}
                        </button>
                      );
                    })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
        <Legend className="bg-emerald-50 border-emerald-500" label="Confirmed & paid" />
        <Legend className="bg-sky-50 border-sky-400" label="Club / season (invoiced)" />
        <Legend className="bg-amber-50 border-amber-400 border-dashed" label="Reserved – awaiting payment" />
        <Legend className="blocked-stripes border-slate-300" label="Blocked (school use)" />
        <span className="text-slate-400">Left half of a day = Half A, right half = Half B, full width = Full hall.</span>
      </div>

      {(editing || draft) && (
        <BookingModal
          hall={hall}
          booking={editing ?? undefined}
          draft={draft ?? undefined}
          onClose={() => {
            setEditing(null);
            setDraft(null);
          }}
          onSaved={saved}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: "amber" | "indigo" }) {
  const color = tone === "amber" ? "text-amber-600" : tone === "indigo" ? "text-indigo-600" : "text-slate-900";
  return (
    <div className="card px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>
        {value}
        {sub && <span className="ml-2 text-sm font-normal text-slate-500">{sub}</span>}
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-3 w-4 rounded-sm border border-l-4 ${className}`} />
      {label}
    </span>
  );
}
