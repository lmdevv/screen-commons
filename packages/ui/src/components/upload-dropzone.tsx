import { CircleAlert, CircleCheck, ImagePlus, X } from "lucide-react";
import * as React from "react";

import { cn } from "../lib/cn";
import { formatBytes } from "../lib/format";
import { buttonClassName } from "./button";
import { Progress } from "./progress";
import { Spinner } from "./spinner";

/**
 * Mirrors `ACCEPTED_IMAGE_TYPES` / `LIMITS.maxImageBytes` in @screen-commons/core — kept local so this
 * component doesn't pull zod into the client bundle.
 */
const DEFAULT_ACCEPT = ["image/png", "image/jpeg", "image/webp"] as const;
const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;

export interface RejectedFile {
  file: File;
  reason: "type" | "size";
}

export interface UploadDropzoneProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "onDrop" | "title"
> {
  /** Called with accepted files (filtered by type and size). */
  onFiles: (files: File[]) => void;
  /** Called with files that were filtered out. */
  onReject?: (rejected: RejectedFile[]) => void;
  /** MIME types. Default PNG, JPEG, WebP. */
  accept?: readonly string[];
  /** Bytes. Default 15 MB (server limit). */
  maxSize?: number;
  multiple?: boolean;
  disabled?: boolean;
  /** Also accept images pasted anywhere on the page (⌘V). Default true. */
  acceptPaste?: boolean;
  /** External status: `uploading` shows a spinner/progress, `error` turns the border red. */
  status?: "idle" | "uploading" | "error";
  /** 0–100 for `status="uploading"`. */
  progress?: number;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Error message for `status="error"`. */
  error?: React.ReactNode;
  size?: "md" | "lg";
}

function matchesType(type: string, accept: readonly string[]): boolean {
  return accept.some((pattern) =>
    pattern.endsWith("/*") ? type.startsWith(pattern.slice(0, -1)) : type === pattern,
  );
}

/**
 * Drag-and-drop / click / paste image picker for the contribute flow. Keyboard: the whole zone
 * is a button (Enter/Space opens the file dialog). Validates type and size client-side.
 */
