/**
 * Bundle-size probe: builds an entry that renders roughly what the /browse route uses from this
 * package (plus React DOM) and prints the gzip size. Spec budget for the browse route: < 120 KB
 * JS gzip *including* router/query/app code, so the UI share should stay well below that.
 *
 *   node showcase/scripts/bundle-budget.ts                 # full browse set
 *   OMIT=toaster,account node showcase/scripts/bundle-budget.ts
 *   ONLY=react node showcase/scripts/bundle-budget.ts      # React DOM baseline
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import react from "@vitejs/plugin-react";
import { build } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const work = join(here, "..", ".budget");
const outDir = join(work, "dist");

const pieces: Record<string, { imports: string[]; jsx: string }> = {
  topbar: {
    imports: ["TopBar", "Logo", "SegmentedControl"],
    jsx: `<TopBar logo={<Logo />} nav={<SegmentedControl aria-label="Platform" options={[{ value: "web", label: "Web" }]} />} onSearchClick={() => undefined} />`,
  },
  account: {
    imports: ["AccountMenu"],
    jsx: `<AccountMenu user={{ name: "A", email: "a@b.c", image: null }} />`,
  },
  header: {
    imports: ["PageHeader", "TabNav", "TabNavItem", "CategoryChips"],
    jsx: `<><PageHeader title="Discover" /><TabNav><TabNavItem active>Apps</TabNavItem></TabNav><CategoryChips aria-label="c" items={[]} value={null} onValueChange={() => undefined} /></>`,
  },
  select: {
    imports: ["Select"],
    jsx: `<Select aria-label="Sort" options={[{ value: "latest", label: "Latest" }]} />`,
  },
  nativeselect: {
    imports: ["NativeSelect"],
    jsx: `<NativeSelect variant="ghost" aria-label="Sort" options={[{ value: "latest", label: "Latest" }]} />`,
  },
  grid: {
    imports: ["ScreenGrid", "AppCard", "ScreenTile"],
    jsx: `<ScreenGrid><AppCard app={{ id: "1", name: "A", tagline: null, platform: "web", logoUrl: null, accentColor: null, previews: [] }} /><ScreenTile screen={{ id: "1", thumbUrl: "", width: 1, height: 1, app: { name: "A", platform: "web" } }} /></ScreenGrid>`,
  },
  theme: { imports: ["ThemeProvider"], jsx: "" },
  tooltip: {
    imports: ["TooltipProvider", "Tooltip"],
    jsx: `<Tooltip content="Saved"><button>s</button></Tooltip>`,
  },
  toaster: { imports: ["Toaster"], jsx: `<Toaster />` },
};

const omit = new Set((process.env.OMIT ?? "").split(",").filter(Boolean));
const only = process.env.ONLY;
const chosen = only === "react" ? [] : Object.keys(pieces).filter((key) => !omit.has(key));
const imports = [...new Set(chosen.flatMap((key) => pieces[key]!.imports))];
const body = chosen.map((key) => pieces[key]!.jsx).join("\n");
const wrap = (inner: string) => {
  let out = inner;
  if (chosen.includes("tooltip")) out = `<TooltipProvider>${out}</TooltipProvider>`;
  if (chosen.includes("theme")) out = `<ThemeProvider>${out}</ThemeProvider>`;
  return out;
};

mkdirSync(work, { recursive: true });
const entry = join(work, "entry.tsx");
writeFileSync(
  entry,
  `${imports.length ? `import { ${imports.join(", ")} } from "@screen-commons/ui";\n` : ""}import { createRoot } from "react-dom/client";\ncreateRoot(document.body).render(${wrap(`<>${body}</>`)});\n`,
);

await build({
  configFile: false,
  root,
  logLevel: "warn",
  plugins: [react()],
  resolve: { alias: { "@screen-commons/ui": join(root, "src", "index.ts") } },
  build: { outDir, emptyOutDir: true, rolldownOptions: { input: entry } },
});

let initial = 0;
let lazy = 0;
let zod = false;
for (const file of readdirSync(join(outDir, "assets"))) {
  if (!file.endsWith(".js")) continue;
  const source = readFileSync(join(outDir, "assets", file));
  const gz = gzipSync(source).length;
  // The entry chunk is what loads up front; other chunks are dynamic imports (loaded on intent).
  if (file.startsWith("entry")) initial += gz;
  else lazy += gz;
  zod ||= source.includes("ZodError");
}
const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
console.log(
  `[${chosen.join(" ") || "react-dom only"}] initial ${kb(initial)} gzip, lazy ${kb(lazy)}${zod ? " (contains zod!)" : ""}`,
);
rmSync(work, { recursive: true, force: true });
