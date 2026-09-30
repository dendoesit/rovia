import { useCallback, useMemo, useRef, useState } from "react";
import { ModalShell, Field } from "./ui";
import { DOC_TYPES, CATEGORIES, eventTitle, eventIcon, fmtKm } from "../lib/model";
import { EURO_CLASSES, VIGNETTE_CATEGORIES } from "../../shared/renewals.js";
import { ACCEPTED } from "../lib/importer/formats";
import { roDate } from "../lib/importer/text";
import "./import.css";

/* logica de import și exportul se încarcă doar când fereastra chiar e folosită */
const loadImporter = () => import("../lib/importer");
const loadExporter = () => import("../lib/exporter");

const STATUS = {
  new: { label: "nouă", cls: "ok" },
  existing: { label: "există deja", cls: "info" },
  invalid: { label: "exclusă", cls: "bad" },
  example: { label: "rând de exemplu", cls: "bad" },
};
const de = (n) => (n >= 20 && (n % 100 === 0 || n % 100 >= 20) ? "de " : "");
const cars = (n) => (n === 1 ? "o mașină" : `${n} ${de(n)}mașini`);
const columnName = (i) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(64 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`);
const rowPreview = (cells) => cells.filter((c) => String(c ?? "").trim()).slice(0, 4).join(" · ").slice(0, 70);
const carName = (v) => [v?.make, v?.model].filter(Boolean).join(" ");

function PickStep({ onFile, busy, error, vehicles, actions }) {
  const [over, setOver] = useState(false);
  const run = (fn, msg) => async () => {
    try { await fn(); actions.toast(msg); } catch (e) { actions.toast("⚠ " + (e?.message || "nu am putut genera fișierul")); }
  };
  return (
    <>
      <h2>📥 Import din Excel</h2>
      <div className="wiz-sub">Adaugă toată flota dintr-un fișier: Excel, CSV sau un tabel din Word. Vezi fiecare mașină înainte să se salveze ceva.</div>
      <label
        className={`imp-drop${over ? " over" : ""}${busy ? " busy" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy && e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); }}
      >
        <input type="file" accept={ACCEPTED} className="imp-file" disabled={busy}
          onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = ""; }} />
        <span className="imp-drop-ico" aria-hidden="true">{busy ? "⏳" : "📄"}</span>
        <b>{busy ? "Citesc fișierul…" : "Alege fișierul sau trage-l aici"}</b>
        <span className="muted">.xlsx, .xls, .ods, .csv sau .docx (tabel Word)</span>
      </label>
      {error && <div className="imp-error" role="alert">⚠ {error}</div>}
      <div className="imp-tools">
        <button type="button" className="btn ghost small"
          onClick={run(async () => (await loadExporter()).downloadTemplate(), "⬇️ Modelul Excel a fost descărcat")}>⬇️ Descarcă modelul Excel</button>
        <button type="button" className="btn ghost small" disabled={!vehicles.length}
          onClick={run(async () => (await loadExporter()).downloadFleet(vehicles), "📤 Flota a fost exportată în Excel")}>📤 Exportă flota actuală</button>
      </div>
      <div className="hint">Nu ai încă un tabel? Modelul are coloanele potrivite și două rânduri de exemplu. Exportul se poate importa înapoi oricând.</div>
    </>
  );
}

function ColumnMap({ fields, columns, onChange }) {
  const mapped = columns.filter((c) => c.field).length;
  const groups = [...new Set(Object.values(fields).map((f) => f.group))];
  return (
    <details className="imp-cols-box" open={mapped < columns.length}>
      <summary>Coloane recunoscute: {mapped} din {columns.length} <span className="muted">— schimbă dacă am greșit</span></summary>
      <div className="imp-cols">
        {columns.map((c) => (
          <label key={c.index} className={`imp-col${c.field ? "" : " off"}`}>
            <span className="imp-col-head">{c.header || `Coloana ${columnName(c.index)}`}</span>
            <span className="imp-col-sample" title={c.sample}>{c.sample || "—"}</span>
            <select value={c.field || ""} onChange={(e) => onChange(c.index, e.target.value || null)}>
              <option value="">— ignoră coloana —</option>
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {Object.entries(fields).filter(([, f]) => f.group === g).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
                </optgroup>
              ))}
            </select>
            {c.guessed && <span className="imp-col-note">recunoscută după conținut</span>}
          </label>
        ))}
      </div>
    </details>
  );
}

