import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

// Lazy handlers — avoid initializing the auth instance (and the DB pool)
// at module-import time so `next build` works without DATABASE_URL.
export async function GET(req: Request) {
  const { GET: handler } = toNextJsHandler(getAuth().handler);
  return handler(req);
}

export async function POST(req: Request) {
  const { POST: handler } = toNextJsHandler(getAuth().handler);
  return handler(req);
}
