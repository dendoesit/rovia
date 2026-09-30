/* FleetDeck — model & logică pură (fără DOM). Constantele și regulile comune cu serverul stau în /shared. */
import { DOC_TYPES, CORE_DOCS, MAINT_TYPES, FUELS, CATEGORIES, CURRENCIES, DEFAULT_CURRENCY, FUEL_CONSUMPTION, DATE_RE, normalizePlate } from "../../shared/domain.js";
import { bucharestToday, daysLeft as daysLeftFrom, addDaysTo, addMonthsTo, daysBetween, monthKey } from "../../shared/dates.js";
import { dayStatus, kmStatus, WORST, worst, ATT, latestDocs, collectAlerts, serviceStatus, requiredDocs, vehicleName, zile, fmtKm } from "../../shared/alerts.js";
import { itpInterval, itpRequirement, firstItpDue, USAGES } from "../../shared/itp.js";
import { vignetteQuote } from "../../shared/renewals.js";

export { USAGES, itpRequirement, firstItpDue };
export { DOC_TYPES, CORE_DOCS, MAINT_TYPES, FUELS, CATEGORIES, normalizePlate, dayStatus, kmStatus, WORST, worst, ATT, latestDocs, collectAlerts, requiredDocs, vehicleName, zile, fmtKm };
export const KIND_ICON = { fuel: "⛽", expense: "💶", document: "📄", odometer: "📍" };

export const EXPENSE_TYPES = {
  spalatorie: { label: "Spălătorie",   icon: "🧽" },
  parcare:    { label: "Parcare",      icon: "🅿️" },
  amenda:     { label: "Amendă",       icon: "👮" },
  taxa:       { label: "Taxă de drum", icon: "🌉" },
  accesorii:  { label: "Accesorii",    icon: "🧰" },
  altele:     { label: "Altele",       icon: "💶" },
};

/* ---------- monedă (setată din profilul contului) ---------- */
let currency = DEFAULT_CURRENCY;
export const setCurrency = (code) => { currency = CURRENCIES[code] ? code : DEFAULT_CURRENCY; };
export const currencySymbol = () => CURRENCIES[currency].symbol;
export const currencyCode = () => currency;
export function fmtMoney(n) {
  const v = +n || 0;
  const s = v.toLocaleString("ro-RO", { maximumFractionDigits: v % 1 ? 2 : 0 });
  return currency === "EUR" ? `€${s}` : `${s} lei`;
}
export const fmtQty = (n) => (+n).toLocaleString("ro-RO", { maximumFractionDigits: 2 });
/* prețurile de referință pot fi suprascrise din profil (prețul plătit de firmă), în moneda contului */
let fuelOverrides = {};
export const setFuelPrices = (prices) => { fuelOverrides = prices && typeof prices === "object" ? prices : {}; };
export const referenceFuelPrice = (fuel) => CURRENCIES[currency].fuelPrice[fuel];
const priceKey = (fuel) => (fuel === "Hibrid" || fuel === "Hibrid plug-in" ? "Benzină" : fuel);
export const FUEL_PRICE = new Proxy({}, { get: (_, fuel) => (+fuelOverrides[priceKey(fuel)] > 0 ? +fuelOverrides[priceKey(fuel)] : CURRENCIES[currency].fuelPrice[fuel]) });
export const FUEL_CONS = FUEL_CONSUMPTION;

/* ---------- date (ora României) ---------- */
export const todayStr = () => bucharestToday();
export const daysLeft = (ds) => daysLeftFrom(ds, todayStr());
export const addDays = (n, from = todayStr()) => addDaysTo(from, n);
export const addMonths = (n, from = todayStr()) => addMonthsTo(from, n);

