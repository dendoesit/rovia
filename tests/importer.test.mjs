import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { zipSync, strToU8 } from "fflate";
import { DOMParser } from "@xmldom/xmldom";
import { handle } from "../netlify/functions/api.mjs";
import { memoryStore } from "./memory-store.mjs";
import {
  matchHeader, detectHeader, autoColumns, buildVehicle, parseVehicleName, parseWork, parseDocument,
  findDates, parseDate, parseKm, formatPlate, docxTables, sheetsFromWorkbook, pickSheets, sheetSetup, preview, toPayload, importChunks,
} from "../src/lib/importer/index.js";
import { findNumbers, parseMoney, parseFuel, parseCategory, isoToSerial } from "../src/lib/importer/cells.js";
import { decodeText, readDocx, readWorkbook, readFile, MAX_COLS } from "../src/lib/importer/read.js";
import { eventFromCells } from "../src/lib/importer/history.js";
import { fleetWorkbook, templateWorkbook, TEMPLATE_HEADERS, EXAMPLE_PLATES } from "../src/lib/exporter.js";

const today = "2026-09-30";
const dayOf = (text) => parseDate(text, today)?.iso ?? null;
const columnsFor = (headers, rows = []) => autoColumns([headers, ...rows], detectHeader([headers, ...rows]));
const vehicleFrom = (headers, cells) => buildVehicle(cells, columnsFor(headers, [cells]), { today });

/* ---------- antete ---------- */

test("headers map to fields regardless of diacritics, case, punctuation and hyphenation", () => {
  const cases = {
    "Masina": "name", "Mașină": "name", "Auto": "name", "Marcă": "make", "Model": "model",
    "Nr. masina": "plate", "Nr. înmatriculare": "plate", "Număr": "plate", "Nr auto": "plate",
    "Km": "km", "Kilometraj": "km", "An": "year", "An fabricație": "year", "Anul fabricației": "year",
    "Combustibil": "fuel", "Șofer": "driver", "Utilizator": "driver", "Conducător auto": "driver",
    "VIN": "vin", "Serie șasiu": "vin", "Categorie": "category",
    "RCA / valabil": "rca", "CASCO": "casco", "Rovinieta / expira": "rovinieta", "ITP": "itp", "Inspecție tehnică": "itp",
    "Revizii+schimb ulei": "service", "Distri- / butia": "distributie", "Ambreiaj": "ambreiaj",
    "Baterie / Data cumpararii": "battery", "Anvelope de vara ": "tyresSummer", "Anvelope de iarnă": "tyresWinter",
    "Observații": "notes", "Ultima revizie (data)": "serviceDate", "Ultima revizie (km)": "serviceKm",
    "Următoarea revizie (km)": "nextServiceKm", "Următoarea revizie (data)": "nextServiceDate",
    "Plate": "plate", "Mileage": "km", "Driver": "driver", "Fuel": "fuel", "Obs.": "notes", "Marca si modelul": "name",
    "Data revizie": "serviceDate", "Km la revizia următoare": "nextServiceKm", "Revizie tehnică": "itp",
  };
  for (const [header, field] of Object.entries(cases)) assert.equal(matchHeader(header), field, header);
  assert.equal(matchHeader("Nr. crt."), false);
  assert.equal(matchHeader("Culoare"), null);
});

test("every template header maps to its own field", () => {
  const fields = TEMPLATE_HEADERS.map((h) => matchHeader(h));
  assert.ok(fields.every(Boolean), JSON.stringify(fields));
  assert.equal(new Set(fields).size, TEMPLATE_HEADERS.length);
});

test("the header row is found below a title and above the data", () => {
  const rows = [
    ["Situație mașini flotă — septembrie"],
    [],
    ["Nr. crt.", "Mașina", "Nr. mașină", "ITP", "RCA"],
    ["1", "DACIA LOGAN", "B 101 TST", "12.03.27", "01.02.27"],
  ];
  const h = detectHeader(rows);
  assert.equal(h.index, 2);
  const cols = autoColumns(rows, h);
  assert.deepEqual(cols.map((c) => c.field), [null, "name", "plate", "itp", "rca"]);
  assert.equal(cols[0].ignored, true);
});

test("a two-row header (Anvelope over vară / iarnă) is combined", () => {
  const rows = [
    ["Mașina", "Nr. mașină", "Anvelope", ""],
    ["", "", "vară", "iarnă"],
    ["VW GOLF", "CJ 22 TST", "03.04.2024", "05.11.2023"],
  ];
  const h = detectHeader(rows);
  assert.equal(h.depth, 2);
  assert.deepEqual(autoColumns(rows, h).map((c) => c.field), ["name", "plate", "tyresSummer", "tyresWinter"]);
});

test("a column without a known header is recognised from plate-like values", () => {
  const rows = [["Vehicul", "Cod"], ["Dacia Logan", "B 11 AAA"], ["Ford Focus", "IF-22-BBB"], ["Skoda Fabia", "B 333 CCC"]];
  const cols = autoColumns(rows);
  assert.equal(cols[1].field, "plate");
  assert.equal(cols[1].guessed, true);
});

/* ---------- celule ---------- */

