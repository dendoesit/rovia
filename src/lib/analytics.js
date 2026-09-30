/* Cheltuielile înregistrate și estimările stau mereu separat: nicio estimare nu intră într-un total cheltuit. */
import { MAINT_TYPES, fuelEstimate, fuelConsumption, odometerReadings, attentionItems, todayStr, currencySymbol } from "./model.js";
import { addDaysTo, addMonthsTo, daysBetween } from "../../shared/dates.js";
import { vehicleName } from "../../shared/alerts.js";

export const COST_KEYS = ["fuel", "maintenance", "document", "expense"];
export const COST_LABELS = { fuel: "Combustibil", maintenance: "Mentenanță", document: "Documente", expense: "Alte cheltuieli" };

export const PERIODS = [
  { id: "year", label: "Anul curent" },
  { id: "12m", label: "Ultimele 12 luni" },
  { id: "all", label: "Tot istoricul" },
];

const LUNI = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "noi", "dec"];
const LUNI_LUNG = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];

const sum = (xs) => xs.reduce((s, x) => s + x, 0);
const round2 = (n) => Math.round(n * 100) / 100;
const roundTo100 = (n) => Math.round(n / 100) * 100;
const zeroCats = () => ({ fuel: 0, maintenance: 0, document: 0, expense: 0 });
const monthStart = (ds) => `${ds.slice(0, 7)}-01`;
const monthEnd = (ds) => addDaysTo(addMonthsTo(monthStart(ds), 1), -1);
const byName = (a, b) => a.name.localeCompare(b.name, "ro");

/* ---------- perioade ---------- */
export function periodRange(id, today = todayStr()) {
  if (id === "all") return { id: "all", from: null, to: null };
  if (id === "12m") return { id: "12m", from: addMonthsTo(monthStart(today), -11), to: monthEnd(today) };
  const y = today.slice(0, 4);
  return { id: "year", from: `${y}-01-01`, to: `${y}-12-31` };
}
export const inRange = (date, r) => !!date && (!r.from || date >= r.from) && (!r.to || date <= r.to);

export function periodPhrase(range) {
  if (range.id === "year") return `în ${range.from.slice(0, 4)}`;
  if (range.id === "12m") return "în ultimele 12 luni";
  return "de la început";
}
export const spentTitle = (range) => `Cheltuit ${periodPhrase(range)}`;

/* ---------- cheltuieli înregistrate ---------- */
export const costOf = (e) => (+e.cost > 0 ? +e.cost : 0);
export const costCategory = (e) => (COST_KEYS.includes(e.kind) ? e.kind : "expense");
const paidEvents = (vehicles, range) =>
  vehicles.flatMap((v) => (v.events || []).filter((e) => costOf(e) && inRange(e.date, range)));

export function spending(vehicles, range) {
  const cats = zeroCats();
  const evts = paidEvents(vehicles, range);
  for (const e of evts) cats[costCategory(e)] += costOf(e);
  for (const k of COST_KEYS) cats[k] = round2(cats[k]);
  return { total: round2(sum(Object.values(cats))), cats, count: evts.length };
}
export const carSpending = (v, range) => spending([v], range);

const monthBucket = (key) => {
  const y = +key.slice(0, 4), m = +key.slice(5, 7) - 1;
  return { key, label: LUNI[m], group: y, long: `${LUNI_LUNG[m]} ${y}` };
};
const yearBucket = (y) => ({ key: String(y), label: String(y), long: String(y) });

/* pe luni; „tot istoricul” mai lung de 2 ani trece pe ani ca graficul să rămână lizibil pe telefon */
export function spendingSeries(vehicles, range, today = todayStr()) {
  const evts = paidEvents(vehicles, range);
  let { from, to } = range;
  if (!from) {
    const dates = evts.map((e) => e.date).sort();
    from = monthStart(dates[0] && dates[0] < today ? dates[0] : today);
    to = monthEnd(dates.at(-1) && dates.at(-1) > today ? dates.at(-1) : today);
  }
  const months = [];
  for (let m = monthStart(from); m <= to; m = addMonthsTo(m, 1)) months.push(m.slice(0, 7));
  const unit = months.length > 24 ? "year" : "month";
  const shells = unit === "month"
    ? months.map(monthBucket)
    : Array.from({ length: +to.slice(0, 4) - +from.slice(0, 4) + 1 }, (_, i) => yearBucket(+from.slice(0, 4) + i));
  const buckets = shells.map((b) => ({ ...b, values: zeroCats(), total: 0 }));
  const index = new Map(buckets.map((b) => [b.key, b]));
  for (const e of evts) {
    const b = index.get(unit === "month" ? e.date.slice(0, 7) : e.date.slice(0, 4));
    if (!b) continue;
    b.values[costCategory(e)] += costOf(e);
    b.total += costOf(e);
  }
  for (const b of buckets) {
    b.total = round2(b.total);
    for (const k of COST_KEYS) b.values[k] = round2(b.values[k]);
  }
  const caption = buckets.length > 1 ? `${buckets[0].long} – ${buckets.at(-1).long}` : buckets[0].long;
  return { unit, buckets, caption };
}

