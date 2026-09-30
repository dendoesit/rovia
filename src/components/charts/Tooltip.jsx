import "./charts.css";

/* valoarea întâi, apoi eticheta; tot conținutul intră ca text React */
export default function Tooltip({ x, y, width, value, label, rows = [], place = "above" }) {
  const align = x < width * 0.3 ? "start" : x > width * 0.7 ? "end" : "center";
  return (
    <div className={`chart-tip ${align} ${place}`} style={{ left: x, top: y }} aria-hidden="true">
      <strong>{value}</strong>
      {label && <span className="chart-tip-label">{label}</span>}
      {rows.map((r) => (
        <span key={r.label} className="chart-tip-row">
          {r.color && <i style={{ background: r.color }} />}
          <b>{r.value}</b> {r.label}
        </span>
      ))}
    </div>
  );
}
