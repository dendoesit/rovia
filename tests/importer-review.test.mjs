import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  matchHeader, detectHeader, autoColumns, buildVehicle, parseWork, parseDocument, parseDate, parseKm,
  sheetsFromWorkbook, pickSheets, sheetSetup, preview, toPayload, importInChunks, MAX_KM,
} from "../src/lib/importer/index.js";
import { findNumbers, parseEuroClass, parseVignetteCategory, dateOrder, TYRE_SIZE } from "../src/lib/importer/cells.js";
import { decodeText, readWorkbook } from "../src/lib/importer/read.js";
import { mergeEvents, sameEvent } from "../src/lib/importer/build.js";
import { eventFromCells } from "../src/lib/importer/history.js";
import { fleetWorkbook, templateWorkbook, TEMPLATE_HEADERS, EXPORT_HEADERS } from "../src/lib/exporter.js";
import { demoVehicle, EXPENSE_TYPES } from "../src/lib/model.js";
import { bucharestToday, addDaysTo } from "../shared/dates.js";
import { EURO_CLASSES, VIGNETTE_CATEGORIES } from "../shared/renewals.js";
import { VEHICLE_FIELDS } from "../shared/domain.js";

const today = "2026-09-30";
const dayOf = (text) => parseDate(text, today)?.iso ?? null;
const work = (field, text) => parseWork(text, field, today);
const vehicleFrom = (headers, cells) => buildVehicle(cells, autoColumns([headers, cells], detectHeader([headers, cells])), { today });
const previewOf = (sheets, opts = {}) => {
  const sel = pickSheets(sheets);
  return preview({ sheets, ...sel, ...sheetSetup(sheets[sel.main]), today, ...opts });
};
const roundTrip = (wb) => sheetsFromWorkbook(XLSX, XLSX.read(XLSX.write(wb, { type: "array", bookType: "xlsx" }), { type: "array", dense: true, cellNF: true }));

/* ---------- istoric: evenimente din aceeași zi ---------- */

test("same-day history rows stay separate events; only the main-sheet service absorbs its Istoric row", () => {
  const sheets = [
    { name: "Mașini", rows: [["Marcă", "Nr. înmatriculare", "Ultima revizie (data)", "Ultima revizie (km)"], ["Dacia", "B 11 REV", "01.09.2026", 41800]] },
    { name: "Istoric", rows: [
      ["Data", "Nr. înmatriculare", "Tip", "Cost", "Km", "Litri", "Notă"],
      ["01.09.2026", "B 11 REV", "Parcare", 10, "", "", ""],
      ["01.09.2026", "B 11 REV", "Parcare", 10, "", "", ""],
      ["01.09.2026", "B 11 REV", "Cafea", 12, "", "", ""],
      ["01.09.2026", "B 11 REV", "Cafea", 15, "", "", ""],
      ["01.09.2026", "B 11 REV", "Alimentare", 200, "", 30, ""],
      ["01.09.2026", "B 11 REV", "Alimentare", 250, "", 36, ""],
      ["01.09.2026", "B 11 REV", "Revizie / schimb ulei", 1100, 41800, "", "ulei + filtre"],
      ["01.09.2026", "B 11 REV", "Revizie / schimb ulei", 300, 42000, "", "a doua vizită"],
    ] },
  ];
  const { rows, history } = previewOf(sheets);
  const events = rows[0].vehicle.events;
  assert.equal(events.length, 8);
  assert.equal(history.attached, 7);
  assert.equal(events.filter((e) => e.kind === "fuel").length, 2);
  assert.equal(events.filter((e) => e.kind === "expense" && e.type === "parcare").length, 2);
  const services = events.filter((e) => e.type === "service");
  assert.deepEqual(services.map((e) => [e.km, e.cost, e.note]), [[41800, 1100, "ulei + filtre"], [42000, 300, "a doua vizită"]]);
});

