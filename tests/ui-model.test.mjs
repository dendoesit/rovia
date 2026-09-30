import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renewalStart, expiryOptions, nextServiceTargets, pricePerLiter, plateMismatch, kmDecrease,
  vehicleFormError, dateError, kmError, amountError, numOrNull,
  docRows, historyPage, monthLabel, matchesQuery, garageView, alertSummary,
  eventTitle, eventIcon, todayStr, addDays, lastServiceDate, isLatestService, fmtQty, currencyCode, setCurrency,
  renewalDefaults, renewalPick, fuelConsumption,
} from "../src/lib/model.js";

const TODAY = "2026-09-30";

test("renewal counts from the day after the current expiry, never from the past", () => {
  const v = { documents: [{ type: "rca", expires: "2026-11-15" }, { type: "itp", expires: "2026-01-10" }] };
  assert.equal(renewalStart(v, "rca", TODAY), "2026-11-16");
  assert.equal(renewalStart(v, "itp", TODAY), TODAY);
  assert.equal(renewalStart(v, "rovinieta", TODAY), TODAY);
  assert.equal(renewalStart({ documents: [{ type: "rca", expires: TODAY }] }, "rca", TODAY), "2026-10-01");
});

test("expiry chips end on the last valid day of a period that starts on the renewal start", () => {
  const v = { year: "2019" };
  assert.deepEqual(expiryOptions("rca", v, "2026-11-16").map((o) => o.expires), ["2027-05-15", "2027-11-15"]);
  assert.deepEqual(expiryOptions("rovinieta", v, "2026-01-31").map((o) => o.expires), ["2026-03-01", "2026-03-31", "2027-01-30"]);
  assert.equal(expiryOptions("casco", v, "2026-08-31")[0].expires, "2027-02-27");
});

test("renewing on time chains the new period right after the old one", () => {
  const v = { documents: [{ type: "rca", expires: "2026-11-15" }] };
  const twelve = expiryOptions("rca", v, renewalStart(v, "rca", TODAY)).find((o) => o.label === "+12 luni");
  assert.equal(twelve.expires, "2027-11-15");
});

test("ITP chips follow the vehicle age and mark the legal term as recommended", () => {
  const year = +todayStr().slice(0, 4);
  const old = expiryOptions("itp", { year: String(year - 15) }, "2026-10-01");
  assert.equal(old[0].recommended, true);
  assert.equal(old[0].expires, "2027-09-30");
  assert.deepEqual(old.map((o) => o.label), ["+1 an (peste 12 ani vechime)", "+2 ani"]);
  const mid = expiryOptions("itp", { year: String(year - 6) }, "2026-10-01");
  assert.equal(mid[0].expires, "2028-09-30");
  assert.deepEqual(mid.map((o) => o.label), ["+2 ani", "+1 an"]);
});

test("a back-dated service does not move the next-service target", () => {
  const v = { events: [
    { kind: "maintenance", type: "service", date: "2026-03-10" },
    { kind: "maintenance", type: "service", date: "2026-06-01" },
    { kind: "maintenance", type: "brakes", date: "2026-09-01" },
  ] };
  assert.equal(lastServiceDate(v), "2026-06-01");
  assert.equal(isLatestService(v, "2025-11-20"), false);
  assert.equal(isLatestService(v, "2026-06-01"), true);
  assert.equal(isLatestService(v, TODAY), true);
  assert.equal(isLatestService({ events: [] }, "2020-01-01"), true);
  assert.equal(lastServiceDate({}), null);
});

test("a service always yields both targets, null when the interval is cleared", () => {
  assert.deepEqual(nextServiceTargets({ km: "41800", date: "2026-09-17", kmInterval: "15000", months: "12" }), { nextServiceKm: 56800, nextServiceDate: "2027-09-17" });
  assert.deepEqual(nextServiceTargets({ km: "41800", date: "2026-09-17", kmInterval: "", months: "" }), { nextServiceKm: null, nextServiceDate: null });
  assert.deepEqual(nextServiceTargets({ km: "", date: "2026-01-31", kmInterval: "10000", months: "1" }), { nextServiceKm: null, nextServiceDate: "2026-02-28" });
});

