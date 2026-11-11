import { z } from "zod";

import { FLOW_TYPE_SLUGS, PATTERN_SLUGS } from "./taxonomy";

type PromptArgs = Record<string, z.ZodString | z.ZodOptional<z.ZodString>>;

/** Served by both MCP servers, so a prompt here may name only catalog tools. */
export interface PromptSpec<Args extends PromptArgs = PromptArgs> {
  name: string;
  title: string;
  description: string;
  args: Args;
  text(args: z.output<z.ZodObject<Args>>): string;
}

const prompt = <Args extends PromptArgs>(spec: PromptSpec<Args>) => spec;

export const catalogPrompts = {
  find_inspiration: prompt({
    name: "find_inspiration",
    title: "Find UI inspiration in Screen Commons",
    description:
      "Search the catalog for screens and flows that match a design problem and look at the best ones.",
    args: {
      query: z
        .string()
        .describe("What you are designing, e.g. 'pricing page with monthly/yearly toggle'"),
      platform: z.string().optional().describe("web, ios or android"),
    },
    text: ({ query, platform }) =>
      [
        `Find UI inspiration in Screen Commons for: ${query}${platform ? ` (platform: ${platform})` : ""}.`,
        "",
        `1. Map the request to taxonomy terms if possible (patterns: ${PATTERN_SLUGS.join(", ")}). Call get_taxonomy for UI elements and flow types.`,
        `2. Call search_screens with the free-text query and, when it fits, a pattern/element filter. If the problem is a multi-step journey, also call search_flows (flow types: ${FLOW_TYPE_SLUGS.join(", ")}).`,
        "3. Open the 3–5 most relevant results with get_screen (thumbnail first; full=true when details matter) or get_flow with includeImages=true.",
        "4. Summarize what the strongest examples do well (layout, hierarchy, copy, components) and link each one.",
      ].join("\n"),
  }),
  research_flow: prompt({
    name: "research_flow",
    title: "Research how an app handles a task",
    description:
      "Answer a question such as 'How does Spotify let users create a playlist?' from the catalog's real flows and screens, citing their ids.",
    args: {
      question: z
        .string()
        .describe("The question to answer, e.g. 'How does Spotify let users create a playlist?'"),
    },
    text: ({ question }) =>
      [
        `Answer this question from the Screen Commons catalog: ${question}`,
        "",
        "1. Find the app the question asks about: call list_apps with the app's name as query, and note the slug of every app whose name is the one the question uses (web and mobile apps can share one). list_apps also returns partial matches, so an app with another name, even a similar one, is not the app asked about. If the question names no app, search the whole catalog.",
        "2. Call search_flows with the question as query, and with app set to each slug from step 1. Read `match` in the result: `match.app` is the app the search kept to, and `match.appNotFound` names an app the question asks about that the catalog doesn't have.",
        "3. If step 1 found no app with the name the question uses, or `match.appNotFound` is set, answer that the catalog has no flows from that app and stop. Never offer another app's flow as the answer, even one that looks similar.",
        "4. Pick the flows that answer the question. If none fits, call search_screens with the same query and app before you say the catalog doesn't show it.",
        "5. Open each flow you use with get_flow and includeImages=true, and look at its screens before you describe them.",
        "6. Answer step by step from what the screens show. Cite every flow and screen you rely on by its id and url.",
      ].join("\n"),
  }),
};

export type CatalogPromptName = keyof typeof catalogPrompts;

export const promptResult = (text: string) => ({
  messages: [{ role: "user" as const, content: { type: "text" as const, text } }],
});
