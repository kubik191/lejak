"use client";

import { useState } from "react";

const clean = (value) => String(value || "").trim().replace(/[\r\n]+/g, " ");
const SENT = "Sent. Both of us have it, and we’ll reply soon.";

export default function ContactForm() {
  const [status, setStatus] = useState({ text: "", kind: "" });
  const [sending, setSending] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (String(data.get("_honey") || "").trim()) {
      form.reset();
      setStatus({ text: SENT, kind: "is-success" });
      return;
    }

    const name = clean(data.get("name"));
    const email = clean(data.get("email"));
    const message = String(data.get("message") || "").trim();
    setSending(true);
    setStatus({ text: "Sending…", kind: "" });

    try {
      const response = await fetch("https://formsubmit.co/ajax/jakub.kucera@outlook.sk", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name,
          email,
          message,
          _replyto: email,
          _cc: "leogurtner@outlook.com",
          _subject: `LEJAK website: message from ${name}`.slice(0, 180),
          _template: "table",
          _captcha: "false",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      const queuedForActivation = /activation/i.test(String(payload.message || ""));
      if (!response.ok || (String(payload.success) === "false" && !queuedForActivation)) {
        throw new Error("send failed");
      }
      form.reset();
      setStatus({ text: SENT, kind: "is-success" });
    } catch (error) {
      setStatus({
        text: "We couldn’t send that just now. Email either of us directly and we’ll take it from there.",
        kind: "is-error",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      className="contact-form"
      id="contact-form"
      action="https://formsubmit.co/jakub.kucera@outlook.sk"
      method="POST"
      onSubmit={onSubmit}
    >
      <h3>Send a message</h3>
      <p className="form-note">It goes to Jakub and Leo together.</p>
      <input className="hp" type="text" name="_honey" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <input type="hidden" name="_cc" value="leogurtner@outlook.com" />
      <input type="hidden" name="_subject" value="New message from the LEJAK website" />
      <input type="hidden" name="_template" value="table" />
      <input type="hidden" name="_captcha" value="false" />
      <div className="form-grid">
        <div className="field">
          <label htmlFor="contact-name">Name</label>
          <input id="contact-name" name="name" type="text" autoComplete="name" required maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor="contact-email">Email</label>
          <input id="contact-email" name="email" type="email" autoComplete="email" required maxLength={160} />
        </div>
        <div className="field field-wide">
          <label htmlFor="contact-message">Message</label>
          <textarea id="contact-message" name="message" required maxLength={4000} />
        </div>
      </div>
      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={sending}>
          Send message
        </button>
        <p className={`form-status ${status.kind}`.trim()} id="form-status" role="status" aria-live="polite">
          {status.text}
        </p>
      </div>
    </form>
  );
}
