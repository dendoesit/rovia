import { CATEGORIES, DOC_TYPES, FUELS, normalizePlate } from "../../shared/domain.js";
import { bucharestToday, addMonthsTo } from "../../shared/dates.js";
import { latestDocs, vehicleName } from "../../shared/alerts.js";
import { EURO_CLASSES, VIGNETTE_CATEGORIES } from "../../shared/renewals.js";
import { eventTitle, currencySymbol } from "./model.js";
import { isoToSerial } from "./importer/cells.js";
import { roDate } from "./importer/text.js";

const lastService = (v) =>
  (v.events || []).filter((e) => e.kind === "maintenance" && e.type === "service" && e.date).sort((a, b) => b.date.localeCompare(a.date))[0] || null;
const docDate = (type) => (v) => latestDocs(v)[type]?.expires || null;
const provider = (type, width = 14) => ({ header: `${DOC_TYPES[type].label} furnizor`, width, get: (v) => latestDocs(v)[type]?.provider || null });

const TEMPLATE_COLUMNS = [
  { header: "Marcă", width: 12, get: (v) => v.make },
  { header: "Model", width: 14, get: (v) => v.model },
  { header: "Nr. înmatriculare", width: 16, get: (v) => v.plate },
  { header: "Kilometraj", width: 11, get: (v) => v.km },
  { header: "An fabricație", width: 12, get: (v) => (v.year ? +v.year : null) },
  { header: "Combustibil", width: 13, get: (v) => v.fuel },
  { header: "Categorie", width: 14, get: (v) => CATEGORIES[v.category] || null },
  { header: "Șofer", width: 16, get: (v) => v.driver },
  { header: "VIN", width: 20, get: (v) => v.vin },
  { header: "Serie CIV", width: 12, get: (v) => v.civ },
  { header: "RCA expiră", width: 12, date: true, get: docDate("rca") },
  provider("rca"),
  { header: "CASCO expiră", width: 12, date: true, get: docDate("casco") },
  provider("casco"),
  { header: "ITP expiră", width: 12, date: true, get: docDate("itp") },
  { header: "Rovinietă expiră", width: 14, date: true, get: docDate("rovinieta") },
  { header: "Clasa Euro", width: 12, get: (v) => EURO_CLASSES[v.euroClass] || null },
  { header: "Categorie rovinietă", width: 24, get: (v) => VIGNETTE_CATEGORIES[v.vignetteCategory] || null },
  { header: "Ultima revizie (data)", width: 14, date: true, get: (v) => lastService(v)?.date },
  { header: "Ultima revizie (km)", width: 14, get: (v) => lastService(v)?.km },
  { header: "Următoarea revizie (km)", width: 16, get: (v) => v.nextServiceKm },
  { header: "Observații", width: 28, get: (v) => v.notes },
];
const EXPORT_EXTRAS = [
  { header: "Următoarea revizie (data)", width: 16, date: true, get: (v) => v.nextServiceDate },
  { header: "Garanție expiră", width: 13, date: true, get: docDate("warranty") },
  { header: "Leasing expiră", width: 13, date: true, get: docDate("leasing") },
  provider("itp"), provider("rovinieta"), provider("warranty"), provider("leasing"),
  { header: "Stare anvelope", width: 13, get: (v) => ({ good: "Bune", attention: "De verificat" })[v.tyres] || null },
  { header: "Notă anvelope", width: 24, get: (v) => v.tyresNote },
];
export const EXPORT_HEADERS = [...TEMPLATE_COLUMNS, ...EXPORT_EXTRAS].map((c) => c.header);
export const TEMPLATE_HEADERS = TEMPLATE_COLUMNS.map((c) => c.header);
export const TEMPLATE_FILE = "FleetDeck-model-import.xlsx";

export const EXAMPLE_PLATES = ["B 123 ABC", "CJ 45 XYZ"];
function exampleVehicles(today) {
  const m = (n) => addMonthsTo(today, n);
  return [
    { make: "Dacia", model: "Logan", plate: EXAMPLE_PLATES[0], km: 84500, year: "2019", fuel: "Benzină", category: "autoturism", driver: "Ion Popescu",
      vin: "UU1LSDAAH12345678", civ: "J123456", euroClass: "euro6", vignetteCategory: "A", nextServiceKm: 95000, notes: "Rând de exemplu — șterge-l înainte de import",
      documents: [{ type: "rca", expires: m(5), provider: "Allianz" }, { type: "itp", expires: m(14) }, { type: "rovinieta", expires: m(3) }],
      events: [{ kind: "maintenance", type: "service", date: m(-4), km: 80000 }] },
    { make: "Ford", model: "Transit", plate: EXAMPLE_PLATES[1], km: 162300, year: "2017", fuel: "Motorină", category: "utilitara", driver: "Maria Ionescu",
      euroClass: "euro6", vignetteCategory: "B", nextServiceKm: 170000, notes: "Rând de exemplu — șterge-l înainte de import",
      documents: [{ type: "rca", expires: m(2), provider: "Groupama" }, { type: "casco", expires: m(8), provider: "Omniasig" }, { type: "itp", expires: m(6) }, { type: "rovinieta", expires: m(11) }],
      events: [{ kind: "maintenance", type: "service", date: m(-2), km: 155000 }] },
  ];
}
export const isExampleRow = (v) => EXAMPLE_PLATES.some((p) => normalizePlate(p) === normalizePlate(v.plate)) && ["Dacia", "Ford"].includes(v.make);