test("form helpers", () => {
  assert.equal(pricePerLiter(420, 55).toFixed(2), "7.64");
  assert.equal(pricePerLiter(420, ""), null);
  assert.equal(numOrNull(""), null);
  assert.equal(numOrNull("0"), 0);
  assert.equal(numOrNull("abc"), null);
  assert.equal(plateMismatch("B-45-FLT", "B 45 FLT"), false);
  assert.equal(plateMismatch("CJ 01 ABC", "B 45 FLT"), true);
  assert.equal(plateMismatch(null, "B 45 FLT"), false);
  assert.equal(kmDecrease({ km: 42000 }, "41999"), true);
  assert.equal(kmDecrease({ km: 42000 }, "42000"), false);
  assert.equal(kmDecrease({ km: null }, "10"), false);
  assert.equal(dateError("2026-10-01", TODAY), "Data nu poate fi în viitor");
  assert.equal(dateError("", TODAY), "Alege data");
  assert.equal(dateError(TODAY, TODAY), null);
  assert.equal(kmError("-5"), "Kilometrajul trebuie să fie un număr pozitiv");
  assert.equal(kmError("", { required: true }), "Introdu kilometrajul");
  assert.equal(kmError("0", { required: true }), null);
  assert.equal(amountError("", { required: true }), "Introdu suma");
  assert.equal(amountError("0", { required: true }), "Introdu suma");
  assert.equal(amountError("12.5", { required: true }), null);
  assert.equal(amountError(""), null);
});

test("vehicle form validates year and km", () => {
  const base = { make: "Dacia", plate: "B 1 ABC", year: "", km: "" };
  assert.equal(vehicleFormError(base, 2026), null);
  assert.equal(vehicleFormError({ ...base, make: " " }, 2026), "Marca este obligatorie");
  assert.equal(vehicleFormError({ ...base, plate: "" }, 2026), "Numărul de înmatriculare este obligatoriu");
  assert.equal(vehicleFormError({ ...base, year: "1949" }, 2026), "Anul trebuie să fie între 1950 și 2027");
  assert.equal(vehicleFormError({ ...base, year: "2028" }, 2026), "Anul trebuie să fie între 1950 și 2027");
  assert.equal(vehicleFormError({ ...base, year: "2027" }, 2026), null);
  assert.equal(vehicleFormError({ ...base, km: "-1" }, 2026), "Kilometrajul trebuie să fie un număr pozitiv");
});

test("doc rows flag missing required documents; trailers need no rovinietă", () => {
  const car = docRows({ category: "autoturism", documents: [{ type: "itp", expires: addDays(100) }] });
  assert.deepEqual(car.map((r) => [r.type, r.status]), [["itp", "ok"], ["rca", "missing"], ["rovinieta", "missing"], ["casco", "none"]]);
  const trailer = docRows({ category: "remorca", documents: [] });
  assert.deepEqual(trailer.map((r) => r.type), ["itp", "rca", "casco"]);
});

test("history groups by month, newest first, and pages the items", () => {
  const events = [
    { id: "a", date: "2026-09-02", created: "1", kind: "fuel", cost: 100 },
    { id: "b", date: "2026-09-20", created: "2", kind: "odometer", km: 43000 },
    { id: "c", date: "2026-08-15", created: "3", kind: "expense", cost: 50 },
    { id: "d", date: "2025-12-31", created: "4", kind: "maintenance", type: "service", cost: 900 },
  ];
  const all = historyPage({ events }, 50, TODAY);
  assert.deepEqual(all.groups.map((g) => [g.label, g.items.map((e) => e.id), g.total]), [
    ["Septembrie", ["b", "a"], 100], ["August", ["c"], 50], ["Decembrie 2025", ["d"], 900],
  ]);
  assert.equal(all.hidden, 0);
  const firstTwo = historyPage({ events }, 2, TODAY);
  assert.deepEqual(firstTwo.groups.map((g) => g.items.length), [2]);
  assert.equal(firstTwo.hidden, 2);
  assert.equal(monthLabel("", TODAY), "Fără dată");
});

