import { useState } from "react";
import { collectAlerts, alertSummary } from "../lib/model";
import { nav } from "../lib/nav";

const ICO = { warn: "⏳", orange: "⚠️", crit: "🔴", dead: "🚨" };
const COMPACT_FROM = 5;

function AlertItem({ a }) {
  return (
    <li>
      <button type="button" className={`alert ${a.st}`} onClick={() => nav(`#/car/${a.vid}/health`)}>
        <span aria-hidden="true">{ICO[a.st]}</span>
        <span><b>{a.car}</b> — {a.msg}</span>
      </button>
    </li>
  );
}

export default function AlertStrip({ vehicles }) {
  const [open, setOpen] = useState(false);
  const alerts = collectAlerts(vehicles);
  if (!alerts.length) return null;
  const compact = alerts.length >= COMPACT_FROM;
  const top = alerts[0].st;
  return (
    <section className="alerts" aria-label="Alerte">
      {compact && (
        <button type="button" className={`alert summary ${top}`} aria-expanded={open} aria-controls="alert-list" onClick={() => setOpen(!open)}>
          <span aria-hidden="true">{ICO[top]}</span>
          <span className="summary-text">
            <b>{alerts.length} alerte</b>
            {alertSummary(alerts).map((g) => <span key={g.text} className={`sum ${g.st}`}>{g.text}</span>)}
          </span>
          <span className="toggle">{open ? "Ascunde" : "Vezi toate"}</span>
        </button>
      )}
      <ul id="alert-list" className="alert-list" hidden={compact && !open}>
        {alerts.map((a) => <AlertItem key={`${a.vid}:${a.kind}:${a.type || ""}`} a={a} />)}
      </ul>
    </section>
  );
}
