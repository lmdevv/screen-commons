import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type { FlowSummary } from "@open-ui/core/schemas";
import { labelFor } from "@open-ui/core/taxonomy";
import type * as React from "react";

import { cn } from "../lib/cn";
import { pluralize } from "../lib/format";
import { frameKind } from "../lib/screen";
import { AppLogo } from "./app-logo";
import { ScreenImage } from "./screen-image";

export type FlowCardData = Pick<FlowSummary, "id" | "name" | "stepCount" | "previews" | "app"> &
  Partial<Pick<FlowSummary, "type" | "saved">>;

export interface FlowCardProps extends React.HTMLAttributes<HTMLElement> {
  flow: FlowCardData;
  /** Link that opens the flow viewer, e.g. `<Link to="." search={{ flow: id }} />`. */
  linkRender?: React.ReactElement;
  onOpen?: (flow: FlowCardData) => void;
  /** Hide "on <App>" (inside an app page, where the app is implied). */
  hideApp?: boolean;
  priority?: boolean;
}

/**
 * Flow preview: a tile with a mini-strip of the first steps, then "Onboarding on [logo] App" and
 * the step count.
 */
export function FlowCard({
  flow,
  linkRender,
  onOpen,
  hideApp = false,
  priority = false,
  className,
  ...props
}: FlowCardProps) {
  const kind = frameKind(flow.app.platform);
  const max = kind === "web" ? 2 : 4;
  const previews = flow.previews.slice(0, max);
  const extra = flow.stepCount - previews.length;

  return useRender({
    defaultTagName: "button",
    render: linkRender,
    props: mergeProps<"button">(
      {
        type: linkRender ? undefined : "button",
        onClick: () => onOpen?.(flow),
        "aria-label": hideApp ? flow.name : `${flow.name} on ${flow.app.name}`,
        className: cn(
          "group/flow ou-focus-ring block w-full min-w-0 rounded-tile text-left",
          className,
        ),
        children: (
          <>
            <div
              className={cn(
                "relative flex items-start gap-[3%] overflow-hidden rounded-tile bg-tile px-[5%] transition-colors duration-150 ease-out group-hover/flow:bg-tile-hover",
                kind === "web" ? "aspect-[2/1] items-center" : "aspect-[16/11] pt-[6%]",
              )}
            >
              {previews.map((preview, index) => (
                <ScreenImage
                  key={preview.id}
                  src={preview.thumbUrl}
                  width={preview.width}
                  height={preview.height}
                  platform={flow.app.platform}
                  alt=""
                  priority={priority && index === 0}
                  sizes={
                    kind === "web"
                      ? "(min-width: 1024px) 20vw, 45vw"
                      : "(min-width: 1024px) 9vw, 22vw"
                  }
                  className="min-w-0 flex-1 transition-transform duration-180 ease-out group-hover/flow:-translate-y-0.5"
                  style={{ transitionDelay: `${index * 25}ms` }}
                />
              ))}
              {extra > 0 ? (
                <span className="absolute right-3 bottom-3 rounded-pill bg-elevated/90 px-2 py-0.5 text-xs font-medium text-fg-muted tabular-nums shadow-raised backdrop-blur-md">
                  +{extra}
                </span>
              ) : null}
            </div>
            <div className="mt-3 flex flex-col gap-0.5 px-0.5">
              <div className="flex min-w-0 items-center gap-1.5 text-base font-semibold text-fg">
                <span className="truncate">{flow.name}</span>
                {hideApp ? null : (
                  <>
                    <span className="shrink-0 font-normal text-fg-subtle">on</span>
                    <AppLogo app={flow.app} size="xs" />
                    <span className="truncate">{flow.app.name}</span>
                  </>
                )}
              </div>
              <div className="text-sm text-fg-muted">
                {pluralize(flow.stepCount, "screen")}
                {flow.type && labelFor(flow.type) !== flow.name
                  ? ` · ${labelFor(flow.type)}`
                  : null}
              </div>
            </div>
          </>
        ),
      },
      props,
    ),
  });
}
