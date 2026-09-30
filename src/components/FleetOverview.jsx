import { useMemo, useState } from "react";
import { fleetSummary, spentTitle, periodPhrase, dominantCategory, countOf, aniText, fmtDecimal, fmtPerKm, typicalKmNote, COST_LABELS } from "../lib/analytics";
import { fmtMoney, fmtKm } from "../lib/model";
import { nav } from "../lib/nav";
import {
  ChartCard, RankingBars, PeriodFilter, usePeriod, StatTile, SpendingHero, SpendingChart, moneyCell,
  COST_SERIES, SINGLE_COLOR, REF_COLOR,
} from "./charts";

const KM_ROWS_SHOWN = 8;
const openCosts = (row) => nav(`#/car/${row.id}/costs`);
const carCell = (r) => <a href={`#/car/${r.id}/costs`}>{r.name}</a>;
const cars = (n) => countOf(n, "mașină", "mașini");
const perYear = (fuel) => `~${fmtMoney(Math.round(fuel.costYear))}/an`;
const consText = (fuel) => `${fmtDecimal(fuel.cons)} ${fuel.unit}/100 km`;

function kmVerdict(cmp) {
  if (!cmp) return "fără an de fabricație · ritm din citiri";
  const verdict = cmp.phrase ?? (cmp.typicalNow == null ? "fără referință pentru această categorie" : "prea nouă pentru o comparație");
  return `din ${cmp.since} · ${aniText(cmp.years)} · ${verdict}`;
}

