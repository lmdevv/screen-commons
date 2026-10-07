import type { ElementSlug, PatternSlug } from "@open-ui/core/taxonomy";
import { labelFor } from "@open-ui/core/taxonomy";
import type { Screen, ScreenDetail } from "@open-ui/core/schemas";
import { Bookmark, Copy, Download, ExternalLink, Workflow } from "lucide-react";
import { useRender } from "@base-ui/react/use-render";
import type * as React from "react";

import { cn } from "../lib/cn";
import { displayUrl, formatDate, formatDimensions } from "../lib/format";
import { frameKind } from "../lib/screen";
import { AppLogo } from "./app-logo";
import { Button } from "./button";
import { Chip } from "./chip";
import { DetailList, DetailRow } from "./key-value";
import { Lightbox, LightboxBody, LightboxHeader, LightboxTitle } from "./lightbox";
import { textLinkClassName } from "./link";
import { ScreenImage } from "./screen-image";
import { Tooltip } from "./tooltip";

export type ViewerScreen = Screen & Partial<Pick<ScreenDetail, "flows" | "previousId" | "nextId">>;

export type TagKind = "pattern" | "element";

export interface ScreenDetailsProps extends React.HTMLAttributes<HTMLDivElement> {
  screen: ViewerScreen;
  /** Make the app row a link: `<Link to="/apps/$slug" params={{ slug }} />`. */
  appLinkRender?: React.ReactElement;
  /** Make tag chips links: `(kind, slug) => <Link to="/browse/$platform" search={{ pattern: slug }} />`. */
  tagLinkRender?: (kind: TagKind, slug: string) => React.ReactElement;
  /** Make flow rows links: `(flow) => <Link to="." search={{ flow: flow.id }} />`. */
  flowLinkRender?: (flow: NonNullable<ViewerScreen["flows"]>[number]) => React.ReactElement;
}

