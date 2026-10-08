import type { Page } from "playwright-core";

/** Well-known consent-manager roots and overlays. Hidden, never clicked. */
export const CONSENT_SELECTORS = [
  "#onetrust-consent-sdk",
  "#onetrust-banner-sdk",
  ".onetrust-pc-dark-filter",
  "#CybotCookiebotDialog",
  "#CybotCookiebotDialogBodyUnderlay",
  "#usercentrics-root",
  "#usercentrics-cmp-ui",
  ".osano-cm-window",
  ".osano-cm-dialog",
  "#truste-consent-track",
  "#consent_blackbar",
  ".truste_overlay",
  ".truste_box_overlay",
  "#didomi-host",
  ".qc-cmp2-container",
  "#qc-cmp2-container",
  '[id^="sp_message_container"]',
  ".fc-consent-root",
  "#hs-eu-cookie-confirmation",
  ".cky-consent-container",
  ".cky-overlay",
  "#cmplz-cookiebanner-container",
  ".cmplz-cookiebanner",
  "#iubenda-cs-banner",
  ".klaro",
  "#axeptio_overlay",
  "#tarteaucitronRoot",
  "#cookiescript_injected",
  "#termly-code-snippet-support",
  "#ketch-consent-banner",
  "#lanyard_root",
  "#transcend-consent-manager",
  "#transcend-shadow-root",
  ".cc-window",
  ".cc-banner",
  "#cc-main",
  "#cookie-law-info-bar",
  "#cookie-notice",
  ".cookie-notice-container",
  "#gdpr-cookie-consent-bar",
  '[aria-label="cookieconsent"]',
  "#cookieConsent",
  "#cookie-consent",
  ".cookie-consent",
  "#cookie-banner",
  ".cookie-banner",
  "#cookiebanner",
  "#cookie-bar",
  "[data-cookiebanner]",
  '[data-testid="cookie-banner"]',
  '[data-testid="consent-banner"]',
  "#consent-banner",
  ".consent-banner",
  "#pandectes-banner",
  "#ccc",
  "#ccc-overlay",
  ".evidon-banner",
  "#BorlabsCookieBox",
  "#moove_gdpr_cookie_info_bar",
  "#cookie-information-template-wrapper",
];

/** Support/chat launchers that float over content. */
export const CHAT_SELECTORS = [
  "#intercom-container",
  ".intercom-lightweight-app",
  ".intercom-launcher",
  'iframe[name="intercom-launcher-frame"]',
  "#hubspot-messages-iframe-container",
  "#drift-widget-container",
  "#drift-frame-controller",
  "#drift-frame-chat",
  ".crisp-client",
  "iframe#launcher",
  "#launcher-frame",
  "#fc_frame",
  "#tidio-chat",
  "#chat-widget-container",
  ".zsiq_floatmain",
  "#beacon-container",
  ".BeaconFabButtonFrame",
  "#front-chat-container",
  "#gorgias-chat-container",
  '[data-testid="intercom-launcher"]',
  "#pylon-chat",
  "#plain-chat",
  "#chatbase-bubble-button",
  "#chatbase-bubble-window",
  ".woot-widget-holder",
  ".woot--bubble-holder",
  '[id^="kapa-widget"]',
  "#qualified-multimodal-host",
  "iframe#q-messenger-frame",
  'iframe[title*="chat widget" i]',
];

/**
 * In-page: hide consent banners, their backdrops and chat launchers. Uses a stylesheet for known
 * vendors plus heuristics for fixed/sticky elements (including inside open shadow roots) whose
 * text talks about cookies/consent, and for small launchers floating in the bottom-right corner.
 * Never clicks anything. Returns the number of heuristically hidden elements.
 */