test("dates in all the formats companies use", () => {
  assert.equal(dayOf("30.06.27"), "2027-06-30");
  assert.equal(dayOf("06.11.2026"), "2026-11-06");
  assert.equal(dayOf("3.7.25"), "2025-07-03");
  assert.equal(dayOf("20/06/16"), "2016-06-20");
  assert.equal(dayOf("20/06/2016"), "2016-06-20");
  assert.equal(dayOf("2026-08-19"), "2026-08-19");
  assert.equal(dayOf("11.07.2026."), "2026-07-11");
  assert.equal(dayOf("06.10. 22"), "2022-10-06");
  assert.equal(parseDate(isoToSerial("2027-03-15")).iso, "2027-03-15");
  assert.equal(dayOf("dec. 2018"), "2018-12-01");
  assert.equal(parseDate("dec. 2018", today).precision, "month");
  assert.equal(dayOf("Octombrie 2023"), "2023-10-01");
  assert.equal(dayOf("11.2021"), "2021-11-01");
  assert.equal(dayOf("12 martie 2025"), "2025-03-12");
  assert.deepEqual(parseDate("2027", today), { iso: null, year: 2027, precision: "year", text: "2027", start: 0, end: 4 });
  assert.equal(parseDate(2027).precision, "year");
  assert.equal(dayOf("31.02.2024"), null);
  assert.equal(findDates("31.02.2024")[0].invalid, true);
  assert.equal(dayOf("215.000"), null);
  assert.equal(dayOf("75.12.20"), null);
});

test("two-digit years roll over twenty years ahead of today", () => {
  assert.equal(dayOf("01.01.46"), "2046-01-01");
  assert.equal(dayOf("01.01.98"), "1998-01-01");
});

test("km numbers with dot thousands, typos and units", () => {
  assert.equal(parseKm("215.000"), 215000);
  assert.equal(parseKm("98..000"), 98000);
  assert.equal(parseKm("41.200km"), 41200);
  assert.equal(parseKm("120 000 km"), 120000);
  assert.equal(parseKm("aprox. 150 mii"), 150000);
  assert.equal(parseKm(84500.4), 84500);
  assert.equal(parseKm("—"), null);
  const nums = findNumbers("facut pe 10.01.2024 (150.000 km) 4x4 70Ah 165.000");
  assert.deepEqual(nums.map((n) => [n.value, n.labeled]), [[150000, true], [165000, false]]);
});

test("money, fuel, category and plate cells", () => {
  assert.equal(parseMoney("1.450,50 lei"), 1450.5);
  assert.equal(parseMoney("1.450"), 1450);
  assert.equal(parseMoney("€ 12.5"), 12.5);
  assert.equal(parseFuel("motorina"), "Motorină");
  assert.equal(parseFuel("Diesel"), "Motorină");
  assert.equal(parseFuel("PHEV"), "Hibrid plug-in");
  assert.equal(parseFuel("B"), "Benzină");
  assert.equal(parseCategory("Autoutilitară"), "utilitara");
  assert.equal(parseCategory("Remorcă / rulotă"), "remorca");
  assert.equal(formatPlate("bc07tst"), "BC 07 TST");
  assert.equal(formatPlate("B-123-ABC"), "B 123 ABC");
  assert.equal(formatPlate("M-AB 1234"), "M-AB 1234");
});

/* ---------- celule de mentenanță ---------- */

const work = (field, text) => parseWork(text, field, today);
const brief = (r) => r.events.map((e) => [e.type, e.date, e.km, e.note]);

test("service cell: done date, km in parentheses, next service km", () => {
  const a = work("service", "facut pe 14.05.2026 (210.000 km) 225.000");
  assert.deepEqual(brief(a), [["service", "2026-05-14", 210000, null]]);
  assert.equal(a.nextServiceKm, 225000);
  const b = work("service", "Facut pe 02.06.2026 / 41.200km / 56.200 ");
  assert.deepEqual(brief(b), [["service", "2026-06-02", 41200, null]]);
  assert.equal(b.nextServiceKm, 56200);
  const c = work("service", "facut pe   07.03.2025 / (98..000 km)  / 113.000");
  assert.deepEqual(brief(c), [["service", "2025-03-07", 98000, null]]);
  assert.equal(c.nextServiceKm, 113000);
  const d = work("service", "facut pe 11.07.2026. (15.300 km) / 30.000");
  assert.deepEqual(brief(d), [["service", "2026-07-11", 15300, null]]);
});

test("service cell: next service date, future date and a bare km", () => {
  const a = work("service", "revizie facuta 10.02.2025, urmatoarea 10.02.2027");
  assert.deepEqual(brief(a), [["service", "2025-02-10", null, null]]);
  assert.equal(a.nextServiceDate, "2027-02-10");
  const b = work("service", "programat 15.12.2026");
  assert.equal(b.events.length, 0);
  assert.equal(b.nextServiceDate, "2026-12-15");
  assert.match(b.warnings[0], /în viitor/);
  assert.deepEqual(work("service", "250.000").looseKms, [250000]);
});

test("timing belt cell with km before the date and a clutch mentioned after it", () => {
  const r = work("distributie", "facuta la 187.455 km pe 21.09.2023 / + ambreiaj schimbat ");
  assert.deepEqual(brief(r), [["distributie", "2023-09-21", 187455, null], ["ambreiaj", "2023-09-21", 187455, null]]);
  assert.deepEqual(brief(work("distributie", "facuta 05.10.22")), [["distributie", "2022-10-05", null, null]]);
  assert.deepEqual(brief(work("distributie", "facuta / 06.10. 22")), [["distributie", "2022-10-06", null, null]]);
});

test("battery cells, with an optional brand as note", () => {
  assert.deepEqual(brief(work("battery", "Cumparata / 14.02.2025")), [["battery", "2025-02-14", null, null]]);
  assert.deepEqual(brief(work("battery", "Cumparata 14.02.2025 Varta 74Ah")), [["battery", "2025-02-14", null, "Varta 74Ah"]]);
});

