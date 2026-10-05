/** Next can normalize request.url to localhost while Host keeps the address used by the browser. */
export function origemPermitida(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const internal = new URL(request.url);
  const host = request.headers.get("host") || internal.host;
  // Vercel terminates HTTPS before forwarding to the application.
  const protocol = request.headers.get("x-forwarded-proto") === "https" ? "https:" : internal.protocol;
  try { return origin === new URL(`${protocol}//${host}`).origin; }
  catch { return false; }
}