function RowDetail({ r }) {
  const v = r.vehicle;
  const facts = [
    v.year && `an ${v.year}`, v.fuel, CATEGORIES[v.category], v.vin && `VIN ${v.vin}`,
    v.nextServiceKm && `revizie la ${fmtKm(v.nextServiceKm)} km`, v.nextServiceDate && `revizie până la ${roDate(v.nextServiceDate)}`,
    v.civ && `CIV ${v.civ}`, EURO_CLASSES[v.euroClass], v.vignetteCategory && `rovinietă ${VIGNETTE_CATEGORIES[v.vignetteCategory]}`,
    v.tyresNote && `anvelope: ${v.tyresNote}`, v.notes && `observații: ${v.notes}`,
  ].filter(Boolean);
  return (
    <div className="imp-detail">
      {facts.length > 0 && <div className="muted">{facts.join(" · ")}</div>}
      {v.documents.length > 0 && (
        <ul className="imp-list">
          {v.documents.map((d) => <li key={d.type}>{DOC_TYPES[d.type].icon} {DOC_TYPES[d.type].label} expiră {roDate(d.expires)}{d.provider ? ` · ${d.provider}` : ""}</li>)}
        </ul>
      )}
      {v.events.length > 0 && (
        <ul className="imp-list">
          {[...v.events].sort((a, b) => b.date.localeCompare(a.date)).map((e, i) => (
            <li key={i}>
              {eventIcon(e)} {eventTitle(e)} · {roDate(e.date)}
              {e.km ? ` · ${fmtKm(e.km)} km` : ""}{e.note ? ` · ${e.note}` : ""}
            </li>
          ))}
        </ul>
      )}
      {r.warnings.length > 0 && <ul className="imp-list warn">{r.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}</ul>}
    </div>
  );
}

