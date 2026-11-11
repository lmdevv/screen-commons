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
        "1. Call search_flows with the whole question as query and no app argument. The server finds the app the question names, in any case, and keeps to every app with that name, since web and mobile apps can share one. Read the line before the JSON first. It says how the query was read, and the JSON's `match` has the same facts.",
        "2. If `match.appNotFound` is set, the catalog has no app with that name, and every item comes from other apps. Answer that the catalog has no flows from that app and stop. Never offer another app's flow as the answer, even one that looks similar.",
        "3. If `match.app` is set, every item comes from the app the question names, whose slug it is, or from another app with the same name. Empty `items` means the app has no flow matching the question, and the line names the words no flow contains, which are `match.unmatchedTerms`.",
        "4. If `match.appWithoutResults` is set, the app with that slug has no flow matching the question, and the items come from every app, so none of them answers it.",
        "5. If the question names an app but `match.app`, `match.appNotFound` and `match.appWithoutResults` are all null, the server didn't read the name as an app. Call list_apps with the name as query. It also returns partial matches, so only an app whose name is the one the question uses counts. If there is none, answer as in step 2. Otherwise call search_flows again once for each such app, with app set to its slug.",
        "6. If no flow from the app answers the question, call search_screens with the same query, and the same apps if you set any, before you say the catalog doesn't show it. Its line and `match` read the same way. Open each screen you use with get_screen and look at it before you describe it. If it finds nothing either, say the catalog has no flow or screen from that app for this, and stop.",
        "7. When `match.mode` is `relaxed`, items contain only some of the words, the ones in `match.matchedTerms`, so check each item before you use it. When it is `unsearchable`, the question has no word to search for, so search again with the feature, such as create playlist.",
        "8. Open each flow you use with get_flow and includeImages=true, and look at its screens before you describe them.",
        "9. Answer step by step from what the screens show. Cite every flow and screen you rely on by its id and url.",
      ].join("\n"),
  }),
};

export type CatalogPromptName = keyof typeof catalogPrompts;

export const promptResult = (text: string) => ({
  messages: [{ role: "user" as const, content: { type: "text" as const, text } }],
});
