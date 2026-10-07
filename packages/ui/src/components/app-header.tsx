import type { AppDetail, AppSummary } from "@open-ui/core/schemas";
import { labelFor } from "@open-ui/core/taxonomy";
import type * as React from "react";

import { cn } from "../lib/cn";
import { displayUrl, formatNumber } from "../lib/format";
import { AppLogo } from "./app-logo";
import { KeyValue, KeyValueGroup } from "./key-value";
import { textLinkClassName } from "./link";

export type AppHeaderData = Pick<
  AppSummary,
  | "name"
  | "tagline"
  | "platform"
  | "category"
  | "websiteUrl"
  | "logoUrl"
  | "accentColor"
  | "screenCount"
  | "flowCount"
> &
  Partial<Pick<AppDetail, "description">>;

export interface AppHeaderProps extends React.HTMLAttributes<HTMLElement> {
  app: AppHeaderData;
  /** Buttons row: `<Button>Save</Button><Button variant="outline" icon …>`. */
  actions?: React.ReactNode;
  /** Above the logo, e.g. a "← Discover" back link. */
  back?: React.ReactNode;
  /** Replace/extend the meta row (defaults: Platform, Category, Site, Screens, Flows). */
  meta?: React.ReactNode;
  /** Render the category value as a link: `(slug, label) => <Link …>{label}</Link>`. */
  renderCategory?: (slug: string, label: string) => React.ReactNode;
}

/** App page header: big logo, "Name — tagline", meta row, actions. */
export function AppHeader({
  app,
  actions,
  back,
  meta,
  renderCategory,
  className,
  ...props
}: AppHeaderProps) {
  const categoryLabel = app.category ? labelFor(app.category) : null;
  return (
    <header className={cn("flex flex-col", className)} {...props}>
      {back ? <div className="mb-8">{back}</div> : null}
      <AppLogo app={app} size="xl" priority />
      <h1 className="mt-6 max-w-4xl text-xl font-semibold text-fg sm:text-2xl">
        {app.name}
        {app.tagline ? (
          <>
            <span className="text-fg-subtle"> — </span>
            <span className="text-fg-muted">{app.tagline}</span>
          </>
        ) : null}
      </h1>
      {app.description ? (
        <p className="mt-3 max-w-2xl text-md text-fg-muted">{app.description}</p>
      ) : null}
      <KeyValueGroup className="mt-7">
        {meta ?? (
          <>
            <KeyValue label="Platform">{labelFor(app.platform)}</KeyValue>
            {app.category && categoryLabel ? (
              <KeyValue label="Category">
                {renderCategory ? renderCategory(app.category, categoryLabel) : categoryLabel}
              </KeyValue>
            ) : null}
            {app.websiteUrl ? (
              <KeyValue label="Site">
                <a
                  href={app.websiteUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={textLinkClassName}
                >
                  {displayUrl(app.websiteUrl)}
                </a>
              </KeyValue>
            ) : null}
            <KeyValue label="Screens">{formatNumber(app.screenCount)}</KeyValue>
            {app.flowCount > 0 ? (
              <KeyValue label="Flows">{formatNumber(app.flowCount)}</KeyValue>
            ) : null}
          </>
        )}
      </KeyValueGroup>
      {actions ? <div className="mt-7 flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
