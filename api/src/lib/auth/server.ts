// Server-side auth helpers for Server Components and Route Handlers.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export type AuthSession = typeof auth.$Infer.Session;

export async function getSession(): Promise<AuthSession | null> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  return session ?? null;
}

export async function requireAuth(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function validateSession(
  request: Request,
): Promise<{ userId: string } | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  return { userId: session.user.id };
}
