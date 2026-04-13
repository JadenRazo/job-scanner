"use client";

import { createAuthClient } from "better-auth/react";

// No baseURL — the Better Auth client will use `window.location.origin` at
// runtime, so this works regardless of whether the app is reached via
// https://jobs.raizhost.com, http://localhost, or anything else. Avoids the
// build-time-inlined `NEXT_PUBLIC_*` trap where an env var baked into the
// browser bundle at build time points at the wrong origin at runtime.
export const authClient = createAuthClient();

export const { signIn, signOut, signUp, useSession } = authClient;
