import { mutate } from "@/lib/db";
import type { Hall } from "@/lib/types";

export async function PUT(request: Request) {
  const hall = (await request.json()) as Hall;
  const saved = await mutate((db) => {
    db.hall = { ...db.hall, ...hall };
    return db.hall;
  });
  return Response.json({ hall: saved });
}
