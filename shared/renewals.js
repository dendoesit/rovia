/* Reînnoire rovinietă / RCA fără contract de distribuție: preț orientativ, datele de copiat și linkul oficial.
   Tarife 12 luni (lei, cu TVA) după Ordinul MTI 888/2026, aplicabile din 1 octombrie 2026 în sistemul TollRO. */

export const VIGNETTE_PORTAL = "https://portal.etoll.ro/portal-extern/services";
export const TOLLRO_INFO = "https://portal.etoll.ro/";

export const EURO_CLASSES = {
  electric: "Electric",
  euro6: "Euro 6",
  euro5: "Euro 5",
  euro4: "Euro 4",
  euro3: "Euro 3 sau mai vechi",
};

export const VIGNETTE_CATEGORIES = {
  A: "A — autoturisme (max. 9 locuri)",
  B: "B — marfă până la 3,5 t",
  C: "C — 10–23 de locuri",
  D: "D — peste 23 de locuri",
  tollro: "Marfă peste 3,5 t — TollRO pe km",
  none: "Nu are nevoie de rovinietă",
};

const TARIFF_12M = {
  A: { electric: 228, euro6: 254, euro5: 292, euro4: 292, euro3: 330 },
  B: { electric: 521, euro6: 579, euro5: 665, euro4: 665, euro3: 752 },
};

/* euro din an, dacă nu e completat: Euro 6 obligatoriu la înmatriculări din sept. 2015, Euro 5 din 2011, Euro 4 din 2006 */
export function euroClassFor(v) {
  if (v.euroClass && EURO_CLASSES[v.euroClass]) return { value: v.euroClass, guessed: false };
  if (v.fuel === "Electric") return { value: "electric", guessed: false };
  const y = +v.year;
  if (!y) return null;
  return { value: y >= 2016 ? "euro6" : y >= 2011 ? "euro5" : y >= 2006 ? "euro4" : "euro3", guessed: true };
}

export function vignetteCategoryFor(v) {
  if (v.vignetteCategory && VIGNETTE_CATEGORIES[v.vignetteCategory]) return v.vignetteCategory;
  if (v.category === "remorca" || v.category === "moto") return "none";
  if (v.category === "camion") return "tollro";
  if (v.category === "utilitara") return "B";
  return "A";
}

export function vignetteQuote(v) {
  const category = vignetteCategoryFor(v);
  const euro = euroClassFor(v);
  const price = TARIFF_12M[category] && euro ? TARIFF_12M[category][euro.value] : null;
  return { category, euro: euro?.value ?? null, euroGuessed: !!euro?.guessed, price };
}

const clean = (s) => String(s ?? "").trim();

/* textul copiat în clipboard înainte de a deschide portalul / brokerul */
export function renewalClipboard(v, account, type) {
  const lines = [
    `Nr. înmatriculare: ${clean(v.plate)}`,
    v.vin && `VIN: ${clean(v.vin)}`,
    v.civ && `Serie CIV: ${clean(v.civ)}`,
    type === "rca" && [clean(v.make), clean(v.model), clean(v.year)].filter(Boolean).join(" "),
    type === "rca" && v.fuel && `Combustibil: ${v.fuel}`,
    account?.kind === "company" && account.company?.name && `Firmă: ${account.company.name}`,
    account?.kind === "company" && account.company?.cui && `CUI: ${account.company.cui}`,
    account?.kind === "company" && account.company?.regCom && `Reg. Com.: ${account.company.regCom}`,
    account?.kind === "company" && account.company?.address && `Adresă: ${account.company.address}`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function safeHttpsUrl(input) {
  try {
    const u = new URL(String(input || "").trim());
    return u.protocol === "https:" ? u.href : null;
  } catch { return null; }
}
