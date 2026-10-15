// Reads the dev server's in-memory outbox (GET /api/auth/test-mailbox). Tests never send real email.
import type { APIRequestContext } from "@playwright/test";

export interface MailboxMessage {
  id: number;
  to: string;
  subject: string;
  text: string;
  links: string[];
  sentAt: string;
}

export async function readMailbox(request: APIRequestContext, to: string): Promise<MailboxMessage[]> {
  const res = await request.get(`/api/auth/test-mailbox?to=${encodeURIComponent(to)}`);
  if (!res.ok()) throw new Error(`test-mailbox responded ${res.status()}: is the dev server running with NODE_ENV != production?`);
  return ((await res.json()) as { messages: MailboxMessage[] }).messages;
}

/** Poll until a message whose subject matches arrives (the email is sent after the response, so it can lag a moment). */
export async function waitForEmail(request: APIRequestContext, to: string, subject: RegExp, timeoutMs = 15_000): Promise<MailboxMessage> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = (await readMailbox(request, to)).find((m) => subject.test(m.subject));
    if (found) return found;
    if (Date.now() > deadline) throw new Error(`No email to ${to} matching ${subject} within ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** The first link in the message that points at `pathPart` (e.g. "/verify-email", "/reset-password"). */
export function linkTo(message: MailboxMessage, pathPart: string): string {
  const link = message.links.find((l) => l.includes(pathPart));
  if (!link) throw new Error(`No link containing ${pathPart} in "${message.subject}": ${message.links.join(", ")}`);
  return link;
}
