/* Rulează zilnic la 05:00 UTC (≈ 07:00–08:00 în România).
   Trimite un e-mail rezumat prin Resend când ceva necesită atenție.
   Praguri: exact la 30 și 15 zile înainte, apoi ZILNIC de la 5 zile în jos
   și zilnic după expirare. Service: zilnic când mai sunt ≤800 km. */
import { getStore } from "@netlify/blobs";

const DOC_LABELS = { itp: "ITP", rca: "RCA", rovinieta: "Rovinietă", casco: "CASCO", warranty: "Garanție", leasing: "Leasing" };
const NOTIFY_EXACT = [30, 15];
const DAILY_UNDER = 5;
const SERVICE_KM = 800;

const zile = (n) => { const a = Math.abs(n); return a === 1 ? "o zi" : a < 20 ? `${a} zile` : `${a} de zile`; };
const daysLeft = (ds) => Math.floor((new Date(ds + "T23:59:59Z") - new Date()) / 86400000);
const shouldNotify = (dl) => dl < 0 || dl <= DAILY_UNDER || NOTIFY_EXACT.includes(dl);

export default async () => {
  const store = getStore("fleetdeck");
  const { blobs } = await store.list({ prefix: "user:" });
  const lines = [];

  for (const b of blobs) {
    if (!b.key.includes(":vehicle:")) continue;
    const v = await store.get(b.key, { type: "json" });
    if (!v) continue;
    const owner = b.key.split(":")[1];
    const tag = `${v.make} ${v.model} (${v.plate}) · ${owner}`;

    // documente: cea mai recentă expirare pe tip
    const latest = {};
    for (const d of v.documents || []) {
      if (d.expires && (!latest[d.type] || d.expires > latest[d.type].expires)) latest[d.type] = d;
    }
    for (const [type, d] of Object.entries(latest)) {
      const label = DOC_LABELS[type] || type;
      const dl = daysLeft(d.expires);
      if (dl < 0) lines.push(`🚨 ${tag} — ${label} a EXPIRAT acum ${zile(dl)} (${d.expires})`);
      else if (shouldNotify(dl)) lines.push(`⚠️ ${tag} — ${label} expiră ${dl === 0 ? "AZI" : `în ${zile(dl)}`} (${d.expires})`);
    }

    // următorul service
    if (v.nextServiceDate) {
      const dl = daysLeft(v.nextServiceDate);
      if (dl < 0) lines.push(`🚨 ${tag} — service DEPĂȘIT din ${v.nextServiceDate}`);
      else if (shouldNotify(dl)) lines.push(`🔧 ${tag} — service ${dl === 0 ? "AZI" : `în ${zile(dl)}`} (${v.nextServiceDate})`);
    }
    if (v.nextServiceKm && v.km) {
      const left = v.nextServiceKm - v.km;
      if (left <= 0) lines.push(`🚨 ${tag} — service DEPĂȘIT cu ${Math.abs(left)} km`);
      else if (left <= SERVICE_KM) lines.push(`🔧 ${tag} — service în ~${left} km (la ${v.nextServiceKm} km)`);
    }
  }

  if (!lines.length) return new Response("Nimic de notificat azi.");

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.REMINDER_EMAIL;
  if (!apiKey || !to) {
    console.log("Alerte găsite, dar RESEND_API_KEY / REMINDER_EMAIL nu sunt setate:\n" + lines.join("\n"));
    return new Response("Alerte găsite, dar variabilele de e-mail lipsesc.", { status: 200 });
  }

  const n = lines.length;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.REMINDER_FROM || "FleetDeck <onboarding@resend.dev>",
      to: to.split(",").map((s) => s.trim()),
      subject: `FleetDeck: ${n === 1 ? "1 lucru necesită atenție" : `${n} lucruri necesită atenție`}`,
      html: `<h2>Verificarea zilnică FleetDeck</h2><ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`,
    }),
  });

  console.log(`Trimise ${n} alerte, status Resend ${res.status}`);
  return new Response(`Trimise ${n} alerte.`);
};

export const config = { schedule: "0 5 * * *" };
