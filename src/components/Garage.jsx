import { attentionItems, vehicleWorst, fmtKm } from "../lib/model";
import { nav } from "../lib/nav";

export default function Garage({ vehicles, actions }) {
  if (!vehicles.length)
    return (
      <div className="hero">
        <div className="big">🚗</div>
        <h2>Bun venit la FleetDeck</h2>
        <p>Adaugă mașinile o singură dată — FleetDeck urmărește pentru tine ITP, RCA, rovinieta, service-ul și costurile.</p>
        <button className="btn" onClick={() => actions.openModal({ kind: "vehicle" })}>+ Adaugă prima mașină</button>
        <div style={{ marginTop: 12 }}>
          <button className="btn ghost small" onClick={actions.loadDemo}>sau încarcă o mașină demo</button>
        </div>
      </div>
    );

  return (
    <>
      <div className="page-title">Garaj</div>
      <div className="garage">
        {vehicles.map((v) => {
          const att = attentionItems(v);
          const w = vehicleWorst(v);
          return (
            <div key={v.id} className="car-card" onClick={() => nav(`#/car/${v.id}`)}>
              <h3>{v.make} {v.model}</h3>
              <div className="sub">{fmtKm(v.km)} km{v.year ? ` · ${v.year}` : ""}</div>
              <div className="foot">
                <span className="plate">{v.plate}</span>
                <span className="health-line">
                  <span className={`dot ${att.length ? w : "ok"}`}></span>
                  {att.length ? `${att.length} necesită atenție` : "Totul e OK"}
                </span>
              </div>
            </div>
          );
        })}
        <button className="add-card" onClick={() => actions.openModal({ kind: "vehicle" })}>+ Adaugă mașină</button>
      </div>
    </>
  );
}
