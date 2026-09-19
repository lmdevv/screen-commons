import { toPersistedDraft } from "./draft";
import type { ContributionDraft, PersistedContributionDraft, SubmissionAdapter } from "./types";

const DRAFT_STORAGE_KEY = "open-ui:drafts:v1";

function readDrafts(): Record<string, PersistedContributionDraft> {
  if (typeof window === "undefined") return {};
  try {
    const value = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    return value ? (JSON.parse(value) as Record<string, PersistedContributionDraft>) : {};
  } catch {
    return {};
  }
}

function writeDrafts(drafts: Record<string, PersistedContributionDraft>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // Draft recovery is best-effort when storage is unavailable or full.
  }
}

export async function clearStoredDraft(draftId: string) {
  const drafts = readDrafts();
  delete drafts[draftId];
  writeDrafts(drafts);
}

export async function loadStoredDraft(draftId: string) {
  return readDrafts()[draftId] ?? null;
}

export async function saveStoredDraft(draft: PersistedContributionDraft) {
  writeDrafts({ ...readDrafts(), [draft.id]: draft });
}

export async function saveRecoverableDraft(adapter: SubmissionAdapter, draft: ContributionDraft) {
  await adapter.saveDraft(toPersistedDraft(draft));
}