const LUNI = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "noi", "dec"];
export function fmtDate(ds) {
  if (!ds) return "—";
  const [y, m, d] = ds.slice(0, 10).split("-").map(Number);
  return `${d} ${LUNI[m - 1]}${y !== +todayStr().slice(0, 4) ? ` ${y}` : ""}`;
}
export function dateLabel(ds) {
  if (ds === todayStr()) return "Azi";
  if (ds === addDays(-1)) return "Ieri";
  return fmtDate(ds);
}
export function relTime(iso) {
  if (!iso) return "—";
  const d = daysBetween(bucharestToday(new Date(iso)), todayStr());
  if (d <= 0) return "azi";
  if (d === 1) return "ieri";
  if (d < 30) return `acum ${zile(d)}`;
  return fmtDate(bucharestToday(new Date(iso)));
}

/* ---------- stare mașină ---------- */
export function healthItems(v) {
  const items = [];
  const s = serviceStatus(v, todayStr());
  const rec = serviceIntervalFor(v);
  let sVal = "Nesetat", sSub = `Recomandat: ${fmtKm(rec.km)} km / ${rec.months} luni`;
  if (s.driver === "km") {
    sVal = s.kmLeft <= 0 ? "Depășit" : `~${fmtKm(s.kmLeft)} km`;
    sSub = `la ${fmtKm(v.nextServiceKm)} km${v.nextServiceDate ? ` · ${fmtDate(v.nextServiceDate)}` : ""}`;
  } else if (s.driver === "date") {
    sVal = s.dLeft < 0 ? "Depășit" : zile(s.dLeft);
    sSub = `${fmtDate(v.nextServiceDate)}${s.kmLeft != null ? ` · ~${fmtKm(s.kmLeft)} km rămași` : ""}`;
  }
  items.push({ icon: "🔧", label: "Următorul service", value: sVal, sub: sSub, status: s.status, action: { kind: "service" } });

  const docs = latestDocs(v);
  const required = requiredDocs(v);
  const itp = docs.itp ? null : itpRequirement(v, false, todayStr());
  if (itp && !itp.required) {
    items.push({
      icon: DOC_TYPES.itp.icon, label: DOC_TYPES.itp.label, value: "Nu e necesar încă",
      sub: `prima ITP până la ${fmtDate(itp.dueBy)}${itp.estimated ? " (estimat din anul fabricației)" : ""}`,
      status: dayStatus(itp.daysLeft) === "ok" ? "ok" : dayStatus(itp.daysLeft), action: { kind: "doc", type: "itp" },
    });
  }
  for (const t of [...new Set([...required, ...Object.keys(docs)])]) {
    if (!Object.hasOwn(DOC_TYPES, t)) continue;
    const d = docs[t];
    const dl = d ? daysLeft(d.expires) : null;
    items.push({
      icon: DOC_TYPES[t].icon, label: DOC_TYPES[t].label,
      value: d ? (dl < 0 ? "Expirat" : zile(dl)) : "Lipsește",
      sub: d ? `până la ${fmtDate(d.expires)}` : "Apasă pentru a adăuga",
      status: d ? dayStatus(dl) : required.includes(t) ? "missing" : "none",
      action: d ? { kind: "renew", type: t } : { kind: "doc", type: t },
    });
  }
  const tMap = { good: ["Bune", "ok"], attention: ["De verificat", "warn"] };
  const [tVal, tStat] = tMap[v.tyres] || ["Nesetat", "none"];
  items.push({ icon: "🛞", label: "Anvelope", value: tVal, sub: v.tyresNote || "Apasă pentru a actualiza", status: tStat, action: { kind: "tyres" } });
  return items;
}
export const attentionItems = (v) => healthItems(v).filter((i) => ATT.includes(i.status));
export const missingItems = (v) => healthItems(v).filter((i) => i.status === "missing");
export const vehicleWorst = (v) => worst(...healthItems(v).map((i) => i.status), "ok");

/* ---------- evenimente & costuri ---------- */
export function eventTitle(e) {
  if (e.kind === "fuel") return "Alimentare";
  if (e.kind === "maintenance") return MAINT_TYPES[e.type]?.label || "Mentenanță";
  if (e.kind === "document") return e.title || "Document";
  if (e.kind === "odometer") return "Kilometraj";
  return e.label || "Cheltuială";
}
export function eventIcon(e) {
  if (e.kind === "maintenance") return MAINT_TYPES[e.type]?.icon || "🛠️";
  if (e.kind === "expense") return EXPENSE_TYPES[e.type]?.icon || KIND_ICON.expense;
  return KIND_ICON[e.kind] || "•";
}

