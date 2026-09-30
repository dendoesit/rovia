import { DOC_TYPES } from "../../../shared/domain.js";
import { bucharestToday } from "../../../shared/dates.js";
import { fold, clean, roDate } from "./text.js";
import { findDates, findNumbers, parseDate, isNegative, dateNotes, hugeKmWarning, MAX_KM, TYRE_SIZE } from "./cells.js";

export const WORK_FIELDS = {
  service: { type: "service", label: "Revizie" },
  distributie: { type: "distributie", label: "Distribuție" },
  ambreiaj: { type: "ambreiaj", label: "Ambreiaj" },
  brakes: { type: "brakes", label: "Frâne" },
  battery: { type: "battery", label: "Baterie" },
  tyres: { type: "tyres", label: "Anvelope" },
  tyresSummer: { type: "tyres", label: "Anvelope", season: "vară" },
  tyresWinter: { type: "tyres", label: "Anvelope", season: "iarnă" },
};

export const TYPE_WORDS = {
  service: /reviz|schimb ulei|\bulei\b/, distributie: /distribut/, ambreiaj: /ambreiaj/,
  brakes: /\bfran|placut/, battery: /bateri|acumulator/, tyres: /anvelop|cauciuc|pneu/,
};
const NEXT_WORDS = /(urm|next|scaden|viitoar|pana la)[^\d]*$/;
const FILLER = new Set(("facut facuta facute efectuat efectuata realizat realizata schimbat schimbata schimbate schimbati " +
  "inlocuit inlocuita inlocuite montat montata montate cumparat cumparata cumparate cumparati achizitionat achizitionata " +
  "achizitionate luat luata luate nou noua noi pe la in din de si cu data km buc bucata bucati set seturi pana " +
  "urmatoarea urmatorul urm next valabil valabila valabilitate expira expirare exp ok da ultima ultimul ultimele " +
  "mii lei ron eur euro cost pret luni aprox aproximativ circa cca").split(" "));
const TOPIC = /^(?:reviz|ulei|filtr|schimb|distribut|kit$|ambreiaj|bateri|acumulator|anvelop|cauciuc|pneu|vara$|iarna$|mixt|all$|season|fran|placut|rca$|casco$|itp$|rovinie|vignet|asigur|polit|garant|leasing)/;

const mask = (text, spans) => spans.reduce((s, { start, end }) => s.slice(0, start) + " ".repeat(end - start) + s.slice(end), text);
const tokensOf = (text) => text.split(/[\s/+(),;:–—]+|(?<!\p{L})[.-]|[.-](?!\p{L})/u).filter((t) => /[\p{L}\d]/u.test(t));

/* ce rămâne după ce scoatem datele, numerele și cuvintele de umplutură: furnizor, marcă de baterie, detalii */
function leftover(text, today) {
  const masked = mask(text, [...findDates(text, today), ...findNumbers(text, today)]);
  return tokensOf(masked).filter((t) => !FILLER.has(fold(t)) && !TOPIC.test(fold(t)) && /\p{L}{2}/u.test(t)).join(" ");
}
const meaningful = (text) => tokensOf(text).some((t) => !FILLER.has(fold(t)));

function season(text, fallback) {
  const f = fold(text);
  if (/mixt|all.?season|anotimp/.test(f)) return "mixte";
  if (/iarn|winter/.test(f)) return "iarnă";
  if (/\bvara\b|summer/.test(f)) return "vară";
  return fallback || null;
}

const tyreSize = (text) => text.match(TYRE_SIZE)?.[0].replace(/\s*\/\s*/, "/").replace(/\s*(z?r)\s*/i, (_, r) => ` ${r.toUpperCase()}`) || null;

const asText = (value) => (typeof value === "number" ? String(value) : clean(value));

