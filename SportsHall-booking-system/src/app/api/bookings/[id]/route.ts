import type { NextRequest } from "next/server";
import { mutate } from "@/lib/db";
import { findConflicts } from "@/lib/booking";
import { sendBookingEmail } from "@/lib/notify";
import { isValidDate, isValidTime, toMinutes } from "@/lib/time";
import type { Booking } from "@/lib/types";

const EDITABLE: (keyof Booking)[] = [
  "date", "start", "end", "area", "title", "customerName", "customerEmail", "phone",
  "status", "amount", "paymentStatus", "paymentMethod", "notes",
];

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/bookings/[id]">) {
  const { id } = await ctx.params;
  const body = (await request.json()) as Partial<Booking> & { markPaid?: boolean };

  try {
    const booking = await mutate((db) => {
      const b = db.bookings.find((x) => x.id === id);
      if (!b) throw new HttpError(404, "Booking not found.");

      if (body.markPaid) {
        b.paymentStatus = "paid";
        b.paidAt = new Date().toISOString();
        b.paymentMethod = b.paymentMethod ?? "bank";
        if (b.status === "awaiting_payment" || b.status === "expired") b.status = "confirmed";
        b.holdExpiresAt = null;
        sendBookingEmail(db, b, "paid");
        return b;
      }

      const next = { ...b };
      for (const key of EDITABLE) {
        if (key in body) (next as Record<string, unknown>)[key] = body[key];
      }
      if (!isValidDate(next.date) || !isValidTime(next.start) || !isValidTime(next.end) || toMinutes(next.end) <= toMinutes(next.start)) {
        throw new HttpError(400, "Please enter a valid date, start and end time.");
      }
      if (["confirmed", "awaiting_payment", "blocked"].includes(next.status)) {
        const conflicts = findConflicts(db, next, b.id);
        if (conflicts.length) {
          throw new HttpError(409, `This overlaps with: ${conflicts.map((c) => `${c.title || c.ref} (${c.start}-${c.end})`).join(", ")}`);
        }
      }
      if (next.paymentStatus === "paid" && b.paymentStatus !== "paid") next.paidAt = new Date().toISOString();
      if (next.status !== "awaiting_payment") next.holdExpiresAt = null;
      else if (!next.holdExpiresAt) next.holdExpiresAt = new Date(Date.now() + db.hall.holdHours * 3600 * 1000).toISOString();
      Object.assign(b, next);
      return b;
    });
    return Response.json({ booking });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/bookings/[id]">) {
  const { id } = await ctx.params;
  const series = request.nextUrl.searchParams.get("series") === "1";
  const removed = await mutate((db) => {
    const b = db.bookings.find((x) => x.id === id);
    if (!b) return 0;
    const before = db.bookings.length;
    if (series && b.seriesId) {
      db.bookings = db.bookings.filter((x) => !(x.seriesId === b.seriesId && x.date >= b.date));
    } else {
      db.bookings = db.bookings.filter((x) => x.id !== id);
    }
    return before - db.bookings.length;
  });
  return Response.json({ removed });
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function errorResponse(err: unknown) {
  if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
  return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
}
