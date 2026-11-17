import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#071510] text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-sm font-bold text-emerald-950">H</div>
          <div>
            <div className="text-base font-semibold leading-tight">HallBook</div>
            <div className="text-[11px] text-emerald-200/70">Prototype for sports hall managers</div>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/book" className="rounded-lg px-3 py-2 text-sm text-emerald-100 hover:bg-white/10">
            Public booking page
          </Link>
          <Link href="/calendar" className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-300">
            Open dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-10">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Interactive prototype</p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          The sports hall that only has an email address — now has a booking system.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-emerald-50/75">
          Built for Danish school halls and clubs that still book by email. A customer writes to the hall.
          The assistant reads the mail, checks the calendar, holds the time, and sends a MobilePay or bank-transfer link.
          The manager can still edit everything by hand.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/calendar" className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-emerald-950 hover:bg-emerald-300">
            Show the manager dashboard
          </Link>
          <Link href="/inbox" className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10">
            Try the email demo
          </Link>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          <Feature title="Paper schedule, imported" text="Recurring club times and school PE are already in the calendar — the same work a manager would do once when they move off paper." />
          <Feature title="Email in, booking out" text="Paste a Danish or English customer email. The assistant books automatically, answers hall questions, and forwards discounts or season deals." />
          <Feature title="Pay on reservation" text="MobilePay (simulated here, Stripe in production) or bank transfer with a unique HAL-reference. Unpaid holds expire and the slot is freed." />
        </div>

        <section className="mt-16 rounded-2xl border border-white/10 bg-white/5 p-6 sm:p-8">
          <h2 className="text-xl font-semibold">5-minute demo script</h2>
          <ol className="mt-5 space-y-3 text-sm leading-relaxed text-emerald-50/85">
            <li><span className="font-semibold text-white">1. Calendar.</span> Open the dashboard. The week is already filled with school hours and club training — as if the paper plan had been typed in.</li>
            <li><span className="font-semibold text-white">2. Inbox.</span> Click “New customer email”, pick “Booking request”, send. Watch the assistant reserve Saturday and reply with a payment link.</li>
            <li><span className="font-semibold text-white">3. Pay.</span> Open the link. Pay with the simulated MobilePay. The booking turns green on the calendar.</li>
            <li><span className="font-semibold text-white">4. Questions.</span> Send “Question about the hall”. It answers from the hall’s own knowledge base (changing rooms, parking, cake rules).</li>
            <li><span className="font-semibold text-white">5. Edge case.</span> Send “Needs the manager”. Season deals and discounts are not auto-booked — they go to Lars.</li>
          </ol>
          <p className="mt-5 text-xs text-emerald-200/60">
            This prototype runs locally. Emails are simulated (no Postmark). MobilePay is simulated (no money moves). Add a real OpenAI key later for smarter replies — a built-in demo assistant is used until then.
          </p>
        </section>
      </main>
    </div>
  );
}

function Feature({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <h3 className="font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-emerald-50/70">{text}</p>
    </div>
  );
}
