/* FleetDeck — model & logică pură (fără DOM) */

export const DOC_TYPES = {
  itp:       { label: "ITP",       icon: "🔍" },
  rca:       { label: "RCA",       icon: "🛡️" },
  rovinieta: { label: "Rovinietă", icon: "🛣️" },
  casco:     { label: "CASCO",     icon: "☂️" },
  warranty:  { label: "Garanție",  icon: "📜" },
  leasing:   { label: "Leasing",   icon: "🏦" },
};
export const CORE_DOCS = ["itp", "rca", "rovinieta"];

export const MAINT_TYPES = {
  service: { label: "Service / Revizie", icon: "🔧" },
  brakes:  { label: "Frâne",             icon: "🛑" },
  tyres:   { label: "Anvelope",          icon: "🛞" },
  battery: { label: "Baterie",           icon: "🔋" },
  repair:  { label: "Reparație",         icon: "🛠️" },
};
export const FUELS = ["Benzină", "Motorină", "Hibrid", "Hibrid plug-in", "Electric", "GPL"];
export const KIND_ICON = { fuel: "⛽", expense: "💶", document: "📄" };

/* ---------- formatare (ro-RO) ---------- */
export const todayStr = () => new Date().toISOString().slice(0, 10);
export const fmtKm = (n) => (n == null || n === "" ? "—" : (+n).toLocaleString("ro-RO"));
export const fmtMoney = (n) => "€" + (+n).toLocaleString("ro-RO", { maximumFractionDigits: +n % 1 ? 2 : 0 });
export const zile = (n) => { const a = Math.abs(n); return a === 1 ? "o zi" : a < 20 ? `${a} zile` : `${a} de zile`; };

export function daysLeft(ds) {
  if (!ds) return null;
  return Math.floor((new Date(ds + "T23:59:59") - new Date()) / 86400000);
}
const LUNI = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "noi", "dec"];
export function fmtDate(ds) {
  if (!ds) return "—";
  const d = new Date(ds + "T12:00:00");
  let s = `${d.getDate()} ${LUNI[d.getMonth()]}`;
  if (d.getFullYear() !== new Date().getFullYear()) s += ` ${d.getFullYear()}`;
  return s;
}
export function dateLabel(ds) {
  if (ds === todayStr()) return "Azi";
  if (ds === new Date(Date.now() - 864e5).toISOString().slice(0, 10)) return "Ieri";
  return fmtDate(ds);
}
export function relTime(iso) {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso)) / 864e5);
  if (d <= 0) return "azi";
  if (d === 1) return "ieri";
  if (d < 30) return `acum ${zile(d)}`;
  return fmtDate(iso.slice(0, 10));
}

/* ---------- praguri de urgență ----------
   galben ≤30 zile → portocaliu ≤15 → roșu ≤5 (apoi zilnic) → expirat */
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
export const WORST = { none: 0, ok: 1, warn: 2, orange: 3, crit: 4, dead: 5 };
export const worst = (...s) => s.reduce((a, b) => ((WORST[b] ?? 0) > (WORST[a] ?? 0) ? b : a), "none");
export const ATT = ["warn", "orange", "crit", "dead"];

/* ---------- stare mașină ---------- */
export function latestDocs(v) {
  const out = {};
  for (const d of v.documents || []) {
    if (!d.expires) continue;
    if (!out[d.type] || d.expires > out[d.type].expires) out[d.type] = d;
  }
  return out;
}

