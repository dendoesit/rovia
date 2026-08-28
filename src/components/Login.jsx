import { useState } from "react";

export default function Login({ onLogin, error, busy }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const submit = (e) => {
    e.preventDefault();
    if (!u.trim() || !p) return;
    onLogin(u.trim(), p);
  };
  return (
    <main className="wrap">
      <div className="login-card">
        <div className="logo" style={{ fontSize: 26, cursor: "default" }}>Fleet<span>Deck</span></div>
        <p className="muted" style={{ marginTop: 6 }}>Numele tău + parola echipei.</p>
        <form onSubmit={submit}>
          <div className="field">
            <label>Utilizator</label>
            <input autoFocus autoCapitalize="none" autoComplete="username" placeholder="dan"
              value={u} onChange={(e) => setU(e.target.value)} />
          </div>
          <div className="field">
            <label>Parolă</label>
            <input type="password" autoComplete="current-password" placeholder="parola echipei"
              value={p} onChange={(e) => setP(e.target.value)} />
          </div>
          {error && <div className="login-err">⚠ {error}</div>}
          <button className="btn" style={{ width: "100%", marginTop: 10 }} disabled={busy}>
            {busy ? "Se verifică…" : "Intră"}
          </button>
        </form>
        <div className="hint">Primul login cu un nume nou îi creează automat garajul gol. Fiecare utilizator își vede doar mașinile lui.</div>
      </div>
    </main>
  );
}
