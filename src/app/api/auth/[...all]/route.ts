// Better Auth catch-all route handler. Stream A owns it.
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth/auth";

export const { GET, POST } = toNextJsHandler(auth);
