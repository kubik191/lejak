"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDays, formatDateShort, startOfWeek, toISODate } from "@/lib/time";
import type { AreaId } from "@/lib/types";

interface Slot {
  start: string;
  end: string;
  price: number;
}

interface Day {
  date: string;
  closed: boolean;
  areas: { id: AreaId; name: string; pricePerHour: number; slots: Slot[] }[];
}

interface WeekData {
  weekStart: string;
  hall: { name: string; address: string; areas: { id: AreaId; name: string }[] };
  days: Day[];
}

export default function BookClient() {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(toISODate(new Date())));
  const [data, setData] = useState<WeekData | null>(null);
  const [area, setArea] = useState<AreaId>("full");
  const [picked, setPicked] = useState<{ date: string; slot: Slot } | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [purpose, setPurpose] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/public/week?week=${weekStart}`, { cache: "no-store" });
    setData(await res.json());
  }, [weekStart]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function submit() {
    if (!picked) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/public/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: picked.date,
          start: picked.slot.start,
          end: picked.slot.end,
          area,
          customerName: name,
          customerEmail: email,
          phone,
          purpose,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not book");
      router.push(json.payUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!data) return <div className="p-10 text-center text-sm text-slate-500">Loading available times…</div>;

  const areaMeta = data.days[0]?.areas.find((a) => a.id === area);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <div className="text-lg font-semibold">{data.hall.name}</div>
            <div className="text-sm text-slate-500">{data.hall.address}</div>
          </div>
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
            HallBook prototype
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <div>
          <h1 className="text-2xl font-semibold">Book the hall</h1>
          <p className="text-sm text-slate-500">
            This is the page a school could put on its website instead of “email the hall manager”. Pick a free hour, then pay.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data.hall.areas.map((a) => (
            <button
              key={a.id}
              onClick={() => { setArea(a.id); setPicked(null); }}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                area === a.id ? "bg-emerald-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"
              }`}
            >
              {a.name}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <button className="btn-secondary" onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</button>
            <button className="btn-secondary" onClick={() => setWeekStart(startOfWeek(toISODate(new Date())))}>This week</button>
            <button className="btn-secondary" onClick={() => setWeekStart(addDays(weekStart, 7))}>›</button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {data.days.map((day) => {
            const slots = day.areas.find((a) => a.id === area)?.slots ?? [];
            return (
              <div key={day.date} className="card p-3">
                <div className="mb-2 text-sm font-semibold">{formatDateShort(day.date)}</div>
                {day.closed || slots.length === 0 ? (
                  <div className="text-xs text-slate-400">{day.closed ? "Closed" : "No free hours"}</div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {slots.map((slot) => {
                      const on = picked?.date === day.date && picked.slot.start === slot.start;
                      return (
                        <button
                          key={slot.start}
                          onClick={() => setPicked({ date: day.date, slot })}
                          className={`rounded-md px-2 py-1.5 text-left text-xs ${
                            on ? "bg-emerald-700 text-white" : "bg-slate-50 hover:bg-emerald-50"
                          }`}
                        >
                          {slot.start}–{slot.end}
                          <span className={`ml-1 ${on ? "text-emerald-100" : "text-slate-400"}`}>{slot.price} kr</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {picked && (
          <div className="card max-w-xl space-y-3 p-5">
            <div className="font-semibold">
              {formatDateShort(picked.date)} · {picked.slot.start}–{picked.slot.end} · {areaMeta?.name} · {picked.slot.price} DKK
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="label">Name</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="label">Email</label>
                <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <label className="label">Activity</label>
                <input className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Birthday, badminton…" />
              </div>
            </div>
            {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <button className="btn-primary" disabled={saving || !name || !email} onClick={submit}>
              {saving ? "Reserving…" : "Reserve and go to payment"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
