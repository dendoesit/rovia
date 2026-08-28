import { costStats, fuelEstimate, fmtMoney, fmtKm } from "../lib/model";
import { nav } from "../lib/nav";

const CATS = [["fuel", "Combustibil", "c-fuel"], ["maintenance", "Mentenanță", "c-maint"], ["document", "Documente", "c-docs"], ["expense", "Altele", "c-other"]];

export default function FleetCosts({ vehicles }) {
  const year = new Date().getFullYear();
  const rows = vehicles
    .map((v) => ({ v, s: costStats(v), fe: fuelEstimate(v) }))
    .sort((a, b) => b.s.total - a.s.total);
  const max = Math.max(...rows.map((r) => r.s.total), 1);
  const grand = rows.reduce((s, r) => s + r.s.total, 0);
  const grandFuel = rows.reduce((s, r) => s + (r.fe ? r.fe.costYear : 0), 0);

  return (
    <>
      <button className="back" onClick={() => nav("#/")}>← Garaj</button>
      <div className="page-title">📊 Costuri flotă · {year}</div>
      <div className="cost-hero">
        <div className="lbl">Total înregistrat în {year} · {vehicles.length} mașin{vehicles.length === 1 ? "ă" : "i"}</div>
        <div className="big">{fmtMoney(grand)}</div>
        <div className="legend">
          {CATS.map(([k, l, c]) => <span key={k}><i className={c} />{l}</span>)}
        </div>
        {grandFuel > 0 && <div className="hint">+ ~{fmtMoney(Math.round(grandFuel))}/an combustibil estimat pe toată flota</div>}
      </div>
      <div className="fleet-rows">
        {rows.map(({ v, s, fe }) => (
          <div key={v.id} className="fleet-row" onClick={() => nav(`#/car/${v.id}/costs`)}>
            <div className="fleet-name"><b>{v.make} {v.model}</b> <span className="plate">{v.plate}</span></div>
            <div className="fleet-total">{fmtMoney(s.total)}</div>
            <div className="fleet-bar">
              {s.total > 0 && CATS.map(([k, l, c]) =>
                s.cats[k] > 0 && <div key={k} className={c} style={{ width: `${(s.cats[k] / max) * 100}%` }} title={`${l}: ${fmtMoney(s.cats[k])}`} />
              )}
            </div>
            <div className="fleet-sub">
              {fe
                ? `+ ~${fmtMoney(Math.round(fe.costYear))}/an combustibil estimat (~${fmtKm(fe.kmAn)} km/an)`
                : "fără estimare combustibil — adaugă kilometrajul și anul mașinii"}
            </div>
          </div>
        ))}
      </div>
      {!rows.some((r) => r.s.total > 0) && (
        <div className="hint" style={{ marginTop: 14 }}>Barele cresc pe măsură ce înregistrezi lucrări, documente și cheltuieli la fiecare mașină.</div>
      )}
    </>
  );
}