export default function FleetOverview({ vehicles, account, actions }) {
  const [period, setPeriod] = usePeriod();
  const [allKm, setAllKm] = useState(false);
  const s = useMemo(() => fleetSummary(vehicles, period), [vehicles, period, account?.currency]);
  const head = (
    <>
      <button className="back" onClick={() => nav("#/")}>← Garaj</button>
      <div className="page-title">📊 Dashboard flotă</div>
    </>
  );

  if (!vehicles.length)
    return (
      <>
        {head}
        <section className="chart-card">
          <p className="chart-empty">Dashboard-ul se completează după ce adaugi mașini în garaj.</p>
          <button className="btn" style={{ marginTop: 12 }} onClick={() => actions?.openModal({ kind: "vehicle" })}>+ Adaugă o mașină</button>
        </section>
      </>
    );

  const { spent, fuelYear, kmAn, perKm, top } = s;
  const kmShown = allKm ? s.km : s.km.slice(0, KM_ROWS_SHOWN);
  const anyKmRef = s.km.some((r) => r.cmp?.expectedKmAn);

  return (
    <>
      {head}
      <PeriodFilter value={period} onChange={setPeriod} caption={s.series.caption} />

      <SpendingHero
        spent={spent}
        range={s.range}
        sub={`${cars(s.count)} · ${countOf(spent.count, "plată înregistrată", "plăți înregistrate")} · fără estimări`}
        empty="Nicio cheltuială înregistrată în perioada aleasă. Sumele apar pe măsură ce adaugi alimentări, lucrări și documente."
      />

      <div className="tiles">
        <StatTile icon="🚗" label="Vehicule" value={s.count} sub={kmAn.cars ? `km/an calculat pentru ${cars(kmAn.cars)}` : "km/an apare după an de fabricație sau 2 citiri de km"} />
        <StatTile
          icon="⚠️"
          label="Necesită atenție"
          value={s.attention}
          sub={s.attention ? "documente, service sau anvelope" : "nimic urgent"}
          onClick={s.attention ? () => nav("#/") : undefined}
        />
        <StatTile
          icon="📐"
          label="Cost mediu pe km"
          value={perKm ? fmtPerKm(perKm.perKm) : null}
          sub={perKm ? `pe ${fmtKm(perKm.km)} km acoperiți de citiri` : "necesită citiri de kilometraj și cheltuieli în perioadă"}
        />
      </div>

      <SpendingChart series={s.series} />

      <div className="dash-grid">
        <ChartCard
          title="Top 5 după cheltuieli"
          sub={spentTitle(s.range)}
          empty={top.cost.length ? null : "Nicio cheltuială înregistrată în perioada aleasă."}
          table={{
            columns: [
              { key: "car", label: "Mașină" }, { key: "plate", label: "Nr." },
              ...COST_SERIES.map((c) => ({ key: c.key, label: c.label, num: true })),
              { key: "total", label: "Total", num: true },
            ],
            rows: top.cost.map((r) => ({
              id: r.id, car: carCell(r), plate: r.plate,
              ...Object.fromEntries(COST_SERIES.map((c) => [c.key, moneyCell(r.cats[c.key])])),
              total: fmtMoney(r.total),
            })),
          }}
        >
          <RankingBars
            label="Mașinile cu cele mai mari cheltuieli"
            onSelect={openCosts}
            rows={top.cost.map((r) => ({
              id: r.id, label: r.name, meta: r.plate, value: r.total, valueText: fmtMoney(r.total),
              sub: `mai ales ${COST_LABELS[dominantCategory(r.cats)].toLowerCase()} · ${countOf(r.count, "plată", "plăți")}`,
              tip: COST_SERIES.filter((c) => r.cats[c.key] > 0).map((c) => ({ label: c.label, value: fmtMoney(r.cats[c.key]), color: c.color })),
            }))}
          />
        </ChartCard>

        <ChartCard
          title="Top 5 după reparații"
          sub={`numărul de lucrări de mentenanță ${periodPhrase(s.range)}, apoi costul`}
          empty={top.repairs.length ? null : "Nicio lucrare de mentenanță înregistrată în perioada aleasă."}
          table={{
            columns: [
              { key: "car", label: "Mașină" }, { key: "plate", label: "Nr." },
              { key: "count", label: "Lucrări", num: true }, { key: "cost", label: "Cost", num: true }, { key: "types", label: "Tipuri" },
            ],
            rows: top.repairs.map((r) => ({
              id: r.id, car: carCell(r), plate: r.plate, count: r.count, cost: moneyCell(r.cost),
              types: r.byType.map((t) => `${t.label} (${t.count})`).join(", "),
            })),
          }}
        >
          <RankingBars
            label="Mașinile cu cele mai multe reparații"
            onSelect={openCosts}
            rows={top.repairs.map((r) => ({
              id: r.id, label: r.name, meta: r.plate, value: r.count, valueText: countOf(r.count, "lucrare", "lucrări"),
              sub: `${fmtMoney(r.cost)} · ${r.byType.slice(0, 2).map((t) => t.label.toLowerCase()).join(", ")}`,
              tip: r.byType.map((t) => ({ label: t.label, value: `${t.count}× · ${fmtMoney(t.cost)}` })),
            }))}
          />
        </ChartCard>
      </div>

      <h2 className="dash-section">Estimări anuale</h2>
      <p className="dash-note">Proiecții pe baza kilometrajului — nu depind de perioada aleasă și nu sunt adunate la sumele cheltuite.</p>

      <div className="tiles">
        <StatTile
          icon="⛽"
          label="Combustibil estimat pe an"
          value={fuelYear.cars ? `~${fmtMoney(Math.round(fuelYear.total))}` : null}
          sub={fuelYear.cars ? `pentru ${cars(fuelYear.cars)} · ${fuelYear.real} cu consum real` : "adaugă kilometrajul și anul mașinilor"}
        />
        <StatTile
          icon="🛣️"
          label="Km flotă pe an"
          value={kmAn.cars ? `~${fmtKm(kmAn.total)} km` : null}
          sub={kmAn.cars ? `suma km/an pentru ${cars(kmAn.cars)}` : "adaugă kilometrajul mașinilor"}
        />
      </div>

      <div className="dash-grid">
        <ChartCard
          title="Top 5 consum de combustibil"
          sub="cost estimat pe an = km/an × consum × preț"
          empty={top.fuel.length ? null : "Pentru estimare e nevoie de kilometraj și de anul fabricației (sau de două citiri de kilometraj)."}
          table={{
            columns: [
              { key: "car", label: "Mașină" }, { key: "cons", label: "Consum", num: true }, { key: "source", label: "Sursă" },
              { key: "km", label: "Km/an", num: true }, { key: "price", label: "Preț", num: true }, { key: "year", label: "Cost/an", num: true },
            ],
            rows: top.fuel.map((r) => ({
              id: r.id, car: carCell(r), cons: consText(r.fuel), source: r.fuel.real ? "real" : "estimat",
              km: fmtKm(r.fuel.kmAn), price: `${fmtMoney(r.fuel.price)}/${r.fuel.unit}`, year: perYear(r.fuel),
            })),
          }}
        >
          <RankingBars
            label="Mașinile cu cel mai mare cost estimat cu combustibilul"
            onSelect={openCosts}
            rows={top.fuel.map((r) => ({
              id: r.id, label: r.name, meta: r.plate, value: r.fuel.costYear, valueText: perYear(r.fuel),
              sub: `${consText(r.fuel)} ${r.fuel.real ? "(real)" : "(estimat)"} · ~${fmtKm(r.fuel.kmAn)} km/an`,
              tip: [
                { label: r.fuel.real ? "consum real" : "consum mediu estimat", value: consText(r.fuel) },
                { label: r.fuel.pricePaid ? "preț plătit în medie" : "preț de referință", value: `${fmtMoney(r.fuel.price)}/${r.fuel.unit}` },
                { label: "pe lună", value: `~${fmtMoney(Math.round(r.fuel.costMonth))}` },
              ],
            }))}
          />
        </ChartCard>

        <ChartCard
          title="Km pe an, pe mașină"
          sub="media de la anul fabricației, față de o mașină tipică de aceeași vârstă"
          legend={anyKmRef ? [
            { label: "km/an de la fabricație", color: SINGLE_COLOR },
            { label: "tipic pentru vârsta ei", color: REF_COLOR, shape: "line" },
          ] : null}
          empty={s.km.length ? null : "Adaugă kilometrajul și anul fabricației ca să vezi câți km face fiecare mașină pe an."}
          footer={s.km.length ? typicalKmNote() : null}
          table={{
            columns: [
              { key: "car", label: "Mașină" }, { key: "since", label: "An fabr.", num: true }, { key: "km", label: "Km", num: true },
              { key: "kmAn", label: "Km/an", num: true }, { key: "typical", label: "Tipic km/an", num: true }, { key: "verdict", label: "Comparație" },
            ],
            rows: s.km.map((r) => ({
              id: r.id, car: carCell(r), since: r.cmp?.since ?? "—", km: r.cmp ? fmtKm(r.cmp.km) : "—",
              kmAn: fmtKm(r.kmAn), typical: r.cmp?.expectedKmAn ? fmtKm(r.cmp.expectedKmAn) : "—", verdict: r.cmp?.phrase ?? "—",
            })),
          }}
        >
          <RankingBars
            label="Km pe an pentru fiecare mașină"
            onSelect={openCosts}
            rows={kmShown.map((r) => ({
              id: r.id, label: r.name, meta: r.plate, value: r.kmAn, valueText: `${fmtKm(r.kmAn)} km/an`,
              ref: r.cmp?.expectedKmAn || null, sub: kmVerdict(r.cmp),
              tip: [
                r.cmp && { label: "de la fabricație", value: `${fmtKm(r.cmp.km)} km` },
                r.cmp?.expectedTotal && { label: "tipic la vârsta ei", value: `~${fmtKm(r.cmp.expectedTotal)} km` },
                r.rate?.source === "readings" && { label: "ritm din citiri", value: `${fmtKm(r.rate.kmAn)} km/an` },
              ].filter(Boolean),
            }))}
          />
          {s.km.length > KM_ROWS_SHOWN && (
            <button type="button" className="btn ghost small rank-more" onClick={() => setAllKm((x) => !x)}>
              {allKm ? "Arată mai puține" : `Arată toate (${s.km.length})`}
            </button>
          )}
        </ChartCard>
      </div>
    </>
  );
}
