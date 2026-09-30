import { DOC_TYPES, normalizePlate } from "../../../shared/domain.js";
import { bucharestToday } from "../../../shared/dates.js";
import { fold, clean, smartCase, roMonth, roDate } from "./text.js";
import {
  parseDate, parseKm, kmTooLarge, hugeKmWarning, parseYear, parseFuel, parseCategory, parseEuroClass, parseVignetteCategory,
  formatPlate, cleanVin, validVin, dateOrder, dateNotes, fmtNum as fmt,
} from "./cells.js";
import { parseVehicleName, canonicalBrand, canonicalModel, brandOfModel } from "./names.js";
import { parseWork, parseDocument, WORK_FIELDS } from "./work.js";
import { PROVIDER_FIELDS } from "./headers.js";

const filled = (v) => typeof v === "number" || clean(v) !== "";
const NO_MODEL = "modelul lipsește — îl poți completa după import";

/* același eveniment = același fel și aceeași zi, fără niciun câmp completat diferit în ambele */
const COMPARED = ["type", "km", "cost", "liters", "label", "note"];
export const sameEvent = (a, b) => a.kind === b.kind && a.date === b.date && COMPARED.every((f) => a[f] == null || b[f] == null || a[f] === b[f]);
const fillFrom = (target, e) => { for (const [f, val] of Object.entries(e)) if (target[f] == null && val != null) target[f] = val; };

/* coloanele aceluiași rând descriu des aceeași lucrare de două ori (Revizii + Ultima revizie) */
function dedupeEvents(events) {
  const out = [];
  for (const e of events) {
    const prev = out.find((x) => sameEvent(x, e));
    if (prev) fillFrom(prev, e);
    else out.push({ ...e });
  }
  return out;
}

const agrees = (a, b) => COMPARED.some((f) => f !== "type" && a[f] != null && a[f] === b[f]);

/* evenimentele venite din altă parte (Istoric, alt rând) se lipesc de cel mult câte unul din bază, niciodată între ele:
   două alimentări în aceeași zi rămân două; întâi se potrivesc cele cu km / cost / notă identice */
export function mergeEvents(base, extra) {
  const out = base.map((e) => ({ ...e }));
  const free = [...out];
  const take = (e, strict) => {
    const i = free.findIndex((x) => sameEvent(x, e) && (!strict || agrees(x, e)));
    if (i >= 0) fillFrom(free.splice(i, 1)[0], e);
    return i >= 0;
  };
  const loose = extra.filter((e) => !take(e, true));
  for (const e of loose) if (!take(e, false)) out.push({ ...e });
  return out;
}

const SEASONS = ["vară", "iarnă", "mixte"];
export function tyresSummary(events) {
  const latest = {};
  for (const e of events.filter((x) => x.type === "tyres" && SEASONS.includes(x.note?.split(",")[0]))) {
    const s = e.note.split(",")[0];
    if (!latest[s] || e.date > latest[s]) latest[s] = e.date;
  }
  return SEASONS.filter((s) => latest[s]).map((s) => `${s} ${roMonth(latest[s])}`).join(" · ") || null;
}

function tyresState(value) {
  const f = fold(value);
  if (/verific|atent|uzat|schimb|attention|proast/.test(f)) return "attention";
  if (/\bbun|\bok\b|good|noi\b/.test(f)) return "good";
  return null;
}