export function costStats(v, year = +todayStr().slice(0, 4)) {
  const evts = (v.events || []).filter((e) => e.cost > 0);
  const yEvts = evts.filter((e) => e.date && +e.date.slice(0, 4) === year);
  const total = yEvts.reduce((s, e) => s + +e.cost, 0);
  const cats = { fuel: 0, maintenance: 0, document: 0, expense: 0 };
  yEvts.forEach((e) => { cats[Object.hasOwn(cats, e.kind) ? e.kind : "expense"] += +e.cost; });

  const kmE = (v.events || []).filter((e) => e.km && e.date).sort((a, b) => a.date.localeCompare(b.date) || a.km - b.km);
  let perKm = null;
  if (kmE.length >= 2) {
    const first = kmE[0], last = kmE[kmE.length - 1];
    const span = last.km - first.km;
    if (span >= 500) {
      const inR = evts.filter((e) => e.date > first.date && e.date <= last.date).reduce((s, e) => s + +e.cost, 0);
      if (inR > 0) perKm = inR / span;
    }
  }
  const lastService =
    [...(v.events || [])].filter((e) => e.kind === "maintenance" && e.type === "service" && e.cost)
      .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  return { year, total, cats, perKm, cons: fuelConsumption(v)?.cons ?? null, lastService };
}

/* consum real: doar între plinuri cu km cunoscuți, fără primul plin din interval */
export function fuelConsumption(v) {
  const fl = (v.events || []).filter((e) => e.kind === "fuel" && e.km && e.liters).sort((a, b) => a.km - b.km);
  if (fl.length < 2) return null;
  const dist = fl[fl.length - 1].km - fl[0].km;
  if (dist < 100) return null;
  const liters = fl.slice(1).reduce((s, e) => s + +e.liters, 0);
  const paid = fl.slice(1).filter((e) => +e.cost > 0 && +e.liters > 0);
  const paidLiters = paid.reduce((s, e) => s + +e.liters, 0);
  const pricePerLiter = paidLiters ? paid.reduce((s, e) => s + +e.cost, 0) / paidLiters : null;
  return { cons: (liters / dist) * 100, dist, liters, pricePerLiter };
}

/* ---------- cunoștințe auto ---------- */
export function vehicleAge(v) {
  const y = +v.year;
  return y ? Math.max(0, +todayStr().slice(0, 4) - y) : null;
}
export function serviceIntervalFor(v) {
  const age = vehicleAge(v);
  const f = v.fuel || "";
  if (f === "Electric") return age != null && age > 8 ? { km: 20000, months: 12 } : { km: 30000, months: 24 };
  if (f === "GPL") return { km: 10000, months: 12 };
  if (f === "Hibrid" || f === "Hibrid plug-in") return age != null && age >= 10 ? { km: 10000, months: 12 } : { km: 15000, months: 12 };
  if (age == null) return { km: 15000, months: 12 };
  if (age > 12) return { km: 10000, months: 12 };
  if (age >= 5) return { km: 12000, months: 12 };
  return { km: 15000, months: 12 };
}

/* ITP: intervalul legal după categorie, utilizare și vechimea din anul inspecției (vezi shared/itp.js) */
export const itpMonthsFor = (v, from = todayStr()) => itpInterval(v, from);

/* km-ul de pe fișa mașinii e o citire nouă doar dacă întrece istoricul; altfel kmUpdatedAt e doar data importului */
export function odometerReadings(v) {
  const pts = (v.events || []).filter((e) => +e.km > 0 && e.date).map((e) => ({ date: e.date, km: +e.km }));
  const updated = v.kmUpdatedAt ? new Date(v.kmUpdatedAt) : null;
  if (+v.km > 0 && updated && !isNaN(updated) && pts.every((p) => +v.km > p.km)) pts.push({ date: bucharestToday(updated), km: +v.km });
  return pts.sort((a, b) => a.date.localeCompare(b.date) || a.km - b.km);
}

