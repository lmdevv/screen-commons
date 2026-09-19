export type SubmissionKind = "standalone" | "flow";

export type SubmissionStatus =
  | "draft"
  | "uploading"
  | "submitted"
  | "automated_review"
  | "awaiting_human"
  | "published"
  | "changes_requested"
  | "rejected"
  | "processing_failed";

export type ProcessingPhase =
  | "queued"
  | "validating"
  | "decoding"
  | "converting"
  | "hashing"
  | "ready"
  | "error";

export interface ImageVariant {
  blob: Blob;
  byteLength: number;
  height: number;
  mimeType: "image/webp";
  sha256: string;
  width: number;
}

export interface ProcessedImage {
  full: ImageVariant;
  original: {
    byteLength: number;
    fileName: string;
    height: number;
    mimeType: string;
    sha256: string;
    width: number;
  };
  perceptualHash: string;
  thumbnail: ImageVariant;
}

export interface DraftItem {
  artifact?: ProcessedImage;
  error?: string;
  fileName: string;
  id: string;
  notes: string;
  order: number;
  previewUrl?: string;
  progress: number;
  status: ProcessingPhase;
  title: string;
}

export interface ContributionDraft {
  captureDate: string;
  createdAt: string;
  flowName: string;
  id: string;
  items: DraftItem[];
  kind: SubmissionKind;
  platform: "web";
  productName: string;
  productVersion: string;
  rightsConfirmed: boolean;
  sourceUrl: string;
  tags: string[];
  updatedAt: string;
}

export interface PersistedDraftItem extends Omit<DraftItem, "artifact" | "previewUrl"> {
  needsFile: boolean;
}

export interface PersistedContributionDraft extends Omit<ContributionDraft, "items"> {
  items: PersistedDraftItem[];
}

export interface SubmissionListItem {
  createdAt: string;
  id: string;
  itemCount: number;
  kind: SubmissionKind;
  productName: string;
  publishedHref?: string;
  status: SubmissionStatus;
  title: string;
  updatedAt: string;
}

export interface UploadItemState {
  error?: string;
  itemId: string;
  progress: number;
  state: "waiting" | "requesting_grant" | "uploading" | "verifying" | "complete" | "error";
}

export interface UploadSnapshot {
  error?: string;
  items: UploadItemState[];
  state: "idle" | "preparing" | "uploading" | "finalizing" | "complete" | "error";
  submissionId?: string;
}

export interface SubmissionAdapter {
  clearDraft(draftId: string): Promise<void>;
  listMySubmissions(): Promise<SubmissionListItem[]>;
  loadDraft(draftId: string): Promise<PersistedContributionDraft | null>;
  saveDraft(draft: PersistedContributionDraft): Promise<void>;
  submit(
    draft: ContributionDraft,
    onSnapshot: (snapshot: UploadSnapshot) => void,
    signal?: AbortSignal,
  ): Promise<SubmissionListItem>;
}
