# HallBook — Sports Hall Booking & Email Assistant

**HallBook** is a working prototype for Danish school sports halls and local clubs that still take bookings over email and paper schedules.

It puts a real booking calendar behind the hall's existing email address (`booking@sondervang-hal.dk`): an assistant reads incoming emails, checks opening hours and conflicts across the Full Hall, Half A, and Half B, creates a 48-hour payment hold (`HAL-xxxx`), and sends a MobilePay or bank-transfer payment link. Requests requiring human judgment—such as season agreements, discounts, or unclear terms—are escalated to the manager.

---

## Key Features

- **Weekly Manager Calendar (`/calendar`)**: Displays school PE blocks, recurring club training imported once from the paper plan, pending payment holds, and confirmed bookings across Full Hall, Half A, and Half B. Managers can create, edit, or cancel any booking manually.
- **Email Inbox Assistant (`/inbox`)**: Parses incoming Danish or English customer emails (via OpenAI when `OPENAI_API_KEY` is configured, or a deterministic built-in demo assistant out of the box):
  - **Standard bookings**: Checks availability, creates an `awaiting_payment` hold, and sends a payment link.
  - **Facility questions**: Answers directly from the hall's editable knowledge base (changing rooms, non-marking shoes, parking, cake rules in the foyer).
  - **Edge cases / discounts**: Escalates to manager **Lars Mikkelsen** without auto-confirming.
- **Simulated Checkout (`/pay/[id]`) & Payments (`/payments`)**: Supports simulated MobilePay (instant confirmation) and bank transfer (extended 5-day hold with unique `HAL-xxxx` reference).
- **Public Booking Page (`/book`)** & **Hall Settings (`/settings`)**: Direct slot reservation page plus editable opening hours, area pricing, and knowledge base.

---

## 5-Minute Client Demo Script

1. **Calendar (`/calendar`)** — Review the pre-seeded week filled with recurring school PE hours and club sessions.
2. **Inbox (`/inbox`)** — Click **New customer email**, choose **Booking request**, and send. Watch the assistant hold Saturday and reply with a payment link.
3. **Pay (`/pay/[id]`)** — Open the payment link and complete the simulated MobilePay checkout. The slot turns green on the calendar.
4. **Facility Q&A** — Send **Question about the hall** to see instant replies drawn from the hall's knowledge base.
5. **Manager Escalation** — Send **Needs the manager** (season deal / discount) to see it held for Lars instead of auto-booked.

---

## Running Locally

```bash
cd SportsHall-booking-system
npm install
npm run dev
```

Open <http://localhost:3000>. Data is stored locally in `data/db.json` (git-ignored) and seeded automatically on first run.

### Optional Environment Variables

Copy `.env.example` to `.env.local` if you want to test with an OpenAI API key; without it, the built-in demo assistant handles all preset and custom scenarios.

---

## Tech Stack

- **Next.js 16** (App Router) & **React 19**
- **TypeScript**
- **Tailwind CSS v4**
- **File-backed serialized JSON store** (`src/lib/db.ts`)