export function hideOverlaysInPage(selectors: string[]): number {
  const STYLE_ID = "__open_ui_hide_overlays";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `${selectors.join(",\n")} { display: none !important; visibility: hidden !important; }`;
    (document.head || document.documentElement).appendChild(style);
  }
  const consentText =
    /\b(cookies?|consent|gdpr|ccpa|tracking technologies|privacy (preferences|settings|choices|center))\b/iu;
  const launcherText = /\b(chat|help|support|question|assistant|ask|message|talk to|agent)\b/iu;
  const isHidden = (element: Element): boolean => {
    for (let node: Element | null = element; node;) {
      if (node.hasAttribute("data-screen-commons-hidden")) return true;
      node = node.parentElement ?? ((node.getRootNode() as ShadowRoot).host || null);
    }
    return false;
  };
  const hide = (element: HTMLElement) => {
    element.style.setProperty("display", "none", "important");
    element.setAttribute("data-screen-commons-hidden", "");
  };
  const textOf = (element: HTMLElement) =>
    (element.innerText || element.textContent || "").replace(/\s+/gu, " ").trim();

  const width = window.innerWidth;
  const height = window.innerHeight;
  const viewportArea = width * height;
  const fixed: HTMLElement[] = [];
  const collect = (root: Document | ShadowRoot, depth: number) => {
    for (const element of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
      if (element.shadowRoot && depth < 3) collect(element.shadowRoot, depth + 1);
      const tag = element.tagName;
      if (
        tag === "SCRIPT" ||
        tag === "STYLE" ||
        tag === "svg" ||
        tag === "path" ||
        tag === "HTML" ||
        tag === "BODY"
      )
        continue;
      const position = getComputedStyle(element).position;
      if (position === "fixed" || position === "sticky") fixed.push(element);
    }
  };
  collect(document, 0);

  let hidden = 0;
  let foundConsent = false;
  for (const element of fixed) {
    if (isHidden(element)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const text = textOf(element).slice(0, 4000);

    // Consent banners / dialogs.
    if (text && text.length <= 3000 && consentText.test(text)) {
      // A sticky site header mentioning "privacy" is unlikely, but avoid hiding big nav bars.
      const links = element.querySelectorAll("a").length;
      if (!(rect.top <= 1 && rect.height < 140 && links > 6)) {
        hide(element);
        hidden += 1;
        foundConsent = true;
        continue;
      }
    }

    // Floating launchers / chat bubbles anchored bottom-right (or bottom-left small buttons).
    const bottomAnchored = rect.bottom > height - 160 && rect.top > height * 0.3;
    const rightAnchored = rect.right > width - 160;
    if (getComputedStyle(element).position !== "fixed") continue;
    if (bottomAnchored && rightAnchored && rect.width <= 120 && rect.height <= 120) {
      hide(element);
      hidden += 1;
      continue;
    }
    if (
      bottomAnchored &&
      rightAnchored &&
      rect.width <= 440 &&
      rect.height <= 560 &&
      (element.tagName === "IFRAME" || launcherText.test(text))
    ) {
      hide(element);
      hidden += 1;
    }
  }
  // Full-screen dimming backdrops left behind by consent/marketing modals.
  for (const element of fixed) {
    if (isHidden(element)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width * rect.height < viewportArea * 0.6) continue;
    const style = getComputedStyle(element);
    const zIndex = Number.parseInt(style.zIndex, 10);
    if (!Number.isFinite(zIndex) || zIndex < 10) continue;
    const text = textOf(element);
    const alpha = /rgba\([^)]*,\s*([\d.]+)\)/u.exec(style.backgroundColor)?.[1];
    const translucent = alpha !== undefined && Number(alpha) > 0.05 && Number(alpha) < 0.95;
    if (text.length < 20 && (translucent || style.backdropFilter !== "none")) {
      hide(element);
      hidden += 1;
    }
  }
  if (foundConsent || hidden > 0) {
    for (const element of [document.documentElement, document.body]) {
      if (getComputedStyle(element).overflowY === "hidden") {
        element.style.setProperty("overflow", "visible", "important");
      }
    }
  }
  return hidden;
}

export interface LazyScrollOptions {
  /** Stop scrolling after this document height (CSS px). */
  maxHeight: number;
  /** Delay after each viewport step, ms. */
  stepDelay: number;
  /** Overall time budget for the scroll pass, ms. */
  timeBudget: number;
  /** Max wait for pending images after scrolling, ms. */
  imageTimeout: number;
}

/**
 * In-page: scroll viewport by viewport so IntersectionObserver-based lazy loading fires,
 * re-measuring as the document grows, wait for images (bounded), then return to the top.
 */
