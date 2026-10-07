import {
  AppLogo,
  Button,
  CodeBlock,
  Container,
  Kbd,
  LogoMark,
  ScreenGrid,
  ScreenGridItem,
  ScreenImage,
  ScreenTile,
  cn,
  formatNumber,
} from "@open-ui/ui";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  Crosshair,
  Maximize2,
  ScanLine,
  Settings as SettingsIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import type { LandingData } from "./landing.functions";
import { SiteHeader } from "../shell";
import { GITHUB_URL, SiteFooter } from "./site-chrome";

type Thumb = LandingData["screens"][number];

export function LandingPage({ data }: { data: LandingData }) {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero counts={data.counts} />
        <LiveGrid screens={data.screens} />
        <div className="mt-28 flex flex-col gap-24 sm:mt-36 sm:gap-32">
          <FeatureRow
            eyebrow="Library"
            title="Every screen, one search away"
            body="Browse apps, screens, UI elements and flows. Filter by pattern — Pricing, Login, Dashboard — and open any screen at full resolution."
            link={{ label: "How browsing works", slug: "browsing" }}
            visual={
              <LibraryVisual screens={data.pricing.length >= 4 ? data.pricing : data.screens} />
            }
          />
          <FeatureRow
            reverse
            eyebrow="Browser extension"
            title="Capture any site in one click"
            body="Grab the visible area, the full page or a single element. Record a flow as you click through, then upload it to your library."
            link={{ label: "Install the extension", slug: "extension" }}
            visual={<ExtensionVisual />}
          />
          <FeatureRow
            eyebrow="MCP for agents"
            title="Give your agent a design reference"
            body="Claude Code, Cursor and other MCP clients can search screens and flows, look at the images, and crawl, capture and upload sites for you."
            link={{ label: "Connect an agent", slug: "mcp" }}
            visual={<McpVisual origin={data.origin} pricing={data.pricing} />}
          />
        </div>
        <OpenSource />
      </main>
      <SiteFooter />
    </>
  );
}

function Hero({ counts }: { counts: LandingData["counts"] }) {
  return (
    <section className="px-4 pt-20 pb-14 text-center sm:pt-28 sm:pb-16">
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noreferrer noopener"
        className="ou-focus-ring inline-flex h-7 items-center gap-1.5 rounded-pill border border-border px-3 text-sm text-fg-muted transition-colors duration-150 hover:border-border-strong hover:text-fg"
      >
        Open source · Apache-2.0
        <ArrowRight aria-hidden className="size-3.5" />
      </a>
      <h1 className="mx-auto mt-6 max-w-3xl text-2xl font-semibold text-balance text-fg sm:text-3xl">
        Real product screens, open to everyone
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-md text-pretty text-fg-muted">
        A library of screens and flows from real apps, searchable by pattern, element and flow. Free
        to use, and yours to host.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" render={<Link to="/sign-up" />}>
          Get started
        </Button>
        <Button
          size="lg"
          variant="outline"
          render={<Link to="/browse/$platform" params={{ platform: "web" }} />}
        >
          Browse library
        </Button>
      </div>
      {counts.screens > 0 ? (
        <p className="mt-6 text-sm text-fg-muted tabular-nums">
          {formatNumber(counts.screens)} screens · {formatNumber(counts.apps)} apps ·{" "}
          {formatNumber(counts.flows)} flows
        </p>
      ) : null}
    </section>
  );
}

/** A real slice of the catalog. Tiles link to the screen (sign-in first when logged out). */
function LiveGrid({ screens }: { screens: Thumb[] }) {
  if (screens.length === 0) return null;
  return (
    <section aria-label="From the library">
      <Container>
        <ScreenGrid columns="web" className="grid-cols-2 gap-x-3 sm:gap-x-5">
          {screens.map((screen, index) => (
            <ScreenGridItem
              key={screen.id}
              // 3 columns until 2xl, 4 after: show 6, then 8, so rows are always full.
              className={cn(index >= 6 && "hidden 2xl:block", index >= 4 && "max-sm:hidden")}
            >
              <ScreenTile
                screen={screen}
                priority={index < 3}
                linkRender={<a href={`/screens/${screen.id}`} />}
              />
              <div className="mt-3 flex min-w-0 items-center gap-2.5 px-0.5">
                <AppLogo
                  app={screen.app}
                  size="sm"
                  className="max-sm:size-5 max-sm:rounded-[5px]"
                />
                <span className="truncate text-sm font-medium text-fg sm:text-base">
                  {screen.app.name}
                </span>
              </div>
            </ScreenGridItem>
          ))}
        </ScreenGrid>
      </Container>
    </section>
  );
}

