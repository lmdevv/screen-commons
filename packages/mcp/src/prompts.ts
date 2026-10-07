import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CATEGORY_SLUGS, FLOW_TYPE_SLUGS, PATTERN_SLUGS, TAXONOMY } from "@open-ui/core";
import { z } from "zod";

export const TAXONOMY_RESOURCE_URI = "open-ui://taxonomy";

export function registerPrompts(server: McpServer) {
  server.registerPrompt(
    "capture_site",
    {
      title: "Capture a website into Open UI",
      description:
        "Crawl a site, pick its canonical marketing pages and capture + upload them as one app (optionally a flow).",
      argsSchema: {
        url: z.string().describe("Site to capture, e.g. https://linear.app"),
        maxPages: z.string().optional().describe("How many pages to capture (default 8)"),
        flow: z.string().optional().describe('Optional flow to record, e.g. "Signing up"'),
      },
    },
    ({ url, maxPages, flow }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Capture ${url} into the Open UI catalog.`,
              "",
              "1. Call browser_status to see whether the user's browser (extension) or headless Chromium will be used.",
              `2. Call site_crawl with url=${url}, maxDepth=1, maxPages=20 to discover pages.`,
              `3. From the results choose up to ${maxPages || "8"} canonical pages in this order of preference: home, pricing, login, signup, features/product, customers, docs, blog index, changelog, about. Skip legal pages, individual blog posts, localized duplicates and anything that looks like an auth callback.`,
              "4. Optionally preview one page with browser_navigate + browser_screenshot to check it renders well (no cookie wall, no login wall).",
              `5. Call capture_pages with the chosen urls (in that order), app.websiteUrl=${url}, viewport="desktop", upload=true${flow ? `, and flow={ name: "${flow}" } with the urls ordered as the user would move through them` : ""}.`,
              "6. Report the created app/screen/flow links. If some pages failed, say which and why.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "find_inspiration",
    {
      title: "Find UI inspiration in Open UI",
      description:
        "Search the catalog for screens and flows that match a design problem and look at the best ones.",
      argsSchema: {
        query: z
          .string()
          .describe("What you are designing, e.g. 'pricing page with monthly/yearly toggle'"),
        platform: z.string().optional().describe("web, ios or android"),
      },
    },
    ({ query, platform }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Find UI inspiration in Open UI for: ${query}${platform ? ` (platform: ${platform})` : ""}.`,
              "",
              `1. Map the request to taxonomy terms if possible (patterns: ${PATTERN_SLUGS.join(", ")}). Call get_taxonomy for UI elements and flow types.`,
              "2. Call search_screens with the free-text query and, when it fits, a pattern/element filter. If the problem is a multi-step journey, also call search_flows (flow types: " +
                FLOW_TYPE_SLUGS.join(", ") +
                ").",
              "3. Open the 3–5 most relevant results with get_screen (thumbnail first; full=true when details matter) or get_flow with includeImages=true.",
              "4. Summarize what the strongest examples do well (layout, hierarchy, copy, components) and link each one.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerResource(
    "taxonomy",
    TAXONOMY_RESOURCE_URI,
    {
      title: "Open UI taxonomy",
      description:
        "Platforms, categories, screen patterns, UI elements and flow types (slugs + labels) used for filtering and tagging.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({ ...TAXONOMY, categorySlugs: CATEGORY_SLUGS }, null, 2),
        },
      ],
    }),
  );
}