/* ---------- reparații (toate lucrările de mentenanță) ---------- */
export function repairs(v, range) {
  const byType = {};
  let count = 0, cost = 0;
  for (const e of v.events || []) {
    if (e.kind !== "maintenance" || !inRange(e.date, range)) continue;
    const type = Object.hasOwn(MAINT_TYPES, e.type || "") ? e.type : "other";
    const t = (byType[type] ||= { type, label: MAINT_TYPES[type]?.label || "Altă lucrare", icon: MAINT_TYPES[type]?.icon || "🛠️", count: 0, cost: 0 });
    t.count++; t.cost += costOf(e);
    count++; cost += costOf(e);
  }
  const types = Object.values(byType).map((t) => ({ ...t, cost: round2(t.cost) }))
    .sort((a, b) => b.cost - a.cost || b.count - a.count || a.label.localeCompare(b.label, "ro"));
  return { count, cost: round2(cost), byType: types };
}

export function lastService(v) {
  return (v.events || []).filter((e) => e.kind === "maintenance" && e.type === "service" && e.date)
    .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

/* ---------- kilometraj ---------- */
export { odometerReadings };

/* o citire mai mică decât una anterioară e o greșeală de tastare: o sărim, ca km împărțiți să nu depășească ce arată bordul */
function risingReadings(v) {
  let top = -Infinity;
  return odometerReadings(v).filter((p) => {
    if (p.km < top) return false;
    top = p.km;
    return true;
  });
}

/* aceleași praguri ca kmPerYear din model.js, ca km/an afișați să fie cei folosiți la estimarea combustibilului */
export function readingsRate(v) {
  const pts = odometerReadings(v);
  if (pts.length < 2) return null;
  const first = pts[0], last = pts.at(-1);
  const km = last.km - first.km, days = daysBetween(first.date, last.date);
  if (km < 1000 || days < 60) return null;
  return { kmAn: Math.round((km / days) * 365), km, from: first.date, to: last.date };
}

export function lifetimeKm(v, today = todayStr()) {
  const since = +v.year, km = +v.km;
  if (!since || !(km > 0)) return null;
  const days = Math.max(180, daysBetween(`${since}-07-01`, today));
  return { since, km, years: days / 365, kmAn: Math.round((km / days) * 365) };
}

export function kmRate(v, today = todayStr()) {
  const r = readingsRate(v);
  if (r) return { kmAn: r.kmAn, source: "readings" };
  const l = lifetimeKm(v, today);
  return l && { kmAn: l.kmAn, source: "modelYear" };
}

/* km parcurși pe an calendaristic, împărțind fiecare interval dintre două citiri proporțional cu zilele */
export function kmByYear(v) {
  const pts = risingReadings(v);
  const years = new Map();
  const add = (y, km, days) => {
    const cur = years.get(y) || { km: 0, days: 0 };
    years.set(y, { km: cur.km + km, days: cur.days + days });
  };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const km = b.km - a.km, days = daysBetween(a.date, b.date);
    if (km <= 0) continue;
    if (days === 0) { add(+a.date.slice(0, 4), km, 0); continue; }
    for (let y = +a.date.slice(0, 4); y <= +b.date.slice(0, 4); y++) {
      const start = a.date > `${y}-01-01` ? a.date : `${y}-01-01`;
      const end = b.date < `${y + 1}-01-01` ? b.date : `${y + 1}-01-01`;
      const d = daysBetween(start, end);
      if (d > 0) add(y, (km * d) / days, d);
    }
  }
  return [...years.entries()].sort((a, b) => a[0] - b[0]).map(([year, { km, days }]) => ({
    year, km: Math.round(km), days, partial: days < daysBetween(`${year}-01-01`, `${year + 1}-01-01`),
  }));
}

export const kmYearBuckets = (rows) => rows.map((r) => ({
  key: String(r.year), label: r.partial ? `${r.year}*` : String(r.year),
  long: r.partial ? `${r.year} (parțial, ${countOf(r.days, "zi", "zile")})` : String(r.year),
  values: { km: r.km }, total: r.km,
}));

