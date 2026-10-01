import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  DOC_TYPES, MAINT_TYPES, FUELS, CATEGORIES, EXPENSE_TYPES,
  todayStr, fmtKm, fmtQty, fmtMoney, fmtDate, daysLeft, zile, currencySymbol, currencyCode,
  eventTitle, eventIcon, latestDocs, serviceIntervalFor, addMonths,
  numOrNull, pricePerLiter, dateError, kmError, amountError, vehicleFormError, kmDecrease, plateMismatch,
  expiryOptions, renewalStart, USAGES, renewalDefaults, renewalPick, nextServiceTargets, isLatestService, lastServiceDate,
} from "../lib/model";
import { scanDocument, vehiclesApi } from "../lib/api";
import { ModalShell, Field, readPhoto } from "./ui";
import AccountModal from "./AccountModal";
import ImportModal from "./ImportModal";
import BrowserDataModal from "./BrowserDataModal";
import InvoiceModal from "./InvoiceModal";
import TrackingModal from "./TrackingModal";
import RenewalHelp from "./RenewalHelp";
import { EURO_CLASSES, VIGNETTE_CATEGORIES, vignetteCategoryFor, euroClassFor } from "../../shared/renewals.js";

/* ================= infrastructură ================= */

/* ModalShell își reface focusul când `close` se schimbă, iar App face `actions` din nou la fiecare randare — îi dăm mereu aceeași funcție */
function useLatest(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args) => ref.current(...args), []);
}

const FOCUSABLE = "input, select, textarea, .chip, .btn";

/* ModalShell focusează [autofocus] la deschidere; la schimbarea pasului mutăm noi focusul */
function useStepFocus(ref, step) {
  const shown = useRef(step);
  useLayoutEffect(() => {
    const el = ref.current?.querySelector(FOCUSABLE);
    if (!el) return;
    el.setAttribute("autofocus", "");
    if (shown.current !== step) el.focus();
    shown.current = step;
  }, [ref, step]);
}

const LEAVE_QUESTION = "Renunți la ce ai completat?";
const SAVE_FAILED = "Nu s-a salvat — datele au rămas aici, încearcă din nou.";

const changedFrom = (start, data) =>
  Object.keys({ ...start, ...data }).some((k) => (data[k] ?? "") !== (start[k] ?? ""));

/* Vrăjitor conversațional: un pas = o întrebare. onDone întoarce true doar dacă s-a salvat. */
function Wizard({ label, steps, initial = {}, confirmSave, onDone, close }) {
  const [start] = useState(initial);
  const [data, setData] = useState(initial);
  const [at, setAt] = useState(0);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const live = useRef({ data: initial, at: 0, saving: false });
  const formRef = useRef(null);
  useStepFocus(formRef, at);

  const shownSteps = (d) => steps.filter((s) => !s.when || s.when(d));
  const list = shownSteps(data);
  const step = list[Math.min(at, list.length - 1)];
  const isLast = at >= list.length - 1;
  const pending = step.pending?.(data) || null;

  const update = (p) => { live.current.data = { ...live.current.data, ...p }; setData(live.current.data); };
  const patch = useLatest((p) => { setError(null); update(p); });
  const goTo = (n) => { live.current.at = n; setAt(n); setError(null); };

  const advance = useLatest(async (extra = {}, { validate = true, skip = false, from = null } = {}) => {
    if (live.current.saving) return;
    if (from != null && from !== live.current.at) return update(extra);
    const current = shownSteps(live.current.data)[live.current.at];
    update({ ...extra, ...(skip ? current.skipPatch : null) });
    const d = live.current.data;
    const problem = validate && current.validate?.(d);
    if (problem) return setError(problem);
    if (live.current.at + 1 < shownSteps(d).length) return goTo(live.current.at + 1);
    const question = confirmSave?.(d);
    if (question && !window.confirm(question)) return;
    live.current.saving = true;
    setSaving(true);
    setError(null);
    if (await Promise.resolve().then(() => onDone(d)).catch(() => false)) return close();
    live.current.saving = false;
    setSaving(false);
    setError(SAVE_FAILED);
  });
  const pick = (p) => advance(p, { validate: false, from: at });
  const guardedClose = useLatest(() => {
    if (live.current.saving) return;
    const dirty = live.current.at > 0 || changedFrom(start, live.current.data);
    if (!dirty || window.confirm(LEAVE_QUESTION)) close();
  });

  const title = typeof step.title === "function" ? step.title(data) : step.title;
  const sub = typeof step.sub === "function" ? step.sub(data) : step.sub;
  return (
    <ModalShell close={guardedClose} label={label || title}>
      <form ref={formRef} noValidate onSubmit={(e) => { e.preventDefault(); if (!step.noButtons && !pending) advance(); }}>
        {list.length > 1 && <div className="wiz-step">Pasul {at + 1} din {list.length}</div>}
        <h2>{title}</h2>
        {sub && <p className="wiz-sub">{sub}</p>}
        <fieldset key={at} className="wiz-body" disabled={saving}>
          {step.render(data, patch, pick)}
        </fieldset>
        {error && <div className="form-err" role="alert">⚠ {error}</div>}
        <div className="form-status" role="status">{saving && step.noButtons ? "Se salvează…" : pending || ""}</div>
        <div className="modal-actions">
          {at > 0
            ? <button type="button" className="btn ghost" onClick={() => goTo(at - 1)} disabled={saving}>← Înapoi</button>
            : <button type="button" className="btn ghost" onClick={close} disabled={saving}>Anulează</button>}
          {!step.noButtons && step.skippable && (
            <button type="button" className="btn ghost" onClick={() => advance({}, { validate: false, skip: true })} disabled={saving || !!pending}>
              {step.skipLabel || "Sari peste"}
            </button>
          )}
          {!step.noButtons && (
            <button type="submit" className="btn" disabled={saving || !!pending}>
              {saving ? "Se salvează…" : isLast ? "Salvează" : "Continuă"}
            </button>
          )}
        </div>
      </form>
    </ModalShell>
  );
}