const INSTRUCTIONS = [
  "Cum completezi fișierul de import FleetDeck",
  "",
  "• Fiecare rând din foaia „Mașini” este o mașină. Obligatorii sunt doar Marca și Nr. înmatriculare; restul coloanelor le completezi dacă le ai.",
  "• Datele: 15.03.2027, 15.03.27, 2027-03-15 sau celule de tip dată din Excel. Dacă știi doar luna (03.2027), se pune ziua 1 și primești un avertisment.",
  "• Kilometrajul: 185000 sau 185.000, fără zecimale.",
  `• Combustibil: ${FUELS.join(", ")}.`,
  `• Categorie: ${Object.values(CATEGORIES).join(", ")}.`,
  `• ${["rca", "casco", "itp", "rovinieta"].map((t) => DOC_TYPES[t].label).join(" / ")}: data la care expiră documentul; în coloanele „furnizor” scrii asigurătorul (Allianz, Groupama…).`,
  `• Clasa Euro: ${Object.values(EURO_CLASSES).join(", ")}. Categorie rovinietă: A, B, C, D, TollRO (marfă peste 3,5 t) sau „Nu are nevoie de rovinietă”. Serie CIV: seria cărții de identitate a vehiculului.`,
  "• Ultima revizie (data și km) intră în istoricul mașinii; Următoarea revizie (km) pornește alertele de service.",
  "• Mașinile care există deja în cont (același număr de înmatriculare) nu se dublează: la import alegi dacă le completezi sau le lași neschimbate.",
  "• Poți adăuga și o foaie „Istoric” (ca în exportul din aplicație) cu coloanele Data, Mașină, Nr. înmatriculare, Tip, Cost, Km, Litri, Notă.",
  "• Tabelul tău arată altfel? Nu e nicio problemă: FleetDeck citește și .xls, .ods, .csv sau tabele din Word (.docx), recunoaște alte denumiri de coloane și îți arată o previzualizare înainte de salvare, în care poți corecta totul.",
];
const EXAMPLE_NOTE = "• Șterge cele două rânduri de exemplu înainte de import (dacă rămân, FleetDeck le sare).";

const DATE_FORMAT = "dd\\.mm\\.yyyy";
const dateCell = (iso) => (iso ? { t: "n", v: isoToSerial(iso), z: DATE_FORMAT, w: roDate(iso) } : null);

function sheetFrom(XLSX, columns, items) {
  const aoa = [columns.map((c) => c.header), ...items.map((v) => columns.map((c) => (c.date ? dateCell(c.get(v)) : c.get(v) ?? null)))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = columns.map((c) => ({ wch: c.width }));
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(1, items.length), c: columns.length - 1 } }) };
  return ws;
}

const eventType = (e) => (e.kind === "odometer" ? "Kilometraj" : e.kind === "document" ? e.title || DOC_TYPES[e.type]?.label || "Document" : eventTitle(e));

function historyEntries(vehicles) {
  return vehicles
    .flatMap((v) => (v.events || []).filter((e) => e.date).map((e) => ({ v, e })))
    .sort((a, b) => b.e.date.localeCompare(a.e.date) || vehicleName(a.v).localeCompare(vehicleName(b.v)));
}

function historySheet(XLSX, vehicles) {
  const columns = [
    { header: "Data", width: 12, date: true, get: ({ e }) => e.date },
    { header: "Mașină", width: 20, get: ({ v }) => vehicleName(v) },
    { header: "Nr. înmatriculare", width: 16, get: ({ v }) => v.plate },
    { header: "Tip", width: 22, get: ({ e }) => eventType(e) },
    { header: `Cost (${currencySymbol()})`, width: 11, get: ({ e }) => e.cost ?? null },
    { header: "Km", width: 10, get: ({ e }) => e.km ?? null },
    { header: "Litri", width: 8, get: ({ e }) => e.liters ?? null },
    { header: "Notă", width: 32, get: ({ e }) => e.note || null },
  ];
  return sheetFrom(XLSX, columns, historyEntries(vehicles));
}

function instructionsSheet(XLSX, lines = INSTRUCTIONS) {
  const ws = XLSX.utils.aoa_to_sheet(lines.map((line) => [line]));
  ws["!cols"] = [{ wch: 120 }];
  return ws;
}

/* extras = coloanele în plus din export; pentru un fișier „de importat" rămânem la coloanele modelului */
export function fleetWorkbook(XLSX, vehicles, { extras = true, instructions = false } = {}) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFrom(XLSX, extras ? [...TEMPLATE_COLUMNS, ...EXPORT_EXTRAS] : TEMPLATE_COLUMNS, vehicles), "Mașini");
  XLSX.utils.book_append_sheet(wb, historySheet(XLSX, vehicles), "Istoric");
  if (instructions) XLSX.utils.book_append_sheet(wb, instructionsSheet(XLSX), "Instrucțiuni");
  return wb;
}

export function templateWorkbook(XLSX, today = bucharestToday()) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFrom(XLSX, TEMPLATE_COLUMNS, exampleVehicles(today)), "Mașini");
  XLSX.utils.book_append_sheet(wb, instructionsSheet(XLSX, [...INSTRUCTIONS, EXAMPLE_NOTE]), "Instrucțiuni");
  return wb;
}

export async function downloadTemplate() {
  const XLSX = await import("xlsx");
  XLSX.writeFile(templateWorkbook(XLSX), TEMPLATE_FILE, { compression: true });
}

export async function downloadFleet(vehicles) {
  const XLSX = await import("xlsx");
  XLSX.writeFile(fleetWorkbook(XLSX, vehicles), `FleetDeck-flota-${bucharestToday()}.xlsx`, { compression: true });
}
