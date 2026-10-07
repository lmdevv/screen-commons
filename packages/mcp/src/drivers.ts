import {
  capturePage,
  createCaptureContext,
  createFetchVisitor,
  createPageVisitor,
  extractMetadata,
  findChrome,
  imageSize,
  launchBrowser,
  navigate,
  settlePage,
  type Browser,
  type BrowserContext,
  type ExtractedMetadata,
  type Page,
  type Visitor,
} from "@open-ui/capture";
import {
  VIEWPORTS,
  base64ToBytes,
  type PageMetadata,
  type TabInfo,
  type Viewport,
} from "@open-ui/core";

import type { BridgeServer } from "./bridge";

export type DriverKind = "extension" | "headless";

export interface Shot {
  /** Image bytes (PNG from headless; PNG/JPEG/WebP from the extension). */
  image: Buffer;
  type: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  url: string;
  title: string;
  /** Visible text of the captured area, when the driver provides it. */
  text?: string;
}

export interface PageCapture extends Shot {
  metadata: PageMetadata & Partial<Pick<ExtractedMetadata, "icons">>;
}

export interface CaptureDriver {
  readonly kind: DriverKind;
  navigate(
    url: string,
    options: { viewport: Viewport; newTab: boolean },
  ): Promise<{ url: string; title: string; tabId?: number }>;
  screenshot(options: { fullPage: boolean; selector?: string }): Promise<Shot>;
  extract(): Promise<PageMetadata>;
  listTabs(): Promise<TabInfo[]>;
  /** Navigate + settle + capture + extract one URL (used by capture_pages). */
  capture(url: string, options: { viewport: Viewport; fullPage: boolean }): Promise<PageCapture>;
  /** A visitor for site_crawl. */
  crawlVisitor(): { visit: Visitor; fallbackVisit?: Visitor; release?: () => Promise<void> };
  /** How many pages this driver may capture concurrently. */
  readonly concurrency: number;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------------------------
// Extension (via bridge)
// ---------------------------------------------------------------------------------------------

export class ExtensionDriver implements CaptureDriver {
  readonly kind = "extension" as const;
  readonly concurrency = 1;
  private tabId: number | undefined;

  constructor(private readonly bridge: BridgeServer) {}

  async navigate(url: string, options: { viewport: Viewport; newTab: boolean }) {
    const result = await this.bridge.request(
      "navigate",
      { url, viewport: options.viewport, newTab: options.newTab },
      90_000,
    );
    this.tabId = result.tabId;
    return result;
  }

  async screenshot(options: { fullPage: boolean; selector?: string }): Promise<Shot> {
    const result = await this.bridge.request(
      "screenshot",
      { fullPage: options.fullPage, selector: options.selector, tabId: this.tabId },
      180_000,
    );
    const image = Buffer.from(base64ToBytes(result.base64));
    const size = result.width && result.height ? result : await imageSize(image);
    return {
      image,
      type: result.type,
      width: size.width,
      height: size.height,
      url: result.url,
      title: result.title,
      text: result.text,
    };
  }

  extract(): Promise<PageMetadata> {
    return this.bridge.request("extract", { tabId: this.tabId }, 30_000);
  }

  async listTabs(): Promise<TabInfo[]> {
    return (await this.bridge.request("listTabs", {}, 10_000)).tabs;
  }

  async capture(
    url: string,
    options: { viewport: Viewport; fullPage: boolean },
  ): Promise<PageCapture> {
    await this.navigate(url, { viewport: options.viewport, newTab: false });
    const shot = await this.screenshot({ fullPage: options.fullPage });
    const metadata = await this.extract().catch(() => null);
    return {
      ...shot,
      title: metadata?.title || shot.title,
      metadata: metadata ?? emptyMetadata(shot.url, shot.title),
    };
  }

  crawlVisitor() {
    const visit: Visitor = async (url) => {
      const navigation = await this.navigate(url, { viewport: "desktop", newTab: false });
      const metadata = await this.extract();
      return {
        url: navigation.url || metadata.url,
        title: metadata.title,
        status: null,
        links: metadata.links,
      };
    };
    return { visit: createFetchVisitor(), fallbackVisit: visit };
  }

  async close() {
    // The user's browser is not ours to close.
  }
}

function emptyMetadata(url: string, title: string): PageMetadata {
  return {
    url,
    title,
    description: null,
    siteName: null,
    faviconUrl: null,
    ogImageUrl: null,
    themeColor: null,
    lang: null,
    headings: [],
    links: [],
  };
}

// ---------------------------------------------------------------------------------------------
// Headless (playwright-core + system Chromium)
// ---------------------------------------------------------------------------------------------

export interface HeadlessDriverOptions {
  executablePath?: string;
  headless?: boolean;
  /** Device scale factor per viewport (desktop default 2 for crisp 2880×1800 captures). */
  scale?: Partial<Record<Viewport, number>>;
  log?: (message: string) => void;
}

export class HeadlessDriver implements CaptureDriver {
  readonly kind = "headless" as const;
  readonly concurrency = 3;
  private browserPromise: Promise<Browser> | undefined;
  private readonly contexts = new Map<Viewport, Promise<BrowserContext>>();
  private page: Page | undefined;
  private pageViewport: Viewport = "desktop";

