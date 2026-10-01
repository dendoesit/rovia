import { ModalShell } from "./ui";

export default function TrackingModal({ actions }) {
  return (
    <ModalShell close={actions.close} label="Ce urmărim">
      <h2>⚙️ Ce urmărim</h2>
      <div className="wiz-sub">În curând.</div>
    </ModalShell>
  );
}
