export function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/* praguri rotunde pe axa Y, pornind mereu de la 0 */
export function niceTicks(max, count = 4) {
  if (!(max > 0)) return { ticks: [0, 1], top: 1 };
  const step = Math.max(1, niceStep(max / count));
  const top = Math.ceil(max / step - 1e-9) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => +(i * step).toFixed(6));
  return { ticks, top };
}

export const fmtTick = (n) => (+n).toLocaleString("ro-RO", { maximumFractionDigits: 1 });

export const textWidth = (s, size = 11) => String(s).length * size * 0.6;

/* bară cu capătul de date rotunjit și baza dreaptă */
export function columnPath(x, y, w, h, r = 4) {
  const k = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h}V${y + k}A${k},${k} 0 0 1 ${x + k},${y}H${x + w - k}A${k},${k} 0 0 1 ${x + w},${y + k}V${y + h}Z`;
}
export function barPath(x, y, w, h, r = 4) {
  const k = Math.max(0, Math.min(r, h / 2, w));
  return `M${x},${y}H${x + w - k}A${k},${k} 0 0 1 ${x + w},${y + k}V${y + h - k}A${k},${k} 0 0 1 ${x + w - k},${y + h}H${x}Z`;
}
