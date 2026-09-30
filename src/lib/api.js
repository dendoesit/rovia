/* Stratul de date: API REST pe Netlify Functions. Sesiunea stă într-un cookie HttpOnly,
   deci parola nu mai este păstrată în browser și nu se mai trimite la fiecare cerere. */

export class ApiError extends Error {
  constructor(status, message, code = null) { super(message); this.status = status; this.code = code; }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

/* doar sesiunea expirată scoate din cont; un 401 obișnuit (ex. parolă greșită) rămâne o eroare de formular */
export const sessionExpired = (status, path, data) => status === 401 && data?.code === "session" && !path.startsWith("/api/auth/");

async function req(method, path, body) {
  let r;
  try {
    r = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "nu există conexiune la server — verifică internetul și încearcă din nou");
  }
  const data = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) {
    if (sessionExpired(r.status, path, data)) onUnauthorized();
    throw new ApiError(r.status, data?.error || `eroare de server (${r.status})`, data?.code);
  }
  return data;
}

export const authApi = {
  me: () => req("GET", "/api/auth/me"),
  login: (identifier, password, remember = true) => req("POST", "/api/auth/login", { identifier, password, remember }),
  register: (data) => req("POST", "/api/auth/register", data),
  logout: () => req("POST", "/api/auth/logout", {}),
  forgot: (email) => req("POST", "/api/auth/forgot", { email }),
  reset: (token, password) => req("POST", "/api/auth/reset", { token, password }),
  confirmReminder: (token) => req("POST", "/api/auth/confirm-reminder", { token }),
};

export const accountApi = {
  update: (fields) => req("PATCH", "/api/account", fields),
  changePassword: (current, next) => req("POST", "/api/account/password", { current, next }),
  lookupCompany: (cui) => req("GET", `/api/company?cui=${encodeURIComponent(cui)}`),
};

export const vehiclesApi = {
  list: () => req("GET", "/api/vehicles"),
  create: (d) => req("POST", "/api/vehicles", d),
  import: (vehicles, mode = "merge") => req("POST", "/api/vehicles/import", { vehicles, mode }),
  patch: (id, f) => req("PATCH", `/api/vehicles/${id}`, f),
  remove: (id) => req("DELETE", `/api/vehicles/${id}`),
  addEvent: (id, p) => req("POST", `/api/vehicles/${id}/events`, p),
  deleteEvent: (id, eid) => req("DELETE", `/api/vehicles/${id}/events/${eid}`),
  putDocument: (id, type, p) => req("PUT", `/api/vehicles/${id}/documents/${type}`, p),
  removeDocument: (id, type) => req("DELETE", `/api/vehicles/${id}/documents/${type}`),
  photoUrl: (id, eid) => `/api/vehicles/${id}/photos/${eid}`,
};

export const scanDocument = (image) => req("POST", "/api/scan", { image });

/* versiunea veche ținea { user, pass } în localStorage — îl folosim o singură dată ca să intrăm, apoi îl ștergem.
   Parola rămâne doar în memorie, pentru schimbarea obligatorie a unei parole slabe. */
const LEGACY_SESSION = "fleetdeck-session";
export async function migrateLegacySession(storage = globalThis.localStorage) {
  let legacy = null;
  try { legacy = JSON.parse(storage.getItem(LEGACY_SESSION) || "null"); } catch { /* format stricat */ }
  storage.removeItem(LEGACY_SESSION);
  for (const k of Object.keys(storage)) if (k.startsWith("fleetdeck-email:")) storage.removeItem(k);
  if (!legacy?.user || !legacy?.pass) return null;
  try { return { account: (await authApi.login(legacy.user, legacy.pass, true)).account, password: legacy.pass }; } catch { return null; }
}

/* mașinile din vechiul „mod local": doar ale utilizatorului vechi din acest cont, nu ale altora de pe același browser */
const BROWSER_VEHICLES = "fleetdeck-vehicles";
const browserVehicleKeys = (account) => (account?.legacyUser ? [`${BROWSER_VEHICLES}:${account.legacyUser}`, BROWSER_VEHICLES] : []);

export function readBrowserVehicles(account, storage = globalThis.localStorage) {
  return browserVehicleKeys(account).flatMap((k) => {
    try { const list = JSON.parse(storage.getItem(k) || "[]"); return Array.isArray(list) ? list : []; } catch { return []; }
  });
}

export function forgetBrowserVehicles(account, keep = [], storage = globalThis.localStorage) {
  const [own, ...rest] = browserVehicleKeys(account);
  if (!own) return;
  rest.forEach((k) => storage.removeItem(k));
  if (keep.length) storage.setItem(own, JSON.stringify(keep));
  else storage.removeItem(own);
}
