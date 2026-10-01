import { test } from "node:test";
import assert from "node:assert/strict";
import { itpRequirement, firstItpDue, itpInterval } from "../shared/itp.js";
import { requiredDocs, collectAlerts } from "../shared/alerts.js";
import { sanitizeVehicleFields } from "../shared/domain.js";

const TODAY = "2026-09-30";

test("a car registered new in 2025 needs no ITP until 3 years after first registration", () => {
  const v = { category: "autoturism", year: "2025", firstRegistration: "2025-03-10" };
  assert.deepEqual(firstItpDue(v), { date: "2028-03-09", estimated: false, months: 36, label: "3 ani" });
  const r = itpRequirement(v, false, TODAY);
  assert.equal(r.required, false);
  assert.equal(r.dueBy, "2028-03-09");
  assert.deepEqual(requiredDocs(v, TODAY), ["rca", "rovinieta"]);
});

test("without a registration date the first ITP is estimated from 1 January of the model year", () => {
  const r = itpRequirement({ category: "autoturism", year: "2024" }, false, TODAY);
  assert.equal(r.required, false);
  assert.equal(r.dueBy, "2026-12-31");
  assert.equal(r.estimated, true);
  assert.equal(itpRequirement({ category: "autoturism", year: "2022" }, false, TODAY).required, true);
});

test("second-hand imports and cars without a year need ITP right away", () => {
  assert.equal(itpRequirement({ category: "autoturism", year: "2025", newAtRegistration: false }, false, TODAY).required, true);
  assert.equal(itpRequirement({ category: "autoturism" }, false, TODAY).required, true);
});

test("first ITP and periodicity by class and usage (OG 81/2000)", () => {
  const first = (v) => firstItpDue({ year: "2026", firstRegistration: "2026-01-15", ...v }).months;
  assert.equal(first({ category: "utilitara" }), 24);
  assert.equal(first({ category: "camion" }), 12);
  assert.equal(first({ category: "rulota" }), 36);
  assert.equal(first({ category: "remorca" }), 24);
  assert.equal(first({ category: "moto" }), 24);
  assert.equal(first({ category: "autoturism", usage: "taxi" }), 12);
  assert.equal(itpInterval({ category: "autoturism", usage: "rent", year: "2025" }).months, 6);
  assert.equal(itpInterval({ category: "microbuz", year: "2025" }).months, 6);
  assert.equal(itpInterval({ category: "utilitara", year: "2025" }).months, 12);
  assert.equal(itpInterval({ category: "rulota", year: "2010" }).months, 36);
});

test("the 12-year threshold is counted in the year of the inspection", () => {
  const v = { category: "autoturism", year: "2014" };
  assert.equal(itpInterval(v, "2025-06-01").months, 24);
  assert.equal(itpInterval(v, "2026-06-01").months, 12);
});

test("an upcoming first ITP raises an alert only in the last 30 days", () => {
  const soon = { id: "a", make: "Dacia", plate: "B 1 A", category: "autoturism", year: "2023", firstRegistration: "2023-10-20", documents: [] };
  const later = { ...soon, id: "b", firstRegistration: "2024-05-01" };
  const alerts = collectAlerts([soon, later], TODAY).filter((a) => a.type === "itp");
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].vid, "a");
  assert.match(alerts[0].msg, /prima ITP trebuie făcută în 19 zile/);
});

test("registration fields are validated", () => {
  assert.deepEqual(sanitizeVehicleFields({ firstRegistration: "2025-02-30x", newAtRegistration: "da", usage: "tractor" }), { firstRegistration: null, newAtRegistration: null, usage: null });
  assert.deepEqual(sanitizeVehicleFields({ firstRegistration: "2025-02-03", newAtRegistration: false, usage: "taxi" }), { firstRegistration: "2025-02-03", newAtRegistration: false, usage: "taxi" });
});

test("stopped aspects and archived cars raise no alerts and are not required", async () => {
  const { requiredDocs, collectAlerts } = await import("../shared/alerts.js");
  const base = { id: "r", make: "Rulotă", plate: "B 1 R", category: "rulota", year: "2010", tyres: "attention", nextServiceDate: "2026-01-01", documents: [{ type: "itp", expires: "2023-07-13" }] };
  assert.ok(collectAlerts([base], TODAY).length >= 2);
  const quiet = { ...base, ignored: ["itp", "service", "tyres"] };
  assert.equal(collectAlerts([quiet], TODAY).length, 0);
  assert.deepEqual(requiredDocs(quiet, TODAY), ["rca"]);
  assert.equal(collectAlerts([{ ...base, archived: true }], TODAY).length, 0);
  assert.deepEqual(sanitizeVehicleFields({ ignored: ["itp", "nope", "itp"], archived: "da" }), { ignored: ["itp"], archived: false });
});
