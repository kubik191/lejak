import { randomUUID } from "crypto";
import { mutate, readDb } from "./db";
import { analyzeEmail, composeReply, type EmailAnalysis } from "./ai";
import {
  ACTIVE_STATUSES,
  areaName,
  expireHolds,
  findAlternatives,
  findConflicts,
  freeIntervals,
  newBooking,
  priceFor,
  withinOpeningHours,
} from "./booking";
import type { AiTrace, AreaId, Booking, Db, EmailMessage, Thread } from "./types";
import { addDays, formatDateLong, formatDateTime, isValidDate, isValidTime, toISODate, toMinutes, weekday, weekdayName } from "./time";

export interface IncomingEmail {
  threadId?: string;
  fromEmail: string;
  fromName?: string;
  subject: string;
  body: string;
}

function historyText(thread: Thread, excludeId?: string): string {
  return thread.messages
    .filter((m) => m.id !== excludeId)
    .map((m) => `[${m.direction === "in" ? "Customer" : "Hall"} – ${m.at.slice(0, 16).replace("T", " ")}]\n${m.body}`)
    .join("\n\n---\n\n");
}

function hallSummary(db: Db): string {
  const h = db.hall;
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const hours = h.openingHours.map((d, i) => `${days[i]} ${d ? `${d.open}-${d.close}` : "closed"}`).join(", ");
  const areas = h.areas.map((a) => `${a.id} = ${a.name} (${a.pricePerHour} DKK/hour)`).join("; ");
  return `${h.name}, ${h.address}\nAreas: ${areas}\nOpening hours: ${hours}`;
}

function slotLine(db: Db, s: { date: string; start: string; end: string; area: AreaId }) {
  return `${weekdayName(s.date)} ${s.date} ${s.start}-${s.end}, ${areaName(db.hall, s.area)}, price ${priceFor(db.hall, s.area, s.start, s.end)} DKK`;
}

function freeLine(db: Db, date: string, area: AreaId) {
  const free = freeIntervals(db, date, area);
  return `${weekdayName(date)} ${date}, ${areaName(db.hall, area)}: ${free.length ? free.map((f) => `${f.start}-${f.end}`).join(", ") : "fully booked / closed"}`;
}

interface Decision {
  facts: string[];
  actions: string[];
  escalate: boolean;
  escalationReason: string | null;
}

