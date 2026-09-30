import "./charts.css";

export function StatTile({ icon, label, value, sub, onClick }) {
  const body = (
    <>
      <span className="tile-label">{icon && <span aria-hidden="true">{icon}</span>}{label}</span>
      <span className={`tile-value${value == null ? " none" : ""}`}>{value ?? "—"}</span>
      {sub && <span className="tile-sub">{sub}</span>}
    </>
  );
  return onClick
    ? <button type="button" className="tile clickable" onClick={onClick}>{body}</button>
    : <div className="tile">{body}</div>;
}

export function HeroFigure({ label, value, sub }) {
  return (
    <div className="hero-fig">
      <div className="hero-fig-label">{label}</div>
      <div className="hero-fig-value">{value}</div>
      {sub && <div className="hero-fig-sub">{sub}</div>}
    </div>
  );
}