export function healthItems(v) {
  const items = [];
  // următorul service
  const kmLeft = v.nextServiceKm && v.km ? v.nextServiceKm - v.km : null;
  const dLeft = v.nextServiceDate ? daysLeft(v.nextServiceDate) : null;
  const sStat = kmLeft == null && dLeft == null ? "none" : worst(kmStatus(kmLeft), dLeft == null ? "none" : dayStatus(dLeft));
  const rec = serviceIntervalFor(v);
  let sVal = "Nesetat", sSub = `Recomandat: ${fmtKm(rec.km)} km / ${rec.months} luni`;
  if (kmLeft != null) {
    sVal = kmLeft <= 0 ? "Depășit" : `~${fmtKm(kmLeft)} km`;
    sSub = `la ${fmtKm(v.nextServiceKm)} km`;
    if (dLeft != null) sSub += ` · ${fmtDate(v.nextServiceDate)}`;
  } else if (dLeft != null) {
    sVal = dLeft < 0 ? "Depășit" : zile(dLeft);
    sSub = fmtDate(v.nextServiceDate);
  }
  items.push({ icon: "🔧", label: "Următorul service", value: sVal, sub: sSub, status: sStat, action: { kind: "service" } });

  // documente
  const docs = latestDocs(v);
  const types = [...new Set([...CORE_DOCS, ...Object.keys(docs)])];
  for (const t of types) {
    if (!DOC_TYPES[t]) continue;
    const d = docs[t];
    const dl = d ? daysLeft(d.expires) : null;
    items.push({
      icon: DOC_TYPES[t].icon, label: DOC_TYPES[t].label,
      value: d ? (dl < 0 ? "Expirat" : zile(dl)) : "Lipsește",
      sub: d ? `până la ${fmtDate(d.expires)}` : "Apasă pentru a adăuga",
      status: d ? dayStatus(dl) : "none",
      action: d ? { kind: "renew", type: t } : { kind: "doc", type: t },
    });
  }
  // anvelope
  const tMap = { good: ["Bune", "ok"], attention: ["De verificat", "warn"] };
  const [tVal, tStat] = tMap[v.tyres] || ["Nesetat", "none"];
  items.push({ icon: "🛞", label: "Anvelope", value: tVal, sub: v.tyresNote || "Apasă pentru a actualiza", status: tStat, action: { kind: "tyres" } });
  return items;
}
export const attentionItems = (v) => healthItems(v).filter((i) => ATT.includes(i.status));
export const vehicleWorst = (v) => worst(...healthItems(v).map((i) => i.status), "ok");

/* ---------- alerte globale (banda de notificări) ---------- */
export function collectAlerts(vehicles) {
  const out = [];
  for (const v of vehicles || []) {
    const car = `${v.make || ""} ${v.model || ""}`.trim();
    const docs = latestDocs(v);
    for (const [t, d] of Object.entries(docs)) {
      if (!DOC_TYPES[t]) continue;
      const dl = daysLeft(d.expires), st = dayStatus(dl);
      if (ATT.includes(st))
        out.push({
          st, sort: dl, vid: v.id, car,
          msg: dl < 0 ? `${DOC_TYPES[t].label} a expirat acum ${zile(dl)}`
             : dl === 0 ? `${DOC_TYPES[t].label} expiră AZI`
             : `${DOC_TYPES[t].label} expiră în ${zile(dl)}`,
        });
    }
    // service: km și dată — o singură alertă, cea mai gravă
    const kmLeft = v.nextServiceKm && v.km ? v.nextServiceKm - v.km : null;
    const dLeft = v.nextServiceDate ? daysLeft(v.nextServiceDate) : null;
    const cand = [];
    if (kmLeft != null && ATT.includes(kmStatus(kmLeft)))
      cand.push({ st: kmStatus(kmLeft), sort: kmLeft / 100, msg: kmLeft <= 0 ? `service depășit cu ${fmtKm(-kmLeft)} km` : `service în ~${fmtKm(kmLeft)} km` });
    if (dLeft != null && ATT.includes(dayStatus(dLeft)))
      cand.push({ st: dayStatus(dLeft), sort: dLeft, msg: dLeft < 0 ? `service depășit din ${fmtDate(v.nextServiceDate)}` : `service în ${zile(dLeft)}` });
    if (cand.length) {
      cand.sort((a, b) => WORST[b.st] - WORST[a.st] || a.sort - b.sort);
      out.push({ ...cand[0], vid: v.id, car });
    }
    if (v.tyres === "attention") out.push({ st: "warn", sort: 99, vid: v.id, car, msg: "anvelopele necesită verificare" });
  }
  return out.sort((a, b) => WORST[b.st] - WORST[a.st] || a.sort - b.sort);
}

