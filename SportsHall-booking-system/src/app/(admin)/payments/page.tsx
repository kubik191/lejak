"use client";

import { useState } from "react";
import Link from "next/link";
import { api, refreshAppState, useAppState } from "@/components/useAppState";
import { formatDateShort, formatDateTime } from "@/lib/time";
import type { Booking } from "@/lib/types";

export default function PaymentsPage() {
  const { state } = useAppState();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!state) return <div className="p-8 text-slate-500">Loading…</div>;

  const areaName = (b: Booking) => state.hall.areas.find((a) => a.id === b.area)?.name ?? b.area;
  const awaiting = state.bookings
    .filter((b) => b.status === "awaiting_payment")
    .sort((a, b) => (a.holdExpiresAt ?? "").localeCompare(b.holdExpiresAt ?? ""));
  const paid = state.bookings
    .filter((b) => b.paymentStatus === "paid")
    .sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""));
  const expired = state.bookings.filter((b) => b.status === "expired");

  const sum = (list: Booking[]) => list.reduce((s, b) => s + b.amount, 0).toLocaleString("da-DK");

  async function act(b: Booking, action: "paid" | "cancel") {
    setBusyId(b.id);
    try {
      if (action === "paid") await api(`/api/bookings/${b.id}`, { method: "PATCH", body: { markPaid: true } });
      else await api(`/api/bookings/${b.id}`, { method: "PATCH", body: { status: "cancelled" } });
      refreshAppState();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Payments</h1>
        <p className="text-sm text-slate-500">
          MobilePay payments confirm bookings automatically. Bank transfers are matched by their reference (e.g. HAL-1042) – click “Mark as paid” when the money arrives.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card px-4 py-3">
          <div className="text-xs text-slate-500">Awaiting payment</div>
          <div className="text-2xl font-semibold text-amber-600">{sum(awaiting)} DKK</div>
        </div>
        <div className="card px-4 py-3">
          <div className="text-xs text-slate-500">Received</div>
          <div className="text-2xl font-semibold text-emerald-600">{sum(paid)} DKK</div>
        </div>
        <div className="card px-4 py-3">
          <div className="text-xs text-slate-500">Expired reservations (released)</div>
          <div className="text-2xl font-semibold text-slate-700">{expired.length}</div>
        </div>
      </div>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 font-semibold">Awaiting payment</div>
        {awaiting.length === 0 ? (
          <div className="px-5 py-6 text-sm text-slate-500">Nothing outstanding.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-5 py-2 font-medium">Reference</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Booking</th>
                <th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Payment choice</th>
                <th className="px-3 py-2 font-medium">Held until</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody>
              {awaiting.map((b) => (
                <tr key={b.id} className="border-t border-slate-100">
                  <td className="px-5 py-3 font-mono text-xs font-semibold">{b.ref}</td>
                  <td className="px-3 py-3">
                    <div className="font-medium">{b.customerName || "–"}</div>
                    <div className="text-xs text-slate-500">{b.customerEmail}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div>{formatDateShort(b.date)} · {b.start}–{b.end}</div>
                    <div className="text-xs text-slate-500">{areaName(b)}{b.source === "email" ? " · booked by AI" : ""}</div>
                  </td>
                  <td className="px-3 py-3 font-medium">{b.amount} DKK</td>
                  <td className="px-3 py-3">
                    {b.paymentMethod === "bank" ? (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">🏦 Bank transfer</span>
                    ) : (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Link sent – not chosen yet</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-600">{b.holdExpiresAt ? formatDateTime(b.holdExpiresAt) : "–"}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-2">
                      <Link href={`/pay/${b.id}`} target="_blank" className="btn-secondary px-2.5 py-1 text-xs">Payment page</Link>
                      <button className="btn-secondary px-2.5 py-1 text-xs" disabled={busyId === b.id} onClick={() => act(b, "cancel")}>Cancel</button>
                      <button className="btn-primary px-2.5 py-1 text-xs" disabled={busyId === b.id} onClick={() => act(b, "paid")}>Mark as paid</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 font-semibold">Received payments</div>
        {paid.length === 0 ? (
          <div className="px-5 py-6 text-sm text-slate-500">No payments yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-5 py-2 font-medium">Reference</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Booking</th>
                <th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Method</th>
                <th className="px-5 py-2 font-medium">Paid</th>
              </tr>
            </thead>
            <tbody>
              {paid.map((b) => (
                <tr key={b.id} className="border-t border-slate-100">
                  <td className="px-5 py-3 font-mono text-xs font-semibold">{b.ref}</td>
                  <td className="px-3 py-3">{b.customerName || b.customerEmail}</td>
                  <td className="px-3 py-3">{formatDateShort(b.date)} · {b.start}–{b.end} · {areaName(b)}</td>
                  <td className="px-3 py-3 font-medium">{b.amount} DKK</td>
                  <td className="px-3 py-3">
                    {b.paymentMethod === "mobilepay" ? (
                      <span className="rounded bg-[#5a78ff]/10 px-2 py-0.5 text-xs font-medium text-[#3b5bff]">MobilePay</span>
                    ) : (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">Bank transfer</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-600">{b.paidAt ? formatDateTime(b.paidAt) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
