import "server-only";
// Email delivery. With RESEND_API_KEY the message goes out through Resend; without it (dev/test), or for a reserved
// test domain, it goes to the in-memory outbox (and the dev log) instead. Tests therefore never send real email.
import { Resend } from "resend";
import { pushToOutbox, type OutboxMessage } from "./outbox";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const RESERVED_DOMAINS = /(^|\.)(test|invalid|example|localhost)$|(^|\.)example\.(com|org|net)$/i;

/** Addresses on RFC 2606/6761 reserved domains can never be delivered: always keep them in the outbox. */
export function isReservedTestAddress(email: string): boolean {
  const domain = email.split("@").pop() ?? "";
  return RESERVED_DOMAINS.test(domain.trim());
}

/** Empty strings count as unset (an exported-but-empty variable must not enable real delivery). */
export function emailTransportFor(email: string, apiKey: string | undefined): "resend" | "outbox" {
  return apiKey && apiKey.trim() && !isReservedTestAddress(email) ? "resend" : "outbox";
}

export async function sendEmail(message: OutgoingEmail): Promise<{ transport: "resend" | "outbox"; outbox?: OutboxMessage }> {
  if (emailTransportFor(message.to, process.env.RESEND_API_KEY) === "outbox") {
    const stored = pushToOutbox(message);
    if (process.env.NODE_ENV !== "production") {
      console.info(`[email:outbox] to=${message.to} subject="${message.subject}"\n${message.text}`);
    }
    return { transport: "outbox", outbox: stored };
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || "Overload <onboarding@resend.dev>",
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
  if (error) throw new Error(`Resend rejected the email: ${error.message}`);
  return { transport: "resend" };
}
