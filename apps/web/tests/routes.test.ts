import { readFileSync } from "node:fs";

import { describe, expect, inject, it } from "vitest";

import { Session, baseUrl } from "./helpers";

/**
 * The REST route table: every method + path the API serves (`:param` segments). Each endpoint is a
 * file route under src/routes/api/v1/; anything not listed here must answer the JSON 404.
 */
const ENDPOINTS = [
  ["GET", "/me"],
  ["GET", "/taxonomy"],
  ["GET", "/apps"],
  ["GET", "/apps/:slug"],
  ["GET", "/screens"],
  ["POST", "/screens"],
  ["GET", "/screens/:id"],
  ["GET", "/flows"],
  ["POST", "/flows"],
  ["GET", "/flows/:id"],
  ["GET", "/search"],
  ["POST", "/captures"],
  ["GET", "/collections"],
  ["POST", "/collections"],
  ["GET", "/collections/:id"],
  ["PATCH", "/collections/:id"],
  ["DELETE", "/collections/:id"],
  ["POST", "/collections/:id/items"],
  ["DELETE", "/collections/:id/items"],
  ["POST", "/saves"],
  ["DELETE", "/saves"],
  ["GET", "/keys"],
  ["POST", "/keys"],
  ["DELETE", "/keys/:id"],
  ["GET", "/review"],
  ["POST", "/review/:kind/:id"],
  ["POST", "/admin/media/backfill"],
] as const;

const PUBLIC = new Set(["GET /taxonomy"]);
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const XO = "chrome-extension://abc";

const templates = [...new Set(ENDPOINTS.map(([, path]) => path))];
const concrete = (template: string) => template.replace(/:\w+/gu, "x1");
const methodsOf = (template: string) =>
  ENDPOINTS.filter(([, path]) => path === template).map(([method]) => method as string);

function api(method: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("origin")) headers.set("origin", XO);
  return fetch(`${baseUrl()}/api/v1${path}`, { ...init, method, headers, redirect: "manual" });
}

async function expectNoSuchEndpoint(response: Response) {
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({
    error: { code: "not_found", message: "No such endpoint" },
  });
}

describe("REST route table", () => {
  it("has a file route for every endpoint, and no others", () => {
    expect(ENDPOINTS).toHaveLength(27);
    const tree = readFileSync(new URL("../src/routeTree.gen.ts", import.meta.url), "utf8");
    const byFullPath = tree.slice(tree.indexOf("interface FileRoutesByFullPath"));
    const routed = new Set(
      [...byFullPath.slice(0, byFullPath.indexOf("}")).matchAll(/'\/api\/v1(\/[^']+)'/gu)]
        .map((match) => match[1]!.replace(/\$(\w+)/gu, ":$1"))
        .filter((path) => path !== "/$"),
    );
    expect([...routed].sort()).toEqual([...templates].sort());
  });

  it.each(ENDPOINTS)(
    "%s %s requires auth (or is public) and is never cached",
    async (method, path) => {
      const response = await api(
        method,
        concrete(path),
        method === "POST" || method === "PATCH"
          ? { body: "{}", headers: { "content-type": "application/json" } }
          : {},
      );
      const body = await response.json();
      if (PUBLIC.has(`${method} ${path}`)) {
        expect(response.status).toBe(200);
      } else {
        expect(response.status).toBe(401);
        expect(body).toEqual({ error: { code: "unauthorized", message: expect.any(String) } });
      }
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    },
  );

  it.each(templates)("%s answers unsupported methods with the JSON 404", async (path) => {
    for (const method of METHODS.filter((name) => !methodsOf(path).includes(name))) {
      await expectNoSuchEndpoint(await api(method, concrete(path)));
    }
  });

  it.each(templates)("%s answers CORS preflights", async (path) => {
    const response = await api("OPTIONS", concrete(path), {
      headers: {
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization, content-type",
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET, POST, PATCH, DELETE, OPTIONS",
    );
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "authorization, content-type, accept, mcp-protocol-version",
    );
    expect(response.headers.get("access-control-max-age")).toBe("86400");
  });

  it("answers HEAD like GET without a body", async () => {
    const taxonomy = await api("HEAD", "/taxonomy");
    expect(taxonomy.status).toBe(200);
    expect(taxonomy.headers.get("content-type")).toBe("application/json");
    expect(await taxonomy.text()).toBe("");
    expect((await api("HEAD", "/apps")).status).toBe(401);
    expect((await api("HEAD", "/captures")).status).toBe(404);
  });

  it("answers unknown paths with the JSON 404, preflights included", async () => {
    for (const path of [
      "",
      "/",
      "/nope",
      "/apps/x/y",
      "/collections/x/items/y",
      "/review/screen",
      // one URL per endpoint: no trailing-slash or case variants
      "/apps/",
      "/taxonomy/",
      "/APPS",
      "/Screens/x1",
    ]) {
      for (const method of ["GET", "POST"]) {
        const response = await api(method, path);
        await expectNoSuchEndpoint(response);
        expect(response.headers.get("access-control-allow-origin")).toBe("*");
      }
      expect((await api("OPTIONS", path)).status).toBe(204);
    }
    const shouting = await fetch(`${baseUrl()}/API/V1/apps`);
    await expectNoSuchEndpoint(shouting);
  });

  it("decodes paths and params like the Hono router did", async () => {
    const credentials = inject("admin");
    const admin = await Session.signIn(credentials.email, credentials.password);
    const {
      collection: { id },
    } = await admin.json<{ collection: { id: string } }>("/api/v1/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Decoding" }),
    });
    const percentEncoded = [...id].map((char) => `%${char.charCodeAt(0).toString(16)}`).join("");
    try {
      // params arrive decodeURIComponent-ed, %2F included
      expect((await admin.fetch(`/api/v1/collections/${percentEncoded}`)).status).toBe(200);
      const slashed = await admin.fetch("/api/v1/collections/a%2Fb");
      expect(await slashed.json()).toEqual({
        error: { code: "not_found", message: "Collection not found" },
      });
      // static segments are matched after decoding, as Hono's decodeURI'd path was
      expect((await admin.fetch("/api/v1/%61pps")).status).toBe(200);
      // malformed escapes never reach a route: Start answers an empty 400, as it did before
      const malformed = await admin.fetch("/api/v1/collections/%E0%A4%A");
      expect(malformed.status).toBe(400);
      expect(await malformed.text()).toBe("");
    } finally {
      await admin.fetch(`/api/v1/collections/${id}`, { method: "DELETE" });
    }
  });

  it("applies the 1 MiB body cap to JSON endpoints and the upload cap to upload endpoints", async () => {
    const body = "x".repeat(2 * 1024 * 1024);
    const json = await api("POST", "/saves", { body });
    expect(json.status).toBe(413);
    expect((await json.json()).error.code).toBe("payload_too_large");
    // same size, upload endpoint: within its limit, so it reaches auth
    expect((await api("POST", "/screens", { body })).status).toBe(401);
  });
});