function ChoiceList({ options, value, onPick }) {
  return (
    <div className="chips col">
      {Object.entries(options).map(([k, m]) => (
        <button type="button" key={k} className={`chip big${value === k ? " on" : ""}`} aria-pressed={value === k} onClick={() => onPick(k)}>
          <span aria-hidden="true">{m.icon}</span> {m.label}
        </button>
      ))}
    </div>
  );
}

const NOT_IN_NUMBERS = ["e", "E", "+", "-"];

function NumberInput({ value, onChange, decimal = false, ...rest }) {
  return (
    <input type="number" inputMode={decimal ? "decimal" : "numeric"} min="0" step={decimal ? "0.01" : "1"}
      onKeyDown={(e) => { if (NOT_IN_NUMBERS.includes(e.key)) e.preventDefault(); }}
      value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest} />
  );
}

function DateInput({ value, onChange, future = false, ...rest }) {
  return <input type="date" max={future ? undefined : todayStr()} value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

/* citirea pozei durează: pasul nu se poate încheia până nu e gata, iar erorile rămân vizibile */
async function attachPhoto(file, patch) {
  patch({ photoBusy: true, photoError: null });
  try {
    const photo = await readPhoto(file);
    patch({ photo, photoBusy: false });
    return photo;
  } catch (err) {
    patch({ photoBusy: false, photoError: err.message });
    return null;
  }
}

function FileButton({ children, onFile, disabled }) {
  return (
    <label className={`file-btn${disabled ? " disabled" : ""}`}>
      {children}
      <input type="file" accept="image/*" disabled={disabled} onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) onFile(f);
      }} />
    </label>
  );
}

function PhotoPreview({ d, patch }) {
  return (
    <>
      {d.photo && !d.photoBusy && (
        <div className="photo-preview">
          <img src={d.photo} alt="Poza atașată" />
          <button type="button" className="linkbtn" onClick={() => patch({ photo: null, scanNote: null, scannedPlate: null })}>Scoate poza</button>
        </div>
      )}
      {d.photoError && <div className="form-err" role="alert">⚠ {d.photoError}</div>}
    </>
  );
}

function PhotoPicker({ d, patch }) {
  return (
    <div className="photo-pick">
      <FileButton onFile={(f) => attachPhoto(f, patch)} disabled={d.photoBusy}>{d.photo ? "📎 Schimbă poza" : "📎 Atașează o poză"}</FileButton>
      <PhotoPreview d={d} patch={patch} />
    </div>
  );
}

const photoPending = (d) => (d.photoBusy ? "Se încarcă poza…" : d.scanning ? "🤖 Citesc documentul…" : null);

const photoStep = (title = "Adaugi factura?", sub = "O poză e de ajuns — rămâne atașată la această intrare.") => ({
  title, sub,
  skippable: true, skipLabel: "Fără poză", skipPatch: { photo: null, photoError: null },
  pending: photoPending,
  render: (d, patch) => <PhotoPicker d={d} patch={patch} />,
});

/* ================= documente ================= */

function ExpiryChips({ type, v, value, onPick }) {
  return (
    <div className="chips" role="group" aria-label="Durată rapidă">
      {expiryOptions(type, v, renewalStart(v, type)).map((o) => (
        <button type="button" key={o.label} className={`chip${value === o.expires ? " on" : ""}`} aria-pressed={value === o.expires} onClick={() => onPick(o.expires, o)}>
          {o.label}{o.recommended ? " ✓" : ""} <span className="chip-sub">→ {fmtDate(o.expires)}</span>
        </button>
      ))}
    </div>
  );
}

