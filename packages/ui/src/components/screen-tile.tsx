import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type { AppRef, Screen } from "@open-ui/core/schemas";
import { Bookmark, Check } from "lucide-react";
import type * as React from "react";

import { cn } from "../lib/cn";
import { frameKind, gridSizes } from "../lib/screen";
import { AppLogo } from "./app-logo";
import { ScreenImage } from "./screen-image";

/** The subset of `Screen` a tile needs (so search results / flow steps can be passed too). */
export type ScreenTileData = Pick<Screen, "id" | "thumbUrl" | "width" | "height"> &
  Partial<Pick<Screen, "title" | "saved" | "dominantColor">> & {
    app: Pick<AppRef, "name" | "platform"> & Partial<Pick<AppRef, "slug" | "logoUrl" | "accentColor">>;
  };

export interface ScreenTileProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> {
  screen: ScreenTileData;
  /**
   * The open action. Pass a link element (`<Link to="." search={{ screen: id }} />` or
   * `<a href=…/>`) to make the tile navigable; otherwise it renders a button calling `onOpen`.
   */
  linkRender?: React.ReactElement;
  onOpen?: (screen: ScreenTileData) => void;
  /** Shows the app chip on hover — use in cross-app grids (Discover › Screens, search). */
  showApp?: boolean;
  /** Shows a Save button on hover. */
  onSaveToggle?: (screen: ScreenTileData, saved: boolean) => void;
  /** Multi-select mode (bulk save/copy). */
  selectable?: boolean;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  /** First row of a grid: eager + high fetch priority. */
  priority?: boolean;
  /**
   * `tile` = screenshot inset on the grey rounded tile (default for web);
   * `bare` = screenshot alone with a hairline (default for mobile).
   */
  variant?: "tile" | "bare";
  /** Overlay label in the top-left, e.g. `<Badge tone="glass">New</Badge>`. */
  badge?: React.ReactNode;
  /** Show the screen title under the tile. */
  caption?: boolean;
}

/**
 * One screenshot in a grid. Uniform frame per platform (16:10 or 9:19.5), top-anchored crop,
 * lazy `<img>` with explicit size. Hover/focus reveals Save and the app chip.
 */
export function ScreenTile({
  screen,
  linkRender,
  onOpen,
  showApp = false,
  onSaveToggle,
  selectable = false,
  selected = false,
  onSelectedChange,
  priority = false,
  variant,
  badge,
  caption = false,
  className,
  ...props
}: ScreenTileProps) {
  const kind = frameKind(screen.app.platform);
  const resolvedVariant = variant ?? (kind === "web" ? "tile" : "bare");
  const label = `${screen.title ?? "Screen"} — ${screen.app.name}`;
  const saved = screen.saved ?? false;

  const open = useRender({
    defaultTagName: "button",
    render: linkRender,
    props: mergeProps<"button">(
      {
        type: linkRender ? undefined : "button",
        "aria-label": label,
        onClick: (event: React.MouseEvent) => {
          if (selectable && (event.metaKey || event.shiftKey)) {
            event.preventDefault();
            onSelectedChange?.(!selected);
            return;
          }
          onOpen?.(screen);
        },
        className: cn(
          "ou-focus-ring block w-full text-left",
          resolvedVariant === "tile" ? "rounded-tile" : "rounded-[clamp(10px,10cqw,36px)]",
        ),
        children: (
          <div
            className={cn(
              "transition-[background-color,box-shadow] duration-150 ease-out",
              resolvedVariant === "tile" &&
                "rounded-tile bg-tile p-[7%] group-hover/tile:bg-tile-hover",
              selected && "ring-2 ring-accent ring-offset-2 ring-offset-bg",
              selected && resolvedVariant === "bare" && "rounded-[clamp(10px,10cqw,36px)]",
            )}
          >
            <ScreenImage
              src={screen.thumbUrl}
              width={screen.width}
              height={screen.height}
              platform={screen.app.platform}
              alt=""
              priority={priority}
              sizes={gridSizes(kind)}
              placeholderColor={screen.dominantColor}
            />
          </div>
        ),
      },
      {},
    ),
  });

  return (
    <div
      data-selected={selected ? "" : undefined}
      className={cn("group/tile relative @container min-w-0", className)}
      {...props}
    >
      {open}

      {badge ? <div className="pointer-events-none absolute top-3 left-3">{badge}</div> : null}

      {selectable ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select ${label}`}
          onClick={() => onSelectedChange?.(!selected)}
          className={cn(
            "ou-focus-ring absolute top-3 left-3 flex size-6 items-center justify-center rounded-full border-2 transition-[opacity,background-color,border-color] duration-150",
            selected
              ? "border-accent bg-accent text-accent-fg opacity-100"
              : "border-white bg-black/20 text-transparent opacity-0 backdrop-blur-sm group-hover/tile:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
          )}
        >
          <Check aria-hidden className="size-3.5" strokeWidth={3} />
        </button>
      ) : null}

      {onSaveToggle ? (
        <button
          type="button"
          aria-pressed={saved}
          aria-label={saved ? `Remove ${label} from saved` : `Save ${label}`}
          onClick={() => onSaveToggle(screen, !saved)}
          className={cn(
            "ou-focus-ring absolute top-3 right-3 flex h-8 items-center gap-1.5 rounded-pill bg-elevated/90 px-3 text-sm font-medium text-fg shadow-raised backdrop-blur-md",
            "transition-[opacity,transform,background-color] duration-150 ease-out hover:bg-elevated active:scale-95",
            saved
              ? "opacity-100"
              : "opacity-0 group-hover/tile:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
          )}
        >
          <Bookmark aria-hidden className={cn("size-3.5", saved && "fill-current")} />
          <span className="hidden @[220px]:inline">{saved ? "Saved" : "Save"}</span>
        </button>
      ) : null}

      {showApp ? (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute bottom-3 left-3 flex h-8 max-w-[calc(100%-24px)] items-center gap-2 rounded-pill bg-elevated/90 pr-3 pl-1.5 text-sm font-medium text-fg shadow-raised backdrop-blur-md",
            "translate-y-1 opacity-0 transition-[opacity,transform] duration-150 ease-out group-hover/tile:translate-y-0 group-hover/tile:opacity-100 group-focus-within/tile:translate-y-0 group-focus-within/tile:opacity-100",
          )}
        >
          <AppLogo app={screen.app} size="xs" />
          <span className="truncate">{screen.app.name}</span>
        </div>
      ) : null}

      {caption && screen.title ? (
        <p className="mt-2.5 truncate px-1 text-sm text-fg-muted">{screen.title}</p>
      ) : null}
    </div>
  );
}
