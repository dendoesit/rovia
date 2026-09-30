import { test } from "node:test";
import assert from "node:assert/strict";
import {
  periodRange, inRange, spending, spendingSeries, repairs, lastService, odometerReadings, readingsRate, lifetimeKm, kmRate,
  kmByYear, kmYearBuckets, typicalKmAt, typicalKmTotal, kmComparison, kmRatioPhrase, fuelOutlook, costPerKm,
  topByCost, topFuel, topRepairs, kmRows, dominantCategory, fleetSummary, carSummary, countOf, aniText, inAniText, spentTitle, fmtDecimal,
  fmtPerKm, periodPhrase,
} from "../src/lib/analytics.js";
import { kmPerYear, fuelEstimate, todayStr, setCurrency } from "../src/lib/model.js";
import { niceTicks, columnPath, barPath } from "../src/components/charts/scale.js";

const TODAY = "2026-09-30";
let seq = 0;
const ev = (date, kind, cost, extra = {}) => ({ id: `e${++seq}`, date, kind, cost, ...extra });
const car = (over = {}) => ({ id: `c${++seq}`, make: "Dacia", model: "Logan", plate: "B 01 ABC", events: [], documents: [], ...over });
const sumBuckets = (series) => series.buckets.reduce((s, b) => s + b.total, 0);

test("period ranges are calendar-based and anchored on today", () => {
  assert.deepEqual(periodRange("year", TODAY), { id: "year", from: "2026-01-01", to: "2026-12-31" });
  assert.deepEqual(periodRange("12m", TODAY), { id: "12m", from: "2025-10-01", to: "2026-09-30" });
  assert.deepEqual(periodRange("all", TODAY), { id: "all", from: null, to: null });
  assert.deepEqual(periodRange("12m", "2026-01-31"), { id: "12m", from: "2025-02-01", to: "2026-01-31" });
  assert.deepEqual(periodRange("12m", "2024-02-10"), { id: "12m", from: "2023-03-01", to: "2024-02-29" });
  assert.equal(periodRange("nonsense", TODAY).id, "year");
  assert.equal(inRange(undefined, periodRange("all", TODAY)), false);
});

test("year boundary: 31 Dec belongs to the previous year but still to the last 12 months", () => {
  const v = car({ events: [ev("2025-12-31", "fuel", 300), ev("2026-01-01", "fuel", 200), ev("2025-09-30", "fuel", 50)] });
  assert.equal(spending([v], periodRange("year", TODAY)).total, 200);
  assert.equal(spending([v], periodRange("12m", TODAY)).total, 500);
  assert.equal(spending([v], periodRange("all", TODAY)).total, 550);
});

test("a car with no events yields zeros everywhere and no derived figures", () => {
  const v = car();
  const s = carSummary(v, "year", TODAY);
  assert.deepEqual(s.spent, { total: 0, cats: { fuel: 0, maintenance: 0, document: 0, expense: 0 }, count: 0 });
  assert.equal(s.series.buckets.length, 12);
  assert.ok(s.series.buckets.every((b) => b.total === 0));
  assert.deepEqual(s.repairs, { count: 0, cost: 0, byType: [] });
  assert.equal(s.perKm, null);
  assert.equal(s.km, null);
  assert.equal(s.rate, null);
  assert.deepEqual(s.byYear, []);
  assert.equal(s.fuel, null);
  assert.equal(s.lastService, null);
  assert.deepEqual(topByCost([v], periodRange("year", TODAY)), []);
  assert.deepEqual(kmRows([v], TODAY), []);
  assert.equal(dominantCategory(s.spent.cats), null);
});

