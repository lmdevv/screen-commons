import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

import {
  TAXONOMY,
  captureBatchInputSchema,
  createFlowInputSchema,
  type CaptureBatchInput,
  type FlowDetail,
  type Screen,
  type ScreenDetail,
} from "@open-ui/core";
import sharp from "sharp";

export const API_KEY = "oui_test_key";

export interface MockApi {
  url: string;
  batches: ReturnType<typeof captureBatchInputSchema.parse>[];
  flows: unknown[];
  close: () => Promise<void>;
}

const app = {
  id: "app_1",
  slug: "linear",
  name: "Linear",
  platform: "web" as const,
  logoUrl: null,
  accentColor: null,
};

const screen = (id: string): Screen => ({
  id,
  app,
  title: "Pricing – Linear",
  imageUrl: `/media/${id}-full.png`,
  thumbUrl: `/media/${id}-thumb.webp`,
  width: 2880,
  height: 1800,
  bytes: 1000,
  sourceUrl: "https://linear.app/pricing",
  patterns: ["pricing"],
  elements: ["pricing-table"],
  tags: [],
  version: "Oct 2026",
  dominantColor: "#000000",
  status: "published",
  source: "seed",
  saved: false,
  capturedAt: "2026-10-01T00:00:00.000Z",
  createdAt: "2026-10-01T00:00:00.000Z",
});

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export async function startMockApi(): Promise<MockApi> {
  const thumb = await sharp({
    create: { width: 640, height: 400, channels: 3, background: "#123456" },
  })
    .webp()
    .toBuffer();
  const full = await sharp({
    create: { width: 2880, height: 1800, channels: 3, background: "#123456" },
  })
    .png()
    .toBuffer();
  const batches: MockApi["batches"] = [];
  const flows: unknown[] = [];
  let counter = 0;

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://mock");
    const json = (status: number, body: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (url.pathname.startsWith("/media/")) {
      const isThumb = url.pathname.endsWith(".webp");
      response.writeHead(200, { "content-type": isThumb ? "image/webp" : "image/png" });
      return response.end(isThumb ? thumb : full);
    }
    if (!url.pathname.startsWith("/api/v1/"))
      return json(404, { error: { code: "not_found", message: "nope" } });
    if (request.headers.authorization !== `Bearer ${API_KEY}`) {
      return json(401, { error: { code: "unauthorized", message: "Invalid API key" } });
    }
    const path = url.pathname.slice("/api/v1".length);
    try {
      if (request.method === "GET" && path === "/taxonomy") return json(200, TAXONOMY);
      if (request.method === "GET" && path === "/screens") {
        return json(200, {
          items: [screen("scr_1"), screen("scr_2")],
          nextCursor: url.searchParams.get("q") === "more" ? "c1" : null,
        });
      }
      const screenMatch = /^\/screens\/([^/]+)$/u.exec(path);
      if (request.method === "GET" && screenMatch) {
        if (screenMatch[1] === "missing")
          return json(404, { error: { code: "not_found", message: "Screen not found" } });
        const detail: ScreenDetail = {
          ...screen(screenMatch[1]!),
          previousId: null,
          nextId: "scr_2",
          flows: [],
        };
        return json(200, detail);
      }
      const flowMatch = /^\/flows\/([^/]+)$/u.exec(path);
      if (request.method === "GET" && flowMatch) {
        const flow: FlowDetail = {
          id: flowMatch[1]!,
          app,
          name: "Signing up",
          type: "signing-up",
          description: null,
          stepCount: 2,
          previews: [],
          status: "published",
          saved: false,
          createdAt: "2026-10-01T00:00:00.000Z",
          steps: [
            { position: 0, label: "Landing", screen: screen("scr_1") },
            { position: 1, label: "Pricing", screen: screen("scr_2") },
          ],
        };
        return json(200, flow);
      }
      if (request.method === "POST" && path === "/captures") {
        const parsed = captureBatchInputSchema.safeParse(
          JSON.parse(await readBody(request)) as CaptureBatchInput,
        );
        if (!parsed.success)
          return json(400, { error: { code: "bad_request", message: parsed.error.message } });
        batches.push(parsed.data);
        const screens = parsed.data.screens.map(() => {
          counter += 1;
          return { id: `new_${counter}`, status: "published", url: `/screens/new_${counter}` };
        });
        return json(200, {
          app: { ...app, slug: "fixture", name: parsed.data.app.name },
          screens,
          flow: parsed.data.flow
            ? { id: "flow_1", status: "published", url: "/flows/flow_1" }
            : null,
        });
      }
      if (request.method === "POST" && path === "/flows") {
        const parsed = createFlowInputSchema.parse(JSON.parse(await readBody(request)));
        flows.push(parsed);
        return json(200, {
          flow: { id: "flow_2", name: parsed.name, status: "published", steps: parsed.steps },
        });
      }
      return json(404, {
        error: { code: "not_found", message: `No route ${request.method} ${path}` },
      });
    } catch (error) {
      return json(500, { error: { code: "internal", message: String(error) } });
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    batches,
    flows,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
