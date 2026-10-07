import {
  AccountMenu,
  AppLogo,
  Button,
  CommandGroup,
  CommandItem,
  CommandPalette,
  CommandRailItem,
  DropdownMenuItem,
  Footer,
  Logo,
  SegmentedControl,
  ThemeToggle,
  Tooltip,
  TopBar,
  TopBarIconButton,
  pluralize,
  useHotkey,
} from "@open-ui/ui";
import { CATEGORIES, ELEMENTS, FLOW_TYPES, PATTERNS, type Platform } from "@open-ui/core/taxonomy";
import {
  Bookmark,
  Code,
  Key,
  LayoutGrid,
  Plus,
  Settings,
  Shapes,
  Sparkles,
  SquareStack,
  Workflow,
} from "lucide-react";
import * as React from "react";

import { apps, screens, user } from "./mock-data";
import { href, navigate } from "./router";

const platformOptions = [
  { value: "web", label: "Web" },
  { value: "ios", label: "iOS" },
  { value: "android", label: "Android" },
] as const;

export function Shell({
  children,
  platform,
  onPlatformChange,
}: {
  children: React.ReactNode;
  platform: Platform;
  onPlatformChange: (platform: Platform) => void;
}) {
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  useHotkey("k", () => setPaletteOpen((open) => !open));

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        logo={
          <a
            href={href("/discover")}
            aria-label="Open UI home"
            className="ou-focus-ring rounded-sm"
          >
            <Logo />
          </a>
        }
        nav={
          <SegmentedControl<Platform>
            aria-label="Platform"
            size="sm"
            value={platform}
            onValueChange={onPlatformChange}
            options={platformOptions}
          />
        }
        onSearchClick={() => setPaletteOpen(true)}
        searchPlaceholder={`Search ${platform === "web" ? "Web" : platform === "ios" ? "iOS" : "Android"} apps, screens, flows…`}
        actions={
          <>
            <Tooltip content="Saved">
              <TopBarIconButton aria-label="Saved" onClick={() => navigate("/discover")}>
                <Bookmark />
              </TopBarIconButton>
            </Tooltip>
            <Button variant="outline" size="sm" className="ml-1 hidden sm:inline-flex">
              <Plus />
              Contribute
            </Button>
          </>
        }
        account={
          <AccountMenu
            user={user}
            onSignOut={() => undefined}
            footer={
              <>
                <DropdownMenuItem icon={<Code />} external>
                  Source code
                </DropdownMenuItem>
              </>
            }
          >
            <DropdownMenuItem icon={<Bookmark />}>Saved</DropdownMenuItem>
            <DropdownMenuItem icon={<Key />}>API keys</DropdownMenuItem>
            <DropdownMenuItem icon={<Settings />} hint="⌘,">
              Settings
            </DropdownMenuItem>
          </AccountMenu>
        }
      />
      <main className="flex-1">{children}</main>
      <Footer
        logo={<Logo size="sm" />}
        tagline="An open-source library of real product screens and flows."
        columns={[
          {
            title: "Showcase",
            links: [
              { label: "Components", href: href("/components") },
              { label: "Discover", href: href("/discover") },
              { label: "App detail", href: href("/app", { screen: "scr_northwind-dashboard" }) },
              { label: "Flow viewer", href: href("/flow") },
            ],
          },
          {
            title: "Library",
            links: [
              { label: "Browse", href: href("/discover") },
              { label: "Contribute", href: "#/components" },
              { label: "Extension", href: "#/components" },
            ],
          },
          {
            title: "Developers",
            links: [
              { label: "Docs", href: "#/components" },
              { label: "MCP server", href: "#/components" },
              { label: "REST API", href: "#/components" },
            ],
          },
        ]}
        legal="© 2026 Open UI contributors · Apache-2.0"
        aside={<ThemeToggle />}
      />
      <SearchPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

function SearchPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = React.useState("");
  const [scope, setScope] = React.useState("trending");
  const go = (path: string, params?: Record<string, string>) => {
    onOpenChange(false);
    navigate(path, params);
  };
  return (
    <CommandPalette
      open={open}
      onOpenChange={onOpenChange}
      search={search}
      onSearchChange={setSearch}
      rail={
        <>
          {[
            ["trending", "Trending", <Sparkles key="i" />],
            ["apps", "Apps", <LayoutGrid key="i" />],
            ["screens", "Screens", <SquareStack key="i" />],
            ["elements", "UI Elements", <Shapes key="i" />],
            ["flows", "Flows", <Workflow key="i" />],
          ].map(([value, label, icon]) => (
            <CommandRailItem
              key={value as string}
              icon={icon}
              active={scope === value}
              onClick={() => setScope(value as string)}
            >
              {label}
            </CommandRailItem>
          ))}
        </>
      }
    >
      {scope === "trending" || scope === "apps" ? (
        <CommandGroup heading="Apps">
          {apps.map((app) => (
            <CommandItem
              key={app.id}
              value={`app ${app.name} ${app.tagline}`}
              icon={<AppLogo app={app} size="sm" className="-m-0.5" />}
              hint={app.tagline}
              onSelect={() => go("/app", { app: app.slug })}
            >
              {app.name}
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
      {scope === "trending" || scope === "screens" ? (
        <CommandGroup heading="Screens">
          {PATTERNS.slice(0, scope === "screens" ? 30 : 6).map((pattern) => (
            <CommandItem
              key={pattern.slug}
              value={`pattern ${pattern.label}`}
              icon={<SquareStack />}
              hint={pluralize(
                screens.filter((s) => s.patterns.includes(pattern.slug)).length || 12,
                "screen",
              )}
              onSelect={() => go("/discover", { tab: "screens" })}
            >
              {pattern.label}
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
      {scope === "trending" || scope === "elements" ? (
        <CommandGroup heading="UI Elements">
          {ELEMENTS.slice(0, scope === "elements" ? 43 : 5).map((element) => (
            <CommandItem key={element.slug} value={`element ${element.label}`} icon={<Shapes />}>
              {element.label}
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
      {scope === "trending" || scope === "flows" ? (
        <CommandGroup heading="Flows">
          {FLOW_TYPES.slice(0, scope === "flows" ? 16 : 4).map((flow) => (
            <CommandItem
              key={flow.slug}
              value={`flow ${flow.label}`}
              icon={<Workflow />}
              onSelect={() => go("/flow")}
            >
              {flow.label}
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
      {scope === "trending" ? (
        <CommandGroup heading="Categories">
          {CATEGORIES.slice(0, 4).map((category) => (
            <CommandItem
              key={category.slug}
              value={`category ${category.label}`}
              icon={<LayoutGrid />}
            >
              {category.label}
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
    </CommandPalette>
  );
}
