import type {
  AppSummary,
  CaptureBatchResult,
  ErrorCode,
  FlowDetail,
  FlowSummary,
  Screen,
  ScreenDetail,
} from "./index";
import { LIMITS } from "./limits";
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

/** A failed call, as an agent reads it from either server. */
export function toolErrorText(code: ErrorCode, message: string, retryAfter?: number | null) {
  const retry =
    retryAfter === undefined || retryAfter === null ? "" : ` Retry in ${retryAfter} seconds.`;
  return `${code}: ${message}${retry}`;
}
