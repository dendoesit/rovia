import { DOC_TYPES } from "../../../shared/domain.js";
import { fold, clean } from "./text.js";
import { findDates, looksLikePlate, cleanVin, validVin } from "./cells.js";

/* fiecare câmp: etichetă în interfață + combinații de cuvinte din antet (toate trebuie să apară) */
export const FIELDS = {
  name:            { group: "Mașină", label: "Mașină (marcă, model / șofer)", match: [["masin"], ["auto"], ["autovehicul"], ["vehicul"], ["autoturism"], ["denumire"], ["vehicle"], ["car"], ["marca", "model"]] },
  make:            { group: "Mașină", label: "Marcă", match: [["marca"], ["marca", "auto"], ["marca", "masin"], ["brand"], ["make"], ["producator"]] },
  model:           { group: "Mașină", label: "Model", match: [["model"], ["model", "auto"], ["model", "masin"]] },
  plate:           { group: "Mașină", label: "Nr. înmatriculare", match: [["inmatr"], ["nr", "inm"], ["nr", "masin"], ["nr", "auto"], ["numar"], ["numar", "masin"], ["numar", "auto"], ["plate"], ["plates"], ["registration"], ["license"], ["matricol"]] },
  km:              { group: "Mașină", label: "Kilometraj", match: [["km"], ["kilometr"], ["odometr"], ["rulaj"], ["mileage"]] },
  year:            { group: "Mașină", label: "An fabricație", match: [["an"], ["anul"], ["fabricat"], ["an", "fabric"], ["year"]] },
  fuel:            { group: "Mașină", label: "Combustibil", match: [["combust"], ["carburant"], ["fuel"]] },
  category:        { group: "Mașină", label: "Categorie", match: [["categor"], ["tip", "vehicul"], ["tip", "auto"], ["category"]] },
  driver:          { group: "Mașină", label: "Șofer", match: [["sofer"], ["utilizator"], ["conducator"], ["conducator", "auto"], ["driver"], ["persoan"], ["angajat"], ["responsabil"], ["user"]] },
  vin:             { group: "Mașină", label: "VIN / serie șasiu", match: [["vin"], ["sasiu"], ["serie", "caroser"], ["serie", "sasiu"], ["chassis"], ["identificare"]] },
  notes:           { group: "Mașină", label: "Observații", match: [["observat"], ["obs"], ["mentiun"], ["nota"], ["note"], ["notes"], ["coment"], ["detalii"], ["remarks"]] },
  rca:             { group: "Documente", label: "RCA expiră", match: [["rca"], ["asigurare", "obligator"], ["mtpl"]] },
  casco:           { group: "Documente", label: "CASCO expiră", match: [["casco"]] },
  itp:             { group: "Documente", label: "ITP expiră", match: [["itp"], ["inspect"], ["reviz", "tehnic"]] },
  rovinieta:       { group: "Documente", label: "Rovinietă expiră", match: [["rovinie"], ["vignet"], ["vigneta"]] },
  warranty:        { group: "Documente", label: "Garanție expiră", match: [["garant"], ["warranty"]] },
  leasing:         { group: "Documente", label: "Leasing expiră", match: [["leasing"]] },
  service:         { group: "Service", label: "Revizii (text liber)", match: [["reviz"], ["service"], ["schimb", "ulei"], ["ulei"], ["mentenant"]] },
  serviceDate:     { group: "Service", label: "Ultima revizie (data)", match: [["reviz", "data"], ["service", "data"], ["ulei", "data"]] },
  serviceKm:       { group: "Service", label: "Ultima revizie (km)", match: [["reviz", "km"], ["reviz", "kilometr"], ["service", "km"], ["ulei", "km"]] },
  nextServiceKm:   { group: "Service", label: "Următoarea revizie (km)", match: [["urmat", "reviz", "km"], ["urmat", "reviz", "kilometr"], ["urmat", "reviz"], ["reviz", "urmat"], ["next", "service"], ["next", "service", "km"], ["reviz", "scadent"], ["scadent", "km"]] },
  nextServiceDate: { group: "Service", label: "Următoarea revizie (data)", match: [["urmat", "reviz", "data"], ["reviz", "urmat", "data"], ["next", "service", "date"], ["scadent", "data"]] },
  distributie:     { group: "Service", label: "Distribuție", match: [["distribut"], ["kit", "distrib"], ["curea"], ["timing"]] },
  ambreiaj:        { group: "Service", label: "Ambreiaj", match: [["ambreiaj"], ["clutch"]] },
  brakes:          { group: "Service", label: "Frâne", match: [["fran"], ["placut"], ["brake"], ["brakes"]] },
  battery:         { group: "Service", label: "Baterie", match: [["bateri"], ["acumulator"], ["battery"]] },
  tyres:           { group: "Anvelope", label: "Anvelope (text liber)", match: [["anvelop"], ["cauciuc"], ["pneu"], ["tyre"], ["tyres"], ["tire"], ["tires"]] },
  tyresSummer:     { group: "Anvelope", label: "Anvelope de vară", match: [["anvelop", "vara"], ["cauciuc", "vara"], ["summer"]] },
  tyresWinter:     { group: "Anvelope", label: "Anvelope de iarnă", match: [["anvelop", "iarna"], ["cauciuc", "iarna"], ["winter"]] },
  tyresState:      { group: "Anvelope", label: "Stare anvelope", match: [["stare", "anvelop"], ["stare", "cauciuc"]] },
  tyresNote:       { group: "Anvelope", label: "Notă anvelope", match: [["nota", "anvelop"], ["anvelop", "nota"], ["anvelop", "detalii"]] },
  euroClass:       { group: "Mașină", label: "Clasa Euro", match: [["euro"], ["clasa", "euro"], ["norma", "euro"], ["norma", "poluare"], ["poluare"]] },
  vignetteCategory:{ group: "Mașină", label: "Categorie rovinietă", match: [["categor", "rovinie"], ["categor", "vignet"], ["rovinie", "categor"], ["vignet", "categor"]] },
  civ:             { group: "Mașină", label: "Serie CIV", match: [["civ"], ["serie", "civ"], ["carte", "identitate"]] },
  firstRegistration: { group: "Mașină", label: "Data primei înmatriculări", match: [["data", "inmatr"], ["prima", "inmatr"], ["data", "prima", "inmatr"], ["first", "registration"], ["registration", "date"]] },
};

