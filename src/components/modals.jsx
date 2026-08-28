import { useEffect, useState } from "react";
import {
  DOC_TYPES, MAINT_TYPES, FUELS,
  todayStr, fmtKm, fmtMoney, fmtDate, daysLeft, zile,
  eventTitle, eventIcon,
} from "../lib/model";

/* ================= infrastructură ================= */

function ModalShell({ close, children }) {
  useEffect(() => {
    const f = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", f);
    return () => document.removeEventListener("keydown", f);
  }, [close]);
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal">{children}</div>
    </div>
  );
}

/* Vrăjitor conversațional: un pas = o întrebare */
function Wizard({ steps, initial = {}, onDone, close, toast }) {
  const [i, setI] = useState(0);
  const [d, setD] = useState(initial);
  const s = steps[i];
  const patch = (p) => setD((prev) => ({ ...prev, ...p }));
  const next = (skipped) => {
    if (!skipped && s.validate) {
      const err = s.validate(d);
      if (err) { toast("⚠ " + err); return; }
    }
    if (i + 1 >= steps.length) { close(); onDone(d); }
    else setI(i + 1);
  };
  const title = typeof s.title === "function" ? s.title(d) : s.title;
  const sub = typeof s.sub === "function" ? s.sub(d) : s.sub;
  return (
    <ModalShell close={close}>
      <h2>{title}</h2>
      {sub && <div className="wiz-sub">{sub}</div>}
      {s.render(d, patch, () => next(true))}
      {!s.noButtons && (
        <div className="modal-actions">
          {s.skippable
            ? <button className="btn ghost" onClick={() => next(true)}>Sari peste</button>
            : <button className="btn ghost" onClick={close}>Anulează</button>}
          <button className="btn" onClick={() => next(false)}>{i === steps.length - 1 ? "Gata" : "Continuă"}</button>
        </div>
      )}
    </ModalShell>
  );
}

function Field({ label, children }) {
  return <div className="field"><label>{label}</label>{children}</div>;
}

function readPhoto(file) {
  return new Promise((resolve) => {
    const rd = new FileReader();
    rd.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const max = 1200, sc = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.72));
      };
      img.src = ev.target.result;
    };
    rd.readAsDataURL(file);
  });
}

const photoStep = () => ({
  title: "Adaugi factura?",
  sub: "O poză e de ajuns — rămâne atașată la această intrare.",
  skippable: true,
  render: (d, patch) => (
    <>
      <label className="file-btn">
        📎 Atașează o poză
        <input type="file" accept="image/*" onChange={async (e) => {
          const f = e.target.files[0];
          if (f) patch({ photo: await readPhoto(f) });
        }} />
      </label>
      <span className="muted" style={{ marginLeft: 10 }}>{d.photo ? "Atașată ✓" : ""}</span>
    </>
  ),
});

const num = (x) => (x === "" || x == null ? null : +x);

/* ================= fluxuri ================= */

function FuelWizard({ v, actions }) {
  return (
    <Wizard
      toast={actions.toast} close={actions.close}
      steps={[{
        title: "Alimentare",
        sub: "Doar suma e obligatorie — restul e opțional.",
        validate: (d) => (!num(d.cost) ? "Introdu suma" : null),
        render: (d, patch) => (
          <>
            <div className="row2">
              <Field label="Sumă (€)"><input type="number" inputMode="decimal" min="0" placeholder="82" autoFocus
                value={d.cost ?? ""} onChange={(e) => patch({ cost: e.target.value })} /></Field>
              <Field label="Litri (opțional)"><input type="number" inputMode="decimal" min="0" placeholder="52"
                value={d.liters ?? ""} onChange={(e) => patch({ liters: e.target.value })} /></Field>
            </div>
            <div className="row2">
              <Field label="Kilometraj (opțional)"><input type="number" inputMode="numeric" min="0" placeholder={v.km || ""}
                value={d.km ?? ""} onChange={(e) => patch({ km: e.target.value })} /></Field>
              <Field label="Data"><input type="date" value={d.date ?? todayStr()} onChange={(e) => patch({ date: e.target.value })} /></Field>
            </div>
          </>
        ),
      }]}
      onDone={(d) =>
        actions.addEvent(v.id, {
          event: { kind: "fuel", cost: num(d.cost), liters: num(d.liters), km: num(d.km), date: d.date || todayStr() },
        }, "⛽ Alimentare salvată")}
    />
  );
}

