import { createHash, timingSafeEqual } from "node:crypto";
import { normalizeEmail, normalizeLegacyUser, DEFAULT_CURRENCY, ACCOUNT_KINDS, CURRENCIES, FUELS } from "../../shared/domain.js";
import { safeHttpsUrl } from "../../shared/renewals.js";
import { fail, parseCookies } from "./http.mjs";
import { consume, release, hashKey } from "./limits.mjs";

export const SESSION_COOKIE = "fd_session";
const PBKDF2_ITERATIONS = 600_000;
const DAY = 86_400_000;
const REMEMBER_DAYS = 30;
const SHORT_SESSION_DAYS = 1;
const LOGIN_WINDOW = 15 * 60_000;
const WEAK_PASSWORDS = new Set(["fleetdeck", "parola", "password", "12345678", "admin"]);
const WRITE_RETRIES = 5;

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));
const sha256hex = (s) => createHash("sha256").update(s).digest("hex");
const sameBytes = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function hashPassword(password, salt = randomToken(16), iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: Buffer.from(salt, "base64url"), iterations }, key, 256);
  return { algo: "pbkdf2-sha256", iterations, salt, hash: b64url(bits) };
}

/* formatul vechi (versiunea de pe main): { user, salt, passHash = sha256(salt:parolă), email = adresa de remindere } */
const legacyHash = (password, salt) => sha256hex(salt + ":" + password);

async function passwordMatches(password, account) {
  if (account.password) {
    const { salt, iterations, hash } = account.password;
    return sameBytes((await hashPassword(password, salt, iterations)).hash, hash);
  }
  return !!account.salt && !!account.passHash && sameBytes(legacyHash(password, account.salt), account.passHash);
}

export function validatePassword(password) {
  if (typeof password !== "string" || password.length < 8) fail(400, "parola trebuie să aibă minim 8 caractere");
  if (password.length > 200) fail(400, "parola este prea lungă");
  if (WEAK_PASSWORDS.has(password.toLowerCase())) fail(400, "alege o parolă mai greu de ghicit");
}

/* conturile vechi rămân sub același id; câmpurile user/salt/passHash se păstrează până la prima schimbare de parolă,
   ca o eventuală revenire la versiunea veche să nu blocheze pe nimeni */
function fromStored(raw) {
  if (!raw) return null;
  if (raw.id) return raw;
  return {
    id: raw.user,
    user: raw.user,
    salt: raw.salt,
    passHash: raw.passHash,
    legacyUser: raw.user,
    email: null,
    kind: "personal",
    name: raw.user,
    company: null,
    currency: "EUR",
    reminderEmail: raw.email || null,
    reminderVerified: true,
    sessionVersion: 0,
    createdAt: raw.createdAt || null,
  };
}

export const publicAccount = (a) => ({
  id: a.id,
  email: a.email,
  kind: a.kind,
  name: a.name,
  company: a.company,
  currency: a.currency,
  reminderEmail: a.reminderEmail,
  reminderVerified: a.reminderVerified !== false,
  pendingReminderEmail: a.pendingReminderEmail || null,
  legacyUser: a.legacyUser || null,
  rcaBrokerUrl: a.rcaBrokerUrl || null,
  fuelPrices: a.fuelPrices || null,
  mustChangePassword: !!a.mustChangePassword,
  createdAt: a.createdAt,
});

export const loadAccount = async (store, id) => fromStored(await store.get("account:" + id, { type: "json" }));

/* citește → modifică → scrie doar dacă nimeni nu a scris între timp (ex. o schimbare de parolă în paralel) */
export async function updateAccount(store, id, mutate) {
  for (let i = 0; i < WRITE_RETRIES; i++) {
    const cur = await store.getWithMetadata("account:" + id, { type: "json" });
    const account = fromStored(cur?.data);
    if (!account) fail(400, "contul nu mai există");
    const result = await mutate(account);
    const write = await store.setJSON("account:" + id, account, { onlyIfMatch: cur.etag });
    if (write?.modified !== false) return { account, result };
  }
  fail(409, "contul a fost modificat în paralel — încearcă din nou");
}

async function findAccount(store, identifier) {
  const email = normalizeEmail(identifier);
  if (email) {
    const id = await store.get("email:" + email);
    return id ? loadAccount(store, id) : null;
  }
  const user = normalizeLegacyUser(identifier);
  return user ? loadAccount(store, user) : null;
}

const identityOf = (identifier) => normalizeEmail(identifier) || normalizeLegacyUser(identifier) || String(identifier || "").trim().toLowerCase();

