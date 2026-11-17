import { randomUUID } from "crypto";
import { mutate } from "@/lib/db";
import { findConflicts, newBooking, withinOpeningHours } from "@/lib/booking";
import { addDays, isValidDate, isValidTime, toMinutes } from "@/lib/time";
import type { AreaId, Booking } from "@/lib/types";

interface CreateBody {
  date: string;
  start: string;
  end: string;
  area: AreaId;
  title: string;
  customerName?: string;
  customerEmail?: string;
  phone?: string;
  status?: Booking["status"];
  amount?: number;
  paymentStatus?: Booking["paymentStatus"];
  paymentMethod?: Booking["paymentMethod"];
  notes?: string;
  repeatWeeklyUntil?: string | null;
}

export async function POST(request: Request) {
  const body = (await request.json()) as CreateBody;
  if (!isValidDate(body.date) || !isValidTime(body.start) || !isValidTime(body.end) || toMinutes(body.end) <= toMinutes(body.start)) {
    return Response.json({ error: "Please enter a valid date, start and end time." }, { status: 400 });
  }
  if (!["full", "a", "b"].includes(body.area)) {
    return Response.json({ error: "Invalid area." }, { status: 400 });
  }

  const dates: string[] = [body.date];
  if (body.repeatWeeklyUntil && isValidDate(body.repeatWeeklyUntil)) {
    for (let d = addDays(body.date, 7); d <= body.repeatWeeklyUntil && dates.length < 60; d = addDays(d, 7)) dates.push(d);
  }

  const result = await mutate((db) => {
    const seriesId = dates.length > 1 ? randomUUID() : null;
    const created: Booking[] = [];
    const skipped: { date: string; reason: string }[] = [];

    for (const date of dates) {
      const req = { date, start: body.start, end: body.end, area: body.area };
      const conflicts = findConflicts(db, req);
      if (conflicts.length) {
        skipped.push({ date, reason: `conflicts with ${conflicts.map((c) => `${c.title || c.ref} ${c.start}-${c.end}`).join(", ")}` });
        continue;
      }
      if (!withinOpeningHours(db.hall, req)) {
        skipped.push({ date, reason: "outside opening hours" });
        continue;
      }
      created.push(
        newBooking(db, {
          ...req,
          title: body.title || "Booking",
          customerName: body.customerName ?? "",
          customerEmail: body.customerEmail ?? "",
          phone: body.phone ?? "",
          status: body.status ?? "confirmed",
          source: "manual",
          amount: body.amount ?? 0,
          paymentStatus: body.paymentStatus ?? "none",
          paymentMethod: body.paymentMethod ?? null,
          paidAt: body.paymentStatus === "paid" ? new Date().toISOString() : null,
          holdExpiresAt:
            body.status === "awaiting_payment" ? new Date(Date.now() + db.hall.holdHours * 3600 * 1000).toISOString() : null,
          notes: body.notes ?? "",
          seriesId,
        }),
      );
    }
    return { created, skipped };
  });

  if (!result.created.length) {
    return Response.json({ error: `Nothing was booked: ${result.skipped.map((s) => `${s.date} ${s.reason}`).join("; ")}`, ...result }, { status: 409 });
  }
  return Response.json(result);
}
