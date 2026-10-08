import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

import { VIEWPORTS, type Viewport } from "@screen-commons/core";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

export type { Browser, BrowserContext, Page } from "playwright-core";

const NAMED_BINARIES = [
  "chromium",
  "chromium-browser",
  "google-chrome",
  "google-chrome-stable",
  "chrome",
  "microsoft-edge",
  "microsoft-edge-stable",
  "brave-browser",
];

const ABSOLUTE_CANDIDATES = [
  "/run/current-system/sw/bin/chromium",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/snap/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
];

function windowsCandidates(): string[] {
  const roots = [
    process.env.PROGRAMFILES,
    process.env["PROGRAMFILES(X86)"],
    process.env.LOCALAPPDATA,
  ].filter((root): root is string => Boolean(root));
  return roots.flatMap((root) => [
    join(root, "Google", "Chrome", "Application", "chrome.exe"),
    join(root, "Chromium", "Application", "chrome.exe"),
    join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
  ]);
}

/**
 * Locate a Chromium-family browser: `CHROME_PATH` first, then well-known absolute paths
 * (NixOS, Linux distros, macOS, Windows), then binaries on `PATH`.
 */
export function findChrome(env: NodeJS.ProcessEnv = process.env): string | null {
  const fromEnv = env.CHROME_PATH?.trim();
  if (fromEnv) return fromEnv;
  const candidates = [...ABSOLUTE_CANDIDATES, ...windowsCandidates()];
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  const pathDirs = (env.PATH ?? "").split(delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    for (const name of NAMED_BINARIES) {
      const full = join(dir, process.platform === "win32" ? `${name}.exe` : name);
      if (existsSync(full)) return full;
    }
  }
  return null;
}

export interface LaunchOptions {
  executablePath?: string;
  headless?: boolean;
  args?: string[];
}

export async function launchBrowser(options: LaunchOptions = {}): Promise<Browser> {
  const executablePath = options.executablePath ?? findChrome();
  if (!executablePath) {
    throw new Error(
      "No Chromium-based browser found. Install Chromium/Chrome or set CHROME_PATH to its executable.",
    );
  }
  return chromium.launch({
    executablePath,
    headless: options.headless ?? true,
    args: [
      "--hide-scrollbars",
      "--mute-audio",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      ...(options.args ?? []),
    ],
  });
}

export interface ContextOptions {
  viewport?: Viewport;
  /** Override the viewport's device scale factor (e.g. 2 for crisp desktop captures). */
  deviceScaleFactor?: number;
  colorScheme?: "light" | "dark";
  /** Prefer reduced motion so entrance animations render their final state. Default true. */
  reducedMotion?: boolean;
  locale?: string;
}

/** esbuild/tsx `keepNames` wraps functions in `__name(...)`; define it for in-page evaluation. */
const IN_PAGE_HELPERS = "globalThis.__name = globalThis.__name || ((fn) => fn);";

function desktopUserAgent(version: string, mobile: boolean): string {
  const major = version.split(".")[0] ?? "140";
  if (mobile) {
    return `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Mobile Safari/537.36`;
  }
  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

/**
 * A browser context configured for capturing: viewport + DPR, a regular (non-"Headless") Chrome
 * user agent, English locale, light scheme and reduced motion.
 */
export async function createCaptureContext(
  browser: Browser,
  options: ContextOptions = {},
): Promise<BrowserContext> {
  const preset = VIEWPORTS[options.viewport ?? "desktop"];
  const context = await browser.newContext({
    viewport: { width: preset.width, height: preset.height },
    deviceScaleFactor: options.deviceScaleFactor ?? preset.deviceScaleFactor,
    isMobile: preset.mobile,
    hasTouch: preset.mobile,
    userAgent: desktopUserAgent(browser.version(), preset.mobile),
    locale: options.locale ?? "en-US",
    colorScheme: options.colorScheme ?? "light",
    reducedMotion: options.reducedMotion === false ? "no-preference" : "reduce",
    ignoreHTTPSErrors: true,
    serviceWorkers: "block",
  });
  await context.addInitScript(IN_PAGE_HELPERS);
  return context;
}

export async function newCapturePage(
  browser: Browser,
  options: ContextOptions = {},
): Promise<Page> {
  const context = await createCaptureContext(browser, options);
  return context.newPage();
}

/** Make in-page helpers available on pages that were not created by `createCaptureContext`. */
export async function ensureInPageHelpers(page: Page): Promise<void> {
  await page.evaluate(IN_PAGE_HELPERS).catch(() => undefined);
}