/* un rând din fișier → mașina gata de trimis la import + avertismente în limbaj omenesc */
export function buildVehicle(cells, columns, { today = bucharestToday() } = {}) {
  const warnings = [];
  const entries = (field) => columns.filter((c) => c.field === field && filled(cells[c.index])).map((c) => ({ value: cells[c.index], order: c.dateOrder }));
  const values = (field) => entries(field).map((x) => x.value);
  const first = (field) => values(field)[0];

  const fromName = parseVehicleName(first("name"));
  let make = null, model = null;
  if (filled(first("make"))) {
    const text = clean(first("make"));
    const split = !filled(first("model")) && text.includes(" ") ? parseVehicleName(text) : null;
    make = canonicalBrand(text) || split?.make || smartCase(text);
    model = split?.model || null;
    if (split?.driver) fromName.driver ||= split.driver;
  }
  make ||= fromName.make;
  if (filled(first("model"))) {
    model = canonicalModel(clean(first("model")), make);
    make ||= brandOfModel(first("model"));
  }
  model ||= fromName.model;

  const plate = filled(first("plate")) ? formatPlate(first("plate")) : fromName.plate;
  const v = {
    make, model, plate,
    driver: filled(first("driver")) ? smartCase(first("driver")) : fromName.driver,
    year: null, fuel: null, category: null, vin: null, km: null,
    nextServiceKm: null, nextServiceDate: null, tyres: null, tyresNote: null, notes: null,
    euroClass: null, vignetteCategory: null, civ: null, firstRegistration: null,
    documents: [], events: [],
  };

  if (filled(first("vin"))) {
    v.vin = cleanVin(first("vin"));
    if (!validVin(v.vin)) warnings.push(`VIN-ul „${clean(first("vin"))}” nu are forma obișnuită (17 caractere)`);
  }
  if (filled(first("year"))) {
    v.year = parseYear(first("year"), today);
    if (!v.year) warnings.push(`anul de fabricație „${clean(first("year"))}” nu e valid`);
  }
  if (filled(first("fuel"))) {
    v.fuel = parseFuel(first("fuel"));
    if (!v.fuel) warnings.push(`combustibil necunoscut: „${clean(first("fuel"))}”`);
  }
  const hints = parseVehicleName([make, model].filter(Boolean).join(" "));
  v.fuel ||= fromName.fuel || hints.fuel;
  v.category = parseCategory(first("category")) || fromName.category || hints.category;
  if (filled(first("euroClass"))) {
    v.euroClass = parseEuroClass(first("euroClass"));
    if (!v.euroClass) warnings.push(`clasa Euro necunoscută: „${clean(first("euroClass"))}” (ex. Euro 6)`);
  }
  if (filled(first("vignetteCategory"))) {
    v.vignetteCategory = parseVignetteCategory(first("vignetteCategory"));
    if (!v.vignetteCategory && !/^[-—–]+$/.test(clean(first("vignetteCategory")))) warnings.push(`categoria de rovinietă „${clean(first("vignetteCategory"))}” nu e cunoscută (A, B, C, D)`);
  }
  if (filled(first("civ"))) {
    v.civ = clean(first("civ")).toUpperCase();
    if (v.civ.length > 20) warnings.push(`seria CIV „${v.civ}” are peste 20 de caractere — verifică-o după import`);
  }

  for (const { value, order } of entries("firstRegistration")) {
    const d = typeof value === "string" ? parseDate(value, today, order) : null;
    if (d?.iso && !v.firstRegistration) { v.firstRegistration = d.iso; warnings.push(...dateNotes(d).map((w) => `Prima înmatriculare: ${w}`)); }
    else if (!d?.iso && filled(value)) warnings.push(`data primei înmatriculări „${clean(value)}” nu e o dată completă`);
  }

  for (const type of Object.keys(DOC_TYPES)) {
    for (const { value, order } of entries(type)) {
      const r = parseDocument(value, type, today, order);
      warnings.push(...r.warnings);
      if (!r.doc) continue;
      const cur = v.documents.find((d) => d.type === type);
      if (!cur) v.documents.push(r.doc);
      else if (r.doc.expires > cur.expires) Object.assign(cur, r.doc);
    }
    const provider = first(PROVIDER_FIELDS[type]);
    if (!filled(provider)) continue;
    const doc = v.documents.find((d) => d.type === type);
    if (doc) doc.provider = clean(provider);
    else warnings.push(`${DOC_TYPES[type].label} furnizor „${clean(provider)}”: lipsește data de expirare, n-am păstrat furnizorul`);
  }

  const loose = [];
  for (const field of Object.keys(WORK_FIELDS)) {
    for (const { value, order } of entries(field)) {
      const r = parseWork(value, field, today, order);
      warnings.push(...r.warnings);
      v.events.push(...r.events);
      if (r.nextServiceKm) v.nextServiceKm = Math.max(v.nextServiceKm || 0, r.nextServiceKm);
      v.nextServiceDate ||= r.nextServiceDate;
      loose.push(...r.looseKms.map((km) => ({ km, field })));
    }
  }

  const serviceCell = entries("serviceDate")[0];
  const serviceDate = parseDate(serviceCell?.value, today, serviceCell?.order);
  const serviceKm = parseKm(first("serviceKm"));
  if (kmTooLarge(first("serviceKm"))) warnings.push(`Ultima revizie: ${hugeKmWarning(first("serviceKm"))}`);
  const lastService = serviceDate?.iso && serviceDate.iso <= today;
  warnings.push(...dateNotes(serviceDate).map((w) => `Ultima revizie: ${w}`));
  if (lastService) {
    if (serviceDate.precision === "month") warnings.push(`Ultima revizie: doar luna (${serviceDate.text}) — am pus ${roDate(serviceDate.iso)}`);
    const note = serviceDate.precision === "month" ? "dată aproximativă" : null;
    v.events.push({ kind: "maintenance", type: "service", date: serviceDate.iso, km: serviceKm, note });
  } else if (serviceDate?.iso) {
    v.nextServiceDate ||= serviceDate.iso;
    warnings.push(`Ultima revizie: ${roDate(serviceDate.iso)} e în viitor — am pus-o ca dată a următoarei revizii`);
  } else if (filled(first("serviceDate"))) warnings.push(`data ultimei revizii „${clean(first("serviceDate"))}” nu e o dată completă`);
  if (serviceKm && !lastService) loose.push({ km: serviceKm, field: "serviceKm" });

  for (const { value, order } of [...entries("nextServiceKm"), ...entries("nextServiceDate")]) {
    const d = typeof value === "string" ? parseDate(value, today, order) : null;
    if (d?.iso) { v.nextServiceDate ||= d.iso; warnings.push(...dateNotes(d).map((w) => `Următoarea revizie: ${w}`)); }
    else if (d) warnings.push(`următoarea revizie „${clean(value)}” e doar un an — completează data exactă după import`);
    else if (parseKm(value)) v.nextServiceKm = Math.max(v.nextServiceKm || 0, parseKm(value));
    else if (kmTooLarge(value)) warnings.push(`Următoarea revizie: ${hugeKmWarning(value)}`);
  }

  if (filled(first("tyresState"))) v.tyres = tyresState(first("tyresState"));
  v.events = dedupeEvents(v.events);
  v.tyresNote = filled(first("tyresNote")) ? clean(first("tyresNote")) : tyresSummary(v.events);

  const eventKm = Math.max(0, ...v.events.map((e) => e.km || 0));
  const kmCol = parseKm(first("km"));
  if (filled(first("km")) && !kmCol) warnings.push(kmTooLarge(first("km")) ? `kilometrajul ${hugeKmWarning(first("km"))}` : `kilometrajul „${clean(first("km"))}” nu e un număr`);
  v.km = Math.max(kmCol || 0, eventKm) || null;
  if (kmCol && eventKm > kmCol) warnings.push(`kilometrajul (${fmt(kmCol)}) e mai mic decât cel din istoric (${fmt(eventKm)}) — am păstrat ${fmt(eventKm)} km`);

  for (const { km, field } of loose) {
    const label = WORK_FIELDS[field]?.label || "Ultima revizie";
    if (field === "service" && km > (v.km || 0) && !v.nextServiceKm) {
      v.nextServiceKm = km;
      warnings.push(`${label}: ${fmt(km)} km fără dată — am considerat-o următoarea revizie`);
    } else if (field === "serviceKm" && km > (v.km || 0)) {
      v.km = km;
      warnings.push(`${label}: ${fmt(km)} km fără dată — l-am folosit doar ca kilometraj`);
    } else warnings.push(`${label}: ${fmt(km)} km fără dată — n-am adăugat în istoric`);
  }

  v.notes = [fromName.note, ...values("notes").map(clean)].filter(Boolean).join("; ") || null;
  if (!v.model && v.make && v.category !== "remorca" && v.category !== "rulota") warnings.push(NO_MODEL);

  return { vehicle: v, warnings, missing: missingOf(v) };
}

