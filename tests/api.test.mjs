import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { handle } from "../netlify/functions/api.mjs";
import { memoryStore } from "./memory-store.mjs";

const ORIGIN = "https://fleeta.netlify.app";

function client(store) {
  let cookie = "";
  return async (method, path, body, headers = {}) => {
    const res = await handle(new Request(ORIGIN + path, {
      method,
      headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    }), store);
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0].endsWith("=") ? "" : set.split(";")[0];
    const text = await res.text();
    return { status: res.status, body: text && res.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text, setCookie: set };
  };
}

test("register sets an HttpOnly 30-day session cookie and /auth/me works without re-typing credentials", async () => {
  const api = client(memoryStore());
  const r = await api("POST", "/api/auth/register", { email: "Ana@Firma.ro", password: "parola-buna", kind: "company", company: { name: "Exemplu Transport SRL" } });
  assert.equal(r.status, 201);
  assert.match(r.setCookie, /HttpOnly/);
  assert.match(r.setCookie, /Max-Age=2592000/);
  assert.equal(r.body.account.email, "ana@firma.ro");
  assert.equal(r.body.account.currency, "RON");
  const me = await api("GET", "/api/auth/me");
  assert.equal(me.status, 200);
  assert.equal(me.body.account.company.name, "Exemplu Transport SRL");
});

test("duplicate e-mail registration is rejected", async () => {
  const store = memoryStore();
  await client(store)("POST", "/api/auth/register", { email: "a@b.ro", password: "parola-test-123" });
  const r = await client(store)("POST", "/api/auth/register", { email: "a@b.ro", password: "parola-test-123" });
  assert.equal(r.status, 409);
});

test("unknown username no longer auto-creates an account", async () => {
  const r = await client(memoryStore())("POST", "/api/auth/login", { identifier: "dan", password: "orice" });
  assert.equal(r.status, 401);
});

test("legacy username accounts log in, keep their cars and are rehashed with PBKDF2", async () => {
  const store = memoryStore();
  const salt = "legacy-salt";
  await store.setJSON("account:dan", { user: "dan", salt, passHash: createHash("sha256").update(salt + ":veche").digest("hex"), email: "dan@x.ro" });
  await store.setJSON("user:dan:vehicle:v1", { id: "v1", make: "BMW", plate: "B 1 ABC", events: [{ id: "e1", kind: "expense", cost: 10, date: "2026-01-01", photo: "data:image/jpeg;base64,AAAA" }], documents: [] });
  const api = client(store);
  const r = await api("POST", "/api/auth/login", { identifier: "Dan", password: "veche" });
  assert.equal(r.status, 200);
  assert.equal(r.body.account.legacyUser, "dan");
  assert.equal(r.body.account.reminderEmail, "dan@x.ro");
  const stored = await store.get("account:dan", { type: "json" });
  assert.equal(stored.password.algo, "pbkdf2-sha256");
  assert.equal(stored.legacyHash, undefined);
  const list = await api("GET", "/api/vehicles");
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].events[0].photo, undefined);
  assert.equal(list.body[0].events[0].hasPhoto, true);
  const photo = await api("GET", "/api/vehicles/v1/photos/e1");
  assert.equal(photo.status, 200);
});

test("five wrong passwords lock the identifier", async () => {
  const store = memoryStore();
  await client(store)("POST", "/api/auth/register", { email: "x@y.ro", password: "corecta-123" });
  const api = client(store);
  for (let i = 0; i < 5; i++) assert.equal((await api("POST", "/api/auth/login", { identifier: "x@y.ro", password: "gresita" })).status, 401);
  assert.equal((await api("POST", "/api/auth/login", { identifier: "x@y.ro", password: "corecta-123" })).status, 429);
});

test("changing the password revokes other sessions", async () => {
  const store = memoryStore();
  const a = client(store), b = client(store);
  await a("POST", "/api/auth/register", { email: "p@q.ro", password: "prima-parola" });
  await b("POST", "/api/auth/login", { identifier: "p@q.ro", password: "prima-parola" });
  assert.equal((await a("POST", "/api/account/password", { current: "prima-parola", next: "a-doua-parola" })).status, 200);
  assert.equal((await a("GET", "/api/auth/me")).status, 200);
  assert.equal((await b("GET", "/api/auth/me")).status, 401);
});

