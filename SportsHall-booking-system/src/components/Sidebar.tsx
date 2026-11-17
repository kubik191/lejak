"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { api, refreshAppState, useAppState } from "./useAppState";

const NAV = [
  { href: "/calendar", label: "Calendar", icon: "📅" },
  { href: "/inbox", label: "Email inbox", icon: "✉️" },
  { href: "/payments", label: "Payments", icon: "💳" },
  { href: "/settings", label: "Hall & AI settings", icon: "⚙️" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { state } = useAppState();
  const [resetting, setResetting] = useState(false);

  const attention = state?.threads.filter((t) => t.needsAttention).length ?? 0;
  const awaiting = state?.bookings.filter((b) => b.status === "awaiting_payment").length ?? 0;

  async function reset() {
    if (!confirm("Reset all demo data? Bookings and emails created during the demo will be removed.")) return;
    setResetting(true);
    await api("/api/reset", { method: "POST" });
    setResetting(false);
    refreshAppState();
  }

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-5">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-700 text-sm font-bold text-white">H</div>
          <div>
            <div className="text-base font-semibold leading-tight">HallBook</div>
            <div className="text-[11px] text-slate-500">AI booking assistant</div>
          </div>
        </Link>
        <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <div className="font-medium text-slate-800">{state?.hall.name ?? "…"}</div>
          <div className="truncate">{state?.hall.bookingEmail}</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const badge = item.href === "/inbox" ? attention : item.href === "/payments" ? awaiting : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span>{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {badge > 0 && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    item.href === "/inbox" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-slate-100 px-5 py-4 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${state?.ai.configured ? "bg-emerald-500" : "bg-red-500"}`} />
          {state?.ai.provider === "openai" ? `OpenAI (${state.ai.model})` : "Demo assistant (offline)"}
        </div>
        <Link href="/book" className="block text-slate-600 underline hover:text-slate-800">
          Public booking page
        </Link>
        <div className="rounded-md bg-amber-50 px-2 py-1.5 text-amber-800">Prototype – emails and payments are simulated.</div>
        <button onClick={reset} disabled={resetting} className="text-slate-500 underline hover:text-slate-800">
          {resetting ? "Resetting…" : "Reset demo data"}
        </button>
      </div>
    </aside>
  );
}
