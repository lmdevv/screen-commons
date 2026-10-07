import type {
  AppDetail,
  AppSummary,
  Collection,
  FlowDetail,
  FlowSummary,
  Screen,
  ScreenDetail,
  User,
} from "@open-ui/core/schemas";
import type { CategorySlug, ElementSlug, PatternSlug, Platform } from "@open-ui/core/taxonomy";

import manifest from "../public/mock/manifest.json";

/* Synthetic catalog for the showcase — invented apps rendered by scripts/mock-pages.ts. */

const sizes = manifest as Record<string, { width: number; height: number; bytes: number }>;
const url = (file: string) => `/mock/${file}`;

interface AppSeed {
  slug: string;
  name: string;
  tagline: string;
  platform: Platform;
  category: CategorySlug;
  websiteUrl: string;
  accentColor: string;
  description: string;
}

const appSeeds: AppSeed[] = [
  { slug: "northwind", name: "Northwind", tagline: "Product analytics for teams that ship", platform: "web", category: "business", websiteUrl: "https://northwind.example", accentColor: "#4f46e5", description: "Event analytics with funnels, retention and live dashboards." },
  { slug: "lumen", name: "Lumen", tagline: "The calm writing workspace", platform: "web", category: "productivity", websiteUrl: "https://lumen.example", accentColor: "#0f766e", description: "Distraction-free notes, drafts and long-form writing." },
  { slug: "relay", name: "Relay", tagline: "Ship releases with confidence", platform: "web", category: "developer-tools", websiteUrl: "https://relay.example", accentColor: "#3ddc84", description: "Automated changelogs and release notes from your commits." },
  { slug: "atlas", name: "Atlas Pay", tagline: "Payments infrastructure for the internet", platform: "web", category: "finance", websiteUrl: "https://atlas.example", accentColor: "#1d4ed8", description: "Cards, wallets and bank transfers in one integration." },
  { slug: "tally", name: "Tally", tagline: "Budgeting that finally adds up", platform: "ios", category: "finance", websiteUrl: "https://tally.example", accentColor: "#059669", description: "Automatic categorisation, flexible budgets and savings goals." },
  { slug: "wander", name: "Wander", tagline: "Plan trips together", platform: "ios", category: "travel", websiteUrl: "https://wander.example", accentColor: "#e11d48", description: "Shared itineraries for friends who travel together." },
  { slug: "pulse", name: "Pulse", tagline: "Training plans that adapt to you", platform: "android", category: "health-fitness", websiteUrl: "https://pulse.example", accentColor: "#f59e0b", description: "Adaptive running and strength plans." },
];

interface ScreenSeed {
  file: string;
  title: string;
  patterns: PatternSlug[];
  elements: ElementSlug[];
  path: string;
}