test("events merge only when no field filled on both sides differs, and prefer the one with equal values", () => {
  const base = [{ kind: "maintenance", type: "service", date: "2026-09-01", km: 41800, note: null }];
  const later = { kind: "maintenance", type: "service", date: "2026-09-01", km: null, cost: 200, note: "doar filtru" };
  const same = { kind: "maintenance", type: "service", date: "2026-09-01", km: 41800, cost: 1100, note: "ulei" };
  const merged = mergeEvents(base, [later, same]);
  assert.deepEqual(merged.map((e) => [e.km, e.cost, e.note]), [[41800, 1100, "ulei"], [null, 200, "doar filtru"]]);
  assert.equal(sameEvent({ kind: "expense", date: "2026-01-01", cost: 10 }, { kind: "expense", date: "2026-01-01", cost: 12 }), false);
  assert.equal(sameEvent({ kind: "expense", date: "2026-01-01", type: "parcare" }, { kind: "expense", date: "2026-01-01", label: "Parcare" }), true);
  const twice = { kind: "fuel", date: "2026-01-01", cost: 100 };
  assert.equal(mergeEvents([], [twice, twice]).length, 2);
});

test("summer and winter tyres bought the same day are two events", () => {
  const r = vehicleFrom(["Marcă", "Nr. înmatriculare", "Anvelope de vară", "Anvelope de iarnă"], ["Dacia", "B 12 REV", "03.05.2024", "03.05.2024"]);
  assert.deepEqual(r.vehicle.events.map((e) => e.note), ["vară", "iarnă"]);
});

/* ---------- export → import ---------- */

test("expense labels written by the export map back to the expense wizard types", () => {
  for (const [type, { label }] of Object.entries(EXPENSE_TYPES)) {
    const e = eventFromCells({ date: "2026-01-01", type: type === "altele" ? "Cheltuială" : label, cost: "60" });
    assert.deepEqual([e.kind, e.type, e.label], ["expense", type, type === "altele" ? null : label], label);
  }
});

const DAY = bucharestToday();
const demoFleet = () => {
  const demo = demoVehicle();
  return [{
    id: "demo", ...demo, euroClass: "euro6", vignetteCategory: "A", civ: "J123456",
    documents: [...demo.documents, { type: "leasing", expires: addDaysTo(DAY, 400), provider: "BCR Leasing" }],
    events: [
      ...demo.events,
      { kind: "expense", type: "parcare", label: "Parcare", cost: 10, date: addDaysTo(DAY, -3) },
      { kind: "expense", type: "parcare", label: "Parcare", cost: 10, date: addDaysTo(DAY, -3) },
      { kind: "expense", type: "altele", label: null, cost: 45, date: addDaysTo(DAY, -3), note: "cablu" },
      { kind: "fuel", cost: 150, liters: 20, date: addDaysTo(DAY, -3) },
      { kind: "maintenance", type: "service", cost: 90, date: addDaysTo(DAY, -13), note: "completare ulei" },
    ].map((e, i) => ({ id: `e${i}`, ...e })),
  }];
};
const shape = (e) => [e.kind, e.date, e.type ?? null, e.km ?? null, e.cost ?? null, e.liters ?? null, e.title ?? e.label ?? null, e.note ?? null];
const legacyTyped = (e) => (e.kind === "expense" && !e.type ? { ...e, type: Object.keys(EXPENSE_TYPES).find((t) => EXPENSE_TYPES[t].label === e.label) } : e);