function PreviewTable({ rows }) {
  const [open, setOpen] = useState(null);
  if (!rows.length)
    return <div className="imp-empty">Nu am găsit mașini în acest tabel. Verifică rândul cu antetul și coloanele de mai sus.</div>;
  return (
    <div className="imp-table-wrap">
      <table className="imp-table">
        <thead>
          <tr><th scope="col">Rând</th><th scope="col">Mașină</th><th scope="col">Nr.</th><th scope="col">Km</th><th scope="col">Doc.</th><th scope="col">Istoric</th><th scope="col">Observații</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const v = r.vehicle, s = STATUS[r.status], expanded = open === r.row;
            return [
              <tr key={r.row} className={`st-${s.cls}`}>
                <td>
                  <button type="button" className="imp-toggle" aria-expanded={expanded} aria-label={`Detalii pentru rândul ${r.row}`}
                    onClick={() => setOpen(expanded ? null : r.row)}>{expanded ? "▾" : "▸"} {r.row}</button>
                </td>
                <td><b>{carName(v) || carName(r.existing) || "—"}</b>{v.driver && <div className="muted">{v.driver}</div>}</td>
                <td>{v.plate ? <span className="plate">{v.plate}</span> : "—"}<div><span className={`imp-badge ${s.cls}`}>{s.label}</span></div></td>
                <td className="num">{v.km ? fmtKm(v.km) : "—"}</td>
                <td className="num">{v.documents.length || "—"}</td>
                <td className="num">{v.events.length || "—"}</td>
                <td className="imp-notes">
                  {r.note && <div className="imp-note">ℹ {r.note}</div>}
                  {r.missing.length > 0 && <div className="bad">Lipsește {r.missing.join(" și ")} — nu se importă</div>}
                  {r.status === "example" && <div className="bad">Rând de exemplu din model — nu se importă</div>}
                  {r.warnings.slice(0, 2).map((w, i) => <div key={i}>⚠ {w}</div>)}
                  {r.warnings.length > 2 && !expanded && (
                    <button type="button" className="linkbtn" onClick={() => setOpen(r.row)}>+ încă {r.warnings.length - 2}</button>
                  )}
                  {!r.missing.length && !r.warnings.length && r.status !== "example" && <span className="ok">✓</span>}
                </td>
              </tr>,
              expanded && <tr key={`${r.row}-detail`} className="imp-detail-row"><td colSpan={7}><RowDetail r={r} /></td></tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

function Report({ report, close }) {
  const { created, updated, skipped, errors } = report;
  const failed = errors.length && !created.length && !updated.length;
  return (
    <>
      <h2>{failed ? "⚠ Importul nu a reușit" : "✅ Import terminat"}</h2>
      <ul className="imp-report">
        <li><b>{created.length}</b> {created.length === 1 ? "mașină adăugată" : `${de(created.length)}mașini adăugate`}</li>
        {updated.length > 0 && <li><b>{updated.length}</b> {updated.length === 1 ? "mașină existentă completată" : `${de(updated.length)}mașini existente completate`}</li>}
        {skipped.length > 0 && <li><b>{skipped.length}</b> {skipped.length === 1 ? "mașină sărită" : `${de(skipped.length)}mașini sărite`} (existau deja)</li>}
        {errors.length > 0 && <li className="bad"><b>{errors.length}</b> cu erori</li>}
      </ul>
      {errors.length > 0 && (
        <ul className="imp-list warn">
          {errors.map((e, i) => <li key={i}>Rândul {e.row}{e.plate ? ` (${e.plate})` : ""}: {e.error}</li>)}
        </ul>
      )}
      <div className="modal-actions"><button type="button" className="btn" autoFocus onClick={close}>Gata</button></div>
    </>
  );
}

export default function ImportModal({ vehicles, actions }) {
  const [step, setStep] = useState("pick");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState([]);
  const [main, setMain] = useState(0);
  const [history, setHistory] = useState(-1);
  const [withHistory, setWithHistory] = useState(true);
  const [header, setHeader] = useState(null);
  const [columns, setColumns] = useState([]);
  const [mode, setMode] = useState("merge");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [report, setReport] = useState(null);
  const [lib, setLib] = useState(null);

  /* închiderea rămâne aceeași funcție între randări, ca fereastra să nu-și mute focusul; cât se salvează nu se închide */
  const closeRef = useRef(actions.close);
  closeRef.current = step === "saving" ? () => {} : actions.close;
  const close = useCallback(() => closeRef.current(), []);

  const applySheet = (list, index, importer = lib) => {
    const setup = importer.sheetSetup(list[index]);
    setMain(index);
    setHeader(setup.header);
    setColumns(setup.columns);
  };

  const onFile = async (file) => {
    setBusy(true); setError(null);
    try {
      const importer = await loadImporter();
      const list = await importer.readFile(file);
      const pick = importer.pickSheets(list);
      setLib(importer); setFileName(file.name); setSheets(list); setHistory(pick.history);
      applySheet(list, pick.main, importer);
      setStep("preview");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const result = useMemo(
    () => (lib && header ? lib.preview({ sheets, main, history: withHistory ? history : -1, header, columns, existing: vehicles }) : { rows: [], history: {} }),
    [lib, sheets, main, history, withHistory, header, columns, vehicles],
  );
  const count = (...st) => result.rows.filter((r) => st.includes(r.status)).length;
  const counts = { new: count("new"), existing: count("existing"), excluded: count("invalid", "example") };
  const toSend = result.rows.filter((r) => r.status === "new" || (mode === "merge" && r.status === "existing"));

  const changeHeader = (index) => {
    const h = lib.headerAt(sheets[main], index);
    setHeader(h);
    setColumns(lib.autoColumns(sheets[main].rows, h));
  };
  const changeColumn = (index, field) =>
    setColumns((cols) => cols.map((c) => (c.index === index ? { ...c, field, guessed: false } : c)));

  const start = async () => {
    const list = toSend.map((r) => ({ row: r.row, data: lib.payload(r.vehicle) }));
    setStep("saving");
    setProgress({ done: 0, total: list.length });
    const { report: acc, reloaded } = await lib.importInChunks(list, {
      send: (items) => actions.importVehicles(items, mode, { reload: false }),
      reload: actions.reload,
      onProgress: (done) => setProgress({ done, total: list.length }),
    });
    if (mode === "skip") acc.skipped.unshift(...result.rows.filter((r) => r.status === "existing").map((r) => ({ row: r.row, plate: r.vehicle.plate })));
    if (!reloaded) actions.toast("⚠ Importul s-a salvat, dar lista de mașini nu s-a actualizat — reîncarcă pagina");
    setReport(acc);
    setStep("done");
  };

  if (step === "pick" || !header || !lib)
    return (
      <ModalShell key={step} close={close} label="Import din Excel" wide>
        <PickStep onFile={onFile} busy={busy} error={error} vehicles={vehicles} actions={actions} />
      </ModalShell>
    );

  if (step === "saving")
    return (
      <ModalShell key={step} close={close} label="Import în curs" wide>
        <h2>⏳ Se importă…</h2>
        <div className="wiz-sub">Nu închide fereastra — salvez {cars(progress.total)}.</div>
        <progress className="imp-progress" aria-label="Progresul importului" value={progress.done} max={progress.total || 1} />
        <div className="muted" role="status">{progress.done} din {progress.total}</div>
      </ModalShell>
    );

  if (step === "done")
    return <ModalShell key={step} close={close} label="Import terminat" wide><Report report={report} close={close} /></ModalShell>;

  const sheet = sheets[main];
  const truncated = [sheet, withHistory && sheets[history]].filter((s) => s?.truncated).map((s) => `„${s.name}”`);
  const headerChoices = [...new Set([...sheet.rows.slice(0, 12).map((_, i) => i), header.index])].filter((i) => i >= 0).sort((a, b) => a - b);
  return (
    <ModalShell key={step} close={close} label="Previzualizare import" wide>
      <h2>📋 Verifică înainte de import</h2>
      <div className="wiz-sub">
        <b>{fileName}</b> — {counts.new === 1 ? "o mașină nouă" : `${counts.new} ${de(counts.new)}mașini noi`}
        {counts.existing > 0 && `, ${counts.existing} există deja`}
        {counts.excluded > 0 && `, ${counts.excluded} ${counts.excluded === 1 ? "exclusă" : "excluse"}`}
      </div>
      <div className="imp-setup">
        {sheets.length > 1 && (
          <Field label="Foaia / tabelul">
            <select value={main} onChange={(e) => applySheet(sheets, +e.target.value)}>
              {sheets.map((s, i) => <option key={i} value={i} disabled={i === history}>{s.name}{i === history ? " (istoric)" : ""}</option>)}
            </select>
          </Field>
        )}
        <Field label="Antetul e pe rândul">
          <select value={header.index} onChange={(e) => changeHeader(+e.target.value)}>
            <option value={-1}>fără antet</option>
            {headerChoices.map((i) => <option key={i} value={i}>{i + 1}: {rowPreview(sheet.rows[i] || []) || "(gol)"}</option>)}
          </select>
        </Field>
      </div>
      {truncated.length > 0 && (
        <div className="imp-error" role="alert">⚠ Am citit doar primele {lib.MAX_ROWS.toLocaleString("ro-RO")} de rânduri și {lib.MAX_COLS} de coloane din {truncated.join(" și ")}. Împarte fișierul în mai multe bucăți ca să imporți tot.</div>
      )}
      <ColumnMap fields={lib.FIELDS} columns={columns} onChange={changeColumn} />
      {history >= 0 && (
        <label className="check">
          <input type="checkbox" checked={withHistory} onChange={(e) => setWithHistory(e.target.checked)} />
          <span>
            Importă și istoricul din foaia „{sheets[history].name}”
            {withHistory && ` — ${result.history.attached === 1 ? "un eveniment" : `${result.history.attached || 0} ${de(result.history.attached)}evenimente`}`}
            {withHistory && result.history.orphans > 0 && ` (${result.history.orphans} pentru mașini absente sau excluse din foaia de mașini, ignorate)`}
            {withHistory && result.history.skipped > 0 && ` · ${result.history.skipped === 1 ? "un rând ignorat" : `${result.history.skipped} ${de(result.history.skipped)}rânduri ignorate`} (fără dată, cu dată în viitor sau fără număr)`}
          </span>
        </label>
      )}
      <PreviewTable rows={result.rows} />
      {counts.existing > 0 && (
        <fieldset className="imp-mode">
          <legend>Mașinile care există deja în garaj ({counts.existing})</legend>
          <label className="check"><input type="radio" name="imp-mode" checked={mode === "merge"} onChange={() => setMode("merge")} />
            <span><b>Completează (recomandat)</b> — adaug documentele, istoricul și câmpurile goale, fără să dublez nimic</span></label>
          <label className="check"><input type="radio" name="imp-mode" checked={mode === "skip"} onChange={() => setMode("skip")} />
            <span><b>Sari peste</b> — le las exact cum sunt</span></label>
        </fieldset>
      )}
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={() => { setStep("pick"); setHeader(null); }}>Alt fișier</button>
        <button type="button" className="btn" disabled={!toSend.length} onClick={start}>
          {toSend.length ? `Importă ${cars(toSend.length)}` : "Nimic de importat"}
        </button>
      </div>
    </ModalShell>
  );
}