const screenSeeds: Record<string, ScreenSeed[]> = {
  northwind: [
    { file: "northwind-landing.webp", title: "Home", patterns: ["landing"], elements: ["hero", "navigation-bar", "logo-cloud", "cta", "footer"], path: "/" },
    { file: "northwind-dashboard.webp", title: "Overview dashboard", patterns: ["dashboard", "analytics"], elements: ["side-navigation", "chart", "card", "table"], path: "/app" },
    { file: "northwind-pricing.webp", title: "Pricing", patterns: ["pricing"], elements: ["pricing-table", "segmented-control", "faq"], path: "/pricing" },
    { file: "northwind-login.webp", title: "Sign in", patterns: ["login"], elements: ["form", "text-field", "button"], path: "/login" },
    { file: "northwind-settings.webp", title: "Workspace settings", patterns: ["settings"], elements: ["tabs", "text-field", "toggle", "side-navigation"], path: "/settings" },
  ],
  lumen: [
    { file: "lumen-landing.webp", title: "Home", patterns: ["landing"], elements: ["hero", "navigation-bar", "card"], path: "/" },
    { file: "lumen-editor.webp", title: "Essay editor", patterns: ["editor"], elements: ["side-navigation"], path: "/app/essays/quiet-software" },
    { file: "lumen-pricing.webp", title: "Pricing", patterns: ["pricing"], elements: ["pricing-table", "faq"], path: "/pricing" },
  ],
  relay: [
    { file: "relay-landing.webp", title: "Home", patterns: ["landing"], elements: ["hero", "code-block", "navigation-bar"], path: "/" },
    { file: "relay-docs.webp", title: "Quickstart", patterns: ["docs"], elements: ["side-navigation", "code-block"], path: "/docs/quickstart" },
    { file: "relay-changelog.webp", title: "Changelog", patterns: ["changelog"], elements: ["chart"], path: "/changelog" },
  ],
  atlas: [
    { file: "atlas-landing.webp", title: "Home", patterns: ["landing"], elements: ["hero", "navigation-bar", "logo-cloud"], path: "/" },
    { file: "atlas-checkout.webp", title: "Hosted checkout", patterns: ["checkout"], elements: ["form", "text-field", "button"], path: "/checkout" },
    { file: "atlas-dashboard.webp", title: "Payments dashboard", patterns: ["dashboard"], elements: ["chart", "card", "side-navigation"], path: "/dashboard" },
  ],
  tally: [
    { file: "tally-onboarding-1.webp", title: "Welcome", patterns: ["onboarding"], elements: ["progress", "button"], path: "/" },
    { file: "tally-onboarding-2.webp", title: "Budgets", patterns: ["onboarding"], elements: ["chart", "progress", "button"], path: "/" },
    { file: "tally-onboarding-3.webp", title: "Goals", patterns: ["onboarding"], elements: ["card", "progress"], path: "/" },
    { file: "tally-signup.webp", title: "Create account", patterns: ["signup"], elements: ["form", "text-field", "checkbox"], path: "/" },
    { file: "tally-home.webp", title: "Home", patterns: ["dashboard"], elements: ["card", "navigation-bar", "progress"], path: "/" },
  ],
  wander: [
    { file: "wander-explore.webp", title: "Explore", patterns: ["feed", "search"], elements: ["search-bar", "card", "navigation-bar"], path: "/" },
    { file: "wander-detail.webp", title: "Trip detail", patterns: ["detail"], elements: ["avatar", "button", "bottom-sheet"], path: "/" },
  ],
  pulse: [
    { file: "pulse-today.webp", title: "Today", patterns: ["dashboard"], elements: ["chart", "card", "navigation-bar"], path: "/" },
    { file: "pulse-workout.webp", title: "Live workout", patterns: ["detail"], elements: ["chart", "button"], path: "/" },
  ],
};

const isoDay = (offset: number) => new Date(Date.UTC(2026, 9, 6 - offset)).toISOString();

export const apps: AppDetail[] = appSeeds.map((seed, appIndex) => {
  const seeds = screenSeeds[seed.slug] ?? [];
  return {
    id: `app_${seed.slug}`,
    slug: seed.slug,
    name: seed.name,
    tagline: seed.tagline,
    platform: seed.platform,
    category: seed.category,
    websiteUrl: seed.websiteUrl,
    logoUrl: url(`logos/${seed.slug}.svg`),
    accentColor: seed.accentColor,
    screenCount: seeds.length * 12 + appIndex * 7,
    flowCount: seed.slug === "tally" || seed.slug === "northwind" ? 3 : 1,
    previews: seeds.slice(0, 3).map((s) => ({
      id: `scr_${s.file.replace(".webp", "")}`,
      thumbUrl: url(s.file),
      width: sizes[s.file]!.width,
      height: Math.min(sizes[s.file]!.height, seed.platform === "web" ? 900 : 844),
    })),
    status: "published",
    updatedAt: isoDay(appIndex),
    description: seed.description,
    versions: ["Oct 2026", "Jul 2026"],
    patterns: [],
    elements: [],
    createdAt: isoDay(40),
  };
});

export const appBySlug = Object.fromEntries(apps.map((app) => [app.slug, app])) as Record<string, AppDetail>;

export const screens: Screen[] = apps.flatMap((app, appIndex) =>
  (screenSeeds[app.slug] ?? []).map((seed, index) => {
    const size = sizes[seed.file]!;
    return {
      id: `scr_${seed.file.replace(".webp", "")}`,
      app: {
        id: app.id,
        slug: app.slug,
        name: app.name,
        platform: app.platform,
        logoUrl: app.logoUrl,
        accentColor: app.accentColor,
      },
      title: seed.title,
      imageUrl: url(seed.file),
      thumbUrl: url(seed.file),
      width: size.width,
      height: size.height,
      bytes: size.bytes,
      sourceUrl: app.platform === "web" ? `${app.websiteUrl}${seed.path}` : null,
      patterns: seed.patterns,
      elements: seed.elements,
      tags: [],
      version: "Oct 2026",
      dominantColor: null,
      status: "published",
      source: "seed",
      saved: index === 1 && appIndex === 0,
      capturedAt: isoDay(appIndex * 2 + index),
      createdAt: isoDay(appIndex * 2 + index),
    } satisfies Screen;
  }),
);

export const screenById = Object.fromEntries(screens.map((s) => [s.id, s])) as Record<string, Screen>;

export const webScreens = screens.filter((s) => s.app.platform === "web");
export const mobileScreens = screens.filter((s) => s.app.platform !== "web");