test("costs are grouped by category; odometer and unknown kinds count as other expenses; non-positive costs are ignored", () => {
  const v = car({ events: [
    ev("2026-02-01", "fuel", 100.1), ev("2026-02-02", "fuel", "200.2"), ev("2026-02-03", "maintenance", 500, { type: "brakes" }),
    ev("2026-02-04", "document", 150), ev("2026-02-05", "expense", 60), ev("2026-02-06", "odometer", 5, { km: 1000 }),
    ev("2026-02-07", "mystery", 7), ev("2026-02-08", "fuel", 0), ev("2026-02-09", "fuel", -40), ev("2026-02-10", "fuel", null),
  ] });
  const s = spending([v], periodRange("year", TODAY));
  assert.deepEqual(s.cats, { fuel: 300.3, maintenance: 500, document: 150, expense: 72 });
  assert.equal(s.total, 1022.3);
  assert.equal(s.count, 7);
});

test("the stacked series always adds up to the period total", () => {
  const v = car({ events: [ev("2025-10-15", "fuel", 100), ev("2026-03-01", "maintenance", 250), ev("2026-09-30", "document", 40), ev("2026-11-20", "expense", 9)] });
  for (const id of ["year", "12m", "all"]) {
    const range = periodRange(id, TODAY);
    const series = spendingSeries([v], range, TODAY);
    assert.equal(sumBuckets(series), spending([v], range).total, id);
  }
  const m12 = spendingSeries([v], periodRange("12m", TODAY), TODAY);
  assert.equal(m12.unit, "month");
  assert.deepEqual([m12.buckets[0].key, m12.buckets.at(-1).key], ["2025-10", "2026-09"]);
  assert.equal(m12.buckets[0].values.fuel, 100);
  assert.equal(m12.buckets[0].long, "octombrie 2025");
  assert.equal(m12.caption, "octombrie 2025 – septembrie 2026");
  assert.deepEqual([m12.buckets[2].group, m12.buckets[3].group], [2025, 2026]);
});

test("all-time history switches to yearly buckets past 24 months and starts at the first event", () => {
  const short = car({ events: [ev("2025-06-10", "fuel", 10)] });
  const s1 = spendingSeries([short], periodRange("all", TODAY), TODAY);
  assert.equal(s1.unit, "month");
  assert.equal(s1.buckets[0].key, "2025-06");
  assert.equal(s1.buckets.at(-1).key, "2026-09");

  const long = car({ events: [ev("2021-03-01", "fuel", 10), ev("2024-07-01", "document", 20)] });
  const s2 = spendingSeries([long], periodRange("all", TODAY), TODAY);
  assert.equal(s2.unit, "year");
  assert.deepEqual(s2.buckets.map((b) => b.key), ["2021", "2022", "2023", "2024", "2025", "2026"]);
  assert.equal(s2.buckets[3].values.document, 20);

  const empty = spendingSeries([car()], periodRange("all", TODAY), TODAY);
  assert.equal(empty.buckets.length, 1);
  assert.equal(empty.buckets[0].key, "2026-09");
});

test("repairs group maintenance events by type, count cost-less work, and sort by cost then count", () => {
  const v = car({ events: [
    ev("2026-01-10", "maintenance", 300, { type: "brakes" }), ev("2026-02-10", "maintenance", 900, { type: "distributie" }),
    ev("2026-03-10", "maintenance", null, { type: "brakes" }), ev("2026-04-10", "maintenance", 50, { type: "invented" }),
    ev("2026-05-10", "fuel", 400), ev("2025-05-10", "maintenance", 999, { type: "repair" }),
  ] });
  const r = repairs(v, periodRange("year", TODAY));
  assert.equal(r.count, 4);
  assert.equal(r.cost, 1250);
  assert.deepEqual(r.byType.map((t) => [t.type, t.count, t.cost]), [["distributie", 1, 900], ["brakes", 2, 300], ["other", 1, 50]]);
  assert.equal(r.byType[2].label, "Altă lucrare");
});

test("last service is the latest oil-change event, with or without a cost", () => {
  const v = car({ events: [
    ev("2025-01-01", "maintenance", 800, { type: "service" }), ev("2026-02-01", "maintenance", null, { type: "service" }),
    ev("2026-03-01", "maintenance", 100, { type: "brakes" }),
  ] });
  assert.equal(lastService(v).date, "2026-02-01");
});

