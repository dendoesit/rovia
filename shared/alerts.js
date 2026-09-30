import { DOC_TYPES, CORE_DOCS } from "./domain.js";
import { daysLeft, bucharestToday } from "./dates.js";
import { itpRequirement } from "./itp.js";

/* galben ≤30 zile → portocaliu ≤15 → roșu ≤5 → expirat */
export function dayStatus(d) {
  if (d == null) return "none";
  if (d < 0) return "dead";
  if (d <= 5) return "crit";
  if (d <= 15) return "orange";
  if (d <= 30) return "warn";
  return "ok";
}
export function kmStatus(left) {
  if (left == null) return "none";
  if (left <= 0) return "dead";
  if (left <= 300) return "crit";
  if (left <= 800) return "orange";
  if (left <= 1500) return "warn";
  return "ok";
}
export const WORST = { none: 0, missing: 1, ok: 1, warn: 2, orange: 3, crit: 4, dead: 5 };
export const worst = (...s) => s.reduce((a, b) => ((WORST[b] ?? 0) > (WORST[a] ?? 0) ? b : a), "none");
export const ATT = ["warn", "orange", "crit", "dead"];

export function latestDocs(v) {
  const out = {};
  for (const d of v.documents || []) {
    if (!d.expires) continue;
    if (!out[d.type] || d.expires > out[d.type].expires) out[d.type] = d;
  }
  return out;
}

export const isTrailer = (v) => v.category === "remorca" || v.category === "rulota";
/* ITP-ul nu e cerut încă la vehiculele noi până la termenul primei inspecții */
export function requiredDocs(v, today = bucharestToday()) {
  const base = isTrailer(v) ? ["itp", "rca"] : CORE_DOCS;
  const hasItp = !!latestDocs(v).itp;
  return itpRequirement(v, hasItp, today).required ? base : base.filter((t) => t !== "itp");
}

export function serviceStatus(v, today = bucharestToday()) {
  const kmLeft = v.nextServiceKm && v.km ? v.nextServiceKm - v.km : null;
  const dLeft = v.nextServiceDate ? daysLeft(v.nextServiceDate, today) : null;
  const byKm = kmStatus(kmLeft), byDate = dLeft == null ? "none" : dayStatus(dLeft);
  const status = worst(byKm, byDate);
  const driver = kmLeft != null && (WORST[byKm] >= WORST[byDate]) ? "km" : dLeft != null ? "date" : null;
  return { kmLeft, dLeft, status, driver };
}

export const vehicleName = (v) => `${v.make || ""} ${v.model || ""}`.trim() || v.plate || "Mașină";

/* aceleași alerte în aplicație și în e-mailul zilnic */
export function vehicleAlerts(v, today = bucharestToday()) {
  const out = [];
  const car = vehicleName(v);
  const docs = latestDocs(v);
  for (const [t, d] of Object.entries(docs)) {
    if (!Object.hasOwn(DOC_TYPES, t)) continue;
    const dl = daysLeft(d.expires, today), st = dayStatus(dl);
    if (!ATT.includes(st)) continue;
    const label = DOC_TYPES[t].label;
    out.push({ st, sort: dl, vid: v.id, car, plate: v.plate, kind: "doc", type: t, daysLeft: dl,
      msg: dl < 0 ? `${label} a expirat acum ${zile(dl)}` : dl === 0 ? `${label} expiră AZI` : `${label} expiră în ${zile(dl)}` });
  }
  if (!docs.itp) {
    const req = itpRequirement(v, false, today);
    const st = req.required ? "none" : dayStatus(req.daysLeft);
    if (!req.required && ATT.includes(st))
      out.push({ st, sort: req.daysLeft, vid: v.id, car, plate: v.plate, kind: "doc", type: "itp", daysLeft: req.daysLeft,
        msg: req.daysLeft === 0 ? "prima ITP trebuie făcută AZI" : `prima ITP trebuie făcută în ${zile(req.daysLeft)}` });
  }
  const s = serviceStatus(v, today);
  if (ATT.includes(s.status)) {
    const msg = s.driver === "km"
      ? (s.kmLeft <= 0 ? `service depășit cu ${fmtKm(-s.kmLeft)} km` : `service în ~${fmtKm(s.kmLeft)} km`)
      : (s.dLeft < 0 ? `service depășit din ${v.nextServiceDate}` : `service în ${zile(s.dLeft)}`);
    out.push({ st: s.status, sort: s.driver === "km" ? s.kmLeft / 100 : s.dLeft, vid: v.id, car, plate: v.plate, kind: "service", daysLeft: s.dLeft, kmLeft: s.kmLeft, msg });
  }
  if (v.tyres === "attention") out.push({ st: "warn", sort: 99, vid: v.id, car, plate: v.plate, kind: "tyres", msg: "anvelopele necesită verificare" });
  return out;
}

export const collectAlerts = (vehicles, today = bucharestToday()) =>
  (vehicles || []).flatMap((v) => vehicleAlerts(v, today)).sort((a, b) => WORST[b.st] - WORST[a.st] || a.sort - b.sort);

export const zile = (n) => { const a = Math.abs(n); return a === 1 ? "o zi" : a < 20 ? `${a} zile` : `${a} de zile`; };
export const fmtKm = (n) => (n == null || n === "" ? "—" : Math.round(+n).toLocaleString("ro-RO"));
