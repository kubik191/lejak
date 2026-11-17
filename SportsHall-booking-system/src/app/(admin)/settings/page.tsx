"use client";

import { useState } from "react";
import { api, refreshAppState, useAppState, type AppState } from "@/components/useAppState";
import type { Hall } from "@/lib/types";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function SettingsPage() {
  const { state } = useAppState();
  if (!state) return <div className="p-8 text-slate-500">Loading…</div>;
  return <SettingsForm state={state} />;
}

function SettingsForm({ state }: { state: AppState }) {
  const [hall, setHall] = useState<Hall>(state.hall);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof Hall>(key: K, value: Hall[K]) => {
    setHall((h) => ({ ...h, [key]: value }));
    setSaved(false);
  };

  async function save() {
    setSaving(true);
    await api("/api/hall", { method: "PUT", body: hall });
    setSaving(false);
    setSaved(true);
    refreshAppState();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 pb-24">
      <div>
        <h1 className="text-2xl font-semibold">Hall & AI settings</h1>
        <p className="text-sm text-slate-500">Everything the AI assistant knows about the hall comes from this page.</p>
      </div>

      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">General</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Hall name" value={hall.name} onChange={(v) => set("name", v)} />
          <Field label="Address" value={hall.address} onChange={(v) => set("address", v)} />
          <Field label="Hall manager" value={hall.managerName} onChange={(v) => set("managerName", v)} />
          <Field label="Booking email address" value={hall.bookingEmail} onChange={(v) => set("bookingEmail", v)} />
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">Areas & prices</h2>
        <div className="space-y-2">
          {hall.areas.map((a, i) => (
            <div key={a.id} className="grid grid-cols-[1fr_160px] gap-3">
              <input
                className="input"
                value={a.name}
                onChange={(e) => set("areas", hall.areas.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  className="input"
                  value={a.pricePerHour}
                  onChange={(e) => set("areas", hall.areas.map((x, j) => (j === i ? { ...x, pricePerHour: Number(e.target.value) } : x)))}
                />
                <span className="shrink-0 text-xs text-slate-500">DKK/h</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Opening hours</h2>
        {ORDER.map((d) => {
          const oh = hall.openingHours[d];
          const update = (v: Hall["openingHours"][number]) => set("openingHours", hall.openingHours.map((x, j) => (j === d ? v : x)));
          return (
            <div key={d} className="flex items-center gap-3 text-sm">
              <div className="w-28 font-medium">{DAYS[d]}</div>
              <label className="flex items-center gap-1.5 text-slate-600">
                <input type="checkbox" checked={!oh} onChange={(e) => update(e.target.checked ? null : { open: "08:00", close: "20:00" })} />
                Closed
              </label>
              {oh && (
                <>
                  <input type="time" className="input max-w-32" value={oh.open} onChange={(e) => update({ ...oh, open: e.target.value })} />
                  <span>–</span>
                  <input type="time" className="input max-w-32" value={oh.close} onChange={(e) => update({ ...oh, close: e.target.value })} />
                </>
              )}
            </div>
          );
        })}
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">Payment</h2>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Bank reg. no." value={hall.bank.regNo} onChange={(v) => set("bank", { ...hall.bank, regNo: v })} />
          <Field label="Account no." value={hall.bank.accountNo} onChange={(v) => set("bank", { ...hall.bank, accountNo: v })} />
          <Field label="Account name" value={hall.bank.accountName} onChange={(v) => set("bank", { ...hall.bank, accountName: v })} />
          <NumberField label="Hold unpaid reservations (hours)" value={hall.holdHours} onChange={(v) => set("holdHours", v)} />
          <NumberField label="Hold with bank transfer (hours)" value={hall.bankTransferHoldHours} onChange={(v) => set("bankTransferHoldHours", v)} />
          <NumberField label="Longer bookings go to manager (hours)" value={hall.maxAutoBookingHours} onChange={(v) => set("maxAutoBookingHours", v)} />
        </div>
        <p className="text-xs text-slate-500">
          MobilePay: in production this connects through Stripe (MobilePay is a Stripe payment method in Denmark). In this prototype the MobilePay step is simulated.
        </p>
      </section>

      <section className="card space-y-3 p-5">
        <div>
          <h2 className="font-semibold">AI knowledge base</h2>
          <p className="text-sm text-slate-500">
            Facilities, rules, parking, cancellation policy… The AI answers customer questions only from this text. If something is not here, it passes the question to the manager.
          </p>
        </div>
        <textarea className="input font-mono text-xs leading-relaxed" rows={28} value={hall.knowledgeBase} onChange={(e) => set("knowledgeBase", e.target.value)} />
      </section>

      <div className="fixed bottom-0 left-60 right-0 z-10 border-t border-slate-200 bg-white/90 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-end gap-3">
          {saved && <span className="text-sm text-emerald-600">Saved ✓</span>}
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type="number" className="input" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