test("no model year: no lifetime figures, but readings still give a km rate", () => {
  const noYear = car({ km: 120000 });
  assert.equal(lifetimeKm(noYear, TODAY), null);
  assert.equal(kmComparison(noYear, TODAY), null);
  assert.equal(kmRate(noYear, TODAY), null);
  assert.equal(fuelOutlook(noYear), null);

  const withReadings = car({ events: [ev("2025-01-01", "odometer", null, { km: 50000 }), ev("2025-07-01", "odometer", null, { km: 60000 })] });
  assert.deepEqual(kmRate(withReadings, TODAY), { kmAn: Math.round((10000 / 181) * 365), source: "readings" });
  const rows = kmRows([withReadings], TODAY);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cmp, null);
});

test("a single km reading gives no per-year split, no cost per km and falls back to the model year", () => {
  const v = car({ year: "2020", km: 90000, events: [ev("2026-05-01", "maintenance", 400, { type: "service", km: 88000 })] });
  assert.equal(odometerReadings(v).length, 1);
  assert.equal(readingsRate(v), null);
  assert.deepEqual(kmByYear(v), []);
  assert.equal(costPerKm(v, periodRange("all", TODAY)), null);
  assert.equal(kmRate(v, TODAY).source, "modelYear");
  assert.equal(kmRate(v, TODAY).kmAn, lifetimeKm(v, TODAY).kmAn);
});

test("km between readings are split across calendar years by days; a reading below an earlier one is skipped", () => {
  const v = car({ events: [
    ev("2025-12-01", "odometer", null, { km: 10000 }), ev("2026-01-31", "odometer", null, { km: 16100 }),
    ev("2026-02-15", "odometer", null, { km: 15000 }), ev("2026-03-01", "odometer", null, { km: 17000 }),
  ] });
  const rows = kmByYear(v);
  assert.deepEqual(rows.map((r) => r.year), [2025, 2026]);
  assert.equal(rows[0].km, Math.round((6100 * 31) / 61));
  assert.equal(rows[0].partial, true);
  assert.equal(rows[0].km + rows[1].km, 17000 - 10000);
  assert.equal(kmYearBuckets(rows)[0].long, "2025 (parțial, 31 de zile)");
  assert.equal(kmYearBuckets(rows)[0].label, "2025*");
  assert.equal(kmYearBuckets([{ year: 2026, km: 10, days: 5, partial: true }])[0].long, "2026 (parțial, 5 zile)");

  const fullYear = kmByYear(car({ events: [ev("2023-01-01", "odometer", null, { km: 0.001 }), ev("2024-01-01", "odometer", null, { km: 12000 })] }));
  assert.equal(fullYear.length, 1);
  assert.equal(fullYear[0].partial, false);
});

test("km/year shown to the user matches the one used by the fuel estimate", () => {
  const readings = car({ fuel: "Motorină", year: "2018", km: 70000, events: [ev("2024-01-01", "odometer", null, { km: 40000 }), ev("2025-06-01", "odometer", null, { km: 70000 })] });
  const lifetimeOnly = car({ fuel: "Benzină", year: "2019", km: 100000 });
  for (const v of [readings, lifetimeOnly]) {
    assert.equal(kmRate(v, todayStr()).kmAn, kmPerYear(v));
    assert.equal(fuelOutlook(v).kmAn, fuelEstimate(v).kmAn);
  }
  assert.equal(fuelOutlook(readings).kmSource, "readings");
  assert.equal(fuelOutlook(lifetimeOnly).kmSource, "modelYear");
});

