import { applyEvent, putDocument, sanitizeVehicleFields, sanitizeDocument, normalizePlate, sameEvent, DOC_TYPES } from "../../shared/domain.js";
import { bucharestToday } from "../../shared/dates.js";
import { fail } from "./http.mjs";

const MAX_PHOTO_BYTES = 1_500_000;
const MAX_PDF_BYTES = 4_500_000;
const MAX_IMPORT = 300;
const WRITE_RETRIES = 4;

/* niciun segment de cheie nu poate conține separatori — un id „../” ar ajunge în datele altui cont */
const SAFE = /^[A-Za-z0-9._ăâîșț-]{1,64}$/;
const part = (s) => { if (!SAFE.test(String(s)) || String(s).includes("..")) fail(404, "resursă inexistentă"); return s; };
const vehicleKey = (owner, id) => `user:${part(owner)}:vehicle:${part(id)}`;
const photoKey = (owner, vehicleId, eventId) => `user:${part(owner)}:photo:${part(vehicleId)}:${part(eventId)}`;
const ctx = (extra = {}) => {
  const created = new Date().toISOString();
  return { id: crypto.randomUUID(), created, today: bucharestToday(), newId: () => crypto.randomUUID(), ...extra };
};

function validPhoto(photo) {
  if (photo == null) return null;
  if (typeof photo === "string" && photo.startsWith("data:application/pdf;base64,")) {
    if (photo.length > MAX_PDF_BYTES) fail(413, "PDF-ul este prea mare (max ~3 MB)");
    return photo;
  }
  if (typeof photo !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(photo)) fail(400, "atașamentul trebuie să fie PDF, JPEG, PNG sau WebP");
  if (photo.length > MAX_PHOTO_BYTES) fail(413, "poza este prea mare (max ~1 MB)");
  return photo;
}

/* pozele vechi, salvate direct în mașină, se mută în blob-uri separate la prima scriere */
async function extractInlinePhotos(store, owner, v) {
  for (const e of v.events || []) {
    if (typeof e.photo === "string" && e.photo.startsWith("data:image/")) {
      await store.set(photoKey(owner, v.id, e.id), e.photo);
      e.hasPhoto = true;
    }
    delete e.photo;
  }
}

const withoutInlinePhotos = (v) => ({
  ...v,
  events: (v.events || []).map(({ photo, ...e }) => ({ ...e, hasPhoto: e.hasPhoto || (typeof photo === "string" && photo.startsWith("data:image/")) })),
});

async function readVehicle(store, owner, id) {
  const res = await store.getWithMetadata(vehicleKey(owner, id), { type: "json" });
  return res ? { v: res.data, etag: res.etag } : null;
}