/* „RCA furnizor", „Asigurator CASCO": aceleași cuvinte ca documentul + un cuvânt de firmă */
const PROVIDER_WORDS = ["furniz", "provider", "asigurator", "companie", "firma"];
export const PROVIDER_FIELDS = Object.fromEntries(Object.keys(DOC_TYPES).map((t) => [t, `${t}Provider`]));
for (const [type, field] of Object.entries(PROVIDER_FIELDS)) {
  FIELDS[field] = {
    group: "Documente", label: `${DOC_TYPES[type].label} furnizor`,
    match: FIELDS[type].match.flatMap((alt) => PROVIDER_WORDS.map((w) => [...alt, w])),
  };
}
const IGNORED = [["nr", "crt"], ["crt"], ["nr", "ord"], ["pozitie"], ["index"], ["telefon"], ["tel"], ["phone"], ["email"], ["mail"]];

export const headerTokens = (text) =>
  fold(text).replace(/([a-z])-\s*(?:\/\s*)?([a-z])/g, "$1$2").split(/[^a-z0-9]+/).filter(Boolean);

const tokenHit = (tokens, syn) => tokens.some((t) => t === syn || (syn.length >= 4 && t.startsWith(syn)));
const altScore = (tokens, alts) => Math.max(0, ...alts.filter((alt) => alt.every((s) => tokenHit(tokens, s))).map((alt) => alt.length));

function bestMatch(text, fields) {
  const tokens = headerTokens(text);
  if (!tokens.length) return { field: null, score: 0 };
  let best = null, bestScore = altScore(tokens, IGNORED);
  const ignored = bestScore > 0;
  for (const [key, f] of Object.entries(fields)) {
    const s = altScore(tokens, f.match);
    if (s > bestScore) { best = key; bestScore = s; }
  }
  return { field: best || (ignored ? false : null), score: best ? bestScore : 0 };
}

/* antet → câmp; câștigă combinația cea mai specifică („Nr. mașină" e număr, nu mașină) */
export const matchHeader = (text, fields = FIELDS) => bestMatch(text, fields).field;

const looksLikeData = (v) => typeof v === "number" || looksLikePlate(v) || findDates(v).some((d) => !d.invalid && d.precision !== "year");

