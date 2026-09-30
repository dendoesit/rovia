export const fold = (s) =>
  String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

const capitalize = (w) => (w ? w[0].toLocaleUpperCase("ro-RO") + w.slice(1).toLocaleLowerCase("ro-RO") : w);

export const titleCase = (s) =>
  clean(s).split(" ").map((w) => (/\d/.test(w) ? w.toUpperCase() : w.split("-").map(capitalize).join("-"))).join(" ");

/* „POPESCU ION" și „popescu ion" devin „Popescu Ion"; ce e deja scris cu grijă rămâne neatins */
export function smartCase(s) {
  const t = clean(s);
  return t === t.toLocaleUpperCase("ro-RO") || t === t.toLocaleLowerCase("ro-RO") ? titleCase(t) : t;
}

export const pad2 = (n) => String(n).padStart(2, "0");
export const roDate = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");
export const roMonth = (iso) => (iso ? `${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");
