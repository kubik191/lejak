"use client";

import { useMemo, useState } from "react";
import { api, refreshAppState, useAppState } from "@/components/useAppState";
import { addDays, formatDateTime, parseISODate, startOfWeek, toISODate } from "@/lib/time";
import type { EmailMessage, Thread } from "@/lib/types";

interface Sample {
  label: string;
  name: string;
  email: string;
  subject: string;
  body: string;
}

function daDate(date: string) {
  return parseISODate(date).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long" });
}
function enDate(date: string) {
  return parseISODate(date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function buildSamples(): Sample[] {
  const monday = startOfWeek(toISODate(new Date()));
  const sat2 = addDays(monday, 19);
  const sun2 = addDays(monday, 20);
  const tueNext = addDays(monday, 8);
  return [
    {
      label: "🇩🇰 Booking request",
      name: "Mette Jensen",
      email: "mette.jensen@gmail.com",
      subject: "Leje af hallen til fødselsdag",
      body: `Hej!\n\nJeg vil gerne leje hele hallen ${daDate(sat2)} fra kl. 14 til 16 til min søns 9-års fødselsdag. Vi er ca. 20 børn og 4 voksne.\n\nMå vi have kage med?\n\nMvh\nMette Jensen\nTlf. 22 44 66 88`,
    },
    {
      label: "🇬🇧 Half hall, badminton",
      name: "Tom Becker",
      email: "tom.becker@outlook.com",
      subject: "Badminton on Sunday",
      body: `Hi,\n\nCould we book half of the hall for badminton on ${enDate(sun2)} from 10:00 to 12:00? We are 6 people.\n\nThanks,\nTom`,
    },
    {
      label: "⚠️ Time already taken",
      name: "Jonas Holm",
      email: "jonas.holm@hotmail.dk",
      subject: "Fodbold tirsdag",
      body: `Hej\n\nKan vi låne hele hallen ${daDate(tueNext)} kl. 17-19 til indendørs fodbold med kollegerne?\n\nHilsen Jonas`,
    },
    {
      label: "❓ Question about the hall",
      name: "Sarah Nielsen",
      email: "sarah.n@gmail.com",
      subject: "Questions about the hall",
      body: "Hello,\n\nWe are thinking about renting the hall for a floorball tournament. Do you have changing rooms with showers? Is there parking nearby, and do you have floorball goals we can use?\n\nBest,\nSarah",
    },
    {
      label: "📅 When is it free?",
      name: "Peter Larsen",
      email: "peter.larsen@mail.dk",
      subject: "Ledige tider",
      body: `Hej\n\nHvornår er hallen ledig ${daDate(sun2)}? Vi er en lille volleyballgruppe der skal bruge en halv hal.\n\nMvh Peter`,
    },
    {
      label: "👤 Needs the manager",
      name: "Anna Kristensen",
      email: "anna@techfirm.dk",
      subject: "Fast booking hele sæsonen",
      body: "Hej\n\nVi er en virksomhed med 40 ansatte, og vi vil gerne leje hallen hver fredag aften resten af sæsonen. Kan vi få en rabat, hvis vi booker så meget?\n\nVenlig hilsen\nAnna Kristensen, HR",
    },
  ];
}

function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="break-all font-medium text-indigo-600 underline">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

const INTENT_LABEL: Record<string, string> = {
  booking_request: "Booking request",
  availability_question: "Availability question",
  info_question: "Question about the hall",
  cancellation: "Cancellation / change",
  payment_question: "Payment question",
  other: "Other",
};

export default function InboxPage() {
  const { state } = useAppState();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const samples = useMemo(() => buildSamples(), []);

  if (!state) return <div className="p-8 text-slate-500">Loading…</div>;

  const threads = [...state.threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const selected = threads.find((t) => t.id === selectedId) ?? null;
  const showCompose = composing || (!selected && threads.length === 0);

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">Email inbox</h1>
          <p className="text-sm text-slate-500">
            Simulated inbox for <span className="font-medium text-slate-700">{state.hall.bookingEmail}</span>. Write as a customer – the AI reads, books and answers automatically.
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setComposing(true); setSelectedId(null); }}>
          ✉️ New customer email
        </button>
      </div>

      {state.ai.provider === "demo" && (
        <div className="border-b border-emerald-200 bg-emerald-50 px-6 py-2 text-sm text-emerald-800">
          Running the built-in demo assistant (no OpenAI key needed). Sample emails work offline. Add a real <code className="font-mono">OPENAI_API_KEY</code> later for smarter replies.
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="w-80 shrink-0 overflow-y-auto border-r border-slate-200 bg-white">
          {threads.length === 0 && <div className="p-6 text-sm text-slate-500">No emails yet. Send one to start the demo.</div>}
          {threads.map((t) => {
            const last = t.messages[t.messages.length - 1];
            const booked = state.bookings.find((b) => b.threadId === t.id && ["awaiting_payment", "confirmed"].includes(b.status));
            return (
              <button
                key={t.id}
                onClick={() => { setSelectedId(t.id); setComposing(false); }}
                className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ${selected?.id === t.id ? "bg-indigo-50" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{t.customerName || t.customerEmail}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">{formatDateTime(t.updatedAt)}</span>
                </div>
                <div className="truncate text-sm text-slate-700">{t.subject}</div>
                <div className="truncate text-xs text-slate-500">{last?.body.split("\n")[0]}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {t.needsAttention && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Needs manager</span>}
                  {booked && (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${booked.status === "confirmed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {booked.ref} · {booked.status === "confirmed" ? "Paid" : "Awaiting payment"}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto">
          {showCompose ? (
            <Compose
              samples={samples}
              onSent={(t) => { setComposing(false); setSelectedId(t.id); }}
            />
          ) : selected ? (
            <ThreadView key={selected.id} thread={selected} />
          ) : (
            <div className="p-10 text-sm text-slate-500">Select a conversation or write a new email.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Compose({ samples, onSent }: { samples: Sample[]; onSent: (t: Thread) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await api<{ thread: Thread }>("/api/email", {
        method: "POST",
        body: { fromName: name, fromEmail: email, subject: subject || "(no subject)", body },
      });
      refreshAppState();
      onSent(res.thread);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      refreshAppState();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Example emails</div>
        <div className="flex flex-wrap gap-2">
          {samples.map((s) => (
            <button
              key={s.label}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-indigo-400 hover:text-indigo-700"
              onClick={() => { setName(s.name); setEmail(s.email); setSubject(s.subject); setBody(s.body); }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card space-y-3 p-5">
        <div className="text-sm font-semibold text-slate-700">New email from a customer</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Email address</label>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" />
          </div>
        </div>
        <div>
          <label className="label">Subject</label>
          <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <label className="label">Message</label>
          <textarea className="input font-[inherit]" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="flex justify-end">
          <button className="btn-primary" disabled={sending || !email || !body} onClick={send}>
            {sending ? "AI is reading and answering…" : "Send email"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ThreadView({ thread }: { thread: Thread }) {
  const [mode, setMode] = useState<"customer" | "manager">("customer");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "customer") {
        const subject = thread.subject.toLowerCase().startsWith("re:") ? thread.subject : `Re: ${thread.subject}`;
        await api("/api/email", {
          method: "POST",
          body: { threadId: thread.id, fromName: thread.customerName, fromEmail: thread.customerEmail, subject, body: text },
        });
      } else {
        await api(`/api/threads/${thread.id}`, { method: "POST", body: { body: text } });
      }
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      refreshAppState();
    }
  }

  async function markHandled() {
    await api(`/api/threads/${thread.id}`, { method: "PATCH" });
    refreshAppState();
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{thread.subject}</h2>
        <div className="text-sm text-slate-500">
          {thread.customerName} &lt;{thread.customerEmail}&gt;
        </div>
      </div>

      {thread.needsAttention && (
        <div className="mb-4 flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <div>
            <div className="font-semibold">Forwarded to the manager</div>
            <div>{thread.attentionReason}</div>
          </div>
          <button className="btn-secondary shrink-0" onClick={markHandled}>Mark as handled</button>
        </div>
      )}

      <div className="space-y-4">
        {thread.messages.map((m) => (
          <Message key={m.id} m={m} />
        ))}
      </div>

      <div className="card mt-6 p-4">
        <div className="mb-2 flex gap-1 text-xs font-medium">
          <button
            className={`rounded-md px-3 py-1.5 ${mode === "customer" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            onClick={() => setMode("customer")}
          >
            Reply as customer (simulate)
          </button>
          <button
            className={`rounded-md px-3 py-1.5 ${mode === "manager" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            onClick={() => setMode("manager")}
          >
            Answer as manager
          </button>
        </div>
        <textarea
          className="input"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={mode === "customer" ? "e.g. “Great, we'll take the first alternative” or “Vi må desværre aflyse”" : "Write a personal reply to the customer…"}
        />
        {error && <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="mt-2 flex justify-end">
          <button className="btn-primary" disabled={busy || !text.trim()} onClick={send}>
            {busy ? (mode === "customer" ? "AI is reading and answering…" : "Sending…") : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Message({ m }: { m: EmailMessage }) {
  const inbound = m.direction === "in";
  const senderLabel = inbound ? m.from : m.sender === "ai" ? "🤖 AI booking assistant" : m.sender === "manager" ? "👤 Hall manager" : "⚡ Automatic email";
  return (
    <div className={`flex flex-col ${inbound ? "items-start" : "items-end"}`}>
      <div className={`w-[88%] rounded-xl border px-4 py-3 shadow-sm ${inbound ? "border-slate-200 bg-white" : "border-indigo-100 bg-indigo-50"}`}>
        <div className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-500">
          <span className="font-medium text-slate-700">{senderLabel}</span>
          <span>{formatDateTime(m.at)}</span>
        </div>
        <div className="mb-1 text-xs text-slate-500">Subject: {m.subject}</div>
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
          <Linkified text={m.body} />
        </div>
      </div>
      {m.ai && (
        <div className="mt-2 w-[88%] rounded-lg border border-dashed border-indigo-200 bg-white px-4 py-3 text-xs">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-semibold text-indigo-700">AI analysis</span>
            <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-medium text-indigo-700">{INTENT_LABEL[m.ai.intent] ?? m.ai.intent}</span>
            {m.ai.escalated && <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700">Sent to manager</span>}
          </div>
          <div className="mb-2 text-slate-600">{m.ai.summary}</div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {Object.entries(m.ai.extracted)
              .filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0))
              .map(([k, v]) => (
                <span key={k} className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                  <span className="text-slate-400">{k.replace(/_/g, " ")}:</span> {Array.isArray(v) ? v.join(", ") : String(v)}
                </span>
              ))}
          </div>
          <ul className="space-y-0.5">
            {m.ai.actions.map((a, i) => (
              <li key={i} className="text-slate-700">✓ {a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
