import { useEffect, useState } from "react";
import { initApi, cloudLogin, setApiSession, normalizeUser, getAccountEmail, saveAccountEmail } from "./lib/api";
import { parseHash, nav } from "./lib/nav";
import { demoVehicle } from "./lib/model";
import AlertStrip from "./components/AlertStrip";
import Garage from "./components/Garage";
import CarPage from "./components/CarPage";
import Login from "./components/Login";
import ModalHost from "./components/modals";

const SESSION_KEY = "fleetdeck-session";
const readSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; } };

export default function App() {
  const [session, setSession] = useState(readSession);
  const [api, setApi] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [route, setRoute] = useState(parseHash());
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [loginError, setLoginError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [accountEmail, setAccountEmail] = useState(null);

  /* autentificare + încărcarea garajului userului */
  useEffect(() => {
    if (!session) { setApi(null); setVehicles([]); return; }
    let cancelled = false;
    (async () => {
      try {
        setBusy(true);
        const res = await cloudLogin(session.user, session.pass);
        if (cancelled) return;
        setBusy(false);
        if (res.mode === "denied") {
          localStorage.removeItem(SESSION_KEY);
          setSession(null);
          setLoginError(res.error || "utilizator sau parolă incorecte");
          return;
        }
        const user = res.user || normalizeUser(session.user) || session.user;
        setApiSession({ user, pass: session.pass, mode: res.mode });
        const { api, vehicles } = await initApi(res.mode);
        if (cancelled) return;
        setApi(api);
        setVehicles(vehicles);
        setLoginError(null);
        setAccountEmail(res.mode === "cloud" ? res.email ?? null : await getAccountEmail());
        if (res.created) setToast(`👋 Cont creat pentru ${user} — ține minte parola!`);
      } catch (e) {
        /* orice eroare devine VIZIBILĂ pe ecranul de login, niciodată tăcere */
        if (cancelled) return;
        setBusy(false);
        localStorage.removeItem(SESSION_KEY);
        setSession(null);
        setLoginError("Eroare la conectare: " + (e?.message || e));
      }
    })();
    return () => { cancelled = true; };
  }, [session]);

  useEffect(() => {
    const f = () => setRoute(parseHash());
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(h);
  }, [toast]);

  const doLogin = (user, pass) => {
    const s = { user, pass };
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    setLoginError(null);
    setSession(s);
  };
  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null); setApi(null); setVehicles([]); setModal(null);
    nav("#/");
  };

  const header = (right) => (
    <header>
      <div className="wrap header-in">
        <button className="logo" onClick={() => nav("#/")}>Fleet<span>Deck</span></button>
        {right}
      </div>
    </header>
  );

  if (!session)
    return (
      <>
        {header(null)}
        <Login onLogin={doLogin} error={loginError} busy={busy} />
      </>
    );

  if (!api)
    return (
      <>
        {header(null)}
        <main className="wrap"><div className="hero"><div className="big">🚗</div><p>Se încarcă…</p></div></main>
      </>
    );

  const replaceV = (v) =>
    setVehicles((all) => (all.some((x) => x.id === v.id) ? all.map((x) => (x.id === v.id ? v : x)) : [...all, v]));
  const fail = (e) => setToast("⚠ " + (e?.message || "eroare"));

  const actions = {
    toast: setToast,
    openModal: setModal,
    close: () => setModal(null),
    async createVehicle(d) {
      try { const v = await api.create(d); replaceV(v); nav(`#/car/${v.id}`); setToast(`🚗 ${v.make} ${v.model || ""} — adăugată`); }
      catch (e) { fail(e); }
    },
    async patchVehicle(id, fields, msg) {
      try { replaceV(await api.patch(id, fields)); if (msg) setToast(msg); } catch (e) { fail(e); }
    },
    async removeVehicle(id) {
      try { await api.remove(id); setVehicles((all) => all.filter((x) => x.id !== id)); nav("#/"); setToast("Mașina a fost ștearsă"); }
      catch (e) { fail(e); }
    },
    async addEvent(id, payload, msg) {
      try { replaceV(await api.addEvent(id, payload)); if (msg) setToast(msg); } catch (e) { fail(e); }
    },
    async deleteEvent(id, eid) {
      try { replaceV(await api.deleteEvent(id, eid)); setToast("Șters"); } catch (e) { fail(e); }
    },
    async putDocument(id, type, payload, msg) {
      try { replaceV(await api.putDocument(id, type, payload)); if (msg) setToast(msg); } catch (e) { fail(e); }
    },
    async loadDemo() {
      try { const v = await api.create(demoVehicle()); replaceV(v); nav(`#/car/${v.id}`); setToast("🚗 Mașina demo a fost încărcată"); }
      catch (e) { fail(e); }
    },
    async saveEmail(email) {
      try {
        const saved = await saveAccountEmail(email);
        setAccountEmail(saved);
        setToast(saved ? `📬 Reminderele ajung la ${saved}` : "E-mailul de remindere a fost șters");
      } catch (e) { fail(e); }
    },
  };

  const car = route.view === "car" ? vehicles.find((x) => x.id === route.id) : null;
  const displayUser = normalizeUser(session.user) || session.user;

  return (
    <>
      {header(
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="mode">{api.mode === "cloud" ? "☁ sincronizat" : "💾 local"}</span>
          <button className="userchip" title="Profil și e-mail de remindere"
            onClick={() => setModal({ kind: "account" })}>👤 {displayUser}{accountEmail ? "" : " · fără e-mail"}</button>
          <button className="btn ghost small" onClick={logout}>Ieși</button>
        </span>
      )}
      <main className="wrap">
        <AlertStrip vehicles={car ? [car] : vehicles} />
        {car
          ? <CarPage v={car} tab={route.tab} actions={actions} />
          : <Garage vehicles={vehicles} actions={actions} />}
      </main>
      {modal && <ModalHost modal={modal} vehicles={vehicles} actions={actions} accountEmail={accountEmail} user={displayUser} isCloud={api.mode === "cloud"} />}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
