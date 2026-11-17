import { randomUUID } from "crypto";
import type { AreaId, Booking, Db, Hall } from "./types";
import { addDays, fromMinutes, toMinutes, weekday } from "./time";

export const ACTIVE_STATUSES: Booking["status"][] = ["confirmed", "awaiting_payment", "blocked"];

export function areasOverlap(a: AreaId, b: AreaId): boolean {
  return a === "full" || b === "full" || a === b;
}

export interface SlotRequest {
  date: string;
  start: string;
  end: string;
  area: AreaId;
}

export function findConflicts(db: Db, req: SlotRequest, ignoreId?: string): Booking[] {
  const s = toMinutes(req.start);
  const e = toMinutes(req.end);
  return db.bookings.filter(
    (b) =>
      b.id !== ignoreId &&
      ACTIVE_STATUSES.includes(b.status) &&
      b.date === req.date &&
      areasOverlap(b.area, req.area) &&
      toMinutes(b.start) < e &&
      toMinutes(b.end) > s,
  );
}

export function withinOpeningHours(hall: Hall, req: SlotRequest): boolean {
  const hours = hall.openingHours[weekday(req.date)];
  if (!hours) return false;
  return toMinutes(req.start) >= toMinutes(hours.open) && toMinutes(req.end) <= toMinutes(hours.close);
}

export function priceFor(hall: Hall, area: AreaId, start: string, end: string): number {
  const a = hall.areas.find((x) => x.id === area);
  const hours = (toMinutes(end) - toMinutes(start)) / 60;
  return Math.round((a?.pricePerHour ?? 0) * hours);
}

export function areaName(hall: Hall, area: AreaId): string {
  return hall.areas.find((a) => a.id === area)?.name ?? area;
}

/** Free intervals for one area on one date, within opening hours. */
export function freeIntervals(db: Db, date: string, area: AreaId): { start: string; end: string }[] {
  const hours = db.hall.openingHours[weekday(date)];
  if (!hours) return [];
  const open = toMinutes(hours.open);
  const close = toMinutes(hours.close);
  const busy = db.bookings
    .filter((b) => ACTIVE_STATUSES.includes(b.status) && b.date === date && areasOverlap(b.area, area))
    .map((b) => [toMinutes(b.start), toMinutes(b.end)] as const)
    .sort((x, y) => x[0] - y[0]);

  const result: { start: string; end: string }[] = [];
  let cursor = open;
  for (const [bs, be] of busy) {
    if (bs > cursor) result.push({ start: fromMinutes(cursor), end: fromMinutes(Math.min(bs, close)) });
    cursor = Math.max(cursor, be);
  }
  if (cursor < close) result.push({ start: fromMinutes(cursor), end: fromMinutes(close) });
  return result.filter((r) => toMinutes(r.end) - toMinutes(r.start) >= 30);
}

/** Nearest free slots with the same duration: same day first (any area that fits), then following days. */
export function findAlternatives(db: Db, req: SlotRequest, max = 3): SlotRequest[] {
  const duration = toMinutes(req.end) - toMinutes(req.start);
  const wanted = toMinutes(req.start);
  const candidateAreas: AreaId[] = req.area === "full" ? ["full"] : [req.area, req.area === "a" ? "b" : "a"];
  const out: SlotRequest[] = [];

  for (let dayOffset = 0; dayOffset < 14 && out.length < max; dayOffset++) {
    const date = addDays(req.date, dayOffset);
    const options: { slot: SlotRequest; distance: number }[] = [];
    for (const area of candidateAreas) {
      for (const free of freeIntervals(db, date, area)) {
        for (let s = toMinutes(free.start); s + duration <= toMinutes(free.end); s += 30) {
          options.push({
            slot: { date, start: fromMinutes(s), end: fromMinutes(s + duration), area },
            distance: Math.abs(s - wanted) + (area === req.area ? 0 : 15),
          });
        }
      }
    }
    options.sort((x, y) => x.distance - y.distance);
    for (const o of options) {
      if (out.length >= max) break;
      if (out.some((x) => x.date === o.slot.date && Math.abs(toMinutes(x.start) - toMinutes(o.slot.start)) < 60)) continue;
      out.push(o.slot);
    }
    if (dayOffset === 0 && out.length > 0) break;
  }
  return out;
}

export function expireHolds(db: Db): number {
  const now = Date.now();
  let count = 0;
  for (const b of db.bookings) {
    if (b.status === "awaiting_payment" && b.holdExpiresAt && new Date(b.holdExpiresAt).getTime() < now) {
      b.status = "expired";
      count++;
    }
  }
  return count;
}

export function newBooking(db: Db, data: Partial<Booking> & SlotRequest): Booking {
  const booking: Booking = {
    id: randomUUID(),
    ref: `HAL-${db.nextRef++}`,
    title: "",
    customerName: "",
    customerEmail: "",
    phone: "",
    status: "confirmed",
    source: "manual",
    amount: 0,
    paymentStatus: "none",
    paymentMethod: null,
    paidAt: null,
    holdExpiresAt: null,
    seriesId: null,
    notes: "",
    threadId: null,
    createdAt: new Date().toISOString(),
    ...data,
  };
  db.bookings.push(booking);
  return booking;
}
