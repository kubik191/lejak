"use client";

import { useState } from "react";
import type { AreaId, Booking, Hall } from "@/lib/types";
import { toMinutes } from "@/lib/time";
import { api } from "./useAppState";

export interface BookingDraft {
  date: string;
  start: string;
  end: string;
  area: AreaId;
}

interface Props {
  hall: Hall;
  booking?: Booking;
  draft?: BookingDraft;
  onClose: () => void;
  onSaved: (message?: string) => void;
}

function calcPrice(hall: Hall, area: AreaId, start: string, end: string) {
  const a = hall.areas.find((x) => x.id === area);
  const hours = Math.max(0, (toMinutes(end) - toMinutes(start)) / 60);
  return Math.round((a?.pricePerHour ?? 0) * hours);
}

export default function BookingModal({ hall, booking, draft, onClose, onSaved }: Props) {
  const isEdit = Boolean(booking);
  const [form, setForm] = useState(() => ({
    title: booking?.title ?? "",
    date: booking?.date ?? draft!.date,
    start: booking?.start ?? draft!.start,
    end: booking?.end ?? draft!.end,
    area: (booking?.area ?? draft!.area) as AreaId,
    customerName: booking?.customerName ?? "",
    customerEmail: booking?.customerEmail ?? "",
    phone: booking?.phone ?? "",
    status: booking?.status ?? "confirmed",
    amount: booking?.amount ?? 0,
    paymentStatus: booking?.paymentStatus ?? "none",
    paymentMethod: booking?.paymentMethod ?? null,
    notes: booking?.notes ?? "",
  }));
  const [repeat, setRepeat] = useState(false);
  const [repeatUntil, setRepeatUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await api(`/api/bookings/${booking!.id}`, { method: "PATCH", body: form });
        onSaved("Booking updated.");
      } else {
        const res = await api<{ created: Booking[]; skipped: { date: string; reason: string }[] }>("/api/bookings", {
          method: "POST",
          body: { ...form, repeatWeeklyUntil: repeat ? repeatUntil : null },
        });
        const skipped = res.skipped.length ? ` Skipped ${res.skipped.length}: ${res.skipped.map((s) => `${s.date} (${s.reason})`).join("; ")}` : "";
        onSaved(`Created ${res.created.length} booking${res.created.length === 1 ? "" : "s"}.${skipped}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(series: boolean) {
    const msg = series ? "Delete this and all following bookings in this series?" : "Delete this booking?";
    if (!confirm(msg)) return;
    await api(`/api/bookings/${booking!.id}${series ? "?series=1" : ""}`, { method: "DELETE" });
    onSaved(series ? "Series deleted." : "Booking deleted.");
  }

  async function markPaid() {
    await api(`/api/bookings/${booking!.id}`, { method: "PATCH", body: { markPaid: true } });
    onSaved("Marked as paid – confirmation sent to the customer.");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={onClose}>
      <div className="card max-h-[92vh] w-full max-w-2xl overflow-y-auto p-6" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{isEdit ? "Edit booking" : "New booking"}</h2>
            {booking && (
              <p className="text-xs text-slate-500">
                {booking.ref} · created {booking.source === "email" ? "by AI from email" : booking.source === "import" ? "by schedule import" : booking.source === "web" ? "from the public booking page" : "manually"}
                {booking.seriesId ? " · part of a weekly series" : ""}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-xl leading-none text-slate-400 hover:text-slate-700">×</button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Title / activity</label>
            <input className="input" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Badminton club, Birthday party" />
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={form.date} onChange={(e) => set("date", e.target.value)} />
          </div>
          <div>
            <label className="label">Area</label>
            <select className="input" value={form.area} onChange={(e) => set("area", e.target.value as AreaId)}>
              {hall.areas.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Start</label>
            <input type="time" step={900} className="input" value={form.start} onChange={(e) => set("start", e.target.value)} />
          </div>
          <div>
            <label className="label">End</label>
            <input type="time" step={900} className="input" value={form.end} onChange={(e) => set("end", e.target.value)} />
          </div>

          <div>
            <label className="label">Customer / club</label>
            <input className="input" value={form.customerName} onChange={(e) => set("customerName", e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" value={form.customerEmail} onChange={(e) => set("customerEmail", e.target.value)} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={(e) => set("status", e.target.value as Booking["status"])}>
              <option value="confirmed">Confirmed</option>
              <option value="awaiting_payment">Reserved – awaiting payment</option>
              <option value="blocked">Blocked (school use, maintenance…)</option>
              <option value="cancelled">Cancelled</option>
              {form.status === "expired" && <option value="expired">Expired (not paid)</option>}
            </select>
          </div>

          <div>
            <label className="label flex justify-between">
              <span>Amount (DKK)</span>
              <button type="button" className="text-indigo-600 hover:underline" onClick={() => set("amount", calcPrice(hall, form.area, form.start, form.end))}>
                use price list
              </button>
            </label>
            <input type="number" className="input" value={form.amount} onChange={(e) => set("amount", Number(e.target.value))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Payment</label>
              <select className="input" value={form.paymentStatus} onChange={(e) => set("paymentStatus", e.target.value as Booking["paymentStatus"])}>
                <option value="none">Not needed</option>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            <div>
              <label className="label">Method</label>
              <select className="input" value={form.paymentMethod ?? ""} onChange={(e) => set("paymentMethod", (e.target.value || null) as Booking["paymentMethod"])}>
                <option value="">–</option>
                <option value="mobilepay">MobilePay</option>
                <option value="bank">Bank transfer</option>
                <option value="invoice">Invoice / season</option>
              </select>
            </div>
          </div>

          <div className="col-span-2">
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>

          {!isEdit && (
            <div className="col-span-2 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-indigo-900">
                <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
                Repeat every week (for importing the paper schedule / season bookings)
              </label>
              {repeat && (
                <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                  until
                  <input type="date" className="input max-w-44" value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} />
                  <span className="text-xs text-slate-500">Dates that clash with existing bookings are skipped.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {error && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            {isEdit && <button className="btn-danger" onClick={() => remove(false)}>Delete</button>}
            {isEdit && booking?.seriesId && (
              <button className="btn-danger" onClick={() => remove(true)}>Delete this + following</button>
            )}
          </div>
          <div className="flex gap-2">
            {isEdit && booking?.status === "awaiting_payment" && (
              <button className="btn-secondary" onClick={markPaid}>Mark as paid</button>
            )}
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={saving || (repeat && !repeatUntil)}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create booking"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