test("tyre cells: quantity, several sets and seasons written before or after the date", () => {
  assert.deepEqual(brief(work("tyresSummer", "4 cumparate 03.05.2019")), [["tyres", "2019-05-03", null, "vară, 4 buc."]]);
  assert.deepEqual(brief(work("tyresSummer", "11.2021 de iarna 15.03.2024 mixte")),
    [["tyres", "2021-11-01", null, "iarnă, dată aproximativă"], ["tyres", "2024-03-15", null, "mixte"]]);
  assert.deepEqual(brief(work("tyresSummer", "iarna 11.2021 vara 15.03.2024")),
    [["tyres", "2021-11-01", null, "iarnă, dată aproximativă"], ["tyres", "2024-03-15", null, "vară"]]);
  assert.deepEqual(brief(work("tyresWinter", "Iarna - 02.12.2024")), [["tyres", "2024-12-02", null, "iarnă"]]);
  const month = work("tyresWinter", "cumparate / dec. 2018");
  assert.deepEqual(brief(month), [["tyres", "2018-12-01", null, "iarnă, dată aproximativă"]]);
  assert.match(month.warnings[0], /doar luna/);
  assert.deepEqual(brief(work("tyresSummer", "Octombrie 2023 de iarna")), [["tyres", "2023-10-01", null, "iarnă, dată aproximativă"]]);
  assert.deepEqual(brief(work("tyresSummer", "20/06/2016 / 2 bucati")), [["tyres", "2016-06-20", null, "vară, 2 buc."]]);
});

test("unreadable or empty maintenance cells do not invent events", () => {
  assert.equal(work("service", "-").events.length, 0);
  assert.equal(work("service", "").warnings.length, 0);
  const r = work("distributie", "de facut curand");
  assert.equal(r.events.length, 0);
  assert.match(r.warnings[0], /n-am înțeles/);
  const y = work("battery", "2021");
  assert.equal(y.events.length, 0);
  assert.match(y.warnings[0], /doar un an/);
});

test("document cells: expiry, provider, lone year, expired and empty", () => {
  assert.deepEqual(parseDocument("30.06.27", "rca", today).doc, { type: "rca", expires: "2027-06-30", provider: null });
  assert.deepEqual(parseDocument("Groupama 01.07.26 - 30.06.27", "rca", today).doc, { type: "rca", expires: "2027-06-30", provider: "Groupama" });
  const year = parseDocument("2028", "itp", today);
  assert.equal(year.doc, null);
  assert.match(year.warnings[0], /ITP: „2028” e doar un an/);
  const old = parseDocument("04.05.22", "itp", today);
  assert.equal(old.doc.expires, "2022-05-04");
  assert.match(old.warnings[0], /expirat/);
  assert.deepEqual(parseDocument("nu are", "casco", today), { doc: null, warnings: [] });
  assert.equal(parseDocument(isoToSerial("2027-01-15"), "rovinieta", today).doc.expires, "2027-01-15");
});

/* ---------- nume de mașini ---------- */

test("vehicle names are split into brand, model, driver and notes", () => {
  const pick = (t) => { const r = parseVehicleName(t); return [r.make, r.model, r.driver, r.note, r.category]; };
  assert.deepEqual(pick("TOYOTA YARIS"), ["Toyota", "Yaris", null, null, null]);
  assert.deepEqual(pick("TOYOTA   "), ["Toyota", null, null, null, null]);
  assert.deepEqual(pick("DUSTER / MARIAN"), ["Dacia", "Duster", "Marian", null, null]);
  assert.deepEqual(pick("SANDERO  / ION VASILE"), ["Dacia", "Sandero", "Ion Vasile", null, null]);
  assert.deepEqual(pick("VW POLO"), ["Volkswagen", "Polo", null, null, null]);
  assert.deepEqual(pick("MERCEDES NOU"), ["Mercedes", null, null, "nou", null]);
  assert.deepEqual(pick("RULOTA"), ["Rulotă", null, null, null, "rulota"]);
  assert.deepEqual(pick("Remorca Brenderup"), ["Brenderup", null, null, null, "remorca"]);
  assert.deepEqual(pick("SPRINTER"), ["Mercedes", "Sprinter", null, null, "utilitara"]);
  assert.deepEqual(pick("FORD TRANSIT CUSTOM (POPESCU ION)"), ["Ford", "Transit Custom", "Popescu Ion", null, "utilitara"]);
  assert.deepEqual(pick("LOGAN MCV"), ["Dacia", "Logan MCV", null, null, null]);
  assert.deepEqual(pick("BMW X5"), ["BMW", "X5", null, null, null]);
  assert.deepEqual(pick("Lamborghini Urus"), ["Lamborghini", "Urus", null, null, null]);
  assert.equal(parseVehicleName("Dacia Spring").fuel, "Electric");
  assert.equal(parseVehicleName("SKODA OCTAVIA TDI").fuel, "Motorină");
  assert.equal(parseVehicleName("Dacia Logan B-123-ABC").plate, "B 123 ABC");
});

/* ---------- rând → mașină ---------- */

const WORD_HEADERS = ["Masina", "Nr. masina", "RCA / valabil", "CASCO", "Rovinieta / expira", "Revizii+schimb ulei", "ITP", "Distri- / butia", "Baterie / Data cumpararii", "Anvelope de vara", "Anvelope de iarna"];