test("the car's km counts as a new reading only when it is above every logged one", () => {
  const imported = car({ fuel: "Motorină", km: 70000, kmUpdatedAt: `${todayStr()}T08:00:00Z`, events: [
    ev("2024-01-01", "odometer", null, { km: 40000 }), ev("2025-06-01", "odometer", null, { km: 70000 }),
  ] });
  assert.deepEqual(odometerReadings(imported).map((p) => p.date), ["2024-01-01", "2025-06-01"]);
  assert.equal(readingsRate(imported).to, "2025-06-01");
  assert.equal(kmPerYear(imported), readingsRate(imported).kmAn);
  assert.equal(kmPerYear(imported), Math.round((30000 / 517) * 365));

  const lower = car({ km: 65000, kmUpdatedAt: `${todayStr()}T08:00:00Z`, events: imported.events });
  assert.equal(odometerReadings(lower).length, 2);

  const newer = car({ km: 75000, kmUpdatedAt: "2026-03-01T10:00:00Z", events: imported.events });
  assert.deepEqual(odometerReadings(newer).at(-1), { date: "2026-03-01", km: 75000 });
  assert.equal(kmPerYear(newer), kmRate(newer, todayStr()).kmAn);
});

test("typical km bands decline with age and accumulate piecewise", () => {
  assert.deepEqual([typicalKmAt(0.5), typicalKmAt(3), typicalKmAt(7.5), typicalKmAt(20)], [22000, 17000, 13000, 10000]);
  assert.equal(typicalKmTotal(0.5), 11000);
  assert.equal(typicalKmTotal(3), 66000);
  assert.equal(typicalKmTotal(7), 134000);
  assert.equal(typicalKmTotal(15), 66000 + 68000 + 65000 + 30000);
});

test("a heavily used car is compared with a typical car of the same age", () => {
  const v = car({ year: "2019", km: 310000, category: "autoturism" });
  const c = kmComparison(v, TODAY);
  assert.equal(c.since, 2019);
  assert.ok(c.years > 7 && c.years < 7.5);
  assert.equal(aniText(c.years), "7 ani");
  assert.ok(c.ratio > 2.2 && c.ratio < 2.3);
  assert.equal(c.phrase, "de 2,3× mai mult decât media pentru vârsta ei");
  assert.equal(c.typicalNow, 13000);
  assert.equal(c.expectedTotal % 100, 0);
  assert.equal(c.expectedKmAn, Math.round(typicalKmTotal(c.years) / c.years / 100) * 100);
});

test("no comparison for brand-new cars or categories without a reference", () => {
  const fresh = kmComparison(car({ year: "2026", km: 4000 }), TODAY);
  assert.equal(fresh.years, 180 / 365);
  assert.equal(fresh.ratio, null);
  assert.equal(fresh.phrase, null);
  assert.equal(fresh.typicalNow, 22000);

  const truck = kmComparison(car({ year: "2015", km: 900000, category: "camion" }), TODAY);
  assert.equal(truck.ratio, null);
  assert.equal(truck.typicalNow, null);
});

test("ratio phrases cover above, typical and below", () => {
  assert.equal(kmRatioPhrase(2), "de 2× mai mult decât media pentru vârsta ei");
  assert.equal(kmRatioPhrase(1.3), "cu 30% peste media pentru vârsta ei");
  assert.equal(kmRatioPhrase(1), "în linie cu media pentru vârsta ei");
  assert.equal(kmRatioPhrase(0.7), "cu 30% sub media pentru vârsta ei");
  assert.equal(kmRatioPhrase(0.25), "de 4× mai puțin decât media pentru vârsta ei");
});

test("fuel outlook flags measured consumption and paid price, and skips trailers", () => {
  const v = car({ fuel: "Motorină", year: "2021", km: 42000, events: [
    ev("2026-06-01", "fuel", 400, { liters: 50, km: 41000 }), ev("2026-07-01", "fuel", 420, { liters: 55, km: 41800 }),
  ] });
  const f = fuelOutlook(v);
  assert.equal(f.real, true);
  assert.equal(f.pricePaid, true);
  assert.equal(f.cons, (55 / 800) * 100);
  assert.equal(f.price, 420 / 55);

  const estimated = fuelOutlook(car({ fuel: "Benzină", year: "2021", km: 60000 }));
  assert.equal(estimated.real, false);
  assert.equal(estimated.pricePaid, false);
  assert.equal(estimated.cons, 7.5);

  assert.equal(fuelOutlook(car({ category: "remorca", year: "2015", km: 30000 })), null);
  assert.equal(fuelOutlook(car({ year: "2015", km: 30000 })).fuelKnown, false);
});