function WorkWizard({ v, actions }) {
  return (
    <Wizard
      toast={actions.toast} close={actions.close}
      steps={[
        {
          title: "Ce s-a făcut?", noButtons: true,
          render: (d, patch, skipNext) => (
            <div className="chips col">
              {Object.entries(MAINT_TYPES).map(([k, m]) => (
                <button key={k} className="chip big" onClick={() => { patch({ type: k }); skipNext(); }}>
                  {m.icon}&nbsp; {m.label}
                </button>
              ))}
            </div>
          ),
        },
        {
          title: (d) => (d.type === "service" ? "Service făcut ✅" : `${MAINT_TYPES[d.type]?.icon} ${MAINT_TYPES[d.type]?.label}`),
          sub: (d) => (d.type === "service" ? "Super. Când urmează următorul service?" : null),
          skippable: true,
          render: (d, patch) =>
            d.type === "service" ? (
              <>
                <div className="chips">
                  <button className="chip" onClick={() => patch({ kmInterval: "10000" })}>10.000 km</button>
                  <button className="chip" onClick={() => patch({ kmInterval: "15000" })}>15.000 km</button>
                  <button className="chip" onClick={() => patch({ months: "12" })}>12 luni</button>
                </div>
                <div className="row2">
                  <Field label="Peste câți km"><input type="number" inputMode="numeric" value={d.kmInterval ?? "10000"}
                    onChange={(e) => patch({ kmInterval: e.target.value })} /></Field>
                  <Field label="Sau luni"><input type="number" inputMode="numeric" value={d.months ?? "12"}
                    onChange={(e) => patch({ months: e.target.value })} /></Field>
                </div>
              </>
            ) : (
              <Field label="Notă (opțional)">
                <input placeholder={d.type === "tyres" ? "ex: perechea din față, Michelin" : "ce s-a făcut?"}
                  value={d.note ?? ""} onChange={(e) => patch({ note: e.target.value })} autoFocus />
              </Field>
            ),
        },
        {
          title: "Cât a costat?", skippable: true,
          render: (d, patch) => (
            <Field label="Cost (€)"><input type="number" inputMode="decimal" min="0" placeholder="420" autoFocus
              value={d.cost ?? ""} onChange={(e) => patch({ cost: e.target.value })} /></Field>
          ),
        },
        photoStep(),
      ]}
      onDone={(d) => {
        const patchV = {};
        if (d.type === "service") {
          const kmInterval = num(d.kmInterval ?? "10000");
          const months = num(d.months ?? "12");
          if (kmInterval && v.km) patchV.nextServiceKm = v.km + kmInterval;
          if (months) { const x = new Date(); x.setMonth(x.getMonth() + months); patchV.nextServiceDate = x.toISOString().slice(0, 10); }
        }
        if (d.type === "tyres") { patchV.tyres = "good"; if (d.note) patchV.tyresNote = d.note; }
        actions.addEvent(v.id, {
          event: { kind: "maintenance", type: d.type, cost: num(d.cost), note: d.note || null, km: v.km || null, photo: d.photo || null },
          patch: patchV,
        }, `${MAINT_TYPES[d.type].icon} ${MAINT_TYPES[d.type].label} — salvat`);
      }}
    />
  );
}

function ExpenseWizard({ v, actions }) {
  return (
    <Wizard
      toast={actions.toast} close={actions.close}
      steps={[{
        title: "Cheltuială",
        sub: "Pentru orice altceva în afara lucrărilor majore.",
        validate: (d) => (!d.label?.trim() ? "Scrie ce a fost" : !num(d.cost) ? "Introdu costul" : null),
        render: (d, patch) => (
          <>
            <Field label="Ce a fost?"><input placeholder="Parcare, spălătorie, ștergătoare…" autoFocus
              value={d.label ?? ""} onChange={(e) => patch({ label: e.target.value })} /></Field>
            <div className="row2">
              <Field label="Cost (€)"><input type="number" inputMode="decimal" min="0"
                value={d.cost ?? ""} onChange={(e) => patch({ cost: e.target.value })} /></Field>
              <Field label="Data"><input type="date" value={d.date ?? todayStr()} onChange={(e) => patch({ date: e.target.value })} /></Field>
            </div>
          </>
        ),
      }]}
      onDone={(d) =>
        actions.addEvent(v.id, {
          event: { kind: "expense", label: d.label.trim(), cost: num(d.cost), date: d.date || todayStr() },
        }, "💶 Cheltuială salvată")}
    />
  );
}