/* poză → /api/scan → câmpuri precompletate; numărul citit e comparat cu mașina */
async function scanInto(file, { v, patch, onScanned }) {
  const photo = await attachPhoto(file, patch);
  if (!photo) return;
  patch({ scanning: true, scanNote: null, scannedPlate: null });
  try {
    const r = await scanDocument(photo);
    const found = [];
    const p = { scanning: false };
    if (r.type && DOC_TYPES[r.type]) { p.type = r.type; found.push(DOC_TYPES[r.type].label); }
    if (r.expires) { p.expires = r.expires; found.push("expiră " + fmtDate(r.expires)); }
    if (r.provider) { p.provider = r.provider; found.push(r.provider); }
    if (r.cost && r.currency && r.currency !== currencyCode()) found.push(`costul de ${r.cost} ${r.currency} (completează-l în ${currencySymbol()})`);
    else if (r.cost) { p.cost = String(r.cost); found.push(fmtMoney(r.cost)); }
    if (plateMismatch(r.plate, v.plate)) p.scannedPlate = r.plate;
    p.scanNote = found.length ? `🤖 Am citit: ${found.join(" · ")} — verifică și salvează.` : "🤖 N-am putut citi datele — completează manual (poza rămâne atașată).";
    patch(p);
    onScanned?.(p);
  } catch (err) {
    patch({ scanning: false, scanNote: null, photoError: err?.message || "scanarea a eșuat" });
  }
}

function DocPhotoOptions({ d, patch, v, ai, onScanned }) {
  const busy = d.photoBusy || d.scanning;
  return (
    <div className="photo-pick">
      <div className="photo-buttons">
        {ai && <FileButton disabled={busy} onFile={(f) => scanInto(f, { v, patch, onScanned })}>📷 Scanează cu AI</FileButton>}
        <FileButton disabled={busy} onFile={(f) => attachPhoto(f, patch)}>📎 Atașează poza</FileButton>
      </div>
      {d.scanNote && <div className="hint">{d.scanNote}</div>}
      {d.scannedPlate && <div className="form-warn" role="alert">⚠ Documentul pare să fie pentru {d.scannedPlate}, nu pentru {v.plate}.</div>}
      <PhotoPreview d={d} patch={patch} />
    </div>
  );
}

const plateQuestion = (d, v) =>
  d.scannedPlate && plateMismatch(d.scannedPlate, v.plate)
    ? `Documentul scanat pare să fie pentru ${d.scannedPlate}, nu pentru ${v.plate}. Îl salvezi totuși la această mașină?`
    : null;

const expiryError = (d) => (!d.expires ? "Alege data de expirare" : null) || amountError(d.cost);

const docPayload = (d) => ({ expires: d.expires, provider: d.provider?.trim() || null, cost: numOrNull(d.cost), photo: d.photo || null });

function DocWizard({ v, actions, features, preType }) {
  const docs = latestDocs(v);
  const ai = !!features?.ai;
  const detailStep = {
    title: (d) => `${DOC_TYPES[d.type].icon} ${DOC_TYPES[d.type].label}`,
    sub: (d) => (docs[d.type] ? `Documentul actual expiră pe ${fmtDate(docs[d.type].expires)}.` : null),
    validate: expiryError,
    pending: photoPending,
    render: (d, patch) => (
      <>
        <Field label="Expiră la"><DateInput future required value={d.expires} onChange={(expires) => patch({ expires })} /></Field>
        <ExpiryChips type={d.type} v={v} value={d.expires} onPick={(expires) => patch({ expires })} />
        <div className="row2">
          <Field label="Furnizor (opțional)"><input placeholder="Allianz, Groupama…" value={d.provider ?? ""} onChange={(e) => patch({ provider: e.target.value })} /></Field>
          <Field label={`Cost (${currencySymbol()}, opțional)`}><NumberInput decimal value={d.cost} onChange={(cost) => patch({ cost })} /></Field>
        </div>
        <DocPhotoOptions d={d} patch={patch} v={v} ai={ai} />
      </>
    ),
  };
  const typeStep = {
    title: "Ce document?", noButtons: true,
    pending: photoPending,
    render: (d, patch, pick) => (
      <>
        {ai && (
          <>
            <DocPhotoOptions d={d} patch={patch} v={v} ai onScanned={(p) => { if (p.type) pick({ provider: p.provider ?? docs[p.type]?.provider ?? "" }); }} />
            <p className="wiz-sub center">sau alege manual:</p>
          </>
        )}
        <ChoiceList options={DOC_TYPES} value={d.type} onPick={(type) => pick({ type, provider: d.provider || docs[type]?.provider || "" })} />
      </>
    ),
  };
  return (
    <Wizard
      label="Document" close={actions.close}
      initial={preType ? { type: preType, provider: docs[preType]?.provider ?? "" } : {}}
      steps={preType ? [detailStep] : [typeStep, detailStep]}
      confirmSave={(d) => plateQuestion(d, v)}
      onDone={(d) => actions.putDocument(v.id, d.type, docPayload(d),
        `${DOC_TYPES[d.type].icon} Document salvat: ${DOC_TYPES[d.type].label}, expiră ${fmtDate(d.expires)}`)}
    />
  );
}