/* Referință pentru autoturisme și utilitare ușoare: o mașină nouă face ~22.000 km/an, apoi tot mai puțin */
export const TYPICAL_KM_BANDS = [
  { upTo: 3, kmAn: 22000, label: "în primii 3 ani" },
  { upTo: 7, kmAn: 17000, label: "între 4 și 7 ani" },
  { upTo: 12, kmAn: 13000, label: "între 8 și 12 ani" },
  { upTo: Infinity, kmAn: 10000, label: "după 12 ani" },
];
export const hasTypicalKm = (v) => !v.category || v.category === "autoturism" || v.category === "utilitara";
export const typicalKmAt = (years) => TYPICAL_KM_BANDS.find((b) => years < b.upTo).kmAn;

export function typicalKmTotal(years) {
  let total = 0, prev = 0;
  for (const b of TYPICAL_KM_BANDS) {
    total += Math.max(0, Math.min(years, b.upTo) - prev) * b.kmAn;
    if (years <= b.upTo) break;
    prev = b.upTo;
  }
  return total;
}

export function kmComparison(v, today = todayStr()) {
  const life = lifetimeKm(v, today);
  if (!life) return null;
  const comparable = hasTypicalKm(v) && life.years >= 1;
  const expected = comparable ? typicalKmTotal(life.years) : null;
  const ratio = comparable ? life.km / expected : null;
  return {
    ...life,
    expectedTotal: comparable ? roundTo100(expected) : null,
    expectedKmAn: comparable ? roundTo100(expected / life.years) : null,
    typicalNow: hasTypicalKm(v) ? typicalKmAt(life.years) : null,
    ratio,
    phrase: ratio == null ? null : kmRatioPhrase(ratio),
  };
}

/* ---------- combustibil (estimare, niciodată adunată la cheltuieli) ---------- */
export function fuelOutlook(v) {
  if (v.category === "remorca") return null;
  const fe = fuelEstimate(v);
  if (!fe) return null;
  const measured = fuelConsumption(v);
  return {
    ...fe,
    kmSource: readingsRate(v) ? "readings" : "modelYear",
    pricePaid: !!measured?.pricePerLiter,
    fuelKnown: !!v.fuel,
    fuel: v.fuel || null,
  };
}

/* ---------- cost pe km: doar cheltuielile din intervalul acoperit de citiri ---------- */
function odometerAt(pts, date) {
  if (date <= pts[0].date) return pts[0].km;
  if (date >= pts.at(-1).date) return pts.at(-1).km;
  const i = pts.findIndex((p) => p.date > date);
  const a = pts[i - 1], b = pts[i];
  return a.km + ((b.km - a.km) * daysBetween(a.date, date)) / daysBetween(a.date, b.date);
}

export function costPerKm(v, range) {
  const pts = risingReadings(v);
  if (pts.length < 2) return null;
  const from = range.from && range.from > pts[0].date ? range.from : pts[0].date;
  const to = range.to && range.to < pts.at(-1).date ? range.to : pts.at(-1).date;
  if (from >= to) return null;
  const km = Math.round(odometerAt(pts, to) - odometerAt(pts, from));
  if (km < 500) return null;
  const startsAtReading = from === pts[0].date;
  const cost = round2(sum((v.events || [])
    .filter((e) => e.date && (startsAtReading ? e.date > from : e.date >= from) && e.date <= to)
    .map(costOf)));
  return cost > 0 ? { perKm: cost / km, km, cost, from, to } : null;
}

/* ---------- clasamente ---------- */
const carRef = (v) => ({ id: v.id, name: vehicleName(v), plate: v.plate || "", year: v.year || null });

