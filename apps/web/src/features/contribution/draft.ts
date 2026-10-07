import type {
  ContributionDraft,
  DraftItem,
  PersistedContributionDraft,
  SubmissionKind,
} from "./types";

import { createUuidV4 } from "../../lib/uuid";

export const MAX_FLOW_IMAGES = 50;

export function createId() {
  return createUuidV4();
}

export function createDraft(kind: SubmissionKind): ContributionDraft {
  const now = new Date().toISOString();
  return {
    captureDate: new Date().toISOString().slice(0, 10),
    createdAt: now,
    flowName: "",
    id: createId(),
    items: [],
    kind,
    platform: "web",
    productName: "",
    productVersion: "",
    rightsConfirmed: false,
    sourceUrl: "",
    tags: [],
    updatedAt: now,
  };
}

export function toPersistedDraft(draft: ContributionDraft): PersistedContributionDraft {
  return {
    ...draft,
    items: draft.items.map((draftItem) => {
      const hasArtifact = Boolean(draftItem.artifact);
      const { artifact: _artifact, previewUrl: _previewUrl, ...item } = draftItem;
      return {
        ...item,
        needsFile: !hasArtifact,
        progress: hasArtifact ? 100 : 0,
        status: hasArtifact ? "ready" : item.status === "error" ? "error" : "queued",
      };
    }),
    updatedAt: new Date().toISOString(),
  };
}

export function restoreDraft(draft: PersistedContributionDraft): ContributionDraft {
  return {
    ...draft,
    items: draft.items.map(({ needsFile: _needsFile, ...item }) => ({
      ...item,
      progress: 0,
      status: "queued",
    })),
  };
}

export function moveDraftItem(items: DraftItem[], itemId: string, direction: -1 | 1) {
  const currentIndex = items.findIndex((item) => item.id === itemId);
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= items.length) return items;

  const reordered = [...items];
  const current = reordered[currentIndex];
  const next = reordered[nextIndex];
  if (!current || !next) return items;
  reordered[currentIndex] = next;
  reordered[nextIndex] = current;
  return reordered.map((item, index) => ({ ...item, order: index + 1 }));
}

export function validateDraft(draft: ContributionDraft) {
  const issues: string[] = [];
  if (!draft.productName.trim()) issues.push("Add the product name.");
  if (!draft.captureDate) issues.push("Add the capture date.");
  if (!draft.sourceUrl.trim()) issues.push("Add the source URL.");
  if (draft.kind === "flow" && !draft.flowName.trim()) issues.push("Name the flow.");
  if (draft.items.length === 0) issues.push("Add at least one screenshot.");
  if (draft.kind === "standalone" && draft.items.length > 1) {
    issues.push("A standalone submission can contain only one screenshot.");
  }
  if (draft.items.length > MAX_FLOW_IMAGES)
    issues.push("A flow can contain at most 50 screenshots.");
  if (draft.items.some((item) => item.status !== "ready" || !item.artifact)) {
    issues.push(
      "Wait for every screenshot to finish processing, or replace files that need recovery.",
    );
  }
  if (!draft.rightsConfirmed) issues.push("Confirm that you may contribute these screenshots.");
  return issues;
}
