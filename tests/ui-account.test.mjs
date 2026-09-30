import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  accountApi, authApi, vehiclesApi, setUnauthorizedHandler, sessionExpired, migrateLegacySession, readBrowserVehicles, forgetBrowserVehicles,
} from "../src/lib/api.js";
import { profilePatch, loginEmailChanged, reminderNotice, modalQueue } from "../src/lib/model.js";

function memoryStorage(items = {}) {
  const proto = {
    getItem(k) { return Object.hasOwn(this, k) ? this[k] : null; },
    setItem(k, v) { this[k] = String(v); },
    removeItem(k) { delete this[k]; },
  };
  return Object.assign(Object.create(proto), items);
}

let calls, expired;
const respond = (status, body) => {
  globalThis.fetch = async (path, init) => {
    calls.push({ path, ...init, body: init.body && JSON.parse(init.body) });
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
};
beforeEach(() => {
  calls = [];
  expired = 0;
  setUnauthorizedHandler(() => { expired++; });
});

test("a wrong current password is a form error, not a logout", async () => {
  respond(403, { error: "parola actuală nu este corectă" });
  await assert.rejects(accountApi.changePassword("gresita", "parola-noua-buna"), (e) => e.status === 403 && e.message === "parola actuală nu este corectă");
  respond(401, { error: "neautorizat" });
  await assert.rejects(accountApi.update({ name: "x" }), (e) => e.status === 401 && e.code === null);
  assert.equal(expired, 0);
});

test("only a 401 marked as an expired session signs the user out", async () => {
  respond(401, { error: "sesiunea a expirat", code: "session" });
  await assert.rejects(vehiclesApi.list(), (e) => e.status === 401 && e.code === "session");
  assert.equal(expired, 1);
  await assert.rejects(authApi.me(), (e) => e.code === "session");
  assert.equal(expired, 1);
  assert.equal(sessionExpired(401, "/api/account/password", { error: "x" }), false);
  assert.equal(sessionExpired(403, "/api/vehicles", { code: "session" }), false);
  assert.equal(sessionExpired(401, "/api/vehicles", null), false);
});

test("the legacy session logs in once and hands back the password only in memory", async () => {
  const storage = memoryStorage({ "fleetdeck-session": JSON.stringify({ user: "dan", pass: "veche" }), "fleetdeck-email:dan": "dan@x.ro", other: "1" });
  respond(200, { account: { id: "dan", legacyUser: "dan", mustChangePassword: true } });
  const r = await migrateLegacySession(storage);
  assert.deepEqual(r, { account: { id: "dan", legacyUser: "dan", mustChangePassword: true }, password: "veche" });
  assert.deepEqual(calls[0].body, { identifier: "dan", password: "veche", remember: true });
  assert.deepEqual(Object.keys(storage), ["other"]);

  respond(401, { error: "e-mail (sau utilizator) ori parolă greșită" });
  assert.equal(await migrateLegacySession(memoryStorage({ "fleetdeck-session": JSON.stringify({ user: "dan", pass: "alta" }) })), null);
  assert.equal(await migrateLegacySession(memoryStorage()), null);
});

test("browser-only cars are offered only to the legacy user who saved them", () => {
  const car = (plate) => ({ make: "Dacia", plate });
  const storage = memoryStorage({
    "fleetdeck-vehicles:dan": JSON.stringify([car("B 1 DAN")]),
    "fleetdeck-vehicles:ana": JSON.stringify([car("B 1 ANA")]),
    "fleetdeck-vehicles": JSON.stringify([car("B 1 OLD")]),
    "fleetdeck-vehicles:broken": "{",
  });
  assert.deepEqual(readBrowserVehicles({ legacyUser: "dan" }, storage).map((v) => v.plate), ["B 1 DAN", "B 1 OLD"]);
  assert.deepEqual(readBrowserVehicles({ legacyUser: "broken" }, storage).map((v) => v.plate), ["B 1 OLD"]);
  assert.deepEqual(readBrowserVehicles({ email: "nou@firma.ro", legacyUser: null }, storage), []);

  forgetBrowserVehicles({ email: "nou@firma.ro" }, [], storage);
  assert.equal(Object.keys(storage).length, 4);

  forgetBrowserVehicles({ legacyUser: "dan" }, [car("B 1 OLD")], storage);
  assert.deepEqual(JSON.parse(storage.getItem("fleetdeck-vehicles:dan")).map((v) => v.plate), ["B 1 OLD"]);
  assert.equal(storage.getItem("fleetdeck-vehicles"), null);
  assert.ok(storage.getItem("fleetdeck-vehicles:ana"));

  forgetBrowserVehicles({ legacyUser: "dan" }, [], storage);
  assert.deepEqual(readBrowserVehicles({ legacyUser: "dan" }, storage), []);
  assert.ok(storage.getItem("fleetdeck-vehicles:ana"));
});

const form = (account, over = {}) => ({
  kind: account.kind, name: account.name || "", email: account.email || "",
  reminderEmail: account.pendingReminderEmail || account.reminderEmail || "", currency: account.currency || "RON",
  companyName: account.company?.name || "", cui: "", regCom: "", address: "", rcaBrokerUrl: "", ...over,
});

test("a legacy user adding a login e-mail keeps reminders on and confirms with the current password", () => {
  const legacy = { kind: "personal", name: "dan", email: null, reminderEmail: null, legacyUser: "dan", currency: "EUR" };
  const body = profilePatch(legacy, form(legacy, { email: " dan@firma.ro " }), "veche");
  assert.equal(body.email, "dan@firma.ro");
  assert.equal(body.currentPassword, "veche");
  assert.equal(body.reminderEmail, "dan@firma.ro");

  const own = profilePatch(legacy, form(legacy, { email: "dan@firma.ro", reminderEmail: "flota@firma.ro" }), "veche");
  assert.equal(own.reminderEmail, "flota@firma.ro");
});

test("the profile patch sends e-mails only when they changed", () => {
  const acc = { kind: "company", name: "Firma", email: "ana@firma.ro", reminderEmail: "flota@firma.ro", company: { name: "Firma" }, currency: "RON" };
  const rename = profilePatch(acc, form(acc, { companyName: "Firma Nouă" }), "");
  assert.equal("reminderEmail" in rename, false);
  assert.equal("email" in rename, false);
  assert.equal("currentPassword" in rename, false);
  assert.equal(rename.name, "Firma Nouă");

  assert.equal(profilePatch(acc, form(acc, { reminderEmail: "" }), "").reminderEmail, "");
  assert.equal(loginEmailChanged(acc, "Ana@Firma.ro "), false);
  assert.equal("email" in profilePatch(acc, form(acc, { email: "ANA@firma.ro" }), ""), false);

  const moved = profilePatch(acc, form(acc, { email: "ana@alta.ro" }), "parola");
  assert.deepEqual([moved.email, moved.currentPassword, "reminderEmail" in moved], ["ana@alta.ro", "parola", false]);

  const pending = { ...acc, reminderEmail: null, pendingReminderEmail: "nou@firma.ro" };
  assert.equal("reminderEmail" in profilePatch(pending, form(pending, { email: "ana@alta.ro" }), "parola"), false);
});

test("without mail configured the first login e-mail keeps reminders off instead of failing the save", () => {
  const legacy = { kind: "personal", name: "dan", email: null, reminderEmail: null, legacyUser: "dan", currency: "EUR" };
  const body = profilePatch(legacy, form(legacy, { email: "dan@firma.ro" }), "veche", { mail: false });
  assert.deepEqual([body.email, body.reminderEmail], ["dan@firma.ro", ""]);
  const typed = profilePatch(legacy, form(legacy, { email: "dan@firma.ro", reminderEmail: "flota@firma.ro" }), "veche", { mail: false });
  assert.equal(typed.reminderEmail, "flota@firma.ro");
  const acc = { kind: "personal", name: "ana", email: "ana@firma.ro", reminderEmail: "ana@firma.ro" };
  assert.equal("reminderEmail" in profilePatch(acc, form(acc, { email: "ana@alta.ro" }), "p", { mail: false }), false);
});

test("the profile shows one confirmation notice, for the address the link was sent to", () => {
  const registered = { email: "ana@firma.ro", reminderEmail: "ana@firma.ro", pendingReminderEmail: "ana@firma.ro", reminderVerified: false };
  assert.match(reminderNotice(registered, true), /confirmă adresa din e-mailul primit la ana@firma\.ro/);
  assert.equal(reminderNotice(registered, false), null);
  const changing = { ...registered, pendingReminderEmail: "flota@firma.ro" };
  assert.match(reminderNotice(changing, true), /primit la flota@firma\.ro/);
  const expired = { ...registered, pendingReminderEmail: null };
  assert.match(reminderNotice(expired, true), /primit la ana@firma\.ro/);
  const verified = { reminderEmail: "ana@firma.ro", pendingReminderEmail: "flota@firma.ro", reminderVerified: true };
  assert.match(reminderNotice(verified, true), /trimis la flota@firma\.ro — până atunci reminderele merg la ana@firma\.ro/);
  const firstLogin = { reminderEmail: null, pendingReminderEmail: "dan@firma.ro", reminderVerified: true };
  assert.match(reminderNotice(firstLogin, true), /pornesc după confirmare: confirmă adresa din e-mailul primit la dan@firma\.ro/);
  assert.equal(reminderNotice({ reminderEmail: "ana@firma.ro", reminderVerified: true }, true), null);
  assert.equal(reminderNotice({ reminderEmail: null, reminderVerified: false }, true), null);
});

test("queued sign-in windows open one after another and a late close cannot skip the forced password change", () => {
  const shown = [];
  const modals = modalQueue((m) => shown.push(m));
  const browserData = { kind: "browserData" }, forced = { kind: "account", reason: "weakPassword" };
  modals.queue([browserData, false, forced]);
  assert.equal(shown.at(-1), browserData);
  modals.close(browserData);
  assert.equal(shown.at(-1), forced);
  modals.close(browserData);
  assert.equal(shown.at(-1), forced);
  modals.close(forced);
  assert.equal(shown.at(-1), null);

  modals.queue([null, forced]);
  assert.equal(shown.at(-1), forced);
  modals.clear();
  assert.equal(shown.at(-1), null);
  modals.close(null);
  assert.equal(shown.at(-1), null);

  const wizard = { kind: "fuel" };
  modals.open(wizard);
  modals.close(wizard);
  assert.equal(shown.at(-1), null);
});
