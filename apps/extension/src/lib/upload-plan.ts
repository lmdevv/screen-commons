import type { AppInput, CaptureBatchInput, CaptureScreen } from "@open-ui/core/schemas";
import { LIMITS } from "@open-ui/core/schemas";
import { versionLabel } from "@open-ui/core/utils";

import { chunkByBudget, estimateScreenBytes, MAX_BATCH_BYTES } from "./chunk";
import type { ShotSummary, TrayDraft } from "./tray";

export type FlowMode = "none" | "inline" | "separate";

export interface UploadPlan {
  chunks: number[][];
  /** `inline`: one batch carries the flow; `separate`: create the flow from screen ids afterwards. */
  flowMode: FlowMode;
}

export function validateDraft(draft: TrayDraft, shots: readonly ShotSummary[]): string | null {
  if (shots.length === 0) return "The tray is empty.";
  if (!draft.app.name.trim()) return "Add an app name.";
  if (draft.app.name.trim().length > 80) return "App name is too long (80 characters max).";
  if (draft.app.websiteUrl.trim()) {
    try {
      const url = new URL(draft.app.websiteUrl.trim());
      if (url.protocol !== "http:" && url.protocol !== "https:") return "Website must be an http(s) URL.";
    } catch {
      return "Website must be a full URL, like https://example.com.";
    }
  }
  if (draft.flow.enabled) {
    if (!draft.flow.name.trim()) return "Name the flow, or turn off “Save as flow”.";
    if (shots.length < 2) return "A flow needs at least two screens.";
    if (shots.length > LIMITS.maxFlowSteps) return `Flows hold at most ${LIMITS.maxFlowSteps} screens.`;
  }
  return null;
}

export function buildAppInput(draft: TrayDraft): AppInput {
  const app: AppInput = { name: draft.app.name.trim(), platform: draft.app.platform };
  const website = draft.app.websiteUrl.trim();
  if (website) app.websiteUrl = website;
  if (draft.app.category) app.category = draft.app.category;
  return app;
}

export function buildFlowInput(draft: TrayDraft): NonNullable<CaptureBatchInput["flow"]> | undefined {
  if (!draft.flow.enabled) return undefined;
  return {
    name: draft.flow.name.trim(),
    ...(draft.flow.type ? { type: draft.flow.type } : {}),
  };
}

export function planUpload(
  draft: TrayDraft,
  shots: readonly Pick<ShotSummary, "bytes" | "text">[],
  thumbnailBytes: readonly number[],
  maxBytes = MAX_BATCH_BYTES,
): UploadPlan {
  const sizes = shots.map((shot, index) =>
    estimateScreenBytes(shot.bytes, thumbnailBytes[index] ?? 0, shot.text.length),
  );
  const chunks = chunkByBudget(sizes, { maxCount: LIMITS.maxScreensPerBatch, maxBytes });
  const flowMode: FlowMode = !draft.flow.enabled ? "none" : chunks.length === 1 ? "inline" : "separate";
  return { chunks, flowMode };
}

function safeUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function buildScreenInput(
  shot: ShotSummary,
  image: { type: CaptureScreen["image"]["type"]; base64: string },
  thumbnail: { type: CaptureScreen["thumbnail"]["type"]; base64: string },
  options: { stepLabel?: boolean } = {},
): CaptureScreen {
  const title = shot.title.trim().slice(0, 160);
  const screen: CaptureScreen = {
    image,
    thumbnail,
    width: shot.width,
    height: shot.height,
    patterns: shot.patterns.slice(0, 8),
    capturedAt: shot.capturedAt,
    version: versionLabel(new Date(shot.capturedAt)),
  };
  if (title) screen.title = title;
  const sourceUrl = safeUrl(shot.url);
  if (sourceUrl) screen.sourceUrl = sourceUrl;
  if (shot.dominantColor) screen.dominantColor = shot.dominantColor;
  if (shot.text) screen.text = shot.text.slice(0, 20_000);
  if (options.stepLabel && title) screen.stepLabel = title.slice(0, 80);
  return screen;
}
