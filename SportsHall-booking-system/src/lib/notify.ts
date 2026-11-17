import { randomUUID } from "crypto";
import type { Booking, Db } from "./types";
import { bankTransferEmail, paymentConfirmedEmail } from "./templates";

/** Adds an automatic email to the booking's conversation (the prototype's stand-in for sending real email). */
export function sendBookingEmail(db: Db, b: Booking, kind: "paid" | "bank") {
  if (!b.threadId) return;
  const thread = db.threads.find((t) => t.id === b.threadId);
  if (!thread) return;
  const { subject, body } =
    kind === "paid" ? paymentConfirmedEmail(b, db.hall, thread.language) : bankTransferEmail(b, db.hall, thread.language);
  const at = new Date().toISOString();
  thread.messages.push({
    id: randomUUID(),
    direction: "out",
    from: db.hall.bookingEmail,
    to: b.customerEmail,
    subject,
    body,
    at,
    sender: "system",
  });
  thread.updatedAt = at;
}
