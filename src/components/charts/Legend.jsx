import "./charts.css";

export default function Legend({ items }) {
  if (!items || items.length < 2) return null;
  return (
    <ul className="chart-legend">
      {items.map((it) => (
        <li key={it.label}>
          <i className={`chart-key ${it.shape || "rect"}`} style={{ background: it.color }} aria-hidden="true" />
          <span>{it.label}</span>
          {it.value != null && <b>{it.value}</b>}
        </li>
      ))}
    </ul>
  );
}
