import { useState } from "react";
import { FUEL_PRICES_AS_OF, FUEL_PRICES_SOURCE } from "../../shared/domain.js";

const FUEL_FIELDS = ["Benzină", "Motorină", "GPL", "Electric"];
import { accountApi } from "../lib/api";
import { profilePatch, loginEmailChanged, reminderNotice, currencySymbol, referenceFuelPrice } from "../lib/model";
import { ModalShell, Field } from "./ui";

const REASONS = {
  weakPassword: "Contul tău vechi are o parolă slabă. Alege acum una nouă, de minim 8 caractere.",
  legacy: "Adaugă un e-mail de login: de acum intri cu e-mailul, iar resetarea parolei devine posibilă.",
};

const NO_PASSWORDS = { current: "", next: "", next2: "" };

/* knownPassword: parola știută deja (sesiunea veche sau cea tastată la intrare) — nu o mai cerem */
export default function AccountModal({ account, features, actions, reason, knownPassword }) {
  const [why, setWhy] = useState(reason);
  const [known, setKnown] = useState(knownPassword || null);
  const [tab, setTab] = useState(reason === "weakPassword" ? "password" : "profile");
  const [f, setF] = useState({
    kind: account.kind,
    name: account.name || "",
    email: account.email || "",
    reminderEmail: account.pendingReminderEmail || account.reminderEmail || "",
    currency: account.currency || "RON",
    companyName: account.company?.name || "",
    cui: account.company?.cui || "",
    regCom: account.company?.regCom || "",
    address: account.company?.address || "",
    rcaBrokerUrl: account.rcaBrokerUrl || "",
    fuelPrices: Object.fromEntries(FUEL_FIELDS.map((k) => [k, account.fuelPrices?.[k] != null ? String(account.fuelPrices[k]) : ""])),
    currentPassword: "",
  });
  const [pw, setPw] = useState(NO_PASSWORDS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const forced = why === "weakPassword";
  const askCurrentForEmail = loginEmailChanged(account, f.email) && !known;
  const fail = (r) => { if (r.status === 403) setKnown(null); setError(r.error); };
  const notice = reminderNotice(account, features.mail);

  const lookup = async () => {
    setError(null);
    setBusy(true);
    try {
      const c = await accountApi.lookupCompany(f.cui);
      setF({ ...f, companyName: c.name || f.companyName, regCom: c.regCom || f.regCom, address: c.address || f.address, cui: c.cui });
      actions.toast(`🏢 ${c.name}${c.vatPayer ? " · plătitor TVA" : ""}`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const body = profilePatch(account, f, known || f.currentPassword, { mail: !!features.mail });
    const r = await actions.saveAccount(body);
    setBusy(false);
    if (!r.ok) return fail(r);
    const sentTo = r.account?.pendingReminderEmail || body.reminderEmail || body.email;
    actions.toast(r.verificationSent ? `📬 Ți-am trimis un link de confirmare la ${sentTo}` : "Profil salvat");
    actions.close();
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setError(null);
    if (pw.next !== pw.next2) return setError("parolele noi nu coincid");
    setBusy(true);
    const r = await actions.changePassword(known || pw.current, pw.next);
    setBusy(false);
    if (!r.ok) return fail(r);
    if (!forced || account.email || !account.legacyUser) return actions.close();
    setKnown(pw.next);
    setPw(NO_PASSWORDS);
    setWhy("legacy");
    setTab("profile");
  };

  return (
    <ModalShell close={forced ? () => {} : actions.close} closable={!forced} label="Profil">
      <h2>{account.kind === "company" ? "🏢" : "👤"} {account.company?.name || account.name}</h2>
      {why && <div className="banner warn" style={{ marginBottom: 12 }}>{REASONS[why]}</div>}
      <div className="segmented" role="tablist">
        {[["profile", "Profil"], ["password", "Parolă"]].map(([k, l]) => (
          <button type="button" key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} disabled={forced && k !== "password"} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "profile" ? (
        <form onSubmit={saveProfile}>
          <div className="segmented" role="radiogroup" aria-label="Tip cont">
            {[["company", "🏢 Firmă"], ["personal", "👤 Personal"]].map(([k, l]) => (
              <button type="button" key={k} role="radio" aria-checked={f.kind === k} className={f.kind === k ? "on" : ""} onClick={() => setF({ ...f, kind: k })}>{l}</button>
            ))}
          </div>
          {f.kind === "company" ? (
            <>
              <Field label="CUI" hint="Apasă „Caută la ANAF” și completăm automat denumirea, adresa și Nr. Reg. Com.">
                <div className="inline-input">
                  <input value={f.cui} onChange={set("cui")} placeholder="RO12345678" inputMode="numeric" />
                  <button type="button" className="btn ghost small" onClick={lookup} disabled={busy || !f.cui.trim()}>Caută la ANAF</button>
                </div>
              </Field>
              <Field label="Nr. Reg. Com."><input value={f.regCom} onChange={set("regCom")} placeholder="J04/123/2010" /></Field>
              <Field label="Denumire firmă"><input value={f.companyName} onChange={set("companyName")} required /></Field>
              <Field label="Adresă sediu"><input value={f.address} onChange={set("address")} /></Field>
              <div className="hint">Datele firmei se folosesc pentru facturi (rovinietă, RCA) și în rapoarte.</div>
            </>
          ) : (
            <Field label="Nume"><input value={f.name} onChange={set("name")} autoComplete="name" /></Field>
          )}
          <div className="row2">
            <Field label="E-mail de login"><input type="email" value={f.email} onChange={set("email")} autoComplete="email" required={!!account.email} placeholder="nume@firma.ro" /></Field>
            <Field label="Moneda costurilor">
              <select value={f.currency} onChange={set("currency")}><option value="RON">Lei (RON)</option><option value="EUR">Euro (€)</option></select>
            </Field>
          </div>
          {askCurrentForEmail && (
            <Field label="Parola actuală" hint="O cerem ca să schimbi e-mailul de login.">
              <input type="password" autoComplete="current-password" value={f.currentPassword} onChange={set("currentPassword")} required />
            </Field>
          )}
          <Field label="E-mail pentru remindere (ITP, RCA, rovinietă, service)">
            <input type="email" value={f.reminderEmail} onChange={set("reminderEmail")} placeholder={f.email || "flota@firma.ro"} />
          </Field>
          <details className="form-more" open={FUEL_FIELDS.some((k) => f.fuelPrices[k])}>
            <summary>Prețuri combustibil pentru estimări (opțional)</summary>
            <div className="row2">
              {FUEL_FIELDS.map((k) => (
                <Field key={k} label={`${k} (${currencySymbol()}/${k === "Electric" ? "kWh" : "L"})`}>
                  <input inputMode="decimal" placeholder={String(referenceFuelPrice(k)).replace(".", ",")} value={f.fuelPrices[k]}
                    onChange={(e) => setF({ ...f, fuelPrices: { ...f.fuelPrices, [k]: e.target.value } })} />
                </Field>
              ))}
            </div>
            <div className="hint">Gol = media națională la pompă din {FUEL_PRICES_AS_OF} ({FUEL_PRICES_SOURCE}). Pune prețul plătit de firmă dacă ai card de flotă sau discount. Consumul real din alimentări are oricum prioritate.</div>
          </details>
          <Field label="Link broker RCA (opțional)" hint="Butonul „Deschide brokerul” din reînnoirea RCA duce aici.">
            <input type="url" inputMode="url" value={f.rcaBrokerUrl} onChange={set("rcaBrokerUrl")} placeholder="https://brokerul-tau.ro/rca" />
          </Field>
          {notice && <div className="hint">{notice}</div>}
          {!features.mail && <div className="hint">⚠ Trimiterea e-mailurilor nu e configurată încă (RESEND_API_KEY) — alertele rămân vizibile în aplicație.</div>}
          {account.currency !== f.currency && <div className="hint">Schimbarea monedei nu convertește sumele deja înregistrate — schimbă doar afișarea.</div>}
          {error && <div className="login-err" role="alert">⚠ {error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={actions.close}>Anulează</button>
            <button className="btn" disabled={busy}>{busy ? "Se salvează…" : "Salvează"}</button>
          </div>
        </form>
      ) : (
        <form onSubmit={savePassword}>
          <input type="text" name="username" autoComplete="username" value={account.email || account.legacyUser || ""} readOnly hidden />
          {!known && !forced && <Field label="Parola actuală"><input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></Field>}
          <Field label="Parola nouă (minim 8 caractere)"><input type="password" autoComplete="new-password" minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required /></Field>
          <Field label="Repetă parola nouă"><input type="password" autoComplete="new-password" value={pw.next2} onChange={(e) => setPw({ ...pw, next2: e.target.value })} required /></Field>
          <div className="hint">După schimbare, celelalte dispozitive vor trebui să intre din nou.</div>
          {error && <div className="login-err" role="alert">⚠ {error}</div>}
          <div className="modal-actions">
            {forced
              ? <button type="button" className="btn ghost" onClick={actions.logout}>Ieși din cont</button>
              : <button type="button" className="btn ghost" onClick={actions.close}>Anulează</button>}
            <button className="btn" disabled={busy}>{busy ? "Se salvează…" : "Schimbă parola"}</button>
          </div>
        </form>
      )}
    </ModalShell>
  );
}
