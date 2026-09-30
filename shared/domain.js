import { EURO_CLASSES, VIGNETTE_CATEGORIES } from "./renewals.js";
import { USAGES } from "./itp.js";

export const DOC_TYPES = {
  itp:       { label: "ITP",       icon: "🔍" },
  rca:       { label: "RCA",       icon: "🛡️" },
  rovinieta: { label: "Rovinietă", icon: "🛣️", feminine: true },
  casco:     { label: "CASCO",     icon: "☂️" },
  warranty:  { label: "Garanție",  icon: "📜", feminine: true },
  leasing:   { label: "Leasing",   icon: "🏦" },
};
export const CORE_DOCS = ["itp", "rca", "rovinieta"];
export const docLabel = (type) => DOC_TYPES[type]?.label || type;

export const MAINT_TYPES = {
  service:    { label: "Revizie / schimb ulei", icon: "🔧" },
  distributie:{ label: "Distribuție",           icon: "⚙️" },
  ambreiaj:   { label: "Ambreiaj",              icon: "🦶" },
  brakes:     { label: "Frâne",                 icon: "🛑" },
  tyres:      { label: "Anvelope",              icon: "🛞" },
  battery:    { label: "Baterie",               icon: "🔋" },
  repair:     { label: "Reparație",             icon: "🛠️" },
};

export const FUELS = ["Benzină", "Motorină", "Hibrid", "Hibrid plug-in", "Electric", "GPL"];

export const CATEGORIES = {
  autoturism: "Autoturism",
  utilitara:  "Utilitară",
  camion:     "Camion",
  microbuz:   "Microbuz / autocar",
  remorca:    "Remorcă",
  rulota:     "Rulotă tractată",
  moto:       "Motocicletă",
};

export const EVENT_KINDS = ["fuel", "maintenance", "expense", "document", "odometer"];

export const ACCOUNT_KINDS = { personal: "Personal", company: "Firmă" };

/* medii naționale la pompă, cu TVA, 30.09.2026 (Monitorul Prețurilor ANPC via pretcarburant.ro; confirmate de EC Weekly Oil Bulletin);
   electric = amestec de încărcare acasă (~1,30 lei/kWh) și publică (AC ~2,00, DC ~2,50); EUR la cursul BNR 5,2785 */
export const FUEL_PRICES_AS_OF = "30.09.2026";
export const FUEL_PRICES_SOURCE = "media națională la pompă (Monitorul Prețurilor ANPC)";
export const CURRENCIES = {
  RON: { symbol: "lei", fuelPrice: { "Benzină": 10.03, "Motorină": 10.95, "GPL": 4.71, "Hibrid": 10.03, "Hibrid plug-in": 10.03, "Electric": 1.8 } },
  EUR: { symbol: "€",   fuelPrice: { "Benzină": 1.9, "Motorină": 2.07, "GPL": 0.89, "Hibrid": 1.9, "Hibrid plug-in": 1.9, "Electric": 0.34 } },
};
export const DEFAULT_CURRENCY = "RON";

export const FUEL_CONSUMPTION = { "Benzină": 7.5, "Motorină": 6.5, "GPL": 9.5, "Hibrid": 5.0, "Hibrid plug-in": 6.0, "Electric": 17 };

export const VEHICLE_FIELDS = [
  "make", "model", "plate", "year", "fuel", "category", "driver", "vin",
  "km", "kmUpdatedAt", "tyres", "tyresNote", "nextServiceKm", "nextServiceDate", "notes",
  "euroClass", "vignetteCategory", "civ",
  "firstRegistration", "newAtRegistration", "usage",
];

export class ValidationError extends Error {
  constructor(message) { super(message); this.name = "ValidationError"; }
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (e) => {
  const s = String(e || "").trim().toLowerCase();
  return EMAIL_RE.test(s) && s.length <= 254 ? s : null;
};
export const normalizeLegacyUser = (u) => {
  const s = String(u || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9ăâîșț._-]/g, "");
  return s.length >= 2 && s.length <= 40 ? s : null;
};
export const normalizePlate = (p) => String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const toNumber = (x) => (x == null || x === "" || isNaN(+x) ? null : +x);
const toText = (x, max = 500) => (x == null || x === "" ? null : String(x).slice(0, max));

