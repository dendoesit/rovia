import { useMemo } from "react";
import { carSummary, countOf, aniText, inAniText, fmtDecimal, fmtPerKm, periodPhrase, typicalKmNote, kmYearBuckets } from "../lib/analytics";
import { fmtMoney, fmtKm, fmtDate } from "../lib/model";
import {
  ChartCard, RankingBars, StackedMonthlyBars, PeriodFilter, usePeriod, StatTile, SpendingHero, SpendingChart, moneyCell,
  SINGLE_COLOR,
} from "./charts";

const KM_SERIES = [{ key: "km", label: "Km parcurși", color: SINGLE_COLOR }];
const kmText = (n) => `${fmtKm(n)} km`;

export default function CarCosts({ v, account }) {
  const [period, setPeriod] = usePeriod();
  const s = useMemo(() => carSummary(v, period), [v, period, account?.currency]);
  const { spent, perKm, repairs, lastService: ls } = s;

  return (
    <>
      <PeriodFilter value={period} onChange={setPeriod} caption={s.series.caption} />

      <SpendingHero
        spent={spent}
        range={s.range}
        sub={`${countOf(spent.count, "plată înregistrată", "plăți înregistrate")} · fără estimări`}
        empty="Costurile apar aici pe măsură ce înregistrezi alimentări, lucrări și documente."
      />

      <div className="tiles">
        <StatTile
          icon="📐"
          label="Cost pe km"
          value={perKm ? fmtPerKm(perKm.perKm) : null}
          sub={perKm
            ? `${fmtMoney(perKm.cost)} pe ${kmText(perKm.km)} · ${fmtDate(perKm.from)} – ${fmtDate(perKm.to)}`
            : "necesită citiri de kilometraj și cheltuieli în perioadă"}
        />
        <StatTile
          icon="🛠️"
          label="Lucrări"
          value={repairs.count ? countOf(repairs.count, "lucrare", "lucrări") : null}
          sub={repairs.count ? `${fmtMoney(repairs.cost)} în perioadă` : "nicio lucrare în perioadă"}
        />
        <StatTile
          icon="🔧"
          label="Ultimul service"
          value={ls ? (ls.cost ? fmtMoney(ls.cost) : fmtDate(ls.date)) : null}
          sub={ls ? `${fmtDate(ls.date)}${ls.km ? ` · la ${kmText(ls.km)}` : ""}` : "înregistrează o revizie"}
        />
      </div>

      <SpendingChart series={s.series} />

      <ChartCard
        title="Reparații și lucrări pe tipuri"
        sub={repairs.count ? `${countOf(repairs.count, "lucrare", "lucrări")} · ${fmtMoney(repairs.cost)}` : null}
        empty={repairs.count ? null : "Nicio lucrare de mentenanță înregistrată în perioada aleasă."}
        table={{
          columns: [{ key: "type", label: "Tip" }, { key: "count", label: "Lucrări", num: true }, { key: "cost", label: "Cost", num: true }],
          rows: repairs.byType.map((t) => ({ id: t.type, type: t.label, count: t.count, cost: moneyCell(t.cost) })),
        }}
      >
        <RankingBars
          label="Costul lucrărilor pe tipuri"
          rows={repairs.byType.map((t) => ({
            id: t.type, label: `${t.icon} ${t.label}`, value: t.cost, valueText: t.cost ? fmtMoney(t.cost) : "fără cost",
            sub: countOf(t.count, "lucrare", "lucrări"),
          }))}
        />
      </ChartCard>

      <h2 className="dash-section">Kilometraj și estimări</h2>
      <p className="dash-note">Calculate din kilometraj și din anul fabricației — nu depind de perioada aleasă și nu se adună la cheltuit.</p>
      <KmFacts v={v} km={s.km} rate={s.rate} byYear={s.byYear} />
      <FuelEstimate v={v} fuel={s.fuel} logged={spent.cats.fuel} loggedWhen={periodPhrase(s.range)} />
    </>
  );
}

