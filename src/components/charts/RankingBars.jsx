import { useState } from "react";
import Tooltip from "./Tooltip";
import { useWidth } from "./useWidth";
import { textWidth, barPath } from "./scale";
import { SINGLE_COLOR, REF_COLOR } from "./series";
import "./charts.css";

const ROW_PAD = 12, BAR_H = 14, SVG_H = 22;

/* clasament orizontal: rândul întreg e ținta de hover/click, valoarea stă la capătul barei */
export default function RankingBars({ rows, format = String, onSelect, label }) {
  const [ref, width] = useWidth(560);
  const [active, setActive] = useState(null);
  const inner = Math.max(120, width - ROW_PAD * 2);
  const texts = rows.map((r) => r.valueText ?? format(r.value));
  const valueRoom = Math.max(...texts.map((t) => textWidth(t, 12))) + 12;
  const max = Math.max(1e-9, ...rows.map((r) => Math.max(r.value || 0, r.ref || 0)));
  const scale = (v) => (Math.max(0, v) / max) * Math.max(20, inner - valueRoom);
  const Row = onSelect ? "button" : "div";

  return (
    <ol className="rank" ref={ref} aria-label={label}>
      {rows.map((r, i) => {
        const w = r.value > 0 ? Math.max(2, scale(r.value)) : 0;
        const refX = r.ref ? scale(r.ref) : null;
        const tipX = Math.max(w, refX ?? 0);
        return (
          <li key={r.id} className="rank-item">
            <Row
              type={onSelect ? "button" : undefined}
              tabIndex={onSelect ? undefined : 0}
              className="rank-row"
              style={{ paddingInline: ROW_PAD }}
              onClick={onSelect ? () => onSelect(r) : undefined}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            >
              <span className="rank-top">
                <span className="rank-name">{r.label}</span>
                {r.meta && <span className="plate">{r.meta}</span>}
              </span>
              {r.sub && <span className="rank-sub">{r.sub}</span>}
              <svg className="rank-bar" viewBox={`0 0 ${inner} ${SVG_H}`} width="100%" height={SVG_H} aria-hidden="true">
                {w > 0 && <path d={barPath(0, (SVG_H - BAR_H) / 2, w, BAR_H)} fill={SINGLE_COLOR} />}
                {refX != null && <line x1={refX} x2={refX} y1={1} y2={SVG_H - 1} stroke={REF_COLOR} strokeWidth={2} strokeLinecap="round" />}
                <text x={tipX + 6} y={SVG_H / 2} dominantBaseline="central" className="bar-value">{texts[i]}</text>
              </svg>
              <span className="sr-only">{texts[i]}</span>
            </Row>
            {active === i && (
              <Tooltip x={ROW_PAD + tipX} y={4} width={width} value={texts[i]} label={r.meta ? `${r.label} · ${r.meta}` : r.label} rows={r.tip} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
