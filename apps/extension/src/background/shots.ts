import { encodeDisplayImage, encodeThumbnail, readEncoded } from "@screen-commons/core/canvas";
import { appNameFromUrl, hostnameOf, suggestPatterns } from "@screen-commons/core/utils";

import { kindForViewport } from "../lib/geometry";
import { getItem, getSettings, notifyTrayChanged, setItem } from "../lib/storage";
import {
  normalizeText,
  nextOrder,
  type CaptureMode,
  type Shot,
  type ShotSummary,
} from "../lib/tray";
import { listShots, putShots } from "../lib/tray-db";
import { CaptureError, runInPage } from "./browser-utils";
import { captureElement, captureFullPage, captureVisible, type RawCapture } from "./capture";
import { decode, dominantColorOf } from "./image";
import { extractMetadata, pickElement } from "./page-scripts";

function newId(): string {
  return crypto.randomUUID();
}

/**
 * Turn a raw capture into a tray shot: display image and thumbnail per the shared display policy
 * (WebP, both derived from the lossless capture), colour and suggested tags.
 */
export async function processCapture(raw: RawCapture, mode: CaptureMode): Promise<Shot> {
  const tabId = raw.tab.id!;
  const meta = await runInPage(tabId, extractMetadata).catch(() => null);
  const url = meta?.url ?? raw.tab.url ?? "";
  const pageTitle = meta?.title || raw.tab.title || hostnameOf(url);
  const bitmap = await decode(raw.image.blob);
  try {
    const kind = kindForViewport(raw.viewportWidth);
    const [image, thumbnail] = await Promise.all([
      readEncoded(raw.image.blob).then((original) => encodeDisplayImage(bitmap, original)),
      encodeThumbnail(bitmap, kind),
    ]);
    return {
      id: newId(),
      order: 0,
      mode,
      kind,
      url,
      pageTitle,
      title: pageTitle.slice(0, 160),
      patterns: suggestPatterns(url, pageTitle),
      width: image.width,
      height: image.height,
      bytes: image.bytes,
      imageType: image.type,
      image: image.blob,
      thumbnail: thumbnail.blob,
      thumbnailWidth: thumbnail.width,
      thumbnailHeight: thumbnail.height,
      dominantColor: dominantColorOf(bitmap),
      text: normalizeText(raw.text),
      faviconUrl: meta?.faviconUrl ?? null,
      siteName: meta?.siteName ?? null,
      truncated: raw.truncated,
      capturedAt: new Date().toISOString(),
    };
  } finally {
    bitmap.close();
  }
}

export function summarize(shot: Shot): ShotSummary {
  const { image: _image, thumbnail: _thumbnail, ...summary } = shot;
  return summary;
}

/** Append a shot to the tray; prefill the app draft from the first capture of a fresh tray. */
export async function addToTray(shot: Shot): Promise<void> {
  const existing = await listShots();
  shot.order = nextOrder(existing);
  await putShots([shot]);
  const draft = await getItem("draft");
  if (!draft.touched && (existing.length === 0 || !draft.app.name)) {
    let website = "";
    try {
      website = new URL(shot.url).origin;
    } catch {
      // ignore
    }
    await setItem("draft", {
      ...draft,
      app: {
        ...draft.app,
        name: (shot.siteName && shot.siteName.length <= 40
          ? shot.siteName
          : appNameFromUrl(shot.url, shot.pageTitle)
        ).slice(0, 80),
        websiteUrl: website,
      },
    });
  }
  await notifyTrayChanged();
}

/** Capture from the popup / shortcuts into the tray. Returns null if the element pick was cancelled. */
export async function captureToTray(tabId: number, mode: CaptureMode): Promise<Shot | null> {
  const settings = await getSettings();
  const options = { method: settings.fullPageMethod, lazyLoad: settings.lazyLoad };
  let raw: RawCapture;
  if (mode === "visible") raw = await captureVisible(tabId);
  else if (mode === "full") raw = await captureFullPage(tabId, options);
  else {
    const picked = await runInPage(tabId, pickElement);
    if (!picked) return null;
    raw = await captureElement(tabId, picked.selector, options);
  }
  const shot = await processCapture(raw, mode);
  await addToTray(shot);
  return shot;
}

export { CaptureError };
