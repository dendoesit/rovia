/* Rulează zilnic la 05:00 UTC (≈ 07:00–08:00 în România).
   Fiecare utilizator primește PROPRIUL e-mail, cu mașinile LUI —
   la adresa setată în profil (👤 → e-mail de remindere).
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

function linesForVehicle(v) {
  const lines = [];
  const tag = `${v.make} ${v.model} (${v.plate})`;

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
  return lines;
}

export default async () => {
  const store = getStore("fleetdeck");
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REMINDER_FROM || "FleetDeck <onboarding@resend.dev>";

  const { blobs } = await store.list({ prefix: "account:" });
  let sent = 0, skippedNoEmail = 0, nothing = 0;

  for (const b of blobs) {
    const account = await store.get(b.key, { type: "json" });
    if (!account) continue;

    const lines = [];
    const { blobs: carBlobs } = await store.list({ prefix: `user:${account.user}:vehicle:` });
    for (const cb of carBlobs) {
      const v = await store.get(cb.key, { type: "json" });
      if (v) lines.push(...linesForVehicle(v));
    }
    if (!lines.length) { nothing++; continue; }

    if (!account.email) {
      skippedNoEmail++;
      console.log(`(${account.user}) are ${lines.length} alerte dar nu și-a setat e-mailul.`);
      continue;
    }
    if (!apiKey) {
      console.log(`(${account.user} → ${account.email}) RESEND_API_KEY lipsește. Alerte:\n` + lines.join("\n"));
      continue;
    }

    const n = lines.length;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [account.email],
        subject: `FleetDeck: ${n === 1 ? "1 lucru necesită atenție" : `${n} lucruri necesită atenție`}`,
        html: `<h2>Salut, ${account.user} 👋</h2><p>Verificarea zilnică a garajului tău:</p><ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`,
      }),
    });
    console.log(`(${account.user} → ${account.email}) ${n} alerte, status Resend ${res.status}`);
    sent++;
  }

  const msg = `E-mailuri trimise: ${sent}. Utilizatori cu alerte dar fără e-mail setat: ${skippedNoEmail}. Fără alerte: ${nothing}.`;
  console.log(msg);
  return new Response(msg);
};

export const config = { schedule: "0 5 * * *" };