function KmFacts({ v, km, rate, byYear }) {
  const single = byYear.length === 1 ? byYear[0] : null;
  return (
    <>
      <section className="chart-card facts">
        <div className="chart-head"><div className="chart-titles"><h3>Kilometraj</h3></div></div>
        {km ? (
          <p>
            Din {km.since}: <b>{kmText(km.km)}</b> {inAniText(km.years)} ≈ <b>{fmtKm(km.kmAn)} km/an</b>
            {km.phrase ? <> — {km.phrase}</> : null}.
          </p>
        ) : (
          <p className="muted">{v.year ? "Actualizează kilometrajul" : "Completează anul fabricației"} ca să vezi câți km face mașina pe an.</p>
        )}
        {km?.expectedKmAn && (
          <p className="muted">
            O mașină tipică de {aniText(km.years)} ar avea ~{kmText(km.expectedTotal)} (≈ {fmtKm(km.expectedKmAn)} km/an); la vârsta ei de acum, ~{fmtKm(km.typicalNow)} km/an.
          </p>
        )}
        {km && km.typicalNow == null && <p className="muted">Nu avem o referință de kilometraj pentru această categorie de vehicul.</p>}
        {rate && (
          <p>
            Ritm din citiri: <b>~{fmtKm(rate.kmAn)} km/an</b>{" "}
            <span className="muted">({kmText(rate.km)} între {fmtDate(rate.from)} și {fmtDate(rate.to)})</span>
          </p>
        )}
        {single && (
          <p>
            În {single.year}: <b>{kmText(single.km)}</b> din citiri{single.partial ? `, pe ${countOf(single.days, "zi", "zile")} acoperite` : ""}.
          </p>
        )}
        {!byYear.length && <p className="muted">Km pe fiecare an apar după cel puțin două citiri de kilometraj (la alimentări, lucrări sau „Actualizează”).</p>}
        {km?.typicalNow != null && <p className="chart-foot">{typicalKmNote()}</p>}
      </section>

      {byYear.length > 1 && (
        <ChartCard
          title="Km parcurși pe an"
          sub={`din citirile de kilometraj, împărțite pe zile${byYear.some((r) => r.partial) ? " · * an acoperit doar parțial de citiri" : ""}`}
          table={{
            columns: [{ key: "year", label: "An" }, { key: "km", label: "Km", num: true }, { key: "cover", label: "Acoperire" }],
            rows: byYear.map((r) => ({ id: r.year, year: r.year, km: fmtKm(r.km), cover: r.partial ? `parțial (${countOf(r.days, "zi", "zile")})` : "tot anul" })),
          }}
        >
          <StackedMonthlyBars buckets={kmYearBuckets(byYear)} series={KM_SERIES} format={kmText} label="Km parcurși în fiecare an calendaristic" plotHeight={140} />
        </ChartCard>
      )}
    </>
  );
}

function FuelEstimate({ v, fuel, logged, loggedWhen }) {
  if (!fuel)
    return (
      <section className="chart-card facts">
        <div className="chart-head"><div className="chart-titles"><h3>Combustibil — estimare</h3></div></div>
        <p className="muted">
          {v.category === "remorca"
            ? "Remorcile nu consumă combustibil."
            : "Pentru estimare e nevoie de kilometraj și de anul fabricației (sau de două citiri de kilometraj)."}
        </p>
      </section>
    );
  const consSource = fuel.real
    ? "real, din plinurile cu kilometraj"
    : fuel.fuelKnown ? `medie tipică · ${fuel.fuel}` : "medie presupusă — completează tipul de combustibil";
  return (
    <section className="chart-card facts">
      <div className="chart-head">
        <div className="chart-titles">
          <h3>Combustibil — estimare</h3>
          <p className="chart-sub">proiecție din km/an × consum × preț; nu se adună la cheltuit</p>
        </div>
      </div>
      <div className="fuel-figs">
        <div className="fuel-fig"><b>~{fmtMoney(Math.round(fuel.costMonth))}</b><span>pe lună</span></div>
        <div className="fuel-fig"><b>~{fmtMoney(Math.round(fuel.costYear))}</b><span>pe an</span></div>
      </div>
      <div className="kv"><span>Consum</span><b>{fmtDecimal(fuel.cons)} {fuel.unit}/100 km</b><small>{consSource}</small></div>
      <div className="kv"><span>Preț pe {fuel.unit}</span><b>{fmtMoney(fuel.price)}</b><small>{fuel.pricePaid ? "media plătită la alimentări" : "preț de referință"}</small></div>
      <div className="kv"><span>Km pe an</span><b>~{fmtKm(fuel.kmAn)}</b><small>{fuel.kmSource === "readings" ? "din citirile de kilometraj" : "din anul fabricației"}</small></div>
      <div className="kv"><span>Combustibil înregistrat {loggedWhen}</span><b>{fmtMoney(logged)}</b><small>bonurile adăugate de tine, separat de estimare</small></div>
    </section>
  );
}