test("re-importing the app's own export gives back every event exactly once", () => {
  const fleet = demoFleet();
  const bytes = XLSX.write(fleetWorkbook(XLSX, fleet), { type: "array", bookType: "xlsx" });
  const sheets = sheetsFromWorkbook(XLSX, XLSX.read(bytes, { type: "array", dense: true, cellNF: true }));
  const sel = pickSheets(sheets);
  const { rows, history } = preview({ sheets, ...sel, ...sheetSetup(sheets[sel.main]), today: DAY });
  assert.equal(history.orphans, 0);
  const [car] = toPayload(rows);
  assert.deepEqual(car.events.map(shape).sort(), fleet[0].events.map(legacyTyped).map(shape).sort());
  assert.equal(car.events.filter((e) => e.type === "service").length, 2);
  assert.deepEqual([car.euroClass, car.vignetteCategory, car.civ], ["euro6", "A", "J123456"]);
  assert.deepEqual(Object.keys(car).filter((k) => !VEHICLE_FIELDS.includes(k) && k !== "documents" && k !== "events"), []);
  assert.deepEqual(car.documents.map((d) => [d.type, d.provider ?? null]).sort(),
    [["casco", "Groupama"], ["itp", null], ["leasing", "BCR Leasing"], ["rca", "Allianz"], ["rovinieta", null]]);
});

test("every export and template column maps back to its own importer field", () => {
  const fields = EXPORT_HEADERS.map((h) => matchHeader(h));
  assert.ok(fields.every(Boolean), JSON.stringify(fields));
  assert.equal(new Set(fields).size, EXPORT_HEADERS.length);
  for (const h of ["RCA furnizor", "CASCO furnizor", "Clasa Euro", "Categorie rovinietă", "Serie CIV", "Observații"]) assert.ok(TEMPLATE_HEADERS.includes(h), h);
  const cases = { "Asigurator RCA": "rcaProvider", "Leasing furnizor": "leasingProvider", "Normă poluare": "euroClass", "Euro": "euroClass", "CIV": "civ", "RCA": "rca", "Categorie": "category", "Rovinietă": "rovinieta" };
  for (const [header, field] of Object.entries(cases)) assert.equal(matchHeader(header), field, header);
});

test("the template example rows fill the new columns without warnings", () => {
  const { rows } = previewOf(roundTrip(templateWorkbook(XLSX, today)));
  assert.deepEqual(rows.map((r) => [r.vehicle.euroClass, r.vehicle.vignetteCategory, r.vehicle.documents.find((d) => d.type === "rca").provider]),
    [["euro6", "A", "Allianz"], ["euro6", "B", "Groupama"]]);
  assert.deepEqual(rows.map((r) => r.warnings), [[], []]);
});

test("euro class and vignette category cells accept keys, labels and common spellings", () => {
  for (const [key, label] of Object.entries(EURO_CLASSES)) assert.equal(parseEuroClass(label), key);
  for (const [key, label] of Object.entries(VIGNETTE_CATEGORIES)) assert.equal(parseVignetteCategory(label), key);
  assert.deepEqual(["euro 6", "Euro VI", "EURO 5b", "E4", "Euro 2", "6d-temp", "Diesel"].map(parseEuroClass), ["euro6", "euro6", "euro5", "euro4", "euro3", "euro6", null]);
  assert.deepEqual(["a", "Categoria B", "TollRO", "nu", "-", "autoturism"].map(parseVignetteCategory), ["A", "B", "tollro", "none", null, null]);
  const r = vehicleFrom(["Marcă", "Nr. înmatriculare", "Clasa Euro", "Categorie rovinietă", "Serie CIV", "RCA", "RCA furnizor", "CASCO furnizor"],
    ["Dacia", "B 13 REV", "Euro 9", "Z", "j 123456", "30.06.2027", "Allianz", "Omniasig"]);
  assert.deepEqual([r.vehicle.euroClass, r.vehicle.vignetteCategory, r.vehicle.civ, r.vehicle.documents[0].provider], [null, null, "J 123456", "Allianz"]);
  assert.ok(r.warnings.some((w) => /clasa Euro necunoscută: „Euro 9”/.test(w)));
  assert.ok(r.warnings.some((w) => /categoria de rovinietă „Z”/.test(w)));
  assert.ok(r.warnings.some((w) => /CASCO furnizor „Omniasig”: lipsește data de expirare/.test(w)));
});

