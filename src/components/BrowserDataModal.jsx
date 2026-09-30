import { useState } from "react";
import { ModalShell } from "./ui";

const forImport = ({ id, createdAt, events, ...v }) => ({ ...v, events: (events || []).map(({ photo, id: _id, ...e }) => e) });

/* versiunea veche salva uneori mașinile doar în browser; le mutăm în cont cu importul standard, iar ce nu trece rămâne local */
export default function BrowserDataModal({ list: found, account, actions }) {
  const [list, setList] = useState(found);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const move = async () => {
    setBusy(true);
    try {
      const r = await actions.importVehicles(list.map(forImport), "merge");
      const failed = (r.errors || []).filter((e) => list[e.row]);
      actions.forgetBrowserData(failed.map((e) => list[e.row]));
      if (r.created.length || r.updated.length)
        actions.toast(`✅ ${r.created.length} mașini mutate în cont${r.updated.length ? `, ${r.updated.length} completate` : ""}`);
      if (!failed.length) return actions.close();
      setList(failed.map((e) => list[e.row]));
      setErrors(failed.map((e) => e.error));
    } catch (e) {
      actions.toast("⚠ " + e.message);
    }
    setBusy(false);
  };
  const retrying = errors.length > 0;
  return (
    <ModalShell close={busy ? () => {} : actions.close} label="Date găsite în browser">
      {retrying
        ? <h2>⚠ {list.length === 1 ? "O mașină nu s-a putut muta" : `${list.length} mașini nu s-au putut muta`}</h2>
        : <h2>💾 Am găsit {list.length === 1 ? "o mașină salvată" : `${list.length} mașini salvate`} doar în acest browser</h2>}
      <div className="wiz-sub">
        {retrying
          ? "Au rămas salvate în acest browser și ți le arătăm din nou la următoarea intrare. Poți încerca acum din nou sau le poți adăuga manual."
          : "Sunt din versiunea veche, când aplicația salva uneori local. Le mut în cont ca să le vezi de pe orice dispozitiv? (pozele vechi nu se pot muta)"}
      </div>
      {account.currency !== "EUR" && (
        <div className="banner warn" role="note">Sumele din versiunea veche au fost introduse în euro, iar contul tău folosește lei — le mutăm fără conversie.</div>
      )}
      <ul className="plain-list">
        {list.slice(0, 8).map((v, i) => (
          <li key={i}>{v.make} {v.model} <span className="plate">{v.plate}</span>{errors[i] && <span className="row-err"> — {errors[i]}</span>}</li>
        ))}
      </ul>
      <div className="modal-actions">
        <button className="btn ghost" onClick={() => { actions.forgetBrowserData(); actions.close(); }} disabled={busy}>Nu, șterge-le</button>
        <button className="btn" onClick={move} disabled={busy}>{busy ? "Se mută…" : retrying ? "Încearcă din nou" : "Mută în cont"}</button>
      </div>
    </ModalShell>
  );
}
