import { createHash } from "node:crypto";
import { fail } from "./http.mjs";

const RETRIES = 6;
export const hashKey = (s) => createHash("sha256").update(String(s)).digest("hex");
export const clientIp = (req) => req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";

/* numără o încercare într-o fereastră de timp; cererile paralele nu pot depăși limita (scriere condiționată) */
export async function consume(store, key, { limit, windowMs, message }) {
  for (let i = 0; i < RETRIES; i++) {
    const cur = await store.getWithMetadata(key, { type: "json" });
    const now = Date.now();
    const state = cur?.data && cur.data.resetAt > now ? cur.data : { count: 0, resetAt: now + windowMs };
    if (state.count >= limit) {
      const minutes = Math.max(1, Math.ceil((state.resetAt - now) / 60_000));
      fail(429, message ? message(minutes) : `prea multe încercări — mai încearcă peste ${minutes} min`);
    }
    const next = { count: state.count + 1, resetAt: state.resetAt };
    const write = await store.setJSON(key, next, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (write?.modified !== false) return next.count;
  }
  fail(429, "prea multe cereri simultane — încearcă din nou");
}

export const release = (store, key) => store.delete(key);

/* o singură acțiune într-un interval (ex. un e-mail de resetare la 10 minute) */
export async function cooldown(store, key, ms) {
  const cur = await store.getWithMetadata(key, { type: "json" });
  if (cur?.data?.until > Date.now()) return false;
  const write = await store.setJSON(key, { until: Date.now() + ms }, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
  return write?.modified !== false;
}