function RenewWizard({ v, actions, features, account, type }) {
  const meta = DOC_TYPES[type];
  const d0 = latestDocs(v)[type];
  const dl = d0 ? daysLeft(d0.expires) : null;
  return (
    <Wizard
      label={`Reînnoiește ${meta.label}`} close={actions.close}
      initial={{ provider: d0?.provider ?? "", ...renewalDefaults(type, v, d0?.provider) }}
      confirmSave={(d) => plateQuestion(d, v)}
      steps={[{
        title: `${meta.icon} Reînnoiește ${meta.label}`,
        sub: !d0 ? null
          : dl < 0 ? `A expirat acum ${zile(dl)}.`
          : dl === 0 ? `Expiră azi (${fmtDate(d0.expires)}).`
          : `Expiră pe ${fmtDate(d0.expires)} (încă ${zile(dl)}).`,
        validate: expiryError,
        pending: photoPending,
        render: (d, patch) => (
          <>
            <RenewalHelp type={type} v={v} account={account} actions={actions} />
            <Field label="Noua dată de expirare"><DateInput future required value={d.expires} onChange={(expires) => patch({ expires })} /></Field>
            <ExpiryChips type={type} v={v} value={d.expires} onPick={(_, o) => patch(renewalPick(d, o))} />
            <div className="row2">
              <Field label="Furnizor (opțional)"><input value={d.provider ?? ""} onChange={(e) => patch({ provider: e.target.value })} /></Field>
              <Field label={`Cost (${currencySymbol()}, opțional)`}><NumberInput decimal value={d.cost} onChange={(cost) => patch({ cost })} /></Field>
            </div>
            <DocPhotoOptions d={d} patch={patch} v={v} ai={!!features?.ai} />
          </>
        ),
      }]}
      onDone={(d) => actions.putDocument(v.id, type, docPayload(d), `♻️ Reînnoire salvată: ${meta.label} până la ${fmtDate(d.expires)}`)}
    />
  );
}

/* ================= lucrări, alimentări, cheltuieli ================= */

function WorkWizard({ v, actions }) {
  const rec = serviceIntervalFor(v);
  const cur = currencySymbol();
  const typeLabel = (d) => `${MAINT_TYPES[d.type].icon} ${MAINT_TYPES[d.type].label}`;
  const movesTarget = (d) => d.type === "service" && isLatestService(v, d.date);
  return (
    <Wizard
      label="Lucrare" close={actions.close}
      initial={{ date: todayStr(), km: v.km != null ? String(v.km) : "", kmInterval: String(rec.km), months: String(rec.months) }}
      steps={[
        {
          title: "Ce s-a făcut?", noButtons: true,
          render: (d, patch, pick) => <ChoiceList options={MAINT_TYPES} value={d.type} onPick={(type) => pick({ type })} />,
        },
        {
          title: typeLabel,
          sub: "Când s-a făcut și la ce kilometraj?",
          validate: (d) => dateError(d.date) || kmError(d.km) || amountError(d.cost),
          render: (d, patch) => (
            <>
              <div className="row2">
                <Field label="Data"><DateInput required value={d.date} onChange={(date) => patch({ date })} /></Field>
                <Field label="Km la bord"><NumberInput placeholder="42380" value={d.km} onChange={(km) => patch({ km })} /></Field>
              </div>
              <Field label={`Cât a costat? (${cur})`}><NumberInput decimal placeholder={d.type === "service" ? "1100" : "250"} value={d.cost} onChange={(cost) => patch({ cost })} /></Field>
              <Field label="Notă (opțional)">
                <input placeholder={d.type === "tyres" ? "ex: perechea din față, Michelin" : d.type === "service" ? "ex: ulei + filtre" : "ce s-a făcut?"}
                  value={d.note ?? ""} onChange={(e) => patch({ note: e.target.value })} />
              </Field>
              {d.type === "service" && !movesTarget(d) && (
                <div className="hint">Ai deja un service mai recent ({fmtDate(lastServiceDate(v))}) — îl trecem doar în istoric, ținta următorului service rămâne neschimbată.</div>
              )}
            </>
          ),
        },
        {
          when: movesTarget,
          title: "Când urmează următorul service?",
          sub: `Recomandarea ține cont de vârsta mașinii (${v.year || "an necunoscut"}) și de combustibil (${v.fuel || "—"}).`,
          render: (d, patch) => {
            const next = nextServiceTargets(d);
            return (
              <>
                <div className="chips">
                  <button type="button" className="chip" onClick={() => patch({ kmInterval: String(rec.km), months: String(rec.months) })}>
                    ✓ {fmtKm(rec.km)} km / {rec.months} luni (recomandat)
                  </button>
                  <button type="button" className="chip" onClick={() => patch({ kmInterval: "10000" })}>10.000 km</button>
                  <button type="button" className="chip" onClick={() => patch({ kmInterval: "15000" })}>15.000 km</button>
                </div>
                <div className="row2">
                  <Field label="Peste câți km"><NumberInput value={d.kmInterval} onChange={(kmInterval) => patch({ kmInterval })} /></Field>
                  <Field label="Sau peste câte luni"><NumberInput value={d.months} onChange={(months) => patch({ months })} /></Field>
                </div>
                <div className="hint">
                  {next.nextServiceKm || next.nextServiceDate
                    ? `Următorul service: ${[next.nextServiceKm && `la ${fmtKm(next.nextServiceKm)} km`, next.nextServiceDate && fmtDate(next.nextServiceDate)].filter(Boolean).join(" sau ")}.`
                    : "Fără interval — nu vei primi remindere de service pentru această mașină."}
                </div>
              </>
            );
          },
        },
        photoStep(),
      ]}
      onDone={(d) => {
        const patchV = movesTarget(d) ? nextServiceTargets(d) : {};
        if (d.type === "tyres") { patchV.tyres = "good"; if (d.note?.trim()) patchV.tyresNote = d.note.trim(); }
        return actions.addEvent(v.id, {
          event: { kind: "maintenance", type: d.type, date: d.date, km: numOrNull(d.km), cost: numOrNull(d.cost), note: d.note?.trim() || null, photo: d.photo || null },
          patch: patchV,
        }, `${typeLabel(d)} — lucrare salvată`);
      }}
    />
  );
}

