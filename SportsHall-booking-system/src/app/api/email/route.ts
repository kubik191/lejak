import type { NextRequest } from "next/server";
import { processIncomingEmail, type IncomingEmail } from "@/lib/email-agent";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const body = (await request.json()) as IncomingEmail;
  if (!body.fromEmail || !body.body) {
    return Response.json({ error: "Sender email and message are required." }, { status: 400 });
  }
  try {
    const thread = await processIncomingEmail(body, request.nextUrl.origin);
    return Response.json({ thread });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
