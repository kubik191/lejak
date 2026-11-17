import { connection, type NextRequest } from "next/server";
import { expireHolds, freeIntervals, priceFor } from "@/lib/booking";
import { mutate } from "@/lib/db";
import { addDays, fromMinutes, startOfWeek, toISODate, toMinutes, weekday } from "@/lib/time";
import type { AreaId } from "@/lib/types";

function hourSlots(intervals: { start: string; end: string }[]) {
  const slots: { start: string; end: string }[] = [];
  for (const iv of intervals) {
    for (let s = toMinutes(iv.start); s + 60 <= toMinutes(iv.end); s += 60) {
      slots.push({ start: fromMinutes(s), end: fromMinutes(s + 60) });
    }
  }
  return slots;
}

export async function GET(request: NextRequest) {
  await connection();
  const weekParam = request.nextUrl.searchParams.get("week") ?? toISODate(new Date());
  const weekStart = startOfWeek(weekParam);
  const db = await mutate((d) => {
    expireHolds(d);
    return d;
  });

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    return {
      date,
      closed: !db.hall.openingHours[weekday(date)],
      areas: db.hall.areas.map((area) => ({
        id: area.id,
        name: area.name,
        pricePerHour: area.pricePerHour,
        slots: hourSlots(freeIntervals(db, date, area.id as AreaId)).map((slot) => ({
          ...slot,
          price: priceFor(db.hall, area.id as AreaId, slot.start, slot.end),
        })),
      })),
    };
  });

  return Response.json({
    weekStart,
    hall: {
      name: db.hall.name,
      address: db.hall.address,
      areas: db.hall.areas,
      openingHours: db.hall.openingHours,
    },
    days,
  });
}