/* ---------- km ---------- */

test("km pairs with thousands separators are read as done / next", () => {
  const dots = work("service", "facut 12.03.2024 150.000 / 165.000");
  assert.deepEqual(dots.events.map((e) => e.km), [150000]);
  assert.equal(dots.nextServiceKm, 165000);
  const spaces = work("service", "facut 12.03.2024 185 000 200 000");
  assert.deepEqual(spaces.events.map((e) => e.km), [185000]);
  assert.equal(spaces.nextServiceKm, 200000);
  assert.deepEqual(findNumbers("185 000 200 000").map((n) => n.value), [185000, 200000]);
  assert.equal("150.000 / 165.000".match(TYRE_SIZE), null);
  assert.deepEqual("205/55 R16 și 195/65R15".match(TYRE_SIZE), ["205/55 R16", "195/65R15"]);
  assert.equal(parseKm("185 000"), 185000);
  assert.equal(parseKm("1 250 000"), 1250000);
});

test("km above 3.000.000 are refused with a Romanian warning", () => {
  assert.equal(MAX_KM, 3_000_000);
  assert.equal(parseKm("3.500.000"), null);
  assert.equal(parseKm(4_000_000), null);
  assert.equal(parseKm("3.000.000"), 3_000_000);
  const r = vehicleFrom(["Marcă", "Nr. înmatriculare", "Kilometraj", "Ultima revizie (km)"], ["Dacia", "B 14 REV", "185000200000", "9.000.000"]);
  assert.equal(r.vehicle.km, null);
  assert.ok(r.warnings.some((w) => /^kilometrajul „185000200000” înseamnă peste 3\.000\.000 km/.test(w)), r.warnings.join(" | "));
  assert.ok(r.warnings.some((w) => /^Ultima revizie: „9\.000\.000” înseamnă peste 3\.000\.000 km/.test(w)));
  const cell = work("service", "facut 12.03.2024 185.000.200.000");
  assert.deepEqual(cell.events.map((e) => e.km), [null]);
  assert.match(cell.warnings[0], /peste 3\.000\.000 km/);
  const { rows } = previewOf([
    { name: "Mașini", rows: [["Marcă", "Nr. înmatriculare"], ["Dacia", "B 15 REV"]] },
    { name: "Istoric", rows: [["Data", "Nr. înmatriculare", "Tip", "Km"], ["01.02.2026", "B 15 REV", "Kilometraj", "45.000.000"]] },
  ]);
  assert.equal(rows[0].vehicle.events[0].km, null);
  assert.ok(rows[0].warnings.some((w) => /Istoric 01\.02\.2026: „45\.000\.000” înseamnă peste/.test(w)));
});

/* ---------- actualizări doar cu numărul ---------- */

test("a plate-only update sheet completes cars already in the garage", () => {
  const sheets = [{ name: "ITP", rows: [["Nr. înmatriculare", "ITP expiră"], ["B 21 TST", "30.06.2027"], ["B 99 NEW", "30.06.2027"]] }];
  const existing = [{ id: "x", make: "Dacia", model: "Logan", plate: "B 21 TST" }];
  const { rows } = previewOf(sheets, { existing });
  assert.deepEqual(rows.map((r) => [r.status, r.missing]), [["existing", []], ["invalid", ["marca"]]]);
  assert.deepEqual(toPayload(rows), [{ plate: "B 21 TST", documents: [{ type: "itp", expires: "2027-06-30" }] }]);
});

/* ---------- import în loturi ---------- */

