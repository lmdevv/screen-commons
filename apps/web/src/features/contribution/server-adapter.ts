import { clearStoredDraft, loadStoredDraft, saveStoredDraft } from "./draft-storage";
import type {
  ContributionDraft,
  SubmissionAdapter,
  SubmissionListItem,
  SubmissionStatus,
  UploadItemState,
  UploadSnapshot,
} from "./types";

type Grant = { url: string; key: string; headers: Record<string, string> };

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

export class ServerSubmissionAdapter implements SubmissionAdapter {
  clearDraft = clearStoredDraft;
  loadDraft = loadStoredDraft;
  saveDraft = saveStoredDraft;

  async listMySubmissions(): Promise<SubmissionListItem[]> {
    const result = await jsonRequest<{ submissions: Array<Record<string, unknown>> }>(
      "/api/submissions",
    );
    return result.submissions.map((row) => ({
      id: String(row.id),
      kind: row.kind === "standalone_screen" ? "standalone" : "flow",
      status: String(row.state) as SubmissionStatus,
      title: String(row.flowName || row.firstTitle || "Untitled contribution"),
      productName: String(row.productName || "Unassigned product"),
      publishedHref: row.publishedFlowId ? `/flows/${String(row.publishedFlowId)}` : undefined,
      itemCount: Number(row.itemCount || 0),
      createdAt: new Date(Number(row.createdAt)).toISOString(),
      updatedAt: new Date(Number(row.updatedAt)).toISOString(),
    }));
  }

  async submit(
    draft: ContributionDraft,
    onSnapshot: (snapshot: UploadSnapshot) => void,
    signal?: AbortSignal,
  ): Promise<SubmissionListItem> {
    const states: UploadItemState[] = draft.items.map((item) => ({
      itemId: item.id,
      progress: 0,
      state: "waiting",
    }));
    const emit = (state: UploadSnapshot["state"]) =>
      onSnapshot({ state, items: states.map((item) => ({ ...item })) });
    emit("preparing");
    const finalizedItems = [];
    for (let index = 0; index < draft.items.length; index += 1) {
      const item = draft.items[index]!;
      if (!item.artifact)
        throw new Error(`Select and process ${item.fileName || `screen ${index + 1}`} again.`);
      const state = states[index]!;
      const uploaded: Record<
        "full" | "thumbnail",
        { key: string } & Omit<(typeof item.artifact)["full"], "blob" | "mimeType">
      > = {} as never;
      for (const variantName of ["full", "thumbnail"] as const) {
        const variant = item.artifact[variantName];
        state.state = "requesting_grant";
        emit("uploading");
        const grant = await jsonRequest<Grant>("/api/upload-grant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            submissionId: draft.id,
            itemId: item.id,
            variant: variantName,
            size: variant.byteLength,
            sha256: variant.sha256,
          }),
          signal,
        });
        state.state = "uploading";
        state.progress = variantName === "full" ? 25 : 65;
        emit("uploading");
        await jsonRequest(grant.url, {
          method: "PUT",
          headers: grant.headers,
          body: variant.blob,
          signal,
        });
        uploaded[variantName] = {
          key: grant.key,
          byteLength: variant.byteLength,
          width: variant.width,
          height: variant.height,
          sha256: variant.sha256,
        };
      }
      state.progress = 100;
      state.state = "complete";
      emit("uploading");
      finalizedItems.push({
        id: item.id,
        order: item.order,
        title: item.title,
        notes: item.notes,
        perceptualHash: item.artifact.perceptualHash,
        ...uploaded,
      });
    }
    emit("finalizing");
    const result = await jsonRequest<{ submission: SubmissionListItem }>("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draft: {
          id: draft.id,
          kind: draft.kind,
          productName: draft.productName,
          productVersion: draft.productVersion,
          flowName: draft.flowName,
          platform: draft.platform,
          sourceUrl: draft.sourceUrl,
          captureDate: draft.captureDate,
          rightsConfirmed: draft.rightsConfirmed,
        },
        items: finalizedItems,
      }),
      signal,
    });
    await this.clearDraft(draft.id);
    onSnapshot({ state: "complete", items: states, submissionId: result.submission.id });
    return result.submission;
  }
}

export const submissionAdapter = new ServerSubmissionAdapter();