export function kmPerYear(v) {
  const points = odometerReadings(v);
  if (points.length >= 2) {
    const first = points[0], last = points[points.length - 1];
    const spanKm = last.km - first.km, days = daysBetween(first.date, last.date);
    if (spanKm >= 1000 && days >= 60) return Math.round((spanKm / days) * 365);
  }
  if (v.km && +v.year) {
    const days = Math.max(180, daysBetween(`${+v.year}-07-01`, todayStr()));
    return Math.round((v.km / days) * 365);
  }
  return null;
}
export function fuelEstimate(v) {
  const kmAn = kmPerYear(v);
  if (!kmAn) return null;
  const real = fuelConsumption(v);
  const cons = real?.cons ?? FUEL_CONS[v.fuel] ?? 7.0;
  const price = real?.pricePerLiter ?? FUEL_PRICE[v.fuel] ?? FUEL_PRICE["Benzină"];
  const costYear = (kmAn * cons) / 100 * price;
  return { kmAn, cons, real: !!real, price, costYear, costMonth: costYear / 12, unit: v.fuel === "Electric" ? "kWh" : "L" };
}

/* ---------- formulare ---------- */
const filled = (x) => x != null && String(x).trim() !== "";
export const numOrNull = (x) => (filled(x) && Number.isFinite(+x) ? +x : null);
export const pricePerLiter = (cost, liters) => (+cost > 0 && +liters > 0 ? +cost / +liters : null);

export function dateError(ds, today = todayStr()) {
  if (!filled(ds) || !DATE_RE.test(ds)) return "Alege data";
  return ds > today ? "Data nu poate fi în viitor" : null;
}
export function kmError(km, { required = false } = {}) {
  if (!filled(km)) return required ? "Introdu kilometrajul" : null;
  return Number.isFinite(+km) && +km >= 0 ? null : "Kilometrajul trebuie să fie un număr pozitiv";
}
export function amountError(cost, { required = false } = {}) {
  if (!filled(cost)) return required ? "Introdu suma" : null;
  if (!Number.isFinite(+cost) || +cost < 0) return "Suma trebuie să fie un număr pozitiv";
  return required && +cost === 0 ? "Introdu suma" : null;
}
export function vehicleFormError(f, thisYear = +todayStr().slice(0, 4)) {
  if (!filled(f.make)) return "Marca este obligatorie";
  if (!filled(f.plate)) return "Numărul de înmatriculare este obligatoriu";
  const y = +f.year;
  if (filled(f.year) && !(Number.isInteger(y) && y >= 1950 && y <= thisYear + 1)) return `Anul trebuie să fie între 1950 și ${thisYear + 1}`;
  return kmError(f.km);
}
export const kmDecrease = (v, km) => v.km != null && numOrNull(km) != null && +km < v.km;
export const plateMismatch = (found, plate) => {
  const a = normalizePlate(found), b = normalizePlate(plate);
  return !!a && !!b && a !== b;
};

/* ---------- cont ---------- */
export const loginEmailChanged = (account, email) => !!email.trim() && email.trim().toLowerCase() !== (account.email || "").toLowerCase();

/* e-mailurile pleacă doar când s-au schimbat; primul e-mail de login devine și adresa de remindere.
   Fără e-mail configurat adresa nu se poate confirma, iar serverul ar refuza toată salvarea — rămâne fără remindere. */
