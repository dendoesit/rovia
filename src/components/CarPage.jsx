import {
  DOC_TYPES, CORE_DOCS, ATT, latestDocs, healthItems, costStats, fuelEstimate,
  eventTitle, eventIcon, daysLeft, dayStatus, worst,
  fmtKm, fmtMoney, fmtDate, dateLabel, relTime, zile,
} from "../lib/model";
import { nav } from "../lib/nav";

const TABS = [["health", "Stare"], ["costs", "Costuri"], ["docs", "Documente"], ["history", "Istoric"]];

export default function CarPage({ v, tab, actions }) {
  const open = actions.openModal;
  return (
    <>
      <button className="back" onClick={() => nav("#/")}>← Garaj</button>
      <div className="car-head">
        <div className="car-head-top">
          <div>
            <h1>{v.make} {v.model}</h1>
            <div className="meta">
              <span className="plate">{v.plate}</span>
              {v.year && <span>{v.year}</span>}
              {v.fuel && <span>{v.fuel}</span>}
              {v.vin && <span title="VIN">VIN {v.vin}</span>}
            </div>
          </div>
          <button className="btn ghost small" onClick={() => open({ kind: "vehicle", vid: v.id })}>Editează</button>
        </div>
        <div className="km-row">
          <span className="km-big">{fmtKm(v.km)} <small>km</small></span>
          <button className="btn ghost small" onClick={() => open({ kind: "km", vid: v.id })}>Actualizează</button>
          <span className="km-upd">Actualizat: {relTime(v.kmUpdatedAt)}</span>
        </div>
      </div>

      <div className="quick">
        <button className="qbtn" onClick={() => open({ kind: "work", vid: v.id })}><span className="ico">🔧</span>Lucrare</button>
        <button className="qbtn" onClick={() => open({ kind: "doc", vid: v.id })}><span className="ico">📄</span>Document</button>
      </div>

      <div className="tabs">
        {TABS.map(([k, l]) => (
          <button key={k} className={`tab ${tab === k ? "active" : ""}`} onClick={() => nav(`#/car/${v.id}/${k}`)}>{l}</button>
        ))}
      </div>

      {tab === "costs" ? <Costs v={v} /> : tab === "docs" ? <Docs v={v} actions={actions} /> : tab === "history" ? <History v={v} actions={actions} /> : <Health v={v} actions={actions} />}
    </>
  );
}

