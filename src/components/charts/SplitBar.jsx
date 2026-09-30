import { useState } from "react";
import Tooltip from "./Tooltip";
import { useWidth } from "./useWidth";
import { barPath } from "./scale";
import "./charts.css";

const GAP = 2, BAR_H = 14, SVG_H = 30;

/* o singură bară 100%: cât din total a mers pe fiecare categorie */
export default function SplitBar({ parts, format, label }) {
  const [ref, width] = useWidth(560);
  const [active, setActive] = useState(null);
  const visible = parts.filter((p) => p.value > 0);
  const total = visible.reduce((s, p) => s + p.value, 0);
  if (!total) return null;
  const avail = width - GAP * (visible.length - 1);
  let x = 0;
  const segs = visible.map((p) => {
    const w = (p.value / total) * avail;
    const seg = { ...p, x, w, pct: Math.round((p.value / total) * 100) };
    x += w + GAP;
    return seg;
  });
  const barY = (SVG_H - BAR_H) / 2;
  const current = active != null ? segs[active] : null;

  return (
    <div className="chart-plot split" ref={ref}>
      <svg viewBox={`0 0 ${width} ${SVG_H}`} width="100%" height={SVG_H} role="group" aria-label={label}>
        {segs.map((s, i) => (i === segs.length - 1
          ? <path key={s.key} d={barPath(s.x, barY, s.w, BAR_H)} fill={s.color} aria-hidden="true" />
          : <rect key={s.key} x={s.x} y={barY} width={s.w} height={BAR_H} fill={s.color} aria-hidden="true" />))}
        {segs.map((s, i) => (
          <rect
            key={s.key}
            className="hit"
            x={s.x - GAP / 2}
            y={0}
            width={s.w + GAP}
            height={SVG_H}
            tabIndex={0}
            role="img"
            aria-label={`${s.label}: ${format(s.value)} (${s.pct}%)`}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            onClick={() => setActive(i)}
          />
        ))}
      </svg>
      {current && <Tooltip x={current.x + current.w / 2} y={barY - 2} width={width} value={format(current.value)} label={`${current.label} · ${current.pct}%`} />}
    </div>
  );
}
