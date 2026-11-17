import type { Booking, Hall } from "./types";
import { areaName } from "./booking";
import { formatDateLong, formatDateTime } from "./time";

function isDanish(lang: string) {
  return lang.toLowerCase().startsWith("da");
}

function details(b: Booking, hall: Hall, da: boolean) {
  const locale = da ? "da-DK" : "en-GB";
  return [
    `- ${da ? "Reference" : "Reference"}: ${b.ref}`,
    `- ${da ? "Dato" : "Date"}: ${formatDateLong(b.date, locale)}`,
    `- ${da ? "Tid" : "Time"}: ${b.start}–${b.end}`,
    `- ${da ? "Område" : "Area"}: ${areaName(hall, b.area)}`,
    `- ${da ? "Beløb" : "Amount"}: ${b.amount} DKK`,
  ].join("\n");
}

export function paymentConfirmedEmail(b: Booking, hall: Hall, lang: string) {
  const da = isDanish(lang);
  const method = b.paymentMethod === "mobilepay" ? "MobilePay" : da ? "bankoverførsel" : "bank transfer";
  const subject = da ? `Booking bekræftet – ${b.ref}` : `Booking confirmed – ${b.ref}`;
  const body = da
    ? `Hej ${b.customerName || ""}

Tak for din betaling via ${method}. Din booking er nu bekræftet:

${details(b, hall, true)}

Dørkoden til hallen er 4821#. Husk indendørssko, og efterlad hallen som du fandt den.

Venlig hilsen
Booking-assistent, ${hall.name}`
    : `Hi ${b.customerName || ""}

Thank you for your payment via ${method}. Your booking is now confirmed:

${details(b, hall, false)}

The door code for the hall is 4821#. Please bring indoor shoes and leave the hall as you found it.

Best regards
Booking assistant, ${hall.name}`;
  return { subject, body };
}

export function bankTransferEmail(b: Booking, hall: Hall, lang: string) {
  const da = isDanish(lang);
  const deadline = b.holdExpiresAt ? formatDateTime(b.holdExpiresAt, da ? "da-DK" : "en-GB") : "";
  const subject = da ? `Betalingsoplysninger – ${b.ref}` : `Payment details – ${b.ref}`;
  const body = da
    ? `Hej ${b.customerName || ""}

Du har valgt at betale med bankoverførsel. Overfør venligst ${b.amount} DKK til:

- Reg.nr.: ${hall.bank.regNo}
- Kontonr.: ${hall.bank.accountNo}
- Modtager: ${hall.bank.accountName}
- Tekst på overførslen: ${b.ref}

Din tid er reserveret til ${deadline}. Når vi har modtaget betalingen, sender vi en bekræftelse.

${details(b, hall, true)}

Venlig hilsen
Booking-assistent, ${hall.name}`
    : `Hi ${b.customerName || ""}

You chose to pay by bank transfer. Please transfer ${b.amount} DKK to:

- Reg. no.: ${hall.bank.regNo}
- Account no.: ${hall.bank.accountNo}
- Recipient: ${hall.bank.accountName}
- Payment reference: ${b.ref}

Your time is held until ${deadline}. We will send a confirmation as soon as the payment is received.

${details(b, hall, false)}

Best regards
Booking assistant, ${hall.name}`;
  return { subject, body };
}
