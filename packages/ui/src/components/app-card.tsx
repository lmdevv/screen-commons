import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type { AppSummary } from "@screen-commons/core/schemas";
import { Bookmark } from "lucide-react";
import type * as React from "react";

import { cn } from "../lib/cn";
import { frameKind, gridSizes } from "../lib/screen";
import { AppLogo } from "./app-logo";
import { ScreenImage } from "./screen-image";

export type AppCardData = Pick<
  AppSummary,
  "id" | "name" | "tagline" | "platform" | "logoUrl" | "accentColor" | "previews"
> &
  Partial<Pick<AppSummary, "slug" | "screenCount" | "category">>;

export interface AppCardProps extends React.HTMLAttributes<HTMLDivElement> {
  app: AppCardData;
  /** Link to the app page: `<Link to="/apps/$slug" params={{ slug }} />` or `<a href=… />`. */
  linkRender?: React.ReactElement;
  onOpen?: (app: AppCardData) => void;
  /** Shows a Save button on hover. */
  saved?: boolean;
  onSaveToggle?: (app: AppCardData, saved: boolean) => void;
  priority?: boolean;
  /** Overlay label in the tile's top-left, e.g. `<Badge tone="glass">New</Badge>`. */
  badge?: React.ReactNode;
}

/**
 * Discover › Apps card: big grey tile with the latest screenshot inset, then logo · name · tagline.
 * The whole card is one link; Save is a sibling button (no nested interactive elements).
 */
export function AppCard({
  app,
  linkRender,
  onOpen,
  saved = false,
  onSaveToggle,
  priority = false,
  badge,
  className,
  ...props
}: AppCardProps) {
  const kind = frameKind(app.platform);
  const preview = app.previews[0];

  const link = useRender({
    defaultTagName: "button",
    render: linkRender,
    props: mergeProps<"button">(
      {
        type: linkRender ? undefined : "button",
        onClick: () => onOpen?.(app),
        className: "ou-focus-ring block w-full rounded-tile text-left",
        "aria-label": app.tagline ? `${app.name} — ${app.tagline}` : app.name,
        children: (
          <>
            <div
              className={cn(
                "relative flex justify-center overflow-hidden rounded-tile bg-tile transition-colors duration-150 ease-out group-hover/card:bg-tile-hover",
                kind === "web"
                  ? "aspect-[4/3] items-center px-[8%] sm:aspect-[8/7]"
                  : "aspect-[10/19] items-start px-[11%] pt-[11%]",
              )}
            >
              {preview ? (
                <ScreenImage
                  src={preview.thumbUrl}
                  width={preview.width}
                  height={preview.height}
                  platform={app.platform}
                  alt=""
                  priority={priority}
                  sizes={gridSizes(kind)}
                  className="transition-transform duration-180 ease-out group-hover/card:-translate-y-1"
                />
              ) : (
                <AppLogo app={app} size="xl" className="self-center opacity-60" />
              )}
            </div>
            <div className="mt-3.5 flex items-center gap-3 px-0.5">
              <AppLogo app={app} size="md" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold text-fg">{app.name}</div>
                {app.tagline ? (
                  <div className="truncate text-base text-fg-muted">{app.tagline}</div>
                ) : null}
              </div>
            </div>
          </>
        ),
      },
      {},
    ),
  });

  return (
    <div className={cn("group/card relative min-w-0", className)} {...props}>
      {link}
      {badge ? <div className="pointer-events-none absolute top-3.5 left-3.5">{badge}</div> : null}
      {onSaveToggle ? (
        <button
          type="button"
          aria-pressed={saved}
          aria-label={saved ? `Remove ${app.name} from saved` : `Save ${app.name}`}
          onClick={() => onSaveToggle(app, !saved)}
          className={cn(
            "ou-focus-ring absolute top-3.5 right-3.5 flex size-9 items-center justify-center rounded-full bg-elevated/90 text-fg shadow-raised backdrop-blur-md",
            "transition-[opacity,transform] duration-150 ease-out hover:bg-elevated active:scale-95",
            saved
              ? "opacity-100"
              : "opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
          )}
        >
          <Bookmark aria-hidden className={cn("size-4", saved && "fill-current")} />
        </button>
      ) : null}
    </div>
  );
}
