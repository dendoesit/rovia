import { fold, clean, smartCase, titleCase } from "./text.js";
import { findPlate, fuelHint } from "./cells.js";

const BRANDS = {
  Dacia: [], Volkswagen: ["vw", "volkswagen", "volkswagon", "wv"], Toyota: [], Skoda: [], Ford: [], Renault: [],
  Mercedes: ["mercedes", "mercedes-benz", "mercedes benz", "mb", "merc"], BMW: [], Audi: [], Hyundai: [], Kia: [],
  Opel: [], Peugeot: [], "Citroën": ["citroen"], Fiat: [], Iveco: [], Nissan: [], Seat: [], Cupra: [], Volvo: [],
  Mazda: [], Honda: [], Suzuki: [], Mitsubishi: [], Tesla: [], Porsche: [], Jeep: [], "Land Rover": ["land rover", "landrover", "range rover"],
  MAN: [], DAF: [], Scania: [], Isuzu: [], Lexus: [], Mini: [], Smart: [], Chevrolet: [], Jaguar: [], Subaru: [],
  "Alfa Romeo": ["alfa romeo", "alfa"], Lancia: [], DS: [], MG: [], BYD: [], Dodge: [], SsangYong: ["ssangyong", "ssang yong"], Lada: [], ARO: [],
};

/* sufixe: u = utilitară, c = camion, e = electric, h = hibrid; „_" ține loc de spațiu */
const MODELS = {
  Dacia: "Logan Sandero Duster Dokker:u Spring:e Jogger Lodgy Bigster Solenza Nova",
  Volkswagen: "Golf Passat Polo Tiguan Caddy:u Transporter:u Crafter:u T-Roc T-Cross Touareg Touran Sharan Arteon Amarok Jetta Up Multivan:u Caravelle:u ID.3:e ID.4:e ID.5:e ID.Buzz:e",
  Toyota: "Yaris Corolla RAV4 Hilux Proace:u C-HR Auris Avensis Camry Aygo Land_Cruiser Prius:h",
  Skoda: "Octavia Fabia Superb Kodiaq Karoq Kamiq Scala Rapid Yeti Enyaq:e Roomster",
  Ford: "Focus Transit:u Transit_Custom:u Ranger Fiesta Mondeo Kuga Puma Tourneo EcoSport Galaxy S-Max",
  Renault: "Clio Megane Master:u Kangoo:u Trafic:u Captur Kadjar Laguna Talisman Scenic Arkana Austral Zoe:e Symbol Fluence",
  Mercedes: "Sprinter:u Vito:u Citan:u Viano:u Actros:c Atego:c Axor:c GLA GLB GLC GLE GLS CLA CLS",
  Hyundai: "i10 i20 i30 Tucson Santa_Fe Kona Elantra ix35 Ioniq Bayon H350:u",
  Kia: "Ceed Sportage Rio Picanto Sorento Niro Stonic XCeed EV6:e",
  Opel: "Astra Corsa Insignia Vivaro:u Movano:u Combo:u Mokka Zafira Meriva Crossland Grandland Vectra",
  Peugeot: "Partner:u Expert:u Boxer:u Rifter Traveller:u",
  "Citroën": "Berlingo:u Jumpy:u Jumper:u C-Elysee Spacetourer:u",
  Fiat: "Ducato:u Doblo:u Fiorino:u Talento:u Scudo:u Punto Panda Tipo",
  Iveco: "Daily:u Eurocargo:c Stralis:c S-Way:c",
  Nissan: "Qashqai Navara X-Trail Juke Micra NV200:u NV300:u Primastar:u Leaf:e",
  Seat: "Leon Ibiza Ateca Arona Tarraco Alhambra",
  Volvo: "XC40 XC60 XC90 V60 V90 S60 S90",
  Mazda: "CX-3 CX-30 CX-5 CX-60",
  Honda: "Civic CR-V HR-V Jazz",
  Suzuki: "Vitara Swift Jimny SX4 Ignis S-Cross",
  Mitsubishi: "Outlander L200 ASX Pajero Lancer Space_Star",
  Tesla: "Model_3:e Model_Y:e Model_S:e Model_X:e",
  MAN: "TGE:u TGL:c TGM:c TGS:c TGX:c",
  DAF: "XF:c CF:c LF:c",
  Isuzu: "D-Max",
  Jeep: "Renegade Compass Wrangler Cherokee",
};
const BRAND_DEFAULTS = { Tesla: { fuel: "Electric" }, MAN: { category: "camion" }, DAF: { category: "camion" }, Scania: { category: "camion" }, Iveco: { category: "utilitara" } };
const FLAG = { u: { category: "utilitara" }, c: { category: "camion" }, e: { fuel: "Electric" }, h: { fuel: "Hibrid" } };

const key = (s) => fold(s).replace(/[^a-z0-9]/g, "");

const brandIndex = new Map();
for (const [brand, aliases] of Object.entries(BRANDS)) for (const a of [brand, ...aliases]) brandIndex.set(key(a), brand);