export function UploadDropzone({
  onFiles,
  onReject,
  accept = DEFAULT_ACCEPT,
  maxSize = DEFAULT_MAX_BYTES,
  multiple = true,
  disabled = false,
  acceptPaste = true,
  status = "idle",
  progress,
  title,
  description,
  error,
  size = "lg",
  className,
  ...props
}: UploadDropzoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [drag, setDrag] = React.useState<"none" | "accept" | "reject">("none");
  const depth = React.useRef(0);
  const inactive = disabled || status === "uploading";

  const handleFiles = React.useCallback(
    (list: FileList | File[] | null) => {
      if (!list) return;
      const files = Array.from(list);
      const accepted: File[] = [];
      const rejected: RejectedFile[] = [];
      for (const file of multiple ? files : files.slice(0, 1)) {
        if (!matchesType(file.type, accept)) rejected.push({ file, reason: "type" });
        else if (file.size > maxSize) rejected.push({ file, reason: "size" });
        else accepted.push(file);
      }
      if (accepted.length > 0) onFiles(accepted);
      if (rejected.length > 0) onReject?.(rejected);
    },
    [accept, maxSize, multiple, onFiles, onReject],
  );

  React.useEffect(() => {
    if (!acceptPaste || inactive) return;
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length > 0) {
        event.preventDefault();
        handleFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [acceptPaste, inactive, handleFiles]);

  const dragState = (event: React.DragEvent): "accept" | "reject" => {
    const items = Array.from(event.dataTransfer.items);
    if (items.length === 0) return "accept";
    return items.every((item) => item.kind === "file" && matchesType(item.type, accept))
      ? "accept"
      : "reject";
  };

  const tone =
    status === "error" || drag === "reject" ? "error" : drag === "accept" ? "active" : "idle";

  return (
    <div
      role="button"
      tabIndex={inactive ? -1 : 0}
      aria-disabled={inactive || undefined}
      data-drag={drag === "none" ? undefined : drag}
      onClick={() => {
        if (!inactive) inputRef.current?.click();
      }}
      onKeyDown={(event) => {
        if (inactive) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragEnter={(event) => {
        if (inactive) return;
        event.preventDefault();
        depth.current += 1;
        setDrag(dragState(event));
      }}
      onDragOver={(event) => {
        if (inactive) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = drag === "reject" ? "none" : "copy";
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDrag("none");
      }}
      onDrop={(event) => {
        if (inactive) return;
        event.preventDefault();
        depth.current = 0;
        setDrag("none");
        handleFiles(event.dataTransfer.files);
      }}
      className={cn(
        "ou-focus-ring group relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-tile border-[1.5px] border-dashed text-center",
        "transition-[background-color,border-color] duration-150 ease-out",
        size === "lg" ? "min-h-72 px-6 py-12" : "min-h-44 px-5 py-8",
        tone === "idle" && "border-border-strong bg-tile/60 hover:border-fg-faint hover:bg-tile",
        tone === "active" && "border-accent bg-accent-soft",
        tone === "error" && "border-danger bg-danger-soft",
        inactive && "cursor-default",
        disabled && "opacity-50",
        className,
      )}
      {...props}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept.join(",")}
        multiple={multiple}
        disabled={inactive}
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <div
        aria-hidden
        className={cn(
          "flex size-12 items-center justify-center rounded-full bg-bg shadow-raised transition-transform duration-180 ease-out",
          tone === "active" && "scale-110 text-accent",
          tone === "error" && "text-danger",
          tone === "idle" && "text-fg-muted group-hover:-translate-y-0.5",
        )}
      >
        {status === "uploading" ? (
          <Spinner size={20} />
        ) : tone === "error" ? (
          <CircleAlert className="size-5" />
        ) : (
          <ImagePlus className="size-5" />
        )}
      </div>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-md font-semibold text-fg">
          {status === "uploading"
            ? "Uploading…"
            : drag === "reject"
              ? "Only PNG, JPEG or WebP images"
              : drag === "accept"
                ? "Drop to add"
                : (title ?? "Drop screenshots here")}
        </p>
        <p className={cn("text-base", status === "error" ? "text-danger" : "text-fg-muted")}>
          {status === "error" && error
            ? error
            : (description ??
              `PNG, JPEG or WebP up to ${formatBytes(maxSize)}. You can also paste from the clipboard.`)}
        </p>
      </div>
      {status === "uploading" ? (
        <Progress value={progress} label="Upload progress" className="max-w-56" />
      ) : (
        <span aria-hidden className={buttonClassName({ variant: "outline", size: "sm" })}>
          Choose files
        </span>
      )}
    </div>
  );
}

export interface UploadItemProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  /** Object URL / thumbnail for the preview. */
  previewUrl?: string;
  bytes?: number;
  /** `queued` | `uploading` (with progress) | `done` | `error`. */
  status?: "queued" | "uploading" | "done" | "error";
  progress?: number;
  error?: string;
  onRemove?: () => void;
  /** Extra trailing content (e.g. a drag handle or a pattern picker trigger). */
  trailing?: React.ReactNode;
}

/** One file in the upload queue: thumb, name, size/progress, remove. */
export function UploadItem({
  name,
  previewUrl,
  bytes,
  status = "queued",
  progress,
  error,
  onRemove,
  trailing,
  className,
  ...props
}: UploadItemProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-card border border-border bg-surface p-2 pr-3",
        status === "error" && "border-danger/40",
        className,
      )}
      {...props}
    >
      <div className="relative h-12 w-[76px] shrink-0 overflow-hidden rounded-[8px] bg-tile after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_0_0_1px_var(--color-shot-border)]">
        {previewUrl ? (
          <img src={previewUrl} alt="" className="size-full object-cover object-top" />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-base font-medium text-fg">{name}</span>
          {status === "done" ? (
            <CircleCheck aria-label="Uploaded" className="size-4 shrink-0 text-success" />
          ) : null}
        </div>
        {status === "uploading" ? (
          <Progress value={progress} label={`Uploading ${name}`} className="max-w-48" />
        ) : (
          <span className={cn("text-sm", status === "error" ? "text-danger" : "text-fg-muted")}>
            {status === "error"
              ? (error ?? "Upload failed")
              : bytes !== undefined
                ? formatBytes(bytes)
                : null}
          </span>
        )}
      </div>
      {trailing}
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${name}`}
          onClick={onRemove}
          className="ou-focus-ring flex size-8 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-muted hover:text-fg"
        >
          <X aria-hidden className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
