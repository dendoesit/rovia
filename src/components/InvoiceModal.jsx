import { ModalShell } from "./ui";

export default function InvoiceModal({ actions }) {
  return (
    <ModalShell close={actions.close} label="Facturi">
      <h2>🧾 Facturi</h2>
      <div className="wiz-sub">În curând.</div>
    </ModalShell>
  );
}
