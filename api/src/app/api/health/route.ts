// Unauthenticated health check for Docker/compose healthcheck probes.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}
