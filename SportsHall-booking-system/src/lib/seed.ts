import { randomUUID } from "crypto";
import type { AreaId, Booking, Db, Hall } from "./types";
import { addDays, startOfWeek, toISODate } from "./time";

export const DEFAULT_HALL: Hall = {
  name: "Søndervang Skole – Sports Hall",
  address: "Skolevej 12, 2300 København S",
  managerName: "Lars Mikkelsen",
  bookingEmail: "booking@sondervang-hal.dk",
  areas: [
    { id: "full", name: "Full hall", pricePerHour: 600 },
    { id: "a", name: "Half A (stage end)", pricePerHour: 350 },
    { id: "b", name: "Half B (entrance end)", pricePerHour: 350 },
  ],
  openingHours: [
    { open: "08:00", close: "20:00" },
    { open: "07:00", close: "22:00" },
    { open: "07:00", close: "22:00" },
    { open: "07:00", close: "22:00" },
    { open: "07:00", close: "22:00" },
    { open: "07:00", close: "22:00" },
    { open: "08:00", close: "20:00" },
  ],
  knowledgeBase: `HALL
- Size: 40 x 20 m, can be split into two halves (Half A and Half B) with a dividing curtain.
- Full hall: 1 handball court, 2 basketball courts, 6 badminton courts. Each half: 3 badminton courts or 1 volleyball court.
- Max capacity: 150 people.
- Step-free access and an accessible toilet.

FACILITIES
- 2 changing rooms with showers (included in the price).
- Equipment that can be used for free: badminton nets and posts, 2 floorball goals, volleyball net, gymnastics mats, balls. Bring your own rackets and shuttlecocks.
- No kitchen. A water fountain is in the foyer.

RULES
- Indoor shoes with non-marking soles only. No outdoor shoes in the hall.
- No food or drinks other than water in the hall itself. Cake and snacks are allowed in the foyer.
- No alcohol.
- Children's birthday parties are welcome but must be supervised by at least 2 adults.
- Leave the hall as you found it. A cleaning fee of 500 DKK is charged if it is not.

PRICES (DKK per hour)
- Full hall: 600. Half hall: 350. Minimum booking 1 hour.
- Local sports clubs with a season agreement are invoiced by the municipality and do not pay per booking.

PAYMENT
- Bookings are paid when reserving: MobilePay or bank transfer.
- A booking is held for 48 hours until paid. With bank transfer the hold is extended to 5 days.
- The booking is confirmed when payment is received.

CANCELLATION
- Free cancellation up to 7 days before. 50% refund 2–7 days before. No refund within 48 hours.

ACCESS AND PARKING
- Entrance via the main gate on Skolevej. A door code is sent with the booking confirmation.
- 20 free parking spaces in the school car park after 16:00 on weekdays and all day at weekends.
- Bus 18 stops at "Søndervang Skole" 2 minutes from the hall.

CONTACT
- Hall manager: Lars Mikkelsen. Urgent issues on the day: +45 12 34 56 78.`,
  bank: {
    regNo: "1234",
    accountNo: "0012345678",
    accountName: "Søndervang Skole – Hal",
  },
  holdHours: 48,
  bankTransferHoldHours: 120,
  maxAutoBookingHours: 6,
};

interface Recurring {
  weekday: number;
  start: string;
  end: string;
  area: AreaId;
  title: string;
  customerName: string;
  customerEmail: string;
  status: "confirmed" | "blocked";
}

