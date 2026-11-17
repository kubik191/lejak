import { demoAnalyzeEmail, demoComposeReply } from "./ai-demo";
import type { EmailAnalysis } from "./types";

export type { EmailAnalysis } from "./types";

function chatUrl(): string {
  const base = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  return `${base.replace(/\/$/, "")}/chat/completions`;
}

function hasRealOpenAI(): boolean {
  const key = process.env.OPENAI_API_KEY ?? "";
  const base = process.env.OPENAI_BASE_URL ?? "";
  if (!key || /fake|test-key|placeholder/i.test(key)) return false;
  if (base.includes("127.0.0.1") || base.includes("localhost")) return false;
  return key.startsWith("sk-");
}

export type AiProvider = "openai" | "demo";

export function aiProvider(): AiProvider {
  return hasRealOpenAI() ? "openai" : "demo";
}

/** Always true in this prototype: OpenAI if configured, otherwise the built-in demo assistant. */
export function aiConfigured(): boolean {
  return true;
}

export function aiModel(): string {
  return hasRealOpenAI() ? process.env.OPENAI_MODEL || "gpt-4.1-mini" : "demo";
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function chat(messages: ChatMessage[], responseFormat?: object): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set. Add it to .env.local and restart the dev server.");

  const res = await fetch(chatUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: aiModel(),
      messages,
      ...(responseFormat ? { response_format: responseFormat } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

const nullable = (type: string) => ({ type: [type, "null"] });

const ANALYSIS_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "email_analysis",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "intent", "language", "customer_name", "phone", "date", "start", "end", "area",
        "purpose", "participants", "booking_reference", "missing_info", "needs_human", "human_reason", "summary",
      ],
      properties: {
        intent: {
          type: "string",
          enum: ["booking_request", "availability_question", "info_question", "cancellation", "payment_question", "other"],
        },
        language: { type: "string", description: "ISO 639-1 code of the language the customer writes in, e.g. da, en, de." },
        customer_name: nullable("string"),
        phone: nullable("string"),
        date: { type: ["string", "null"], description: "Requested date as YYYY-MM-DD, resolved relative to today." },
        start: { type: ["string", "null"], description: "Start time HH:MM (24h)." },
        end: { type: ["string", "null"], description: "End time HH:MM (24h). If only a duration is given, compute it." },
        area: { type: ["string", "null"], enum: ["full", "a", "b", null] },
        purpose: nullable("string"),
        participants: nullable("integer"),
        booking_reference: { type: ["string", "null"], description: "Booking reference like HAL-1234 if mentioned." },
        missing_info: { type: "array", items: { type: "string" } },
        needs_human: { type: "boolean" },
        human_reason: nullable("string"),
        summary: { type: "string", description: "One sentence in English summarising what the customer wants." },
      },
    },
  },
};

export async function analyzeEmail(params: {
  today: string;
  todayWeekday: string;
  hallSummary: string;
  history: string;
  email: { from: string; subject: string; body: string };
}): Promise<EmailAnalysis> {
  const system = `You read emails sent to the booking inbox of a sports hall and extract structured data.
Today is ${params.todayWeekday} ${params.today}. Resolve relative dates ("next Saturday", "på lørdag", "d. 14/11") to YYYY-MM-DD. Dates like 14/11 are day/month (Danish convention). Never pick a date in the past unless explicitly stated.

Hall:
${params.hallSummary}

Area rules:
- "full" = the whole hall. "a" and "b" = one half each.
- If the customer asks for "half the hall", "en halv hal", 3 badminton courts or similar, and does not specify which half, use "a".
- If they do not mention size at all, use "full".

Intent rules:
- booking_request: they want to reserve a time (also when they reply to a previous email providing missing details such as the time).
- availability_question: they ask when the hall is free without asking to book yet.
- info_question: questions about facilities, prices, rules, parking, etc.
- cancellation: they want to cancel an existing booking. (If they want to move/change a booking, use cancellation and set needs_human = true.)
- payment_question: about paying or a payment they made.

Fill missing_info (in English) only for booking_request when date, start or end cannot be determined. Use the conversation history to fill in details given in earlier messages.

Set needs_human = true ONLY if: the request is a complaint, a refund request, a price negotiation/discount request, a request for a recurring/season booking, an event with more than 150 people, something unsafe or unclear that a manager must decide, or you are genuinely unsure. Normal bookings and questions do NOT need a human.`;

  const user = `Conversation history (oldest first):
${params.history || "(none)"}

New email:
From: ${params.email.from}
Subject: ${params.email.subject}

${params.email.body}`;

  if (!hasRealOpenAI()) {
    return demoAnalyzeEmail({ today: params.today, email: params.email, history: params.history });
  }

  try {
    const content = await chat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ANALYSIS_SCHEMA,
    );
    return JSON.parse(content) as EmailAnalysis;
  } catch {
    return demoAnalyzeEmail({ today: params.today, email: params.email, history: params.history });
  }
}

export async function composeReply(params: {
  hallName: string;
  managerName: string;
  knowledgeBase: string;
  language: string;
  customerName: string | null;
  history: string;
  email: { subject: string; body: string };
  facts: string;
}): Promise<string> {
  const system = `You are the booking assistant of "${params.hallName}". You write the email reply to a customer.

Strict rules:
- Write in the customer's language (ISO code: ${params.language}). Danish customers get Danish.
- Use ONLY the FACTS below and the hall knowledge base. Never invent availability, prices, rules or bookings.
- If the facts contain a payment link, include it exactly as given on its own line.
- If the facts say the request was forwarded to the manager, say that ${params.managerName} will reply personally soon. Do not promise anything else.
- Be friendly, short and clear. Use simple formatting: short paragraphs, and "- " bullet lists for booking details. No markdown bold or headings.
- Sign as: "Booking assistant, ${params.hallName}".
- Output only the email body, no subject line.

Hall knowledge base:
${params.knowledgeBase}`;

  const user = `Conversation history (oldest first):
${params.history || "(none)"}

Email to answer${params.customerName ? ` (from ${params.customerName})` : ""}:
Subject: ${params.email.subject}

${params.email.body}

FACTS (from the booking system – these are true):
${params.facts}`;

  if (!hasRealOpenAI()) {
    return demoComposeReply(params);
  }

  try {
    return (await chat([
      { role: "system", content: system },
      { role: "user", content: user },
    ])).trim();
  } catch {
    return demoComposeReply(params);
  }
}
