import {
  AppCard,
  Badge,
  Button,
  CategoryChips,
  Container,
  EmptyState,
  FlowCard,
  FlowViewer,
  PageHeader,
  ResultCount,
  ScreenGrid,
  ScreenTile,
  SegmentedControl,
  Select,
  SelectionBar,
  SelectionBarButton,
  TabNav,
  TabNavItem,
  Toolbar,
  toast,
} from "@open-ui/ui";
import { CATEGORIES, ELEMENTS, FLOW_TYPES, PATTERNS, type Platform } from "@open-ui/core/taxonomy";
import { Copy, Download, SearchX, SlidersHorizontal } from "lucide-react";
import * as React from "react";

import { apps, flows, flowSummaries, screens } from "../mock-data";
import { href, navigate, setParams, type Route } from "../router";

type Tab = "apps" | "screens" | "elements" | "flows";

const tabs: { value: Tab; label: string }[] = [
  { value: "apps", label: "Apps" },
  { value: "screens", label: "Screens" },
  { value: "elements", label: "UI Elements" },
  { value: "flows", label: "Flows" },
];

export function DiscoverPage({
  route,
  platform,
  onPlatformChange,
}: {
  route: Route;
  platform: Platform;
  onPlatformChange?: (platform: Platform) => void;
}) {
  const tab = (route.params.get("tab") as Tab | null) ?? "apps";
  const flowId = route.params.get("flow");
  const [category, setCategory] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState("latest");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [saved, setSaved] = React.useState<Set<string>>(new Set(["app_lumen"]));

  const mobile = platform !== "web";
  const platformApps = apps.filter((app) => (mobile ? app.platform !== "web" : app.platform === "web"));
  const platformScreens = screens.filter((s) => (mobile ? s.app.platform !== "web" : s.app.platform === "web"));
  const platformFlows = flowSummaries.filter((f) => (mobile ? f.app.platform !== "web" : f.app.platform === "web"));

  const chipItems =
    tab === "apps"
      ? CATEGORIES.map((c) => ({ value: c.slug, label: c.label }))
      : tab === "screens"
        ? PATTERNS.map((p) => ({ value: p.slug, label: p.label }))
        : tab === "elements"
          ? ELEMENTS.map((e) => ({ value: e.slug, label: e.label }))
          : FLOW_TYPES.map((f) => ({ value: f.slug, label: f.label }));

  const visibleApps = category ? platformApps.filter((a) => a.category === category) : platformApps;
  const visibleScreens = category
    ? platformScreens.filter((s) => (s.patterns as string[]).includes(category) || (s.elements as string[]).includes(category))
    : platformScreens;

  const count =
    tab === "apps" ? visibleApps.length * 41 : tab === "flows" ? platformFlows.length * 18 : visibleScreens.length * 57;
  const noun = tab === "apps" ? "apps" : tab === "flows" ? "flows" : tab === "elements" ? "UI elements" : "screens";
  const openFlow = flows.find((f) => f.id === flowId) ?? null;

  return (
    <Container className="pt-10 pb-24 sm:pt-12">
      <PageHeader
        title="Discover"
        actions={
          onPlatformChange ? (
            // The top bar hides its platform switch below `sm`; surface it here instead.
            <SegmentedControl<Platform>
              aria-label="Platform"
              className="sm:hidden"
              value={platform}
              onValueChange={onPlatformChange}
              options={[
                { value: "web", label: "Web" },
                { value: "ios", label: "iOS" },
                { value: "android", label: "Android" },
              ]}
            />
          ) : null
        }
      />
      <TabNav aria-label="Browse" className="mt-5">
        {tabs.map((t) => (
          <TabNavItem
            key={t.value}
            active={tab === t.value}
            href={href("/discover", { tab: t.value })}
            onClick={() => {
              setCategory(null);
              setSelected(new Set());
            }}
          >
            {t.label}
          </TabNavItem>
        ))}
      </TabNav>

      <CategoryChips
        className="mt-6"
        aria-label={tab === "apps" ? "Categories" : tab === "flows" ? "Flow types" : "Patterns"}
        items={chipItems}
        value={category}
        onValueChange={setCategory}
        leading={
          <Button variant="secondary" className="h-9">
            <SlidersHorizontal />
            Filters
          </Button>
        }
      />

      <Toolbar className="mt-8 mb-6">
        <Select
          variant="ghost"
          aria-label="Sort"
          value={sort}
          onValueChange={setSort}
          options={[
            { value: "latest", label: "Latest" },
            { value: "popular", label: "Most popular" },
          ]}
        />
        <ResultCount count={count} noun={noun} />
      </Toolbar>

      {tab === "apps" ? (
        visibleApps.length === 0 ? (
          <EmptyState
            tone="tile"
            icon={<SearchX />}
            title="No apps in this category yet"
            description="Try another category, or contribute the first one."
            actions={<Button onClick={() => setCategory(null)}>Clear filter</Button>}
          />
        ) : (
          <ScreenGrid columns={mobile ? "apps-mobile" : "apps-web"}>
            {visibleApps.map((app, index) => (
              <AppCard
                key={app.id}
                app={app}
                priority={index < 4}
                linkRender={<a href={href("/app", { app: app.slug })} />}
                saved={saved.has(app.id)}
                badge={index === 0 ? <Badge tone="glass">New</Badge> : undefined}
                onSaveToggle={(a, next) => {
                  setSaved((prev) => {
                    const copy = new Set(prev);
                    if (next) copy.add(a.id);
                    else copy.delete(a.id);
                    return copy;
                  });
                  toast(next ? `Saved ${a.name}` : `Removed ${a.name}`);
                }}
              />
            ))}
          </ScreenGrid>
        )
      ) : tab === "flows" ? (
        <ScreenGrid columns="flows">
          {platformFlows.map((flow) => (
            <FlowCard key={flow.id} flow={flow} linkRender={<a href={href("/discover", { tab: "flows", flow: flow.id })} />} />
          ))}
        </ScreenGrid>
      ) : (
        <ScreenGrid platform={platform}>
          {[...visibleScreens, ...visibleScreens].map((screen, index) => {
            const key = `${screen.id}-${index}`;
            return (
              <ScreenTile
                key={key}
                screen={screen}
                showApp
                priority={index < 4}
                selectable
                selected={selected.has(key)}
                onSelectedChange={(next) =>
                  setSelected((prev) => {
                    const copy = new Set(prev);
                    if (next) copy.add(key);
                    else copy.delete(key);
                    return copy;
                  })
                }
                onSaveToggle={(s, next) => toast(next ? `Saved “${s.title}”` : "Removed from saved")}
                linkRender={<a href={href("/app", { app: screen.app.slug, screen: screen.id })} />}
              />
            );
          })}
        </ScreenGrid>
      )}

      <SelectionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <SelectionBarButton icon aria-label="Download">
          <Download />
        </SelectionBarButton>
        <SelectionBarButton>
          <Copy />
          Copy
        </SelectionBarButton>
        <SelectionBarButton primary onClick={() => toast.success(`${selected.size} screens saved`)}>
          Save
        </SelectionBarButton>
      </SelectionBar>

      {openFlow ? (
        <FlowViewer
          open
          onOpenChange={(open) => {
            if (!open) setParams(route, { flow: null });
          }}
          flow={openFlow}
          onSaveToggle={(f, next) => toast(next ? `Saved ${f.name}` : "Removed")}
          onCopy={() => toast("Copied 5 screens to clipboard")}
          onStepClick={(step) => navigate("/app", { app: openFlow.app.slug, screen: step.screen.id })}
        />
      ) : null}
    </Container>
  );
}
