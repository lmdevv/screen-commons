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
import { MAX_SCREENS, type Draft } from "./model";

export function StepUpload({
  platform,
  onPlatformChange,
  drafts,
  duplicates,
  onFiles,
  onReject,
  onRemove,
}: {
  platform: Platform;
  onPlatformChange: (platform: Platform) => void;
  drafts: Draft[];
  /** Drafts that repeat an earlier one, mapped to that draft. */
  duplicates: ReadonlyMap<string, Draft>;
  onFiles: (files: File[]) => void;
  onReject: (rejected: RejectedFile[]) => void;
  onRemove: (id: string) => void;
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
            const failed = draft.status === "invalid" || Boolean(original);
            return (
              <li key={draft.id}>
                <UploadItem
                  name={draft.name}
                  previewUrl={draft.previewUrl}
                  bytes={draft.file.size}
                  status={failed ? "error" : "queued"}
                  error={original ? `Same as ${original.name}: won’t be uploaded` : draft.error}
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
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