function FeatureRow({
  eyebrow,
  title,
  body,
  link,
  visual,
  reverse = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  link: { label: string; slug: string };
  visual: ReactNode;
  reverse?: boolean;
}) {
  return (
    <Container>
      <div className="mx-auto grid max-w-[1200px] items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <div className={cn("max-w-md", reverse && "lg:order-2 lg:justify-self-end")}>
          <p className="text-sm font-medium text-fg-muted">{eyebrow}</p>
          <h2 className="mt-3 text-xl font-semibold text-balance text-fg">{title}</h2>
          <p className="mt-4 text-md text-pretty text-fg-muted">{body}</p>
          <Link
            to="/docs/$slug"
            params={{ slug: link.slug }}
            className="ou-focus-ring group mt-6 inline-flex items-center gap-1.5 rounded-xs text-base font-medium text-fg"
          >
            {link.label}
            <ArrowRight
              aria-hidden
              className="size-4 transition-transform duration-150 group-hover:translate-x-0.5"
            />
          </Link>
        </div>
        <div className={cn(reverse && "lg:order-1")}>{visual}</div>
      </div>
    </Container>
  );
}

const VISUAL = "relative overflow-hidden rounded-tile bg-tile";

function LibraryVisual({ screens }: { screens: Thumb[] }) {
  const shots = screens.slice(0, 4);
  const chips = ["All", "Landing", "Pricing", "Login", "Dashboard", "Docs"];
  return (
    <div aria-hidden className={cn(VISUAL, "p-6 sm:p-8")}>
      <div className="flex items-center gap-2 overflow-hidden">
        {chips.map((chip, index) => (
          <span
            key={chip}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-pill border px-3.5 text-sm font-medium",
              index === 2
                ? "border-transparent bg-inverse text-inverse-fg"
                : "border-border-strong bg-bg text-fg",
            )}
          >
            {chip}
          </span>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4">
        {shots.map((screen) => (
          <div key={screen.id} className="min-w-0">
            <div className="rounded-card bg-bg p-[6%]">
              <ScreenImage
                src={screen.thumbUrl}
                width={screen.width}
                height={screen.height}
                platform="web"
                alt=""
                sizes="300px"
              />
            </div>
            <div className="mt-2 flex min-w-0 items-center gap-2">
              <AppLogo app={screen.app} size="xs" />
              <span className="truncate text-sm font-medium text-fg">{screen.app.name}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The extension popup, rendered in HTML (same layout as apps/extension popup). */
function ExtensionVisual() {
  const row = "flex items-center gap-2.5 px-3";
  return (
    <div aria-hidden className={cn(VISUAL, "flex justify-center px-6 py-10 sm:py-14")}>
      <div className="w-[320px] max-w-full rounded-card bg-surface text-sm text-fg shadow-overlay">
        <div className="flex items-center justify-between px-4 pt-3.5 pb-3">
          <span className="flex items-center gap-2">
            <LogoMark size={18} />
            <span className="text-base font-semibold tracking-[-0.01em]">Open UI</span>
          </span>
          <SettingsIcon className="size-4 text-fg-muted" strokeWidth={1.75} />
        </div>
        <div className="mx-3 divide-y divide-border rounded-control border border-border">
          <div className={cn(row, "h-12")}>
            <span className="flex size-6 items-center justify-center rounded-full bg-muted-strong text-2xs font-semibold">
              A
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">Ada Lovelace</span>
              <span className="block truncate text-xs text-fg-muted">openui.example.com</span>
            </span>
            <span className="size-2 rounded-full bg-success" />
          </div>
          <div className={cn(row, "h-10")}>
            <span className="size-2 rounded-full bg-success" />
            <span className="flex-1 font-medium">MCP bridge</span>
            <span className="text-fg-muted">Connected</span>
          </div>
        </div>
        <div className="space-y-2 px-3 pt-3">
          <span className="flex h-10 items-center justify-between rounded-pill bg-inverse pr-3 pl-3.5 font-medium text-inverse-fg">
            <span className="flex items-center gap-2">
              <Maximize2 className="size-4" strokeWidth={1.75} />
              Capture full page
            </span>
            <Kbd className="border-transparent bg-white/15 text-inverse-fg">⌥⇧F</Kbd>
          </span>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: ScanLine, label: "Visible" },
              { icon: Crosshair, label: "Element" },
            ].map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="flex h-10 items-center gap-2 rounded-pill bg-muted px-3 font-medium"
              >
                <Icon className="size-4" strokeWidth={1.75} />
                {label}
              </span>
            ))}
          </div>
        </div>
        <div className="mx-3 mt-3 flex items-center gap-3 px-1 py-1">
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 font-medium">
              Record flow
              <span className="size-1.5 rounded-full bg-danger" />
            </span>
            <span className="block text-xs text-fg-muted">Each capture becomes the next step</span>
          </span>
          <span className="flex h-5 w-8 items-center rounded-pill bg-inverse p-0.5">
            <span className="ml-auto size-4 rounded-full bg-inverse-fg" />
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-border px-4 py-3">
          <span className="text-fg-muted tabular-nums">
            <span className="font-medium text-fg">4</span> shots in tray
          </span>
          <span className="flex h-7 items-center gap-1 rounded-pill bg-muted pr-2.5 pl-3 text-xs font-medium">
            Open tray
            <ArrowUpRight className="size-3.5" strokeWidth={1.75} />
          </span>
        </div>
      </div>
    </div>
  );
}

function McpVisual({ origin, pricing }: { origin: string; pricing: Thumb[] }) {
  return (
    <div className={cn(VISUAL, "flex flex-col gap-4 p-6 sm:p-8")}>
      <CodeBlock
        title="Terminal"
        className="bg-bg"
        code={`claude mcp add --transport http open-ui ${origin}/mcp \\\n  --header "Authorization: Bearer oui_…"`}
      />
      <div aria-hidden className="rounded-card bg-bg p-4">
        <p className="font-mono text-[13px] leading-[21px] text-fg">
          <span className="text-fg-muted">open-ui</span> · search_screens
          <span className="text-fg-muted">{" { "}</span>pattern:{" "}
          <span className="text-accent">"pricing"</span>
          <span className="text-fg-muted">{" }"}</span>
        </p>
        {pricing.length > 0 ? (
          <div className="mt-3 grid grid-cols-3 gap-3">
            {pricing.slice(0, 3).map((screen) => (
              <div key={screen.id} className="min-w-0">
                <ScreenImage
                  src={screen.thumbUrl}
                  width={screen.width}
                  height={screen.height}
                  platform="web"
                  alt=""
                  sizes="200px"
                />
                <p className="mt-1.5 truncate text-xs text-fg-muted">{screen.app.name}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function OpenSource() {
  return (
    <Container className="mt-28 sm:mt-36">
      <div className="mx-auto grid max-w-[1200px] gap-10 rounded-tile border border-border p-6 sm:p-10 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div>
          <h2 className="text-xl font-semibold text-balance text-fg">
            Open source and self-hostable
          </h2>
          <p className="mt-4 max-w-md text-md text-pretty text-fg-muted">
            Run your own library on Cloudflare Workers with D1 and R2 — or locally, without an
            account. Apache-2.0, no tracking, your screenshots stay yours.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button render={<Link to="/docs/$slug" params={{ slug: "quickstart" }} />}>
              Read the quickstart
            </Button>
            <Button
              variant="outline"
              render={<a href={GITHUB_URL} target="_blank" rel="noreferrer noopener" />}
            >
              View on GitHub
              <ArrowUpRight />
            </Button>
          </div>
        </div>
        <CodeBlock
          title="Terminal"
          code={`git clone ${GITHUB_URL}.git\ncd open-ui\npnpm install\npnpm dev`}
        />
      </div>
    </Container>
  );
}