test("chunked import reloads the garage once and a failed reload keeps the saved cars", async () => {
  const items = Array.from({ length: 60 }, (_, i) => ({ row: i + 2, data: { plate: `B ${100 + i} TST`, make: "Dacia" } }));
  const calls = [];
  let reloads = 0;
  const send = async (list) => { calls.push(list.length); return { created: list.map((x, row) => ({ row, plate: x.plate })) }; };
  const ok = await importInChunks(items, { send, reload: async () => { reloads++; } });
  assert.deepEqual(calls, [25, 25, 10]);
  assert.equal(reloads, 1);
  assert.equal(ok.report.created.length, 60);
  assert.deepEqual(ok.report.created.slice(24, 26).map((x) => x.row), [26, 27]);
  const broken = await importInChunks(items, { send, reload: async () => { throw new Error("rețea"); } });
  assert.deepEqual([broken.reloaded, broken.report.created.length, broken.report.errors.length], [false, 60, 0]);
  let n = 0;
  const failing = await importInChunks(items, { send: async (list) => { if (n++) throw new Error("timeout"); return send(list); }, reload: async () => {} });
  assert.deepEqual([failing.report.created.length, failing.report.errors.length, failing.report.errors[0].row], [25, 35, 27]);
});

/* ---------- date americane ---------- */

test("a column with a month/day-only date is read month/day everywhere", () => {
  assert.equal(dateOrder(["3/4/2027", "3/25/2027", ""]), "mdy");
  assert.equal(dateOrder(["3/4/2027", "25/3/2027", "3/25/2027"]), "mixed");
  assert.equal(dateOrder(["05.06.2027", "03.25.2027"]), "dmy");
  const sheets = [{ name: "Flota", rows: [["Marcă", "Nr. înmatriculare", "ITP expiră"], ["Dacia", "B 31 REV", "3/4/2027"], ["Dacia", "B 32 REV", "3/25/2027"], ["Dacia", "B 33 REV", "5/5/2027"]] }];
  const { rows } = previewOf(sheets);
  assert.deepEqual(rows.map((r) => r.vehicle.documents[0].expires), ["2027-03-04", "2027-03-25", "2027-05-05"]);
  assert.ok(rows[0].warnings.includes("ITP: am citit „3/4/2027” ca 04.03.2027"));
});

test("ambiguous slash dates are flagged when the column mixes both orders", () => {
  const sheets = [{ name: "Flota", rows: [["Marcă", "Nr. înmatriculare", "RCA"], ["Dacia", "B 34 REV", "5/6/2027"], ["Dacia", "B 35 REV", "25/3/2027"], ["Dacia", "B 36 REV", "3/25/2027"]] }];
  const { rows } = previewOf(sheets);
  assert.deepEqual(rows.map((r) => r.vehicle.documents[0].expires), ["2027-06-05", "2027-03-25", "2027-03-25"]);
  assert.ok(rows[0].warnings.some((w) => w === "RCA: „5/6/2027” poate fi 05.06.2027 sau 06.05.2027 — am pus 05.06.2027, verifică"));
  assert.ok(!rows[1].warnings.some((w) => /poate fi/.test(w)));
});

test("month/day history dates are read by the whole date column", () => {
  const { rows } = previewOf([
    { name: "Mașini", rows: [["Marcă", "Nr. înmatriculare"], ["Dacia", "B 37 REV"]] },
    { name: "Istoric", rows: [["Data", "Nr. înmatriculare", "Tip"], ["3/4/2026", "B 37 REV", "Parcare"], ["3/25/2026", "B 37 REV", "Parcare"]] },
  ]);
  assert.deepEqual(rows[0].vehicle.events.map((e) => e.date), ["2026-03-04", "2026-03-25"]);
  assert.ok(rows[0].warnings.includes("Istoric: am citit „3/4/2026” ca 04.03.2026"));
});

/* ---------- rânduri cu același număr ---------- */

