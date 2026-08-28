export function parseHash() {
  if (location.hash.startsWith("#/costs")) return { view: "costs" };
  const m = location.hash.match(/^#\/car\/([^/]+)(?:\/(\w+))?/);
  return m ? { view: "car", id: m[1], tab: m[2] || "health" } : { view: "garage" };
}
export function nav(h) {
  if (location.hash === h) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = h;
}
