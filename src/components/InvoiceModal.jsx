import { useState } from "react";
import { extractInvoice } from "../lib/api";
import { DOC_TYPES, MAINT_TYPES, normalizePlate, vehicleName, currencyCode, currencySymbol, todayStr } from "../lib/model";
import { ModalShell, readPhoto } from "./ui";

const KIND_LABELS = { maintenance: "🔧 Lucrare / piese", fuel: "⛽ Combustibil", document: "📄 Document (RCA, ITP…)", expense: "💶 Altă cheltuială" };
const MAX_PDF = 3_000_000;

const readPdf = (file) => new Promise((resolve, reject) => {
  if (file.size > MAX_PDF) return reject(new Error("PDF-ul are peste 3 MB"));
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(new Error("PDF-ul nu poate fi citit"));
  r.readAsDataURL(file);
});
const readAny = (file) => (file.type === "application/pdf" || /\.pdf$/i.test(file.name) ? readPdf(file) : readPhoto(file));

/* facturile se citesc cu AI, se potrivesc pe mașină după număr, apoi le verifici și le salvezi deodată */
export default function InvoiceModal({ vehicles, v: current, actions, features }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const plates = vehicles.map((x) => x.plate).filter(Boolean);
  const byPlate = new Map(vehicles.map((x) => [normalizePlate(x.plate), x.id]));
  const set = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const onFiles = async (files) => {
    const list = [...files];
    const start = rows.length;
    setRows((rs) => [...rs, ...list.map((f) => ({ name: f.name, status: "reading" }))]);
    for (const [k, f] of list.entries()) {
      const i = start + k;
      try {
        const file = await readAny(f);
        const x = await extractInvoice(file, plates);
        const vid = (x.plateKey && byPlate.get(x.plateKey)) || current?.id || "";
        set(i, {
          status: "ready", file, vid, kind: x.kind, maintenanceType: x.maintenanceType, docType: x.docType, docExpires: x.docExpires || "",
          date: x.date || todayStr(), cost: x.total != null ? String(x.total) : "", km: x.km != null ? String(x.km) : "", liters: x.liters,
          supplier: x.supplier, note: [x.summary, x.supplier, x.invoiceNumber && `factura ${x.invoiceNumber}`].filter(Boolean).join(" · "),
          plateRead: x.plate, foreignCurrency: x.currency && x.currency !== currencyCode() ? x.currency : null,
        });
      } catch (e) {
        set(i, { status: "error", error: e.message });
      }
    }
  };

  const saveOne = async (r) => {
    const cost = r.cost === "" ? null : +String(r.cost).replace(",", ".");
    const km = r.km === "" ? null : +String(r.km).replace(/\./g, "");
    if (r.kind === "document" && r.docType && r.docExpires)
      return actions.putDocument(r.vid, r.docType, { expires: r.docExpires, provider: r.supplier, cost, photo: r.file });
    const event = { kind: r.kind === "document" ? "expense" : r.kind, date: r.date, cost, km, note: r.note, photo: r.file };
    if (r.kind === "maintenance") event.type = r.maintenanceType || "repair";
    if (r.kind === "fuel") event.liters = r.liters;
    if (r.kind === "expense" || r.kind === "document") { event.type = "altele"; event.label = r.supplier || "Factură"; }
    return actions.addEvent(r.vid, { event });
  };

  const ready = rows.filter((r) => r.status === "ready");
  const saveAll = async () => {
    setBusy(true);
    let saved = 0;
    for (const [i, r] of rows.entries()) {
      if (r.status !== "ready" || !r.vid) continue;
      if (await saveOne(r)) { saved++; set(i, { status: "saved" }); }
    }
    setBusy(false);
    actions.toast(`🧾 ${saved === 1 ? "O factură salvată" : `${saved} facturi salvate`} în istoric`);
    if (saved && rows.every((r) => r.status !== "ready" || !r.vid)) actions.close();
  };

  return (
    <ModalShell close={actions.close} label="Facturi" wide>
      <h2>🧾 Adaugă facturi</h2>
      <div className="wiz-sub">Încarci PDF-urile sau pozele facturilor (oricâte deodată). Le citesc, le pun pe mașina corectă după numărul de înmatriculare și le salvezi după ce verifici. Factura rămâne atașată în istoric.</div>
      {!features?.ai ? (
        <div className="banner warn">Citirea automată a facturilor are nevoie de cheia AI (GEMINI_API_KEY, gratuită) setată în Netlify.</div>
      ) : (
        <label className="file-btn" style={{ width: "100%", justifyContent: "center" }}>
          📎 Alege facturile (PDF, JPG, PNG)
          <input type="file" multiple accept="application/pdf,image/*" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} disabled={busy} />
        </label>
      )}
      <div className="inv-list">
        {rows.map((r, i) => (
          <div key={i} className={`inv-row ${r.status}`}>
            <div className="inv-head"><b>{r.name}</b>
              <span className="muted">{r.status === "reading" ? "⏳ Citesc factura…" : r.status === "error" ? `⚠ ${r.error}` : r.status === "saved" ? "✅ Salvată" : ""}</span>
            </div>
            {r.status === "ready" && (
              <div className="inv-fields">
                <select value={r.vid} onChange={(e) => set(i, { vid: e.target.value })} aria-label="Mașina">
                  <option value="">— alege mașina{r.plateRead ? ` (pe factură: ${r.plateRead})` : ""} —</option>
                  {vehicles.map((x) => <option key={x.id} value={x.id}>{vehicleName(x)} · {x.plate}</option>)}
                </select>
                <select value={r.kind} onChange={(e) => set(i, { kind: e.target.value })} aria-label="Tip">
                  {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                {r.kind === "maintenance" && (
                  <select value={r.maintenanceType || "repair"} onChange={(e) => set(i, { maintenanceType: e.target.value })} aria-label="Lucrare">
                    {Object.entries(MAINT_TYPES).map(([k, m]) => <option key={k} value={k}>{m.icon} {m.label}</option>)}
                  </select>
                )}
                {r.kind === "document" && (
                  <>
                    <select value={r.docType || ""} onChange={(e) => set(i, { docType: e.target.value })} aria-label="Document">
                      <option value="">— tip document —</option>
                      {Object.entries(DOC_TYPES).map(([k, d]) => <option key={k} value={k}>{d.icon} {d.label}</option>)}
                    </select>
                    <input type="date" value={r.docExpires} onChange={(e) => set(i, { docExpires: e.target.value })} aria-label="Expiră la" title="Expiră la" />
                  </>
                )}
                <input type="date" value={r.date} max={todayStr()} onChange={(e) => set(i, { date: e.target.value })} aria-label="Data facturii" />
                <input inputMode="decimal" value={r.cost} onChange={(e) => set(i, { cost: e.target.value })} placeholder={`Total (${currencySymbol()})`} aria-label="Total" />
                <input inputMode="numeric" value={r.km} onChange={(e) => set(i, { km: e.target.value })} placeholder="Km (opțional)" aria-label="Km" />
                <input className="inv-note" value={r.note} onChange={(e) => set(i, { note: e.target.value })} aria-label="Notă" />
                {r.foreignCurrency && <div className="hint">⚠ Factura e în {r.foreignCurrency}, contul în {currencyCode()} — verifică suma.</div>}
                {r.kind === "document" && (!r.docType || !r.docExpires) && <div className="hint">Fără tip și dată de expirare se salvează ca o cheltuială obișnuită.</div>}
                {!r.vid && <div className="hint">Alege mașina — nu am găsit numărul pe factură.</div>}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={actions.close} disabled={busy}>Închide</button>
        <button type="button" className="btn" onClick={saveAll} disabled={busy || !ready.some((r) => r.vid)}>
          {busy ? "Se salvează…" : `Salvează ${ready.filter((r) => r.vid).length || ""} în istoric`}
        </button>
      </div>
    </ModalShell>
  );
}