test("a free-form row becomes a complete vehicle", () => {
  const { vehicle: v, warnings, missing } = vehicleFrom(WORD_HEADERS, [
    "SKODA OCTAVIA / MARIAN", "CJ 01 TST", "15.01.27", "", "20.03.27", "facut pe 14.05.2026 / (210.000 km) / 225.000",
    "18.02.27", "facuta la 187.455 km pe 21.09.2023 / + ambreiaj schimbat", "Cumparata / 14.02.2025", "4 cumparate / 03.05.2019", "cumparate / dec. 2018",
  ]);
  assert.deepEqual(missing, []);
  assert.equal(v.make, "Skoda");
  assert.equal(v.model, "Octavia");
  assert.equal(v.driver, "Marian");
  assert.equal(v.plate, "CJ 01 TST");
  assert.equal(v.km, 210000);
  assert.equal(v.nextServiceKm, 225000);
  assert.deepEqual(v.documents.map((d) => [d.type, d.expires]).sort(), [["itp", "2027-02-18"], ["rca", "2027-01-15"], ["rovinieta", "2027-03-20"]]);
  assert.deepEqual(v.events.map((e) => e.type).sort(), ["ambreiaj", "battery", "distributie", "service", "tyres", "tyres"]);
  assert.equal(v.tyresNote, "vară 05.2019 · iarnă 12.2018");
  assert.deepEqual(warnings, ["Anvelope: doar luna (dec. 2018) — am pus 01.12.2018"]);
});

test("rows without make or plate are flagged, lone years and missing models warned", () => {
  const noPlate = vehicleFrom(WORD_HEADERS, ["FIAT DOBLO", "", "01.01.27"]);
  assert.deepEqual(noPlate.missing, ["numărul de înmatriculare"]);
  const noMake = vehicleFrom(WORD_HEADERS, ["", "B 55 TST"]);
  assert.deepEqual(noMake.missing, ["marca"]);
  const r = vehicleFrom(WORD_HEADERS, ["MERCEDES NOU", "B 77 TST", "", "", "", "", "2028"]);
  assert.equal(r.vehicle.notes, "nou");
  assert.equal(r.vehicle.documents.length, 0);
  assert.ok(r.warnings.some((w) => /ITP: „2028” e doar un an/.test(w)));
  assert.ok(r.warnings.some((w) => /modelul lipsește/.test(w)));
  const trailer = vehicleFrom(WORD_HEADERS, ["RULOTA", "B 88 TST", "", "", "", "", "04.05.22"]);
  assert.equal(trailer.vehicle.category, "rulota");
  assert.ok(!trailer.warnings.some((w) => /modelul/.test(w)));
});

test("template-style columns: explicit km wins, a lower km than history is corrected", () => {
  const headers = ["Marcă", "Model", "Nr. înmatriculare", "Kilometraj", "An fabricație", "Combustibil", "Categorie", "Șofer", "VIN", "Ultima revizie (data)", "Ultima revizie (km)", "Următoarea revizie (km)"];
  const r = vehicleFrom(headers, ["vw", "passat", "b 12 tst", "140.500", 2018, "Diesel", "Autoturism", "IONESCU ANA", "WVWZZZ3CZJE000001", "2026-02-01", "138000", "153.000"]);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(
    [r.vehicle.make, r.vehicle.model, r.vehicle.plate, r.vehicle.km, r.vehicle.year, r.vehicle.fuel, r.vehicle.category, r.vehicle.driver, r.vehicle.nextServiceKm],
    ["Volkswagen", "Passat", "B 12 TST", 140500, "2018", "Motorină", "autoturism", "Ionescu Ana", 153000]);
  assert.deepEqual(r.vehicle.events, [{ kind: "maintenance", type: "service", date: "2026-02-01", km: 138000, note: null }]);
  const low = vehicleFrom(headers, ["Dacia", "Logan", "B 13 TST", "100000", "", "", "", "", "", "01.03.2026", "120.000"]);
  assert.equal(low.vehicle.km, 120000);
  assert.match(low.warnings[0], /mai mic decât cel din istoric/);
  const kmOnly = vehicleFrom(headers, ["Dacia", "Logan", "B 15 TST", "90000", "", "", "", "", "", "", "95.000"]);
  assert.equal(kmOnly.vehicle.km, 95000);
  assert.equal(kmOnly.vehicle.events.length, 0);
  const bare = vehicleFrom(["Marcă", "Nr. înmatriculare", "Kilometraj", "Revizii"], ["Dacia", "B 16 TST", "90000", "105.000"]);
  assert.equal(bare.vehicle.nextServiceKm, 105000);
  assert.match(bare.warnings[0], /am considerat-o următoarea revizie/);
  const badVin = vehicleFrom(["Marcă", "Nr. înmatriculare", "VIN"], ["Dacia", "B 14 TST", "123"]);
  assert.match(badVin.warnings[0], /VIN/);
});

/* ---------- previzualizare ---------- */

