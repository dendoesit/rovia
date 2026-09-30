import { useState } from "react";
import { vignetteQuote, renewalClipboard, VIGNETTE_PORTAL, TOLLRO_INFO, EURO_CLASSES, safeHttpsUrl } from "../../shared/renewals.js";
import { currencyCode } from "../lib/model";

async function copy(text, toast) {
  try { await navigator.clipboard.writeText(text); toast("📋 Datele au fost copiate — le lipești în formularul de plată"); }
  catch { toast("⚠ Browserul nu a permis copierea — selectează textul manual"); }
}

/* „aproape un click": fără contract cu un distribuitor, plata se face pe portalul oficial / la broker, apoi notăm reînnoirea aici */
export default function RenewalHelp({ type, v, account, actions }) {
  const [broker, setBroker] = useState(account?.rcaBrokerUrl || "");
  const clip = renewalClipboard(v, account, type);
  const company = account?.kind === "company" && account.company?.cui;

  if (type === "rovinieta") {
    const q = vignetteQuote(v);
    if (q.category === "none")
      return <div className="renew-help"><b>Nu e nevoie de rovinietă</b> pentru remorci, rulote și motociclete. Poți șterge documentul din tab-ul Documente.</div>;
    if (q.category === "tollro")
      return (
        <div className="renew-help">
          <b>Din 1 octombrie 2026, vehiculele de marfă peste 3,5 t nu mai folosesc rovinietă</b> — plătesc tariful de drum TollRO pe km.
          <div className="renew-actions"><a className="btn ghost small" href={TOLLRO_INFO} target="_blank" rel="noopener noreferrer">Deschide portalul TollRO ↗</a></div>
        </div>
      );
    return (
      <div className="renew-help">
        <div className="renew-price">
          {q.price ? <><b>{q.price} lei</b> / 12 luni</> : <b>Tariful se vede pe portal</b>}
          <span className="muted"> · categoria {q.category}{q.euro ? ` · ${EURO_CLASSES[q.euro]}${q.euroGuessed ? " (după an)" : ""}` : " · completează anul sau clasa Euro"}</span>
        </div>
        <ol className="renew-steps">
          <li>Copiezi numărul, VIN-ul{company ? " și datele firmei" : ""}.</li>
          <li>Plătești pe portalul oficial CNAIR (TollRO) — factura se emite pe profilul {company ? "firmei " : ""}din contul tău etoll.</li>
          <li>Te întorci aici și salvezi noua dată{q.price && currencyCode() === "RON" ? " — prețul pe 12 luni e deja completat" : " și costul plătit"}.</li>
        </ol>
        <div className="renew-actions">
          <button type="button" className="btn ghost small" onClick={() => copy(clip, actions.toast)}>📋 Copiază datele</button>
          <a className="btn small" href={VIGNETTE_PORTAL} target="_blank" rel="noopener noreferrer">Cumpără pe portal.etoll.ro ↗</a>
        </div>
        <div className="hint">Tarif oficial orientativ (Ordinul MTI 888/2026). Distribuitorii autorizați nu au voie să adauge comisioane peste tarif.</div>
      </div>
    );
  }

  if (type === "rca") {
    const url = safeHttpsUrl(account?.rcaBrokerUrl);
    const saveBroker = async () => {
      const r = await actions.saveAccount({ rcaBrokerUrl: broker.trim() || null });
      actions.toast(r.ok ? "🔗 Linkul brokerului a fost salvat" : "⚠ " + r.error);
    };
    return (
      <div className="renew-help">
        <ol className="renew-steps">
          <li>Copiezi datele mașinii{company ? " și ale firmei (polița se emite pe CUI)" : ""}.</li>
          <li>Ceri oferta la brokerul tău și plătești acolo.</li>
          <li>Salvezi aici noua dată de expirare, costul și poza poliței.</li>
        </ol>
        <div className="renew-actions">
          <button type="button" className="btn ghost small" onClick={() => copy(clip, actions.toast)}>📋 Copiază datele</button>
          {url && <a className="btn small" href={url} target="_blank" rel="noopener noreferrer">Deschide brokerul ↗</a>}
        </div>
        {!url && (
          <div className="inline-input" style={{ marginTop: 8 }}>
            <input type="url" inputMode="url" placeholder="https://brokerul-tau.ro/rca" value={broker} onChange={(e) => setBroker(e.target.value)} aria-label="Linkul brokerului de RCA"
              onKeyDown={(e) => { if (e.key !== "Enter") return; e.preventDefault(); if (broker.trim()) saveBroker(); }} />
            <button type="button" className="btn ghost small" onClick={saveBroker} disabled={!broker.trim()}>Salvează</button>
          </div>
        )}
        <div className="hint">RCA e scutit de TVA, deci nu se emite factură: polița pe CUI plus dovada plății sunt documentele contabile.</div>
      </div>
    );
  }
  return null;
}
