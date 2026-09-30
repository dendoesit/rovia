export function parseHash() {
  const h = location.hash;
  if (h.startsWith("#/costs") || h.startsWith("#/overview")) return { view: "overview" };
  const reset = h.match(/^#\/reset\/([A-Za-z0-9_-]+)/);
  if (reset) return { view: "reset", token: reset[1] };
  const confirm = h.match(/^#\/confirm\/([A-Za-z0-9_-]+)/);
  if (confirm) return { view: "confirm", token: confirm[1] };
  const m = h.match(/^#\/car\/([^/]+)(?:\/(\w+))?/);
  return m ? { view: "car", id: m[1], tab: m[2] || "health" } : { view: "garage" };
}
export function nav(h) {
  if (location.hash === h) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = h;
}
