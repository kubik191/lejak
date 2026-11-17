export type AreaId = "full" | "a" | "b";

export interface Area {
  id: AreaId;
  name: string;
  pricePerHour: number;
}

export interface DayHours {
  open: string;
  close: string;
}

export interface Hall {
  name: string;
  address: string;
  managerName: string;
  bookingEmail: string;
  areas: Area[];
  /** Index 0 = Sunday ... 6 = Saturday. null = closed. */
  openingHours: (DayHours | null)[];
  knowledgeBase: string;
  bank: { regNo: string; accountNo: string; accountName: string };
  holdHours: number;
  bankTransferHoldHours: number;
  maxAutoBookingHours: number;
}

export type BookingStatus =
  | "confirmed"
  | "awaiting_payment"
  | "blocked"
  | "cancelled"
  | "expired";

export type PaymentStatus = "paid" | "unpaid" | "none";
export type PaymentMethod = "mobilepay" | "bank" | "invoice" | null;

export interface Booking {
  id: string;
  ref: string;
  date: string;
  start: string;
  end: string;
  area: AreaId;
  title: string;
  customerName: string;
  customerEmail: string;
  phone: string;
  status: BookingStatus;
  source: "manual" | "email" | "import" | "web";
  amount: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  paidAt: string | null;
  holdExpiresAt: string | null;
  seriesId: string | null;
  notes: string;
  threadId: string | null;
  createdAt: string;
}

export interface EmailAnalysis {
  intent:
    | "booking_request"
    | "availability_question"
    | "info_question"
    | "cancellation"
    | "payment_question"
    | "other";
  language: string;
  customer_name: string | null;
  phone: string | null;
  date: string | null;
  start: string | null;
  end: string | null;
  area: "full" | "a" | "b" | null;
  purpose: string | null;
  participants: number | null;
  booking_reference: string | null;
  missing_info: string[];
  needs_human: boolean;
  human_reason: string | null;
  summary: string;
}

export interface AiTrace {
  intent: string;
  summary: string;
  extracted: Record<string, unknown>;
  actions: string[];
  escalated: boolean;
  escalationReason: string | null;
}

export interface EmailMessage {
  id: string;
  direction: "in" | "out";
  from: string;
  to: string;
  subject: string;
  body: string;
  at: string;
  sender: "customer" | "ai" | "manager" | "system";
  ai?: AiTrace;
}

export interface Thread {
  id: string;
  customerEmail: string;
  customerName: string;
  subject: string;
  language: string;
  needsAttention: boolean;
  attentionReason: string | null;
  messages: EmailMessage[];
  updatedAt: string;
}

export interface Db {
  hall: Hall;
  bookings: Booking[];
  threads: Thread[];
  nextRef: number;
}
