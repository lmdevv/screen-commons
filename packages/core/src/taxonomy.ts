/**
 * Catalog taxonomy. Slugs are stable identifiers stored in the database; labels are display copy.
 * `match` holds URL path segments / title keywords used by `suggestPatterns` to auto-tag captures.
 */

export interface TaxonomyTerm {
  slug: string;
  label: string;
}

export interface PatternTerm extends TaxonomyTerm {
  match?: readonly string[];
}

export const PLATFORMS = [
  { slug: "web", label: "Web" },
  { slug: "ios", label: "iOS" },
  { slug: "android", label: "Android" },
] as const satisfies readonly TaxonomyTerm[];

export const CATEGORIES = [
  { slug: "ai", label: "AI" },
  { slug: "business", label: "Business" },
  { slug: "collaboration", label: "Collaboration" },
  { slug: "communication", label: "Communication" },
  { slug: "crypto", label: "Crypto & Web3" },
  { slug: "design", label: "Design" },
  { slug: "developer-tools", label: "Developer Tools" },
  { slug: "education", label: "Education" },
  { slug: "entertainment", label: "Entertainment" },
  { slug: "finance", label: "Finance" },
  { slug: "food-drink", label: "Food & Drink" },
  { slug: "health-fitness", label: "Health & Fitness" },
  { slug: "lifestyle", label: "Lifestyle" },
  { slug: "music-audio", label: "Music & Audio" },
  { slug: "news", label: "News" },
  { slug: "productivity", label: "Productivity" },
  { slug: "shopping", label: "Shopping" },
  { slug: "social", label: "Social" },
  { slug: "travel", label: "Travel & Transportation" },
  { slug: "utilities", label: "Utilities" },
] as const satisfies readonly TaxonomyTerm[];

/** Screen patterns: what a whole screen is. */
export const PATTERNS = [
  { slug: "landing", label: "Landing", match: ["", "home", "index"] },
  { slug: "pricing", label: "Pricing", match: ["pricing", "plans", "price"] },
  { slug: "login", label: "Login", match: ["login", "log-in", "signin", "sign-in", "sign_in"] },
  {
    slug: "signup",
    label: "Signup",
    match: ["signup", "sign-up", "sign_up", "register", "join", "get-started", "start", "trial"],
  },
  { slug: "onboarding", label: "Onboarding", match: ["onboarding", "welcome", "setup"] },
  { slug: "dashboard", label: "Dashboard", match: ["dashboard", "overview", "home-app"] },
  { slug: "settings", label: "Settings", match: ["settings", "preferences", "account"] },
  { slug: "profile", label: "Profile", match: ["profile", "user", "me"] },
  { slug: "checkout", label: "Checkout", match: ["checkout", "cart", "payment", "billing"] },
  { slug: "search", label: "Search", match: ["search", "explore", "discover"] },
  { slug: "features", label: "Features", match: ["features", "product", "products", "platform"] },
  { slug: "integrations", label: "Integrations", match: ["integrations", "apps", "marketplace"] },
  {
    slug: "customers",
    label: "Customers",
    match: ["customers", "case-studies", "stories", "showcase"],
  },
  { slug: "docs", label: "Docs", match: ["docs", "documentation", "guides", "reference", "api"] },
  { slug: "blog", label: "Blog", match: ["blog", "news", "articles", "posts"] },
  { slug: "article", label: "Article" },
  {
    slug: "changelog",
    label: "Changelog",
    match: ["changelog", "releases", "whats-new", "updates"],
  },
  { slug: "about", label: "About", match: ["about", "company", "team", "mission"] },
  { slug: "careers", label: "Careers", match: ["careers", "jobs", "hiring"] },
  { slug: "contact", label: "Contact", match: ["contact", "support", "help", "sales"] },
  { slug: "help-center", label: "Help Center", match: ["help-center", "faq", "kb", "knowledge"] },
  { slug: "legal", label: "Legal", match: ["privacy", "terms", "legal", "security", "dpa"] },
  { slug: "detail", label: "Detail" },
  { slug: "feed", label: "Feed", match: ["feed", "timeline"] },
  { slug: "chat", label: "Chat", match: ["chat", "messages", "inbox"] },
  { slug: "editor", label: "Editor", match: ["editor", "new", "compose", "create"] },
  { slug: "analytics", label: "Analytics", match: ["analytics", "insights", "reports"] },
  { slug: "empty-state", label: "Empty State" },
  { slug: "error", label: "Error", match: ["404", "500", "error", "not-found"] },
  { slug: "paywall", label: "Paywall", match: ["upgrade", "subscribe", "premium"] },
] as const satisfies readonly PatternTerm[];

