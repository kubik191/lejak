import { connection } from "next/server";
import { mutate } from "@/lib/db";
import { expireHolds } from "@/lib/booking";
import { aiConfigured, aiModel, aiProvider } from "@/lib/ai";

export async function GET() {
  await connection();
  const db = await mutate((d) => {
    expireHolds(d);
    return d;
  });
  return Response.json({ ...db, ai: { configured: aiConfigured(), model: aiModel(), provider: aiProvider() } });
}