function DocWizard({ v, actions, preType }) {
  const detailStep = {
    title: (d) => `${DOC_TYPES[d.type]?.icon} ${DOC_TYPES[d.type]?.label}`,
    sub: "📷 Scanarea documentelor vine mai târziu — deocamdată doar esențialul.",
    validate: (d) => (!d.expires ? "Alege data de expirare" : null),
    render: (d, patch) => (
      <>
        <Field label="Expiră la"><input type="date" autoFocus value={d.expires ?? ""} onChange={(e) => patch({ expires: e.target.value })} /></Field>
        <div className="row2">
          <Field label="Furnizor (opțional)"><input placeholder="Allianz, Groupama…"
            value={d.provider ?? ""} onChange={(e) => patch({ provider: e.target.value })} /></Field>
          <Field label="Cost (opțional)"><input type="number" inputMode="decimal" min="0"
            value={d.cost ?? ""} onChange={(e) => patch({ cost: e.target.value })} /></Field>
        </div>
      </>
    ),
  };
  const typeStep = {
    title: "Ce document?", noButtons: true,
    render: (d, patch, skipNext) => (
      <div className="chips col">
        {Object.entries(DOC_TYPES).map(([k, m]) => (
          <button key={k} className="chip big" onClick={() => { patch({ type: k }); skipNext(); }}>
            {m.icon}&nbsp; {m.label}
          </button>
        ))}
      </div>
    ),
  };
  return (
    <Wizard
      toast={actions.toast} close={actions.close}
      initial={preType ? { type: preType } : {}}
      steps={preType ? [detailStep] : [typeStep, detailStep]}
      onDone={(d) =>
        actions.putDocument(v.id, d.type,
          { expires: d.expires, provider: d.provider?.trim() || null, cost: num(d.cost) },
          `${DOC_TYPES[d.type].icon} ${DOC_TYPES[d.type].label} salvat — expiră ${fmtDate(d.expires)}`)}
    />
  );
}

function RenewWizard({ v, actions, type }) {
  const meta = DOC_TYPES[type];
  const d0 = (v.documents || []).filter((x) => x.type === type).sort((a, b) => (b.expires || "").localeCompare(a.expires || ""))[0];
  const dl = d0 ? daysLeft(d0.expires) : null;
  return (
    <Wizard
      toast={actions.toast} close={actions.close}
      steps={[{
        title: `Reînnoiește ${meta.label}`,
        sub: d0 ? (dl < 0 ? `A expirat acum ${zile(dl)}.` : `Valabil până la ${fmtDate(d0.expires)} (încă ${zile(dl)}).`) : null,
        validate: (d) => (!d.expires ? "Alege noua dată de expirare" : null),
        render: (d, patch) => (
          <>
            <Field label="Noua dată de expirare"><input type="date" autoFocus value={d.expires ?? ""} onChange={(e) => patch({ expires: e.target.value })} /></Field>
            <div className="row2">
              <Field label="Furnizor (opțional)"><input value={d.provider ?? d0?.provider ?? ""} onChange={(e) => patch({ provider: e.target.value })} /></Field>
              <Field label="Cost (opțional)"><input type="number" inputMode="decimal" min="0"
                value={d.cost ?? ""} onChange={(e) => patch({ cost: e.target.value })} /></Field>
            </div>
            <div className="hint">Cumpărarea RCA / rovinietei direct din aplicație e pe roadmap — deocamdată reînnoiești la furnizor și notezi aici.</div>
          </>
        ),
      }]}
      onDone={(d) =>
        actions.putDocument(v.id, type,
          { expires: d.expires, provider: (d.provider ?? d0?.provider)?.trim() || null, cost: num(d.cost) },
          `♻️ ${meta.label} reînnoit până la ${fmtDate(d.expires)}`)}
    />
  );
}