test("preview marks existing plates, duplicates, invalid rows and template examples", () => {
  const rows = [
    ["Marcă", "Model", "Nr. înmatriculare"],
    ["Dacia", "Logan", "B 21 TST"],
    ["Ford", "Focus", "b21tst"],
    ["Opel", "Astra", "CJ 21 TST"],
    ["", "Corsa", ""],
    [],
    ["Marcă", "Model", "Nr. înmatriculare"],
    ["Dacia", "Logan", EXAMPLE_PLATES[0]],
  ];
  const sheets = [{ name: "Foaie1", rows }];
  const { header, columns } = sheetSetup(sheets[0]);
  const { rows: out } = preview({ sheets, main: 0, header, columns, existing: [{ id: "x", plate: "CJ21TST" }], today });
  assert.deepEqual(out.map((r) => [r.row, r.status]), [[2, "new"], [4, "existing"], [5, "invalid"], [8, "example"]]);
  assert.equal(out[0].note, "combinat din rândurile 2 și 3");
  assert.deepEqual([out[0].vehicle.make, out[0].vehicle.model], ["Dacia", "Logan"]);
  assert.equal(toPayload(out).length, 2);
});

/* ---------- Word (.docx) ---------- */

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const p = (...texts) => texts.map((t) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`).join("");
const tc = (content, props = "") => `<w:tc>${props ? `<w:tcPr>${props}</w:tcPr>` : ""}${content || "<w:p/>"}</w:tc>`;
const docXml = (rows) => `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W_NS}"><w:body>${p("Situație mașini")}<w:tbl>${rows.map((r) => `<w:tr>${r}</w:tr>`).join("")}</w:tbl></w:body></w:document>`;

test("Word tables: paragraphs joined with „ / ”, gridSpan and vertical merges respected", async () => {
  const xml = docXml([
    tc(p("Masina")) + tc(p("Nr. masina")) + tc(p("Distri-", "butia")) + tc(p("Anvelope de vara")) + tc(p("Anvelope de iarna")) + tc(p("Sofer")),
    tc(p("DUSTER", "MARIAN")) + tc(p("BC 44 TST")) + tc(p("facuta", "06.10. 22")) + tc(p("11.2021 de iarna", "15.03.2024 mixte"), `<w:gridSpan w:val="2"/>`) + tc(p("Ion"), `<w:vMerge w:val="restart"/>`),
    tc(p("VW POLO")) + tc(p("BC 45 TST")) + tc("") + tc(p("20/06/2016")) + tc(p("")) + tc("", "<w:vMerge/>"),
  ]);
  const [table] = docxTables(xml, DOMParser);
  assert.deepEqual(table.rows[0], ["Masina", "Nr. masina", "Distri- / butia", "Anvelope de vara", "Anvelope de iarna", "Sofer"]);
  assert.deepEqual(table.rows[1], ["DUSTER / MARIAN", "BC 44 TST", "facuta / 06.10. 22", "11.2021 de iarna / 15.03.2024 mixte", "", "Ion"]);
  assert.deepEqual(table.rows[2], ["VW POLO", "BC 45 TST", "", "20/06/2016", "", "Ion"]);

  const sheets = await readDocx(zipSync({ "word/document.xml": strToU8(xml) }), DOMParser);
  const { header, columns } = sheetSetup(sheets[0]);
  const { rows } = preview({ sheets, main: 0, header, columns, today });
  const duster = rows[0].vehicle;
  assert.deepEqual([duster.make, duster.model, duster.driver], ["Dacia", "Duster", "Ion"]);
  assert.deepEqual(duster.events.map((e) => [e.type, e.date, e.note]), [["distributie", "2022-10-06", null], ["tyres", "2021-11-01", "iarnă, dată aproximativă"], ["tyres", "2024-03-15", "mixte"]]);
});

/* ---------- Excel / CSV ---------- */

test("Excel date cells, numbers and merged cells are read into plain values", () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Marcă", "Nr. înmatriculare", "ITP expiră", "Kilometraj", "Șofer"],
    ["Dacia", "B 31 TST", { t: "n", v: isoToSerial("2027-04-30"), z: "dd.mm.yyyy" }, 95400, "Vasile"],
    ["Dacia", "B 32 TST", { t: "n", v: isoToSerial("2027-05-31"), z: "d/m/yy" }, "96.100", ""],
  ]);
  ws["!merges"] = [{ s: { r: 1, c: 4 }, e: { r: 2, c: 4 } }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Flota");
  const back = XLSX.read(XLSX.write(wb, { type: "array", bookType: "xlsx" }), { type: "array", dense: true, cellNF: true });
  const [sheet] = sheetsFromWorkbook(XLSX, back);
  assert.deepEqual(sheet.rows[1], ["Dacia", "B 31 TST", "2027-04-30", 95400, "Vasile"]);
  assert.deepEqual(sheet.rows[2], ["Dacia", "B 32 TST", "2027-05-31", "96.100", "Vasile"]);
});

