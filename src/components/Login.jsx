import { useEffect, useState } from "react";
import { authApi } from "../lib/api";
import { nav } from "../lib/nav";

/* ecranele fără sesiune: intrare, cont nou, parolă uitată, parolă nouă din link */
export default function AuthScreen({ onAuthenticated, resetToken }) {
  const [mode, setMode] = useState(resetToken ? "reset" : "login");
  const [f, setF] = useState({ identifier: "", email: "", password: "", password2: "", kind: "company", companyName: "", remember: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const go = (m) => { setMode(m); setError(null); setInfo(null); };
  useEffect(() => { if (resetToken) go("reset"); }, [resetToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        onAuthenticated((await authApi.login(f.identifier.trim(), f.password, f.remember)).account, { password: f.password });
      } else if (mode === "register") {
        if (f.password !== f.password2) throw new Error("parolele nu coincid");
        const r = await authApi.register({
          email: f.email.trim(), password: f.password, kind: f.kind, remember: f.remember,
          ...(f.kind === "company" ? { company: { name: f.companyName.trim() }, name: f.companyName.trim() } : {}),
        });
        onAuthenticated(r.account, { created: true });
      } else if (mode === "forgot") {
        await authApi.forgot(f.email.trim());
        setInfo("Dacă există un cont cu acest e-mail, ți-am trimis un link de resetare (verifică și Spam).");
      } else if (mode === "reset") {
        if (f.password !== f.password2) throw new Error("parolele nu coincid");
        const r = await authApi.reset(resetToken, f.password);
        nav("#/");
        onAuthenticated(r.account);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const titles = { login: "Intră în cont", register: "Cont nou", forgot: "Ai uitat parola?", reset: "Alege o parolă nouă" };
  return (
    <main className="wrap">
      <div className="login-card">
        <div className="logo" style={{ fontSize: 26, cursor: "default" }}>Fleet<span>Deck</span></div>
        <h1 className="login-title">{titles[mode]}</h1>
        <form onSubmit={submit}>
          {mode === "login" && (
            <div className="field">
              <label htmlFor="identifier">E-mail</label>
              <input id="identifier" name="username" autoFocus autoCapitalize="none" autoComplete="username" inputMode="email"
                placeholder="nume@firma.ro" value={f.identifier} onChange={set("identifier")} required />
              <div className="field-hint">Ai cont din versiunea veche? Intră cu numele de utilizator de atunci.</div>
            </div>
          )}
          {mode === "register" && (
            <>
              <div className="segmented" role="radiogroup" aria-label="Tip cont">
                {[["company", "🏢 Firmă"], ["personal", "👤 Personal"]].map(([k, l]) => (
                  <button type="button" key={k} role="radio" aria-checked={f.kind === k} className={f.kind === k ? "on" : ""} onClick={() => setF({ ...f, kind: k })}>{l}</button>
                ))}
              </div>
              {f.kind === "company" && (
                <div className="field">
                  <label htmlFor="companyName">Numele firmei</label>
                  <input id="companyName" autoComplete="organization" placeholder="Firma Mea SRL" value={f.companyName} onChange={set("companyName")} required />
                  <div className="field-hint">Un singur cont pe firmă — îl poți folosi cu colegii. CUI-ul și adresa le completezi din profil.</div>
                </div>
              )}
            </>
          )}
          {(mode === "register" || mode === "forgot") && (
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input id="email" name="email" type="email" autoFocus={mode === "forgot"} autoComplete={mode === "register" ? "email" : "username"}
                placeholder="nume@firma.ro" value={f.email} onChange={set("email")} required />
            </div>
          )}
          {mode !== "forgot" && (
            <div className="field">
              <label htmlFor="password">{mode === "login" ? "Parolă" : "Parolă (minim 8 caractere)"}</label>
              <input id="password" name="password" type="password" minLength={mode === "login" ? undefined : 8}
                autoComplete={mode === "login" ? "current-password" : "new-password"} value={f.password} onChange={set("password")} required />
            </div>
          )}
          {(mode === "register" || mode === "reset") && (
            <div className="field">
              <label htmlFor="password2">Repetă parola</label>
              <input id="password2" type="password" autoComplete="new-password" value={f.password2} onChange={set("password2")} required />
            </div>
          )}
          {(mode === "login" || mode === "register") && (
            <label className="check">
              <input type="checkbox" checked={f.remember} onChange={set("remember")} /> Ține-mă minte 30 de zile
            </label>
          )}
          {error && <div className="login-err" role="alert">⚠ {error}</div>}
          {info && <div className="login-info" role="status">✉️ {info}</div>}
          <button className="btn" style={{ width: "100%", marginTop: 12 }} disabled={busy}>
            {busy ? "Se verifică…" : { login: "Intră", register: "Creează contul", forgot: "Trimite linkul", reset: "Salvează parola" }[mode]}
          </button>
        </form>
        <div className="login-links">
          {mode === "login" && <><button className="linkbtn" onClick={() => go("forgot")}>Am uitat parola</button><button className="linkbtn" onClick={() => go("register")}>Cont nou</button></>}
          {mode !== "login" && <button className="linkbtn" onClick={() => { go("login"); if (mode === "reset") nav("#/"); }}>← Înapoi la intrare</button>}
        </div>
      </div>
    </main>
  );
}
