import { cloudflare } from "@cloudflare/vite-plugin";
import tailwind from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Overrides used by the integration tests (separate port + throwaway local state).
const port = Number(process.env.PORT ?? 5173);
const persistPath = process.env.OPEN_UI_PERSIST_DIR;
const appUrl = process.env.OPEN_UI_APP_URL;

export default defineConfig({
  // CORS is handled by the Worker (src/server/http/api.ts), not by the dev server.
  server: { port, strictPort: true, host: "localhost", cors: false },
  preview: { port, strictPort: true, host: "localhost", cors: false },
  plugins: [
    cloudflare({
      viteEnvironment: { name: "ssr" },
      ...(persistPath ? { persistState: { path: persistPath } } : {}),
      ...(appUrl ? { config: { vars: { APP_URL: appUrl } } } : {}),
    }),
    tailwind(),
    tanstackStart(),
    react(),
  ],
});
