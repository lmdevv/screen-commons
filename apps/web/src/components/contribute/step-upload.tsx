import { PLATFORMS, type Platform } from "@screen-commons/core/taxonomy";
import {
  SegmentedControl,
  Spinner,
  UploadDropzone,
  UploadItem,
  cn,
  formatBytes,
  formatDimensions,
  type RejectedFile,
} from "@screen-commons/ui";

import { IMAGE_LIMITS } from "./image-processing";
import { MAX_SCREENS, isSkipped, type Draft } from "./model";

export function StepUpload({
  platform,
  onPlatformChange,
  drafts,
  duplicates,
  onFiles,
  onReject,
  onRemove,
  onDuplicateChoice,
}: {
  platform: Platform;
  onPlatformChange: (platform: Platform) => void;
  drafts: Draft[];
  /** Drafts that repeat an earlier one, mapped to that draft. */
  duplicates: ReadonlyMap<string, Draft>;
  onFiles: (files: File[]) => void;
  onReject: (rejected: RejectedFile[]) => void;
  onRemove: (id: string) => void;
  onDuplicateChoice: (id: string, choice: "keep" | "skip") => void;
}) {
  const full = drafts.length >= MAX_SCREENS;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-fg">Add screenshots</h2>
          <p className="mt-1 text-base text-fg-muted">
            Full-resolution captures of one app. Up to {MAX_SCREENS} at a time.
          </p>
        </div>
        <SegmentedControl<Platform>
          aria-label="Platform"
          value={platform}
          onValueChange={onPlatformChange}
          options={PLATFORMS.map(({ slug, label }) => ({ value: slug, label }))}
        />
      </div>

      <UploadDropzone
        onFiles={onFiles}
        onReject={onReject}
        maxSize={IMAGE_LIMITS.maxImageBytes}
        disabled={full}
        size={drafts.length > 0 ? "md" : "lg"}
        title={full ? `That’s ${MAX_SCREENS} screens` : undefined}
        description={
          full
            ? "Submit these first, then add more."
            : `PNG, JPEG or WebP up to ${formatBytes(IMAGE_LIMITS.maxImageBytes)} and ${IMAGE_LIMITS.maxImageWidth.toLocaleString("en-US")}px wide. Paste with ⌘V.`
        }
      />

      {drafts.length > 0 ? (
        <ul aria-label="Selected images" className="grid gap-2 sm:grid-cols-2">
          {drafts.map((draft) => {
            const original = duplicates.get(draft.id);
            const skipped = isSkipped(draft, duplicates);
            const failed = draft.status === "invalid";
            return (
              <li key={draft.id}>
                <UploadItem
                  name={draft.name}
                  previewUrl={draft.previewUrl}
                  bytes={draft.file.size}
                  status={failed ? "error" : "queued"}
                  error={draft.error}
                  className={cn(failed && "bg-danger-soft")}
                  onRemove={() => onRemove(draft.id)}
                  trailing={
                    draft.status === "processing" ? (
                      <Spinner
                        size={16}
                        label={`Processing ${draft.name}`}
                        className="text-fg-muted"
                      />
                    ) : draft.processed ? (
                      <span className="hidden text-sm text-fg-muted tabular-nums sm:inline">
                        {formatDimensions(draft.processed.width, draft.processed.height)}
                      </span>
                    ) : null
                  }
                />
                {original ? (
                  <div className="px-3 py-2 text-sm text-fg-muted">
                    <p>
                      {original.processed?.imageHash === draft.processed?.imageHash
                        ? "Identical image"
                        : "Looks similar"}{" "}
                      to {original.name}. {skipped ? "Skipped." : "Both will be kept."}
                    </p>
                    <div className="mt-1 flex gap-3">
                      <button
                        type="button"
                        className="ou-focus-ring rounded-xs underline"
                        aria-pressed={!skipped}
                        onClick={() => onDuplicateChoice(draft.id, "keep")}
                      >
                        Keep both
                      </button>
                      <button
                        type="button"
                        className="ou-focus-ring rounded-xs underline"
                        aria-pressed={skipped}
                        onClick={() => onDuplicateChoice(draft.id, "skip")}
                      >
                        Skip this image
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