/* ---------- evenimente & costuri ---------- */
export function eventTitle(e) {
  if (e.kind === "fuel") return "Alimentare";
  if (e.kind === "maintenance") return MAINT_TYPES[e.type]?.label || "Mentenanță";
  if (e.kind === "document") return e.title || "Document";
  return e.label || "Cheltuială";
}
export function eventIcon(e) {
  if (e.kind === "maintenance") return MAINT_TYPES[e.type]?.icon || "🛠️";
  return KIND_ICON[e.kind] || "•";
}

export function costStats(v) {
  const year = new Date().getFullYear();
  const evts = (v.events || []).filter((e) => e.cost > 0);
  const yEvts = evts.filter((e) => e.date && +e.date.slice(0, 4) === year);
  const total = yEvts.reduce((s, e) => s + +e.cost, 0);
  const cats = { fuel: 0, maintenance: 0, document: 0, expense: 0 };
  yEvts.forEach((e) => { cats[e.kind] != null ? (cats[e.kind] += +e.cost) : (cats.expense += +e.cost); });

  const kmE = (v.events || []).filter((e) => e.km).sort((a, b) => a.km - b.km);
  let perKm = null;
  if (kmE.length >= 2) {
    const span = kmE[kmE.length - 1].km - kmE[0].km;
    if (span >= 500) {
      const d0 = kmE[0].date, d1 = kmE[kmE.length - 1].date;
      const inR = evts.filter((e) => e.date >= d0 && e.date <= d1).reduce((s, e) => s + +e.cost, 0);
      if (inR > 0) perKm = inR / span;
    }
  }
  const fl = (v.events || []).filter((e) => e.kind === "fuel" && e.km && e.liters).sort((a, b) => a.km - b.km);
  let cons = null;
  if (fl.length >= 2) {
    const dist = fl[fl.length - 1].km - fl[0].km;
    const L = fl.slice(1).reduce((s, e) => s + +e.liters, 0);
    if (dist >= 100) cons = (L / dist) * 100;
  }
  const lastService =
    [...(v.events || [])].filter((e) => e.kind === "maintenance" && e.type === "service" && e.cost)
      .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  return { year, total, cats, perKm, cons, lastService };
}

/* ---------- cunoștințe auto: intervale de service (după vârstă & combustibil) ---------- */
export function vehicleAge(v) {
  const y = +v.year;
  return y ? Math.max(0, new Date().getFullYear() - y) : null;
}
export function serviceIntervalFor(v) {
  const age = vehicleAge(v);
  const f = v.fuel || "";
  if (f === "Electric") return age != null && age > 8 ? { km: 20000, months: 12 } : { km: 30000, months: 24 };
  if (f === "GPL") return { km: 10000, months: 12 };
  if (f === "Hibrid" || f === "Hibrid plug-in") return age != null && age >= 10 ? { km: 10000, months: 12 } : { km: 15000, months: 12 };
  // Benzină / Motorină
  if (age == null) return { km: 15000, months: 12 };
  if (age > 12) return { km: 10000, months: 12 };
  if (age >= 5) return { km: 12000, months: 12 };
  return { km: 15000, months: 12 };
}

/* ITP conform legislației RO: prima la 3 ani (mașină nouă), apoi la 2 ani,
   iar la mașinile de peste 12 ani — anual */
export function itpMonthsFor(v) {
  const age = vehicleAge(v);
  if (age == null) return { months: 24, label: "2 ani" };
  if (age >= 12) return { months: 12, label: "1 an (mașină de peste 12 ani)" };
  if (age <= 1) return { months: 36, label: "3 ani (prima ITP, mașină nouă)" };
  return { months: 24, label: "2 ani" };
}

export function addMonths(n) { const d = new Date(); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); }
export function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

/* ---------- combustibil: cost estimat automat (orientativ) ----------
   Constante ajustabile: preț €/L (€/kWh la electric) și consum mediu L/100km */
