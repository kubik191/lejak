import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { mutate } from "@/lib/db";

/** Manager writes a reply by hand. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/threads/[id]">) {
  const { id } = await ctx.params;
  const { body } = (await request.json()) as { body: string };
  if (!body?.trim()) return Response.json({ error: "Message is empty." }, { status: 400 });

  const thread = await mutate((db) => {
    const t = db.threads.find((x) => x.id === id);
    if (!t) return null;
    const at = new Date().toISOString();
    const subject = t.subject.toLowerCase().startsWith("re:") ? t.subject : `Re: ${t.subject}`;
    t.messages.push({
      id: randomUUID(),
      direction: "out",
      from: db.hall.bookingEmail,
      to: t.customerEmail,
      subject,
      body,
      at,
      sender: "manager",
    });
    t.needsAttention = false;
    t.attentionReason = null;
    t.updatedAt = at;
    return t;
  });
  if (!thread) return Response.json({ error: "Conversation not found." }, { status: 404 });
  return Response.json({ thread });
}

/** Mark the conversation as handled. */
export async function PATCH(_request: NextRequest, ctx: RouteContext<"/api/threads/[id]">) {
  const { id } = await ctx.params;
  const thread = await mutate((db) => {
    const t = db.threads.find((x) => x.id === id);
    if (!t) return null;
    t.needsAttention = false;
    t.attentionReason = null;
    return t;
  });
  if (!thread) return Response.json({ error: "Conversation not found." }, { status: 404 });
  return Response.json({ thread });
}
