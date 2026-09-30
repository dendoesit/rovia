import { useState } from "react";
import { garageView, GARAGE_SORTS, CATEGORIES, vehicleName, fmtKm } from "../lib/model";
import { nav } from "../lib/nav";

/* căutarea și filtrul rămân la întoarcerea din pagina unei mașini */
let lastView = { q: "", filter: "all", sort: "stare" };

function healthLine(r) {
  const parts = [];
  if (r.attention.length) parts.push(`${r.attention.length} necesită atenție`);
  if (r.missing.length === 1) parts.push(`lipsește ${r.missing[0].label}`);
  else if (r.missing.length) parts.push(`lipsesc ${r.missing.length} documente`);
  const text = parts.join(" · ") || "Totul e OK";
  return text[0].toUpperCase() + text.slice(1);
}
const dotClass = (r) => (r.attention.length ? r.status : r.missing.length ? "missing" : "ok");

function CarCard({ r }) {
  const { v } = r;
  const details = [v.km != null && `${fmtKm(v.km)} km`, v.year, CATEGORIES[v.category]].filter(Boolean).join(" · ");
  return (
    <a className="car-card" href={`#/car/${v.id}`}>
      <h3>{vehicleName(v)}</h3>
      <span className="sub">{details}</span>
      {v.driver && <span className="driver"><span aria-hidden="true">👤 </span>Șofer: {v.driver}</span>}
      <span className="foot">
        <span className="plate">{v.plate}</span>
        <span className="health-line"><span className={`dot ${dotClass(r)}`} aria-hidden="true"></span>{healthLine(r)}</span>
      </span>
    </a>
  );
}

export default function Garage({ vehicles, actions }) {
  const [view, setView] = useState(lastView);
  const update = (p) => { lastView = { ...view, ...p }; setView(lastView); };

  if (!vehicles.length)
    return (
      <div className="hero">
        <div className="big" aria-hidden="true">🚗</div>
        <h1>Bun venit la FleetDeck</h1>
        <p>Adaugă mașinile o singură dată — FleetDeck urmărește pentru tine ITP, RCA, rovinieta, service-ul și costurile.</p>
        <button type="button" className="btn" onClick={() => actions.openModal({ kind: "vehicle" })}>+ Adaugă prima mașină</button>
        <div className="hero-more">
          <button type="button" className="btn ghost" onClick={() => actions.openModal({ kind: "import" })}>📥 Importă toată flota din Excel</button>
        </div>
        <div className="hero-more">
          <button type="button" className="btn ghost small" onClick={actions.loadDemo}>sau încarcă o mașină demo</button>
        </div>
      </div>
    );

  const { rows, filters, filter } = garageView(vehicles, view);
  const filtering = !!view.q.trim() || filter !== "all";
  return (
    <>
      <div className="section-head garage-head">
        <h1 className="page-title">Garaj</h1>
        <span className="head-buttons">
          <button type="button" className="btn ghost small" onClick={() => actions.openModal({ kind: "import" })}>📥 Import Excel</button>
          <button type="button" className="btn small" onClick={() => nav("#/overview")}>📊 Dashboard flotă</button>
        </span>
      </div>

      <div className="garage-tools">
        <input type="search" className="search" value={view.q} onChange={(e) => update({ q: e.target.value })}
          placeholder="Caută număr, marcă, model sau șofer" aria-label="Caută în garaj" />
        <label className="sort">
          <span>Sortează</span>
          <select value={view.sort} onChange={(e) => update({ sort: e.target.value })}>
            {Object.entries(GARAGE_SORTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </div>
      <div className="chips filter-chips" role="group" aria-label="Filtrează mașinile">
        {filters.map((f) => (
          <button type="button" key={f.id} className={`chip${filter === f.id ? " on" : ""}`} aria-pressed={filter === f.id} onClick={() => update({ filter: f.id })}>
            {f.label} <span className="count">{f.count}</span>
          </button>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">{filtering ? `${rows.length} din ${vehicles.length} mașini afișate` : ""}</p>

      {rows.length ? (
        <div className="garage">
          {rows.map((r) => <CarCard key={r.v.id} r={r} />)}
          {!filtering && <button type="button" className="add-card" onClick={() => actions.openModal({ kind: "vehicle" })}>+ Adaugă mașină</button>}
        </div>
      ) : (
        <div className="card empty-card">
          <p className="nodata">Nicio mașină nu corespunde căutării.</p>
          <button type="button" className="btn ghost small" onClick={() => update({ q: "", filter: "all" })}>Arată toate mașinile</button>
        </div>
      )}
    </>
  );
}
