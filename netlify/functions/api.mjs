/* FleetDeck API — REST peste Netlify Blobs, cu login simplu
   Autentificare: Basic auth (utilizator + parola comună a echipei).
   Parola echipei = env APP_PASSWORD (implicit "fleetdeck" dacă nu e setată).
   Primul login cu un nume nou creează automat garajul gol al acelui user.
   Fiecare user își vede DOAR mașinile lui (chei separate în Blobs).

   POST   /api/login                        — verifică user + parolă → { ok, user }
   GET    /api/vehicles                     — lista mașinilor userului
   POST   /api/vehicles                     — creează (validat, id generat de server)
   GET    /api/vehicles/:id                 — o mașină
   PATCH  /api/vehicles/:id                 — actualizează câmpuri permise
   DELETE /api/vehicles/:id                 — șterge mașina
   POST   /api/vehicles/:id/events          — adaugă eveniment { event, patch? } (atomic)
   DELETE /api/vehicles/:id/events/:eid     — șterge un eveniment
   PUT    /api/vehicles/:id/documents/:type — adaugă/reînnoiește document + istoric (atomic)
   GET    /api/health                       — ping (fără autentificare)
*/
import { getStore } from "@netlify/blobs";

export const config = { path: "/api/*" };

const DOC_LABELS = { itp: "ITP", rca: "RCA", rovinieta: "Rovinietă", casco: "CASCO", warranty: "Garanție", leasing: "Leasing" };
const VEHICLE_FIELDS = ["make", "model", "plate", "year", "fuel", "vin", "km", "kmUpdatedAt", "tyres", "tyresNote", "nextServiceKm", "nextServiceDate"];
const EVENT_KINDS = ["fuel", "maintenance", "expense", "document"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const json = (d, s = 200) => Response.json(d, { status: s });
const err = (m, s = 400) => json({ error: m }, s);
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const pick = (obj, keys) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => keys.includes(k)));

/* ---------- autentificare (simplă, intenționat) ---------- */
function normalizeUser(u) {
  u = String(u || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9ăâîșț._-]/g, "");
  return u.length >= 2 && u.length <= 40 ? u : null;
}
function auth(req) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Basic (.+)$/i);
  if (!m) return null;
  let dec;
  try { dec = Buffer.from(m[1], "base64").toString("utf8"); } catch { return null; }
  const i = dec.indexOf(":");
  if (i < 1) return null;
  const user = normalizeUser(dec.slice(0, i));
  const pass = dec.slice(i + 1);
  const expected = process.env.APP_PASSWORD || "fleetdeck";
  return user && pass === expected ? user : null;
}

/* ---------- stocare: un blob per mașină, în spațiul userului ---------- */
const key = (user, id) => `user:${user}:vehicle:${id}`;
const getV = (store, user, id) => store.get(key(user, id), { type: "json" });
const saveV = (store, user, v) => store.setJSON(key(user, v.id), v);

async function listVehicles(store, user) {
  const { blobs } = await store.list({ prefix: `user:${user}:vehicle:` });
  const out = [];
  for (const b of blobs) {
    const v = await store.get(b.key, { type: "json" });
    if (v) out.push(v);
  }
  return out.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
}

/* migrare din formatele vechi (fără useri) → contul "admin" */
async function migrateLegacy(store) {
  const old = await store.get("state", { type: "json" });
  if (old?.vehicles?.length) {
    for (const v of old.vehicles) {
      v.id ||= uid();
      v.createdAt ||= now();
      await saveV(store, "admin", v);
    }
    await store.delete("state");
  }
  const { blobs } = await store.list({ prefix: "vehicle:" });
  for (const b of blobs) {
    const v = await store.get(b.key, { type: "json" });
    if (v) await store.setJSON(key("admin", v.id || uid()), v);
    await store.delete(b.key);
  }
}