export function profilePatch(account, f, currentPassword, { mail = true } = {}) {
  const email = f.email.trim(), reminder = f.reminderEmail.trim();
  const loginChanged = loginEmailChanged(account, email);
  const shownReminder = account.pendingReminderEmail || account.reminderEmail || "";
  const firstAddress = loginChanged && !shownReminder;
  const reminderEmail = reminder !== shownReminder ? reminder : firstAddress ? (mail ? email : "") : undefined;
  return {
    kind: f.kind,
    name: f.kind === "company" ? f.companyName || f.name : f.name,
    currency: f.currency,
    company: f.kind === "company" ? { name: f.companyName, cui: f.cui, regCom: f.regCom, address: f.address } : null,
    rcaBrokerUrl: f.rcaBrokerUrl.trim() || null,
    ...(f.fuelPrices ? { fuelPrices: f.fuelPrices } : {}),
    ...(reminderEmail !== undefined ? { reminderEmail } : {}),
    ...(loginChanged ? { email, currentPassword } : {}),
  };
}

/* adresa care așteaptă linkul de confirmare; fără e-mail configurat nu s-a trimis nimic */
export function reminderNotice(account, mail) {
  const at = account.pendingReminderEmail || (account.reminderVerified === false ? account.reminderEmail : null);
  if (!mail || !at) return null;
  return account.reminderVerified === false || !account.reminderEmail
    ? `📬 Reminderele pornesc după confirmare: confirmă adresa din e-mailul primit la ${at} (verifică și Spam).`
    : `⏳ Așteaptă confirmarea din e-mailul trimis la ${at} — până atunci reminderele merg la ${account.reminderEmail}.`;
}

/* ferestrele de la intrare vin pe rând; o fereastră închide doar dacă e cea afișată, ca un răspuns întârziat să nu sară peste următoarea */
export function modalQueue(render) {
  let shown = null, next = [];
  const show = (m) => { shown = m; render(m); };
  return {
    open: show,
    queue(list) { next = list.filter(Boolean); show(next.shift() || null); },
    close(m) { if (m === shown) show(next.shift() || null); },
    clear() { next = []; show(null); },
  };
}

/* ---------- documente & service ---------- */
/* reînnoirea începe a doua zi după expirarea actuală, dar niciodată în trecut */
export function renewalStart(v, type, today = todayStr()) {
  const current = latestDocs(v)[type];
  const dayAfter = current ? addDaysTo(current.expires, 1) : today;
  return dayAfter > today ? dayAfter : today;
}
/* `expires` e ultima zi valabilă: o poliță de 12 luni începută pe 16 nov 2026 ține până pe 15 nov 2027 */
export function expiryOptions(type, v, from = renewalStart(v, type)) {
  const months = (n, label, recommended = false) => ({ label, expires: addDaysTo(addMonths(n, from), -1), recommended, months: n });
  const days = (n, label) => ({ label, expires: addDays(n - 1, from), recommended: false, days: n });
  if (type === "itp") {
    const rec = itpMonthsFor(v, from);
    return [
      months(rec.months, `+${rec.label}`, true),
      ...(rec.months !== 12 ? [months(12, "+1 an")] : []),
      ...(rec.months !== 24 ? [months(24, "+2 ani")] : []),
    ];
  }
  if (type === "rovinieta") return [days(30, "+30 zile"), days(60, "+60 zile"), months(12, "+12 luni")];
  if (type === "rca" || type === "casco") return [months(6, "+6 luni"), months(12, "+12 luni")];
  return [months(12, "+12 luni"), months(24, "+24 luni")];
}

/* tariful de rovinietă e în lei, pe 12 luni: îl precompletăm doar în conturile în lei */
export function renewalDefaults(type, v, provider) {
  if (type !== "rovinieta") return {};
  const { price } = vignetteQuote(v);
  const cost = price && currency === "RON" ? String(price) : null;
  return { ...(cost ? { cost, autoCost: cost } : {}), ...(provider ? {} : { provider: "CNAIR · portal.etoll.ro" }) };
}
export function renewalPick(d, option) {
  const untouched = !!d.autoCost && (!d.cost || d.cost === d.autoCost);
  return { expires: option.expires, ...(untouched ? { cost: option.months === 12 ? d.autoCost : "" } : {}) };
}