export const topByCost = (vehicles, range, n = 5) =>
  vehicles.map((v) => ({ ...carRef(v), ...carSpending(v, range) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total || byName(a, b))
    .slice(0, n);

export const topFuel = (vehicles, n = 5) =>
  vehicles.map((v) => ({ ...carRef(v), fuel: fuelOutlook(v) }))
    .filter((r) => r.fuel)
    .sort((a, b) => b.fuel.costYear - a.fuel.costYear || byName(a, b))
    .slice(0, n);

export const topRepairs = (vehicles, range, n = 5) =>
  vehicles.map((v) => ({ ...carRef(v), ...repairs(v, range) }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || b.cost - a.cost || byName(a, b))
    .slice(0, n);

export const kmRows = (vehicles, today = todayStr()) =>
  vehicles.map((v) => {
    const cmp = kmComparison(v, today);
    const rate = kmRate(v, today);
    return { ...carRef(v), cmp, rate, kmAn: cmp?.kmAn ?? rate?.kmAn ?? null };
  })
    .filter((r) => r.kmAn != null)
    .sort((a, b) => b.kmAn - a.kmAn || byName(a, b));

export const dominantCategory = (cats) => {
  const [key, value] = Object.entries(cats).sort((a, b) => b[1] - a[1])[0] || [];
  return value > 0 ? key : null;
};

/* ---------- rezumate pentru pagini ---------- */
export function fleetSummary(vehicles, periodId, today = todayStr()) {
  const range = periodRange(periodId, today);
  const rates = vehicles.map((v) => kmRate(v, today)).filter(Boolean);
  const fuel = vehicles.map(fuelOutlook).filter(Boolean);
  const perKmParts = vehicles.map((v) => costPerKm(v, range)).filter(Boolean);
  const km = sum(perKmParts.map((p) => p.km)), cost = sum(perKmParts.map((p) => p.cost));
  return {
    range,
    count: vehicles.length,
    spent: spending(vehicles, range),
    series: spendingSeries(vehicles, range, today),
    kmAn: { total: sum(rates.map((r) => r.kmAn)), cars: rates.length },
    fuelYear: { total: sum(fuel.map((f) => f.costYear)), cars: fuel.length, real: fuel.filter((f) => f.real).length },
    perKm: km ? { perKm: cost / km, km, cost, cars: perKmParts.length } : null,
    attention: vehicles.filter((v) => attentionItems(v).length).length,
    top: { cost: topByCost(vehicles, range), fuel: topFuel(vehicles), repairs: topRepairs(vehicles, range) },
    km: kmRows(vehicles, today),
  };
}

export function carSummary(v, periodId, today = todayStr()) {
  const range = periodRange(periodId, today);
  return {
    range,
    spent: carSpending(v, range),
    series: spendingSeries([v], range, today),
    repairs: repairs(v, range),
    perKm: costPerKm(v, range),
    km: kmComparison(v, today),
    rate: readingsRate(v),
    byYear: kmByYear(v),
    fuel: fuelOutlook(v),
    lastService: lastService(v),
  };
}

/* ---------- text ---------- */
export const fmtDecimal = (n, digits = 1) =>
  (+n).toLocaleString("ro-RO", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtRatio = (r) => (+r).toLocaleString("ro-RO", { maximumFractionDigits: 1 });

export function countOf(n, one, many) {
  if (n === 1) return `1 ${one}`;
  const withDe = n % 100 >= 20 || (n >= 100 && n % 100 === 0);
  return `${n.toLocaleString("ro-RO")} ${withDe ? "de " : ""}${many}`;
}
export const aniText = (years) => {
  if (years < 1) return "sub un an";
  const n = Math.round(years);
  return n === 1 ? "un an" : countOf(n, "an", "ani");
};
export const inAniText = (years) => {
  if (years < 1) return "în mai puțin de un an";
  const n = Math.round(years);
  return n === 1 ? "într-un an" : `în ${countOf(n, "an", "ani")}`;
};

/* sub 1 pe km păstrăm două cifre semnificative, ca 0,0042 să nu apară drept 0 */
export function fmtPerKm(perKm) {
  const n = (+perKm).toLocaleString("ro-RO", perKm < 1 ? { maximumSignificantDigits: 2 } : { maximumFractionDigits: 2 });
  const sym = currencySymbol();
  return sym === "€" ? `€${n}/km` : `${n} ${sym}/km`;
}

export function kmRatioPhrase(ratio) {
  const pct = (x) => Math.round(x * 100);
  if (ratio >= 1.5) return `de ${fmtRatio(ratio)}× mai mult decât media pentru vârsta ei`;
  if (ratio > 1.15) return `cu ${pct(ratio - 1)}% peste media pentru vârsta ei`;
  if (ratio >= 0.85) return "în linie cu media pentru vârsta ei";
  if (ratio > 0.5) return `cu ${pct(1 - ratio)}% sub media pentru vârsta ei`;
  return `de ${fmtRatio(1 / ratio)}× mai puțin decât media pentru vârsta ei`;
}

export const typicalKmNote = () =>
  "Referință pentru autoturisme și utilitare ușoare: " +
  TYPICAL_KM_BANDS.map((b) => `~${b.kmAn.toLocaleString("ro-RO")} km/an ${b.label}`).join(", ") +
  ". Vârsta se socotește de la mijlocul anului de fabricație.";