test("odometer and typed expense events have their own title and icon", () => {
  assert.equal(eventTitle({ kind: "odometer", km: 1 }), "Kilometraj");
  assert.equal(eventIcon({ kind: "odometer" }), "📍");
  assert.equal(eventIcon({ kind: "expense", type: "parcare" }), "🅿️");
  assert.equal(eventIcon({ kind: "expense" }), "💶");
  assert.equal(eventTitle({ kind: "expense", label: "Parcare" }), "Parcare");
});

test("garage search ignores case, spaces in plates and diacritics", () => {
  const v = { make: "Dacia", model: "Duster", plate: "B 45 FLT", driver: "Ștefan Pîrvu" };
  assert.equal(matchesQuery(v, "b45flt"), true);
  assert.equal(matchesQuery(v, "stefan"), true);
  assert.equal(matchesQuery(v, "pirvu duster"), true);
  assert.equal(matchesQuery(v, "logan"), false);
  assert.equal(matchesQuery(v, "  "), true);
  assert.equal(matchesQuery(v, "B-45-FLT"), true);
  assert.equal(matchesQuery(v, "b-46"), false);
});

test("garage filters, category chips and sorting", () => {
  const ok = { id: "ok", make: "Audi", plate: "B 1 AAA", km: 90000, category: "autoturism",
    documents: [{ type: "itp", expires: addDays(200) }, { type: "rca", expires: addDays(200) }, { type: "rovinieta", expires: addDays(200) }] };
  const expired = { id: "exp", make: "Ford", plate: "B 2 BBB", km: 10000, category: "utilitara",
    documents: [{ type: "itp", expires: addDays(-3) }, { type: "rca", expires: addDays(200) }, { type: "rovinieta", expires: addDays(200) }] };
  const bare = { id: "bare", make: "Bmw", plate: "B 3 CCC", km: 50000, category: "autoturism", documents: [] };
  const vehicles = [ok, expired, bare];

  const view = garageView(vehicles);
  assert.deepEqual(view.filters.map((f) => [f.id, f.count]), [["all", 3], ["attention", 1], ["missing", 1], ["cat:autoturism", 2], ["cat:utilitara", 1]]);
  assert.deepEqual(view.rows.map((r) => r.v.id), ["exp", "bare", "ok"]);
  assert.deepEqual(garageView(vehicles, { sort: "nume" }).rows.map((r) => r.v.id), ["ok", "bare", "exp"]);
  assert.deepEqual(garageView(vehicles, { sort: "km" }).rows.map((r) => r.v.id), ["ok", "bare", "exp"]);
  assert.deepEqual(garageView(vehicles, { filter: "missing" }).rows.map((r) => r.v.id), ["bare"]);
  assert.deepEqual(garageView(vehicles, { filter: "cat:utilitara" }).rows.map((r) => r.v.id), ["exp"]);
  assert.deepEqual(garageView(vehicles, { q: "ford" }).rows.map((r) => r.v.id), ["exp"]);
  assert.equal(garageView([ok, bare], { filter: "cat:utilitara" }).filter, "all");
  assert.equal(garageView([ok, bare]).filters.length, 3);
});

test("alert summary counts per severity", () => {
  const alerts = [
    { st: "dead", kind: "doc" }, { st: "dead", kind: "doc" }, { st: "dead", kind: "doc" },
    { st: "crit", kind: "doc" }, { st: "crit", kind: "doc" },
    { st: "warn", kind: "doc" }, { st: "warn", kind: "doc" }, { st: "warn", kind: "doc" }, { st: "warn", kind: "doc" },
    { st: "warn", kind: "tyres" },
  ];
  assert.equal(alertSummary(alerts).map((g) => g.text).join(" · "), "3 expirate · 2 în ≤5 zile · 4 în ≤30 zile · 1 de verificat");
  assert.equal(alertSummary([{ st: "dead", kind: "doc" }])[0].text, "1 expirat");
});

