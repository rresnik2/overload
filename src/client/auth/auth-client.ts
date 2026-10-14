"use client";
// Better Auth browser client. Stream A owns this file (passkey UX, social sign-in buttons).
import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [passkeyClient()],
});
