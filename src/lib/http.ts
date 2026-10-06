import { env } from "./env";

/**
 * CSRF guard for state-changing route handlers that rely on the session cookie.
 * (Server actions get the same Origin check from Next.js.) Browsers always send
 * Origin on cross-site POSTs, so a mismatch or a missing header is refused.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    const o = new URL(origin);
    return o.host === host || o.origin === new URL(env.appUrl).origin;
  } catch {
    return false;
  }
}
