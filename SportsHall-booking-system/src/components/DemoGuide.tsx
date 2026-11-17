"use client";

import { useState } from "react";
import Link from "next/link";

export default function DemoGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed bottom-4 right-4 z-40">
      {open && (
        <div className="mb-2 w-80 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-xl">
          <div className="mb-2 font-semibold">How to demo this</div>
          <ol className="list-decimal space-y-1.5 pl-4 text-slate-600">
            <li>Calendar already has the paper schedule.</li>
            <li>
              <Link href="/inbox" className="text-emerald-700 underline">Inbox</Link> → New email → “Booking request”.
            </li>
            <li>Open the payment link in the reply. Pay with MobilePay.</li>
            <li>Send “Question about the hall”, then “Needs the manager”.</li>
            <li>
              Optional: the <Link href="/book" className="text-emerald-700 underline">public booking page</Link>.
            </li>
          </ol>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-emerald-800"
      >
        {open ? "Close guide" : "Demo guide"}
      </button>
    </div>
  );
}