/* ---------- validare ---------- */
function sanitizeEvent(src) {
  if (!src || !EVENT_KINDS.includes(src.kind)) throw new Error("tip de eveniment invalid");
  return {
    id: uid(),
    created: now(),
    date: typeof src.date === "string" && DATE_RE.test(src.date) ? src.date : now().slice(0, 10),
    kind: src.kind,
    type: src.type != null ? String(src.type) : null,
    title: src.title != null ? String(src.title) : null,
    label: src.label != null ? String(src.label) : null,
    cost: src.cost != null && !isNaN(+src.cost) ? +src.cost : null,
    liters: src.liters != null && !isNaN(+src.liters) ? +src.liters : null,
    km: src.km != null && !isNaN(+src.km) ? +src.km : null,
    note: src.note != null ? String(src.note) : null,
    photo: typeof src.photo === "string" && src.photo.startsWith("data:image/") ? src.photo : null,
  };
}
function sanitizeDocs(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((d) => d && DOC_LABELS[d.type] && typeof d.expires === "string" && DATE_RE.test(d.expires))
    .map((d) => ({ id: uid(), type: d.type, expires: d.expires, provider: d.provider ? String(d.provider) : null }));
}
function applyEvent(v, payload) {
  const e = sanitizeEvent(payload?.event);
  v.events = [...(v.events || []), e];
  Object.assign(v, pick(payload?.patch, VEHICLE_FIELDS));
  if (e.km && e.km > (v.km || 0)) { v.km = e.km; v.kmUpdatedAt = now(); }
  return e;
}

/* ---------- router ---------- */
export default async (req) => {
  const store = getStore("fleetdeck");
  const p = new URL(req.url).pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const m = req.method;
  try {
    if (p[0] === "health") return json({ ok: true });

    if (p[0] === "login") {
      if (m !== "POST") return err("metodă nepermisă", 405);
      const user = auth(req);
      return user ? json({ ok: true, user }) : err("utilizator sau parolă incorecte", 401);
    }

    if (p[0] !== "vehicles") return err("rută necunoscută", 404);

    const user = auth(req);
    if (!user) return err("autentificare necesară", 401);

    /* /api/vehicles */
    if (p.length === 1) {
      if (m === "GET") { await migrateLegacy(store); return json(await listVehicles(store, user)); }
      if (m === "POST") {
        const b = await req.json();
        if (!b?.make || !b?.plate) return err("marca și numărul de înmatriculare sunt obligatorii");
        const v = {
          id: uid(), createdAt: now(),
          documents: sanitizeDocs(b.documents),
          events: [], tyres: b.tyres === "good" || b.tyres === "attention" ? b.tyres : null,
          ...pick(b, VEHICLE_FIELDS.filter((f) => f !== "tyres")),
          kmUpdatedAt: now(),
        };
        if (Array.isArray(b.events)) for (const src of b.events) { try { applyEvent(v, { event: src }); } catch { /* ignoră intrările invalide */ } }
        await saveV(store, user, v);
        return json(v, 201);
      }
      return err("metodă nepermisă", 405);
    }

    const id = p[1];
    const v = await getV(store, user, id);
    if (!v) return err("mașina nu există", 404);

    /* /api/vehicles/:id */
    if (p.length === 2) {
      if (m === "GET") return json(v);
      if (m === "PATCH") {
        const b = await req.json();
        Object.assign(v, pick(b, VEHICLE_FIELDS));
        await saveV(store, user, v);
        return json(v);
      }
      if (m === "DELETE") { await store.delete(key(user, id)); return new Response(null, { status: 204 }); }
      return err("metodă nepermisă", 405);
    }

    /* /api/vehicles/:id/events[/:eid] */
    if (p[2] === "events") {
      if (m === "POST" && p.length === 3) {
        applyEvent(v, await req.json());
        await saveV(store, user, v);
        return json(v, 201);
      }
      if (m === "DELETE" && p.length === 4) {
        v.events = (v.events || []).filter((e) => e.id !== p[3]);
        await saveV(store, user, v);
        return json(v);
      }
      return err("metodă nepermisă", 405);
    }

    /* /api/vehicles/:id/documents/:type */
    if (p[2] === "documents" && p.length === 4 && m === "PUT") {
      const type = p[3];
      if (!DOC_LABELS[type]) return err("tip de document necunoscut");
      const b = await req.json();
      if (!b?.expires || !DATE_RE.test(b.expires)) return err("data de expirare (AAAA-LL-ZZ) este obligatorie");
      v.documents = v.documents || [];
      const d = v.documents.find((x) => x.type === type);
      const existed = !!d;
      if (d) { d.expires = b.expires; if (b.provider) d.provider = String(b.provider); }
      else v.documents.push({ id: uid(), type, expires: b.expires, provider: b.provider ? String(b.provider) : null });
      applyEvent(v, {
        event: {
          kind: "document", type,
          title: `${DOC_LABELS[type]} ${existed ? "reînnoit" : "adăugat"}`,
          cost: b.cost != null && !isNaN(+b.cost) ? +b.cost : null,
          note: b.provider || null,
        },
      });
      await saveV(store, user, v);
      return json(v);
    }

    return err("rută necunoscută", 404);
  } catch (e) {
    return err(e.message || "eroare internă", 500);
  }
};