test("xlsx, xls, ods and csv files read into the same rows", async () => {
  const ws = XLSX.utils.aoa_to_sheet([["Marcă", "Nr. înmatriculare", "ITP expiră", "Kilometraj"], ["Dacia", "B 33 TST", { t: "n", v: isoToSerial("2027-04-30"), z: "dd\\.mm\\.yyyy" }, 95400]]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Flota");
  for (const [ext, bookType] of [["xlsx", "xlsx"], ["xls", "biff8"], ["ods", "ods"], ["csv", "csv"]]) {
    const [sheet] = await readWorkbook(new Uint8Array(XLSX.write(wb, { type: "array", bookType })), ext);
    const { vehicle } = buildVehicle(sheet.rows[1], autoColumns(sheet.rows), { today });
    assert.deepEqual([vehicle.plate, vehicle.km, vehicle.documents[0]?.expires], ["B 33 TST", 95400, "2027-04-30"], ext);
  }
});

test("CSV text falls back to Windows-1250 when it is not UTF-8", () => {
  const cp1250 = Uint8Array.from([0x4d, 0x61, 0x72, 0x63, 0xe3, 0x3b, 0xaa, 0x6f, 0x66, 0x65, 0x72]);
  assert.equal(decodeText(cp1250), "Marcă;Şofer");
  assert.equal(decodeText(strToU8("\ufeffMarcă;Șofer")), "Marcă;Șofer");
  const wb = XLSX.read("Marcă;Nr. înmatriculare;RCA\nDacia;B 41 TST;30.06.27\n", { type: "string", raw: true, dense: true });
  const [sheet] = sheetsFromWorkbook(XLSX, wb);
  assert.deepEqual(sheet.rows[1], ["Dacia", "B 41 TST", "30.06.27"]);
});

/* ---------- export ↔ import ---------- */

const fleet = [
  { id: "a", make: "Dacia", model: "Duster", plate: "B 51 TST", year: "2021", fuel: "Motorină", category: "autoturism", driver: "Ana", km: 42380,
    nextServiceKm: 44700, nextServiceDate: "2027-03-01", tyres: "good", tyresNote: "set de vară", notes: "mașină de rezervă",
    euroClass: "euro6", vignetteCategory: "A", civ: "J123456",
    documents: [{ id: "d1", type: "itp", expires: "2027-02-20" }, { id: "d2", type: "rca", expires: "2026-12-07", provider: "Allianz" }, { id: "d3", type: "warranty", expires: "2027-08-01" }],
    events: [
      { id: "e1", date: "2026-09-01", kind: "maintenance", type: "service", km: 41800, cost: 1100, note: "ulei + filtre" },
      { id: "e2", date: "2026-08-20", kind: "fuel", km: 41560, cost: 420, liters: 55 },
      { id: "e3", date: "2026-07-10", kind: "document", type: "rca", title: "RCA reînnoit", cost: 1450, note: "Allianz" },
      { id: "e4", date: "2026-06-01", kind: "expense", type: "spalatorie", label: "Spălătorie", cost: 60 },
      { id: "e5", date: "2026-05-01", kind: "odometer", km: 40000 },
    ] },
  { id: "b", make: "Rulotă", plate: "B 52 TST", category: "remorca", documents: [], events: [] },
];

test("the fleet export has the template columns, then extras, and a full history sheet", () => {
  const wb = fleetWorkbook(XLSX, fleet);
  assert.deepEqual(wb.SheetNames, ["Mașini", "Istoric"]);
  const cars = XLSX.utils.sheet_to_json(wb.Sheets["Mașini"], { header: 1, raw: false });
  assert.deepEqual(cars[0].slice(0, TEMPLATE_HEADERS.length), TEMPLATE_HEADERS);
  assert.ok(cars[0].includes("Garanție expiră"));
  assert.equal(cars[1][cars[0].indexOf("RCA expiră")], "07.12.2026");
  const hist = XLSX.utils.sheet_to_json(wb.Sheets["Istoric"], { header: 1, raw: false });
  assert.deepEqual(hist[0], ["Data", "Mașină", "Nr. înmatriculare", "Tip", "Cost (lei)", "Km", "Litri", "Notă"]);
  assert.deepEqual(hist.slice(1).map((r) => r[3]), ["Revizie / schimb ulei", "Alimentare", "RCA reînnoit", "Spălătorie", "Kilometraj"]);
});

test("an exported fleet imports back to the same vehicles", () => {
  const bytes = XLSX.write(fleetWorkbook(XLSX, fleet), { type: "array", bookType: "xlsx" });
  const sheets = sheetsFromWorkbook(XLSX, XLSX.read(bytes, { type: "array", dense: true, cellNF: true }));
  const sel = pickSheets(sheets);
  assert.deepEqual(sel, { main: 0, history: 1 });
  const { rows, history } = preview({ sheets, ...sel, ...sheetSetup(sheets[sel.main]), today });
  assert.equal(history.orphans, 0);
  const [duster, trailer] = toPayload(rows);
  assert.deepEqual(
    { ...duster, events: undefined },
    { make: "Dacia", model: "Duster", plate: "B 51 TST", year: "2021", fuel: "Motorină", category: "autoturism", driver: "Ana", km: 42380,
      nextServiceKm: 44700, nextServiceDate: "2027-03-01", tyres: "good", tyresNote: "set de vară", notes: "mașină de rezervă",
      euroClass: "euro6", vignetteCategory: "A", civ: "J123456",
      documents: [{ type: "itp", expires: "2027-02-20" }, { type: "rca", expires: "2026-12-07", provider: "Allianz" }, { type: "warranty", expires: "2027-08-01" }], events: undefined });
  const strip = ({ id, ...e }) => Object.fromEntries(Object.entries(e).filter(([, x]) => x != null));
  const byDate = (a, b) => a.date.localeCompare(b.date);
  assert.deepEqual(duster.events.map(strip).sort(byDate), fleet[0].events.map(strip).sort(byDate));
  assert.deepEqual(trailer, { make: "Rulotă", plate: "B 52 TST", category: "remorca" });
});

test("the template has the documented headers, two example rows and instructions", () => {
  const wb = templateWorkbook(XLSX, today);
  assert.deepEqual(wb.SheetNames, ["Mașini", "Instrucțiuni"]);
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets["Mașini"], { header: 1, raw: false });
  assert.deepEqual(aoa[0], TEMPLATE_HEADERS);
  assert.equal(aoa.length, 3);
  const sheets = sheetsFromWorkbook(XLSX, XLSX.read(XLSX.write(wb, { type: "array", bookType: "xlsx" }), { type: "array", dense: true, cellNF: true }));
  const sel = pickSheets(sheets);
  const { rows } = preview({ sheets, ...sel, ...sheetSetup(sheets[sel.main]), today });
  assert.deepEqual(rows.map((r) => r.status), ["example", "example"]);
  assert.deepEqual(rows.map((r) => r.warnings), [[], []]);
});

