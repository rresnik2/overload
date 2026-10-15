// In-memory outbox used when no real email is sent (no RESEND_API_KEY, or a reserved test domain).
// A globalThis singleton so route handlers, server actions and Better Auth callbacks all see the same list in dev.
export interface OutboxMessage {
  id: number;
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Every http(s) URL in the text body, in order (verification / reset links). */
  links: string[];
  sentAt: string;
}

const MAX_MESSAGES = 200;

const globalForOutbox = globalThis as unknown as { __overloadOutbox?: { seq: number; messages: OutboxMessage[] } };
const state = (globalForOutbox.__overloadOutbox ??= { seq: 0, messages: [] });

export function extractLinks(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s<>"')]+/g)].map((m) => m[0]);
}

export function pushToOutbox(message: Omit<OutboxMessage, "id" | "links" | "sentAt">): OutboxMessage {
  const stored: OutboxMessage = {
    ...message,
    id: ++state.seq,
    links: extractLinks(message.text),
    sentAt: new Date().toISOString(),
  };
  state.messages.push(stored);
  if (state.messages.length > MAX_MESSAGES) state.messages.splice(0, state.messages.length - MAX_MESSAGES);
  return stored;
}

/** Newest first. Matching is case-insensitive on the recipient. */
export function readOutbox(to?: string): OutboxMessage[] {
  const wanted = to?.trim().toLowerCase();
  return state.messages.filter((m) => !wanted || m.to.toLowerCase() === wanted).reverse();
}

export function clearOutbox(): void {
  state.messages.length = 0;
}
