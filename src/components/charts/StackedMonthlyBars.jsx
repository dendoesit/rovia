import { useState } from "react";
import Tooltip from "./Tooltip";
import { useWidth } from "./useWidth";
import { niceTicks, fmtTick, textWidth, columnPath } from "./scale";
import { GRID_COLOR } from "./series";
import "./charts.css";

const GAP = 2, TOP = 24, RIGHT = 6, FONT = 11;
const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);

/* coloane stivuite pe luni (sau ani); o singură serie = o singură culoare, fără legendă.
   Un `group` pe coloane (anul, la luni) apare sub prima etichetă și la fiecare schimbare. */
export default function StackedMonthlyBars({ buckets, series, format, label, plotHeight = 170 }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState(null);

  const { ticks, top } = niceTicks(Math.max(0, ...buckets.map((b) => b.total)));
  const tickText = ticks.map(fmtTick);
  const left = Math.ceil(Math.max(...tickText.map((t) => textWidth(t, FONT)))) + 10;
  const plotW = Math.max(40, width - left - RIGHT);
  const band = plotW / buckets.length;
  const barW = Math.min(24, Math.max(2, band * 0.64));
  const grouped = buckets.some((b) => b.group != null);
  const height = TOP + plotHeight + (grouped ? 34 : 22);
  const y = (val) => TOP + plotHeight - (val / top) * plotHeight;
  const labelEvery = Math.max(1, Math.ceil((Math.max(...buckets.map((b) => textWidth(b.label, FONT))) + 6) / band));

  const columns = buckets.map((b, i) => {
    const cx = left + band * i + band / 2;
    const segs = [];
    let acc = 0;
    for (const s of series) {
      const val = b.values[s.key] || 0;
      if (val <= 0) continue;
      const yTop = y(acc + val), yBottom = y(acc) - (segs.length ? GAP : 0);
      acc += val;
      if (yBottom - yTop >= 0.5) segs.push({ key: s.key, color: s.color, y: yTop, h: yBottom - yTop });
    }
    return { b, i, cx, x: cx - barW / 2, segs };
  });

  let peak = -1;
  buckets.forEach((b, i) => { if (b.total > 0 && (peak < 0 || b.total > buckets[peak].total)) peak = i; });
  const peakText = peak >= 0 ? format(buckets[peak].total) : "";
  const peakHalf = textWidth(peakText, 12) / 2;

  let lastGroup = null;
  const xLabels = columns.filter((c) => c.i % labelEvery === 0).map((c) => {
    const showGroup = grouped && c.b.group !== lastGroup;
    lastGroup = c.b.group;
    return { c, showGroup };
  });

  const breakdown = (b) => (series.length > 1
    ? series.filter((s) => b.values[s.key] > 0).map((s) => ({ label: s.label, value: format(b.values[s.key]), color: s.color }))
    : []);
  const describe = (b) => {
    const parts = breakdown(b).map((r) => `${r.label} ${r.value}`);
    return `${b.long}: ${format(b.total)}${parts.length ? ` — ${parts.join(", ")}` : ""}`;
  };
  const current = active != null ? columns[active] : null;

  return (
    <div className="chart-plot" ref={ref}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="group" aria-label={label}>
        {ticks.map((t, k) => {
          const ty = Math.round(y(t)) + 0.5;
          return (
            <g key={t} aria-hidden="true">
              <line x1={left} x2={width - RIGHT} y1={ty} y2={ty} stroke={GRID_COLOR} strokeWidth={1} />
              <text x={left - 6} y={ty} className="axis-tick" textAnchor="end" dominantBaseline="middle">{tickText[k]}</text>
            </g>
          );
        })}
        {current && <rect x={left + band * current.i} y={TOP - 8} width={band} height={plotHeight + 8} rx={6} className="col-wash" aria-hidden="true" />}
        {columns.map((c) => (
          <g key={c.b.key} aria-hidden="true">
            {c.segs.map((s, k) => (k === c.segs.length - 1
              ? <path key={s.key} d={columnPath(c.x, s.y, barW, s.h)} fill={s.color} />
              : <rect key={s.key} x={c.x} y={s.y} width={barW} height={s.h} fill={s.color} />))}
          </g>
        ))}
        {peak >= 0 && active !== peak && (
          <text x={clamp(columns[peak].cx, left + peakHalf, width - RIGHT - peakHalf)} y={y(buckets[peak].total) - 7} className="bar-label" textAnchor="middle" aria-hidden="true">
            {peakText}
          </text>
        )}
        {xLabels.map(({ c, showGroup }) => (
          <text key={c.b.key} x={c.cx} y={TOP + plotHeight + 15} className="axis-tick" textAnchor="middle" aria-hidden="true">
            {c.b.label}
            {showGroup && <tspan x={c.cx} dy={13}>{c.b.group}</tspan>}
          </text>
        ))}
        {columns.map((c) => (
          <rect
            key={c.b.key}
            className="hit"
            x={left + band * c.i}
            y={0}
            width={band}
            height={height}
            tabIndex={0}
            role="img"
            aria-label={describe(c.b)}
            onMouseEnter={() => setActive(c.i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(c.i)}
            onBlur={() => setActive(null)}
            onClick={() => setActive(c.i)}
          />
        ))}
      </svg>
      {current && (
        <Tooltip
          x={current.cx}
          y={y(current.b.total) - 6}
          width={width}
          value={format(current.b.total)}
          label={current.b.long}
          rows={breakdown(current.b)}
        />
      )}
    </div>
  );
}
