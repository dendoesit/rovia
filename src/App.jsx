import { useCallback, useEffect, useState } from "react";
import { authApi, accountApi, vehiclesApi, setUnauthorizedHandler, migrateLegacySession, readBrowserVehicles, forgetBrowserVehicles } from "./lib/api";
import { parseHash, nav } from "./lib/nav";
import { demoVehicle, setCurrency, setFuelPrices, modalQueue } from "./lib/model";
import AlertStrip from "./components/AlertStrip";
import Garage from "./components/Garage";
import CarPage from "./components/CarPage";
import AuthScreen from "./components/Login";
import FleetOverview from "./components/FleetOverview";
import ModalHost from "./components/modals";

const newer = (incoming, current) => !current || !current.updatedAt || !incoming.updatedAt || incoming.updatedAt >= current.updatedAt;

export default function App() {
  const [phase, setPhase] = useState("loading"); // loading | anon | ready | error
  const [account, setAccount] = useState(null);
  const [features, setFeatures] = useState({ ai: false, mail: false });
  const [vehicles, setVehicles] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [route, setRoute] = useState(parseHash());
  const [modal, setModal] = useState(null);
  const [modals] = useState(() => modalQueue(setModal));
  const [toast, setToast] = useState(null);

  const reload = useCallback(async () => {
    try { setVehicles(await vehiclesApi.list()); setLoaded(true); setLoadError(null); }
    catch (e) { setLoadError(e.message); }
  }, []);

  const signedOut = useCallback(() => {
    modals.clear();
    setAccount(null); setVehicles([]); setLoaded(false); setPhase("anon");
  }, [modals]);

  /* opts.password: parola tastată sau cea din sesiunea veche, doar în memorie, ca schimbarea obligatorie să nu o mai ceară */
  const enter = useCallback(async (acc, opts = {}) => {
    setCurrency(acc.currency);
    setFuelPrices(acc.fuelPrices);
    setAccount(acc);
    setVehicles([]); setLoaded(false); modals.clear();
    setPhase("ready");
    const fresh = authApi.me().then((me) => me.features || {}).catch(() => null);
    fresh.then((f) => f && setFeatures(f));
    await reload();
    if (opts.created) {
      const unconfirmed = acc.reminderVerified === false && (await fresh)?.mail;
      setToast(`👋 Bun venit, ${acc.company?.name || acc.name}!${unconfirmed ? " Confirmă adresa din e-mailul primit ca să pornească reminderele." : ""}`);
    }
    const local = readBrowserVehicles(acc);
    const reason = acc.mustChangePassword ? "weakPassword" : acc.legacyUser && !acc.email ? "legacy" : null;
    modals.queue([
      local.length && { kind: "browserData", vehicles: local },
      reason && { kind: "account", reason, password: opts.password },
    ]);
  }, [reload, modals]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      signedOut();
      setToast("Sesiunea a expirat — intră din nou în cont");
    });
    (async () => {
      try {
        const me = await authApi.me();
        setFeatures(me.features || {});
        await enter(me.account);
      } catch (e) {
        if (e.status !== 401) { setLoadError(e.message); setPhase("error"); return; }
        const legacy = await migrateLegacySession();
        if (legacy) await enter(legacy.account, { password: legacy.password });
        else setPhase("anon");
      }
    })();
  }, [enter, signedOut]);

  useEffect(() => {
    const f = () => setRoute(parseHash());
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  useEffect(() => {
    if (route.view !== "confirm") return;
    authApi.confirmReminder(route.token)
      .then((r) => { setToast(`📬 Reminderele vor ajunge la ${r.email}`); setAccount((a) => a && { ...a, reminderEmail: r.email, pendingReminderEmail: null, reminderVerified: true }); })
      .catch((e) => setToast("⚠ " + e.message))
      .finally(() => nav("#/"));
  }, [route.view]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(h);
  }, [toast]);

  const header = (right) => (
    <header>
      <div className="wrap header-in">
        <button className="logo" onClick={() => nav("#/")}>Fleet<span>Deck</span></button>
        {right}
      </div>
    </header>
  );

  if (phase === "loading")
    return <>{header(null)}<main className="wrap"><div className="hero"><div className="big">🚗</div><p>Se încarcă…</p></div></main></>;
  if (phase === "error")
    return <>{header(null)}<main className="wrap"><div className="hero"><div className="big">📡</div><p>{loadError}</p>
      <button className="btn" onClick={() => location.reload()}>Încearcă din nou</button></div></main></>;
  if (phase === "anon" || !account || route.view === "reset")
    return <>{header(null)}<AuthScreen onAuthenticated={enter} resetToken={route.view === "reset" ? route.token : null} />{toast && <div className="toast">{toast}</div>}</>;

  const replaceV = (v) =>
    setVehicles((all) => (all.some((x) => x.id === v.id) ? all.map((x) => (x.id === v.id && newer(v, x) ? v : x)) : [...all, v]));
  /* fiecare acțiune întoarce true/false ca formularele să rămână deschise dacă salvarea eșuează */
  const run = async (fn, msg) => {
    try { await fn(); if (msg) setToast(msg); return true; }
    catch (e) { setToast("⚠ " + (e?.message || "eroare")); return false; }
  };

  const actions = {
    toast: setToast,
    openModal: modals.open,
    closeModal: modals.close,
    reload,
    createVehicle: (d) => run(async () => { const v = await vehiclesApi.create(d); replaceV(v); nav(`#/car/${v.id}`); }, `🚗 ${d.make} ${d.model || ""} — adăugată`),
    patchVehicle: (id, fields, msg) => run(async () => replaceV(await vehiclesApi.patch(id, fields)), msg),
    removeVehicle: (id) => run(async () => { await vehiclesApi.remove(id); setVehicles((all) => all.filter((x) => x.id !== id)); nav("#/"); }, "Mașina a fost ștearsă"),
    addEvent: (id, payload, msg) => run(async () => replaceV(await vehiclesApi.addEvent(id, payload)), msg),
    deleteEvent: (id, eid) => run(async () => replaceV(await vehiclesApi.deleteEvent(id, eid)), "Șters"),
    putDocument: (id, type, payload, msg) => run(async () => replaceV(await vehiclesApi.putDocument(id, type, payload)), msg),
    removeDocument: (id, type, msg) => run(async () => replaceV(await vehiclesApi.removeDocument(id, type)), msg),
    loadDemo: () => run(async () => { const v = await vehiclesApi.create(demoVehicle()); replaceV(v); nav(`#/car/${v.id}`); }, "🚗 Mașina demo a fost încărcată"),
    async importVehicles(list, mode, { reload: refresh = true } = {}) {
      const report = await vehiclesApi.import(list, mode);
      if (refresh) await reload();
      return report;
    },
    async saveAccount(fields) {
      try {
        const r = await accountApi.update(fields);
        setCurrency(r.account.currency);
        setFuelPrices(r.account.fuelPrices);
        setAccount(r.account);
        return { ok: true, verificationSent: !!r.verificationSent, account: r.account };
      } catch (e) {
        return { ok: false, error: e.message, status: e.status };
      }
    },
    async changePassword(current, next) {
      try {
        await accountApi.changePassword(current, next);
        setAccount((a) => a && { ...a, mustChangePassword: false });
        setToast("🔒 Parola a fost schimbată — celelalte dispozitive au fost deconectate");
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message, status: e.status };
      }
    },
    forgetBrowserData: (keep = []) => forgetBrowserVehicles(account, keep),
    async logout() {
      await authApi.logout().catch(() => {});
      signedOut();
      nav("#/");
    },
  };

  const car = route.view === "car" ? vehicles.find((x) => x.id === route.id) : null;
  const displayName = account.company?.name || account.name;
  const reminderNote = !account.reminderEmail ? " · fără remindere" : account.reminderVerified === false && features.mail ? " · confirmă e-mailul" : "";

  return (
    <>
      {header(
        <span className="header-actions">
          <button className="userchip" title="Profil, firmă și setări" onClick={() => modals.open({ kind: "account" })}>
            {account.kind === "company" ? "🏢" : "👤"} {displayName}{reminderNote}
          </button>
          <button className="btn ghost small" onClick={actions.logout}>Ieși</button>
        </span>
      )}
      <main className="wrap">
        {loadError && <button type="button" className="alert crit" role="alert" onClick={reload}>📡 {loadError} — apasă pentru a reîncerca</button>}
        <AlertStrip vehicles={car ? [car] : vehicles} />
        {!loaded
          ? <div className="hero" aria-busy={!loadError}><div className="big" aria-hidden="true">🚗</div><p>{loadError ? "Mașinile nu s-au putut încărca." : "Se încarcă mașinile…"}</p></div>
          : car
            ? <CarPage v={car} tab={route.tab} actions={actions} account={account} features={features} />
            : route.view === "overview"
              ? <FleetOverview vehicles={vehicles} account={account} actions={actions} />
              : <Garage vehicles={vehicles} actions={actions} account={account} />}
      </main>
      {modal && <ModalHost modal={modal} vehicles={vehicles} actions={actions} account={account} features={features} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