test("history types map back to event kinds", () => {
  const kinds = ["Alimentare", "Revizie / schimb ulei", "Distribuție", "ITP trecut", "Rovinietă adăugat", "Kilometraj", "Parcare", "Mentenanță", "Taxă pod"]
    .map((type) => { const e = eventFromCells({ date: "2026-01-01", type }); return [e.kind, e.type ?? e.label ?? null]; });
  assert.deepEqual(kinds, [["fuel", null], ["maintenance", "service"], ["maintenance", "distributie"], ["document", "itp"], ["document", "rovinieta"], ["odometer", null], ["expense", "parcare"], ["maintenance", null], ["expense", "Taxă pod"]]);
});

/* ---------- până la server ---------- */

test("the import payload is accepted by the API and lands as documents and history", async () => {
  const store = memoryStore();
  let cookie = "";
  const api = async (method, path, body) => {
    const res = await handle(new Request("https://fleeta.netlify.app" + path, {
      method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined,
    }), store);
    cookie = res.headers.get("set-cookie")?.split(";")[0] || cookie;
    return res.json();
  };
  await api("POST", "/api/auth/register", { email: "import@test.ro", password: "parola-buna" });
  const sheets = [{ name: "Tabel 1", rows: [WORD_HEADERS, ["FIAT DUCATO / PETRE", "B 61 TST", "15.01.27", "", "20.03.27", "facut pe 14.05.2026 / (210.000 km) / 225.000", "18.02.27", "", "Cumparata / 14.02.2025", "", ""]] }];
  const { rows } = preview({ sheets, main: 0, ...sheetSetup(sheets[0]), today });
  const report = await api("POST", "/api/vehicles/import", { vehicles: toPayload(rows), mode: "merge" });
  assert.equal(report.created.length, 1);
  const [car] = await api("GET", "/api/vehicles");
  assert.deepEqual([car.make, car.model, car.driver, car.category, car.km, car.nextServiceKm], ["Fiat", "Ducato", "Petre", "utilitara", 210000, 225000]);
  assert.equal(car.documents.length, 3);
  assert.deepEqual(car.events.map((e) => [e.kind, e.type, e.date]).sort(), [["maintenance", "battery", "2025-02-14"], ["maintenance", "service", "2026-05-14"]]);
});

/* ---------- regresii găsite la review ---------- */

test("km separated only by spaces are two numbers, not one huge km", () => {
  const r = work("service", "facut 12.03.2024 185.000 200.000");
  assert.deepEqual(brief(r), [["service", "2024-03-12", 185000, null]]);
  assert.equal(r.nextServiceKm, 200000);
  assert.deepEqual(findNumbers("300 150.000").map((n) => n.value), [300, 150000]);
  assert.equal(parseKm("120 000"), 120000);
  assert.equal(parseKm("1 250 000"), 1250000);
  assert.equal(parseKm("2019"), 2019);
});

test("tyre sizes and money are not km; the price becomes the event cost", () => {
  const tyres = work("tyresSummer", "Michelin 205/55 R16, 4 buc, 12.04.2023");
  assert.deepEqual(brief(tyres), [["tyres", "2023-04-12", null, "vară, 4 buc., 205/55 R16, Michelin"]]);
  const paid = work("service", "facut pe 12.03.2024, 450 lei");
  assert.deepEqual(paid.events.map((e) => [e.km, e.cost, e.note]), [[null, 450, null]]);
  const both = work("service", "revizie 12.03.2024 cost: 1.250 lei la 185.000 km, urm la 200 mii");
  assert.deepEqual(both.events.map((e) => [e.km, e.cost, e.note]), [[185000, 1250, null]]);
  assert.equal(both.nextServiceKm, 200000);
  assert.equal(parseDocument("30.06.2027 / 1450 lei", "rca", today).doc.provider, null);
  assert.equal(parseDocument("12 luni, expira 15.03.2027", "rca", today).doc.provider, null);
});

test("„noi” (new) before a year is not read as November", () => {
  assert.equal(parseDate("anvelope noi 2023", today).precision, "year");
  assert.equal(dayOf("noi. 2023"), "2023-11-01");
  assert.equal(dayOf("noiembrie 2023"), "2023-11-01");
});

test("registration dates, phone and e-mail columns do not become plate or driver", () => {
  const cases = {
    "Data înmatriculării": "firstRegistration", "Data primei înmatriculări": "firstRegistration", "Telefon șofer": false, "Tel.": false, "E-mail": false, "Număr de telefon": false,
    "Număr auto": "plate", "Număr mașină": "plate", "Model auto": "model", "Marca auto": "make",
    "Kilometraj la ultima revizie": "serviceKm", "Kilometraj următoarea revizie": "nextServiceKm",
  };
  for (const [header, field] of Object.entries(cases)) assert.equal(matchHeader(header), field, header);
});