test("alert summary does not count a km-based service as days left", () => {
  const alerts = [
    { st: "dead", kind: "service", kmLeft: -200, daysLeft: null },
    { st: "crit", kind: "service", kmLeft: 250, daysLeft: 90 },
    { st: "orange", kind: "service", kmLeft: 700, daysLeft: null },
    { st: "crit", kind: "service", kmLeft: 5000, daysLeft: 3 },
    { st: "crit", kind: "doc", daysLeft: 2 },
  ];
  assert.deepEqual(alertSummary(alerts), [
    { st: "dead", text: "1 service depășit" },
    { st: "crit", text: "2 în ≤5 zile" },
    { st: "crit", text: "2 service-uri în curând" },
  ]);
});

test("quantities use the Romanian decimal comma; the account currency code is exposed", () => {
  assert.equal(fmtQty(45.5), "45,5");
  assert.equal(fmtQty("40"), "40");
  setCurrency("EUR");
  assert.equal(currencyCode(), "EUR");
  setCurrency("XYZ");
  assert.equal(currencyCode(), "RON");
});

test("the rovinietă tariff is in lei and is pre-filled only for lei accounts", () => {
  const v = { category: "autoturism", year: "2020" };
  setCurrency("RON");
  assert.deepEqual(renewalDefaults("rovinieta", v), { cost: "254", autoCost: "254", provider: "CNAIR · portal.etoll.ro" });
  assert.deepEqual(renewalDefaults("rovinieta", v, "CNAIR"), { cost: "254", autoCost: "254" });
  assert.deepEqual(renewalDefaults("rovinieta", { category: "autoturism" }), { provider: "CNAIR · portal.etoll.ro" });
  assert.deepEqual(renewalDefaults("rca", v), {});
  setCurrency("EUR");
  assert.deepEqual(renewalDefaults("rovinieta", v), { provider: "CNAIR · portal.etoll.ro" });
  setCurrency("RON");
});

test("a 30/60-day rovinietă chip drops the pre-filled 12-month price unless the cost was edited", () => {
  const [d30, d60, m12] = expiryOptions("rovinieta", {}, "2026-10-01");
  assert.deepEqual([d30.days, d60.days, m12.months], [30, 60, 12]);
  const d = { cost: "254", autoCost: "254" };
  assert.deepEqual(renewalPick(d, d30), { expires: d30.expires, cost: "" });
  assert.deepEqual(renewalPick({ ...d, cost: "" }, m12), { expires: m12.expires, cost: "254" });
  assert.deepEqual(renewalPick(d, m12), { expires: m12.expires, cost: "254" });
  assert.deepEqual(renewalPick({ ...d, cost: "130" }, d60), { expires: d60.expires });
  assert.deepEqual(renewalPick({ cost: "90" }, d30), { expires: d30.expires });
  assert.deepEqual(renewalPick({}, d30), { expires: d30.expires });
});

test("price per litre counts only fills that have both a cost and litres", () => {
  const c = fuelConsumption({ events: [
    { kind: "fuel", km: 41000, liters: 50, cost: 400, date: "2026-06-01" },
    { kind: "fuel", km: 41800, liters: 60, cost: null, date: "2026-07-01" },
    { kind: "fuel", km: 42600, liters: 55, cost: 420, date: "2026-08-01" },
  ] });
  assert.equal(c.liters, 115);
  assert.equal(c.pricePerLiter, 420 / 55);
  const unpaid = fuelConsumption({ events: [
    { kind: "fuel", km: 41000, liters: 50, cost: 400, date: "2026-06-01" },
    { kind: "fuel", km: 41800, liters: 60, date: "2026-07-01" },
  ] });
  assert.equal(unpaid.pricePerLiter, null);
});
