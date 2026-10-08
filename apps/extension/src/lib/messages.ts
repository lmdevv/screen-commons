import type { CaptureBatchResult } from "@screen-commons/core/schemas";
import { browser, type Browser } from "wxt/browser";

import type { BridgeStatus } from "./storage";
import type { CaptureMode, ShotSummary, TrayDraft } from "./tray";

/** Runtime messages handled by the background. */
export type BackgroundRequest =
  | { type: "capture"; mode: CaptureMode; tabId?: number }
  | { type: "bridge:status" }
  | { type: "bridge:reconnect" }
  | { type: "recording:set"; active: boolean }
  | { type: "connect:token"; token: string; baseUrl: string }
  | { type: "connect:refresh" };

export interface BackgroundResponses {
  capture: { shot: ShotSummary | null; cancelled?: boolean };
  "bridge:status": BridgeStatus;
  "bridge:reconnect": BridgeStatus;
  "recording:set": { active: boolean };
  "connect:token": { ok: true; userName: string | null };
  "connect:refresh": { ok: true };
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };

export async function sendToBackground<T extends BackgroundRequest>(
  message: T,
): Promise<BackgroundResponses[T["type"]]> {
  const response = (await browser.runtime.sendMessage(message)) as
    | Envelope<BackgroundResponses[T["type"]]>
    | undefined;
  if (!response) throw new Error("The extension background did not respond.");
  if (!response.ok) throw new Error(response.error);
  return response.data;
}

/** Register a promise-based handler using the callback API (works on Chrome 120+ and Firefox). */
export function handleMessages(
  handler: (
    message: BackgroundRequest,
    sender: Browser.runtime.MessageSender,
  ) => Promise<unknown> | undefined,
): void {
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (
      !message ||
      typeof message !== "object" ||
      typeof (message as { type?: unknown }).type !== "string"
    )
      return false;
    const result = handler(message as BackgroundRequest, sender);
    if (!result) return false;
    result.then(
      (data) => sendResponse({ ok: true, data } satisfies Envelope<unknown>),
      (error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        } satisfies Envelope<unknown>),
    );
    return true;
  });
}

/** Upload progress over a long-lived `upload` port. */
export const UPLOAD_PORT = "upload";

export type UploadClientMessage = { type: "start"; draft: TrayDraft; shotIds: string[] };

export type UploadServerMessage =
  | {
      type: "progress";
      phase: "preparing" | "uploading" | "linking";
      done: number;
      total: number;
      message: string;
    }
  | {
      type: "done";
      result: CaptureBatchResult;
      appUrl: string;
      flowUrl: string | null;
      uploaded: number;
    }
  | { type: "error"; message: string };