test("estimates never leak into spent totals", () => {
  const a = car({ fuel: "Motorină", year: "2018", km: 200000, events: [ev("2026-04-01", "fuel", 300, { liters: 40 })] });
  const b = car({ fuel: "Benzină", year: "2022", km: 60000, events: [ev("2026-05-01", "maintenance", 700, { type: "service" })] });
  const s = fleetSummary([a, b], "year", TODAY);
  assert.equal(s.spent.total, 1000);
  assert.equal(s.spent.cats.fuel, 300);
  assert.ok(s.fuelYear.total > 1000);
  assert.equal(s.fuelYear.cars, 2);
  assert.equal(sumBuckets(s.series), 1000);
  assert.equal(s.top.cost.reduce((x, r) => x + r.total, 0), 1000);
  assert.equal(carSummary(a, "year", TODAY).spent.total, 300);
});

test("cost per km uses only spending inside the span covered by readings", () => {
  const v = car({ events: [
    ev("2025-11-01", "expense", 999),
    ev("2026-01-01", "fuel", 100, { km: 10000, liters: 10 }),
    ev("2026-02-01", "maintenance", 400, { type: "service" }),
    ev("2026-03-01", "fuel", 200, { km: 12000, liters: 20 }),
    ev("2026-05-01", "expense", 50),
  ] });
  const all = costPerKm(v, periodRange("all", TODAY));
  assert.deepEqual(all, { perKm: 600 / 2000, km: 2000, cost: 600, from: "2026-01-01", to: "2026-03-01" });

  const clipped = costPerKm(v, { id: "custom", from: "2026-02-01", to: "2026-12-31" });
  assert.equal(clipped.from, "2026-02-01");
  assert.equal(clipped.km, Math.round(2000 - (2000 * 31) / 59));
  assert.equal(clipped.cost, 600);

  assert.equal(costPerKm(car({ events: [ev("2026-01-01", "odometer", null, { km: 100 }), ev("2026-02-01", "odometer", null, { km: 300 })] }), periodRange("all", TODAY)), null);
});

test("cost per km ignores a mistyped lower reading instead of interpolating through it", () => {
  const v = car({ events: [
    ev("2026-01-01", "odometer", null, { km: 10000 }),
    ev("2026-02-01", "fuel", 300, { km: 1200, liters: 40 }),
    ev("2026-03-01", "odometer", null, { km: 12000 }),
  ] });
  const r = costPerKm(v, { id: "custom", from: "2026-02-01", to: "2026-12-31" });
  assert.equal(r.km, Math.round(2000 - (2000 * 31) / 59));
  assert.equal(r.cost, 300);
});

test("rankings: cost and fuel by value, repairs by count then cost, ties by name", () => {
  const range = periodRange("year", TODAY);
  const a = car({ make: "Audi", fuel: "Benzină", year: "2015", km: 250000, events: [ev("2026-01-02", "maintenance", 100, { type: "brakes" }), ev("2026-01-03", "maintenance", 100, { type: "tyres" })] });
  const b = car({ make: "BMW", fuel: "Motorină", year: "2023", km: 30000, events: [ev("2026-01-02", "maintenance", 900, { type: "repair" }), ev("2026-01-03", "maintenance", 100, { type: "battery" })] });
  const c = car({ make: "Cupra", fuel: "Electric", year: "2024", km: 20000, events: [ev("2026-02-02", "maintenance", 5000, { type: "repair" })] });
  assert.deepEqual(topByCost([a, b, c], range).map((r) => r.name), ["Cupra Logan", "BMW Logan", "Audi Logan"]);
  assert.deepEqual(topRepairs([a, b, c], range).map((r) => r.name), ["BMW Logan", "Audi Logan", "Cupra Logan"]);
  const fuel = topFuel([a, b, c]);
  assert.deepEqual(fuel.map((r) => r.name), ["Audi Logan", "BMW Logan", "Cupra Logan"]);
  assert.ok(fuel[0].fuel.costYear >= fuel[1].fuel.costYear);
  assert.equal(fuel[2].fuel.unit, "kWh");
  assert.equal(topByCost(Array.from({ length: 8 }, () => car({ events: [ev("2026-03-03", "fuel", 10)] })), range).length, 5);
});

