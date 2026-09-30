const TZ = "Europe/Bucharest";
const DAY = 86_400_000;

export const bucharestToday = (now = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

const toUtc = (ds) => Date.UTC(+ds.slice(0, 4), +ds.slice(5, 7) - 1, +ds.slice(8, 10));
const fromUtc = (ms) => new Date(ms).toISOString().slice(0, 10);

export const daysBetween = (from, to) => Math.round((toUtc(to) - toUtc(from)) / DAY);
export const daysLeft = (ds, today = bucharestToday()) => (ds ? daysBetween(today, ds) : null);

export const addDaysTo = (ds, n) => fromUtc(toUtc(ds) + n * DAY);

/* 31 ian + 1 lună = 28/29 feb, nu 3 martie */
export function addMonthsTo(ds, n) {
  const y = +ds.slice(0, 4), m = +ds.slice(5, 7) - 1 + n, d = +ds.slice(8, 10);
  const target = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return fromUtc(target.getTime());
}

export const yearOf = (ds) => +String(ds).slice(0, 4);
export const monthKey = (ds) => String(ds).slice(0, 7);
