import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type { Collection } from "@screen-commons/core/schemas";
import { Bookmark } from "lucide-react";
import type * as React from "react";

import { cn } from "../lib/cn";
import { pluralize } from "../lib/format";

export type CollectionCardData = Pick<Collection, "id" | "name" | "itemCount" | "previews"> &
  Partial<Pick<Collection, "isDefault">>;

export interface CollectionCardProps extends React.HTMLAttributes<HTMLElement> {
  collection: CollectionCardData;
  linkRender?: React.ReactElement;
  onOpen?: (collection: CollectionCardData) => void;
}

/** Saved collection: 2×2 mosaic of recent thumbnails on the tile, name + item count below. */
export function CollectionCard({
  collection,
  linkRender,
  onOpen,
  className,
  ...props
}: CollectionCardProps) {
  const previews = collection.previews.slice(0, 4);
  return useRender({
    defaultTagName: "button",
    render: linkRender,
    props: mergeProps<"button">(
      {
        type: linkRender ? undefined : "button",
        onClick: () => onOpen?.(collection),
        className: cn(
          "group/col ou-focus-ring block w-full min-w-0 rounded-tile text-left",
          className,
        ),
        children: (
          <>
            <div
              className={cn(
                "grid aspect-[4/3] gap-1.5 overflow-hidden rounded-tile bg-tile p-1.5 transition-colors duration-150 group-hover/col:bg-tile-hover",
                // 1 preview fills the tile; 2 sit side by side; 3 = one tall + two stacked; 4 = 2×2.
                previews.length === 2 ? "grid-cols-2 grid-rows-1" : "grid-cols-2 grid-rows-2",
              )}
            >
              {previews.length === 0 ? (
                <div className="col-span-2 row-span-2 flex items-center justify-center text-fg-faint">
                  <Bookmark aria-hidden className="size-6" />
                </div>
              ) : (
                previews.map((preview, index) => (
                  <div
                    key={index}
                    className={cn(
                      "relative overflow-hidden rounded-[14px] bg-bg after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_0_0_1px_var(--color-shot-border)]",
                      previews.length === 1 && "col-span-2 row-span-2",
                      previews.length === 3 && index === 0 && "row-span-2",
                    )}
                  >
                    <img
                      src={preview.thumbUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover object-top"
                    />
                  </div>
                ))
              )}
            </div>
            <div className="mt-3 px-0.5">
              <div className="truncate text-base font-semibold text-fg">{collection.name}</div>
              <div className="text-sm text-fg-muted">{pluralize(collection.itemCount, "item")}</div>
            </div>
          </>
        ),
      },
      props,
    ),
  });
}
