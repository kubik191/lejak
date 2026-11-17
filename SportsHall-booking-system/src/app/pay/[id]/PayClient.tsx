"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDateLong, formatDateTime } from "@/lib/time";

interface PublicBooking {
  id: string;
  ref: string;
  date: string;
  start: string;
  end: string;
  areaName: string;
  title: string;
  customerName: string;
  amount: number;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  holdExpiresAt: string | null;
  hall: { name: string; address: string; bank: { regNo: string; accountNo: string; accountName: string } };
}

type Step = "choose" | "mp-phone" | "mp-approve" | "mp-processing";

const MP_BLUE = "#5a78ff";

export default function PayClient({ id }: { id: string }) {
  const [booking, setBooking] = useState<PublicBooking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("choose");
  const [phone, setPhone] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/pay/${id}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) setError(json.error);
    else setBooking(json);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function pay(method: "mobilepay" | "bank") {
    const res = await fetch(`/api/pay/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method }),
    });
    const json = await res.json();
    if (!res.ok) setError(json.error);
    else setBooking(json);
  }

  async function approveMobilePay() {
    setStep("mp-processing");
    await new Promise((r) => setTimeout(r, 1500));
    await pay("mobilepay");
    setStep("choose");
  }

  if (error && !booking) {
    return <Shell><div className="p-8 text-center text-slate-600">{error}</div></Shell>;
  }
  if (!booking) return <div className="text-center text-sm text-slate-500">Loading…</div>;

  const b = booking;
  const confirmed = b.status === "confirmed" && b.paymentStatus === "paid";
  const bankChosen = b.status === "awaiting_payment" && b.paymentMethod === "bank";

  return (
    <Shell hallName={b.hall.name}>
      <div className="border-b border-slate-100 px-6 py-5">
        <div className="text-xs uppercase tracking-wide text-slate-500">Booking {b.ref}</div>
        <div className="mt-1 text-lg font-semibold">{b.title}</div>
        <div className="mt-3 space-y-1 text-sm text-slate-700">
          <div>📅 {formatDateLong(b.date)}</div>
          <div>🕑 {b.start}–{b.end}</div>
          <div>🏟️ {b.areaName}</div>
          <div>📍 {b.hall.address}</div>
        </div>
        <div className="mt-4 flex items-baseline justify-between rounded-lg bg-slate-50 px-4 py-3">
          <span className="text-sm text-slate-600">Total</span>
          <span className="text-2xl font-semibold">{b.amount.toLocaleString("da-DK")} kr.</span>
        </div>
      </div>

      <div className="px-6 py-6">
        {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        {confirmed && (
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600">✓</div>
            <div className="text-lg font-semibold">Payment received – booking confirmed</div>
            <p className="mt-1 text-sm text-slate-600">
              Paid with {b.paymentMethod === "mobilepay" ? "MobilePay" : "bank transfer"}. A confirmation with the door code has been sent to your email.
            </p>
          </div>
        )}

        {b.status === "expired" && (
          <div className="text-center text-sm text-slate-600">This reservation expired because it was not paid in time. Please send a new booking request.</div>
        )}
        {b.status === "cancelled" && <div className="text-center text-sm text-slate-600">This booking has been cancelled.</div>}

        {b.status === "awaiting_payment" && step === "choose" && (
          <div className="space-y-4">
            {b.holdExpiresAt && (
              <p className="text-center text-xs text-slate-500">Your time is reserved until {formatDateTime(b.holdExpiresAt)}.</p>
            )}

            <button
              onClick={() => setStep("mp-phone")}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl py-3.5 text-base font-semibold text-white shadow-md transition hover:brightness-110"
              style={{ background: MP_BLUE }}
            >
              <MobilePayLogo /> Pay with MobilePay
            </button>

            {bankChosen ? (
              <BankDetails b={b} />
            ) : (
              <button onClick={() => pay("bank")} className="btn-secondary w-full py-3">
                🏦 I don’t have MobilePay – pay by bank transfer
              </button>
            )}
          </div>
        )}

        {b.status === "awaiting_payment" && step === "mp-phone" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 font-semibold" style={{ color: MP_BLUE }}>
              <MobilePayLogo color={MP_BLUE} /> MobilePay
            </div>
            <div>
              <label className="label">Your mobile number</label>
              <div className="flex">
                <span className="rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600">+45</span>
                <input
                  className="input rounded-l-none"
                  inputMode="numeric"
                  placeholder="12 34 56 78"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
            <button
              disabled={phone.replace(/\D/g, "").length < 8}
              onClick={() => setStep("mp-approve")}
              className="w-full cursor-pointer rounded-xl py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: MP_BLUE }}
            >
              Continue
            </button>
            <button className="w-full text-sm text-slate-500 hover:underline" onClick={() => setStep("choose")}>Back</button>
          </div>
        )}

        {b.status === "awaiting_payment" && (step === "mp-approve" || step === "mp-processing") && (
          <div className="flex flex-col items-center">
            <p className="mb-4 text-center text-sm text-slate-600">Open MobilePay on your phone and approve the payment.</p>
            <div className="w-60 rounded-[2.2rem] border-[6px] border-slate-900 bg-white p-3 shadow-xl">
              <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-slate-900" />
              <div className="rounded-2xl px-3 py-5 text-center text-white" style={{ background: MP_BLUE }}>
                <MobilePayLogo />
                <div className="mt-2 text-xs opacity-90">{b.hall.name}</div>
                <div className="mt-1 text-3xl font-bold">{b.amount.toLocaleString("da-DK")} kr.</div>
                <div className="mt-1 text-[11px] opacity-80">{b.ref}</div>
              </div>
              <button
                disabled={step === "mp-processing"}
                onClick={approveMobilePay}
                className="mt-4 w-full cursor-pointer rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: MP_BLUE }}
              >
                {step === "mp-processing" ? "Processing…" : "Swipe to pay ›"}
              </button>
              <div className="mt-2 text-center text-[10px] text-slate-400">+45 {phone}</div>
            </div>
            <button className="mt-4 text-sm text-slate-500 hover:underline" onClick={() => setStep("choose")}>Cancel</button>
          </div>
        )}
      </div>
    </Shell>
  );
}

function BankDetails({ b }: { b: PublicBooking }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
      <div className="mb-2 font-semibold">Bank transfer details</div>
      <dl className="grid grid-cols-[130px_1fr] gap-y-1">
        <dt className="text-slate-500">Reg. no.</dt><dd className="font-mono">{b.hall.bank.regNo}</dd>
        <dt className="text-slate-500">Account no.</dt><dd className="font-mono">{b.hall.bank.accountNo}</dd>
        <dt className="text-slate-500">Recipient</dt><dd>{b.hall.bank.accountName}</dd>
        <dt className="text-slate-500">Amount</dt><dd className="font-semibold">{b.amount} DKK</dd>
        <dt className="text-slate-500">Reference</dt><dd className="font-mono font-semibold text-indigo-700">{b.ref}</dd>
      </dl>
      <p className="mt-3 text-xs text-slate-500">
        Please write the reference on the transfer. We have emailed you these details. Your booking is confirmed as soon as the money arrives.
      </p>
    </div>
  );
}

function Shell({ children, hallName }: { children: React.ReactNode; hallName?: string }) {
  return (
    <div className="mx-auto max-w-md">
      <div className="mb-4 rounded-lg bg-amber-100 px-3 py-2 text-center text-xs text-amber-800">
        Prototype – no real payment is made.
      </div>
      <div className="mb-4 text-center">
        <div className="text-sm text-slate-500">Payment for</div>
        <div className="text-lg font-semibold">{hallName ?? "Sports hall booking"}</div>
      </div>
      <div className="card overflow-hidden">{children}</div>
      <div className="mt-4 text-center text-xs text-slate-400">Secure payment · powered by HallBook</div>
    </div>
  );
}

function MobilePayLogo({ color = "white" }: { color?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="2" width="14" height="20" rx="3" stroke={color} strokeWidth="2" />
      <circle cx="12" cy="18" r="1.2" fill={color} />
    </svg>
  );
}
