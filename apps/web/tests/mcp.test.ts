import { catalogTools, readImageHeader, type CaptureBatchResult } from "@screen-commons/core";
import { beforeAll, describe, expect, inject, it } from "vitest";

import { makePng } from "./images";
import { Session, b64, baseUrl, captureScreen, keyClient, uniqueSuffix } from "./helpers";

const suffix = uniqueSuffix();
let token: string;
let batch: CaptureBatchResult;
let nextId = 1;

interface RpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: Record<string, unknown> & {
    content?: { type: string; text?: string; data?: string; mimeType?: string }[];
    isError?: boolean;
  };
  error?: { code: number; message: string };
}

async function rpc(method: string, params: Record<string, unknown> = {}, auth = token) {
  const response = await fetch(`${baseUrl()}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
      ...(auth ? { authorization: `Bearer ${auth}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
  return response;
}

async function call(name: string, args: Record<string, unknown>) {
  const response = await rpc("tools/call", { name, arguments: args });
  expect(response.status).toBe(200);
  const body = (await response.json()) as RpcResponse;
  expect(body.error).toBeUndefined();
  return body.result!;
}

beforeAll(async () => {
  const credentials = inject("admin");
  const admin = await Session.signIn(credentials.email, credentials.password);
  token = (await admin.client().createKey("MCP test")).token;
  batch = await keyClient(token).captures({
    app: { name: `Mcp Demo ${suffix}`, websiteUrl: `https://mcp-${suffix}.example.net` },
    flow: { name: "Checkout", type: "checkout" },
    screens: [
      captureScreen({ title: "Cart overview", patterns: ["checkout"], elements: ["table"] }),
      captureScreen({ title: "Payment details", patterns: ["checkout"], elements: ["form"] }),
    ],
  });
});

describe("remote MCP (/mcp)", () => {
  it("requires a bearer API key", async () => {
    const response = await rpc("tools/list", {}, "");
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
    expect((await rpc("tools/list", {}, "oui_bogus")).status).toBe(401);
  });

  it("initializes", async () => {
    const response = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "vitest", version: "1.0.0" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = (await response.json()) as RpcResponse;
    expect(body.result).toMatchObject({
      serverInfo: { name: "screen-commons" },
      capabilities: { tools: expect.any(Object) },
    });
  });

  it("lists every catalog tool with its contract", async () => {
    const response = await rpc("tools/list");
    const body = (await response.json()) as RpcResponse;
    const tools = body.result!.tools as {
      name: string;
      description: string;
      inputSchema: { properties?: Record<string, unknown> };
      annotations?: { readOnlyHint?: boolean };
    }[];
    expect(tools.map((tool) => tool.name).sort()).toEqual(Object.keys(catalogTools).sort());
    for (const tool of tools) {
      const spec = catalogTools[tool.name as keyof typeof catalogTools];
      expect(tool.description).toBe(spec.description);
      expect(Object.keys(tool.inputSchema.properties ?? {}).sort()).toEqual(
        Object.keys(spec.input.shape).sort(),
      );
      expect(tool.annotations?.readOnlyHint).toBe(spec.readOnly);
    }
  });

  it("search_screens finds screens by text and filters", async () => {
    const result = await call("search_screens", { query: "payment", app: batch.app.slug });
    const data = JSON.parse(result.content![0]!.text!);
    expect(data.items.map((item: { id: string }) => item.id)).toEqual([batch.screens[1]!.id]);
    expect(data.items[0].thumbUrl).toMatch(new RegExp(`^${baseUrl()}/media/thumb/`, "u"));

    const filtered = JSON.parse(
      (await call("search_screens", { pattern: "checkout", element: "table", app: batch.app.slug }))
        .content![0]!.text!,
    );
    expect(filtered.items.map((item: { title: string }) => item.title)).toEqual(["Cart overview"]);
  });

  it("get_screen returns metadata and the image", async () => {
    const result = await call("get_screen", { id: batch.screens[0]!.id });
    const [text, image] = result.content!;
    expect(JSON.parse(text!.text!)).toMatchObject({
      id: batch.screens[0]!.id,
      title: "Cart overview",
    });
    expect(image).toMatchObject({ type: "image", mimeType: "image/webp" });
    const thumb = readImageHeader(Buffer.from(image!.data!, "base64"));
    expect(thumb).toEqual({ type: "image/webp", width: 160, height: 100 });

    const full = await call("get_screen", { id: batch.screens[0]!.id, full: true });
    const header = readImageHeader(Buffer.from(full.content![1]!.data!, "base64"));
    expect(header).toEqual({ type: "image/png", width: 320, height: 200 });

    const missing = await call("get_screen", { id: "nope" });
    expect(missing.isError).toBe(true);
    expect(missing.content![0]!.text).toContain("not_found");
  });

  it("get_flow, get_app, list_apps, search_flows and get_taxonomy", async () => {
    const flow = await call("get_flow", { id: batch.flow!.id, includeImages: true });
    expect(JSON.parse(flow.content![0]!.text!).steps).toHaveLength(2);
    expect(flow.content!.filter((item) => item.type === "image")).toHaveLength(2);

    const app = JSON.parse((await call("get_app", { slug: batch.app.slug })).content![0]!.text!);
    expect(app).toMatchObject({ id: batch.app.id, screenCount: 2, flowCount: 1 });

    const apps = JSON.parse(
      (await call("list_apps", { query: `mcp demo ${suffix}` })).content![0]!.text!,
    );
    expect(apps.items.map((item: { id: string }) => item.id)).toEqual([batch.app.id]);

    const flows = JSON.parse(
      (await call("search_flows", { type: "checkout", app: batch.app.slug })).content![0]!.text!,
    );
    expect(flows.items.map((item: { id: string }) => item.id)).toEqual([batch.flow!.id]);

    const taxonomy = JSON.parse((await call("get_taxonomy", {})).content![0]!.text!);
    expect(taxonomy.elements.length).toBeGreaterThan(10);
  });

  it("upload_screen and create_flow write to the catalog", async () => {
    const upload = JSON.parse(
      (
        await call("upload_screen", {
          app: { slug: batch.app.slug, name: "Mcp Demo" },
          image: { type: "image/png", base64: b64(makePng(200, 120, 42)) },
          title: "Order confirmed",
          patterns: ["checkout"],
        })
      ).content![0]!.text!,
    );
    expect(upload.app.id).toBe(batch.app.id);
    expect(upload.screen.status).toBe("published");

    const screen = await keyClient(token).getScreen(upload.screen.id);
    expect(screen.source).toBe("mcp");
    // no thumbnail was sent: the server generated a WebP one (200px wide image → not upscaled)
    expect(screen.thumbUrl).toMatch(/^\/media\/thumb\/[0-9a-f]{64}\.webp$/u);
    const thumb = Buffer.from(await (await fetch(`${baseUrl()}${screen.thumbUrl}`)).arrayBuffer());
    expect(readImageHeader(thumb)).toEqual({ type: "image/webp", width: 200, height: 120 });

    const created = JSON.parse(
      (
        await call("create_flow", {
          appId: batch.app.id,
          name: "Buy again",
          steps: [
            { screenId: batch.screens[1]!.id },
            { screenId: upload.screen.id, label: "Done" },
          ],
        })
      ).content![0]!.text!,
    );
    expect(created.stepCount).toBe(2);
    expect(created.steps).toEqual([batch.screens[1]!.id, upload.screen.id]);

    const invalid = await rpc("tools/call", {
      name: "search_screens",
      arguments: { pattern: "nope" },
    });
    const body = (await invalid.json()) as RpcResponse;
    expect(body.error ?? body.result?.isError).toBeTruthy();
  });

  it("rejects GET (stateless server, no SSE stream)", async () => {
    const response = await fetch(`${baseUrl()}/mcp`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(405);
  });
});