const repeatsHeader = (cells, columns) => columns.filter((c) => c.header && clean(cells[c.index]) === c.header).length >= 2;

const joinRo = (list) => (list.length > 1 ? `${list.slice(0, -1).join(", ")} și ${list.at(-1)}` : String(list[0]));
const blankValue = (x) => x == null || x === "";

/* același număr pe mai multe rânduri → o singură mașină: documentul care expiră mai târziu, evenimentele fără dubluri,
   primul câmp completat (kilometrajul cel mai mare, observațiile adunate) */
function combineInto(a, b) {
  const v = a.vehicle, w = b.vehicle;
  for (const [k, val] of Object.entries(w)) {
    if (k === "documents" || k === "events" || blankValue(val)) continue;
    if (k === "km") v.km = Math.max(v.km || 0, val);
    else if (k === "notes" && v.notes && !v.notes.split("; ").includes(val)) v.notes = `${v.notes}; ${val}`;
    else if (blankValue(v[k])) v[k] = val;
  }
  for (const d of w.documents) {
    const cur = v.documents.find((x) => x.type === d.type);
    if (!cur) v.documents.push({ ...d });
    else if (d.expires > cur.expires) Object.assign(cur, d, { provider: d.provider || cur.provider });
    else cur.provider ||= d.provider;
  }
  v.events = mergeEvents(v.events, w.events);
  a.warnings.push(...b.warnings.map((x) => `rândul ${b.row}: ${x}`));
  a.combined = [...(a.combined || [a.row]), b.row];
}

