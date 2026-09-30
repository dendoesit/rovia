import { FUELS, CATEGORIES } from "../../../shared/domain.js";
import { EURO_CLASSES, VIGNETTE_CATEGORIES } from "../../../shared/renewals.js";
import { bucharestToday } from "../../../shared/dates.js";
import { fold, clean, pad2, roDate } from "./text.js";

/* ---------- date ---------- */

const MONTHS = { ian: 1, jan: 1, feb: 2, mar: 3, apr: 4, mai: 5, may: 5, iun: 6, jun: 6, iul: 7, jul: 7, aug: 8, sep: 9, oct: 10, noi: 11, nov: 11, dec: 12 };

const DATE_RE = new RegExp([
  String.raw`\b(?<iy>\d{4})(?<is>[-./])(?<im>\d{1,2})\k<is>(?<id>\d{1,2})(?!\d)`,
  String.raw`\b(?<d>\d{1,2})\s*(?<s>[./-])\s*(?<m>\d{1,2})\s*\k<s>\s*(?<y>\d{4}|\d{2})(?!\d)`,
  String.raw`(?:\b(?<nd>\d{1,2})\s*)?\b(?!noi\b(?!\.))(?<mn>${Object.keys(MONTHS).join("|")})[a-z]*\.?\s*,?\s*(?<ny>\d{4})\b`,
  String.raw`\b(?<mm>\d{1,2})\s*[./-]\s*(?<my>\d{4})\b(?!\s*km)`,
  String.raw`\b(?<yy>19[5-9]\d|20\d\d)\b(?![.,]\d)(?!\s*km)`,
].join("|"), "gi");

const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const validYear = (y) => y >= 1950 && y <= 2100;
const iso = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;

/* anii din două cifre: până la 20 de ani în viitor → 20xx, restul → 19xx */
const fullYear = (y, today) => (y >= 100 ? y : y <= +today.slice(2, 4) + 20 ? 2000 + y : 1900 + y);

function toDate(g, today, order) {
  if (g.iy) {
    const y = +g.iy, m = +g.im, d = +g.id;
    return validYear(y) && m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m) ? { iso: iso(y, m, d), precision: "day" } : null;
  }
  if (g.d) {
    let d = +g.d, m = +g.m;
    const y = fullYear(+g.y, today);
    const unclear = g.s === "/" && d <= 12 && m <= 12 && d !== m;
    const swapped = (m > 12 && d <= 12) || (order === "mdy" && unclear);
    if (swapped) [d, m] = [m, d];
    const ambiguous = order === "mixed" && unclear;
    return validYear(y) && m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m) ? { iso: iso(y, m, d), precision: "day", swapped, ambiguous } : null;
  }
  if (g.mn) {
    const y = +g.ny, m = MONTHS[g.mn.toLowerCase().slice(0, 3)], d = g.nd ? +g.nd : null;
    if (!validYear(y)) return null;
    if (d) return d <= daysIn(y, m) ? { iso: iso(y, m, d), precision: "day" } : null;
    return { iso: iso(y, m, 1), precision: "month" };
  }
  if (g.mm) {
    const m = +g.mm, y = +g.my;
    return validYear(y) && m >= 1 && m <= 12 ? { iso: iso(y, m, 1), precision: "month" } : null;
  }
  return { iso: null, year: +g.yy, precision: "year" };
}

/* toate datele dintr-un text liber, în ordine; cele imposibile (31.02) vin marcate invalid.
   order = ordinea zi/lună a coloanei (vezi dateOrder): "dmy", "mdy" sau "mixed" */
