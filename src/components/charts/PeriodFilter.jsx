import { useState } from "react";
import { PERIODS } from "../../lib/analytics.js";
import "./charts.css";

const KEY = "fleetdeck-period";
const readStored = () => {
  try {
    const id = localStorage.getItem(KEY);
    return PERIODS.some((p) => p.id === id) ? id : "year";
  } catch {
    return "year";
  }
};

/* perioada aleasă rămâne aceeași între dashboard și pagina mașinii */
export function usePeriod() {
  const [period, setPeriod] = useState(readStored);
  const choose = (id) => {
    setPeriod(id);
    try { localStorage.setItem(KEY, id); } catch { /* fără stocare: rămâne doar în pagină */ }
  };
  return [period, choose];
}

export default function PeriodFilter({ value, onChange, caption }) {
  return (
    <div className="filter-row">
      <div className="period-seg" role="group" aria-label="Perioadă">
        {PERIODS.map((p) => (
          <button key={p.id} type="button" aria-pressed={value === p.id} className={value === p.id ? "on" : ""} onClick={() => onChange(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      {caption && <span className="filter-caption">{caption}</span>}
    </div>
  );
}
