import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", server: "src/server.ts" },
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: true,
  // Workspace packages ship TypeScript source: bundle them; keep npm deps external.
  noExternal: [/^@open-ui\//u],
  external: ["playwright-core", "sharp", "ws", "zod", /^@modelcontextprotocol\/sdk/u],
  esbuildOptions(options) {
    options.keepNames = false;
  },
});