test("cross-origin writes are refused", async () => {
  const r = await client(memoryStore())("POST", "/api/auth/login", { identifier: "a@b.ro", password: "x" }, { origin: "https://evil.example" });
  assert.equal(r.status, 403);
});

test("vehicle lifecycle: create, duplicate plate, event with photo stored apart, document, delete", async () => {
  const store = memoryStore();
  const api = client(store);
  await api("POST", "/api/auth/register", { email: "f@g.ro", password: "parola-test-123" });
  const v = (await api("POST", "/api/vehicles", { make: "Dacia", model: "Duster", plate: "cj55xyz", km: 150000, category: "autoturism" })).body;
  assert.equal(v.plate, "CJ55XYZ");
  assert.equal((await api("POST", "/api/vehicles", { make: "Dacia", plate: "CJ 55 XYZ" })).status, 409);
  const withEvent = (await api("POST", `/api/vehicles/${v.id}/events`, { event: { kind: "fuel", cost: 350, liters: 45, km: 150600, photo: "data:image/jpeg;base64,AAAA" } })).body;
  assert.equal(withEvent.km, 150600);
  assert.equal(withEvent.events[0].hasPhoto, true);
  assert.ok([...store.data].filter(([k]) => k.includes(":vehicle:")).every(([, e]) => !e.value.includes("base64")));
  const withDoc = (await api("PUT", `/api/vehicles/${v.id}/documents/rca`, { expires: "2027-01-31", provider: "Allianz", cost: 900 })).body;
  assert.equal(withDoc.documents[0].expires, "2027-01-31");
  assert.equal((await api("PUT", `/api/vehicles/${v.id}/documents/__proto__`, { expires: "2027-01-31" })).status, 400);
  assert.equal((await api("DELETE", `/api/vehicles/${v.id}/documents/rca`)).body.documents.length, 0);
  assert.equal((await api("DELETE", `/api/vehicles/${v.id}`)).status, 204);
  assert.equal((await api("GET", "/api/vehicles")).body.length, 0);
});

test("invalid field types are sanitized instead of crashing the UI", async () => {
  const api = client(memoryStore());
  await api("POST", "/api/auth/register", { email: "t@t.ro", password: "parola-test-123" });
  const v = (await api("POST", "/api/vehicles", { make: "VW", plate: "IS77ABC", km: "abc", year: 12, fuel: "Apă", nextServiceDate: "mâine" })).body;
  assert.equal(v.km, null);
  assert.equal(v.year, null);
  assert.equal(v.fuel, null);
  assert.equal(v.nextServiceDate, null);
});

test("bulk import creates new cars and merges existing plates without duplicating history", async () => {
  const api = client(memoryStore());
  await api("POST", "/api/auth/register", { email: "i@i.ro", password: "parola-test-123" });
  const payload = { vehicles: [
    { make: "Toyota", plate: "B 101 TST", km: 210000, documents: [{ type: "rca", expires: "2027-03-31" }], events: [{ kind: "maintenance", type: "service", date: "2026-08-19", km: 210000 }] },
    { make: "VW", model: "Polo", plate: "IS77ABC", documents: [{ type: "itp", expires: "2026-12-12" }] },
    { model: "fără marcă" },
  ] };
  const first = (await api("POST", "/api/vehicles/import", payload)).body;
  assert.equal(first.created.length, 2);
  assert.equal(first.errors.length, 1);
  const again = (await api("POST", "/api/vehicles/import", payload)).body;
  assert.equal(again.updated.length, 2);
  const cars = (await api("GET", "/api/vehicles")).body;
  assert.equal(cars.length, 2);
  assert.equal(cars.find((c) => c.plate === "B 101 TST").events.length, 1);
});

test("unauthenticated requests get 401 and a cleared cookie", async () => {
  const r = await client(memoryStore())("GET", "/api/vehicles");
  assert.equal(r.status, 401);
  assert.match(r.setCookie, /Max-Age=0/);
});

