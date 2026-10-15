import "server-only";
// Body page loader (stream F): body metrics -> trend, body fat (with method), circumferences, FFMI range.
import type { ProfileFact } from "@/contracts/analytics";
import { addDays, localDateToDate, type LocalDate } from "@/lib/dates";
import type { UserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import { bodyMetricToRow } from "@/server/mappers";
import { loadProfileFact } from "@/server/queries/facts";
import { BODY_HISTORY_DAYS, bodyEntry, buildBodyView, type BodyView } from "./body.shape";
import { loadToday } from "./progress";

export interface BodyData extends BodyView {
  unit: ProfileFact["unitPreference"];
}

/** /progress/body and the BodyTrendCard: this user's last year of body metrics. */
export async function loadBodyView(ctx: UserCtx, opts: { today?: LocalDate } = {}): Promise<BodyData> {
  const today = opts.today ?? (await loadToday(ctx));
  const [rows, profile] = await Promise.all([
    prisma.bodyMetric.findMany({
      where: {
        userId: ctx.id,
        deletedAt: null,
        localDate: { gte: localDateToDate(addDays(today, -BODY_HISTORY_DAYS)), lte: localDateToDate(today) },
      },
      orderBy: [{ localDate: "asc" }, { measuredAt: "asc" }],
    }),
    loadProfileFact(ctx, today),
  ]);
  const view = buildBodyView({ entries: rows.map((r) => bodyEntry(bodyMetricToRow(r))), sex: profile.sex, heightCm: profile.heightCm, today });
  return { ...view, unit: profile.unitPreference };
}