test("a future „Ultima revizie (data)” becomes the next service date, a month-only one is marked approximate", () => {
  const headers = ["Marcă", "Nr. înmatriculare", "Ultima revizie (data)", "Ultima revizie (km)"];
  const future = vehicleFrom(headers, ["Dacia", "B 71 TST", "15.12.2026", "90.000"]);
  assert.equal(future.vehicle.events.length, 0);
  assert.equal(future.vehicle.nextServiceDate, "2026-12-15");
  assert.ok(future.warnings.some((w) => /în viitor/.test(w)));
  const month = vehicleFrom(headers, ["Dacia", "B 72 TST", "03.2026", "80.000"]);
  assert.deepEqual(month.vehicle.events, [{ kind: "maintenance", type: "service", date: "2026-03-01", km: 80000, note: "dată aproximativă" }]);
  assert.ok(month.warnings.some((w) => /doar luna/.test(w)));
});

test("separate Marcă / Model columns get the same category and fuel hints as a combined name", () => {
  const headers = ["Marcă", "Model", "Nr. înmatriculare"];
  const van = vehicleFrom(headers, ["Mercedes", "Sprinter", "B 73 TST"]).vehicle;
  assert.deepEqual([van.category, van.fuel], ["utilitara", null]);
  const ev = vehicleFrom(headers, ["Dacia", "Spring", "B 74 TST"]).vehicle;
  assert.equal(ev.fuel, "Electric");
  assert.deepEqual(parseVehicleName("Remorca auto").make, "Remorcă");
});

test("row numbers and columns match the spreadsheet when the data does not start at A1", () => {
  const ws = XLSX.utils.aoa_to_sheet([["Marcă", "Nr. înmatriculare", "Km"], ["Dacia", "B 81 TST", 1000], ["Ford", "B 82 TST", 2000]], { origin: "C4" });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Flota");
  const back = XLSX.read(XLSX.write(wb, { type: "array", bookType: "ods" }), { type: "array", dense: true, cellNF: true });
  const sheets = sheetsFromWorkbook(XLSX, back);
  const { header, columns } = sheetSetup(sheets[0]);
  assert.deepEqual(columns.map((c) => c.index), [2, 3, 4]);
  assert.deepEqual(preview({ sheets, main: 0, header, columns, today }).rows.map((r) => r.row), [5, 6]);
  assert.equal(sheets[0].truncated, false);
});

test("sheets wider than the limit are flagged instead of silently cut", () => {
  const row = Array.from({ length: MAX_COLS + 5 }, (_, i) => `c${i}`);
  const ws = XLSX.utils.aoa_to_sheet([row]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Lat");
  const [sheet] = sheetsFromWorkbook(XLSX, XLSX.read(XLSX.write(wb, { type: "array", bookType: "xlsx" }), { type: "array", dense: true }));
  assert.equal(sheet.rows[0].length, MAX_COLS);
  assert.equal(sheet.truncated, true);
});

test("Word content controls around rows and paragraphs are read", () => {
  const sdt = (inner) => `<w:sdt><w:sdtContent>${inner}</w:sdtContent></w:sdt>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W_NS}"><w:body><w:tbl>` +
    `<w:tr>${tc(p("Masina")) + tc(p("Nr. masina"))}</w:tr>` +
    sdt(`<w:tr>${tc(sdt(p("DACIA LOGAN"))) + tc(p("B 91 TST"))}</w:tr>`) +
    `</w:tbl></w:body></w:document>`;
  const [table] = docxTables(xml, DOMParser);
  assert.deepEqual(table.rows, [["Masina", "Nr. masina"], ["DACIA LOGAN", "B 91 TST"]]);
});

test("a lone sheet named Istoric is read as the vehicle list", () => {
  assert.deepEqual(pickSheets([{ name: "Istoric flotă", rows: [["Marcă", "Nr. înmatriculare"], ["Dacia", "B 92 TST"]] }]), { main: 0, history: -1 });
});

test("history is attached only to rows that will be imported", () => {
  const sheets = [
    { name: "Mașini", rows: [["Marcă", "Nr. înmatriculare"], ["Dacia", "B 93 TST"], ["", "B 94 TST"]] },
    { name: "Istoric", rows: [["Data", "Nr. înmatriculare", "Tip"], ["01.02.2026", "B 93 TST", "Alimentare"], ["01.03.2026", "B 94 TST", "Alimentare"]] },
  ];
  const { rows, history } = preview({ sheets, main: 0, history: 1, ...sheetSetup(sheets[0]), today });
  assert.deepEqual(rows.map((r) => [r.status, r.vehicle.events.length]), [["new", 1], ["invalid", 0]]);
  assert.deepEqual([history.attached, history.orphans], [1, 1]);
});

test("import chunks respect both the vehicle count and the request size", () => {
  const items = Array.from({ length: 60 }, (_, i) => ({ i, size: i === 30 ? 960 : 10 }));
  const chunks = importChunks(items, (x) => x.size, { count: 25, bytes: 1000 });
  assert.deepEqual(chunks.map((c) => c.length), [25, 5, 5, 25]);
  assert.deepEqual(chunks.flat().map((x) => x.i), items.map((x) => x.i));
  assert.deepEqual(importChunks([{ big: "x".repeat(50) }], undefined, { count: 25, bytes: 10 }).map((c) => c.length), [1]);
  assert.deepEqual(importChunks([]), []);
});

test("images and other files are refused with a Romanian message", async () => {
  const file = (name) => ({ name, arrayBuffer: async () => new ArrayBuffer(8) });
  await assert.rejects(readFile(file("poza.jpg")), /fișierele \.jpg nu se pot importa/);
  await assert.rejects(readFile(file("scan.pdf")), /PDF/);
});
