import type { NextRequest } from "next/server";
import { findConflicts, newBooking, priceFor, withinOpeningHours } from "@/lib/booking";
import { mutate } from "@/lib/db";
import { isValidDate, isValidTime, toMinutes } from "@/lib/time";
import type { AreaId } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    date: string;
    start: string;
    end: string;
    area: AreaId;
    customerName: string;
    customerEmail: string;
    phone?: string;
    purpose?: string;
  };

  if (!isValidDate(body.date) || !isValidTime(body.start) || !isValidTime(body.end) || toMinutes(body.end) <= toMinutes(body.start)) {
    return Response.json({ error: "Please choose a valid date and time." }, { status: 400 });
  }
  if (!["full", "a", "b"].includes(body.area)) {
    return Response.json({ error: "Invalid area." }, { status: 400 });
  }
  if (!body.customerName?.trim() || !body.customerEmail?.includes("@")) {
    return Response.json({ error: "Name and a valid email are required." }, { status: 400 });
  }

  const result = await mutate((db) => {
    const req = { date: body.date, start: body.start, end: body.end, area: body.area };
    if (!withinOpeningHours(db.hall, req)) {
      return { error: "That time is outside opening hours." } as const;
    }
    if (findConflicts(db, req).length) {
      return { error: "That time was just taken. Please pick another slot." } as const;
    }
    const amount = priceFor(db.hall, body.area, body.start, body.end);
    const booking = newBooking(db, {
      ...req,
      title: body.purpose?.trim() || "Booking",
      customerName: body.customerName.trim(),
      customerEmail: body.customerEmail.trim(),
      phone: body.phone?.trim() ?? "",
      status: "awaiting_payment",
      source: "web",
      amount,
      paymentStatus: "unpaid",
      holdExpiresAt: new Date(Date.now() + db.hall.holdHours * 3600 * 1000).toISOString(),
    });
    return { id: booking.id, ref: booking.ref, amount } as const;
  });

  if ("error" in result) return Response.json({ error: result.error }, { status: 409 });
  return Response.json({ ...result, payUrl: `/pay/${result.id}` });
}
