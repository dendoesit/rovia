import { useState } from "react";
import {
  DOC_TYPES, CATEGORIES, ATT, healthItems, docRows, historyPage, pricePerLiter,
  eventTitle, eventIcon, worst, vehicleName,
  fmtKm, fmtQty, fmtMoney, fmtDate, dateLabel, relTime, zile,
} from "../lib/model";
import CarCosts from "./CarCosts";

const TABS = [["health", "Stare"], ["costs", "Costuri"], ["docs", "Documente"], ["history", "Istoric"]];
const QUICK = [["work", "🔧", "Lucrare"], ["fuel", "⛽", "Alimentare"], ["expense", "💶", "Cheltuială"], ["doc", "📄", "Document"], ["invoices", "🧾", "Factură"], ["km", "📍", "Kilometraj"]];
const HISTORY_PAGE = 50;

export default function CarPage({ v, tab, actions, account, features }) {
  const open = (kind, extra) => actions.openModal({ kind, vid: v.id, ...extra });
  const current = TABS.some(([k]) => k === tab) ? tab : "health";
  return (
    <>
      <a className="back" href="#/">← Garaj</a>
      <section className="car-head" aria-label="Mașina">
        <div className="car-head-top">
          <div className="car-title">
            <h1>{vehicleName(v)}</h1>
            <div className="meta">
              <span className="plate">{v.plate}</span>
              {CATEGORIES[v.category] && <span>{CATEGORIES[v.category]}</span>}
              {v.year && <span>{v.year}</span>}
              {v.fuel && <span>{v.fuel}</span>}
              {v.driver && <span><span aria-hidden="true">👤 </span>Șofer: {v.driver}</span>}
              {v.vin && <span className="vin">VIN {v.vin}</span>}
            </div>
            {v.notes && <p className="car-notes">📝 {v.notes}</p>}
          </div>
          <button type="button" className="btn ghost small" onClick={() => open("vehicle")}>Editează</button>
        </div>
        <div className="km-row">
          <span className="km-big">{fmtKm(v.km)} <small>km</small></span>
          <button type="button" className="btn ghost small" onClick={() => open("km")}>Actualizează</button>
          <span className="km-upd">Actualizat: {relTime(v.kmUpdatedAt)}</span>
        </div>
      </section>

      <div className="quick" role="group" aria-label="Adaugă rapid">
        {QUICK.map(([kind, icon, label]) => (
          <button type="button" key={kind} className="qbtn" onClick={() => open(kind)}>
            <span className="ico" aria-hidden="true">{icon}</span>{label}
          </button>
        ))}
      </div>

      <nav className="tabs" aria-label="Secțiuni">
        {TABS.map(([k, l]) => (
          <a key={k} href={`#/car/${v.id}/${k}`} className={`tab${current === k ? " active" : ""}`} aria-current={current === k ? "page" : undefined}>{l}</a>
        ))}
      </nav>

      {current === "costs" ? <CarCosts v={v} actions={actions} account={account} features={features} />
        : current === "docs" ? <Docs v={v} open={open} actions={actions} />
        : current === "history" ? <History key={v.id} v={v} open={open} />
        : <Health v={v} open={open} />}
    </>
  );
}

/* ---------- Stare ---------- */
const BANNER = { warn: ["warn", "⏳"], orange: ["orange", "⚠️"], crit: ["crit", "🚨"], dead: ["crit", "🚨"] };
const lucruri = (n) => (n === 1 ? "1 lucru necesită atenție" : `${n} lucruri necesită atenție`);

function Health({ v, open }) {
  const items = healthItems(v);
  const att = items.filter((i) => ATT.includes(i.status));
  const missing = items.filter((i) => i.status === "missing");
  const [cls, icon] = BANNER[worst(...att.map((i) => i.status), "warn")];
  const openAction = ({ kind, type }) => open(kind, kind === "doc" ? { preType: type } : { type });
  return (
    <>
      {att.length > 0 && <div className={`banner ${cls}`}><span aria-hidden="true">{icon}</span> {lucruri(att.length)}</div>}
      {missing.length > 0 && <div className="banner missing"><span aria-hidden="true">📄</span> Documente obligatorii lipsă: {missing.map((i) => i.label).join(", ")}</div>}
      {v.archived && <div className="banner missing"><span aria-hidden="true">📦</span> Mașină arhivată — nu mai apare în alerte și în dashboard.</div>}
      {!v.archived && !att.length && !missing.length && <div className="banner ok"><span aria-hidden="true">🟢</span> Totul e în regulă</div>}
      <div className="stats">
        {items.map((i) => (
          <button type="button" key={i.label} className="stat" onClick={() => openAction(i.action)}>
            <span className="lbl"><span aria-hidden="true">{i.icon}</span>{i.label}</span>
            <span className={`val ${i.status}`}>{i.value}</span>
            <span className="sub">{i.sub}</span>
          </button>
        ))}
      </div>
      <button type="button" className="btn ghost small track-btn" onClick={() => open("tracking")}>
        ⚙️ Ce urmărim{v.ignored?.length ? ` · ${v.ignored.length} oprite` : ""}
      </button>
    </>
  );
}

