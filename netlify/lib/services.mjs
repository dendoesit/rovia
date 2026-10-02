import { DOC_TYPES, DATE_RE } from "../../shared/domain.js";
import { fail } from "./http.mjs";
import { consume } from "./limits.mjs";

const AI_DAILY_LIMIT = 60;
const AI_GLOBAL_DAILY_LIMIT = 500;
const AI_TIMEOUT_MS = 25_000;

async function spendAiQuota(store, accountId) {
  const day = new Date().toISOString().slice(0, 10);
  await consume(store, `usage:ai:${accountId}:${day}`, { limit: AI_DAILY_LIMIT, windowMs: 86_400_000, message: () => `ai atins limita zilnică de ${AI_DAILY_LIMIT} citiri AI — revino mâine` });
  await consume(store, `usage:ai:all:${day}`, { limit: AI_GLOBAL_DAILY_LIMIT, windowMs: 86_400_000, message: () => "citirea AI a atins limita zilnică a aplicației — revino mâine" });
}

export const aiConfigured = () => !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);

/* răspuns JSON de la Gemini (gratuit) sau OpenAI; imaginea e opțională */
export async function aiJson(store, accountId, prompt, image) {
  const gKey = process.env.GEMINI_API_KEY;
  const oKey = process.env.OPENAI_API_KEY;
  if (!gKey && !oKey) fail(501, "citirea AI nu e configurată — setează GEMINI_API_KEY (gratuit, aistudio.google.com) în Netlify");
  await spendAiQuota(store, accountId);
  const img = image ? image.match(/^data:((?:image\/[a-z+]+)|application\/pdf);base64,(.+)$/) : null;
  if (image && !img) fail(400, "trimite fișierul ca data URL (PDF sau imagine)");
  const isPdf = img?.[1] === "application/pdf";
  let raw;
  try {
    if (gKey) {
      const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
        headers: { "Content-Type": "application/json", "x-goog-api-key": gKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, ...(img ? [{ inline_data: { mime_type: img[1], data: img[2] } }] : [])] }],
          generationConfig: { response_mime_type: "application/json", maxOutputTokens: 8192 },
        }),
      });
      if (!r.ok) {
        const detail = await r.json().catch(() => null);
        console.error("gemini", model, r.status, detail?.error?.message);
        fail(502, `Gemini a răspuns cu eroare (${r.status}${detail?.error?.message ? ": " + String(detail.error.message).slice(0, 160) : ""})`);
      }
      raw = (await r.json()).candidates?.[0]?.content?.parts?.[0]?.text;
    } else {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${oKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          response_format: { type: "json_object" },
          max_tokens: 4096,
          messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...(img ? [isPdf ? { type: "file", file: { filename: "factura.pdf", file_data: image } } : { type: "image_url", image_url: { url: image } }] : [])] }],
        }),
      });
      if (!r.ok) fail(502, `serviciul AI a răspuns cu eroare (${r.status})`);
      raw = (await r.json()).choices?.[0]?.message?.content;
    }
  } catch (e) {
    if (e.status) throw e;
    fail(504, "serviciul AI nu a răspuns la timp — încearcă din nou");
  }
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

const SCAN_PROMPT =
  'Ești un extractor de date din documente auto românești (RCA, poliță CASCO, certificat ITP, rovinietă, garanție, contract leasing). ' +
  'Răspunde DOAR cu un obiect JSON: {"type": una dintre "itp","rca","rovinieta","casco","warranty","leasing" sau null, ' +
  '"expires": data de EXPIRARE în format "YYYY-MM-DD" sau null, "provider": asigurătorul/emitentul sau null, ' +
  '"cost": prețul plătit ca număr (în moneda de pe document) sau null, "currency": "RON" sau "EUR" sau null, ' +
  '"plate": numărul de înmatriculare sau null}. Pune null la câmpurile nesigure.';

export async function scanDocument(store, accountId, image) {
  if (typeof image !== "string" || image.length > 2_000_000) fail(413, "imaginea este prea mare");
  const out = await aiJson(store, accountId, SCAN_PROMPT, image);
  return {
    type: Object.hasOwn(DOC_TYPES, out.type) ? out.type : null,
    expires: typeof out.expires === "string" && DATE_RE.test(out.expires) ? out.expires : null,
    provider: out.provider ? String(out.provider).slice(0, 120) : null,
    cost: out.cost != null && !isNaN(+out.cost) ? +out.cost : null,
    currency: out.currency === "RON" || out.currency === "EUR" ? out.currency : null,
    plate: out.plate ? String(out.plate).slice(0, 20) : null,
  };
}

/* datele firmei după CUI, din serviciul public ANAF (fără cheie) */
export async function lookupCompany(cuiInput) {
  const cui = String(cuiInput || "").toUpperCase().replace(/^RO/, "").replace(/\D/g, "");
  if (cui.length < 2 || cui.length > 10) fail(400, "CUI invalid");
  let r;
  try {
    r = await fetch("https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva", {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ cui: +cui, data: new Date().toISOString().slice(0, 10) }]),
    });
  } catch { fail(504, "ANAF nu răspunde momentan — completează datele manual"); }
  if (!r.ok) fail(502, `ANAF a răspuns cu eroare (${r.status})`);
  const found = (await r.json()).found?.[0];
  if (!found) fail(404, "nu am găsit nicio firmă cu acest CUI");
  const g = found.date_generale || {};
  return {
    cui,
    name: g.denumire || null,
    address: g.adresa || null,
    regCom: g.nrRegCom || null,
    vatPayer: !!found.inregistrare_scop_Tva?.scpTVA,
    eInvoice: !!g.statusRO_e_Factura,
    county: found.adresa_sediu_social?.sdenumire_Judet || null,
  };
}