function FuelWizard({ v, actions }) {
  const cur = currencySymbol();
  const unit = v.fuel === "Electric" ? "kWh" : "L";
  return (
    <Wizard
      label="Alimentare" close={actions.close}
      initial={{ date: todayStr(), km: "" }}
      steps={[
        {
          title: "⛽ Alimentare",
          sub: "Doar suma e obligatorie.",
          validate: (d) => amountError(d.cost, { required: true }) || (numOrNull(d.liters) < 0 ? "Cantitatea nu poate fi negativă" : null),
          render: (d, patch) => {
            const ppl = pricePerLiter(d.cost, d.liters);
            return (
              <>
                <div className="row2">
                  <Field label={`Suma (${cur})`}><NumberInput decimal required placeholder="350" value={d.cost} onChange={(cost) => patch({ cost })} /></Field>
                  <Field label={unit === "kWh" ? "kWh (opțional)" : "Litri (opțional)"}><NumberInput decimal placeholder="45" value={d.liters} onChange={(liters) => patch({ liters })} /></Field>
                </div>
                <div className="hint" aria-live="polite">{ppl ? `≈ ${fmtMoney(Math.round(ppl * 100) / 100)}/${unit}` : `Completează și ${unit === "kWh" ? "kWh" : "litrii"} ca să vezi prețul pe ${unit}.`}</div>
              </>
            );
          },
        },
        {
          title: "Kilometraj și dată",
          sub: "Opțional — cu km la fiecare plin, FleetDeck îți calculează consumul real.",
          skippable: true, skipPatch: { km: "", date: todayStr() },
          validate: (d) => kmError(d.km) || dateError(d.date),
          render: (d, patch) => (
            <div className="row2">
              <Field label="Km la bord"><NumberInput placeholder={v.km != null ? String(v.km) : "42380"} value={d.km} onChange={(km) => patch({ km })} /></Field>
              <Field label="Data"><DateInput value={d.date} onChange={(date) => patch({ date })} /></Field>
            </div>
          ),
        },
        photoStep("Adaugi bonul?", "O poză a bonului rămâne atașată la alimentare."),
      ]}
      onDone={(d) => actions.addEvent(v.id, {
        event: { kind: "fuel", cost: numOrNull(d.cost), liters: numOrNull(d.liters), km: numOrNull(d.km), date: d.date || todayStr(), photo: d.photo || null },
      }, `⛽ Alimentare de ${fmtMoney(numOrNull(d.cost))} — salvată`)}
    />
  );
}

function ExpenseWizard({ v, actions }) {
  const cur = currencySymbol();
  const title = (d) => `${EXPENSE_TYPES[d.type].icon} ${d.type === "altele" ? "Cheltuială" : EXPENSE_TYPES[d.type].label}`;
  return (
    <Wizard
      label="Cheltuială" close={actions.close}
      initial={{ date: todayStr() }}
      steps={[
        {
          title: "💶 Ce fel de cheltuială?", noButtons: true,
          render: (d, patch, pick) => <ChoiceList options={EXPENSE_TYPES} value={d.type} onPick={(type) => pick({ type })} />,
        },
        {
          title,
          validate: (d) => amountError(d.cost, { required: true }) || dateError(d.date),
          render: (d, patch) => (
            <>
              <div className="row2">
                <Field label={`Suma (${cur})`}><NumberInput decimal required placeholder="60" value={d.cost} onChange={(cost) => patch({ cost })} /></Field>
                <Field label="Data"><DateInput required value={d.date} onChange={(date) => patch({ date })} /></Field>
              </div>
              <Field label={d.type === "altele" ? "Pe ce? (opțional)" : "Notă (opțional)"}>
                <input placeholder={d.type === "amenda" ? "ex: viteză, parcare" : d.type === "altele" ? "ex: cablu de încărcare" : ""}
                  value={d.note ?? ""} onChange={(e) => patch({ note: e.target.value })} />
              </Field>
            </>
          ),
        },
        photoStep("Adaugi chitanța?", "O poză a chitanței rămâne atașată la cheltuială."),
      ]}
      onDone={(d) => actions.addEvent(v.id, {
        event: {
          kind: "expense", type: d.type, label: d.type === "altele" ? null : EXPENSE_TYPES[d.type].label,
          cost: numOrNull(d.cost), date: d.date, note: d.note?.trim() || null, photo: d.photo || null,
        },
      }, `${title(d)} · ${fmtMoney(numOrNull(d.cost))} — cheltuială salvată`)}
    />
  );
}

/* ================= kilometraj, anvelope, service ================= */

