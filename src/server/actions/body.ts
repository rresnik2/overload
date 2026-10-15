"use server";
// Server Actions for the online body form (stream F). Wrapped in withUser(): the user comes from the session, never from the
// arguments, and the strict schemas reject an injected `userId`. Sync stays a route handler; only these online forms are actions.
import { revalidatePath } from "next/cache";
import { withUser } from "@/server/auth/session";
import type { ActionResult } from "@/server/profile/result";
import { addBodyMetric, deleteBodyMetric, editBodyMetric } from "./body.logic";

function refresh<T>(result: ActionResult<T>): ActionResult<T> {
  if (result.ok) {
    revalidatePath("/progress/body");
    revalidatePath("/today");
  }
  return result;
}

export const addBodyMetricAction = withUser(async (ctx, input: unknown) => refresh(await addBodyMetric(ctx, input)));

export const editBodyMetricAction = withUser(async (ctx, input: unknown) => refresh(await editBodyMetric(ctx, input)));

export const deleteBodyMetricAction = withUser(async (ctx, input: unknown) => refresh(await deleteBodyMetric(ctx, input)));
