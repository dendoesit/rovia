import { spentTitle } from "../../lib/analytics.js";
import { fmtMoney, currencySymbol } from "../../lib/model.js";
import ChartCard from "./ChartCard";
import SplitBar from "./SplitBar";
import StackedMonthlyBars from "./StackedMonthlyBars";
import { HeroFigure } from "./StatTile";
import { COST_SERIES } from "./series";
import "./charts.css";

export const moneyCell = (n) => (n ? fmtMoney(n) : "—");
const share = (part, total) => (total ? `${Math.round((part / total) * 100)}%` : "—");

export function SpendingHero({ spent, range, sub, empty }) {
  const parts = COST_SERIES.map((s) => ({ ...s, value: spent.cats[s.key] }));
  return (
    <ChartCard
      lead={<HeroFigure label={spentTitle(range)} value={fmtMoney(spent.total)} sub={sub} />}
      legend={parts.map((p) => ({ label: p.label, color: p.color, value: fmtMoney(p.value) }))}
      table={{
        columns: [{ key: "cat", label: "Categorie" }, { key: "sum", label: "Sumă", num: true }, { key: "pct", label: "Pondere", num: true }],
        rows: [
          ...parts.map((p) => ({ id: p.key, cat: p.label, sum: moneyCell(p.value), pct: share(p.value, spent.total) })),
          { id: "total", cat: <b>Total</b>, sum: <b>{fmtMoney(spent.total)}</b>, pct: "100%" },
        ],
      }}
      empty={spent.total > 0 ? null : empty}
    >
      <SplitBar parts={parts} format={fmtMoney} label="Împărțirea cheltuielilor pe categorii" />
    </ChartCard>
  );
}

export function SpendingChart({ series }) {
  const { unit, buckets, caption } = series;
  const hasData = buckets.some((b) => b.total > 0);
  const title = unit === "year" ? "Cheltuieli pe ani" : "Cheltuieli pe luni";
  return (
    <ChartCard
      title={title}
      sub={`${caption} · sume în ${currencySymbol()}`}
      legend={COST_SERIES.map(({ label, color }) => ({ label, color }))}
      table={{
        columns: [
          { key: "when", label: unit === "year" ? "An" : "Lună" },
          ...COST_SERIES.map((s) => ({ key: s.key, label: s.label, num: true })),
          { key: "total", label: "Total", num: true },
        ],
        rows: buckets.map((b) => ({
          id: b.key,
          when: b.long,
          ...Object.fromEntries(COST_SERIES.map((s) => [s.key, moneyCell(b.values[s.key])])),
          total: moneyCell(b.total),
        })),
      }}
      empty={hasData ? null : "Graficul apare după ce înregistrezi alimentări, lucrări, documente sau alte cheltuieli în această perioadă."}
    >
      <StackedMonthlyBars buckets={buckets} series={COST_SERIES} format={fmtMoney} label={`${title}, ${caption}`} />
    </ChartCard>
  );
}
