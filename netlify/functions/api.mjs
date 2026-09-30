/* FleetDeck API — REST peste Netlify Blobs.
   Autentificare: cont cu e-mail + parolă (PBKDF2), sesiune în cookie HttpOnly.
   Conturile vechi (utilizator + parolă) intră în continuare cu numele lor și sunt migrate la primul login. */
import { getStore } from "@netlify/blobs";
import { HttpError, json, fail, readJson, cookie, assertSameOrigin } from "../lib/http.mjs";
import * as auth from "../lib/auth.mjs";
import * as vehicles from "../lib/vehicles.mjs";
import { scanDocument, lookupCompany, aiConfigured } from "../lib/services.mjs";
import { sendPasswordReset, sendReminderVerification, mailConfigured } from "../lib/mail.mjs";
import { consume, cooldown, clientIp, hashKey } from "../lib/limits.mjs";
import { ValidationError } from "../../shared/domain.js";

export const config = { path: "/api/*" };

const HOUR = 3_600_000;
const openStore = () => getStore({ name: "fleetdeck", consistency: "strong" });
const isLocal = (req) => new URL(req.url).hostname === "localhost";

function withSession(req, response, session) {
  if (session) response.headers.append("Set-Cookie", cookie(auth.SESSION_COOKIE, session.token, { maxAge: session.maxAge ?? undefined, secure: !isLocal(req) }));
  return response;
}
const clearSession = (req, response) => {
  response.headers.append("Set-Cookie", cookie(auth.SESSION_COOKIE, "", { maxAge: 0, secure: !isLocal(req) }));
  return response;
};

async function sendVerification(store, url, verification) {
  if (!verification || !mailConfigured()) return false;
  await sendReminderVerification({ to: verification.email, link: `${url.origin}/#/confirm/${verification.token}` });
  return true;
}

/* rute publice */
const PUBLIC = {
  "GET health": async () => json({ ok: true }),
  "POST auth/register": async ({ req, store, url }) => {
    await consume(store, "throttle:register:" + hashKey(clientIp(req)), { limit: 10, windowMs: HOUR, message: (m) => `prea multe conturi create de aici — încearcă peste ${m} min` });
    const body = await readJson(req, 20_000);
    const { account, verification } = await auth.register(store, body);
    const verificationSent = await sendVerification(store, url, verification).catch(() => false);
    return withSession(req, json({ account: auth.publicAccount(account), verificationSent }, 201), await auth.createSession(store, account, { remember: body.remember !== false }));
  },
  "POST auth/login": async ({ req, store }) => {
    const body = await readJson(req, 20_000);
    const account = await auth.login(store, body, clientIp(req));
    return withSession(req, json({ account: auth.publicAccount(account) }), await auth.createSession(store, account, { remember: body.remember !== false, weakLogin: !!account.mustChangePassword }));
  },
  "POST auth/logout": async ({ req, store }) => {
    const s = await auth.readSession(store, req);
    if (s) await auth.destroySession(store, s.key);
    return clearSession(req, json({ ok: true }));
  },
  "POST auth/forgot": async ({ req, store, url }) => {
    const { email } = await readJson(req, 5_000);
    if (!mailConfigured()) fail(501, "resetarea prin e-mail nu e configurată încă — cere administratorului să seteze RESEND_API_KEY");
    await consume(store, "throttle:forgot:" + hashKey(clientIp(req)), { limit: 20, windowMs: HOUR });
    const reset = await auth.createResetToken(store, email);
    if (reset && (await cooldown(store, "cooldown:forgot:" + hashKey(reset.email), 10 * 60_000))) {
      await sendPasswordReset({ to: reset.email, link: `${url.origin}/#/reset/${reset.token}` }).catch((e) => console.error("forgot: trimitere eșuată", e.message));
    }
    return json({ ok: true });
  },
  "POST auth/confirm-reminder": async ({ req, store }) => {
    const account = await auth.confirmReminderEmail(store, (await readJson(req, 5_000)).token);
    return json({ ok: true, email: account.reminderEmail });
  },
  "POST auth/reset": async ({ req, store }) => {
    const account = await auth.resetPassword(store, await readJson(req, 5_000));
    return withSession(req, json({ account: auth.publicAccount(account) }), await auth.createSession(store, account));
  },
};