test("rows with the same plate become one preview row, also when existing cars are skipped", () => {
  const sheets = [{ name: "Flota", rows: [
    ["Marcă", "Model", "Nr. înmatriculare", "Kilometraj", "RCA", "ITP", "Ultima revizie (data)", "Observații"],
    ["Dacia", "", "B 41 REV", 90000, "30.06.2027", "", "01.03.2026", "rezervă"],
    ["", "Logan", "b41rev", 95000, "30.06.2028", "15.01.2027", "01.03.2026", "cu cârlig"],
    ["Ford", "Focus", "B 42 REV", 1000, "", "", "", ""],
    ["Opel", "Astra", "B-41-REV", "", "01.01.2027", "", "02.04.2026", "rezervă"],
  ] }];
  const { rows } = previewOf(sheets, { existing: [{ id: "x", plate: "B 42 REV", make: "Ford" }] });
  assert.deepEqual(rows.map((r) => [r.row, r.status]), [[2, "new"], [4, "existing"]]);
  const [car] = rows;
  assert.equal(car.note, "combinat din rândurile 2, 3 și 5");
  const v = car.vehicle;
  assert.deepEqual([v.make, v.model, v.km, v.notes], ["Dacia", "Logan", 95000, "rezervă; cu cârlig"]);
  assert.deepEqual(v.documents.map((d) => [d.type, d.expires]), [["rca", "2028-06-30"], ["itp", "2027-01-15"]]);
  assert.deepEqual(v.events.map((e) => e.date), ["2026-03-01", "2026-04-02"]);
  assert.equal(toPayload(rows).filter((x) => x.plate === "B 41 REV").length, 1);
});

/* ---------- fișiere text și date ISO ---------- */

test("UTF-16 Unicode Text files are decoded by their byte order mark", async () => {
  const text = "Marcă\tNr. înmatriculare\tRCA\nDacia\tB 51 REV\t30.06.27\n";
  const le = Uint8Array.from(Buffer.from("﻿" + text, "utf16le"));
  const be = Uint8Array.from(Buffer.from("﻿" + text, "utf16le").swap16());
  assert.equal(decodeText(le), text);
  assert.equal(decodeText(be), text);
  assert.equal(decodeText(Uint8Array.from([0xef, 0xbb, 0xbf, ...Buffer.from("Șofer")])), "Șofer");
  const [sheet] = await readWorkbook(le, "txt");
  assert.deepEqual(sheet.rows, [["Marcă", "Nr. înmatriculare", "RCA"], ["Dacia", "B 51 REV", "30.06.27"]]);
});

test("ISO date-time text is a full date, not a lone year", () => {
  assert.equal(dayOf("2027-03-31T00:00:00"), "2027-03-31");
  assert.equal(dayOf("2027-03-31T00:00:00.000Z"), "2027-03-31");
  assert.deepEqual(parseDocument("2027-03-31T00:00:00", "itp", today).doc, { type: "itp", expires: "2027-03-31", provider: null });
});

/* ---------- antete pe grupe ---------- */

test("a group header above the header row qualifies its columns", () => {
  const rows = [
    ["", "", "Ultima revizie", "", "Documente"],
    ["Marcă", "Nr. înmatriculare", "Data", "Km", "ITP"],
    ["Dacia", "B 61 REV", "01.02.2026", 120000, "30.06.2027"],
  ];
  const h = detectHeader(rows);
  assert.equal(h.index, 1);
  assert.deepEqual(autoColumns(rows, h).map((c) => c.field), ["make", "plate", "serviceDate", "serviceKm", "itp"]);
  const title = [["Evidență revizii"], ["Marcă", "Nr. înmatriculare", "Km"], ["Dacia", "B 62 REV", 1000]];
  assert.deepEqual(autoColumns(title, detectHeader(title)).map((c) => c.field), ["make", "plate", "km"]);
  const tyres = [["", "", "Anvelope", "", ""], ["Marcă", "Nr. înmatriculare", "vară", "iarnă", "Km"], ["Dacia", "B 63 REV", "03.04.2024", "05.11.2023", 1000]];
  assert.deepEqual(autoColumns(tyres, detectHeader(tyres)).map((c) => c.field), ["make", "plate", "tyresSummer", "tyresWinter", "km"]);
});