/* ---------- sesiuni ---------- */
export async function createSession(store, account, { remember = true, weakLogin = false } = {}) {
  const token = randomToken();
  const days = remember ? REMEMBER_DAYS : SHORT_SESSION_DAYS;
  await store.setJSON("session:" + sha256hex(token), {
    accountId: account.id,
    version: account.sessionVersion || 0,
    remember,
    ...(weakLogin ? { weakLogin: true } : {}),
    expires: Date.now() + days * DAY,
    created: new Date().toISOString(),
  });
  return { token, maxAge: remember ? days * 86_400 : null };
}

export async function readSession(store, req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const key = "session:" + sha256hex(token);
  const session = await store.get(key, { type: "json" });
  if (!session || session.expires < Date.now()) return null;
  const account = await loadAccount(store, session.accountId);
  if (!account || (account.sessionVersion || 0) !== session.version) return null;
  let refresh = null;
  if (session.remember && session.expires - Date.now() < (REMEMBER_DAYS / 2) * DAY) {
    session.expires = Date.now() + REMEMBER_DAYS * DAY;
    await store.setJSON(key, session);
    refresh = { token, maxAge: REMEMBER_DAYS * 86_400 };
  }
  return { account, key, refresh, session };
}

export const destroySession = (store, key) => store.delete(key);

/* ---------- profil ---------- */
function sanitizeCompany(c) {
  if (!c) return null;
  const text = (x, max) => (x == null || x === "" ? null : String(x).trim().slice(0, max));
  const cui = text(c.cui, 20)?.toUpperCase().replace(/\s+/g, "") ?? null;
  return { name: text(c.name, 160), cui, regCom: text(c.regCom, 40), address: text(c.address, 300) };
}

/* validează tot înainte de orice scriere; întoarce doar câmpurile de profil */
export function profileChanges(body) {
  const out = {};
  if ("name" in body) out.name = String(body.name || "").trim().slice(0, 80) || null;
  if ("kind" in body && ACCOUNT_KINDS[body.kind]) out.kind = body.kind;
  if ("currency" in body && CURRENCIES[body.currency]) out.currency = body.currency;
  if ("company" in body) out.company = sanitizeCompany(body.company);
  if ("rcaBrokerUrl" in body) out.rcaBrokerUrl = body.rcaBrokerUrl ? safeHttpsUrl(body.rcaBrokerUrl) || fail(400, "linkul brokerului trebuie să înceapă cu https://") : null;
  if ("fuelPrices" in body) {
    const prices = {};
    for (const [fuel, val] of Object.entries(body.fuelPrices || {})) {
      if (!FUELS.includes(fuel) || val == null || val === "") continue;
      const n = +String(val).replace(",", ".");
      if (!(n > 0 && n < 100)) fail(400, `prețul pentru ${fuel} nu este valid`);
      prices[fuel] = Math.round(n * 100) / 100;
    }
    out.fuelPrices = Object.keys(prices).length ? prices : null;
  }
  if ("reminderEmail" in body && body.reminderEmail != null && body.reminderEmail !== "" && !normalizeEmail(body.reminderEmail)) fail(400, "adresă de e-mail invalidă pentru remindere");
  if ("email" in body && body.email != null && !normalizeEmail(body.email)) fail(400, "adresă de e-mail invalidă");
  return out;
}

export function applyProfile(account, changes) {
  for (const [k, v] of Object.entries(changes)) {
    if (k === "name") account.name = v || account.name;
    else account[k] = v;
  }
  return account;
}

/* remindere doar la o adresă confirmată prin link; întoarce tokenul de trimis sau null */
export async function planReminderEmail(store, account, input) {
  if (input == null || input === "") {
    account.reminderEmail = null;
    delete account.pendingReminderEmail;
    return null;
  }
  const email = normalizeEmail(input);
  if (email === account.reminderEmail && account.reminderVerified !== false) { delete account.pendingReminderEmail; return null; }
  const token = randomToken();
  account.pendingReminderEmail = email;
  await store.setJSON("verify:" + sha256hex(token), { accountId: account.id, email, expires: Date.now() + 3 * DAY });
  return { token, email };
}

export async function confirmReminderEmail(store, token) {
  const key = "verify:" + sha256hex(String(token || ""));
  const v = await store.get(key, { type: "json" });
  if (!v || v.expires < Date.now()) fail(400, "linkul de confirmare a expirat");
  const { account } = await updateAccount(store, v.accountId, (a) => {
    if (a.pendingReminderEmail !== v.email) fail(400, "linkul nu mai este valabil — adresa de remindere a fost schimbată între timp");
    a.reminderEmail = v.email;
    a.reminderVerified = true;
    delete a.pendingReminderEmail;
  });
  await store.delete(key);
  return account;
}

