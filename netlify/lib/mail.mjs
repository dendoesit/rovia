export const mailConfigured = () => !!process.env.RESEND_API_KEY;

const FROM = () => process.env.REMINDER_FROM || "FleetDeck <onboarding@resend.dev>";

export const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function sendMail({ to, subject, html }) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM(), to: [to], subject, html }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}`);
  return r.json();
}

export const sendReminderVerification = ({ to, link }) =>
  sendMail({
    to,
    subject: "FleetDeck — confirmă adresa pentru remindere",
    html: `<p>Cineva a cerut ca reminderele FleetDeck (ITP, RCA, rovinietă, service) să ajungă la această adresă.</p><p><a href="${escapeHtml(link)}">Confirm adresa</a></p><p>Dacă nu știi despre ce e vorba, ignoră e-mailul — nu vei primi nimic.</p>`,
  });

export const sendPasswordReset = ({ to, link }) =>
  sendMail({
    to,
    subject: "FleetDeck — resetează parola",
    html: `<p>Ai cerut resetarea parolei pentru contul FleetDeck.</p><p><a href="${escapeHtml(link)}">Alege o parolă nouă</a> (linkul expiră într-o oră).</p><p>Dacă nu ai cerut tu, ignoră acest e-mail.</p>`,
  });
