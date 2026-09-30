export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });

export const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };

export async function readJson(req, maxBytes = 1_000_000) {
  if (!(req.headers.get("content-type") || "").includes("application/json")) fail(415, "format invalid — trimite JSON");
  const raw = await req.text();
  if (raw.length > maxBytes) fail(413, "cerere prea mare");
  try { return raw ? JSON.parse(raw) : {}; } catch { fail(400, "JSON invalid"); }
}

export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.get("cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function cookie(name, value, { maxAge, secure = true } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (secure) parts.push("Secure");
  if (maxAge != null) parts.push(`Max-Age=${maxAge}`);
  return parts.join("; ");
}

export function assertSameOrigin(req) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) fail(403, "origine nepermisă");
}