/* ---------- Documente ---------- */
function docState(r) {
  if (r.ignored) return r.doc ? `Nu se mai urmărește · expiră ${fmtDate(r.doc.expires)}` : "Nu se mai urmărește";
  if (!r.doc && r.notYet) return `Nu e necesar încă · prima ITP până la ${fmtDate(r.notYet.dueBy)}${r.notYet.estimated ? " (estimat)" : ""}`;
  if (!r.doc) return r.required ? "Obligatoriu · lipsește" : "Neadăugat încă";
  if (r.daysLeft < 0) return `Expirat acum ${zile(r.daysLeft)}`;
  return r.daysLeft === 0 ? "Expiră azi" : `Activ · încă ${zile(r.daysLeft)}`;
}

function Docs({ v, open, actions }) {
  const rows = docRows(v);
  const missing = rows.filter((r) => r.status === "missing");
  const remove = (type) => {
    const label = DOC_TYPES[type].label;
    if (confirm(`Ștergi ${label} de la ${vehicleName(v)}? Intrările din istoric rămân.`)) actions.removeDocument(v.id, type, `Document șters: ${label}`);
  };
  return (
    <>
      <div className="section-head">
        <h2>Documente</h2>
        <button type="button" className="btn ghost small" onClick={() => open("doc")}>+ Adaugă document</button>
      </div>
      {missing.length > 0 && (
        <div className="banner missing"><span aria-hidden="true">📄</span> Documente obligatorii lipsă: {missing.map((r) => DOC_TYPES[r.type].label).join(", ")}</div>
      )}
      <ul className="doc-list">
        {rows.map((r) => {
          const meta = DOC_TYPES[r.type];
          return (
            <li key={r.type} className={`doc-row${r.doc ? "" : " empty"}${r.status === "missing" ? " required" : ""}`}>
              <span className="doc-ico" aria-hidden="true">{meta.icon}</span>
              <div className="info">
                <div className="name">{meta.label}{r.doc?.provider && <span className="muted"> · {r.doc.provider}</span>}</div>
                <div className={`st ${r.status}`}>{docState(r)}{r.doc && <span className="muted"> ({fmtDate(r.doc.expires)})</span>}</div>
              </div>
              <div className="doc-actions">
                {r.doc ? (
                  <>
                    <button type="button" className="btn small" onClick={() => open("renew", { type: r.type })}>Reînnoiește →</button>
                    <button type="button" className="icon-btn" aria-label={`Șterge ${meta.label}`} title={`Șterge ${meta.label}`} onClick={() => remove(r.type)}>🗑</button>
                  </>
                ) : (
                  <button type="button" className={`btn small${r.required ? "" : " ghost"}`} onClick={() => open("doc", { preType: r.type })}>Adaugă</button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="hint">Reînnoirile apar automat în Istoric. La rovinietă și RCA, „Reînnoiește” îți arată prețul, copiază datele mașinii și ale firmei și deschide portalul oficial sau brokerul.</div>
    </>
  );
}

/* ---------- Istoric ---------- */
function eventDetails(e, unit) {
  const parts = [];
  if (e.kind === "odometer") return e.km != null ? [`${fmtKm(e.km)} km`] : [];
  if (e.liters) parts.push(`${fmtQty(e.liters)} ${unit}`);
  const ppl = e.kind === "fuel" ? pricePerLiter(e.cost, e.liters) : null;
  if (ppl) parts.push(`${fmtMoney(Math.round(ppl * 100) / 100)}/${unit}`);
  if (e.km) parts.push(`${fmtKm(e.km)} km`);
  if (e.note) parts.push(e.note);
  return parts;
}

function History({ v, open }) {
  const [limit, setLimit] = useState(HISTORY_PAGE);
  const page = historyPage(v, limit);
  const unit = v.fuel === "Electric" ? "kWh" : "L";
  if (!page.total)
    return (
      <div className="card empty-card">
        <div className="nodata">Încă nu există istoric — se construiește singur pe măsură ce înregistrezi alimentări, lucrări și documente.</div>
      </div>
    );
  return (
    <>
      {page.groups.map((g) => (
        <section key={g.key} className="tl-month" aria-label={g.label}>
          <h2 className="tl-month-head">
            <span>{g.label}</span>
            {g.total > 0 && <span className="tl-month-total">{fmtMoney(g.total)}</span>}
          </h2>
          <ul className="card tl">
            {g.items.map((e) => (
              <li key={e.id}>
                <button type="button" className="tl-item" onClick={() => open("event", { eid: e.id })}>
                  <span className={`tl-ico ${e.kind}`} aria-hidden="true">{eventIcon(e)}</span>
                  <span className="mid">
                    <span className="t">
                      {eventTitle(e)}
                      {e.hasPhoto && <span className="clip" title="Are poză atașată"> 📎<span className="sr-only"> (are poză)</span></span>}
                    </span>
                    <span className="s">{eventDetails(e, unit).join(" · ")}</span>
                  </span>
                  <span className="right">
                    {e.cost > 0 && <span className="cost">{fmtMoney(e.cost)}</span>}
                    <span className="date">{dateLabel(e.date)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {page.hidden > 0 && (
        <button type="button" className="btn ghost more" onClick={() => setLimit(limit + HISTORY_PAGE)}>
          Arată mai multe ({page.hidden} {page.hidden === 1 ? "rămasă" : "rămase"})
        </button>
      )}
    </>
  );
}
