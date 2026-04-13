// Admin bootstrap — runs once on first request.
//
// If ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD are set AND the users
// table is empty, create an admin via Better Auth's signUp API.
//
// The promise is memoised so subsequent callers don't re-run the check.

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";

let _bootstrapPromise: Promise<void> | null = null;

async function runBootstrap(): Promise<void> {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!email || !password) {
    return;
  }

  const db = getDb();
  const result = await db.execute<{ count: string }>(
    sql`SELECT COUNT(*)::text AS count FROM users`,
  );
  const count = Number(result.rows[0]?.count ?? "0");

  if (count > 0) {
    console.log("[bootstrap] admin exists, skipping");
    return;
  }

  const auth = getAuth();
  try {
    await auth.api.signUpEmail({
      body: {
        email,
        password,
        name: "Admin",
      },
    });
    console.log(`[bootstrap] created admin user ${email}`);
  } catch (err) {
    console.error("[bootstrap] failed to create admin user:", err);
    // Reset so a later request can retry.
    _bootstrapPromise = null;
    throw err;
  }
}

export function ensureBootstrap(): Promise<void> {
  if (!_bootstrapPromise) {
    _bootstrapPromise = runBootstrap().catch((err) => {
      console.error("[bootstrap] error:", err);
    });
  }
  return _bootstrapPromise;
}
