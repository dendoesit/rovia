/* Rulează zilnic la 05:00 UTC (≈ 07:00–08:00 în România).
   Fiecare cont primește un e-mail doar cu mașinile lui, la adresa de remindere din profil.
   Documente: exact la 30 și 15 zile înainte, apoi zilnic de la 5 zile în jos și după expirare.
   Service: zilnic când mai sunt ≤800 km sau ≤5 zile. */
import { getStore } from "@netlify/blobs";
import { collectAlerts } from "../../shared/alerts.js";
import { bucharestToday } from "../../shared/dates.js";
import { loadAccount } from "../lib/auth.mjs";
import { listVehicles } from "../lib/vehicles.mjs";
import { sendMail, mailConfigured, escapeHtml } from "../lib/mail.mjs";

const NOTIFY_EXACT = [30, 15];
const DAILY_UNDER = 5;
const SERVICE_KM = 800;

const due = (a) => {
  if (a.kind === "doc") return a.daysLeft < 0 || a.daysLeft <= DAILY_UNDER || NOTIFY_EXACT.includes(a.daysLeft);
  if (a.kind === "service") return (a.kmLeft != null && a.kmLeft <= SERVICE_KM) || (a.daysLeft != null && a.daysLeft <= DAILY_UNDER);
  return false;
};

const ICON = { dead: "🚨", crit: "⚠️", orange: "⚠️", warn: "⏳" };

export default async () => {
  const store = getStore({ name: "fleetdeck", consistency: "strong" });
  const today = bucharestToday();
  const stats = { sent: 0, failed: 0, noEmail: 0, nothing: 0 };
  const { blobs } = await store.list({ prefix: "account:" });

  for (const b of blobs) {
    try {
      const account = await loadAccount(store, b.key.slice("account:".length));
      if (!account) continue;
      if (!account.reminderEmail || account.reminderVerified === false) { stats.noEmail++; continue; }
      const alerts = collectAlerts(await listVehicles(store, account.id), today).filter(due);
      if (!alerts.length) { stats.nothing++; continue; }
      if (!mailConfigured()) { stats.failed++; continue; }
      const n = alerts.length;
      await sendMail({
        to: account.reminderEmail,
        subject: `FleetDeck: ${n === 1 ? "1 lucru necesită atenție" : `${n} lucruri necesită atenție`}`,
        html: `<h2>Salut, ${escapeHtml(account.company?.name || account.name)} 👋</h2><p>Verificarea zilnică a garajului:</p><ul>${alerts
          .map((a) => `<li>${ICON[a.st] || "•"} <b>${escapeHtml(a.car)} (${escapeHtml(a.plate)})</b> — ${escapeHtml(a.msg)}</li>`).join("")}</ul>`,
      });
      stats.sent++;
    } catch (e) {
      stats.failed++;
      console.error("notify: cont eșuat", b.key, e.message);
    }
  }
  const msg = `Trimise: ${stats.sent}, eșuate: ${stats.failed}, fără e-mail: ${stats.noEmail}, fără alerte: ${stats.nothing}.`;
  console.log(msg);
  return new Response(msg);
};

export const config = { schedule: "0 5 * * *" };