export function docRows(v) {
  const docs = latestDocs(v);
  const required = requiredDocs(v);
  return [...new Set([...required, ...Object.keys(docs), "itp", "casco"])]
    .filter((t) => Object.hasOwn(DOC_TYPES, t))
    .map((type) => {
      const doc = docs[type] || null;
      const dl = doc ? daysLeft(doc.expires) : null;
      const isRequired = required.includes(type);
      const notYet = type === "itp" && !doc ? itpRequirement(v, false, todayStr()) : null;
      return { type, doc, daysLeft: dl, required: isRequired, notYet: notYet && !notYet.required ? notYet : null, status: doc ? dayStatus(dl) : isRequired ? "missing" : "none" };
    });
}

/* după un service scriem mereu ambele ținte, ca un termen vechi depășit să nu rămână agățat */
export function nextServiceTargets({ km, date, kmInterval, months }) {
  const base = numOrNull(km), everyKm = numOrNull(kmInterval), everyMonths = numOrNull(months);
  return {
    nextServiceKm: base != null && everyKm > 0 ? Math.round(base + everyKm) : null,
    nextServiceDate: filled(date) && DATE_RE.test(date) && everyMonths > 0 ? addMonths(Math.round(everyMonths), date) : null,
  };
}

/* un service trecut în istoric după unul mai recent nu mută ținta */
export const lastServiceDate = (v) =>
  (v.events || []).filter((e) => e.kind === "maintenance" && e.type === "service" && e.date).reduce((last, e) => (last && last > e.date ? last : e.date), null);
export function isLatestService(v, date) {
  const last = lastServiceDate(v);
  return !last || !filled(date) || date >= last;
}

/* ---------- istoric ---------- */
const LUNI_LUNGI = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];
export function monthLabel(key, today = todayStr()) {
  const name = LUNI_LUNGI[+String(key).slice(5, 7) - 1];
  if (!name) return "Fără dată";
  const label = name[0].toUpperCase() + name.slice(1);
  return key.slice(0, 4) === today.slice(0, 4) ? label : `${label} ${key.slice(0, 4)}`;
}
export const sortedEvents = (v) =>
  [...(v.events || [])].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.created || "").localeCompare(a.created || ""));

export function historyPage(v, limit = 50, today = todayStr()) {
  const all = sortedEvents(v);
  const groups = [];
  all.forEach((e, idx) => {
    const key = monthKey(e.date || "");
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) groups.push((g = { key, label: monthLabel(key, today), total: 0, count: 0, items: [] }));
    if (+e.cost > 0) g.total += +e.cost;
    g.count++;
    if (idx < limit) g.items.push(e);
  });
  return { groups: groups.filter((g) => g.items.length), total: all.length, hidden: Math.max(0, all.length - limit) };
}