export function findDates(text, today = bucharestToday(), order = "dmy") {
  const out = [];
  for (const m of String(text ?? "").matchAll(DATE_RE)) {
    const parsed = toDate(m.groups, today, order);
    out.push({ ...(parsed || { invalid: true }), text: m[0].trim(), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
export const serialToIso = (n, date1904 = false) =>
  new Date(EXCEL_EPOCH + (Math.floor(n) + (date1904 ? 1462 : 0)) * 86_400_000).toISOString().slice(0, 10);
export const isoToSerial = (ds) => (Date.UTC(+ds.slice(0, 4), +ds.slice(5, 7) - 1, +ds.slice(8, 10)) - EXCEL_EPOCH) / 86_400_000;

/* o singură dată dintr-o celulă: număr serial Excel, text sau an singur */
export function parseDate(value, today = bucharestToday(), order = "dmy") {
  if (typeof value === "number") {
    if (value >= 20000 && value <= 80000) return { iso: serialToIso(value), precision: "day" };
    if (Number.isInteger(value) && validYear(value)) return { iso: null, year: value, precision: "year" };
    return null;
  }
  return findDates(value, today, order).find((d) => !d.invalid) || null;
}

/* „3/25/2027" are sens doar ca lună/zi: o coloană cu astfel de date și fără nicio zi/lună clară se citește toată lună/zi;
   dacă apar ambele feluri, datele neclare primesc avertisment */
export function dateOrder(values) {
  let dmy = 0, mdy = 0;
  for (const v of values) {
    if (typeof v !== "string" || !v.includes("/")) continue;
    for (const { groups: g } of v.matchAll(DATE_RE)) {
      if (g.s !== "/") continue;
      if (+g.m > 12 && +g.d <= 12) mdy++;
      else if (+g.d > 12 && +g.m <= 12) dmy++;
    }
  }
  return !mdy ? "dmy" : dmy ? "mixed" : "mdy";
}

export const dateNotes = (d) => [
  d?.swapped && `am citit „${d.text}” ca ${roDate(d.iso)}`,
  d?.ambiguous && `„${d.text}” poate fi ${roDate(d.iso)} sau ${roDate(swapIso(d.iso))} — am pus ${roDate(d.iso)}, verifică`,
].filter(Boolean);
const swapIso = (ds) => `${ds.slice(0, 4)}-${ds.slice(8, 10)}-${ds.slice(5, 7)}`;

/* ---------- numere ---------- */

export const MAX_KM = 3_000_000;
export const fmtNum = (n) => Math.round(n).toLocaleString("ro-RO");

/* grupele de mii au același separator: „185.000 200.000” sunt două numere, nu unul */
const NUM_RE = /\d{1,3}(?:[.,]+\d{3})+(?!\d)|\d{1,3}(?:[ \u00a0]\d{3})+(?![\d.,]*\d)|\d+(?:[.,]\d+)?/g;
const NEXT_HINT = /(urm|next|scaden|viitoar|pana la|>)[^\d]*$/;
const QTY_AFTER = /^\s*(x\b|buc|bucat|cumparat|anvelop|roti|pneu|set)/;
const MONEY_AFTER = /^\s*(lei|ron|eur|euro|€)(?![a-z])/;
const MONEY_BEFORE = /(€|\b(eur|euro|ron|lei|cost|pret)\s*:?)\s*$/;
export const TYRE_SIZE = /(?<![\d.,])\d{3}\s*\/\s*\d{2}(?!\d)(?:\s*z?r\s*\d{2}(?:\s*c\b)?)?/gi;

function numberValue(raw) {
  if (/^\d{1,3}(?:(?:[.,]+\d{3})+|(?:[ \u00a0]\d{3})+)$/.test(raw)) return +raw.replace(/\D/g, "");
  return +raw.replace(",", ".");
}

const blank = (text, start, end) => text.slice(0, start) + " ".repeat(end - start) + text.slice(end);

/* „185 000 200 000" sunt doi km, nu unul de 185 de miliarde: tăiem doar în bucăți cu grupe de mii (doar ultima poate fi
   fără, ca în „150 000 200 lei"); „3 500 000" nu se poate tăia așa, rămâne un număr prea mare și primește avertisment */
function splitSpaced(raw, start) {
  const groups = raw.split(/[ \u00a0]/);
  if (+groups.join("") <= MAX_KM) return [{ raw, start }];
  const cuts = (i) => {
    if (i === groups.length) return [];
    if (i > 0 && groups[i][0] === "0") return null;
    for (let j = groups.length; j > i; j--) {
      if ((j < groups.length && j - i < 2) || +groups.slice(i, j).join("") > MAX_KM) continue;
      const rest = cuts(j);
      if (rest) return [[i, j], ...rest];
    }
    return null;
  };
  const at = (i) => groups.slice(0, i).join(" ").length + (i ? 1 : 0);
  return cuts(0)?.map(([i, j]) => ({ raw: raw.slice(at(i), at(i) + groups.slice(i, j).join(" ").length), start: start + at(i) })) || [{ raw, start }];
}

/* numerele dintr-un text, fără cele care fac parte din date, dimensiuni de anvelope sau cuvinte (4x4, 70Ah) */
export function findNumbers(text, today = bucharestToday()) {
  let masked = String(text ?? "");
  for (const d of findDates(masked, today)) masked = blank(masked, d.start, d.end);
  for (const m of masked.matchAll(TYRE_SIZE)) masked = blank(masked, m.index, m.index + m[0].length);
  const low = fold(masked);
  const out = [];
  let prevEnd = 0;
  const pieces = [...masked.matchAll(NUM_RE)].flatMap((m) => (/[ \u00a0]/.test(m[0]) ? splitSpaced(m[0], m.index) : [{ raw: m[0], start: m.index }]));
  for (const { raw, start } of pieces) {
    const end = start + raw.length;
    const after = low.slice(end), before = low.slice(prevEnd, start);
    const unit = after.match(/^\s*(km|kilometri|mii|k)\b/);
    prevEnd = end + (unit ? unit[0].length : 0);
    if ((/^[a-z]/.test(after) && !unit) || /[a-z]$/.test(low.slice(0, start))) continue;
    let value = numberValue(raw);
    const thousands = /^(mii|k)$/.test(unit?.[1] || "");
    if (thousands) value *= 1000;
    const labeled = thousands || /^\s*(km|kilometri)\b/.test(after) || /km\s*[:.]?\s*$/.test(before) || (/\(\s*$/.test(before) && /^\s*(km\s*)?\)/.test(after));
    out.push({
      value,
      text: raw,
      start, end,
      labeled,
      next: NEXT_HINT.test(before),
      qty: Number.isInteger(value) && value <= 20 && (QTY_AFTER.test(after) || /\bx\s*$/.test(before)),
      money: !labeled && (MONEY_AFTER.test(after) || MONEY_BEFORE.test(before)),
    });
  }
  return out;
}

function rawKm(value) {
  if (typeof value === "number") return value > 0 ? Math.round(value) : null;
  const digits = clean(value);
  if (/^\d+$/.test(digits)) return +digits || null;
  const n = findNumbers(value).filter((x) => !x.qty && !x.money)[0];
  return n && n.value > 0 ? Math.round(n.value) : null;
}
export const kmTooLarge = (value) => rawKm(value) > MAX_KM;
export function parseKm(value) {
  const km = rawKm(value);
  return km && km <= MAX_KM ? km : null;
}
export const hugeKmWarning = (text) => `„${clean(text)}” înseamnă peste ${fmtNum(MAX_KM)} km — nu l-am folosit`;

export function parseMoney(value) {
  if (typeof value === "number") return value;
  let s = String(value ?? "").replace(/[^\d.,-]/g, "");
  if (!/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    s = s.replace(dec === "." ? /,/g : /\./g, "").replace(",", ".");
  } else if (lastComma >= 0) {
    s = /,\d{3}$/.test(s) && !/,\d{1,2}$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function parseYear(value, today = bucharestToday()) {
  if (typeof value === "number") return Number.isInteger(value) && validYear(value) ? String(value) : null;
  const d = parseDate(value, today);
  const y = d?.precision === "year" ? d.year : d?.iso ? +d.iso.slice(0, 4) : null;
  return y && validYear(y) ? String(y) : null;
}

/* ---------- câmpuri simple ---------- */

const RO_PLATE = /\b(B|[A-Z]{2})[\s-]*(\d{2,3})[\s-]*([A-Z]{3})\b/;
export const findPlate = (text) => {
  const m = String(text ?? "").toUpperCase().match(RO_PLATE);
  return m && (m[2].length === 2 || m[1] === "B") ? `${m[1]} ${m[2]} ${m[3]}` : null;
};
export const formatPlate = (text) => findPlate(text) || clean(String(text ?? "").toUpperCase()) || null;
export const looksLikePlate = (text) => !!findPlate(text) && clean(text).length <= 12;

export const cleanVin = (text) => String(text ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") || null;
export const validVin = (vin) => /^[A-HJ-NPR-Z0-9]{17}$/.test(vin || "");

const FUEL_WORDS = [
  ["Hibrid plug-in", /plug|phev/],
  ["Hibrid", /hibrid|hybrid|\bhev\b|mhev/],
  ["Electric", /electric|\bev\b|\bbev\b/],
  ["GPL", /gpl|lpg/],
  ["Motorină", /motorin|diesel|tdi|dci|cdi|hdi|crdi|tdci|jtd/],
  ["Benzină", /benzin|petrol|gasoline|tsi|tfsi|tce|\bmpi\b/],
];
const FUEL_LETTERS = { b: "Benzină", d: "Motorină", m: "Motorină", e: "Electric", h: "Hibrid" };
export function parseFuel(value) {
  const f = fold(value).trim();
  if (!f) return null;
  return FUELS.find((x) => fold(x) === f) || FUEL_LETTERS[f] || FUEL_WORDS.find(([, re]) => re.test(f))?.[0] || null;
}
export const fuelHint = (text) => FUEL_WORDS.find(([, re]) => re.test(fold(text)))?.[0] || null;

const CATEGORY_WORDS = [
  ["remorca", /remorc|rulot|trailer|semiremorc/],
  ["moto", /moto|scuter|atv/],
  ["camion", /camion|truck|tir\b|cap tractor|basculant|autobuz/],
  ["utilitara", /utilitar|\bvan\b|duba|furgon|microbuz|autoutilitar/],
  ["autoturism", /autoturism|turism|\bcar\b|\bauto\b|masina|sedan|break|suv/],
];
export function parseCategory(value) {
  const f = fold(value).trim();
  if (!f) return null;
  return Object.keys(CATEGORIES).find((k) => k === f || fold(CATEGORIES[k]) === f) || CATEGORY_WORDS.find(([, re]) => re.test(f))?.[0] || null;
}

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };
export function parseEuroClass(value) {
  const f = fold(value).trim();
  if (!f) return null;
  const known = Object.keys(EURO_CLASSES).find((k) => k === f || fold(EURO_CLASSES[k]) === f);
  if (known) return known;
  if (/electric|\bev\b|\bbev\b|zero emisii/.test(f)) return "electric";
  const m = f.match(/^(?:clasa\s*)?(?:euro|e)?[\s-]*([1-6]|vi|iv|v|i{1,3})(?:[a-d]|\b)/);
  if (!m) return null;
  const n = ROMAN[m[1]] || +m[1];
  return n <= 3 ? "euro3" : `euro${n}`;
}

export function parseVignetteCategory(value) {
  const f = fold(value).trim();
  if (!f || /^[-—–]+$/.test(f)) return null;
  const known = Object.keys(VIGNETTE_CATEGORIES).find((k) => fold(k) === f || fold(VIGNETTE_CATEGORIES[k]) === f);
  if (known) return known;
  if (/toll|pe km|peste 3[.,]5/.test(f)) return "tollro";
  if (/^(nu|fara|scutit)\b|nu are nevoie|nu e cazul/.test(f)) return "none";
  const letter = f.match(/^(?:categoria?\s*)?([abcd])(?![a-z])/);
  return letter ? letter[1].toUpperCase() : null;
}

export const isNegative = (value) => /^\s*(-+|—|–|x|nu|nu are|nu e cazul|n\/?a|fara|lipsa|0)\s*\.?\s*$/.test(fold(value));