  constructor(private readonly options: HeadlessDriverOptions = {}) {}

  get launched(): boolean {
    return Boolean(this.browserPromise);
  }

  get executablePath(): string | null {
    return this.options.executablePath ?? findChrome();
  }

  private browser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.options.log?.(`headless: launching ${this.executablePath ?? "chromium"}`);
      this.browserPromise = launchBrowser({
        executablePath: this.options.executablePath,
        headless: this.options.headless ?? true,
      });
      this.browserPromise
        .then((browser) =>
          browser.on("disconnected", () => {
            this.browserPromise = undefined;
            this.contexts.clear();
            this.page = undefined;
          }),
        )
        .catch(() => {
          this.browserPromise = undefined;
        });
    }
    return this.browserPromise;
  }

  private context(viewport: Viewport): Promise<BrowserContext> {
    let context = this.contexts.get(viewport);
    if (!context) {
      const scale =
        this.options.scale?.[viewport] ??
        (viewport === "desktop" ? 2 : VIEWPORTS[viewport].deviceScaleFactor);
      context = this.browser().then((browser) =>
        createCaptureContext(browser, { viewport, deviceScaleFactor: scale }),
      );
      context.catch(() => this.contexts.delete(viewport));
      this.contexts.set(viewport, context);
    }
    return context;
  }

  private requirePage(): Page {
    if (!this.page || this.page.isClosed()) {
      throw new Error("No page is open in the headless browser. Call browser_navigate first.");
    }
    return this.page;
  }

  async navigate(url: string, options: { viewport: Viewport; newTab: boolean }) {
    const context = await this.context(options.viewport);
    if (
      !this.page ||
      this.page.isClosed() ||
      options.newTab ||
      this.pageViewport !== options.viewport
    ) {
      this.page = await context.newPage();
      this.pageViewport = options.viewport;
    }
    const result = await navigate(this.page, url);
    await settlePage(this.page, { scroll: false });
    const tabs = await this.listTabs();
    return {
      url: this.page.url(),
      title: (await this.page.title().catch(() => "")) || result.title,
      tabId: tabs.find((tab) => tab.active)?.id,
    };
  }

  async screenshot(options: { fullPage: boolean; selector?: string }): Promise<Shot> {
    const page = this.requirePage();
    const result = await capturePage(page, {
      viewport: this.pageViewport,
      fullPage: options.fullPage,
      selector: options.selector,
      text: false,
      settle: { networkIdleTimeout: 1500, quietTime: 200 },
    });
    return {
      image: result.png,
      type: "image/png",
      width: result.width,
      height: result.height,
      url: result.url,
      title: result.title,
    };
  }

  async extract(): Promise<PageMetadata> {
    const { icons: _icons, ...metadata } = await extractMetadata(this.requirePage());
    return metadata;
  }

  async listTabs(): Promise<TabInfo[]> {
    const tabs: TabInfo[] = [];
    let id = 1;
    for (const contextPromise of this.contexts.values()) {
      const context = await contextPromise.catch(() => null);
      for (const page of context?.pages() ?? []) {
        tabs.push({
          id: id++,
          url: page.url(),
          title: await page.title().catch(() => ""),
          active: page === this.page,
        });
      }
    }
    return tabs;
  }

  async capture(
    url: string,
    options: { viewport: Viewport; fullPage: boolean },
  ): Promise<PageCapture> {
    const context = await this.context(options.viewport);
    const page = await context.newPage();
    try {
      const result = await capturePage(page, {
        url,
        viewport: options.viewport,
        fullPage: options.fullPage,
      });
      if (result.status !== null && result.status >= 400) {
        throw new Error(`HTTP ${result.status} for ${url}`);
      }
      return {
        image: result.png,
        type: "image/png",
        width: result.width,
        height: result.height,
        url: result.url,
        title: result.title,
        metadata: result.metadata,
        text: result.text,
      };
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  crawlVisitor() {
    let page: Page | undefined;
    const fallbackVisit: Visitor = async (url) => {
      page ??= await (await this.context("desktop")).newPage();
      return createPageVisitor(page)(url);
    };
    return {
      visit: createFetchVisitor(),
      fallbackVisit,
      release: async () => {
        await page?.close().catch(() => undefined);
      },
    };
  }

  async close() {
    const browser = this.browserPromise;
    this.browserPromise = undefined;
    this.contexts.clear();
    this.page = undefined;
    if (browser) await (await browser.catch(() => null))?.close().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------------------------

/** Prefers the extension when it is connected to the bridge, else the (lazy) headless browser. */
export class DriverManager {
  readonly headless: HeadlessDriver;
  readonly extension: ExtensionDriver | null;

  constructor(
    readonly bridge: BridgeServer | null,
    headless: HeadlessDriver,
  ) {
    this.headless = headless;
    this.extension = bridge ? new ExtensionDriver(bridge) : null;
  }

  active(): CaptureDriver {
    if (this.extension && this.bridge?.connected) return this.extension;
    return this.headless;
  }

  async close() {
    await this.headless.close();
  }
}
