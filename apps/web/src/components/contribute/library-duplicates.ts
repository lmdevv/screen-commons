import type { Screen, VisualFingerprint, AppInput } from "@screen-commons/core";
import { duplicateCandidates, rememberFingerprint } from "../../server/functions";
import { looksSame, type Draft } from "./model";

export function visualFingerprint(draft: Draft): VisualFingerprint {
  const p = draft.processed!;
  let binary = "";
  for (const byte of p.fingerprint) binary += String.fromCharCode(byte);
  return { width: p.width, height: p.height, pixels: btoa(binary) };
}

const legacy = new Map<string, Promise<VisualFingerprint>>();
async function signature(item: Screen, signal: AbortSignal) {
  let job = legacy.get(item.id);
  if (!job) {
    job = (async () => {
      const response = await fetch(item.imageUrl, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
      });
      if (!response.ok) throw new Error("Couldn’t check existing screenshots");
      const bitmap = await createImageBitmap(await response.blob());
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 64;
        const context = canvas.getContext("2d")!;
        context.drawImage(bitmap, 0, 0, 64, 64);
        let binary = "";
        for (const b of context.getImageData(0, 0, 64, 64).data) binary += String.fromCharCode(b);
        const fingerprint = { width: item.width, height: item.height, pixels: btoa(binary) };
        if (item.owned) await rememberFingerprint({ data: { id: item.id, fingerprint } });
        return fingerprint;
      } finally {
        bitmap.close();
      }
    })();
    legacy.set(item.id, job);
    void job.catch(() => legacy.delete(item.id));
  }
  return job;
}

/** Old library entries are checked lazily and cached; new uploads carry their signature. */
export async function findLibraryMatches(
  app: AppInput,
  drafts: Draft[],
  signal: AbortSignal,
  onMatch: (draftId: string, screen: Screen) => void,
) {
  let after: string | undefined;
  do {
    const page = await duplicateCandidates({ data: { app, after } });
    const candidates = page.items.filter(({ screen, fingerprint }) =>
      drafts.some(
        (d) =>
          d.processed?.width === (fingerprint?.width ?? screen.width) &&
          d.processed.height === (fingerprint?.height ?? screen.height),
      ),
    );
    let index = 0;
    await Promise.all(
      Array.from({ length: Math.min(2, candidates.length) }, async () => {
        for (
          let candidate = candidates[index++];
          candidate && !signal.aborted;
          candidate = candidates[index++]
        ) {
          const fingerprint = candidate.fingerprint ?? (await signature(candidate.screen, signal));
          const pixels = Uint8ClampedArray.from(atob(fingerprint.pixels), (c) => c.charCodeAt(0));
          for (const draft of drafts)
            if (
              draft.processed &&
              looksSame(draft.processed, { ...fingerprint, fingerprint: pixels })
            )
              onMatch(draft.id, candidate.screen);
        }
      }),
    );
    after = page.after ?? undefined;
  } while (after && !signal.aborted);
}