export const FUEL_PRICE = { "Benzină": 1.50, "Motorină": 1.55, "GPL": 0.78, "Hibrid": 1.50, "Hibrid plug-in": 1.50, "Electric": 0.22 };
export const FUEL_CONS = { "Benzină": 7.5, "Motorină": 6.5, "GPL": 9.5, "Hibrid": 5.0, "Hibrid plug-in": 6.0, "Electric": 17 };

export function kmPerYear(v) {
  // 1) din intrările cu kilometraj (cel mai precis)
  const kmE = (v.events || []).filter((e) => e.km && e.date).sort((a, b) => a.date.localeCompare(b.date));
  if (kmE.length >= 2) {
    const spanKm = kmE[kmE.length - 1].km - kmE[0].km;
    const months = (new Date(kmE[kmE.length - 1].date) - new Date(kmE[0].date)) / (30.44 * 864e5);
    if (spanKm >= 300 && months >= 1) return Math.round((spanKm / months) * 12);
  }
  // 2) km totali împărțiți la lunile de când există mașina
  if (v.km && +v.year) {
    const months = Math.max(6, (Date.now() - new Date(+v.year, 0, 1)) / (30.44 * 864e5));
    return Math.round((v.km / months) * 12);
  }
  return null;
}
export function fuelEstimate(v) {
  const kmAn = kmPerYear(v);
  if (!kmAn) return null;
  // consum real dacă există alimentări cu km + litri, altfel media pe tipul de combustibil
  const fl = (v.events || []).filter((e) => e.kind === "fuel" && e.km && e.liters).sort((a, b) => a.km - b.km);
  let cons = null, real = false;
  if (fl.length >= 2) {
    const dist = fl[fl.length - 1].km - fl[0].km;
    const L = fl.slice(1).reduce((s, e) => s + +e.liters, 0);
    if (dist >= 100) { cons = (L / dist) * 100; real = true; }
  }
  if (!cons) cons = FUEL_CONS[v.fuel] ?? 7.0;
  const price = FUEL_PRICE[v.fuel] ?? 1.5;
  const costYear = (kmAn * cons) / 100 * price;
  return { kmAn, cons, real, costYear, costMonth: costYear / 12, unit: v.fuel === "Electric" ? "kWh" : "L" };
}

/* ---------- mașină demo ---------- */
export function demoVehicle() {
  const iso = (d) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
  const uid = () => crypto.randomUUID();
  return {
    make: "BMW", model: "X5", plate: "B 45 FLT", year: "2021", fuel: "Motorină",
    vin: "WBACV410X09B12345", km: 42380, kmUpdatedAt: new Date().toISOString(),
    nextServiceKm: 44700, nextServiceDate: iso(160), tyres: "good", tyresNote: "set de vară",
    documents: [
      { id: uid(), type: "itp", expires: iso(143) },
      { id: uid(), type: "rca", expires: iso(68), provider: "Allianz" },
      { id: uid(), type: "rovinieta", expires: iso(27) },
      { id: uid(), type: "casco", expires: iso(12), provider: "Groupama" },
    ],
    events: [
      { id: uid(), kind: "document", type: "rca", title: "RCA reînnoit", cost: 840, date: iso(0), note: "Allianz" },
      { id: uid(), kind: "expense", label: "Spălătorie", cost: 12, date: iso(-8) },
      { id: uid(), kind: "maintenance", type: "service", cost: 420, km: 41800, date: iso(-13), note: "ulei + filtre" },
      { id: uid(), kind: "fuel", cost: 91, liters: 58, km: 41560, date: iso(-26) },
      { id: uid(), kind: "maintenance", type: "tyres", cost: 780, km: 41200, date: iso(-40), note: "perechea din față" },
      { id: uid(), kind: "fuel", cost: 87, liters: 55, km: 40890, date: iso(-52) },
      { id: uid(), kind: "document", type: "itp", title: "ITP trecut", date: iso(-77) },
    ].map((e) => ({ created: new Date().toISOString(), ...e })),
  };
}