export function sanitizeEvent(src, { id, created, today }) {
  if (!src || !EVENT_KINDS.includes(src.kind)) throw new ValidationError("tip de eveniment invalid");
  return {
    id,
    created,
    date: typeof src.date === "string" && DATE_RE.test(src.date) ? src.date : today,
    kind: src.kind,
    type: toText(src.type, 40),
    title: toText(src.title, 120),
    label: toText(src.label, 120),
    cost: toNumber(src.cost),
    liters: toNumber(src.liters),
    km: toNumber(src.km),
    note: toText(src.note, 1000),
    hasPhoto: !!src.hasPhoto,
  };
}

export function sanitizeVehicleFields(src) {
  const out = {};
  for (const k of VEHICLE_FIELDS) {
    if (!(k in (src || {}))) continue;
    const val = src[k];
    if (["km", "nextServiceKm"].includes(k)) out[k] = toNumber(val);
    else if (k === "year") out[k] = toNumber(val) && +val >= 1950 && +val <= 2100 ? String(Math.round(+val)) : null;
    else if (k === "tyres") out[k] = val === "good" || val === "attention" ? val : null;
    else if (k === "category") out[k] = CATEGORIES[val] ? val : null;
    else if (k === "fuel") out[k] = FUELS.includes(val) ? val : null;
    else if (k === "nextServiceDate") out[k] = typeof val === "string" && DATE_RE.test(val) ? val : null;
    else if (k === "plate") out[k] = toText(val, 20)?.toUpperCase() ?? null;
    else if (k === "vin") out[k] = toText(val, 17)?.toUpperCase() ?? null;
    else if (k === "notes") out[k] = toText(val, 1000);
    else if (k === "euroClass") out[k] = EURO_CLASSES[val] ? val : null;
    else if (k === "vignetteCategory") out[k] = VIGNETTE_CATEGORIES[val] ? val : null;
    else if (k === "civ") out[k] = toText(val, 20)?.toUpperCase() ?? null;
    else if (k === "firstRegistration") out[k] = typeof val === "string" && DATE_RE.test(val) ? val : null;
    else if (k === "newAtRegistration") out[k] = val === true || val === false ? val : null;
    else if (k === "usage") out[k] = USAGES[val] ? val : null;
    else out[k] = toText(val, 120);
  }
  return out;
}

export function sanitizeDocument(d) {
  if (!d || !DOC_TYPES[d.type] || typeof d.expires !== "string" || !DATE_RE.test(d.expires)) return null;
  return { type: d.type, expires: d.expires, provider: toText(d.provider, 120) };
}

/* un eveniment poate actualiza doar starea care decurge din el — nu marca, numărul sau alte date ale mașinii */
const EVENT_PATCH_FIELDS = ["km", "kmUpdatedAt", "nextServiceKm", "nextServiceDate", "tyres", "tyresNote"];

export function applyEvent(v, { event, patch } = {}, ctx) {
  const e = sanitizeEvent(event, ctx);
  v.events = [...(v.events || []), e];
  const allowed = Object.fromEntries(Object.entries(patch || {}).filter(([k]) => EVENT_PATCH_FIELDS.includes(k)));
  Object.assign(v, sanitizeVehicleFields(allowed));
  if (e.km && e.km > (v.km || 0)) {
    v.km = e.km;
    v.kmUpdatedAt = e.date < ctx.today ? `${e.date}T12:00:00.000Z` : ctx.created;
  }
  return e;
}

/* același eveniment: același tip și zi, iar orice câmp completat în ambele părți coincide */
export function sameEvent(a, b) {
  if (a.kind !== b.kind || a.date !== b.date) return false;
  return ["type", "km", "cost", "liters", "label"].every((k) => a[k] == null || b[k] == null || a[k] === b[k]);
}

export function putDocument(v, type, { expires, provider, cost }, ctx) {
  const doc = sanitizeDocument({ type, expires, provider });
  if (!doc) throw new ValidationError("data de expirare (AAAA-LL-ZZ) este obligatorie");
  v.documents = v.documents || [];
  const existing = v.documents.find((x) => x.type === type);
  if (existing) { existing.expires = doc.expires; if (provider !== undefined) existing.provider = doc.provider; }
  else v.documents.push({ id: ctx.newId(), ...doc });
  return applyEvent(v, {
    event: { kind: "document", type, title: `${docLabel(type)} ${existing ? "reînnoit" : "adăugat"}${DOC_TYPES[type].feminine ? "ă" : ""}`, cost, note: doc.provider, hasPhoto: ctx.hasPhoto },
  }, ctx);
}
