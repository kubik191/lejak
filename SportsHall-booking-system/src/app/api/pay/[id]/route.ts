import { connection, type NextRequest } from "next/server";
import { mutate, readDb } from "@/lib/db";
import { areaName, expireHolds } from "@/lib/booking";
import { sendBookingEmail } from "@/lib/notify";
import type { Booking, Hall } from "@/lib/types";

function publicView(b: Booking, hall: Hall) {
  return {
    id: b.id,
    ref: b.ref,
    date: b.date,
    start: b.start,
    end: b.end,
    areaName: areaName(hall, b.area),
    title: b.title,
    customerName: b.customerName,
    amount: b.amount,
    status: b.status,
    paymentStatus: b.paymentStatus,
    paymentMethod: b.paymentMethod,
    holdExpiresAt: b.holdExpiresAt,
    hall: { name: hall.name, address: hall.address, bank: hall.bank },
  };
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/pay/[id]">) {
  await connection();
  const { id } = await ctx.params;
  await mutate((db) => expireHolds(db));
  const db = await readDb();
  const b = db.bookings.find((x) => x.id === id);
  if (!b) return Response.json({ error: "Booking not found." }, { status: 404 });
  return Response.json(publicView(b, db.hall));
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/pay/[id]">) {
  const { id } = await ctx.params;
  const { method } = (await request.json()) as { method: "mobilepay" | "bank" };

  const result = await mutate((db) => {
    expireHolds(db);
    const b = db.bookings.find((x) => x.id === id);
    if (!b) return { error: "Booking not found.", status: 404 } as const;
    if (b.status !== "awaiting_payment") {
      return { error: b.status === "expired" ? "This reservation has expired." : "This booking does not need payment.", status: 409 } as const;
    }
    if (method === "mobilepay") {
      b.paymentMethod = "mobilepay";
      b.paymentStatus = "paid";
      b.paidAt = new Date().toISOString();
      b.status = "confirmed";
      b.holdExpiresAt = null;
      sendBookingEmail(db, b, "paid");
    } else {
      b.paymentMethod = "bank";
      b.holdExpiresAt = new Date(Date.now() + db.hall.bankTransferHoldHours * 3600 * 1000).toISOString();
      sendBookingEmail(db, b, "bank");
    }
    return { booking: publicView(b, db.hall) } as const;
  });

  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result.booking);
}