function KmWizard({ v, actions }) {
  return (
    <Wizard
      toast={actions.toast} close={actions.close}
      steps={[{
        title: "Actualizează kilometrajul",
        validate: (d) => (!num(d.km) ? "Introdu kilometrajul" : null),
        render: (d, patch) => (
          <Field label="Km actuali"><input type="number" inputMode="numeric" autoFocus
            value={d.km ?? v.km ?? ""} onChange={(e) => patch({ km: e.target.value })} /></Field>
        ),
      }]}
      onDone={(d) => actions.patchVehicle(v.id, { km: num(d.km), kmUpdatedAt: new Date().toISOString() }, "Kilometraj actualizat")}
    />
  );
}

function TyresWizard({ v, actions }) {
  return (
    <Wizard
      toast={actions.toast} close={actions.close}
      steps={[{
        title: "Anvelope", noButtons: true,
        render: (d, patch, skipNext) => (
          <div className="chips col">
            <button className="chip big" onClick={() => { patch({ tyres: "good" }); skipNext(); }}>🟢&nbsp; Bune</button>
            <button className="chip big" onClick={() => { patch({ tyres: "attention" }); skipNext(); }}>🟠&nbsp; Necesită verificare</button>
          </div>
        ),
      }]}
      onDone={(d) => actions.patchVehicle(v.id, { tyres: d.tyres }, "Anvelope actualizate")}
    />
  );
}

function ServiceWizard({ v, actions }) {
  return (
    <Wizard
      toast={actions.toast} close={actions.close}
      initial={{ km: v.nextServiceKm ?? "", date: v.nextServiceDate ?? "" }}
      steps={[{
        title: "Următorul service",
        sub: "Setează oricare dintre ele — FleetDeck te avertizează când se apropie.",
        validate: (d) => (!num(d.km) && !d.date ? "Setează km sau o dată" : null),
        render: (d, patch) => (
          <div className="row2">
            <Field label="La km"><input type="number" inputMode="numeric" placeholder={(v.km || 0) + 10000}
              value={d.km ?? ""} onChange={(e) => patch({ km: e.target.value })} /></Field>
            <Field label="Sau până la data"><input type="date" value={d.date ?? ""} onChange={(e) => patch({ date: e.target.value })} /></Field>
          </div>
        ),
      }]}
      onDone={(d) => actions.patchVehicle(v.id, { nextServiceKm: num(d.km), nextServiceDate: d.date || null }, "Următorul service — salvat")}
    />
  );
}

/* ================= mașină: adăugare / editare ================= */