const RECURRING: Recurring[] = [
  ...[1, 2, 3, 4, 5].map((wd) => ({
    weekday: wd,
    start: "08:00",
    end: "15:00",
    area: "full" as AreaId,
    title: "School PE lessons",
    customerName: "Søndervang Skole",
    customerEmail: "",
    status: "blocked" as const,
  })),
  { weekday: 1, start: "16:00", end: "18:00", area: "full", title: "Handball U12 – Søndervang HK", customerName: "Søndervang HK", customerEmail: "kontakt@sondervanghk.dk", status: "confirmed" },
  { weekday: 1, start: "19:00", end: "21:00", area: "a", title: "Badminton – Amager BK", customerName: "Amager Badmintonklub", customerEmail: "info@amagerbk.dk", status: "confirmed" },
  { weekday: 2, start: "17:00", end: "19:00", area: "full", title: "Indoor football – FC Lokal", customerName: "FC Lokal", customerEmail: "trainer@fclokal.dk", status: "confirmed" },
  { weekday: 3, start: "18:00", end: "20:00", area: "a", title: "Volleyball seniors", customerName: "KBH Volley", customerEmail: "kbhvolley@gmail.com", status: "confirmed" },
  { weekday: 3, start: "18:00", end: "20:00", area: "b", title: "Floorball juniors", customerName: "Søndervang Floorball", customerEmail: "floorball@sondervang.dk", status: "confirmed" },
  { weekday: 4, start: "16:30", end: "18:30", area: "full", title: "Handball U14 – Søndervang HK", customerName: "Søndervang HK", customerEmail: "kontakt@sondervanghk.dk", status: "confirmed" },
  { weekday: 6, start: "09:00", end: "11:00", area: "full", title: "Kids gymnastics", customerName: "Gymnastikforeningen", customerEmail: "gym@gfsondervang.dk", status: "confirmed" },
];

export function createSeedDb(): Db {
  const now = new Date();
  const today = toISODate(now);
  const firstWeek = addDays(startOfWeek(today), -7);
  const bookings: Booking[] = [];
  let ref = 1001;

  const base = (): Omit<Booking, "date" | "start" | "end" | "area" | "title" | "customerName" | "customerEmail" | "status"> => ({
    id: randomUUID(),
    ref: `HAL-${ref++}`,
    phone: "",
    source: "import",
    amount: 0,
    paymentStatus: "none",
    paymentMethod: null,
    paidAt: null,
    holdExpiresAt: null,
    seriesId: null,
    notes: "",
    threadId: null,
    createdAt: now.toISOString(),
  });

  for (const r of RECURRING) {
    const seriesId = randomUUID();
    for (let w = 0; w < 14; w++) {
      const weekStart = addDays(firstWeek, w * 7);
      const date = addDays(weekStart, r.weekday === 0 ? 6 : r.weekday - 1);
      bookings.push({
        ...base(),
        date,
        start: r.start,
        end: r.end,
        area: r.area,
        title: r.title,
        customerName: r.customerName,
        customerEmail: r.customerEmail,
        status: r.status,
        paymentMethod: r.status === "confirmed" ? "invoice" : null,
        seriesId,
        notes: r.status === "confirmed" ? "Season agreement – invoiced by the municipality." : "",
      });
    }
  }

  const thisWeek = startOfWeek(today);
  const nextSaturday = addDays(thisWeek, 12);
  const thisSunday = addDays(thisWeek, 6);

  bookings.push({
    ...base(),
    source: "manual",
    date: thisSunday,
    start: "13:00",
    end: "16:00",
    area: "full",
    title: "Company team event",
    customerName: "Nordlys ApS",
    customerEmail: "hr@nordlys.dk",
    phone: "+45 22 33 44 55",
    status: "confirmed",
    amount: 1800,
    paymentStatus: "paid",
    paymentMethod: "bank",
    paidAt: now.toISOString(),
  });

  bookings.push({
    ...base(),
    source: "manual",
    date: nextSaturday,
    start: "14:00",
    end: "16:00",
    area: "b",
    title: "Birthday party (8 years)",
    customerName: "Mette Hansen",
    customerEmail: "mette.hansen@gmail.com",
    phone: "+45 40 11 22 33",
    status: "awaiting_payment",
    amount: 700,
    paymentStatus: "unpaid",
    paymentMethod: "bank",
    holdExpiresAt: new Date(now.getTime() + 3 * 24 * 3600 * 1000).toISOString(),
  });

  return { hall: DEFAULT_HALL, bookings, threads: [], nextRef: ref };
}