/* o celulă de mentenanță („facut pe 14.05.2026 (210.000 km) 225.000") → evenimente + următoarea revizie */
export function parseWork(value, field, today = bucharestToday(), order = "dmy") {
  const spec = WORK_FIELDS[field];
  const res = { events: [], nextServiceKm: null, nextServiceDate: null, looseKms: [], warnings: [] };
  const text = asText(value);
  if (!text || isNegative(text)) return res;
  const warn = (msg) => res.warnings.push(`${spec.label}: ${msg}`);

  const found = findDates(text, today, order);
  for (const d of found.filter((x) => x.invalid)) warn(`data „${d.text}” nu există`);
  const done = [], upcoming = [];
  found.filter((d) => !d.invalid).forEach((d, i, all) => {
    const before = fold(text.slice(i ? all[i - 1].end : 0, d.start));
    (NEXT_WORDS.test(before) ? upcoming : done).push(d);
  });
  if (spec.type === "service") res.nextServiceDate = upcoming.find((d) => d.precision === "day")?.iso || null;

  const leadFirst = done.length > 1 && meaningful(text.slice(0, done[0].start));
  const segments = done.length
    ? done.map((d, i) => ({
      date: d,
      text: leadFirst
        ? text.slice(i ? done[i - 1].end : 0, i === done.length - 1 ? text.length : d.end)
        : text.slice(i ? d.start : 0, i + 1 < done.length ? done[i + 1].start : text.length),
    }))
    : [{ date: null, text }];

  for (const seg of segments) {
    const nums = findNumbers(seg.text, today);
    const qty = nums.find((n) => n.qty)?.value;
    const cost = nums.find((n) => n.money)?.value ?? null;
    const huge = nums.filter((n) => !n.qty && !n.money && n.value > MAX_KM);
    for (const n of huge) warn(hugeKmWarning(n.text));
    const kms = nums.filter((n) => !n.qty && !n.money && !huge.includes(n) && (n.labeled || n.value >= 100));
    const doneKm = kms.find((n) => n.labeled && !n.next) || kms.find((n) => !n.next);
    const nextKm = kms.find((n) => n.next) ||
      (spec.type === "service" && doneKm ? [...kms].reverse().find((n) => n !== doneKm && !n.labeled && n.value > doneKm.value && n.start > doneKm.start) : null);
    if (nextKm && spec.type === "service") res.nextServiceKm = Math.max(res.nextServiceKm || 0, nextKm.value);

    const d = seg.date;
    if (!d) {
      if (doneKm) res.looseKms.push(doneKm.value);
      else if (!nextKm && meaningful(text)) warn(`n-am înțeles „${text}”`);
      continue;
    }
    if (d.precision === "year") { warn(`„${d.text}” e doar un an — n-am adăugat în istoric`); continue; }
    if (d.precision === "month") warn(`doar luna (${d.text}) — am pus ${roDate(d.iso)}`);
    dateNotes(d).forEach(warn);
    if (d.iso > today) {
      if (spec.type === "service" && !res.nextServiceDate) { res.nextServiceDate = d.iso; warn(`${roDate(d.iso)} e în viitor — am pus-o ca dată a următoarei revizii`); }
      else warn(`${roDate(d.iso)} e în viitor — n-am adăugat în istoric`);
      continue;
    }

    const extra = leftover(seg.text, today);
    const approx = d.precision === "month" && "dată aproximativă";
    const note = spec.type === "tyres"
      ? [season(seg.text, spec.season), qty && `${qty} buc.`, tyreSize(seg.text), extra, approx].filter(Boolean).join(", ")
      : [extra, spec.type !== "service" && nextKm && `următoarea la ${nextKm.value.toLocaleString("ro-RO")} km`, approx].filter(Boolean).join(", ");
    const km = doneKm?.value ?? null;
    res.events.push({ kind: "maintenance", type: spec.type, date: d.iso, km, cost, note: note || null });
    for (const [type, re] of Object.entries(TYPE_WORDS)) {
      if (type !== spec.type && re.test(fold(seg.text))) res.events.push({ kind: "maintenance", type, date: d.iso, km, note: null });
    }
  }
  return res;
}

/* o celulă de document („30.06.27", „Groupama 01.07.26 - 30.06.27", „2028") → data de expirare */
export function parseDocument(value, type, today = bucharestToday(), order = "dmy") {
  const label = DOC_TYPES[type].label;
  const res = { doc: null, warnings: [] };
  const text = asText(value);
  if (!text || isNegative(text)) return res;
  const dates = typeof value === "number" ? [parseDate(value, today)].filter(Boolean) : findDates(text, today, order).filter((d) => !d.invalid);
  const exact = dates.filter((d) => d.precision !== "year");
  if (!exact.length) {
    res.warnings.push(dates.length ? `${label}: „${text}” e doar un an — completează data exactă după import` : `${label}: n-am găsit o dată în „${text}”`);
    return res;
  }
  const best = exact.reduce((a, b) => (b.iso > a.iso ? b : a));
  if (best.precision === "month") res.warnings.push(`${label}: doar luna (${best.text}) — am pus ${roDate(best.iso)}, verifică data exactă`);
  res.warnings.push(...dateNotes(best).map((w) => `${label}: ${w}`));
  if (best.iso < today) res.warnings.push(`${label} a expirat pe ${roDate(best.iso)}`);
  const provider = typeof value === "number" ? "" : leftover(text, today);
  res.doc = { type, expires: best.iso, provider: provider || null };
  return res;
}