export async function lazyScrollInPage(options: LazyScrollOptions) {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const started = performance.now();
  for (const image of Array.from(
    document.querySelectorAll<HTMLImageElement>('img[loading="lazy"]'),
  )) {
    image.loading = "eager";
  }
  const scroller = document.scrollingElement || document.documentElement;
  const viewport = window.innerHeight;
  const step = Math.max(200, Math.round(viewport * 0.8));
  let y = 0;
  let steps = 0;
  while (performance.now() - started < options.timeBudget) {
    const height = Math.min(scroller.scrollHeight, options.maxHeight);
    if (y + viewport >= height) break;
    y = Math.min(y + step, Math.max(0, height - viewport));
    window.scrollTo(0, y);
    steps += 1;
    await sleep(options.stepDelay);
  }
  const imageDeadline = Math.max(
    500,
    Math.min(options.imageTimeout, options.timeBudget * 1.5 - (performance.now() - started)),
  );
  const pending = Array.from(document.images).filter(
    (image) => !image.complete && image.getBoundingClientRect().top < options.maxHeight,
  );
  await Promise.race([
    Promise.all(
      pending.map(
        (image) =>
          new Promise<void>((resolve) => {
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          }),
      ),
    ),
    sleep(imageDeadline),
  ]);
  window.scrollTo(0, 0);
  await sleep(Math.min(400, options.stepDelay * 2));
  return {
    steps,
    height: scroller.scrollHeight,
    pendingImages: Array.from(document.images).filter((image) => !image.complete).length,
    elapsed: Math.round(performance.now() - started),
  };
}

/** In-page: wait (bounded) for fonts and for images intersecting the viewport. */
export async function waitForVisibleAssetsInPage(timeout: number) {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const fonts = document.fonts ? document.fonts.ready.then(() => undefined) : Promise.resolve();
  const height = window.innerHeight;
  const images = Array.from(document.images).filter((image) => {
    if (image.complete) return false;
    const rect = image.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < height;
  });
  await Promise.race([
    Promise.all([
      fonts,
      ...images.map(
        (image) =>
          new Promise<void>((resolve) => {
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          }),
      ),
    ]),
    sleep(timeout),
  ]);
  // Two frames so freshly decoded images are painted.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return { pendingImages: images.filter((image) => !image.complete).length };
}

export interface SettleOptions {
  /** networkidle wait, ms (best effort). Default 6000. */
  networkIdleTimeout?: number;
  /** Run the lazy-load scroll pass. Default: only for full-page or element captures. */
  scroll?: boolean;
  /** Document height cap for the scroll pass, CSS px. Default 12000. */
  maxScrollHeight?: number;
  /** Hide cookie banners + chat widgets. Default true. */
  hideOverlays?: boolean;
  /** Extra quiet time after everything settled, ms. Default 500. */
  quietTime?: number;
  /** Overall budget for the scroll pass, ms. Default 15000. */
  scrollBudget?: number;
}

export interface SettleReport {
  networkIdle: boolean;
  hiddenOverlays: number;
  scroll: Awaited<ReturnType<typeof lazyScrollInPage>> | null;
  pendingImages: number;
  elapsed: number;
}

/**
 * Bring a loaded page to a stable, capture-ready state: network idle (bounded), fonts ready,
 * overlays hidden, optional lazy-load scroll pass, visible images decoded.
 */
export async function settlePage(page: Page, options: SettleOptions = {}): Promise<SettleReport> {
  const started = Date.now();
  const networkIdle = await page
    .waitForLoadState("networkidle", { timeout: options.networkIdleTimeout ?? 6000 })
    .then(() => true)
    .catch(() => false);

  const selectors = [...CONSENT_SELECTORS, ...CHAT_SELECTORS];
  let hiddenOverlays = 0;
  if (options.hideOverlays !== false) {
    hiddenOverlays += await page.evaluate(hideOverlaysInPage, selectors).catch(() => 0);
  }

  let scroll: SettleReport["scroll"] = null;
  if (options.scroll) {
    scroll = await page
      .evaluate(lazyScrollInPage, {
        maxHeight: options.maxScrollHeight ?? 12_000,
        stepDelay: 180,
        timeBudget: options.scrollBudget ?? 15_000,
        imageTimeout: 5000,
      })
      .catch(() => null);
    // Lazy content may have triggered more requests.
    await page.waitForLoadState("networkidle", { timeout: 2500 }).catch(() => undefined);
  }

  // Late consent banners (often injected 1-3s after load).
  if (options.hideOverlays !== false) {
    hiddenOverlays += await page.evaluate(hideOverlaysInPage, selectors).catch(() => 0);
  }

  const assets = await page
    .evaluate(waitForVisibleAssetsInPage, 5000)
    .catch(() => ({ pendingImages: -1 }));
  await page.waitForTimeout(options.quietTime ?? 500);
  // Final pass right before capture for banners injected while we waited.
  if (options.hideOverlays !== false) {
    hiddenOverlays += await page.evaluate(hideOverlaysInPage, selectors).catch(() => 0);
  }

  return {
    networkIdle,
    hiddenOverlays,
    scroll,
    pendingImages: assets.pendingImages,
    elapsed: Date.now() - started,
  };
}
