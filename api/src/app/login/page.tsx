// Server component — runs ensureBootstrap() on first unauthenticated request
// before handing off to the client form. Middleware redirects all unauth
// traffic to /login, so this is the reliable place to bootstrap the admin
// account on a fresh deploy.

import { ensureBootstrap } from "@/lib/bootstrap";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  await ensureBootstrap();
  return <LoginForm />;
}
