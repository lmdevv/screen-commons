import {
  AppHeader,
  Button,
  Container,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  FlowCard,
  ResultCount,
  ScreenGrid,
  ScreenTile,
  ScreenViewer,
  SectionHeader,
  Select,
  TabNav,
  TabNavItem,
  Toolbar,
  pluralize,
  textLinkClassName,
  toast,
} from "@open-ui/ui";
import { ArrowLeft, Bookmark, Ellipsis, ExternalLink, Flag, Link } from "lucide-react";
import * as React from "react";

import { appBySlug, flowSummaries, screenDetail, screens } from "../mock-data";
import { href, setParams, type Route } from "../router";

export function AppDetailPage({ route }: { route: Route }) {
  const app = appBySlug[route.params.get("app") ?? "northwind"] ?? appBySlug.northwind!;
  const appScreens = screens.filter((s) => s.app.id === app.id);
  const grid = [...appScreens, ...appScreens, ...appScreens].slice(0, app.platform === "web" ? 12 : 12);
  const screenId = route.params.get("screen");
  const [saved, setSaved] = React.useState(false);
  const [version, setVersion] = React.useState("Oct 2026");
  const [savedScreens, setSavedScreens] = React.useState<Set<string>>(new Set());

  const viewerIndex = screenId ? appScreens.findIndex((s) => s.id === screenId) : -1;
  const viewerScreen = viewerIndex >= 0 ? screenDetail(appScreens[viewerIndex]!.id) : null;
  const appFlows = flowSummaries.filter((f) => f.app.id === app.id);

  return (
    <Container className="pt-8 pb-24 sm:pt-10">
      <AppHeader
        app={app}
        back={
          <a href={href("/discover")} className={`${textLinkClassName} inline-flex items-center gap-1.5 text-base no-underline`}>
            <ArrowLeft className="size-4" aria-hidden />
            Discover
          </a>
        }
        actions={
          <>
            <Button
              variant={saved ? "secondary" : "primary"}
              aria-pressed={saved}
              onClick={() => {
                setSaved(!saved);
                toast(saved ? `Removed ${app.name}` : `Saved ${app.name}`);
              }}
            >
              <Bookmark className={saved ? "fill-current" : undefined} />
              {saved ? "Saved" : "Save"}
            </Button>
            <Button variant="outline" render={<a href={app.websiteUrl ?? "#"} target="_blank" rel="noreferrer" />}>
              Visit site
              <ExternalLink />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" icon aria-label="More actions" />}>
                <Ellipsis />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem icon={<Link />} onClick={() => toast("Link copied")}>
                  Copy link
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem icon={<Flag />} destructive>
                  Report an issue
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <Toolbar className="mt-12 mb-6">
        <div className="flex items-center gap-6">
          <Select
            variant="ghost"
            aria-label="Version"
            value={version}
            onValueChange={setVersion}
            options={app.versions.map((v) => ({ value: v, label: v }))}
          />
          <span aria-hidden className="h-6 w-px bg-border-strong" />
          <TabNav aria-label="App sections">
            <TabNavItem active href="#">Screens</TabNavItem>
            <TabNavItem href="#">UI Elements</TabNavItem>
            <TabNavItem href="#">Flows</TabNavItem>
          </TabNav>
        </div>
        <ResultCount count={app.screenCount} noun="screens" />
      </Toolbar>

      <ScreenGrid platform={app.platform}>
        {grid.map((screen, index) => (
          <ScreenTile
            key={`${screen.id}-${index}`}
            screen={{ ...screen, saved: savedScreens.has(screen.id) }}
            priority={index < 4}
            linkRender={<a href={href("/app", { app: app.slug, screen: screen.id })} />}
            onSaveToggle={(s, next) =>
              setSavedScreens((prev) => {
                const copy = new Set(prev);
                if (next) copy.add(s.id);
                else copy.delete(s.id);
                return copy;
              })
            }
          />
        ))}
      </ScreenGrid>

      {appFlows.length > 0 ? (
        <section className="mt-16">
          <SectionHeader title="Flows" description={`${pluralize(appFlows.length, "flow")} captured on ${app.name}`} className="mb-6" />
          <ScreenGrid columns="flows">
            {appFlows.map((flow) => (
              <FlowCard key={flow.id} flow={flow} hideApp linkRender={<a href={href("/discover", { tab: "flows", flow: flow.id })} />} />
            ))}
          </ScreenGrid>
        </section>
      ) : null}

      {viewerScreen ? (
        <ScreenViewer
          open
          onOpenChange={(open) => {
            if (!open) setParams(route, { screen: null });
          }}
          screen={{ ...viewerScreen, saved: savedScreens.has(viewerScreen.id) }}
          position={{ index: viewerIndex, total: appScreens.length }}
          onPrev={viewerScreen.previousId ? () => setParams(route, { screen: viewerScreen.previousId }) : null}
          onNext={viewerScreen.nextId ? () => setParams(route, { screen: viewerScreen.nextId }) : null}
          onSaveToggle={(s, next) => {
            setSavedScreens((prev) => {
              const copy = new Set(prev);
              if (next) copy.add(s.id);
              else copy.delete(s.id);
              return copy;
            });
            toast(next ? "Saved to collection" : "Removed from saved");
          }}
          onCopyImage={() => toast.success("Image copied")}
          onDownload={() => toast("Downloading…")}
          tagLinkRender={(_kind, slug) => <a href={href("/discover", { tab: "screens", pattern: slug })} />}
          appLinkRender={<a href={href("/app", { app: app.slug })} />}
          flowLinkRender={(flow) => <a href={href("/discover", { tab: "flows", flow: flow.id })} />}
        />
      ) : null}
    </Container>
  );
}
