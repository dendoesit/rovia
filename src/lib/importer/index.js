import { bucharestToday } from "../../../shared/dates.js";
import { fold } from "./text.js";
import { isExampleRow } from "../exporter.js";
import { detectHeader, autoColumns } from "./headers.js";
import { buildRows, mergeEvents, tyresSummary, importable, payload } from "./build.js";
import { isHistorySheet, parseHistory } from "./history.js";

export { FIELDS, matchHeader, detectHeader, autoColumns } from "./headers.js";
export { buildVehicle, buildRows, payload } from "./build.js";
export { parseVehicleName } from "./names.js";
export { parseWork, parseDocument } from "./work.js";
export { findDates, parseDate, parseKm, formatPlate, dateOrder, MAX_KM } from "./cells.js";
export { readFile, docxTables, sheetsFromWorkbook, MAX_ROWS, MAX_COLS } from "./read.js";
export { roDate } from "./text.js";

const isInstructions = (sheet) => /instructiun|instructions|legenda|ajutor/.test(fold(sheet.name));

/* foaia cu mașini = cea cu cel mai bun antet; „Istoric", dacă există, se atașează după număr */
export function pickSheets(sheets) {
  const history = sheets.findIndex(isHistorySheet);
  let main = -1, best = -1;
  sheets.forEach((s, i) => {
    if (i === history || isInstructions(s)) return;
    const h = detectHeader(s.rows);
    const score = h.index < 0 ? 0 : h.headers.filter(Boolean).length;
    if (score > best) { best = score; main = i; }
  });
  if (main < 0) return { main: Math.max(history, 0), history: -1 };
  return { main, history };
}

export function sheetSetup(sheet) {
  const header = detectHeader(sheet.rows);
  return { header, columns: autoColumns(sheet.rows, header) };
}

/* rândul ales de utilizator ca antet (−1 = fără antet) */
export function headerAt(sheet, index) {
  if (index < 0) return { index: -1, headers: [], depth: 1 };
  return { index, headers: (sheet.rows[index] || []).map((c) => String(c ?? "").trim()), depth: 1 };
}

/* foaia de istoric se citește o singură dată, nu la fiecare coloană schimbată în previzualizare */
const historyCache = new WeakMap();
function historyOf(rows, today) {
  const cached = historyCache.get(rows);
  if (cached?.today === today) return cached.result;
  const result = parseHistory(rows, today);
  historyCache.set(rows, { today, result });
  return result;
}

export function preview({ sheets, main, history = -1, header, columns, existing = [], today = bucharestToday() }) {
  const rows = buildRows(sheets[main].rows, header, columns, { existing, today });
  for (const r of rows) if (r.status === "new" && isExampleRow(r.vehicle)) r.status = "example";
  const info = { events: 0, attached: 0, orphans: 0, skipped: 0 };
  if (history >= 0 && history !== main) {
    const h = historyOf(sheets[history].rows, today);
    info.events = h.count;
    info.skipped = h.skipped;
    const byKey = new Map(importable(rows).map((r) => [r.key, r]));
    for (const [key, events] of h.byPlate) {
      const r = byKey.get(key);
      if (!r) { info.orphans += events.length; continue; }
      const v = r.vehicle;
      const before = v.events.length;
      v.events = mergeEvents(v.events, events);
      r.warnings.push(...(h.warnings.get(key) || []));
      info.attached += v.events.length - before;
      v.km = Math.max(v.km || 0, ...events.map((e) => e.km || 0)) || null;
      v.tyresNote ||= tyresSummary(v.events);
    }
  }
  return { rows, history: info };
}

export const toPayload = (rows) => importable(rows).map((r) => payload(r.vehicle));

/* loturi mici: fiecare cerere trebuie să încapă în limita de mărime și de timp a funcției de pe server */
export const IMPORT_CHUNK = { count: 25, bytes: 1_000_000 };
export function importChunks(items, size = (x) => JSON.stringify(x).length, { count, bytes } = IMPORT_CHUNK) {
  const out = [];
  let chunk = [], total = 0;
  for (const item of items) {
    const n = size(item);
    if (chunk.length && (chunk.length >= count || total + n > bytes)) { out.push(chunk); chunk = []; total = 0; }
    chunk.push(item);
    total += n;
  }
  if (chunk.length) out.push(chunk);
  return out;
}

/* items = [{ row, data }]; lot cu lot, apoi garajul se reîncarcă o singură dată —
   dacă reîncărcarea eșuează, mașinile deja salvate rămân în raport ca salvate */
export async function importInChunks(items, { send, reload, onProgress = () => {} }) {
  const report = { created: [], updated: [], skipped: [], errors: [] };
  const chunks = importChunks(items, (x) => JSON.stringify(x.data).length);
  let done = 0;
  for (const [i, chunk] of chunks.entries()) {
    try {
      const r = await send(chunk.map((x) => x.data));
      for (const k of Object.keys(report)) report[k].push(...(r[k] || []).map((x) => ({ ...x, row: chunk[x.row]?.row ?? x.row })));
    } catch (e) {
      report.errors.push(...chunks.slice(i).flat().map((x) => ({ row: x.row, plate: x.data.plate, error: e.message })));
      break;
    }
    done += chunk.length;
    onProgress(done);
  }
  let reloaded = true;
  try { await reload(); } catch { reloaded = false; }
  return { report, reloaded };
}