function KmWizard({ v, actions }) {
  return (
    <Wizard
      label="Kilometraj" close={actions.close}
      initial={{ km: v.km != null ? String(v.km) : "" }}
      confirmSave={(d) => (kmDecrease(v, d.km)
        ? `Noul kilometraj (${fmtKm(d.km)} km) e mai mic decât cel actual (${fmtKm(v.km)} km). Îl corectezi așa?`
        : null)}
      steps={[{
        title: "📍 Actualizează kilometrajul",
        sub: v.km != null ? `Ultima citire: ${fmtKm(v.km)} km.` : null,
        validate: (d) => kmError(d.km, { required: true }),
        render: (d, patch) => (
          <Field label="Km la bord acum"><NumberInput required value={d.km} onChange={(km) => patch({ km })} /></Field>
        ),
      }]}
      onDone={(d) => {
        const km = numOrNull(d.km);
        return actions.addEvent(v.id, {
          event: { kind: "odometer", km, date: todayStr() },
          patch: { km, kmUpdatedAt: new Date().toISOString() },
        }, `📍 Kilometraj: ${fmtKm(km)} km`);
      }}
    />
  );
}

const TYRE_STATES = { good: { icon: "🟢", label: "Bune" }, attention: { icon: "🟠", label: "Necesită verificare" } };

function TyresWizard({ v, actions }) {
  return (
    <Wizard
      label="Anvelope" close={actions.close}
      steps={[{
        title: "🛞 Anvelope", noButtons: true,
        sub: v.tyresNote || null,
        render: (d, patch, pick) => <ChoiceList options={TYRE_STATES} value={d.tyres ?? v.tyres} onPick={(tyres) => pick({ tyres })} />,
      }]}
      onDone={(d) => actions.patchVehicle(v.id, { tyres: d.tyres }, "🛞 Anvelope actualizate")}
    />
  );
}

function ServiceWizard({ v, actions }) {
  const rec = serviceIntervalFor(v);
  return (
    <Wizard
      label="Următorul service" close={actions.close}
      initial={{ km: v.nextServiceKm != null ? String(v.nextServiceKm) : "", date: v.nextServiceDate ?? "" }}
      confirmSave={(d) => {
        const km = numOrNull(d.km);
        const hadTarget = v.nextServiceKm != null || !!v.nextServiceDate;
        if (km == null && !d.date) return hadTarget ? "Ștergi ținta de service? Nu vei mai primi remindere de service pentru această mașină." : null;
        if (km != null && v.km != null && km <= v.km) return `Ținta de ${fmtKm(km)} km e deja atinsă (mașina are ${fmtKm(v.km)} km) — service-ul va apărea ca depășit. Salvezi așa?`;
        if (d.date && d.date < todayStr()) return "Data e în trecut — service-ul va apărea ca depășit. Salvezi așa?";
        return null;
      }}
      steps={[{
        title: "🔧 Următorul service",
        sub: "Setează oricare dintre ele — FleetDeck te avertizează când se apropie.",
        validate: (d) => kmError(d.km),
        render: (d, patch) => (
          <>
            <div className="chips">
              <button type="button" className="chip" onClick={() => patch({ km: String((v.km || 0) + rec.km), date: addMonths(rec.months) })}>
                ✓ peste {fmtKm(rec.km)} km / {rec.months} luni (recomandat)
              </button>
              <button type="button" className="chip" onClick={() => patch({ km: "", date: "" })}>Fără țintă</button>
            </div>
            <div className="row2">
              <Field label="La km"><NumberInput placeholder={String((v.km || 0) + rec.km)} value={d.km} onChange={(km) => patch({ km })} /></Field>
              <Field label="Sau până la data"><DateInput future value={d.date} onChange={(date) => patch({ date })} /></Field>
            </div>
          </>
        ),
      }]}
      onDone={(d) => actions.patchVehicle(v.id, { nextServiceKm: numOrNull(d.km), nextServiceDate: d.date || null }, "🔧 Următorul service — salvat")}
    />
  );
}

/* ================= mașină: adăugare / editare ================= */

const markAutofocus = (el) => el?.setAttribute("autofocus", "");