test("fleet summary aggregates km/year and cost per km across cars that have data", () => {
  const withKm = car({ year: "2020", km: 60000, events: [ev("2026-01-01", "odometer", null, { km: 50000 }), ev("2026-06-30", "fuel", 500, { km: 60000, liters: 60 })] });
  const bare = car();
  const s = fleetSummary([withKm, bare], "year", TODAY);
  assert.equal(s.count, 2);
  assert.equal(s.kmAn.cars, 1);
  assert.equal(s.kmAn.total, readingsRate(withKm).kmAn);
  assert.equal(s.perKm.km, 10000);
  assert.equal(s.perKm.perKm, 0.05);
  assert.equal(s.attention, 0);
  assert.equal(s.km.length, 1);
});

test("Romanian counts and labels", () => {
  assert.equal(countOf(1, "lucrare", "lucrări"), "1 lucrare");
  assert.equal(countOf(0, "lucrare", "lucrări"), "0 lucrări");
  assert.equal(countOf(7, "lucrare", "lucrări"), "7 lucrări");
  assert.equal(countOf(20, "lucrare", "lucrări"), "20 de lucrări");
  assert.equal(countOf(101, "lucrare", "lucrări"), "101 lucrări");
  assert.equal(countOf(1000, "lucrare", "lucrări"), "1.000 de lucrări");
  assert.equal(aniText(0.4), "sub un an");
  assert.equal(aniText(1.2), "un an");
  assert.equal(aniText(21), "21 de ani");
  assert.equal(inAniText(0.49), "în mai puțin de un an");
  assert.equal(inAniText(1.3), "într-un an");
  assert.equal(inAniText(7.25), "în 7 ani");
  assert.equal(inAniText(20), "în 20 de ani");
  assert.equal(periodPhrase(periodRange("all", TODAY)), "de la început");
  assert.equal(periodPhrase(periodRange("year", TODAY)), "în 2026");
  assert.equal(fmtDecimal(6.5), "6,5");
  assert.equal(spentTitle(periodRange("year", TODAY)), "Cheltuit în 2026");
  assert.equal(spentTitle(periodRange("12m", TODAY)), "Cheltuit în ultimele 12 luni");
});

test("cost per km never rounds a small value down to zero", () => {
  setCurrency("RON");
  assert.equal(fmtPerKm(0.57), "0,57 lei/km");
  assert.equal(fmtPerKm(3.3087), "3,31 lei/km");
  assert.equal(fmtPerKm(1200 / 285000), "0,0042 lei/km");
  setCurrency("EUR");
  assert.equal(fmtPerKm(0.0812), "€0,081/km");
  assert.equal(fmtPerKm(0.25), "€0,25/km");
  setCurrency("RON");
});

test("axis ticks are clean round numbers that cover the maximum", () => {
  assert.deepEqual(niceTicks(0), { ticks: [0, 1], top: 1 });
  assert.deepEqual(niceTicks(1234), { ticks: [0, 500, 1000, 1500], top: 1500 });
  assert.deepEqual(niceTicks(8000), { ticks: [0, 2000, 4000, 6000, 8000], top: 8000 });
  for (const max of [3, 17, 95, 2601, 48213, 310000]) {
    const { ticks, top } = niceTicks(max);
    assert.ok(top >= max && ticks.at(-1) === top && ticks[0] === 0);
    assert.ok(ticks.every((t) => Number.isInteger(t)));
  }
});

test("bar shapes clamp the rounded end for tiny marks", () => {
  assert.equal(columnPath(0, 10, 20, 1), "M0,11V11A1,1 0 0 1 1,10H19A1,1 0 0 1 20,11V11Z");
  assert.match(barPath(0, 0, 50, 14), /^M0,0H46A4,4/);
  assert.match(barPath(0, 0, 2, 14), /^M0,0H0A2,2/);
});