/* citește → modifică → scrie doar dacă nimeni nu a scris între timp; altfel reia */
async function mutateVehicle(store, owner, id, mutate) {
  for (let attempt = 0; attempt < WRITE_RETRIES; attempt++) {
    const current = await readVehicle(store, owner, id);
    if (!current) fail(404, "mașina nu există");
    const v = current.v;
    const result = await mutate(v);
    await extractInlinePhotos(store, owner, v);
    v.updatedAt = new Date().toISOString();
    const write = await store.setJSON(vehicleKey(owner, id), v, { onlyIfMatch: current.etag });
    if (write?.modified !== false) return { v: withoutInlinePhotos(v), result };
  }
  fail(409, "mașina a fost modificată în paralel — reîncarcă pagina");
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

export async function listVehicles(store, owner) {
  const { blobs } = await store.list({ prefix: `user:${owner}:vehicle:` });
  const all = await mapLimit(blobs, 8, (b) => store.get(b.key, { type: "json" }));
  return all.filter(Boolean).map(withoutInlinePhotos).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
}

export async function getVehicle(store, owner, id) {
  const current = await readVehicle(store, owner, id);
  if (!current) fail(404, "mașina nu există");
  return withoutInlinePhotos(current.v);
}

function buildVehicle(input, c = ctx()) {
  const fields = sanitizeVehicleFields(input);
  if (!fields.make || !fields.plate) fail(400, "marca și numărul de înmatriculare sunt obligatorii");
  const v = { id: c.newId(), createdAt: c.created, updatedAt: c.created, documents: [], events: [], kmUpdatedAt: c.created, ...fields };
  for (const d of Array.isArray(input.documents) ? input.documents : []) {
    const doc = sanitizeDocument(d);
    if (!doc) continue;
    const existing = v.documents.find((x) => x.type === doc.type);
    if (existing) { if (doc.expires > existing.expires) Object.assign(existing, doc); }
    else v.documents.push({ id: c.newId(), ...doc });
  }
  for (const e of Array.isArray(input.events) ? input.events : []) {
    try { applyEvent(v, { event: { ...e, hasPhoto: false } }, { ...c, id: c.newId() }); } catch { /* intrare invalidă — ignorată */ }
  }
  return v;
}

async function plateIndex(store, owner) {
  const index = new Map();
  for (const v of await listVehicles(store, owner)) index.set(normalizePlate(v.plate), v);
  return index;
}

export async function createVehicle(store, owner, input) {
  const plate = normalizePlate(input?.plate);
  if (plate && (await plateIndex(store, owner)).has(plate)) fail(409, `ai deja o mașină cu numărul ${input.plate}`);
  const v = buildVehicle(input || {});
  await store.setJSON(vehicleKey(owner, v.id), v, { onlyIfNew: true });
  return v;
}

/* import în masă: mode "skip" păstrează mașinile existente (după număr), "merge" completează documentele și istoricul */
export async function importVehicles(store, owner, { vehicles, mode = "merge" } = {}) {
  if (!Array.isArray(vehicles) || !vehicles.length) fail(400, "fișierul nu conține mașini");
  if (vehicles.length > MAX_IMPORT) fail(400, `maxim ${MAX_IMPORT} mașini pe import`);
  const index = await plateIndex(store, owner);
  const report = { created: [], updated: [], skipped: [], errors: [] };
  for (const [row, input] of vehicles.entries()) {
    try {
      const plate = normalizePlate(input?.plate);
      const existing = plate && index.get(plate);
      if (!existing) {
        const v = buildVehicle(input || {});
        await store.setJSON(vehicleKey(owner, v.id), v, { onlyIfNew: true });
        index.set(plate, v);
        report.created.push({ row, id: v.id, plate: v.plate });
      } else if (mode === "skip") {
        report.skipped.push({ row, id: existing.id, plate: existing.plate });
      } else {
        const incoming = buildVehicle({ ...input, plate: existing.plate, make: input.make || existing.make });
        await mutateVehicle(store, owner, existing.id, (v) => {
          for (const [k, val] of Object.entries(sanitizeVehicleFields(input))) if (val != null && (v[k] == null || v[k] === "")) v[k] = val;
          if (incoming.km > (v.km || 0)) { v.km = incoming.km; v.kmUpdatedAt = incoming.kmUpdatedAt; }
          for (const d of incoming.documents) {
            const cur = (v.documents ||= []).find((x) => x.type === d.type);
            if (!cur) v.documents.push(d);
            else if (d.expires > cur.expires) Object.assign(cur, { expires: d.expires, provider: d.provider || cur.provider });
          }
          for (const e of incoming.events) if (!(v.events ||= []).some((x) => sameEvent(x, e))) v.events.push(e);
        });
        report.updated.push({ row, id: existing.id, plate: existing.plate });
      }
    } catch (e) {
      report.errors.push({ row, plate: input?.plate || null, error: e.message });
    }
  }
  return report;
}

export async function patchVehicle(store, owner, id, body) {
  const fields = sanitizeVehicleFields(body);
  if ("plate" in fields && !fields.plate) fail(400, "numărul de înmatriculare nu poate fi gol");
  if (fields.plate) {
    const other = (await plateIndex(store, owner)).get(normalizePlate(fields.plate));
    if (other && other.id !== id) fail(409, `ai deja o mașină cu numărul ${fields.plate}`);
  }
  if ("make" in fields && !fields.make) fail(400, "marca nu poate fi goală");
  return (await mutateVehicle(store, owner, id, (v) => { Object.assign(v, fields); })).v;
}

export async function deleteVehicle(store, owner, id) {
  const { blobs } = await store.list({ prefix: `user:${owner}:photo:${id}:` });
  await mapLimit(blobs, 8, (b) => store.delete(b.key));
  await store.delete(vehicleKey(owner, id));
}

/* poza se scrie înaintea evenimentului: dacă salvarea eșuează, nu rămâne o intrare fără poză (sau dublată la reîncercare) */
async function withPhotoFirst(store, owner, id, photo, save) {
  const eventId = crypto.randomUUID();
  if (!photo) return save(eventId);
  await store.set(photoKey(owner, id, eventId), photo);
  try { return await save(eventId); }
  catch (e) { await store.delete(photoKey(owner, id, eventId)); throw e; }
}

export async function addEvent(store, owner, id, body) {
  const photo = validPhoto(body?.event?.photo);
  return withPhotoFirst(store, owner, id, photo, async (eventId) => (await mutateVehicle(store, owner, id, (v) =>
    applyEvent(v, { event: { ...body?.event, hasPhoto: !!photo }, patch: body?.patch }, ctx({ id: eventId })))).v);
}

export async function deleteEvent(store, owner, id, eventId) {
  const { v } = await mutateVehicle(store, owner, id, (v) => { v.events = (v.events || []).filter((e) => e.id !== eventId); });
  await store.delete(photoKey(owner, id, eventId));
  return v;
}

export async function upsertDocument(store, owner, id, type, body) {
  if (!Object.hasOwn(DOC_TYPES, type)) fail(400, "tip de document necunoscut");
  const photo = validPhoto(body?.photo);
  return withPhotoFirst(store, owner, id, photo, async (eventId) => (await mutateVehicle(store, owner, id, (v) =>
    putDocument(v, type, { expires: body?.expires, provider: body?.provider, cost: body?.cost }, ctx({ id: eventId, hasPhoto: !!photo })))).v);
}

export async function removeDocument(store, owner, id, type) {
  return (await mutateVehicle(store, owner, id, (v) => { v.documents = (v.documents || []).filter((d) => d.type !== type); })).v;
}

export async function getPhoto(store, owner, id, eventId) {
  const legacy = await readVehicle(store, owner, id);
  if (!legacy) fail(404, "mașina nu există");
  const inline = (legacy.v.events || []).find((e) => e.id === eventId)?.photo;
  const photo = (await store.get(photoKey(owner, id, eventId))) || inline;
  if (!photo) fail(404, "poza nu există");
  const m = photo.match(/^data:((?:image\/[a-z+]+)|application\/pdf);base64,(.+)$/);
  return new Response(Buffer.from(m[2], "base64"), { headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=31536000, immutable" } });
}