/* ---------- Stare ---------- */
function Health({ v, actions }) {
  const items = healthItems(v);
  const att = items.filter((i) => ATT.includes(i.status));
  const w = worst(...att.map((i) => i.status), "none");
  const bannerCls = w === "warn" ? "warn" : w === "orange" ? "orange" : "crit";
  const bannerIco = w === "warn" ? "⏳" : w === "orange" ? "⚠️" : "🚨";
  const openAction = (a) => {
    if (a.kind === "service") actions.openModal({ kind: "service", vid: v.id });
    else if (a.kind === "renew") actions.openModal({ kind: "renew", vid: v.id, type: a.type });
    else if (a.kind === "doc") actions.openModal({ kind: "doc", vid: v.id, preType: a.type });
    else if (a.kind === "tyres") actions.openModal({ kind: "tyres", vid: v.id });
  };
  return (
    <>
      {att.length
        ? <div className={`banner ${bannerCls}`}>{bannerIco} {att.length === 1 ? "1 lucru necesită atenție" : `${att.length} lucruri necesită atenție`}</div>
        : <div className="banner ok">🟢 Totul e în regulă</div>}
      <div className="stats">
        {items.map((i, idx) => (
          <div key={idx} className="stat" onClick={() => openAction(i.action)}>
            <div className="lbl"><span>{i.icon}</span>{i.label}</div>
            <div className={`val ${i.status}`}>{i.value}</div>
            <div className="sub">{i.sub}</div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- Costuri ---------- */
function Costs({ v }) {
  const { year, total, cats, perKm, lastService } = costStats(v);
  const fe = fuelEstimate(v);
  const catDefs = [["fuel", "Combustibil", "c-fuel"], ["maintenance", "Mentenanță", "c-maint"], ["document", "Documente", "c-docs"], ["expense", "Altele", "c-other"]];
  const NOD = <span className="nodata">Încă nu sunt destule date</span>;
  return (
    <>
      <div className="cost-hero">
        <div className="lbl">Cheltuit în {year}</div>
        <div className="big">{total > 0 ? fmtMoney(total) : "€0"}</div>
        {total > 0 ? (
          <>
            <div className="bar">
              {catDefs.map(([k, , c]) => cats[k] > 0 && <div key={k} className={c} style={{ width: `${((cats[k] / total) * 100).toFixed(1)}%` }} />)}
            </div>
            <div className="legend">
              {catDefs.map(([k, l, c]) => cats[k] > 0 && <span key={k}><i className={c} />{l} {fmtMoney(cats[k])}</span>)}
            </div>
          </>
        ) : (
          <div className="nodata">Costurile apar aici pe măsură ce înregistrezi alimentări, lucrări și documente.</div>
        )}
      </div>
      <div className="stats">
        <div className="stat" style={{ cursor: "default" }}>
          <div className="lbl"><span>📐</span>Cost pe km</div>
          <div className="val">{perKm ? "€" + perKm.toFixed(2) : NOD}</div>
          <div className="sub">{perKm ? "pe baza km înregistrați" : "necesită intrări cu kilometraj"}</div>
        </div>
        <div className="stat" style={{ cursor: "default" }}>
          <div className="lbl"><span>⛽</span>Combustibil (estimat)</div>
          <div className="val">{fe ? `~${fmtMoney(Math.round(fe.costMonth))}/lună` : NOD}</div>
          <div className="sub">{fe
            ? `~${fmtKm(fe.kmAn)} km/an · ${fe.cons.toFixed(1)} ${fe.unit}/100km${fe.real ? "" : ` (medie ${v.fuel})`} · ~${fmtMoney(Math.round(fe.costYear))}/an`
            : "necesită kilometraj + anul mașinii"}</div>
        </div>
        <div className="stat" style={{ cursor: "default" }}>
          <div className="lbl"><span>🔧</span>Ultimul service</div>
          <div className="val">{lastService ? fmtMoney(lastService.cost) : NOD}</div>
          <div className="sub">{lastService ? fmtDate(lastService.date) : "înregistrează un service"}</div>
        </div>
      </div>
    </>
  );
}

/* ---------- Documente ---------- */
function Docs({ v, actions }) {
  const docs = latestDocs(v);
  const types = [...new Set([...Object.keys(docs), ...CORE_DOCS, "casco"])].filter((t) => DOC_TYPES[t]);
  return (
    <>
      <div className="section-head">
        <h3>Documente</h3>
        <button className="btn ghost small" onClick={() => actions.openModal({ kind: "doc", vid: v.id })}>+ Adaugă document</button>
      </div>
      <div className="doc-list">
        {types.map((t) => {
          const meta = DOC_TYPES[t];
          const d = docs[t];
          if (!d)
            return (
              <div key={t} className="doc-row missing">
                <div className="doc-ico">{meta.icon}</div>
                <div className="info"><div className="name">{meta.label}</div><div className="st none">Neadăugat încă</div></div>
                <button className="btn ghost small" onClick={() => actions.openModal({ kind: "doc", vid: v.id, preType: t })}>Adaugă</button>
              </div>
            );
          const dl = daysLeft(d.expires);
          const st = dayStatus(dl);
          return (
            <div key={t} className="doc-row">
              <div className="doc-ico">{meta.icon}</div>
              <div className="info">
                <div className="name">{meta.label}{d.provider && <span className="muted"> · {d.provider}</span>}</div>
                <div className={`st ${st}`}>
                  {dl < 0 ? `Expirat acum ${zile(dl)}` : `Activ · încă ${zile(dl)}`} <span className="muted">({fmtDate(d.expires)})</span>
                </div>
              </div>
              <button className="btn small" onClick={() => actions.openModal({ kind: "renew", vid: v.id, type: t })}>Reînnoiește →</button>
            </div>
          );
        })}
      </div>
      <div className="hint">Reînnoirile apar automat în Istoric. Cumpărarea RCA / rovinietei direct din aplicație poate fi conectată aici ulterior.</div>
    </>
  );
}

/* ---------- Istoric ---------- */
function History({ v, actions }) {
  const evts = [...(v.events || [])].sort((a, b) => b.date.localeCompare(a.date) || (b.created || "").localeCompare(a.created || ""));
  if (!evts.length)
    return (
      <div className="card" style={{ padding: 34, textAlign: "center" }}>
        <div className="nodata">Încă nu există istoric — se construiește singur pe măsură ce înregistrezi alimentări, lucrări și documente.</div>
      </div>
    );
  return (
    <div className="card">
      <div className="tl">
        {evts.map((e) => {
          const subs = [];
          if (e.liters) subs.push(`${e.liters} L`);
          if (e.km) subs.push(`${fmtKm(e.km)} km`);
          if (e.note) subs.push(e.note);
          return (
            <div key={e.id} className="tl-item" onClick={() => actions.openModal({ kind: "event", vid: v.id, eid: e.id })}>
              <div className={`tl-ico ${e.kind}`}>{eventIcon(e)}</div>
              <div className="mid">
                <div className="t">{eventTitle(e)}{e.photo ? " 📎" : ""}</div>
                <div className="s">{subs.join(" · ") || " "}</div>
              </div>
              <div className="right">
                {e.cost != null && e.cost !== 0 && <div className="cost">{fmtMoney(e.cost)}</div>}
                <div className="date">{dateLabel(e.date)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
