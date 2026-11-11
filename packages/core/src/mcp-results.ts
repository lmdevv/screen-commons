import type {
  AppSummary,
  CaptureBatchResult,
  Contribution,
  ErrorCode,
  FlowDetail,
  FlowSummary,
  Screen,
  ScreenDetail,
  SearchMatch,
  SearchPage,
} from "./index";
import { LIMITS } from "./limits";
import { MIN_STRICT_RESULTS } from "./search-query";
import { base64ToBytes, readImageHeader } from "./utils";

/**
 * What the catalog tools return, shared by the remote server (apps/web `/mcp`) and the local stdio
 * server (packages/mcp) so an agent parses one format from either. `origin` makes every link
 * absolute. Each function returns the JSON a tool sends as its text content.
 */
const absolute = (origin: string, path: string | null) => (path ? `${origin}${path}` : null);

export function compactScreen(origin: string, screen: Screen) {
  return {
    id: screen.id,
    title: screen.title,
    app: {
      id: screen.app.id,
      slug: screen.app.slug,
      name: screen.app.name,
      platform: screen.app.platform,
    },
    patterns: screen.patterns,
    elements: screen.elements,
    tags: screen.tags,
    sourceUrl: screen.sourceUrl,
    width: screen.width,
    height: screen.height,
    status: screen.status,
    thumbUrl: absolute(origin, screen.thumbUrl),
    imageUrl: absolute(origin, screen.imageUrl),
    url: `${origin}/screens/${screen.id}`,
  };
}

export function compactFlow(origin: string, flow: FlowSummary) {
  return {
    id: flow.id,
    name: flow.name,
    type: flow.type,
    description: flow.description,
    app: { id: flow.app.id, slug: flow.app.slug, name: flow.app.name, platform: flow.app.platform },
    stepCount: flow.stepCount,
    status: flow.status,
    url: `${origin}/flows/${flow.id}`,
  };
}

export function compactContribution(origin: string, item: Contribution) {
  return {
    kind: item.kind,
    ...(item.kind === "screen" ? compactScreen(origin, item) : compactFlow(origin, item)),
    reviewReason: item.reviewReason,
    createdAt: item.createdAt,
  };
}

export function screenSearchResult(origin: string, page: SearchPage<Screen>) {
  return {
    match: page.match,
    items: page.items.map((screen) => compactScreen(origin, screen)),
    nextCursor: page.nextCursor,
  };
}

export function flowSearchResult(origin: string, page: SearchPage<FlowSummary>) {
  return {
    match: page.match,
    items: page.items.map((flow) => compactFlow(origin, flow)),
    nextCursor: page.nextCursor,
  };
}

export function describeMatch(match: SearchMatch): string {
  const quoted = (terms: string[]) => terms.map((term) => `"${term}"`).join(", ");
  return [
    match.appNotFound &&
      `The catalog has no app named "${match.appNotFound}", so these results come from other apps.`,
    match.app && `Only results from the app "${match.app}", which the query names.`,
    match.appWithoutResults &&
      `The app "${match.appWithoutResults}" has no items that match the rest of the query, so these results come from every app and read "${match.appWithoutResults}" as an ordinary word.`,
    match.mode === "strict" &&
      match.matchedTerms.length > 0 &&
      `Every result contains ${quoted(match.matchedTerms)}.`,
    match.mode === "relaxed" &&
      match.matchedTerms.length > 0 &&
      `Fewer than ${MIN_STRICT_RESULTS} results contain every search term, so results that contain some of them follow.`,
    match.mode === "none" && "No search terms, so results are in the default order.",
    match.mode === "unsearchable" &&
      "The query has no word to search for, only words such as how, does and app, so there are no results. Name a feature, such as create playlist.",
    match.unmatchedTerms.length > 0 && `No result contains ${quoted(match.unmatchedTerms)}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** A server from before `match` sends none, and then the result has no match line. */
export function searchToolResult(result: { match?: SearchMatch }) {
  return {
    content: [
      ...(result.match ? [{ type: "text" as const, text: describeMatch(result.match) }] : []),
      { type: "text" as const, text: JSON.stringify(result) },
    ],
    structuredContent: result,
  };
}

export function compactApp<App extends AppSummary>(origin: string, app: App) {
  return {
    ...app,
    logoUrl: absolute(origin, app.logoUrl),
    previews: undefined,
    url: `${origin}/apps/${app.slug}`,
  };
}

export function screenDetailResult(origin: string, screen: ScreenDetail) {
  return {
    ...compactScreen(origin, screen),
    version: screen.version,
    text: screen.text,
    capturedAt: screen.capturedAt,
    previousId: screen.previousId,
    nextId: screen.nextId,
    flows: screen.flows,
  };
}

/** `imagePositions` names the step each returned image belongs to, in image order. */
export function flowDetailResult(origin: string, flow: FlowDetail, imagePositions?: number[]) {
  return {
    ...compactFlow(origin, flow),
    steps: flow.steps.map((step) => ({
      position: step.position,
      label: step.label,
      screen: compactScreen(origin, step.screen),
    })),
    ...(imagePositions ? { imagePositions } : {}),
  };
}

/** The steps `get_flow` returns a thumbnail for. */
export function flowImageSteps(flow: FlowDetail) {
  return flow.steps
    .slice()
    .sort((a, b) => a.position - b.position)
    .slice(0, LIMITS.maxFlowImages);
}

export function createdFlowResult(origin: string, flow: FlowDetail) {
  return { ...compactFlow(origin, flow), steps: flow.steps.map((step) => step.screen.id) };
}

export function uploadResult(
  origin: string,
  batch: Pick<CaptureBatchResult, "app" | "screens">,
  note?: string,
) {
  const item = batch.screens[0]!;
  return {
    app: { id: batch.app.id, slug: batch.app.slug, name: batch.app.name },
    screen: { ...item, url: `${origin}/screens/${item.id}` },
    ...(note ? { note } : {}),
  };
}

/** A note for an `upload_screen` whose `image.type` isn't what its bytes are; never fatal. */
export function imageTypeNote(image: { type: string; base64: string }): string | undefined {
  const text = image.base64.startsWith("data:")
    ? image.base64.slice(image.base64.indexOf(",") + 1)
    : image.base64;
  const header = readImageHeader(base64ToBytes(text));
  return header && header.type !== image.type
    ? `image.type said ${image.type}, but the bytes are ${header.type}; uploaded as ${header.type}`
    : undefined;
}

export function deletedResult(id: string) {
  return { id, deleted: true };
}

const INTERNAL_RETRY =
  " The change may or may not have been saved. Retrying is safe for every tool, except create_flow without an id, which could create a second flow.";

/** A failed call, as an agent reads it from either server. */
export function toolErrorText(code: ErrorCode, message: string, retryAfter?: number | null) {
  const retry =
    retryAfter === undefined || retryAfter === null ? "" : ` Retry in ${retryAfter} seconds.`;
  const stop = /[.!?]$/u.test(message) ? "" : ".";
  return code === "internal"
    ? `${code}: ${message}${stop}${INTERNAL_RETRY}${retry}`
    : `${code}: ${message}${retry}`;
}
