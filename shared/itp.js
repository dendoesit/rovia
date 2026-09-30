/* Periodicitatea ITP în România — OG 81/2000 art. 2 (consolidat 17.02.2024, OG 3/2024) și RNTR 1 art. 5.
   Prima ITP se amână doar dacă vehiculul era NOU la prima înmatriculare în România și se socotește de la acea dată;
   următoarele se socotesc de la data ITP-ului efectuat. Vechimea = anul ITP-ului − anul fabricației. */
import { addMonthsTo, addDaysTo, daysBetween, bucharestToday } from "./dates.js";

export const USAGES = {
  standard: "Personal / firmă",
  taxi: "Taxi",
  rent: "Rent-a-car / închiriere",
  ridesharing: "Transport alternativ (Uber, Bolt)",
  scoala: "Școală de șoferi",
};

const SIX_MONTH_USAGES = ["taxi", "rent", "ridesharing"];

/* { first: luni până la prima ITP (vehicul nou), every(ageYears): luni între ITP-uri } */
function policy(v) {
  const usage = USAGES[v.usage] ? v.usage : "standard";
  switch (v.category) {
    case "utilitara": return { first: 24, every: () => 12 };
    case "camion":    return { first: 12, every: () => 12 };
    case "microbuz":  return { first: 12, every: () => 6 };
    case "remorca":   return { first: 24, every: () => 24 };
    case "rulota":    return { first: 36, every: () => 36 };
    case "moto":      return { first: 24, every: () => 24 };
    default:
      if (SIX_MONTH_USAGES.includes(usage)) return { first: 12, every: () => 6 };
      if (usage === "scoala") return { first: 12, every: () => 12 };
      return { first: 36, every: (age) => (age != null && age >= 12 ? 12 : 24) };
  }
}

const monthsLabel = (m) => (m % 12 === 0 ? (m === 12 ? "1 an" : `${m / 12} ani`) : `${m} luni`);

/* data de la care curge prima ITP; fără dată exactă, 1 ianuarie a anului de fabricație (cel mai devreme posibil) */
export function firstRegistrationOf(v) {
  if (typeof v.firstRegistration === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.firstRegistration)) return { date: v.firstRegistration, estimated: false };
  if (+v.year) return { date: `${+v.year}-01-01`, estimated: true };
  return null;
}

/* amânarea primei ITP se aplică doar vehiculelor noi la prima înmatriculare în RO (nu importurilor second-hand) */
export const wasNewAtRegistration = (v) => v.newAtRegistration !== false;

export function firstItpDue(v) {
  if (!wasNewAtRegistration(v)) return null;
  const reg = firstRegistrationOf(v);
  if (!reg) return null;
  const { first } = policy(v);
  return { date: addDaysTo(addMonthsTo(reg.date, first), -1), estimated: reg.estimated, months: first, label: monthsLabel(first) };
}

/* ITP-ul e cerut dacă mașina are deja unul sau dacă a trecut termenul primei inspecții */
export function itpRequirement(v, hasDocument, today = bucharestToday()) {
  if (hasDocument) return { required: true };
  const due = firstItpDue(v);
  if (!due) return { required: true };
  if (due.date >= today) return { required: false, dueBy: due.date, estimated: due.estimated, label: due.label, daysLeft: daysBetween(today, due.date) };
  return { required: true, overdueSince: due.date };
}

/* câte luni e valabil un ITP făcut la `from` (vechimea se socotește în anul inspecției) */
export function itpInterval(v, from = bucharestToday()) {
  const age = +v.year ? +String(from).slice(0, 4) - +v.year : null;
  const months = policy(v).every(age);
  const note = v.category === "autoturism" || !v.category
    ? (months === 12 && age >= 12 ? " (peste 12 ani vechime)" : "")
    : "";
  return { months, label: `${monthsLabel(months)}${note}` };
}