/* ---------- înregistrare / login / parole ---------- */
export async function register(store, body) {
  const email = normalizeEmail(body.email) || fail(400, "adresă de e-mail invalidă");
  validatePassword(body.password);
  const kind = ACCOUNT_KINDS[body.kind] ? body.kind : "personal";
  if (kind === "company" && !String(body.company?.name || "").trim()) fail(400, "completează numele firmei");
  const account = applyProfile({
    id: crypto.randomUUID(),
    email,
    kind,
    name: email.split("@")[0],
    company: null,
    currency: DEFAULT_CURRENCY,
    reminderEmail: email,
    reminderVerified: false,
    pendingReminderEmail: email,
    password: await hashPassword(body.password),
    sessionVersion: 0,
    createdAt: new Date().toISOString(),
  }, profileChanges({ name: body.name || (kind === "company" ? body.company?.name : null), company: kind === "company" ? body.company : null }));
  const claimed = await store.set("email:" + email, account.id, { onlyIfNew: true });
  if (claimed?.modified === false) fail(409, "există deja un cont cu acest e-mail — intră în cont sau resetează parola");
  const token = randomToken();
  await store.setJSON("verify:" + sha256hex(token), { accountId: account.id, email, expires: Date.now() + 3 * DAY });
  await store.setJSON("account:" + account.id, account, { onlyIfNew: true });
  return { account, verification: { token, email } };
}

/* încercările se numără ÎNAINTE de verificarea parolei: 5 pe identitate + IP, 20 pe identitate din orice IP */
export async function login(store, { identifier, password }, ip = "local") {
  if (!identifier || !password) fail(400, "completează e-mailul și parola");
  const identity = identityOf(identifier);
  const perIp = "throttle:login:" + hashKey(identity + "|" + ip);
  const global = "throttle:login:" + hashKey(identity);
  const message = (m) => `prea multe încercări greșite — încearcă din nou peste ${m} min`;
  await consume(store, perIp, { limit: 5, windowMs: LOGIN_WINDOW, message });
  await consume(store, global, { limit: 20, windowMs: LOGIN_WINDOW, message });
  const found = await findAccount(store, identifier);
  if (!found || !(await passwordMatches(password, found))) fail(401, "e-mail (sau utilizator) ori parolă greșită");
  await Promise.all([release(store, perIp), release(store, global)]);
  if (found.password) return found;
  const hashed = await hashPassword(password);
  const weak = password.length < 8 || WEAK_PASSWORDS.has(password.toLowerCase());
  return (await updateAccount(store, found.id, (a) => {
    if (a.password) return;
    a.password = hashed;
    if (weak) a.mustChangePassword = true;
  })).account;
}

export async function requirePassword(account, password) {
  if (!password) fail(403, "confirmă cu parola actuală", { code: "password_required" });
  if (!(await passwordMatches(String(password), account))) fail(403, "parola actuală nu este corectă");
}

export async function claimLoginEmail(store, account, emailInput) {
  const email = normalizeEmail(emailInput) || fail(400, "adresă de e-mail invalidă");
  if (email === account.email) return null;
  const claimed = await store.set("email:" + email, account.id, { onlyIfNew: true });
  if (claimed?.modified === false) fail(409, "acest e-mail este folosit deja de alt cont");
  return { email, previous: account.email };
}

const setNewPassword = (a, hashed) => {
  a.password = hashed;
  delete a.salt;
  delete a.passHash;
  delete a.mustChangePassword;
  a.sessionVersion = (a.sessionVersion || 0) + 1;
};

/* trusted: sesiunea a pornit chiar cu parola slabă care trebuie schimbată — nu o mai cerem o dată */
export async function changePassword(store, account, { current, next }, { trusted = false } = {}) {
  if (!trusted) await requirePassword(account, current);
  validatePassword(next);
  const hashed = await hashPassword(next);
  return (await updateAccount(store, account.id, (a) => setNewPassword(a, hashed))).account;
}

export async function createResetToken(store, emailInput) {
  const email = normalizeEmail(emailInput);
  const id = email && (await store.get("email:" + email));
  if (!id) return null;
  const token = randomToken();
  await store.setJSON("reset:" + sha256hex(token), { accountId: id, expires: Date.now() + 3_600_000 });
  return { token, email };
}

export async function resetPassword(store, { token, password }) {
  const key = "reset:" + sha256hex(String(token || ""));
  const reset = await store.get(key, { type: "json" });
  if (!reset || reset.expires < Date.now()) fail(400, "linkul de resetare a expirat — cere unul nou");
  validatePassword(password);
  const hashed = await hashPassword(password);
  const { account } = await updateAccount(store, reset.accountId, (a) => setNewPassword(a, hashed));
  await store.delete(key);
  const identities = [account.email, account.legacyUser].filter(Boolean).map(identityOf);
  await Promise.all(identities.map((i) => release(store, "throttle:login:" + hashKey(i))));
  return account;
}
