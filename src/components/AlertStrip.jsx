import { collectAlerts } from "../lib/model";
import { nav } from "../lib/nav";

const ICO = { warn: "⏳", orange: "⚠️", crit: "🔴", dead: "🚨" };

export default function AlertStrip({ vehicles }) {
  const alerts = collectAlerts(vehicles);
  if (!alerts.length) return null;
  return (
    <div className="alerts">
      {alerts.map((a, i) => (
        <div key={i} className={`alert ${a.st}`} onClick={() => nav(`#/car/${a.vid}/health`)}>
          <span>{ICO[a.st]}</span>
          <span><b>{a.car}</b> — {a.msg}</span>
        </div>
      ))}
    </div>
  );
}