/* ---------- garaj: căutare, filtre, sortare ---------- */
const fold = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function matchesQuery(v, q) {
  const terms = fold(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = fold([v.plate, normalizePlate(v.plate), v.make, v.model, v.driver].join(" "));
  const plate = normalizePlate(v.plate);
  return terms.every((t) => hay.includes(t) || (!!normalizePlate(t) && plate.includes(normalizePlate(t))));
}

export function vehicleSummary(v) {
  const items = healthItems(v);
  const attention = items.filter((i) => ATT.includes(i.status));
  const missing = items.filter((i) => i.status === "missing");
  return { v, attention, missing, status: worst(...attention.map((i) => i.status), "ok") };
}

const byName = (a, b) => vehicleName(a.v).localeCompare(vehicleName(b.v), "ro") || String(a.v.plate || "").localeCompare(String(b.v.plate || ""), "ro");
const SORTS = {
  stare: (a, b) => WORST[b.status] - WORST[a.status] || b.attention.length - a.attention.length || b.missing.length - a.missing.length || byName(a, b),
  nume: byName,
  km: (a, b) => (b.v.km ?? -1) - (a.v.km ?? -1) || byName(a, b),
};
export const GARAGE_SORTS = { stare: "Stare", nume: "Nume", km: "Kilometraj" };

const FILTERS = { all: () => true, attention: (r) => r.attention.length > 0, missing: (r) => r.missing.length > 0 };
const passes = (r, filter) => (filter.startsWith("cat:") ? r.v.category === filter.slice(4) : (FILTERS[filter] || FILTERS.all)(r));

export function garageFilters(rows) {
  const cats = Object.keys(CATEGORIES).filter((c) => rows.some((r) => r.v.category === c));
  const list = [["all", "Toate"], ["attention", "Necesită atenție"], ["missing", "Lipsesc documente"], ...(cats.length > 1 ? cats.map((c) => [`cat:${c}`, CATEGORIES[c]]) : [])];
  return list.map(([id, label]) => ({ id, label, count: rows.filter((r) => passes(r, id)).length }));
}
export function garageView(vehicles, { q = "", filter = "all", sort = "stare" } = {}) {
  const rows = vehicles.map(vehicleSummary);
  const filters = garageFilters(rows);
  const active = filters.some((f) => f.id === filter) ? filter : "all";
  return { filters, filter: active, rows: rows.filter((r) => passes(r, active) && matchesQuery(r.v, q)).sort(SORTS[sort] || SORTS.stare) };
}

/* ---------- banda de alerte ---------- */
const ALERT_GROUPS = [
  ["dead",        (n) => `${n} ${n === 1 ? "expirat" : "expirate"}`],
  ["serviceLate", (n) => (n === 1 ? "1 service depășit" : `${n} service-uri depășite`)],
  ["crit",        (n) => `${n} în ≤5 zile`],
  ["orange",      (n) => `${n} în ≤15 zile`],
  ["warn",        (n) => `${n} în ≤30 zile`],
  ["serviceKm",   (n) => (n === 1 ? "1 service în curând" : `${n} service-uri în curând`)],
  ["check",       (n) => `${n} de verificat`],
];
const dueByKm = (a) => a.kmLeft != null && WORST[kmStatus(a.kmLeft)] >= WORST[a.daysLeft == null ? "none" : dayStatus(a.daysLeft)];
function alertGroup(a) {
  if (a.kind === "tyres") return "check";
  if (a.kind !== "service") return a.st;
  if (a.st === "dead") return "serviceLate";
  return dueByKm(a) ? "serviceKm" : a.st;
}
export function alertSummary(alerts) {
  const groups = {};
  for (const a of alerts) {
    const g = (groups[alertGroup(a)] ||= { n: 0, st: "none" });
    g.n++;
    g.st = worst(g.st, a.st);
  }
  return ALERT_GROUPS.filter(([k]) => groups[k]).map(([k, text]) => ({ st: groups[k].st, text: text(groups[k].n) }));
}

/* ---------- mașină demo ---------- */
export function demoVehicle() {
  const iso = (d) => addDays(d);
  return {
    make: "Dacia", model: "Duster", plate: "B 45 FLT", year: "2021", fuel: "Motorină", category: "autoturism", driver: "Andrei",
    vin: "UU1HSDADG12345678", km: 42380,
    nextServiceKm: 44700, nextServiceDate: iso(160), tyres: "good", tyresNote: "set de vară",
    documents: [
      { type: "itp", expires: iso(143) },
      { type: "rca", expires: iso(68), provider: "Allianz" },
      { type: "rovinieta", expires: iso(27) },
      { type: "casco", expires: iso(12), provider: "Groupama" },
    ],
    events: [
      { kind: "document", type: "rca", title: "RCA reînnoit", cost: 1450, date: iso(0), note: "Allianz" },
      { kind: "expense", label: "Spălătorie", cost: 60, date: iso(-8) },
      { kind: "maintenance", type: "service", cost: 1100, km: 41800, date: iso(-13), note: "ulei + filtre" },
      { kind: "fuel", cost: 420, liters: 55, km: 41560, date: iso(-26) },
      { kind: "maintenance", type: "tyres", cost: 1900, km: 41200, date: iso(-40), note: "perechea din față" },
      { kind: "fuel", cost: 405, liters: 53, km: 40890, date: iso(-52) },
      { kind: "document", type: "itp", title: "ITP trecut", cost: 150, date: iso(-77) },
    ],
  };
}
