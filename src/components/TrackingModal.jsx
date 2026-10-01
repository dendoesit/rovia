import { useState } from "react";
import { TRACKABLE } from "../../shared/domain.js";
import { vehicleName } from "../lib/model";
import { ModalShell } from "./ui";

/* „nu mai urmări": ce oprești nu mai dă alerte și nu intră în topuri; istoricul rămâne */
export default function TrackingModal({ v, actions }) {
  const [ignored, setIgnored] = useState(new Set(v.ignored || []));
  const [archived, setArchived] = useState(!!v.archived);
  const [busy, setBusy] = useState(false);
  const toggle = (k) => setIgnored((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const save = async () => {
    setBusy(true);
    const ok = await actions.patchVehicle(v.id, { ignored: [...ignored], archived }, archived ? "📦 Mașina a fost arhivată" : "Setările de urmărire au fost salvate");
    setBusy(false);
    if (ok) actions.close();
  };

  return (
    <ModalShell close={actions.close} label="Ce urmărim">
      <h2>⚙️ Ce urmărim la {vehicleName(v)}</h2>
      <div className="wiz-sub">Debifează ce nu te interesează: nu mai primești alerte și nu mai apare în topuri. Istoricul și documentele rămân salvate.</div>
      <fieldset className="track-list" disabled={archived || busy}>
        {Object.entries(TRACKABLE).map(([k, label]) => (
          <label key={k} className="check">
            <input type="checkbox" checked={!ignored.has(k)} onChange={() => toggle(k)} /> {label}
          </label>
        ))}
      </fieldset>
      <label className="check archive-toggle">
        <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} disabled={busy} />
        📦 Arhivează mașina (vândută / scoasă din uz) — nu mai apare în garaj, alerte și dashboard
      </label>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={actions.close} disabled={busy}>Anulează</button>
        <button type="button" className="btn" onClick={save} disabled={busy}>{busy ? "Se salvează…" : "Salvează"}</button>
      </div>
    </ModalShell>
  );
}