function VehicleModal({ v, actions }) {
  const [f, setF] = useState({
    make: v?.make ?? "", model: v?.model ?? "", plate: v?.plate ?? "", year: v?.year ?? "",
    fuel: v?.fuel ?? FUELS[0], km: v?.km ?? "", vin: v?.vin ?? "",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = () => {
    if (!f.make.trim() || !f.plate.trim()) { actions.toast("⚠ Marca și numărul sunt obligatorii"); return; }
    const data = {
      make: f.make.trim(), model: f.model.trim(), plate: f.plate.trim().toUpperCase(),
      year: f.year || null, fuel: f.fuel, vin: f.vin.trim().toUpperCase() || null,
    };
    actions.close();
    if (v) {
      const km = num(f.km);
      if (km && km !== v.km) { data.km = km; data.kmUpdatedAt = new Date().toISOString(); }
      actions.patchVehicle(v.id, data, "Salvat");
    } else {
      actions.createVehicle({ ...data, km: num(f.km) });
    }
  };
  const del = () => {
    if (confirm(`Ștergi ${v.make} ${v.model} (${v.plate}) și tot istoricul?`)) { actions.close(); actions.removeVehicle(v.id); }
  };
  return (
    <ModalShell close={actions.close}>
      <h2>{v ? "Editează mașina" : "Adaugă mașină"}</h2>
      <div className="row2">
        <Field label="Marcă"><input placeholder="Dacia" autoFocus value={f.make} onChange={set("make")} /></Field>
        <Field label="Model"><input placeholder="Duster" value={f.model} onChange={set("model")} /></Field>
      </div>
      <div className="row2">
        <Field label="Număr de înmatriculare"><input placeholder="B 123 ABC" value={f.plate} onChange={set("plate")} /></Field>
        <Field label="An (opțional)"><input type="number" placeholder="2021" value={f.year} onChange={set("year")} /></Field>
      </div>
      <div className="row2">
        <Field label="Combustibil">
          <select value={f.fuel} onChange={set("fuel")}>{FUELS.map((x) => <option key={x}>{x}</option>)}</select>
        </Field>
        <Field label="Kilometraj actual"><input type="number" inputMode="numeric" placeholder="42380" value={f.km} onChange={set("km")} /></Field>
      </div>
      <Field label="VIN (opțional)"><input placeholder="WBA…" maxLength={17} value={f.vin} onChange={set("vin")} /></Field>
      <div className="modal-actions">
        {v && <button className="btn danger small" style={{ marginRight: "auto" }} onClick={del}>Șterge</button>}
        <button className="btn ghost" onClick={actions.close}>Anulează</button>
        <button className="btn" onClick={save}>Salvează</button>
      </div>
    </ModalShell>
  );
}

/* ================= detaliu eveniment ================= */

function EventModal({ v, eid, actions }) {
  const e = (v.events || []).find((x) => x.id === eid);
  if (!e) return null;
  const rows = [
    ["Data", fmtDate(e.date)],
    e.cost ? ["Cost", fmtMoney(e.cost)] : null,
    e.liters ? ["Litri", `${e.liters} L`] : null,
    e.km ? ["Kilometraj", `${fmtKm(e.km)} km`] : null,
    e.note ? ["Notă", e.note] : null,
  ].filter(Boolean);
  return (
    <ModalShell close={actions.close}>
      <h2>{eventIcon(e)} {eventTitle(e)}</h2>
      <div className="detail-rows">
        {rows.map(([k, val]) => <div key={k} className="dr"><span>{k}</span><b>{val}</b></div>)}
      </div>
      {e.photo && <img className="full" src={e.photo} alt="factură" />}
      <div className="modal-actions">
        <button className="btn danger small" onClick={() => {
          if (confirm("Ștergi această intrare?")) { actions.close(); actions.deleteEvent(v.id, eid); }
        }}>Șterge</button>
        <button className="btn ghost" onClick={actions.close}>Închide</button>
      </div>
    </ModalShell>
  );
}

/* ================= profil (e-mail de remindere) ================= */

function AccountModal({ user, email, isCloud, actions }) {
  const [val, setVal] = useState(email || "");
  const save = () => {
    const e = val.trim().toLowerCase();
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { actions.toast("⚠ adresă de e-mail invalidă"); return; }
    actions.close();
    actions.saveEmail(e || null);
  };
  return (
    <ModalShell close={actions.close}>
      <h2>👤 {user}</h2>
      <div className="wiz-sub">Aici primești reminderele zilnice — doar pentru mașinile tale.</div>
      <Field label="E-mail pentru remindere">
        <input type="email" autoFocus placeholder="dan@exemplu.ro" value={val} onChange={(e) => setVal(e.target.value)} />
      </Field>
      {!isCloud && <div className="hint">⚠ Rulezi în modul local — e-mailurile se trimit doar după publicarea pe Netlify.</div>}
      <div className="hint">Lași câmpul gol = fără e-mailuri; alertele rămân vizibile în aplicație.</div>
      <div className="modal-actions">
        <button className="btn ghost" onClick={actions.close}>Anulează</button>
        <button className="btn" onClick={save}>Salvează</button>
      </div>
    </ModalShell>
  );
}

/* ================= dispecer ================= */

export default function ModalHost({ modal, vehicles, actions, accountEmail, user, isCloud }) {
  const v = modal.vid ? vehicles.find((x) => x.id === modal.vid) : null;
  switch (modal.kind) {
    case "account": return <AccountModal user={user} email={accountEmail} isCloud={isCloud} actions={actions} />;
    case "vehicle": return <VehicleModal v={v} actions={actions} />;
    case "fuel":    return v && <FuelWizard v={v} actions={actions} />;
    case "work":    return v && <WorkWizard v={v} actions={actions} />;
    case "expense": return v && <ExpenseWizard v={v} actions={actions} />;
    case "doc":     return v && <DocWizard v={v} actions={actions} preType={modal.preType} />;
    case "renew":   return v && <RenewWizard v={v} actions={actions} type={modal.type} />;
    case "km":      return v && <KmWizard v={v} actions={actions} />;
    case "tyres":   return v && <TyresWizard v={v} actions={actions} />;
    case "service": return v && <ServiceWizard v={v} actions={actions} />;
    case "event":   return v && <EventModal v={v} eid={modal.eid} actions={actions} />;
    default: return null;
  }
}
