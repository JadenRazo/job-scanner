import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";

// Lazy singleton — avoids calling getDb() at module-import time which would
// throw during `next build` when DATABASE_URL is absent.
let _auth: ReturnType<typeof createAuth> | null = null;

function createAuth() {
  return betterAuth({
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      usePlural: true,
      schema: {
        users: schema.users,
        sessions: schema.sessions,
        accounts: schema.accounts,
        verifications: schema.verifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
      // Disable public self-signup: this is a single-user dashboard and the
      // admin is seeded by ensureBootstrap() on first /login hit (see
      // src/lib/bootstrap.ts). Leaving signUp open would let anyone on the
      // internet POST /api/auth/sign-up/email and create an account.
      disableSignUp: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
      },
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          defaultValue: "admin",
          required: false,
          input: false,
        },
      },
    },
    trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") ?? [],
    advanced: {
      database: {
        generateId: false,
      },
      defaultCookieAttributes: {
        sameSite: "lax" as const,
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
      },
    },
    plugins: [nextCookies()],
  });
}

export function getAuth() {
  if (!_auth) {
    _auth = createAuth();
  }
  return _auth;
}

// Proxy so `auth` stays lazy — any field access triggers getAuth().
export const auth = new Proxy({} as ReturnType<typeof createAuth>, {
  get(_target, prop, receiver) {
    return Reflect.get(getAuth(), prop, receiver);
  },
});

export type Session = typeof auth.$Infer.Session;