/** Details panel: app, title, patterns, UI elements, flows, source, size, captured date. */
export function ScreenDetails({
  screen,
  appLinkRender,
  tagLinkRender,
  flowLinkRender,
  className,
  ...props
}: ScreenDetailsProps) {
  const appRow = (
    <>
      <AppLogo app={screen.app} size="md" />
      <span className="min-w-0">
        <span className="block truncate text-base font-semibold text-fg">{screen.app.name}</span>
        <span className="block text-sm text-fg-muted">{labelFor(screen.app.platform)}</span>
      </span>
    </>
  );
  return (
    <div className={cn("flex flex-col gap-7 p-5 md:p-6", className)} {...props}>
      {appLinkRender ? (
        <AppRowLink render={appLinkRender}>{appRow}</AppRowLink>
      ) : (
        <div className="flex items-center gap-3">{appRow}</div>
      )}

      {screen.title ? (
        <h2 className="-mt-2 text-lg font-semibold text-fg">{screen.title}</h2>
      ) : null}

      <TagSection title="Patterns" kind="pattern" slugs={screen.patterns} tagLinkRender={tagLinkRender} />
      <TagSection title="UI elements" kind="element" slugs={screen.elements} tagLinkRender={tagLinkRender} />

      {screen.flows && screen.flows.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <h3 className="text-sm font-medium text-fg-muted">In flows</h3>
          <ul className="flex flex-col gap-1">
            {screen.flows.map((flow) => {
              const content = (
                <>
                  <Workflow aria-hidden className="size-4 shrink-0 text-fg-muted" />
                  <span className="min-w-0 flex-1 truncate">{flow.name}</span>
                  <span className="text-sm text-fg-subtle tabular-nums">Step {flow.position + 1}</span>
                </>
              );
              return (
                <li key={flow.id}>
                  {flowLinkRender ? (
                    <AppRowLink render={flowLinkRender(flow)} className="h-9 gap-2.5 text-base">
                      {content}
                    </AppRowLink>
                  ) : (
                    <div className="flex h-9 items-center gap-2.5 px-2 text-base">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <DetailList>
        {screen.sourceUrl ? (
          <DetailRow label="Source">
            <a
              href={screen.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className={cn(textLinkClassName, "inline-flex max-w-full items-center gap-1")}
            >
              <span className="truncate">{displayUrl(screen.sourceUrl)}</span>
              <ExternalLink aria-hidden className="size-3 shrink-0" />
            </a>
          </DetailRow>
        ) : null}
        <DetailRow label="Size">{formatDimensions(screen.width, screen.height)}</DetailRow>
        {screen.version ? <DetailRow label="Version">{screen.version}</DetailRow> : null}
        <DetailRow label="Captured">{formatDate(screen.capturedAt)}</DetailRow>
      </DetailList>
    </div>
  );
}

function AppRowLink({
  render,
  className,
  children,
}: {
  render: React.ReactElement;
  className?: string;
  children: React.ReactNode;
}) {
  return useRender({
    render,
    props: {
      className: cn(
        "ou-focus-ring -mx-2 flex items-center gap-3 rounded-[12px] px-2 py-1.5 transition-colors duration-150 hover:bg-muted",
        className,
      ),
      children,
    },
  });
}

function TagSection({
  title,
  kind,
  slugs,
  tagLinkRender,
}: {
  title: string;
  kind: TagKind;
  slugs: readonly (PatternSlug | ElementSlug)[];
  tagLinkRender?: ScreenDetailsProps["tagLinkRender"];
}) {
  if (slugs.length === 0) return null;
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-sm font-medium text-fg-muted">{title}</h3>
      <ul className="flex flex-wrap gap-1.5">
        {slugs.map((slug) => (
          <li key={slug}>
            <Chip size="sm" render={tagLinkRender?.(kind, slug)}>
              {labelFor(slug)}
            </Chip>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface ScreenViewerProps extends Omit<ScreenDetailsProps, "className"> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Previous/next within the current grid. Pass `null` at the ends to show a disabled arrow. */
  onPrev?: (() => void) | null;
  onNext?: (() => void) | null;
  /** "12 of 48" */
  position?: { index: number; total: number };
  onSaveToggle?: (screen: ViewerScreen, saved: boolean) => void;
  onCopyImage?: (screen: ViewerScreen) => void;
  onDownload?: (screen: ViewerScreen) => void;
  /** Extra header actions (share, report…). */
  actions?: React.ReactNode;
}

/**
 * Screen viewer overlay (`?screen=$id`): large image that scrolls for tall captures, details
 * panel, Save / Copy / Download, ←/→ navigation, Esc to close.
 */
export function ScreenViewer({
  screen,
  open,
  onOpenChange,
  onPrev,
  onNext,
  position,
  onSaveToggle,
  onCopyImage,
  onDownload,
  actions,
  ...detailsProps
}: ScreenViewerProps) {
  const mobile = frameKind(screen.app.platform) === "mobile";
  return (
    <Lightbox open={open} onOpenChange={onOpenChange}>
      <LightboxHeader
        actions={
          <>
            {actions}
            {onCopyImage ? (
              <Tooltip content="Copy image">
                <Button variant="ghost" icon aria-label="Copy image" onClick={() => onCopyImage(screen)}>
                  <Copy />
                </Button>
              </Tooltip>
            ) : null}
            {onDownload ? (
              <Tooltip content="Download">
                <Button variant="ghost" icon aria-label="Download" onClick={() => onDownload(screen)}>
                  <Download />
                </Button>
              </Tooltip>
            ) : null}
            {onSaveToggle ? (
              <Button
                variant={screen.saved ? "secondary" : "primary"}
                aria-pressed={screen.saved}
                onClick={() => onSaveToggle(screen, !screen.saved)}
              >
                <Bookmark className={cn(screen.saved && "fill-current")} />
                {screen.saved ? "Saved" : "Save"}
              </Button>
            ) : null}
          </>
        }
      >
        <LightboxTitle>
          <AppLogo app={screen.app} size="sm" />
          <span className="truncate">{screen.app.name}</span>
          {screen.title ? (
            <span className="hidden truncate font-normal text-fg-muted sm:inline">
              <span className="text-fg-faint"> / </span>
              {screen.title}
            </span>
          ) : null}
        </LightboxTitle>
        {position ? (
          <span className="hidden shrink-0 text-sm text-fg-subtle tabular-nums md:inline">
            {position.index + 1} of {position.total}
          </span>
        ) : null}
      </LightboxHeader>
      <LightboxBody
        resetKey={screen.id}
        onPrev={onPrev}
        onNext={onNext}
        prevLabel="Previous screen"
        nextLabel="Next screen"
        aside={<ScreenDetails screen={screen} {...detailsProps} />}
        mainClassName="bg-tile"
      >
        <div
          className={cn(
            "mx-auto px-4 py-6 md:px-16 md:py-10",
            mobile ? "max-w-[min(100%,420px)]" : "max-w-[1200px]",
          )}
        >
          <ScreenImage
            key={screen.id}
            src={screen.imageUrl}
            width={screen.width}
            height={screen.height}
            platform={screen.app.platform}
            alt={screen.title ? `${screen.title} — ${screen.app.name}` : `${screen.app.name} screen`}
            layout="natural"
            priority
            placeholderColor={screen.dominantColor}
          />
        </div>
      </LightboxBody>
    </Lightbox>
  );
}
