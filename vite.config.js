import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* CSP-ul strict se scrie doar în build-ul de producție: în dezvoltare Vite are nevoie de un script inline */
const CSP = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const productionHeaders = () => ({
  name: "production-headers",
  apply: "build",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "_headers", source: `/*\n  Content-Security-Policy: ${CSP}\n` });
  },
});

export default defineConfig({
  plugins: [react(), productionHeaders()],
  build: { chunkSizeWarningLimit: 600 },
});