function VehicleModal({ v, actions }) {
  const [start] = useState(() => ({
    make: v?.make ?? "", model: v?.model ?? "", plate: v?.plate ?? "", year: v?.year ?? "",
    fuel: v ? v.fuel ?? "" : FUELS[0], category: v ? v.category ?? "" : "autoturism",
    km: v?.km != null ? String(v.km) : "", driver: v?.driver ?? "", vin: v?.vin ?? "",
    notes: v?.notes ?? "", euroClass: v?.euroClass ?? "", vignetteCategory: v?.vignetteCategory ?? "", civ: v?.civ ?? "",
    usage: v?.usage ?? "", firstRegistration: v?.firstRegistration ?? "", newAtRegistration: v?.newAtRegistration !== false,
  }));
  const [f, setF] = useState(start);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const setValue = (k, value) => { setError(null); setF({ ...f, [k]: value }); };
  const set = (k) => (e) => setValue(k, e.target.value);
  const close = useLatest(() => { if (!busy && (!changedFrom(start, f) || window.confirm(LEAVE_QUESTION))) actions.close(); });

  const save = async (e) => {
    e.preventDefault();
    const problem = vehicleFormError(f);
    if (problem) return setError(problem);
    const data = {
      make: f.make.trim(), model: f.model.trim(), plate: f.plate.trim().toUpperCase(),
      year: String(f.year).trim() || null, fuel: f.fuel || null, category: f.category || null,
      driver: f.driver.trim() || null, vin: f.vin.trim().toUpperCase() || null,
      notes: f.notes.trim() || null, euroClass: f.euroClass || null, vignetteCategory: f.vignetteCategory || null, civ: f.civ.trim().toUpperCase() || null,
      usage: f.category === "autoturism" || !f.category ? f.usage || null : null, firstRegistration: f.firstRegistration || null, newAtRegistration: !!f.newAtRegistration,
    };
    const km = numOrNull(f.km);
    setBusy(true);
    let ok;
    if (v) {
      if (km !== (v.km ?? null)) { data.km = km; data.kmUpdatedAt = new Date().toISOString(); }
      ok = await actions.patchVehicle(v.id, data, "Salvat");
    } else {
      ok = await actions.createVehicle({ ...data, km });
    }
    if (ok) return actions.close();
    setBusy(false);
    setError(SAVE_FAILED);
  };
  const del = async () => {
    if (!confirm(`Ștergi ${v.make} ${v.model || ""} (${v.plate}) și tot istoricul?`)) return;
    setBusy(true);
    if (await actions.removeVehicle(v.id)) return actions.close();
    setBusy(false);
  };
  const title = v ? "Editează mașina" : "Adaugă mașină";
  return (
    <ModalShell close={close} label={title}>
      <form onSubmit={save} noValidate>
        <h2>{title}</h2>
        <fieldset className="wiz-body" disabled={busy}>
          <div className="row2">
            <Field label="Marcă"><input ref={markAutofocus} placeholder="Dacia" autoComplete="off" required value={f.make} onChange={set("make")} /></Field>
            <Field label="Model"><input placeholder="Duster" autoComplete="off" value={f.model} onChange={set("model")} /></Field>
          </div>
          <div className="row2">
            <Field label="Număr de înmatriculare"><input placeholder="B 123 ABC" autoComplete="off" required value={f.plate} onChange={set("plate")} /></Field>
            <Field label="An (opțional)"><NumberInput placeholder="2021" min="1950" max={+todayStr().slice(0, 4) + 1} value={f.year} onChange={(year) => setValue("year", year)} /></Field>
          </div>
          <div className="row2">
            <Field label="Categorie">
              <select value={f.category} onChange={set("category")}>
                {!f.category && <option value="">Nespecificat</option>}
                {Object.entries(CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Combustibil">
              <select value={f.fuel} onChange={set("fuel")}>
                {!f.fuel && <option value="">Nespecificat</option>}
                {FUELS.map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
          </div>
          <div className="row2">
            <Field label="Kilometraj actual"><NumberInput placeholder="42380" value={f.km} onChange={(km) => setValue("km", km)} /></Field>
            <Field label="Șofer (opțional)"><input placeholder="Andrei" autoComplete="off" value={f.driver} onChange={set("driver")} /></Field>
          </div>
          <Field label="VIN (opțional)"><input placeholder="WBA…" autoComplete="off" maxLength={17} value={f.vin} onChange={set("vin")} /></Field>
          <details className="form-more" open={!!(f.firstRegistration || f.usage || !f.newAtRegistration)}>
            <summary>ITP: înmatriculare și utilizare (opțional)</summary>
            <div className="row2">
              <Field label="Data primei înmatriculări în RO" hint={f.firstRegistration ? null : "fără ea, prima ITP se estimează din anul fabricației"}>
                <DateInput value={f.firstRegistration} onChange={(firstRegistration) => setValue("firstRegistration", firstRegistration)} />
              </Field>
              {(f.category === "autoturism" || !f.category) && (
                <Field label="Utilizare">
                  <select value={f.usage} onChange={set("usage")}>
                    <option value="">Personal / firmă</option>
                    {Object.entries(USAGES).filter(([k]) => k !== "standard").map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </Field>
              )}
            </div>
            <label className="check">
              <input type="checkbox" checked={f.newAtRegistration} onChange={(e) => setValue("newAtRegistration", e.target.checked)} />
              Era nouă la prima înmatriculare în România
            </label>
            <div className="hint">Mașinile noi fac prima ITP mai târziu (autoturism: la 3 ani, utilitară: la 2 ani). Importurile second-hand fac ITP de la înmatriculare.</div>
          </details>
          <details className="form-more" open={!!(f.euroClass || f.vignetteCategory || f.civ)}>
            <summary>Rovinietă & RCA (opțional)</summary>
            <div className="row2">
              <Field label="Clasa Euro" hint={!f.euroClass && euroClassFor({ ...f, euroClass: null }) ? `după an: ${EURO_CLASSES[euroClassFor({ ...f, euroClass: null }).value]}` : null}>
                <select value={f.euroClass} onChange={set("euroClass")}>
                  <option value="">Automat (după an)</option>
                  {Object.entries(EURO_CLASSES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Field>
              <Field label="Categorie rovinietă" hint={!f.vignetteCategory ? `automat: ${VIGNETTE_CATEGORIES[vignetteCategoryFor({ category: f.category })]}` : null}>
                <select value={f.vignetteCategory} onChange={set("vignetteCategory")}>
                  <option value="">Automat (după categorie)</option>
                  {Object.entries(VIGNETTE_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Serie CIV (certificat de înmatriculare)"><input placeholder="J123456" autoComplete="off" maxLength={20} value={f.civ} onChange={set("civ")} /></Field>
          </details>
          <Field label="Observații (opțional)"><textarea rows={2} value={f.notes} onChange={set("notes")} placeholder="ex: mașina nouă, leasing BT, cheia de rezervă la birou" /></Field>
        </fieldset>
        {error && <div className="form-err" role="alert">⚠ {error}</div>}
        <div className="modal-actions">
          {v && <button type="button" className="btn danger small push-left" onClick={del} disabled={busy}>Șterge</button>}
          <button type="button" className="btn ghost" onClick={actions.close} disabled={busy}>Anulează</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? "Se salvează…" : "Salvează"}</button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ================= detaliu eveniment ================= */

function EventModal({ v, eid, actions }) {
  const [busy, setBusy] = useState(false);
  const e = (v.events || []).find((x) => x.id === eid);
  if (!e) return null;
  const unit = v.fuel === "Electric" ? "kWh" : "L";
  const ppl = e.kind === "fuel" ? pricePerLiter(e.cost, e.liters) : null;
  const rows = [
    ["Data", fmtDate(e.date)],
    e.cost ? ["Cost", fmtMoney(e.cost)] : null,
    e.liters ? [unit === "kWh" ? "Energie" : "Litri", `${fmtQty(e.liters)} ${unit}`] : null,
    ppl ? [`Preț pe ${unit}`, fmtMoney(Math.round(ppl * 100) / 100)] : null,
    e.km != null ? [e.kind === "odometer" ? "Km la bord" : "Kilometraj", `${fmtKm(e.km)} km`] : null,
    e.note ? [e.kind === "document" ? "Furnizor" : "Notă", e.note] : null,
  ].filter(Boolean);
  const del = async () => {
    if (!confirm("Ștergi această intrare?")) return;
    setBusy(true);
    if (await actions.deleteEvent(v.id, eid)) return actions.close();
    setBusy(false);
  };
  const photo = e.hasPhoto ? vehiclesApi.photoUrl(v.id, e.id) : null;
  return (
    <ModalShell close={actions.close} label={eventTitle(e)}>
      <h2><span aria-hidden="true">{eventIcon(e)}</span> {eventTitle(e)}</h2>
      <dl className="detail-rows">
        {rows.map(([k, val]) => <div key={k} className="dr"><dt>{k}</dt><dd>{val}</dd></div>)}
      </dl>
      {photo && (
        <a href={photo} target="_blank" rel="noopener" className="photo-link">
          <img className="full" src={photo} loading="lazy" alt={`Poza atașată — ${eventTitle(e)}, ${fmtDate(e.date)}`} />
        </a>
      )}
      <div className="modal-actions">
        <button type="button" className="btn danger small push-left" onClick={del} disabled={busy}>{busy ? "Se șterge…" : "Șterge"}</button>
        <button type="button" className="btn ghost" onClick={actions.close}>Închide</button>
      </div>
    </ModalShell>
  );
}

/* ================= dispecer ================= */

export default function ModalHost({ modal, vehicles, actions: appActions, account, features }) {
  const actions = { ...appActions, close: () => appActions.closeModal(modal) };
  const v = modal.vid ? vehicles.find((x) => x.id === modal.vid) : null;
  const car = { v, actions, features };
  switch (modal.kind) {
    case "account": return <AccountModal account={account} features={features} actions={actions} reason={modal.reason} knownPassword={modal.password} />;
    case "import":  return <ImportModal vehicles={vehicles} actions={actions} account={account} />;
    case "browserData": return <BrowserDataModal list={modal.vehicles} account={account} actions={actions} />;
    case "vehicle": return (!modal.vid || v) && <VehicleModal v={v} actions={actions} />;
    case "work":    return v && <WorkWizard {...car} />;
    case "fuel":    return v && <FuelWizard {...car} />;
    case "expense": return v && <ExpenseWizard {...car} />;
    case "doc":     return v && <DocWizard {...car} preType={DOC_TYPES[modal.preType] ? modal.preType : null} />;
    case "renew":   return v && DOC_TYPES[modal.type] && <RenewWizard {...car} account={account} type={modal.type} />;
    case "km":      return v && <KmWizard {...car} />;
    case "tyres":   return v && <TyresWizard {...car} />;
    case "service": return v && <ServiceWizard {...car} />;
    case "event":   return v && <EventModal {...car} eid={modal.eid} />;
    case "invoices": return <InvoiceModal vehicles={vehicles} v={v} actions={actions} account={account} features={features} />;
    case "tracking": return v && <TrackingModal v={v} actions={actions} />;
    default: return null;
  }
}
