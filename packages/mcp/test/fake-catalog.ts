import { createHash } from "node:crypto";

import {
  captureBatchInputSchema,
  createFlowInputSchema,
  createScreenCommonsClient,
  updateFlowInputSchema,
  updateScreenInputSchema,
} from "@screen-commons/core";

const json = (status: number, body: unknown, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers });

export const refusal = (status: number, code: string, message = code) =>
  json(status, { error: { code, message } });

interface Row {
  id: string;
  sha: string;
  status: string;
  owned: boolean;
  title: string | null;
  sourceUrl: string | null;
  patterns: string[];
  elements: string[];
  tags: string[];
}

interface FlowRow {
  id: string;
  name: string;
  type: string | null;
  description: string | null;
  status: string;
  steps: { screen: { id: string }; label: string | null; position: number }[];
}

/**
 * The catalog's behaviour a publish depends on, in memory: bytes dedupe within the app, a repeated
 * flow id returns the flow as it stands, and only the contributor can edit. The journey in
 * `.agents/skills/verify-screen-commons/journeys/cli.mjs` proves the real server does the same.
 */
export function fakeCatalog(status = "published") {
  const screens = new Map<string, Row>();
  const flows = new Map<string, FlowRow>();
  const requests: { method: string; path: string; body?: unknown }[] = [];
  const batches: { screens: number; bytes: number }[] = [];
  /** Answers a request itself when it returns a response, as a fault would. */
  let fault: ((method: string, path: string) => Response | undefined) | undefined;
  const app = {
    id: "app_1",
    slug: "acme",
    name: "Acme",
    platform: "web",
    logoUrl: null,
    accentColor: null,
  };

  const fetchFake: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const path = url.pathname.replace("/api/v1", "");
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    requests.push({ method, path, body });
    const faulted = fault?.(method, path);
    if (faulted) return faulted;

    if (method === "POST" && path === "/captures") {
      const batch = captureBatchInputSchema.parse(body);
      batches.push({
        screens: batch.screens.length,
        bytes: batch.screens.reduce(
          (sum, screen) =>
            sum +
            Buffer.from(screen.image.base64, "base64").byteLength +
            Buffer.from(screen.thumbnail.base64, "base64").byteLength,
          0,
        ),
      });
      const result = batch.screens.map((screen) => {
        const sha = createHash("sha256").update(screen.image.base64).digest("hex");
        const found = [...screens.values()].find((row) => row.sha === sha);
        if (found) return { id: found.id, status: found.status, url: `/screens/${found.id}` };
        const id = `scr_${screens.size + 1}`;
        screens.set(id, {
          id,
          sha,
          status,
          owned: true,
          title: screen.title ?? null,
          sourceUrl: screen.sourceUrl ?? null,
          patterns: screen.patterns,
          elements: screen.elements,
          tags: screen.tags,
        });
        return { id, status, url: `/screens/${id}` };
      });
      return json(200, { app, screens: result, flow: null });
    }
    if (method === "GET" && path === "/screens") {
      const rows = [...screens.values()];
      const start = Number(url.searchParams.get("cursor") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 30);
      const end = start + limit;
      return json(200, {
        items: rows.slice(start, end),
        nextCursor: end < rows.length ? String(end) : null,
      });
    }
    const screenId = /^\/screens\/(.+)$/u.exec(path)?.[1];
    if (method === "PATCH" && screenId) {
      const row = screens.get(screenId)!;
      Object.assign(row, updateScreenInputSchema.parse(body));
      return json(200, row);
    }
    const toRow = (id: string, input: Record<string, unknown>): FlowRow => {
      const steps = input.steps as { screenId: string; label?: string }[];
      return {
        id,
        name: input.name as string,
        type: (input.type as string | undefined) ?? null,
        description: (input.description as string | undefined) ?? null,
        status,
        steps: steps.map((step, position) => ({
          position,
          label: step.label ?? null,
          screen: { id: step.screenId },
        })),
      };
    };
    if (method === "POST" && path === "/flows") {
      const parsed = createFlowInputSchema.parse(body);
      const flow = flows.get(parsed.id!) ?? toRow(parsed.id!, parsed);
      flows.set(flow.id, flow);
      return json(200, { flow });
    }
    const flowId = /^\/flows\/(.+)$/u.exec(path)?.[1];
    if (method === "PATCH" && flowId) {
      const flow = flows.get(flowId)!;
      const patch = updateFlowInputSchema.parse(body);
      const steps = patch.steps ? toRow(flowId, { ...flow, ...patch }).steps : flow.steps;
      Object.assign(flow, patch, { steps });
      return json(200, flow);
    }
    return refusal(404, "not_found", `${method} ${path}`);
  };

  return {
    screens,
    flows,
    requests,
    batches,
    setFault: (next: typeof fault) => {
      fault = next;
    },
    client: createScreenCommonsClient({
      baseUrl: "http://catalog.test",
      apiKey: "sc_test_key",
      fetch: fetchFake,
    }),
    fetch: fetchFake,
    writes: () => requests.filter((request) => request.method === "PATCH"),
  };
}