function decide(db: Db, a: EmailAnalysis, thread: Thread, fromEmail: string, origin: string): Decision {
  const d: Decision = { facts: [], actions: [], escalate: false, escalationReason: null };
  const today = toISODate(new Date());
  const escalate = (reason: string) => {
    d.escalate = true;
    d.escalationReason = reason;
    d.facts.push(`This request has been forwarded to the hall manager (${db.hall.managerName}). Reason: ${reason}. Do not confirm or promise anything about it.`);
    d.actions.push(`Forwarded to manager: ${reason}`);
  };

  if (a.needs_human) {
    escalate(a.human_reason || "needs a manager's decision");
    return d;
  }

  const area: AreaId = a.area ?? "full";

  switch (a.intent) {
    case "booking_request": {
      if (!isValidDate(a.date)) {
        d.facts.push("The customer did not give a usable date. Ask which date they want (and the time and whether they need the full hall or half).");
        d.actions.push("Asked customer for missing date");
        break;
      }
      if (a.date < today) {
        d.facts.push(`The requested date ${a.date} is in the past. Ask for a new date.`);
        d.actions.push("Rejected: date in the past");
        break;
      }
      if (!isValidTime(a.start) || !isValidTime(a.end) || toMinutes(a.end) <= toMinutes(a.start)) {
        d.facts.push(`The customer wants ${formatDateLong(a.date)} but the start and/or end time is missing. Ask for it.`);
        d.facts.push(`Free times that day: ${freeLine(db, a.date, area)}`);
        d.actions.push("Asked customer for missing time (sent free times)");
        break;
      }
      const req = { date: a.date, start: a.start, end: a.end, area };
      const hours = (toMinutes(a.end) - toMinutes(a.start)) / 60;
      if (hours > db.hall.maxAutoBookingHours) {
        escalate(`booking longer than ${db.hall.maxAutoBookingHours} hours (${hours} h)`);
        break;
      }
      if (!withinOpeningHours(db.hall, req)) {
        const oh = db.hall.openingHours[weekday(a.date)];
        d.facts.push(`The requested time ${a.start}-${a.end} on ${a.date} is outside opening hours (${oh ? `${oh.open}-${oh.close}` : "closed that day"}). Nothing was booked.`);
        d.facts.push(`Free times that day: ${freeLine(db, a.date, area)}`);
        d.actions.push("Rejected: outside opening hours (sent free times)");
        break;
      }

      const conflicts = findConflicts(db, req);
      const own = conflicts.find(
        (b) => b.customerEmail.toLowerCase() === fromEmail.toLowerCase() && b.date === req.date && b.start === req.start && b.end === req.end && b.area === req.area,
      );
      if (own) {
        d.facts.push(`This customer already holds this exact booking (${own.ref}, status ${own.status}). Do not create a new one.`);
        if (own.status === "awaiting_payment") d.facts.push(`Payment link: ${origin}/pay/${own.id}`);
        d.actions.push(`Duplicate request – referred to existing booking ${own.ref}`);
        break;
      }
      if (conflicts.length) {
        const alts = findAlternatives(db, req);
        d.facts.push(`The requested time (${slotLine(db, req)}) is NOT available – it is already booked. Nothing was booked.`);
        d.facts.push(alts.length ? `Suggest these free alternatives (the customer just has to reply to book one):\n${alts.map((s) => `- ${slotLine(db, s)}`).join("\n")}` : "No close alternatives were found. Suggest another week.");
        d.actions.push(`Slot taken – suggested ${alts.length} alternative(s)`);
        break;
      }

      const amount = priceFor(db.hall, area, req.start, req.end);
      const holdExpiresAt = new Date(Date.now() + db.hall.holdHours * 3600 * 1000).toISOString();
      const booking = newBooking(db, {
        ...req,
        title: a.purpose || "Booking",
        customerName: a.customer_name || thread.customerName || "",
        customerEmail: fromEmail,
        phone: a.phone || "",
        status: "awaiting_payment",
        source: "email",
        amount,
        paymentStatus: "unpaid",
        holdExpiresAt,
        threadId: thread.id,
        notes: a.participants ? `${a.participants} participants` : "",
      });
      d.facts.push(
        `A booking was created and the time is now RESERVED (held) for the customer:
- Reference: ${booking.ref}
- ${formatDateLong(booking.date)}, ${booking.start}-${booking.end}
- Area: ${areaName(db.hall, area)}
- Price: ${amount} DKK
The reservation is held until ${formatDateTime(holdExpiresAt)} and becomes confirmed when paid. They can pay with MobilePay or choose bank transfer here:
Payment link: ${origin}/pay/${booking.id}`,
      );
      d.actions.push(`Created booking ${booking.ref} (${booking.date} ${booking.start}-${booking.end}, ${areaName(db.hall, area)}) – awaiting payment ${amount} DKK`);
      break;
    }

    case "availability_question": {
      const dates = isValidDate(a.date) && a.date >= today ? [a.date] : Array.from({ length: 7 }, (_, i) => addDays(today, i + 1));
      const areas: AreaId[] = a.area ? [a.area] : ["full", "a", "b"];
      d.facts.push(`Free times (from the booking calendar):\n${dates.flatMap((dt) => areas.map((ar) => `- ${freeLine(db, dt, ar)}`)).join("\n")}`);
      d.facts.push("Nothing was booked. Tell them to reply with the date, time and area they want and it will be reserved.");
      d.actions.push(`Answered availability for ${dates.length === 1 ? dates[0] : "the next 7 days"}`);
      break;
    }

    case "cancellation": {
      const mine = db.bookings.filter(
        (b) => ACTIVE_STATUSES.includes(b.status) && b.customerEmail.toLowerCase() === fromEmail.toLowerCase() && b.date >= today,
      );
      let target: Booking | undefined;
      if (a.booking_reference) {
        const byRef = db.bookings.find((b) => b.ref.toLowerCase() === a.booking_reference!.toLowerCase());
        if (byRef && byRef.customerEmail.toLowerCase() !== fromEmail.toLowerCase()) {
          escalate(`cancellation of ${byRef.ref} requested from a different email address than the booking`);
          break;
        }
        target = byRef && ACTIVE_STATUSES.includes(byRef.status) ? byRef : undefined;
      } else if (isValidDate(a.date)) {
        const onDate = mine.filter((b) => b.date === a.date);
        if (onDate.length === 1) target = onDate[0];
      } else if (mine.length === 1) {
        target = mine[0];
      }

      if (!target) {
        d.facts.push(
          mine.length
            ? `Could not tell which booking to cancel. The customer's upcoming bookings are:\n${mine.map((b) => `- ${b.ref}: ${slotLine(db, b)}`).join("\n")}\nAsk which one.`
            : "No upcoming booking was found for this email address. Ask for the booking reference (HAL-xxxx).",
        );
        d.actions.push("Cancellation: booking not identified – asked customer");
        break;
      }
      target.status = "cancelled";
      d.facts.push(`Booking ${target.ref} (${slotLine(db, target)}) has been CANCELLED and the time is released.`);
      d.actions.push(`Cancelled booking ${target.ref}`);
      if (target.paymentStatus === "paid") {
        d.escalate = true;
        d.escalationReason = `refund for cancelled booking ${target.ref} (${target.amount} DKK paid)`;
        d.facts.push(`The booking was already paid (${target.amount} DKK). The refund according to the cancellation policy will be handled by the hall manager.`);
        d.actions.push("Refund flagged for manager");
      }
      break;
    }

    case "payment_question": {
      const mine = db.bookings.filter((b) => b.customerEmail.toLowerCase() === fromEmail.toLowerCase() && b.date >= today);
      d.facts.push(
        mine.length
          ? `The customer's bookings:\n${mine.map((b) => `- ${b.ref}: ${slotLine(db, b)} – status ${b.status}, payment ${b.paymentStatus}${b.status === "awaiting_payment" ? `, payment link ${origin}/pay/${b.id}` : ""}`).join("\n")}`
          : "No bookings were found for this email address.",
      );
      d.actions.push("Answered payment question");
      break;
    }

    default:
      d.facts.push("No booking action was taken. Answer the question using the hall knowledge base. If the knowledge base does not contain the answer, say you have passed the question on to the hall manager.");
      d.actions.push("Answered from knowledge base");
  }
  return d;
}

