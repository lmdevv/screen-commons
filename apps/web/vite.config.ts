import { cloudflare } from "@cloudflare/vite-plugin";
import tailwind from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { docsPlugin } from "./src/components/docs/vite-plugin";

// Overrides used by the integration tests: separate port, throwaway local state, and a generated
// wrangler config whose sibling .dev.vars (APP_URL, secret) is isolated from the developer's.
const port = Number(process.env.PORT ?? 5173);
const persistPath = process.env.SCREEN_COMMONS_PERSIST_DIR ?? process.env.OPEN_UI_PERSIST_DIR;
const configPath =
  process.env.SCREEN_COMMONS_WRANGLER_CONFIG ?? process.env.OPEN_UI_WRANGLER_CONFIG;
// Separate dependency-optimizer cache so a test server never races a running dev server.
const cacheDir = process.env.SCREEN_COMMONS_VITE_CACHE_DIR ?? process.env.OPEN_UI_VITE_CACHE_DIR;

export default defineConfig({
  ...(cacheDir ? { cacheDir } : {}),
  // CORS is handled by the Worker (src/server/http/api.ts), not by the dev server.
  server: { port, strictPort: true, host: "localhost", cors: false },
  preview: { port, strictPort: true, host: "localhost", cors: false },
  plugins: [
    cloudflare({
      viteEnvironment: { name: "ssr" },
      ...(persistPath ? { persistState: { path: persistPath } } : {}),
      ...(configPath ? { configPath } : {}),
    }),
    docsPlugin(),
    tailwind(),
    tanstackStart(),
    react(),
  ],
});
