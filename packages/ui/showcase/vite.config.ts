import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev-only showcase for @open-ui/ui. Not published.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@open-ui/ui": fileURLToPath(new URL("../src/index.ts", import.meta.url)),
    },
  },
  server: { host: "localhost", port: 5179, strictPort: false },
  build: { outDir: "dist", emptyOutDir: true },
});