export async function processIncomingEmail(email: IncomingEmail, origin: string): Promise<Thread> {
  const now = new Date().toISOString();
  const inbound: EmailMessage = {
    id: randomUUID(),
    direction: "in",
    from: email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail,
    to: "",
    subject: email.subject,
    body: email.body,
    at: now,
    sender: "customer",
  };

  const threadId = await mutate((db) => {
    inbound.to = db.hall.bookingEmail;
    let thread = email.threadId ? db.threads.find((t) => t.id === email.threadId) : undefined;
    if (!thread) {
      thread = {
        id: randomUUID(),
        customerEmail: email.fromEmail,
        customerName: email.fromName || "",
        subject: email.subject,
        language: "en",
        needsAttention: false,
        attentionReason: null,
        messages: [],
        updatedAt: now,
      };
      db.threads.unshift(thread);
    }
    thread.messages.push(inbound);
    thread.updatedAt = now;
    return thread.id;
  });

  try {
    const snapshot = await readDb();
    const thread = snapshot.threads.find((t) => t.id === threadId)!;
    const history = historyText(thread, inbound.id);
    const today = toISODate(new Date());

    const analysis = await analyzeEmail({
      today,
      todayWeekday: weekdayName(today),
      hallSummary: hallSummary(snapshot),
      history,
      email: { from: inbound.from, subject: email.subject, body: email.body },
    });

    const decision = await mutate((db) => {
      expireHolds(db);
      const t = db.threads.find((x) => x.id === threadId)!;
      return decide(db, analysis, t, email.fromEmail, origin);
    });

    const replyBody = await composeReply({
      hallName: snapshot.hall.name,
      managerName: snapshot.hall.managerName,
      knowledgeBase: snapshot.hall.knowledgeBase,
      language: analysis.language,
      customerName: analysis.customer_name,
      history,
      email: { subject: email.subject, body: email.body },
      facts: decision.facts.join("\n\n"),
    });

    const trace: AiTrace = {
      intent: analysis.intent,
      summary: analysis.summary,
      extracted: {
        date: analysis.date,
        start: analysis.start,
        end: analysis.end,
        area: analysis.area,
        purpose: analysis.purpose,
        participants: analysis.participants,
        customer_name: analysis.customer_name,
        phone: analysis.phone,
        booking_reference: analysis.booking_reference,
        language: analysis.language,
        missing_info: analysis.missing_info,
      },
      actions: decision.actions,
      escalated: decision.escalate,
      escalationReason: decision.escalationReason,
    };

    return await mutate((db) => {
      const t = db.threads.find((x) => x.id === threadId)!;
      const msg = t.messages.find((m) => m.id === inbound.id);
      if (msg) msg.ai = trace;
      t.language = analysis.language || t.language;
      if (analysis.customer_name && !t.customerName) t.customerName = analysis.customer_name;
      if (decision.escalate) {
        t.needsAttention = true;
        t.attentionReason = decision.escalationReason;
      }
      const subject = email.subject.toLowerCase().startsWith("re:") ? email.subject : `Re: ${email.subject}`;
      t.messages.push({
        id: randomUUID(),
        direction: "out",
        from: db.hall.bookingEmail,
        to: email.fromEmail,
        subject,
        body: replyBody,
        at: new Date().toISOString(),
        sender: "ai",
      });
      t.updatedAt = new Date().toISOString();
      return t;
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await mutate((db) => {
      const t = db.threads.find((x) => x.id === threadId);
      if (t) {
        t.needsAttention = true;
        t.attentionReason = `AI could not process the email: ${message}`;
      }
    });
    throw err;
  }
}
