import type { CategorySlug, FlowTypeSlug } from "../../packages/core/src/index";

export interface SeedFlow {
  name: string;
  type: FlowTypeSlug;
  /** Ordered paths; each must also be listed in the site's `paths`. */
  paths: string[];
}

export interface SeedSite {
  slug: string;
  name: string;
  category: CategorySlug;
  tagline: string;
  websiteUrl: string;
  /** Canonical pages to capture (verified to exist, Oct 2026). */
  paths: string[];
  flows: SeedFlow[];
}

const signingUp = (...paths: string[]): SeedFlow => ({
  name: "Signing up",
  type: "signing-up",
  paths,
});
const exploring = (...paths: string[]): SeedFlow => ({
  name: "Exploring the product",
  type: "exploring",
  paths,
});

/** Curated, well-designed public marketing sites spanning categories. */
export const SITES: SeedSite[] = [
  {
    slug: "linear",
    name: "Linear",
    category: "productivity",
    tagline: "The product development system for teams and agents",
    websiteUrl: "https://linear.app",
    paths: ["/", "/pricing", "/login", "/signup", "/customers", "/changelog", "/about", "/docs"],
    flows: [signingUp("/", "/pricing", "/signup"), exploring("/", "/customers", "/changelog")],
  },
  {
    slug: "vercel",
    name: "Vercel",
    category: "developer-tools",
    tagline: "Build and deploy the best web experiences",
    websiteUrl: "https://vercel.com",
    paths: [
      "/",
      "/pricing",
      "/login",
      "/signup",
      "/customers",
      "/enterprise",
      "/blog",
      "/changelog",
    ],
    flows: [signingUp("/", "/pricing", "/signup"), exploring("/", "/enterprise", "/customers")],
  },
  {
    slug: "stripe",
    name: "Stripe",
    category: "finance",
    tagline: "Financial infrastructure to grow your revenue",
    websiteUrl: "https://stripe.com",
    paths: ["/", "/pricing", "/customers", "/enterprise", "/blog", "/about", "/payments"],
    flows: [exploring("/", "/payments", "/pricing")],
  },
  {
    slug: "raycast",
    name: "Raycast",
    category: "productivity",
    tagline: "Your shortcut to everything",
    websiteUrl: "https://www.raycast.com",
    paths: ["/", "/pricing", "/pro", "/store", "/changelog", "/blog", "/teams"],
    flows: [exploring("/", "/store", "/pro", "/pricing")],
  },
  {
    slug: "supabase",
    name: "Supabase",
    category: "developer-tools",
    tagline: "The Postgres development platform",
    websiteUrl: "https://supabase.com",
    paths: [
      "/",
      "/pricing",
      "/dashboard/sign-in",
      "/dashboard/sign-up",
      "/docs",
      "/blog",
      "/customers",
      "/database",
    ],
    flows: [
      signingUp("/", "/pricing", "/dashboard/sign-up"),
      exploring("/", "/database", "/customers"),
    ],
  },
  {
    slug: "resend",
    name: "Resend",
    category: "developer-tools",
    tagline: "Email for developers",
    websiteUrl: "https://resend.com",
    paths: ["/", "/pricing", "/login", "/signup", "/customers", "/blog", "/changelog", "/about"],
    flows: [signingUp("/", "/pricing", "/signup")],
  },
  {
    slug: "cal-com",
    name: "Cal.com",
    category: "productivity",
    tagline: "Scheduling infrastructure for everyone",
    websiteUrl: "https://cal.com",
    paths: ["/", "/pricing", "/enterprise", "/blog", "/about", "/signup", "/login"],
    flows: [signingUp("/", "/pricing", "/signup")],
  },
  {
    slug: "posthog",
    name: "PostHog",
    category: "developer-tools",
    tagline: "The product OS for developers",
    websiteUrl: "https://posthog.com",
    paths: ["/", "/pricing", "/docs", "/blog", "/changelog", "/about", "/customers"],
    flows: [exploring("/", "/customers", "/pricing")],
  },
  {
    slug: "figma",
    name: "Figma",
    category: "design",
    tagline: "The collaborative interface design tool",
    websiteUrl: "https://www.figma.com",
    paths: ["/", "/pricing", "/login", "/signup", "/design", "/customers", "/blog"],
    flows: [signingUp("/", "/pricing", "/signup"), exploring("/", "/design", "/customers")],
  },
  {
    slug: "notion",
    name: "Notion",
    category: "productivity",
    tagline: "The AI workspace that works for you",
    websiteUrl: "https://www.notion.com",
    paths: ["/", "/pricing", "/login", "/signup", "/customers", "/enterprise", "/blog"],
    flows: [signingUp("/", "/pricing", "/signup"), exploring("/", "/enterprise", "/customers")],
  },
  {
    slug: "framer",
    name: "Framer",
    category: "design",
    tagline: "Design and publish your dream site",
    websiteUrl: "https://www.framer.com",
    paths: ["/", "/pricing", "/enterprise", "/blog", "/marketplace", "/updates"],
    flows: [exploring("/", "/enterprise", "/pricing")],
  },
  {
    slug: "arc",
    name: "Arc",
    category: "utilities",
    tagline: "The browser that browses for you",
    websiteUrl: "https://arc.net",
    paths: ["/", "/max", "/students", "/blog"],
    flows: [],
  },
  {
    slug: "clerk",
    name: "Clerk",
    category: "developer-tools",
    tagline: "The most comprehensive user management platform",
    websiteUrl: "https://clerk.com",
    paths: ["/", "/pricing", "/docs", "/blog", "/changelog", "/user-authentication"],
    flows: [exploring("/", "/user-authentication", "/pricing")],
  },
  {
    slug: "planetscale",
    name: "PlanetScale",
    category: "developer-tools",
    tagline: "The world's fastest and most scalable cloud databases",
    websiteUrl: "https://planetscale.com",
    paths: ["/", "/pricing", "/docs", "/blog", "/changelog", "/customers", "/about"],
    flows: [exploring("/", "/customers", "/pricing")],
  },
  {
    slug: "tailwind-css",
    name: "Tailwind CSS",
    category: "developer-tools",
    tagline: "Rapidly build modern websites without ever leaving your HTML",
    websiteUrl: "https://tailwindcss.com",
    paths: ["/", "/docs/installation", "/blog", "/showcase"],
    flows: [exploring("/", "/showcase", "/docs/installation")],
  },
  {
    slug: "github",
    name: "GitHub",
    category: "developer-tools",
    tagline: "The world's leading AI-powered developer platform",
    websiteUrl: "https://github.com",
    paths: ["/", "/pricing", "/login", "/features", "/enterprise", "/customer-stories", "/about"],
    flows: [
      { name: "Logging in", type: "logging-in", paths: ["/", "/login"] },
      exploring("/", "/features", "/enterprise"),
    ],
  },
  {
    slug: "loom",
    name: "Loom",
    category: "communication",
    tagline: "Video messaging for work",
    websiteUrl: "https://www.loom.com",
    paths: ["/", "/pricing", "/login", "/customers", "/enterprise"],
    flows: [exploring("/", "/customers", "/pricing")],
  },
  {
    slug: "pitch",
    name: "Pitch",
    category: "collaboration",
    tagline: "Presentation software for fast-moving teams",
    websiteUrl: "https://pitch.com",
    paths: ["/", "/pricing", "/templates", "/blog", "/about"],
    flows: [exploring("/", "/templates", "/pricing")],
  },
  {
    slug: "mercury",
    name: "Mercury",
    category: "finance",
    tagline: "Banking for ambitious companies",
    websiteUrl: "https://mercury.com",
    paths: ["/", "/pricing", "/about", "/blog", "/treasury", "/signup"],
    flows: [signingUp("/", "/pricing", "/signup")],
  },
  {
    slug: "ramp",
    name: "Ramp",
    category: "finance",
    tagline: "Save time and money with the finance automation platform",
    websiteUrl: "https://ramp.com",
    paths: ["/", "/pricing", "/customers", "/blog", "/about-us"],
    flows: [exploring("/", "/customers", "/pricing")],
  },
  {
    slug: "airtable",
    name: "Airtable",
    category: "productivity",
    tagline: "Build apps on your data",
    websiteUrl: "https://www.airtable.com",
    paths: ["/", "/pricing", "/login", "/signup", "/platform", "/customer-stories", "/templates"],
    flows: [signingUp("/", "/pricing", "/signup")],
  },
  {
    slug: "webflow",
    name: "Webflow",
    category: "design",
    tagline: "The website experience platform",
    websiteUrl: "https://webflow.com",
    paths: ["/", "/pricing", "/login", "/customers", "/blog", "/enterprise", "/templates"],
    flows: [exploring("/", "/enterprise", "/customers")],
  },
  {
    slug: "dub",
    name: "Dub",
    category: "business",
    tagline: "The modern link attribution platform",
    websiteUrl: "https://dub.co",
    paths: ["/", "/pricing", "/customers", "/blog", "/changelog", "/about", "/enterprise"],
    flows: [exploring("/", "/customers", "/pricing")],
  },
  {
    slug: "attio",
    name: "Attio",
    category: "business",
    tagline: "The AI CRM",
    websiteUrl: "https://attio.com",
    paths: ["/", "/pricing", "/customers", "/blog", "/changelog", "/careers"],
    flows: [exploring("/", "/customers", "/pricing")],
  },
];
