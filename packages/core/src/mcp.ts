import { z } from "zod";

import {
  appInputSchema,
  categorySchema,
  elementSchema,
  flowTypeSchema,
  patternSchema,
  platformSchema,
} from "./schemas";

/**
 * MCP tool contract shared by the remote server (apps/web `/mcp`) and the local stdio server
 * (packages/mcp). Each entry is a name, a one-line description written for agents, and a zod
 * object describing the arguments. Servers register these verbatim so agents see one vocabulary.
 */
export interface ToolSpec<Shape extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  input: z.ZodObject<Shape>;
  readOnly: boolean;
}

const tool = <Shape extends z.ZodRawShape>(spec: ToolSpec<Shape>) => spec;

export const catalogTools = {
  search_screens: tool({
    name: "search_screens",
    title: "Search screens",
    description:
      "Search published UI screens by free text and/or taxonomy filters. Returns screen ids, app, patterns and thumbnail URLs. Use get_screen to see an image.",
    input: z.object({
      query: z.string().max(200).optional().describe("Free text, e.g. 'pricing table with toggle'"),
      platform: platformSchema.optional(),
      pattern: patternSchema.optional().describe("Screen pattern slug, see get_taxonomy"),
      element: elementSchema.optional().describe("UI element slug, see get_taxonomy"),
      app: z.string().optional().describe("App slug"),
      limit: z.number().int().min(1).max(30).default(12),
      cursor: z.string().optional(),
    }),
    readOnly: true,
  }),
  search_flows: tool({
    name: "search_flows",
    title: "Search flows",
    description: "Search ordered multi-screen user flows (onboarding, checkout, signing up…).",
    input: z.object({
      query: z.string().max(200).optional(),
      platform: platformSchema.optional(),
      type: flowTypeSchema.optional(),
      app: z.string().optional().describe("App slug"),
      limit: z.number().int().min(1).max(20).default(8),
      cursor: z.string().optional(),
    }),
    readOnly: true,
  }),
  list_apps: tool({
    name: "list_apps",
    title: "List apps",
    description: "List apps in the catalog, optionally filtered by platform, category or text.",
    input: z.object({
      query: z.string().max(200).optional(),
      platform: platformSchema.optional(),
      category: categorySchema.optional(),
      sort: z.enum(["latest", "popular"]).default("latest"),
      limit: z.number().int().min(1).max(50).default(20),
      cursor: z.string().optional(),
    }),
    readOnly: true,
  }),
  get_app: tool({
    name: "get_app",
    title: "Get app",
    description: "Get one app with its screen/flow counts, versions, patterns and elements.",
    input: z.object({ slug: z.string().min(1) }),
    readOnly: true,
  }),
  get_screen: tool({
    name: "get_screen",
    title: "Get screen",
    description:
      "Get one screen's metadata and the screenshot itself as image content (thumbnail by default; set full=true for the full-resolution image).",
    input: z.object({
      id: z.string().min(1),
      full: z.boolean().default(false),
    }),
    readOnly: true,
  }),
  get_flow: tool({
    name: "get_flow",
    title: "Get flow",
    description:
      "Get a flow with its ordered steps. Set includeImages=true to receive step thumbnails as image content.",
    input: z.object({
      id: z.string().min(1),
      includeImages: z.boolean().default(false),
    }),
    readOnly: true,
  }),
  get_taxonomy: tool({
    name: "get_taxonomy",
    title: "Get taxonomy",
    description: "List valid platforms, categories, screen patterns, UI elements and flow types.",
    input: z.object({}),
    readOnly: true,
  }),
  upload_screen: tool({
    name: "upload_screen",
    title: "Upload screen",
    description:
      "Upload one screenshot (base64 PNG/JPEG/WebP) to the catalog under an app (created if missing). Member uploads await review.",
    input: z.object({
      app: appInputSchema,
      image: z.object({
        type: z.enum(["image/png", "image/jpeg", "image/webp"]),
        base64: z.string().min(1),
      }),
      title: z.string().max(160).optional(),
      sourceUrl: z.url().optional(),
      patterns: z.array(patternSchema).max(8).default([]),
      elements: z.array(elementSchema).max(24).default([]),
    }),
    readOnly: false,
  }),
  create_flow: tool({
    name: "create_flow",
    title: "Create flow",
    description: "Create an ordered flow from existing screen ids of one app.",
    input: z.object({
      appId: z.string().min(1),
      name: z.string().min(1).max(80),
      type: flowTypeSchema.optional(),
      steps: z
        .array(z.object({ screenId: z.string().min(1), label: z.string().max(80).optional() }))
        .min(2),
    }),
    readOnly: false,
  }),
} as const;

export const browserTools = {
  browser_status: tool({
    name: "browser_status",
    title: "Browser status",
    description:
      "Report the active capture driver: 'extension' (the user's real browser via the Open UI extension) or 'headless' (local Chromium), plus open tabs when available.",
    input: z.object({}),
    readOnly: true,
  }),
  browser_navigate: tool({
    name: "browser_navigate",
    title: "Navigate",
    description: "Open a URL in the capture browser and wait for it to settle.",
    input: z.object({
      url: z.url(),
      viewport: z.enum(["desktop", "mobile"]).default("desktop"),
      newTab: z.boolean().default(false),
    }),
    readOnly: false,
  }),
  browser_screenshot: tool({
    name: "browser_screenshot",
    title: "Screenshot",
    description:
      "Screenshot the current page (viewport by default, fullPage for the whole page, or a CSS selector). Returns the image.",
    input: z.object({
      fullPage: z.boolean().default(false),
      selector: z.string().optional(),
    }),
    readOnly: true,
  }),
  browser_extract: tool({
    name: "browser_extract",
    title: "Extract page metadata",
    description:
      "Extract title, description, favicon, Open Graph image, theme color, headings and same-origin links from the current page.",
    input: z.object({}),
    readOnly: true,
  }),
  site_crawl: tool({
    name: "site_crawl",
    title: "Crawl site",
    description:
      "Breadth-first crawl of same-origin pages from a start URL. Returns pages with titles and suggested screen patterns; use capture_pages next.",
    input: z.object({
      url: z.url(),
      maxPages: z.number().int().min(1).max(50).default(12),
      maxDepth: z.number().int().min(0).max(4).default(1),
      include: z.array(z.string()).optional().describe("Substrings a path must contain"),
      exclude: z.array(z.string()).optional().describe("Substrings that exclude a path"),
    }),
    readOnly: true,
  }),
  capture_pages: tool({
    name: "capture_pages",
    title: "Capture pages",
    description:
      "Capture screenshots of the given URLs, auto-tag patterns, and (upload=true) publish them to the Open UI catalog as one app, optionally as an ordered flow.",
    input: z.object({
      urls: z.array(z.url()).min(1).max(50),
      app: z
        .object({
          name: z.string().max(80).optional(),
          websiteUrl: z.url().optional(),
          platform: platformSchema.default("web"),
          category: categorySchema.optional(),
        })
        .default({ platform: "web" }),
      flow: z
        .object({ name: z.string().min(1).max(80), type: flowTypeSchema.optional() })
        .optional(),
      viewport: z.enum(["desktop", "mobile"]).default("desktop"),
      fullPage: z.boolean().default(false),
      upload: z.boolean().default(true),
    }),
    readOnly: false,
  }),
} as const;

export type CatalogToolName = keyof typeof catalogTools;
export type BrowserToolName = keyof typeof browserTools;
