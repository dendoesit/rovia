import { DOC_TYPES, MAINT_TYPES, DATE_RE, normalizePlate } from "../../shared/domain.js";
import { aiJson } from "./services.mjs";
import { fail } from "./http.mjs";

const KINDS = ["fuel", "maintenance", "expense", "document"];
const num = (x) => (x == null || x === "" || isNaN(+x) ? null : +x);
const text = (x, max = 200) => (x == null || x === "" ? null : String(x).slice(0, max));

const prompt = (plates) =>
  "Ești un contabil care citește facturi și bonuri auto din România (service, piese, anvelope, combustibil, spălătorie, parcare, RCA, CASCO, ITP, rovinietă). " +
  `Numerele de înmatriculare ale flotei sunt: ${plates.length ? plates.join(", ") : "necunoscute"}. ` +
  'Răspunde DOAR cu JSON: {"supplier": furnizorul, "invoiceNumber": seria și numărul, "date": data facturii "YYYY-MM-DD", ' +
  '"total": totalul de plată cu TVA (număr), "currency": "RON" sau "EUR", "plate": numărul mașinii din factură (de obicei în descriere sau la "auto"/"nr. înmatriculare"), alege unul din lista flotei dacă se potrivește, altfel null, ' +
  '"km": kilometrajul menționat sau null, "kind": "fuel" (combustibil), "maintenance" (service, reparații, piese, anvelope, baterie), "document" (RCA, CASCO, ITP, rovinietă) sau "expense" (orice altceva), ' +
  `"maintenanceType": unul din ${Object.keys(MAINT_TYPES).join(", ")} sau null, "docType": unul din ${Object.keys(DOC_TYPES).join(", ")} sau null, "docExpires": data de expirare a documentului "YYYY-MM-DD" sau null, ` +
  '"liters": litri de combustibil sau null, "summary": o descriere scurtă în română a ce s-a făcut / cumpărat (max 120 caractere)}. Pune null la ce nu e sigur.';

export async function extractInvoice(store, accountId, { file, plates } = {}) {
  if (typeof file !== "string" || !/^data:(application\/pdf|image\/(jpeg|png|webp));base64,/.test(file)) fail(400, "trimite un PDF sau o imagine");
  if (file.length > 5_500_000) fail(413, "fișierul e prea mare (max ~4 MB)");
  const known = (Array.isArray(plates) ? plates : []).map((p) => String(p).slice(0, 20)).slice(0, 300);
  const out = await aiJson(store, accountId, prompt(known), file);
  const kind = KINDS.includes(out.kind) ? out.kind : "expense";
  const plate = text(out.plate, 20);
  return {
    supplier: text(out.supplier, 120),
    invoiceNumber: text(out.invoiceNumber, 60),
    date: typeof out.date === "string" && DATE_RE.test(out.date) ? out.date : null,
    total: num(out.total),
    currency: out.currency === "EUR" ? "EUR" : out.currency === "RON" ? "RON" : null,
    plate,
    plateKey: plate ? normalizePlate(plate) : null,
    km: num(out.km),
    kind,
    maintenanceType: Object.hasOwn(MAINT_TYPES, out.maintenanceType) ? out.maintenanceType : kind === "maintenance" ? "repair" : null,
    docType: Object.hasOwn(DOC_TYPES, out.docType) ? out.docType : null,
    docExpires: typeof out.docExpires === "string" && DATE_RE.test(out.docExpires) ? out.docExpires : null,
    liters: num(out.liters),
    summary: text(out.summary, 160),
  };
}
