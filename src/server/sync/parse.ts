import "server-only";
// Body parsing for POST /api/sync. A body that is entirely valid under the frozen `syncRequestSchema` behaves exactly as
// the contract says. A body with a bad envelope is a 400. A body whose envelope is fine but which contains invalid
// mutations does NOT fail as a whole: each bad mutation becomes a per-mutation `rejected` (+ dead letter) and the valid
// ones still apply ("a bad one never blocks the rest"; otherwise one poisoned outbox entry would wedge a device forever).
import { z } from "zod";
import { SYNC_MAX_MUTATIONS, hlcSchema, mutationSchema, syncRequestSchema } from "@/contracts/sync";
import type { MutationSlot, SyncEnvelope } from "./apply";

const envelopeSchema = z.strictObject({
  deviceId: z.string().regex(/^[A-Za-z0-9]{1,32}$/),
  cursor: z.int().min(0),
  clientHlc: hlcSchema,
  mutations: z.array(z.unknown()).max(SYNC_MAX_MUTATIONS),
});

const summarize = (error: z.ZodError) =>
  error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");

export type ParsedSyncBody =
  | { ok: true; envelope: SyncEnvelope; slots: MutationSlot[] }
  | { ok: false; error: string };

export function parseSyncBody(body: unknown): ParsedSyncBody {
  const strict = syncRequestSchema.safeParse(body);
  if (strict.success) {
    const { mutations, ...envelope } = strict.data;
    return { ok: true, envelope, slots: mutations.map((mutation) => ({ kind: "ok", mutation })) };
  }
  const lenient = envelopeSchema.safeParse(body);
  if (!lenient.success) return { ok: false, error: summarize(strict.error) };
  const { mutations, ...envelope } = lenient.data;
  const slots = mutations.map((raw): MutationSlot => {
    const parsed = mutationSchema.safeParse(raw);
    if (parsed.success) return { kind: "ok", mutation: parsed.data };
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return {
      kind: "invalid",
      mutationId: typeof r.mutationId === "string" ? r.mutationId : "",
      entity: typeof r.entity === "string" ? r.entity : "",
      id: typeof r.id === "string" ? r.id : "",
      message: summarize(parsed.error),
      raw,
    };
  });
  return { ok: true, envelope, slots };
}
