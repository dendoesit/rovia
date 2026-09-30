import { test } from "node:test";
import assert from "node:assert/strict";
import { vignetteQuote, vignetteCategoryFor, euroClassFor, renewalClipboard, safeHttpsUrl } from "../shared/renewals.js";
import { sanitizeVehicleFields } from "../shared/domain.js";

test("12-month vignette price follows category and Euro class", () => {
  assert.deepEqual(vignetteQuote({ category: "autoturism", year: "2021", fuel: "Motorină" }), { category: "A", euro: "euro6", euroGuessed: true, price: 254 });
  assert.equal(vignetteQuote({ category: "autoturism", year: "2008", fuel: "Benzină" }).price, 292);
  assert.equal(vignetteQuote({ category: "autoturism", year: "2003" }).price, 330);
  assert.equal(vignetteQuote({ category: "autoturism", fuel: "Electric" }).price, 228);
  assert.equal(vignetteQuote({ category: "utilitara", euroClass: "euro6" }).price, 579);
});

test("trailers, motorbikes and heavy trucks do not get a vignette price", () => {
  assert.equal(vignetteCategoryFor({ category: "remorca" }), "none");
  assert.equal(vignetteCategoryFor({ category: "moto" }), "none");
  assert.equal(vignetteQuote({ category: "camion", year: "2020" }).category, "tollro");
  assert.equal(vignetteQuote({ category: "camion", year: "2020" }).price, null);
});

test("unknown year leaves the Euro class and price open; explicit class wins", () => {
  assert.equal(euroClassFor({ category: "autoturism" }), null);
  assert.equal(vignetteQuote({ category: "autoturism" }).price, null);
  assert.deepEqual(euroClassFor({ year: "2021", euroClass: "euro5" }), { value: "euro5", guessed: false });
});

test("clipboard carries the car and, for companies, the billing details", () => {
  const text = renewalClipboard({ plate: "B 101 TST", vin: "WVWZZZ1KZAW000001", make: "VW", model: "Golf", year: "2019", fuel: "Benzină" },
    { kind: "company", company: { name: "Exemplu SRL", cui: "12345678", regCom: "J40/1/2020", address: "Str. Test 1" } }, "rca");
  assert.match(text, /Nr\. înmatriculare: B 101 TST/);
  assert.match(text, /VIN: WVWZZZ1KZAW000001/);
  assert.match(text, /VW Golf 2019/);
  assert.match(text, /CUI: 12345678/);
  assert.doesNotMatch(renewalClipboard({ plate: "B 1 X" }, { kind: "personal" }, "rovinieta"), /CUI/);
});

test("vehicle renewal fields are validated and broker links must be https", () => {
  assert.deepEqual(sanitizeVehicleFields({ euroClass: "euro9", vignetteCategory: "Z", civ: "ab123456" }), { euroClass: null, vignetteCategory: null, civ: "AB123456" });
  assert.equal(safeHttpsUrl("http://broker.ro"), null);
  assert.equal(safeHttpsUrl("javascript:alert(1)"), null);
  assert.equal(safeHttpsUrl("https://broker.ro/rca"), "https://broker.ro/rca");
});
