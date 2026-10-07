import { createOpenUiClient, OpenUiApiError } from "@open-ui/core/client";
import type { CaptureBatchInput, CaptureBatchResult } from "@open-ui/core/schemas";
import { LIMITS } from "@open-ui/core/schemas";
import { readImageHeader } from "@open-ui/core/utils";
import { browser, type Browser } from "wxt/browser";

import type { UploadClientMessage, UploadServerMessage } from "../lib/messages";
import { getSettings, notifyTrayChanged, setItem } from "../lib/storage";
import { EMPTY_DRAFT, type Shot, type TrayDraft } from "../lib/tray";
import { deleteShots, listShots } from "../lib/tray-db";
import { buildAppInput, buildFlowInput, buildScreenInput, planUpload, validateDraft } from "../lib/upload-plan";
import { blobToBase64 } from "./image";
import { summarize } from "./shots";

type Report = (message: UploadServerMessage) => void;

function absolute(baseUrl: string, url: string): string {
  try {
    return new URL(url, `${baseUrl}/`).toString();
  } catch {
    return url;
  }
}

/** Best-effort app logo from the page's apple-touch-icon / favicon (PNG, JPEG or WebP only). */
async function fetchLogo(url: string | null): Promise<CaptureBatchInput["logo"]> {
  if (!url || !/^https?:/u.test(url)) return undefined;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, { signal: controller.signal, credentials: "omit" });
    clearTimeout(timer);
    if (!response.ok) return undefined;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > LIMITS.maxThumbnailBytes) return undefined;
    const header = readImageHeader(bytes);
    if (!header) return undefined;
    return { type: header.type, base64: await blobToBase64(new Blob([bytes])) };
  } catch {
    return undefined;
  }
}

function describeError(error: unknown): string {
  if (error instanceof OpenUiApiError) {
    if (error.status === 401) return "Your API key was rejected. Reconnect in Options.";
    if (error.status === 413) return "The upload is too large for the server.";
    return error.message;
  }
  if (error instanceof TypeError) return "Could not reach the Open UI server. Is it running?";
  return error instanceof Error ? error.message : String(error);
}

export async function runUpload(draft: TrayDraft, shotIds: readonly string[], report: Report): Promise<void> {
  const settings = await getSettings();
  if (!settings.apiKey) {
    report({ type: "error", message: "Connect your Open UI account first (Options → Connect with Open UI)." });
    return;
  }
  const byId = new Map((await listShots()).map((shot) => [shot.id, shot]));
  const shots = shotIds.map((id) => byId.get(id)).filter((shot): shot is Shot => Boolean(shot));
  const summaries = shots.map(summarize);
  const invalid = validateDraft(draft, summaries);
  if (invalid) {
    report({ type: "error", message: invalid });
    return;
  }

  const client = createOpenUiClient({
    baseUrl: settings.serverUrl,
    apiKey: settings.apiKey,
    headers: { "x-open-ui-client": `extension/${browser.runtime.getManifest().version}` },
  });
  const plan = planUpload(draft, summaries, shots.map((shot) => shot.thumbnail.size));
  const app = buildAppInput(draft);
  const flow = buildFlowInput(draft);
  const total = shots.length;
  report({ type: "progress", phase: "preparing", done: 0, total, message: "Preparing images…" });
  const logo = await fetchLogo(shots[0]?.faviconUrl ?? null);

  const results: CaptureBatchResult[] = [];
  const uploadedIds: string[] = [];
  const screenIds: string[] = [];
  try {
    for (const [chunkIndex, chunk] of plan.chunks.entries()) {
      const screens = [];
      for (const index of chunk) {
        const shot = shots[index]!;
        screens.push(
          buildScreenInput(
            summaries[index]!,
            { type: shot.imageType, base64: await blobToBase64(shot.image) },
            { type: "image/webp", base64: await blobToBase64(shot.thumbnail) },
            { stepLabel: Boolean(flow) },
          ),
        );
      }
      report({
        type: "progress",
        phase: "uploading",
        done: uploadedIds.length,
        total,
        message: plan.chunks.length > 1 ? `Uploading batch ${chunkIndex + 1} of ${plan.chunks.length}…` : "Uploading…",
      });
      const result = await client.captures({
        app: results[0] ? { ...app, slug: results[0].app.slug } : app,
        ...(chunkIndex === 0 && logo ? { logo } : {}),
        screens,
        ...(plan.flowMode === "inline" && flow ? { flow } : {}),
        source: "extension",
      });
      results.push(result);
      for (const index of chunk) uploadedIds.push(shots[index]!.id);
      screenIds.push(...result.screens.map((screen) => screen.id));
      report({ type: "progress", phase: "uploading", done: uploadedIds.length, total, message: `Uploaded ${uploadedIds.length} of ${total}` });
    }

    let flowUrl: string | null = results[0]?.flow ? absolute(settings.serverUrl, results[0].flow.url) : null;
    if (plan.flowMode === "separate" && flow && results[0]) {
      report({ type: "progress", phase: "linking", done: total, total, message: "Creating flow…" });
      const created = await client.createFlow({
        appId: results[0].app.id,
        name: flow.name,
        ...(flow.type ? { type: flow.type } : {}),
        steps: screenIds.map((screenId, index) => ({ screenId, label: summaries[index]?.title.slice(0, 80) || undefined })),
      });
      flowUrl = absolute(settings.serverUrl, `/flows/${created.flow.id}`);
    }

    const first = results[0]!;
    await deleteShots(uploadedIds);
    await setItem("draft", EMPTY_DRAFT);
    await setItem("recording", false);
    await notifyTrayChanged();
    report({
      type: "done",
      result: { ...first, screens: results.flatMap((result) => result.screens) },
      appUrl: absolute(settings.serverUrl, `/apps/${first.app.slug}`),
      flowUrl,
      uploaded: uploadedIds.length,
    });
  } catch (error) {
    if (uploadedIds.length > 0) {
      // Avoid duplicates on retry: drop what the server already has.
      await deleteShots(uploadedIds);
      await notifyTrayChanged();
    }
    const prefix = uploadedIds.length > 0 ? `Uploaded ${uploadedIds.length} of ${total}, then failed: ` : "";
    report({ type: "error", message: prefix + describeError(error) });
  }
}

export function handleUploadPort(port: Browser.runtime.Port) {
  let busy = false;
  let open = true;
  port.onDisconnect.addListener(() => (open = false));
  port.onMessage.addListener((message: UploadClientMessage) => {
    if (busy || message?.type !== "start") return;
    busy = true;
    const report: Report = (out) => {
      if (open) port.postMessage(out);
    };
    void runUpload(message.draft, message.shotIds, report)
      .catch((error: unknown) => report({ type: "error", message: describeError(error) }))
      .finally(() => (busy = false));
  });
}