/* rute cu sesiune: primesc { account } */
const PRIVATE = {
  "GET auth/me": async ({ account }) => json({ account: auth.publicAccount(account), features: { ai: aiConfigured(), mail: mailConfigured() } }),
  "PATCH account": async ({ req, store, url, account }) => {
    const body = await readJson(req, 20_000);
    const changes = auth.profileChanges(body);
    const emailChange = body.email != null && body.email !== account.email;
    if (emailChange) await auth.requirePassword(account, body.currentPassword);
    const claim = emailChange ? await auth.claimLoginEmail(store, account, body.email) : null;
    let verification = null;
    let updated;
    try {
      ({ account: updated } = await auth.updateAccount(store, account.id, async (a) => {
        auth.applyProfile(a, changes);
        if (claim) a.email = claim.email;
        const reminderInput = "reminderEmail" in body ? body.reminderEmail : claim && !a.reminderEmail && mailConfigured() ? claim.email : undefined;
        if (reminderInput !== undefined) {
          verification = await auth.planReminderEmail(store, a, reminderInput);
          if (verification && !mailConfigured()) fail(501, "trimiterea e-mailurilor nu e configurată — reminderele nu pot fi confirmate încă");
          if (verification && !(await cooldown(store, "cooldown:verify:" + a.id, 2 * 60_000))) fail(429, "am trimis deja un link de confirmare — verifică e-mailul sau încearcă peste 2 minute");
        }
      }));
    } catch (e) {
      if (claim) await store.delete("email:" + claim.email);
      throw e;
    }
    if (claim?.previous) await store.delete("email:" + claim.previous);
    let verificationSent = false;
    if (verification) {
      try { verificationSent = await sendVerification(store, url, verification); }
      catch { fail(502, "nu am putut trimite e-mailul de confirmare — încearcă din nou"); }
    }
    return json({ account: auth.publicAccount(updated), verificationSent });
  },
  "POST account/password": async ({ req, store, account, session }) => {
    const trusted = !!session.weakLogin && !!account.mustChangePassword;
    const updated = await auth.changePassword(store, account, await readJson(req, 5_000), { trusted });
    return withSession(req, json({ ok: true, account: auth.publicAccount(updated) }), await auth.createSession(store, updated));
  },
  "GET company": async ({ url }) => json(await lookupCompany(url.searchParams.get("cui"))),
  "POST scan": async ({ req, store, account }) => json(await scanDocument(store, account.id, (await readJson(req, 2_500_000)).image)),

  "GET vehicles": async ({ store, account }) => json(await vehicles.listVehicles(store, account.id)),
  "POST vehicles": async ({ req, store, account }) => json(await vehicles.createVehicle(store, account.id, await readJson(req, 200_000)), 201),
  "POST vehicles/import": async ({ req, store, account }) => json(await vehicles.importVehicles(store, account.id, await readJson(req, 3_000_000))),
  "GET vehicles/:id": async ({ store, account, params }) => json(await vehicles.getVehicle(store, account.id, params.id)),
  "PATCH vehicles/:id": async ({ req, store, account, params }) => json(await vehicles.patchVehicle(store, account.id, params.id, await readJson(req, 50_000))),
  "DELETE vehicles/:id": async ({ store, account, params }) => { await vehicles.deleteVehicle(store, account.id, params.id); return new Response(null, { status: 204 }); },
  "POST vehicles/:id/events": async ({ req, store, account, params }) => json(await vehicles.addEvent(store, account.id, params.id, await readJson(req, 2_500_000)), 201),
  "DELETE vehicles/:id/events/:eid": async ({ store, account, params }) => json(await vehicles.deleteEvent(store, account.id, params.id, params.eid)),
  "GET vehicles/:id/photos/:eid": async ({ store, account, params }) => vehicles.getPhoto(store, account.id, params.id, params.eid),
  "PUT vehicles/:id/documents/:type": async ({ req, store, account, params }) => json(await vehicles.upsertDocument(store, account.id, params.id, params.type, await readJson(req, 2_500_000))),
  "DELETE vehicles/:id/documents/:type": async ({ store, account, params }) => json(await vehicles.removeDocument(store, account.id, params.id, params.type)),
};

/* parametrii din URL ajung în cheile Blobs — doar litere, cifre, - și _ (fără „/” sau „..” decodate) */
const SAFE_PARAM = /^[A-Za-z0-9_-]{1,64}$/;

function match(table, method, segments) {
  for (const [route, handler] of Object.entries(table)) {
    const [m, pattern] = route.split(" ");
    if (m !== method) continue;
    const parts = pattern.split("/");
    if (parts.length !== segments.length) continue;
    const params = {};
    const ok = parts.every((p, i) => {
      if (!p.startsWith(":")) return p === segments[i];
      if (!SAFE_PARAM.test(segments[i])) return false;
      params[p.slice(1)] = segments[i];
      return true;
    });
    if (ok) return { handler, params };
  }
  return null;
}

export async function handle(req, store) {
  const url = new URL(req.url);
  const segments = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  try {
    assertSameOrigin(req);
    const pub = match(PUBLIC, req.method, segments);
    if (pub) return await pub.handler({ req, store, url, params: pub.params });
    const priv = match(PRIVATE, req.method, segments);
    if (!priv) fail(404, "rută necunoscută");
    const session = await auth.readSession(store, req);
    if (!session) return clearSession(req, json({ error: "sesiunea a expirat — intră din nou în cont", code: "session" }, 401));
    const response = await priv.handler({ req, store, url, params: priv.params, account: session.account, session: session.session });
    return withSession(req, response, session.refresh);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...(e.extra || {}) }, e.status);
    if (e instanceof ValidationError) return json({ error: e.message }, 400);
    console.error("api error", req.method, url.pathname, e);
    return json({ error: "eroare internă — încearcă din nou" }, 500);
  }
}

export default (req) => handle(req, openStore());