function rowFields(cells, fields) {
  const found = new Set();
  for (const c of cells) { const f = matchHeader(c, fields); if (f) found.add(f); }
  return found;
}

/* antet pe două rânduri: „Anvelope" deasupra lui „vară" / „iarnă" */
function combine(top, sub) {
  let carry = "";
  return Array.from({ length: Math.max(top.length, sub.length) }, (_, i) => {
    const t = clean(top[i]), s = clean(sub[i]);
    if (t) carry = t;
    return clean(`${t || (s ? carry : "")} ${s}`);
  });
}

/* „Responsabil: Ion" deasupra antetului e o informație, nu un grup de coloane */
const groupLabel = (c) => { const t = clean(c); return /:\s*\S/.test(t) ? "" : t; };

/* un titlu singur („Evidență revizii") stă deasupra primei coloane recunoscute sau mai la stânga;
   „Ultima revizie" deasupra lui Data / Km, mai la dreapta, e grup de coloane */
function looksLikeGroups(top, row, fields) {
  const labels = top.map((c, i) => [groupLabel(c), i]).filter(([t]) => t);
  if (!labels.length || top.some(looksLikeData)) return false;
  return labels.length > 1 || labels[0][1] > Math.max(0, row.findIndex((c) => matchHeader(c, fields)));
}

/* grupul se păstrează doar pe coloanele unde spune ceva în plus: „Km" sub „Ultima revizie" e km-ul reviziei */
function withGroups(top, row, fields) {
  let group = "";
  return row.map((c, i) => {
    if (clean(top[i])) group = groupLabel(top[i]);
    const own = clean(c), merged = clean(`${group} ${own}`), grouped = bestMatch(merged, fields);
    return own && grouped.field && grouped.score > bestMatch(own, fields).score ? merged : own;
  });
}

export function detectHeader(rows, fields = FIELDS) {
  let best = { index: -1, score: 1 };
  rows.slice(0, 25).forEach((cells, index) => {
    const dataCells = cells.filter(looksLikeData).length;
    const score = rowFields(cells, fields).size - dataCells;
    if (score > best.score) best = { index, score };
  });
  if (best.index < 0) return { index: -1, headers: [], depth: 0 };
  const row = rows[best.index], top = rows[best.index - 1] || [];
  const headers = looksLikeGroups(top, row, fields) ? withGroups(top, row, fields) : row.map((c) => clean(c));
  const sub = rows[best.index + 1] || [];
  if (sub.some((c) => clean(c)) && !sub.some(looksLikeData)) {
    const merged = combine(headers, sub);
    if (rowFields(merged, fields).size > rowFields(headers, fields).size) return { index: best.index, headers: merged, depth: 2 };
  }
  return { index: best.index, headers, depth: 1 };
}

const PLATE_SHARE = 0.6;
function guessByValues(values) {
  const filled = values.filter((v) => clean(v));
  if (filled.length < 2) return null;
  const share = (fn) => filled.filter(fn).length / filled.length;
  if (share(looksLikePlate) >= PLATE_SHARE) return "plate";
  if (share((v) => validVin(cleanVin(v))) >= PLATE_SHARE) return "vin";
  return null;
}

/* coloanele unei foi: antetul găsit + câmpul propus pentru fiecare (utilizatorul îl poate schimba) */
export function autoColumns(rows, header = detectHeader(rows)) {
  const body = rows.slice(header.index + (header.depth || 1));
  const width = Math.max(header.headers.length, ...body.slice(0, 200).map((r) => r.length), 0);
  const columns = Array.from({ length: width }, (_, i) => {
    const title = header.headers[i] || "";
    const field = matchHeader(title);
    const sample = body.map((r) => r[i]).find((v) => clean(v)) ?? "";
    return { index: i, header: title, field: field || null, ignored: field === false, sample: clean(sample) };
  });
  const used = new Set(columns.map((c) => c.field).filter(Boolean));
  for (const c of columns) {
    if (c.field || c.ignored) continue;
    const guess = guessByValues(body.slice(0, 40).map((r) => r[c.index]));
    if (guess && !used.has(guess)) { c.field = guess; c.guessed = true; used.add(guess); }
  }
  return columns.filter((c) => c.header || c.sample);
}
