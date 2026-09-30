import { useId, useState } from "react";
import Legend from "./Legend";
import "./charts.css";

export function ChartTable({ caption, columns, rows }) {
  return (
    <div className="chart-table-wrap">
      <table className="chart-table">
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>{columns.map((c) => <th key={c.key} scope="col" className={c.num ? "num" : undefined}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i}>
              {columns.map((c) => <td key={c.key} className={c.num ? "num" : undefined}>{r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* card de grafic cu titlu, legendă și comutatorul „Vezi ca tabel” */
export default function ChartCard({ title, sub, lead, legend, table, empty, footer, className = "", children }) {
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  const showTable = asTable && !empty && table;
  return (
    <section className={`chart-card ${className}`} aria-labelledby={title ? id : undefined}>
      <div className="chart-head">
        <div className="chart-titles">
          {lead}
          {title && <h3 id={id}>{title}</h3>}
          {sub && <p className="chart-sub">{sub}</p>}
        </div>
        {!empty && table && (
          <button type="button" className="chart-toggle" onClick={() => setAsTable((t) => !t)}>
            {asTable ? "Vezi graficul" : "Vezi ca tabel"}
          </button>
        )}
      </div>
      {empty
        ? <p className="chart-empty">{empty}</p>
        : showTable
          ? <ChartTable caption={title} {...table} />
          : <>{legend && <Legend items={legend} />}{children}</>}
      {footer && <p className="chart-foot">{footer}</p>}
    </section>
  );
}
