import { DOC_TYPES, MAINT_TYPES, normalizePlate } from "../../../shared/domain.js";
import { bucharestToday } from "../../../shared/dates.js";
import { EXPENSE_TYPES } from "../model.js";
import { fold, clean, roDate } from "./text.js";
import { parseDate, parseKm, kmTooLarge, hugeKmWarning, parseMoney, dateOrder, dateNotes } from "./cells.js";
import { FIELDS, detectHeader, matchHeader } from "./headers.js";
import { TYPE_WORDS } from "./work.js";

export const HISTORY_FIELDS = {
  date:    { label: "Data", match: [["data"], ["date"], ["ziua"]] },
  vehicle: { label: "Mașină", match: [["masin"], ["auto"], ["vehicul"]] },
  plate:   { label: "Nr. înmatriculare", match: FIELDS.plate.match },
  type:    { label: "Tip", match: [["tip"], ["eveniment"], ["operatiune"], ["type"]] },
  cost:    { label: "Cost", match: [["cost"], ["suma"], ["pret"], ["valoare"], ["amount"]] },
  km:      { label: "Km", match: FIELDS.km.match },
  liters:  { label: "Litri", match: [["litri"], ["liters"], ["litres"], ["cantitate"]] },
  note:    { label: "Notă", match: [["nota"], ["note"], ["observat"], ["detalii"], ["descriere"]] },
};

const MAINT_WORDS = { ...TYPE_WORDS, repair: /repar/ };

/* exportul scrie „Cheltuială" pentru „Altele" (fără etichetă), ca în formularul de cheltuieli */
const expenseType = (f) =>
  f === "cheltuiala" ? "altele" : Object.keys(EXPENSE_TYPES).find((t) => f === fold(t) || f === fold(EXPENSE_TYPES[t].label)) || null;

/* „Tip" din foaia Istoric (aceleași etichete pe care le scrie exportul) → tipul evenimentului */
export function eventFromCells({ date, type, cost, km, liters, note }) {
  const title = clean(type), f = fold(title);
  const base = { date, cost: parseMoney(cost), km: parseKm(km), liters: null, note: clean(note) || null };
  if (/aliment|combustibil|carburant|fuel|plin\b/.test(f)) return { ...base, kind: "fuel", liters: parseMoney(liters) };
  if (/^(kilometraj|odometr|citire km)/.test(f)) return { ...base, kind: "odometer", cost: null };
  const expense = expenseType(f);
  if (expense) return { ...base, kind: "expense", type: expense, label: expense === "altele" ? null : EXPENSE_TYPES[expense].label };
  const doc = Object.keys(DOC_TYPES).find((t) => f.startsWith(fold(DOC_TYPES[t].label)));
  if (doc) return { ...base, kind: "document", type: doc, title };
  const maint = Object.keys(MAINT_TYPES).find((t) => f === fold(MAINT_TYPES[t].label)) ||
    Object.keys(MAINT_WORDS).find((t) => MAINT_WORDS[t].test(f));
  if (maint || /mentenant/.test(f)) return { ...base, kind: "maintenance", type: maint || null };
  return { ...base, kind: "expense", label: title || "Cheltuială" };
}

export const isHistorySheet = (sheet) => /istoric|history|evenimente|jurnal/.test(fold(sheet.name));

/* warnings: avertismentele fiecărei mașini (după număr), afișate pe rândul ei din previzualizare */
export function parseHistory(rows, today = bucharestToday()) {
  const header = detectHeader(rows, HISTORY_FIELDS);
  const byPlate = new Map(), warnings = new Map();
  let skipped = 0;
  if (header.index < 0) return { byPlate, warnings, skipped, count: 0 };
  const cols = header.headers.map((h) => matchHeader(h, HISTORY_FIELDS) || null);
  const pick = (cells, field) => cells[cols.indexOf(field)];
  const body = rows.slice(header.index + header.depth);
  const order = dateOrder(body.map((cells) => pick(cells, "date")));
  const add = (map, key, item) => map.set(key, [...(map.get(key) || []), item]);
  let count = 0;
  for (const cells of body) {
    if (!cells.some((c) => clean(c))) continue;
    const date = parseDate(pick(cells, "date"), today, order);
    const key = normalizePlate(pick(cells, "plate"));
    if (!date?.iso || !key || date.iso > today) { skipped++; continue; }
    const cellsBy = Object.fromEntries(Object.keys(HISTORY_FIELDS).map((k) => [k, pick(cells, k)]));
    const e = eventFromCells({ ...cellsBy, date: date.iso });
    for (const w of dateNotes(date)) add(warnings, key, `Istoric: ${w}`);
    if (kmTooLarge(cellsBy.km)) add(warnings, key, `Istoric ${roDate(date.iso)}: ${hugeKmWarning(cellsBy.km)}`);
    add(byPlate, key, e);
    count++;
  }
  return { byPlate, warnings, skipped, count };
}
