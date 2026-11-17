import type { EmailAnalysis } from "./types";
import { addDays, weekday } from "./time";

const DA_MONTHS: Record<string, number> = {
  januar: 1, februar: 2, marts: 3, april: 4, maj: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, december: 12,
};
const EN_MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const DA_DAYS: Record<string, number> = {
  søndag: 0, mandag: 1, tirsdag: 2, onsdag: 3, torsdag: 4, fredag: 5, lørdag: 6,
};
const EN_DAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

function padTime(h: number, m = 0): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function nextWeekday(today: string, wd: number): string {
  const current = weekday(today);
  let delta = wd - current;
  if (delta <= 0) delta += 7;
  return addDays(today, delta);
}

function detectLanguage(text: string): string {
  if (/[æøå]/i.test(text) || /\b(hej|hallo|venlig|mvh|hilsen|hallen|leje|lørdag|tirsdag|omklædning|kage)\b/i.test(text)) {
    return "da";
  }
  return "en";
}

function extractDate(text: string, today: string): string | null {
  const year = Number(today.slice(0, 4));
  const lower = text.toLowerCase();

  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  const da = lower.match(/(\d{1,2})\.\s*(januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december)(?:\s+(\d{4}))?/);
  if (da) {
    const d = Number(da[1]);
    const m = DA_MONTHS[da[2]];
    const y = da[3] ? Number(da[3]) : year;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  const en = lower.match(/(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?/);
  if (en) {
    const d = Number(en[1]);
    const m = EN_MONTHS[en[2]];
    const y = en[3] ? Number(en[3]) : year;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  const slash = lower.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
  if (slash) {
    const d = Number(slash[1]);
    const m = Number(slash[2]);
    let y = slash[3] ? Number(slash[3]) : year;
    if (y < 100) y += 2000;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  for (const [name, wd] of Object.entries({ ...DA_DAYS, ...EN_DAYS })) {
    if (new RegExp(`\\b${name}\\b`, "i").test(lower)) return nextWeekday(today, wd);
  }
  return null;
}

function extractTimes(text: string): { start: string | null; end: string | null } {
  const ranged = text.match(
    /(?:kl\.?\s*)?(\d{1,2})(?::(\d{2}))?\s*(?:[-–]|til|to)\s*(?:kl\.?\s*)?(\d{1,2})(?::(\d{2}))?/i,
  );
  if (ranged) {
    return {
      start: padTime(Number(ranged[1]), ranged[2] ? Number(ranged[2]) : 0),
      end: padTime(Number(ranged[3]), ranged[4] ? Number(ranged[4]) : 0),
    };
  }
  const fromTo = text.match(/from\s+(\d{1,2})(?::(\d{2}))?\s+to\s+(\d{1,2})(?::(\d{2}))?/i);
  if (fromTo) {
    return {
      start: padTime(Number(fromTo[1]), fromTo[2] ? Number(fromTo[2]) : 0),
      end: padTime(Number(fromTo[3]), fromTo[4] ? Number(fromTo[4]) : 0),
    };
  }
  return { start: null, end: null };
}

function extractArea(text: string): EmailAnalysis["area"] {
  const t = text.toLowerCase();
  if (/\bhalf b\b|\bhalv b\b|\bhalvdel b\b/.test(t)) return "b";
  if (/\bhalf a\b|\bhalv a\b|\bhalvdel a\b/.test(t)) return "a";
  if (/\bhalf\b|\bhalv\b|\ben halv hal\b/.test(t)) return "a";
  if (/\bfull\b|\bwhole\b|\bhele hallen\b|\bhele hal\b/.test(t)) return "full";
  return "full";
}

function extractPhone(text: string): string | null {
  const m = text.match(/(?:\+45\s*)?((?:\d[\s-]*){8})/);
  if (!m) return null;
  const digits = m[1].replace(/\D/g, "");
  return digits.length === 8 ? digits.replace(/(\d{2})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4") : null;
}

function extractName(text: string, fromHeader: string): string | null {
  const sig = text.match(/(?:mvh|hilsen|venlig hilsen|best,|thanks,|regards,)\s*\n+[ \t]*([A-ZÆØÅ][a-zæøå]+(?:[ \t]+[A-ZÆØÅ][a-zæøå]+)+)/i);
  if (sig) return sig[1].trim();
  const fromName = fromHeader.match(/^([^<]+)</);
  if (fromName && /[a-z]/i.test(fromName[1])) return fromName[1].trim();
  return null;
}

function extractPurpose(text: string): string | null {
  const t = text.toLowerCase();
  if (/fødselsdag|birthday/.test(t)) return "Birthday party";
  if (/badminton/.test(t)) return "Badminton";
  if (/fodbold|football|soccer/.test(t)) return "Indoor football";
  if (/volleyball/.test(t)) return "Volleyball";
  if (/floorball/.test(t)) return "Floorball";
  if (/håndbold|handball/.test(t)) return "Handball";
  if (/turnering|tournament/.test(t)) return "Tournament";
  return null;
}

function extractRef(text: string): string | null {
  const m = text.match(/\bHAL-\d+\b/i);
  return m ? m[0].toUpperCase() : null;
}

export function demoAnalyzeEmail(params: {
  today: string;
  email: { from: string; subject: string; body: string };
  history: string;
}): EmailAnalysis {
  const combined = `${params.email.subject}\n${params.email.body}\n${params.history}`;
  const language = detectLanguage(combined);
  const date = extractDate(combined, params.today);
  const { start, end } = extractTimes(combined);
  const area = extractArea(combined);
  const customer_name = extractName(params.email.body, params.email.from);
  const phone = extractPhone(combined);
  const purpose = extractPurpose(combined);
  const people = combined.match(/(\d+)\s*(?:børn|children|people|personer|ansatte)/i);
  const participants = people ? Number(people[1]) : null;
  const booking_reference = extractRef(combined);

  const t = combined.toLowerCase();
  const human =
    /rabat|discount|sæson|season|hver (mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag|uge)|every (monday|tuesday|wednesday|thursday|friday|saturday|sunday|week)|klage|complaint|erstatning|refund|forhandle/.test(t);

  let intent: EmailAnalysis["intent"] = "other";
  if (/aflys|cancel|refund|annull/.test(t)) intent = "cancellation";
  else if (/betaling|payment|mobilepay|overførsel/.test(t) && !/leje|book|låne|reserve/.test(t)) intent = "payment_question";
  else if (/ledig|available|hvornår.*fri|when is.*free|ledige tider/.test(t) && !/vil gerne leje|book|reserve|låne/.test(t)) {
    intent = "availability_question";
  } else if (/leje|book|låne|reserve|fødselsdag|birthday|vil gerne/.test(t) && (date || start)) {
    intent = "booking_request";
  } else if (/omklæd|changing|parking|parkering|udstyr|equipment|shower|kage|cake|mål|goals|pris|price/.test(t)) {
    intent = "info_question";
  } else if (date && start) {
    intent = "booking_request";
  } else if (date) {
    intent = "availability_question";
  }

  const missing_info: string[] = [];
  if (intent === "booking_request") {
    if (!date) missing_info.push("date");
    if (!start || !end) missing_info.push("time");
  }

  return {
    intent,
    language,
    customer_name,
    phone,
    date,
    start,
    end,
    area,
    purpose,
    participants,
    booking_reference,
    missing_info,
    needs_human: human,
    human_reason: human
      ? language === "da"
        ? "Recurring booking or discount request needs the manager."
        : "Recurring booking or discount request needs the manager."
      : null,
    summary:
      intent === "booking_request"
        ? `Wants to book ${area ?? "the hall"} on ${date ?? "an unspecified date"} ${start && end ? `${start}–${end}` : ""}.`.trim()
        : intent === "availability_question"
          ? `Asks when the hall is free${date ? ` on ${date}` : ""}.`
          : intent === "info_question"
            ? "Asks about hall facilities or rules."
            : intent === "cancellation"
              ? "Wants to cancel a booking."
              : human
                ? "Request that needs the hall manager."
                : "General enquiry.",
  };
}

function pickKb(kb: string, email: string): string {
  const q = email.toLowerCase();
  const blocks = kb.split(/\n\n+/);
  const hits = blocks.filter((b) => {
    const t = b.toLowerCase();
    return (
      (/omklæd|changing|shower/.test(q) && /changing|omklæd|shower/.test(t)) ||
      (/park/.test(q) && /park/.test(t)) ||
      (/floorball|mål|goals|udstyr|equipment|net/.test(q) && /equipment|floorball|net|mål/.test(t)) ||
      (/kage|cake|mad|food|drink/.test(q) && /cake|food|drink|kage|snacks/.test(t)) ||
      (/pris|price|koster/.test(q) && /price|dkk|600/.test(t)) ||
      (/parkering|bus/.test(q) && /parking|bus/.test(t)) ||
      (/aflys|cancel/.test(q) && /cancel/.test(t))
    );
  });
  return hits.slice(0, 3).join("\n\n");
}

export function demoComposeReply(params: {
  hallName: string;
  managerName: string;
  knowledgeBase: string;
  language: string;
  customerName: string | null;
  email: { subject: string; body: string };
  facts: string;
}): string {
  const da = params.language.toLowerCase().startsWith("da");
  const first = params.customerName?.split(" ")[0] ?? "";
  const hi = da ? (first ? `Hej ${first}` : "Hej") : first ? `Hi ${first}` : "Hi";
  const sign = da
    ? `Venlig hilsen\nBooking-assistent, ${params.hallName}`
    : `Best regards\nBooking assistant, ${params.hallName}`;
  const facts = params.facts;
  const link = facts.match(/Payment link:\s*(\S+)/)?.[1];
  const ref = facts.match(/Reference:\s*(HAL-\d+)/)?.[1];
  const price = facts.match(/Price:\s*(\d+)/)?.[1];
  const whenLine = facts.match(/- ([^\n]*\d{2}:\d{2}-\d{2}:\d{2}[^\n]*)/)?.[1];
  const area = facts.match(/Area:\s*(.+)/)?.[1];
  const alts = [...facts.matchAll(/^- (.+)$/gm)].map((m) => m[1]);

  let body: string;

  if (/forwarded to the hall manager/i.test(facts)) {
    body = da
      ? `${hi}\n\nTak for din henvendelse. Den kræver en beslutning fra hallens leder, ${params.managerName}, som vender tilbage til dig personligt hurtigst muligt.\n\n${sign}`
      : `${hi}\n\nThanks for getting in touch. This needs a decision from the hall manager, ${params.managerName}, who will reply to you personally shortly.\n\n${sign}`;
  } else if (/A booking was created/i.test(facts)) {
    const cake = /kage|cake/i.test(params.email.body)
      ? da
        ? "\nKage og snacks er tilladt i foyer, men ikke ude i selve hallen.\n"
        : "\nCake and snacks are allowed in the foyer, but not in the hall itself.\n"
      : "";
    body = da
      ? `${hi}\n\nTak for din bookingforespørgsel. Vi har reserveret tiden til dig:\n\n- Reference: ${ref}\n- Tidspunkt: ${whenLine ?? ""}\n- Område: ${area ?? ""}\n- Pris: ${price} DKK\n\nTiden holdes, indtil der er betalt. Du kan betale med MobilePay eller bankoverførsel her:\n${link}\n${cake}\n${sign}`
      : `${hi}\n\nThanks for your booking request. We have reserved the time for you:\n\n- Reference: ${ref}\n- Time: ${whenLine ?? ""}\n- Area: ${area ?? ""}\n- Price: ${price} DKK\n\nThe slot is held until payment is received. Pay with MobilePay or bank transfer here:\n${link}\n${cake}\n${sign}`;
  } else if (/NOT available/i.test(facts)) {
    const list = alts.length ? alts.map((a) => `- ${a}`).join("\n") : da ? "- Ingen tætte alternativer fundet." : "- No close alternatives found.";
    body = da
      ? `${hi}\n\nDesværre er det ønskede tidspunkt allerede optaget, så vi har ikke booket noget.\n\nLedige alternativer:\n${list}\n\nSvar blot med det tidspunkt, I vil have, så reserverer vi det.\n\n${sign}`
      : `${hi}\n\nUnfortunately that time is already booked, so nothing was reserved.\n\nFree alternatives:\n${list}\n\nReply with the slot you want and we will reserve it.\n\n${sign}`;
  } else if (/did not give a usable date|start and\/or end time is missing/i.test(facts)) {
    body = da
      ? `${hi}\n\nTak for din mail. For at reservere tiden mangler vi dato og/eller tidspunkt (og om I skal bruge hele hallen eller en halv).\n\n${sign}`
      : `${hi}\n\nThanks for your email. To reserve a slot we still need the date and/or time (and whether you need the full hall or a half).\n\n${sign}`;
  } else if (/Free times \(from the booking calendar\)/i.test(facts)) {
    const list = alts.length ? alts.map((a) => `- ${a}`).join("\n") : facts;
    body = da
      ? `${hi}\n\nHer er de ledige tider fra kalenderen:\n\n${list}\n\nSvar med dato, tidspunkt og om I skal bruge hele hallen eller en halv, så reserverer vi den.\n\n${sign}`
      : `${hi}\n\nHere are the free times from the calendar:\n\n${list}\n\nReply with the date, time and whether you need the full hall or a half, and we will reserve it.\n\n${sign}`;
  } else if (/CANCELLED/i.test(facts)) {
    body = da
      ? `${hi}\n\nDin booking er nu aflyst, og tiden er ledig igen.\n\n${sign}`
      : `${hi}\n\nYour booking has been cancelled and the time is free again.\n\n${sign}`;
  } else {
    const kb = pickKb(params.knowledgeBase, params.email.body);
    const extra = kb
      ? da
        ? `\n${kb}\n`
        : `\n${kb}\n`
      : da
        ? "\nHvis jeg ikke har svaret fuldt ud, sender jeg spørgsmålet videre til hallens leder.\n"
        : "\nIf this does not fully answer your question, I will pass it on to the hall manager.\n";
    body = da
      ? `${hi}\n\nTak for din henvendelse.${extra}\n${sign}`
      : `${hi}\n\nThanks for your message.${extra}\n${sign}`;
  }

  return body.replace(/\n{3,}/g, "\n\n").trim();
}