/** UI elements: components visible within a screen. */
export const ELEMENTS = [
  { slug: "accordion", label: "Accordion" },
  { slug: "avatar", label: "Avatar" },
  { slug: "badge", label: "Badge" },
  { slug: "banner", label: "Banner" },
  { slug: "bottom-sheet", label: "Bottom Sheet" },
  { slug: "breadcrumb", label: "Breadcrumb" },
  { slug: "button", label: "Button" },
  { slug: "card", label: "Card" },
  { slug: "carousel", label: "Carousel" },
  { slug: "chart", label: "Chart" },
  { slug: "checkbox", label: "Checkbox" },
  { slug: "code-block", label: "Code Block" },
  { slug: "command-palette", label: "Command Palette" },
  { slug: "cta", label: "Call to Action" },
  { slug: "date-picker", label: "Date Picker" },
  { slug: "dialog", label: "Dialog" },
  { slug: "drawer", label: "Drawer" },
  { slug: "dropdown-menu", label: "Dropdown Menu" },
  { slug: "faq", label: "FAQ" },
  { slug: "file-upload", label: "File Upload" },
  { slug: "footer", label: "Footer" },
  { slug: "form", label: "Form" },
  { slug: "hero", label: "Hero" },
  { slug: "logo-cloud", label: "Logo Cloud" },
  { slug: "navigation-bar", label: "Navigation Bar" },
  { slug: "pagination", label: "Pagination" },
  { slug: "popover", label: "Popover" },
  { slug: "pricing-table", label: "Pricing Table" },
  { slug: "progress", label: "Progress Indicator" },
  { slug: "search-bar", label: "Search Bar" },
  { slug: "segmented-control", label: "Segmented Control" },
  { slug: "side-navigation", label: "Side Navigation" },
  { slug: "skeleton", label: "Skeleton" },
  { slug: "slider", label: "Slider" },
  { slug: "stepper", label: "Stepper" },
  { slug: "table", label: "Table" },
  { slug: "tabs", label: "Tabs" },
  { slug: "testimonial", label: "Testimonial" },
  { slug: "text-field", label: "Text Field" },
  { slug: "toast", label: "Toast" },
  { slug: "toggle", label: "Toggle" },
  { slug: "tooltip", label: "Tooltip" },
  { slug: "video-player", label: "Video Player" },
] as const satisfies readonly TaxonomyTerm[];

export const FLOW_TYPES = [
  { slug: "onboarding", label: "Onboarding" },
  { slug: "signing-up", label: "Signing Up" },
  { slug: "logging-in", label: "Logging In" },
  { slug: "resetting-password", label: "Resetting Password" },
  { slug: "checkout", label: "Checkout" },
  { slug: "upgrading", label: "Subscribing & Upgrading" },
  { slug: "searching", label: "Searching & Finding" },
  { slug: "filtering", label: "Filtering & Sorting" },
  { slug: "editing-profile", label: "Editing Profile" },
  { slug: "inviting", label: "Inviting Teammates" },
  { slug: "creating", label: "Creating Content" },
  { slug: "sharing", label: "Sharing" },
  { slug: "settings", label: "Changing Settings" },
  { slug: "integrating", label: "Connecting Integrations" },
  { slug: "support", label: "Contacting Support" },
  { slug: "exploring", label: "Exploring the Product" },
] as const satisfies readonly TaxonomyTerm[];

export type Platform = (typeof PLATFORMS)[number]["slug"];
export type CategorySlug = (typeof CATEGORIES)[number]["slug"];
export type PatternSlug = (typeof PATTERNS)[number]["slug"];
export type ElementSlug = (typeof ELEMENTS)[number]["slug"];
export type FlowTypeSlug = (typeof FLOW_TYPES)[number]["slug"];

const slugsOf = <T extends readonly TaxonomyTerm[]>(terms: T) =>
  terms.map((term) => term.slug) as unknown as [T[number]["slug"], ...T[number]["slug"][]];

export const PLATFORM_SLUGS = slugsOf(PLATFORMS);
export const CATEGORY_SLUGS = slugsOf(CATEGORIES);
export const PATTERN_SLUGS = slugsOf(PATTERNS);
export const ELEMENT_SLUGS = slugsOf(ELEMENTS);
export const FLOW_TYPE_SLUGS = slugsOf(FLOW_TYPES);

const labelIndex = new Map<string, string>(
  [...PLATFORMS, ...CATEGORIES, ...PATTERNS, ...ELEMENTS, ...FLOW_TYPES].map((term) => [
    term.slug,
    term.label,
  ]),
);

export function labelFor(slug: string): string {
  return labelIndex.get(slug) ?? slug;
}

export const TAXONOMY = {
  platforms: PLATFORMS,
  categories: CATEGORIES,
  patterns: PATTERNS.map(({ slug, label }) => ({ slug, label })),
  elements: ELEMENTS,
  flowTypes: FLOW_TYPES,
} as const;

export type Taxonomy = typeof TAXONOMY;