export function screenDetail(id: string): ScreenDetail {
  const screen = screenById[id]!;
  const siblings = screens.filter((s) => s.app.id === screen.app.id);
  const index = siblings.findIndex((s) => s.id === id);
  return {
    ...screen,
    previousId: siblings[index - 1]?.id ?? null,
    nextId: siblings[index + 1]?.id ?? null,
    flows: screen.app.slug === "tally" && screen.patterns.includes("onboarding")
      ? [{ id: "flow_tally_onboarding", name: "Onboarding", position: index }]
      : screen.app.slug === "northwind" && id.includes("login")
        ? [{ id: "flow_northwind_login", name: "Logging in", position: 1 }]
        : [],
  };
}

function flowFrom(
  id: string,
  name: string,
  type: FlowDetail["type"],
  appSlug: string,
  steps: [string, string][],
  description: string | null = null,
): FlowDetail {
  const app = appBySlug[appSlug]!;
  const flowSteps = steps.map(([file, label], position) => ({
    position,
    label,
    screen: screenById[`scr_${file.replace(".webp", "")}`]!,
  }));
  return {
    id,
    app: { id: app.id, slug: app.slug, name: app.name, platform: app.platform, logoUrl: app.logoUrl, accentColor: app.accentColor },
    name,
    type,
    description,
    stepCount: flowSteps.length,
    previews: flowSteps.map((step) => ({
      id: step.screen.id,
      thumbUrl: step.screen.thumbUrl,
      width: step.screen.width,
      height: Math.min(step.screen.height, step.screen.app.platform === "web" ? 900 : 844),
    })),
    status: "published",
    saved: false,
    createdAt: isoDay(3),
    steps: flowSteps,
  };
}

export const flows: FlowDetail[] = [
  flowFrom("flow_tally_onboarding", "Onboarding", "onboarding", "tally", [
    ["tally-onboarding-1.webp", "Welcome"],
    ["tally-onboarding-2.webp", "Budgets explainer"],
    ["tally-onboarding-3.webp", "Savings goals"],
    ["tally-signup.webp", "Create account"],
    ["tally-home.webp", "First home screen"],
  ], "From the first launch to a personalised home screen in five steps."),
  flowFrom("flow_northwind_login", "Logging in", "logging-in", "northwind", [
    ["northwind-landing.webp", "Landing"],
    ["northwind-login.webp", "Sign in"],
    ["northwind-dashboard.webp", "Dashboard"],
  ]),
  flowFrom("flow_atlas_checkout", "Checkout", "checkout", "atlas", [
    ["atlas-landing.webp", "Landing"],
    ["atlas-checkout.webp", "Hosted checkout"],
    ["atlas-dashboard.webp", "Payment received"],
  ]),
  flowFrom("flow_wander_explore", "Exploring the Product", "exploring", "wander", [
    ["wander-explore.webp", "Explore"],
    ["wander-detail.webp", "Trip detail"],
  ]),
  flowFrom("flow_pulse_workout", "Starting a workout", "creating", "pulse", [
    ["pulse-today.webp", "Today"],
    ["pulse-workout.webp", "Live workout"],
  ]),
  flowFrom("flow_relay_docs", "Getting started", "onboarding", "relay", [
    ["relay-landing.webp", "Landing"],
    ["relay-docs.webp", "Quickstart"],
    ["relay-changelog.webp", "Changelog"],
  ]),
];

export const flowSummaries: FlowSummary[] = flows.map(({ steps: _steps, ...summary }) => summary);

export const collections: Collection[] = [
  { id: "col_saved", name: "Saved", isDefault: true, itemCount: 24, previews: screens.slice(0, 4).map((s) => ({ thumbUrl: s.thumbUrl })), createdAt: isoDay(30) },
  { id: "col_onboarding", name: "Onboarding inspiration", isDefault: false, itemCount: 9, previews: mobileScreens.slice(0, 4).map((s) => ({ thumbUrl: s.thumbUrl })), createdAt: isoDay(20) },
  { id: "col_pricing", name: "Pricing pages", isDefault: false, itemCount: 3, previews: screens.filter((s) => s.patterns.includes("pricing")).map((s) => ({ thumbUrl: s.thumbUrl })), createdAt: isoDay(10) },
  { id: "col_empty", name: "Checkout ideas", isDefault: false, itemCount: 0, previews: [], createdAt: isoDay(2) },
];

export const user: User = {
  id: "usr_1",
  name: "Mira Okafor",
  email: "mira@openui.dev",
  image: null,
  role: "admin",
  createdAt: isoDay(90),
};

export type { AppSummary };
