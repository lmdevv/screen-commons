import { X } from "lucide-react";
import type * as React from "react";

import { cn } from "../lib/cn";
import { SortableHandle, type SortableHandleProps } from "./sortable-list";

export interface FlowStepItemProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  index: number;
  /** Thumbnail URL (object URL while uploading, thumbUrl after). */
  thumbUrl?: string;
  /** Step label value (controlled). */
  label: string;
  onLabelChange: (label: string) => void;
  labelPlaceholder?: string;
  /** From `SortableList` render state. */
  handle?: SortableHandleProps;
  isDragging?: boolean;
  onRemove?: () => void;
}

/**
 * Editable flow step row for the contribute wizard: grip · number · thumb · label input · remove.
 * Use inside `SortableList`'s `renderItem`.
 */
export function FlowStepItem({
  index,
  thumbUrl,
  label,
  onLabelChange,
  labelPlaceholder = "Step label, e.g. “Enter email”",
  handle,
  isDragging = false,
  onRemove,
  className,
  ...props
}: FlowStepItemProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-card border border-border bg-surface p-2 pr-2.5 transition-shadow duration-150",
        isDragging && "shadow-overlay",
        className,
      )}
      {...props}
    >
      {handle ? <SortableHandle handle={handle} label={`Reorder step ${index + 1}`} /> : null}
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-fg-muted tabular-nums">
        {index + 1}
      </span>
      <div className="relative h-12 w-[76px] shrink-0 overflow-hidden rounded-[8px] bg-tile after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_0_0_1px_var(--color-shot-border)]">
        {thumbUrl ? <img src={thumbUrl} alt="" className="size-full object-cover object-top" /> : null}
      </div>
      <input
        value={label}
        onChange={(event) => onLabelChange(event.target.value)}
        placeholder={labelPlaceholder}
        aria-label={`Label for step ${index + 1}`}
        maxLength={80}
        className="h-9 min-w-0 flex-1 rounded-[8px] bg-transparent px-2 text-base text-fg outline-none placeholder:text-fg-subtle hover:bg-muted focus:bg-muted focus-visible:ring-2 focus-visible:ring-accent"
      />
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove step ${index + 1}`}
          onClick={onRemove}
          className="ou-focus-ring flex size-8 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-muted hover:text-fg"
        >
          <X aria-hidden className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