/* ---------- după review ---------- */

test("spaced km that cannot split into thousands-grouped numbers stay one number and are refused", () => {
  for (const text of ["3 500 000", "12 500 000", "5 185 000"]) {
    assert.equal(parseKm(text), null, text);
    const r = vehicleFrom(["Marcă", "Nr. înmatriculare", "Kilometraj"], ["Dacia", "B 16 REV", text]);
    assert.equal(r.vehicle.km, null, text);
    assert.ok(r.warnings.includes(`kilometrajul „${text}” înseamnă peste 3.000.000 km — nu l-am folosit`), r.warnings.join(" | "));
  }
  const cell = work("service", "facut 12.03.2024 la 3 500 000 km");
  assert.deepEqual(cell.events.map((e) => e.km), [null]);
  assert.deepEqual(cell.warnings, ["Revizie: „3 500 000” înseamnă peste 3.000.000 km — nu l-am folosit"]);
  assert.deepEqual(findNumbers("1 250 000 1 300 000").map((n) => [n.value, n.text, n.start]), [[1250000, "1 250 000", 0], [1300000, "1 300 000", 10]]);
  assert.deepEqual(findNumbers("150 000 200 lei").map((n) => [n.value, n.money]), [[150000, false], [200, true]]);
  assert.deepEqual(findNumbers("185\u00a0000 200\u00a0000").map((n) => [n.value, n.start, n.end]), [[185000, 0, 7], [200000, 8, 15]]);
});

test("a title above the table does not turn the car's columns into service or driver columns", () => {
  const fields = (rows) => autoColumns(rows, detectHeader(rows)).map((c) => c.field);
  const body = ["1", "Dacia", "B 64 REV", 120000, "30.06.2027"];
  assert.deepEqual(fields([["", "Evidență revizii auto"], ["Nr. crt.", "Marcă", "Nr. înmatriculare", "Km", "ITP"], body]), [null, "make", "plate", "km", "itp"]);
  assert.deepEqual(fields([["", "Parc auto — situație ITP"], ["Nr. crt.", "Marcă", "Nr. înmatriculare", "Km", "Data"], body]), [null, "make", "plate", "km", null]);
  assert.deepEqual(fields([["Firma SRL — parc auto", "", "", "Responsabil: Ion"], ["Marcă", "Nr. înmatriculare", "Km", "Data expirare", "ITP"], body.slice(1).concat("30.06.2027")]),
    ["make", "plate", "km", null, "itp"]);
  assert.deepEqual(fields([["", "", "", "Ultima revizie"], ["Nr. crt.", "Marcă", "Nr. înmatriculare", "Km"], body.slice(0, 4)]), [null, "make", "plate", "serviceKm"]);
  assert.deepEqual(fields([["", "", "RCA", "", "Întocmit: Ion"], ["Marcă", "Nr. înmatriculare", "Expiră", "Asigurator", "Data"], ["Dacia", "B 65 REV", "30.06.2027", "Allianz", "01.09.2026"]]),
    ["make", "plate", "rca", "rcaProvider", null]);
});

test("a missing-model warning goes away once another row or the garage car has the model", () => {
  const sheets = [{ name: "Flota", rows: [
    ["Marcă", "Model", "Nr. înmatriculare"],
    ["Dacia", "", "B 43 REV"], ["Dacia", "Logan", "B 43 REV"], ["Ford", "", "B 44 REV"], ["Opel", "", "B 45 REV"],
  ] }];
  const { rows } = previewOf(sheets, { existing: [{ id: "x", plate: "B 44 REV", make: "Ford", model: "Focus" }] });
  assert.deepEqual(rows.map((r) => [r.row, r.status, r.warnings.some((w) => /modelul lipsește/.test(w))]), [[2, "new", false], [4, "existing", false], [5, "new", true]]);
});
