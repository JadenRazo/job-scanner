// Shared API response helpers — same shape as raizhost-app.

import type { NextRequest } from "next/server";
import { getAuth } from "@/lib/auth";

export type ApiResponse<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

export function apiResponse<T>(data: T, status = 200): Response {
  const body: ApiResponse<T> = { success: true, data };
  return Response.json(body, { status });
}

export function apiError(message: string, status: number): Response {
  const body: ApiResponse = { success: false, error: message };
  return Response.json(body, { status });
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "client";
}

export async function getSessionUser(
  req: NextRequest,
): Promise<SessionUser | null> {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return null;
    const u = session.user as Record<string, unknown>;
    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: (u.role as "admin" | "client") ?? "admin",
    };
  } catch {
    return null;
  }
}

export async function requireAuthApi(
  req: NextRequest,
): Promise<
  | { user: SessionUser; error: null }
  | { user: null; error: Response }
> {
  const user = await getSessionUser(req);
  if (!user) {
    return { user: null, error: apiError("Authentication required", 401) };
  }
  return { user, error: null };
}