const modelIndex = new Map();
for (const [brand, list] of Object.entries(MODELS)) {
  for (const item of list.split(" ")) {
    const [raw, flags = ""] = item.split(":");
    const name = raw.replace(/_/g, " ");
    const info = { brand, name, ...Object.assign({}, ...[...flags].map((f) => FLAG[f])) };
    if (!modelIndex.has(key(name))) modelIndex.set(key(name), info);
  }
}

/* cuvinte care descriu vehiculul fără să-i dea marca */
const KINDS = [
  [/^rulot/, "Rulotă", "remorca"], [/^semiremorc/, "Semiremorcă", "remorca"], [/^remorc/, "Remorcă", "remorca"],
  [/^(auto)?utilitar/, "Utilitară", "utilitara"], [/^(duba|autoduba|furgon|microbuz)$/, "Utilitară", "utilitara"],
  [/^(auto)?camion$|^basculant/, "Camion", "camion"], [/^(motociclet|moto$|scuter|atv$)/, "Motocicletă", "moto"],
];
const GENERIC = /^(auto|autoturism|autovehicul|masina|vehicul)$/;
const DESCRIPTORS = /^(nou|noua|noi|vechi|veche|alb|alba|negru|neagra|gri|rosu|rosie|albastru|albastra|verde|mare|mic|mica|second|leasing|inchiriat|inchiriata|rezerva|firma|personal|personala)$/;

export const canonicalBrand = (text) => brandIndex.get(key(text)) || null;

function lookupModel(tokens, brand) {
  for (const n of [3, 2, 1]) {
    if (tokens.length < n) continue;
    const info = modelIndex.get(key(tokens.slice(0, n).join(" ")));
    if (info && (!brand || info.brand === brand) && (brand || key(info.name).length >= 3)) return { info, used: n };
  }
  return null;
}

export const brandOfModel = (text) => lookupModel(clean(text).split(" "), null)?.info.brand || null;

export function canonicalModel(text, brand) {
  const tokens = clean(text).split(" ").filter(Boolean);
  const found = lookupModel(tokens, brand);
  if (!found) return smartCase(text);
  return [found.info.name, ...tokens.slice(found.used).map(smartCase)].join(" ");
}

const PLATE_IN_TEXT = /\b(B|[A-Z]{2})[\s-]*(\d{2,3})[\s-]*([A-Z]{3})\b/i;
const shouting = (s) => s === s.toLocaleUpperCase("ro-RO") || s === s.toLocaleLowerCase("ro-RO");
const tidy = (t, shout) => (!shout ? t : /^[a-z]{1,3}$/i.test(t) ? t.toUpperCase() : titleCase(t));

/* „DUSTER / ION" → Dacia Duster, șofer Ion; „MERCEDES NOU" → Mercedes, notă „nou"; „RULOTA" → Rulotă (remorcă) */
export function parseVehicleName(text) {
  const out = { make: null, model: null, driver: null, note: null, category: null, fuel: null, plate: null };
  let raw = clean(text);
  if (!raw) return out;
  out.plate = findPlate(raw);
  if (out.plate) raw = clean(raw.replace(PLATE_IN_TEXT, " "));

  const split = raw.match(/^(.*?)\s*(?:\/|\\|\s[-–—]\s|\(|,)\s*(.*?)\)?\s*$/);
  const vehiclePart = split ? split[1] : raw;
  const extra = split ? clean(split[2].replace(/^[\s/\\,–—-]+/, "")) : "";
  const shout = shouting(vehiclePart);
  const notes = [];

  let tokens = vehiclePart.split(" ").filter((t) => t && !GENERIC.test(key(t)));
  const kindAt = (t) => KINDS.find(([re]) => re.test(key(t)));
  let kind = null;
  while (tokens.length && kindAt(tokens[0])) { kind = kindAt(tokens[0]); tokens = tokens.slice(1); }

  let brand = null;
  for (const n of [2, 1]) {
    const b = tokens.length >= n && brandIndex.get(key(tokens.slice(0, n).join(" ")));
    if (b) { brand = b; tokens = tokens.slice(n); break; }
  }
  const model = lookupModel(tokens, brand);
  if (model) { brand ||= model.info.brand; tokens = tokens.slice(model.used); }

  const rest = [];
  for (const t of tokens) (DESCRIPTORS.test(key(t)) ? notes : rest).push(t);
  if (!brand && rest.length) brand = tidy(rest.shift(), shout);

  const defaults = { ...(brand && BRAND_DEFAULTS[brand]), ...(model && model.info) };
  out.make = brand || (kind ? kind[1] : null);
  out.model = [model?.info.name, ...rest.map((t) => tidy(t, shout))].filter(Boolean).join(" ") || null;
  out.category = kind?.[2] || defaults.category || null;
  out.fuel = defaults.fuel || fuelHint(vehiclePart);

  if (extra) {
    if (extra.split(" ").every((t) => DESCRIPTORS.test(key(t)))) notes.push(extra);
    else if (/^[\p{L} .'-]+$/u.test(extra)) out.driver = smartCase(extra);
    else notes.push(extra);
  }
  out.note = notes.map((n) => n.toLocaleLowerCase("ro-RO")).join(", ") || null;
  return out;
}
