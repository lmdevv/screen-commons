import { API_PREFIX, type ApiErrorBody } from "@open-ui/core";
import { Hono, type Context } from "hono";

import { appOrigin } from "../env";
import { ServiceError, badRequest, toServiceError, unauthorized } from "../errors";
import { getPrincipal, type Principal } from "../principal";
import { bodyLimitFor, readBodyLimited } from "./limits";
import * as services from "../services";

type HonoEnv = { Variables: { principal: Principal | null } };

export const CORS_PREFLIGHT_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, accept, mcp-protocol-version",
  "access-control-max-age": "86400",
} as const;

/** True when the request comes from another origin (extension, other site, MCP web client). */
export function isCrossOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin !== new URL(request.url).origin && origin !== appOrigin(request);
}

export function errorResponse(error: unknown, headers?: HeadersInit): Response {
  const failure = toServiceError(error);
  const body: ApiErrorBody = { error: { code: failure.code, message: failure.message } };
  if (failure.details !== undefined && failure.code === "bad_request") {
    body.error.details = failure.details;
  }
  return Response.json(body, { status: failure.status, headers });
}

function requireUser(c: Context<HonoEnv>): Principal {
  const principal = c.get("principal");
  if (!principal) throw unauthorized();
  return principal;
}

/** Body bytes, counted as they stream in (Content-Length is not trusted). */
const readBody = (c: Context<HonoEnv>) =>
  readBodyLimited(c.req.raw, bodyLimitFor(new URL(c.req.url).pathname));

async function readJson(c: Context<HonoEnv>): Promise<unknown> {
  const text = new TextDecoder().decode(await readBody(c));
  try {
    return JSON.parse(text);
  } catch {
    throw badRequest("Request body must be JSON");
  }
}

async function readForm(c: Context<HonoEnv>): Promise<FormData> {
  const body = await readBody(c);
  try {
    return await new Response(body, {
      headers: { "content-type": c.req.header("content-type") ?? "" },
    }).formData();
  } catch {
    throw badRequest("Expected multipart/form-data with image, thumbnail and meta");
  }
}

const query = (c: Context<HonoEnv>) => c.req.query();

export const api = new Hono<HonoEnv>().basePath(API_PREFIX);

// CORS: any origin may call with a bearer key; cookies only count for same-origin requests.
api.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS_PREFLIGHT_HEADERS });
  const crossOrigin = isCrossOrigin(c.req.raw);
  c.set("principal", await getPrincipal(c.req.raw, { allowCookies: !crossOrigin }));
  await next();
  if (crossOrigin) c.res.headers.set("access-control-allow-origin", "*");
  c.res.headers.set("cache-control", "private, no-store");
});

api.onError((error, c) =>
  errorResponse(
    error,
    isCrossOrigin(c.req.raw) ? { "access-control-allow-origin": "*" } : undefined,
  ),
);
api.notFound(() => errorResponse(new ServiceError("not_found", "No such endpoint")));

// --- identity + taxonomy ---------------------------------------------------------------------
api.get("/me", (c) => c.json(services.me(requireUser(c))));
api.get("/taxonomy", (c) => c.json(services.getTaxonomy()));

// --- catalog reads ---------------------------------------------------------------------------
api.get("/apps", async (c) => c.json(await services.listApps(requireUser(c), query(c))));
api.get("/apps/:slug", async (c) =>
  c.json(await services.getApp(requireUser(c), c.req.param("slug"), c.req.query("platform"))),
);
api.get("/screens", async (c) => c.json(await services.listScreens(requireUser(c), query(c))));
api.get("/screens/:id", async (c) =>
  c.json(await services.getScreen(requireUser(c), c.req.param("id"))),
);
api.get("/flows", async (c) => c.json(await services.listFlows(requireUser(c), query(c))));
api.get("/flows/:id", async (c) =>
  c.json(await services.getFlow(requireUser(c), c.req.param("id"))),
);
api.get("/search", async (c) => c.json(await services.search(requireUser(c), query(c))));

// --- contributions ---------------------------------------------------------------------------
api.post("/screens", async (c) => {
  const principal = requireUser(c);
  const form = await readForm(c);
  const result = await services.createScreen(principal, {
    image: form.get("image"),
    thumbnail: form.get("thumbnail"),
    meta: form.get("meta"),
  });
  return c.json(result, 201);
});
api.post("/captures", async (c) => {
  const principal = requireUser(c);
  const result = await services.captures(principal, await readJson(c), appOrigin(c.req.raw));
  return c.json(result, 201);
});
api.post("/flows", async (c) =>
  c.json(await services.createFlow(requireUser(c), await readJson(c)), 201),
);

// --- collections + saves ---------------------------------------------------------------------
api.get("/collections", async (c) => c.json(await services.listCollections(requireUser(c))));
api.post("/collections", async (c) =>
  c.json(await services.createCollection(requireUser(c), await readJson(c)), 201),
);
api.get("/collections/:id", async (c) =>
  c.json(await services.getCollection(requireUser(c), c.req.param("id"))),
);
api.patch("/collections/:id", async (c) =>
  c.json(await services.renameCollection(requireUser(c), c.req.param("id"), await readJson(c))),
);
api.delete("/collections/:id", async (c) => {
  await services.deleteCollection(requireUser(c), c.req.param("id"));
  return c.body(null, 204);
});
// Spec alias: POST/DELETE /collections/:id/items
api.post("/collections/:id/items", async (c) => {
  const body = (await readJson(c)) as Record<string, unknown>;
  await services.save(requireUser(c), { ...body, collectionId: c.req.param("id") });
  return c.body(null, 204);
});
api.delete("/collections/:id/items", async (c) => {
  await services.unsave(requireUser(c), { ...query(c), collectionId: c.req.param("id") });
  return c.body(null, 204);
});
api.post("/saves", async (c) => {
  await services.save(requireUser(c), await readJson(c));
  return c.body(null, 204);
});
api.delete("/saves", async (c) => {
  await services.unsave(requireUser(c), query(c));
  return c.body(null, 204);
});

// --- API keys (session only) -----------------------------------------------------------------
api.get("/keys", async (c) => c.json(await services.listKeys(requireUser(c))));
api.post("/keys", async (c) =>
  c.json(await services.createKey(requireUser(c), await readJson(c)), 201),
);
api.delete("/keys/:id", async (c) => {
  await services.revokeKey(requireUser(c), c.req.param("id"));
  return c.body(null, 204);
});

// --- review (admin) --------------------------------------------------------------------------
api.get("/review", async (c) => c.json(await services.reviewQueue(requireUser(c))));
api.post("/review/:kind/:id", async (c) => {
  await services.review(requireUser(c), c.req.param("kind"), c.req.param("id"), await readJson(c));
  return c.body(null, 204);
});
