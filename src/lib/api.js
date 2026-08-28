/* Stratul de date: API REST pe Netlify Functions + fallback localStorage.
   Sesiune simplă: utilizator + parola comună a echipei (Basic auth).
   În modul local (fără backend), orice parolă e acceptată, iar fiecare
   utilizator are propriul spațiu în localStorage. */

const SESSION = { user: null, pass: null, mode: "local" };

export function setApiSession({ user, pass, mode }) {
  SESSION.user = user; SESSION.pass = pass; SESSION.mode = mode;
}
export function normalizeUser(u) {
  u = String(u || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9ăâîșț._-]/g, "");
  return u.length >= 2 && u.length <= 40 ? u : null;
}
const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const authHeader = () => (SESSION.user ? { Authorization: "Basic " + b64(`${SESSION.user}:${SESSION.pass}`) } : {});

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);

/* ---------- login ---------- */
export async function cloudLogin(user, pass) {
  const nu = normalizeUser(user);
  if (!nu) return { mode: "denied", error: "nume de utilizator invalid (minim 2 caractere: litere, cifre, . _ -)" };
  if (!pass) return { mode: "denied", error: "introdu parola" };
  try {
    const r = await fetch("/api/login", { method: "POST", headers: { Authorization: "Basic " + b64(`${nu}:${pass}`) } });
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return { mode: "local", user: nu }; // nu există backend → mod local
    const j = await r.json().catch(() => null);
    if (r.ok && j?.ok) return { mode: "cloud", user: j.user };
    return { mode: "denied", error: j?.error || "utilizator sau parolă incorecte" };
  } catch {
    return { mode: "local", user: nu };
  }
}

/* ---------- backend local (per utilizator) ---------- */
const lsKey = () => `fleetdeck-vehicles:${SESSION.user || "anon"}`;
function lsRead() {
  try {
    let all = JSON.parse(localStorage.getItem(lsKey()) || "null");
    if (all == null) {
      // adoptă datele din formatul vechi, fără useri (o singură dată)
      const legacy = localStorage.getItem("fleetdeck-vehicles");
      if (legacy) { localStorage.setItem(lsKey(), legacy); localStorage.removeItem("fleetdeck-vehicles"); all = JSON.parse(legacy); }
    }
    return Array.isArray(all) ? all : [];
  } catch { return []; }
}
function lsWrite(all) { localStorage.setItem(lsKey(), JSON.stringify(all)); }

function applyEventLocal(v, { event, patch }) {
  const e = { id: uid(), created: now(), date: event.date || today(), ...event };
  v.events = [...(v.events || []), e];
  if (patch) Object.assign(v, patch);
  if (e.km && +e.km > (v.km || 0)) { v.km = +e.km; v.kmUpdatedAt = now(); }
}

const DOC_LABELS = { itp: "ITP", rca: "RCA", rovinieta: "Rovinietă", casco: "CASCO", warranty: "Garanție", leasing: "Leasing" };

const localApi = {
  mode: "local",
  async list() { return lsRead(); },
  async create(data) {
    const all = lsRead();
    const v = { id: uid(), createdAt: now(), documents: [], events: [], tyres: null, kmUpdatedAt: now(), ...data };
    all.push(v); lsWrite(all); return v;
  },
  async patch(id, fields) {
    const all = lsRead(); const v = all.find((x) => x.id === id);
    if (!v) throw new Error("mașina nu există");
    Object.assign(v, fields); lsWrite(all); return v;
  },
  async remove(id) { lsWrite(lsRead().filter((x) => x.id !== id)); },
  async addEvent(id, payload) {
    const all = lsRead(); const v = all.find((x) => x.id === id);
    if (!v) throw new Error("mașina nu există");
    applyEventLocal(v, payload); lsWrite(all); return v;
  },
  async deleteEvent(id, eid) {
    const all = lsRead(); const v = all.find((x) => x.id === id);
    if (!v) throw new Error("mașina nu există");
    v.events = (v.events || []).filter((e) => e.id !== eid); lsWrite(all); return v;
  },
  async putDocument(id, type, { expires, provider, cost }) {
    const all = lsRead(); const v = all.find((x) => x.id === id);
    if (!v) throw new Error("mașina nu există");
    v.documents = v.documents || [];
    const d = v.documents.find((x) => x.type === type);
    const existed = !!d;
    if (d) { d.expires = expires; if (provider) d.provider = provider; }
    else v.documents.push({ id: uid(), type, expires, provider: provider || null });
    applyEventLocal(v, { event: { kind: "document", type, title: `${DOC_LABELS[type] || type} ${existed ? "reînnoit" : "adăugat"}`, cost: cost || null, note: provider || null } });
    lsWrite(all); return v;
  },
};

/* ---------- backend cloud ---------- */
async function req(method, path, body) {
  const r = await fetch(path, {
    method,
    headers: { ...authHeader(), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    let msg = r.status === 401 ? "sesiune expirată — intră din nou în cont" : "eroare de server (" + r.status + ")";
    try { const j = await r.json(); if (j.error) msg = j.error; } catch { /* noop */ }
    throw new Error(msg);
  }
  return r.status === 204 ? null : r.json();
}

const remoteApi = {
  mode: "cloud",
  list: () => req("GET", "/api/vehicles"),
  create: (d) => req("POST", "/api/vehicles", d),
  patch: (id, f) => req("PATCH", `/api/vehicles/${id}`, f),
  remove: (id) => req("DELETE", `/api/vehicles/${id}`),
  addEvent: (id, p) => req("POST", `/api/vehicles/${id}/events`, p),
  deleteEvent: (id, eid) => req("DELETE", `/api/vehicles/${id}/events/${eid}`),
  putDocument: (id, type, p) => req("PUT", `/api/vehicles/${id}/documents/${type}`, p),
};

/* ---------- inițializare după login ---------- */
export async function initApi(mode) {
  if (mode === "cloud") {
    try {
      const vehicles = await remoteApi.list();
      return { api: remoteApi, vehicles: Array.isArray(vehicles) ? vehicles : [] };
    } catch { /* cade pe local */ }
  }
  return { api: localApi, vehicles: lsRead() };
}