test("legacy accounts with a weak password must change it", async () => {
  const store = memoryStore();
  const salt = "s";
  await store.setJSON("account:echipa", { user: "echipa", salt, passHash: createHash("sha256").update(salt + ":fleetdeck").digest("hex") });
  const api = client(store);
  const r = await api("POST", "/api/auth/login", { identifier: "echipa", password: "fleetdeck" });
  assert.equal(r.body.account.mustChangePassword, true);
  assert.equal((await api("POST", "/api/account/password", { current: "fleetdeck", next: "o-parola-noua-buna" })).status, 200);
  assert.equal((await api("GET", "/api/auth/me")).body.account.mustChangePassword, false);
});

test("reminder addresses, including the login one, are only used after confirmation", async () => {
  process.env.RESEND_API_KEY = "test";
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { sent.push(JSON.parse(opts.body)); return new Response(JSON.stringify({ id: "1" }), { status: 200 }); };
  const tokenOf = (mail) => mail.html.match(/#\/confirm\/([A-Za-z0-9_-]+)/)[1];
  try {
    const store = memoryStore();
    const api = client(store);
    const reg = await api("POST", "/api/auth/register", { email: "sef@firma.ro", password: "parola-test-123" });
    assert.equal(reg.body.verificationSent, true);
    assert.equal(reg.body.account.reminderVerified, false);
    const other = await api("PATCH", "/api/account", { reminderEmail: "flota@firma.ro" });
    assert.equal(other.body.verificationSent, true);
    assert.equal(other.body.account.pendingReminderEmail, "flota@firma.ro");
    assert.equal((await api("POST", "/api/auth/confirm-reminder", { token: tokenOf(sent[0]) })).status, 400, "the stale login-address link no longer applies");
    assert.equal((await api("POST", "/api/auth/confirm-reminder", { token: tokenOf(sent[1]) })).body.email, "flota@firma.ro");
    const me = (await api("GET", "/api/auth/me")).body.account;
    assert.equal(me.reminderEmail, "flota@firma.ro");
    assert.equal(me.reminderVerified, true);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.RESEND_API_KEY;
  }
});

test("encoded slashes in ids cannot reach another account's blobs", async () => {
  const store = memoryStore();
  const victim = client(store), attacker = client(store);
  await victim("POST", "/api/auth/register", { email: "victima@x.ro", password: "parola-test-123" });
  const vid = (await victim("POST", "/api/vehicles", { make: "Dacia", plate: "B 1 VIC" })).body.id;
  const victimId = (await victim("GET", "/api/auth/me")).body.account.id;
  await attacker("POST", "/api/auth/register", { email: "atacator@x.ro", password: "parola-test-123" });
  for (const path of [`/api/vehicles/..%2F..%2Faccount%3A${victimId}`, `/api/vehicles/..%2F..%2Fuser%3A${victimId}%3Avehicle%3A${vid}`, `/api/vehicles/${vid}%2F..`]) {
    for (const method of ["GET", "PATCH", "DELETE"]) {
      const r = await attacker(method, path, method === "PATCH" ? { make: "x" } : undefined);
      assert.equal(r.status, 404, `${method} ${path}`);
    }
  }
  assert.equal((await victim("GET", `/api/vehicles/${vid}`)).body.make, "Dacia");
});

test("lockout counts identifier variants together and parallel guesses cannot exceed it", async () => {
  const store = memoryStore();
  const salt = "s";
  await store.setJSON("account:echipa", { user: "echipa", salt, passHash: createHash("sha256").update(salt + ":adevarata").digest("hex") });
  const api = client(store);
  const variants = ["echipa", "Echipa", " echipa ", "echipa!", "#echipa"];
  const statuses = await Promise.all(Array.from({ length: 12 }, (_, i) => api("POST", "/api/auth/login", { identifier: variants[i % variants.length], password: "gresita" }).then((r) => r.status)));
  assert.equal(statuses.filter((s) => s === 401).length, 5);
  assert.ok(statuses.filter((s) => s === 429).length >= 7);
});

test("wrong current password is 403, not a session expiry; e-mail change needs the password", async () => {
  const api = client(memoryStore());
  await api("POST", "/api/auth/register", { email: "a@a.ro", password: "parola-test-123" });
  assert.equal((await api("POST", "/api/account/password", { current: "gresit", next: "alta-parola-123" })).status, 403);
  const noPass = await api("PATCH", "/api/account", { email: "nou@a.ro" });
  assert.equal(noPass.status, 403);
  assert.equal(noPass.body.code, "password_required");
  assert.equal((await api("PATCH", "/api/account", { email: "nou@a.ro", currentPassword: "parola-test-123" })).body.account.email, "nou@a.ro");
  assert.equal((await api("POST", "/api/auth/login", { identifier: "nou@a.ro", password: "parola-test-123" })).status, 200);
  assert.equal((await api("POST", "/api/auth/login", { identifier: "a@a.ro", password: "parola-test-123" })).status, 401);
  const expired = await client(memoryStore())("GET", "/api/vehicles");
  assert.equal(expired.body.code, "session");
});

test("legacy login keeps the old hash fields so a rollback to the previous version still works", async () => {
  const store = memoryStore();
  const salt = "s";
  const passHash = createHash("sha256").update(salt + ":parola-veche-1").digest("hex");
  await store.setJSON("account:ion", { user: "ion", salt, passHash, email: "ion@x.ro" });
  const api = client(store);
  assert.equal((await api("POST", "/api/auth/login", { identifier: "ion", password: "parola-veche-1" })).status, 200);
  const stored = await store.get("account:ion", { type: "json" });
  assert.equal(stored.user, "ion");
  assert.equal(stored.passHash, passHash);
  assert.equal(stored.password.algo, "pbkdf2-sha256");
  await api("POST", "/api/account/password", { current: "parola-veche-1", next: "parola-noua-bun" });
  const after = await store.get("account:ion", { type: "json" });
  assert.equal(after.passHash, undefined);
});

test("events cannot rewrite the car's identity and plates stay unique on edit", async () => {
  const api = client(memoryStore());
  await api("POST", "/api/auth/register", { email: "p@p.ro", password: "parola-test-123" });
  const a = (await api("POST", "/api/vehicles", { make: "VW", plate: "B 10 AAA" })).body;
  const b = (await api("POST", "/api/vehicles", { make: "VW", plate: "B 20 BBB" })).body;
  const ev = (await api("POST", `/api/vehicles/${a.id}/events`, { event: { kind: "odometer", km: 1000 }, patch: { plate: "", make: "", nextServiceKm: 5000 } })).body;
  assert.equal(ev.plate, "B 10 AAA");
  assert.equal(ev.make, "VW");
  assert.equal(ev.nextServiceKm, 5000);
  assert.equal((await api("PATCH", `/api/vehicles/${b.id}`, { plate: "b10aaa" })).status, 409);
  assert.equal((await api("POST", `/api/vehicles/${a.id}/events`, { event: { kind: "nope" } })).status, 400);
});

test("merge import treats blank fields as matching, so re-importing an export does not duplicate", async () => {
  const api = client(memoryStore());
  await api("POST", "/api/auth/register", { email: "m@m.ro", password: "parola-test-123" });
  const car = { make: "Dacia", plate: "B 30 CCC", events: [{ kind: "expense", label: "Spălătorie", cost: 60, date: "2026-05-02" }, { kind: "maintenance", type: "service", date: "2026-04-01", km: 1000, cost: 900 }] };
  await api("POST", "/api/vehicles/import", { vehicles: [car] });
  const again = { ...car, events: [{ kind: "expense", type: "spalatorie", label: "Spălătorie", cost: 60, date: "2026-05-02" }, { kind: "maintenance", type: "service", date: "2026-04-01", km: 1000 }, { kind: "expense", label: "Parcare", cost: 10, date: "2026-05-02" }] };
  await api("POST", "/api/vehicles/import", { vehicles: [again] });
  const events = (await api("GET", "/api/vehicles")).body[0].events;
  assert.equal(events.length, 3);
});

test("a session opened with a weak legacy password can set a new one without re-typing it", async () => {
  const store = memoryStore();
  const salt = "s";
  await store.setJSON("account:echipa2", { user: "echipa2", salt, passHash: createHash("sha256").update(salt + ":fleetdeck").digest("hex") });
  const weak = client(store);
  await weak("POST", "/api/auth/login", { identifier: "echipa2", password: "fleetdeck" });
  assert.equal((await weak("POST", "/api/account/password", { next: "o-parola-noua-buna" })).status, 200);
  const normal = client(store);
  await normal("POST", "/api/auth/login", { identifier: "echipa2", password: "o-parola-noua-buna" });
  assert.equal((await normal("POST", "/api/account/password", { next: "inca-una-noua-1" })).status, 403);
});