const missingOf = (v) => [!v.make && "marca", !v.plate && "numărul de înmatriculare"].filter(Boolean);

/* tot tabelul → rânduri de previzualizare; mașinile existente (după număr) sunt marcate */
export function buildRows(rows, header, columns, { existing = [], today = bucharestToday() } = {}) {
  const known = new Map(existing.map((v) => [normalizePlate(v.plate), v]));
  const start = header.index + (header.depth || 1);
  const body = rows.slice(start);
  const cols = columns.map((c) => (c.field ? { ...c, dateOrder: dateOrder(body.map((r) => r[c.index])) } : c));
  const out = [], byKey = new Map();
  body.forEach((cells, i) => {
    if (!cols.some((c) => c.field && filled(cells[c.index])) || repeatsHeader(cells, cols)) return;
    const r = { row: start + i + 1, ...buildVehicle(cells, cols, { today }) };
    r.key = normalizePlate(r.vehicle.plate);
    const first = r.key && byKey.get(r.key);
    if (first) return combineInto(first, r);
    if (r.key) byKey.set(r.key, r);
    out.push(r);
  });
  for (const r of out) {
    r.existing = known.get(r.key) || null;
    if (r.combined) {
      r.vehicle.tyresNote ||= tyresSummary(r.vehicle.events);
      r.note = `combinat din rândurile ${joinRo(r.combined)}`;
    }
    /* o foaie doar cu numere și date noi completează mașinile din garaj, fără să ceară din nou marca */
    r.missing = missingOf(r.vehicle).filter((m) => !(r.existing && m === "marca"));
    if (r.vehicle.model || r.existing?.model) r.warnings = r.warnings.filter((w) => !w.endsWith(NO_MODEL));
    r.status = r.missing.length ? "invalid" : r.existing ? "existing" : "new";
  }
  return out;
}

export const importable = (rows) => rows.filter((r) => r.status === "new" || r.status === "existing");

/* pentru trimitere: fără câmpuri goale */
export function payload(vehicle) {
  const out = {};
  for (const [k, val] of Object.entries(vehicle)) {
    if (val == null || val === "" || (Array.isArray(val) && !val.length)) continue;
    out[k] = Array.isArray(val) ? val.map((x) => Object.fromEntries(Object.entries(x).filter(([, y]) => y != null && y !== ""))) : val;
  }
  return out;
}
