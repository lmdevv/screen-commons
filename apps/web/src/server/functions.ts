/**
 * TanStack Start server functions: the UI's data layer. They call the service layer directly
 * (no HTTP hop during SSR) and authenticate with the Better Auth session cookie.
 *
 * Conventions (see ./README.md for the full list):
 * - Reads use GET, mutations POST. Inputs are validated by the service layer with core zod schemas.
 * - Not signed in → throws a redirect to `/sign-in`. Missing/hidden item → throws `notFound()`.
 *   Any other failure → throws `Error(message)`.
 */
import type {
  CaptureBatchInput,
  CreateFlowInput,
  ListAppsQuery,
  ListFlowsQuery,
  ListScreensQuery,
  SaveKind,
  SearchQuery,
  User,
} from "@open-ui/core";
import { notFound, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { githubEnabled } from "./auth";
import { appOrigin } from "./env";
import { ServiceError, toServiceError } from "./errors";
import { getSessionPrincipal, toUser, type Principal } from "./principal";
import * as services from "./services";

async function currentPrincipal(): Promise<Principal | null> {
  return getSessionPrincipal(getRequest().headers);
}

/** Run a service call as the signed-in user, translating service errors for the router. */
async function asUser<T>(run: (principal: Principal) => Promise<T> | T): Promise<T> {
  const principal = await currentPrincipal();
  if (!principal) throw redirect({ to: "/sign-in" });
  try {
    return await run(principal);
  } catch (error) {
    if (
      !(error instanceof ServiceError) &&
      error &&
      typeof error === "object" &&
      "isRedirect" in error
    ) {
      throw error;
    }
    const failure = toServiceError(error);
    if (failure.code === "not_found") throw notFound();
    if (failure.code === "unauthorized") throw redirect({ to: "/sign-in" });
    throw new Error(failure.message);
  }
}

const identity =
  <T>() =>
  (input: T) =>
    input;

// --- session ---------------------------------------------------------------------------------

/** The signed-in user, or null. Never throws for logged-out visitors. */
export const getCurrentUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<User | null> => {
    const principal = await currentPrincipal();
    return principal ? toUser(principal) : null;
  },
);

/** Which sign-in methods this instance offers. */
export const getAuthOptions = createServerFn({ method: "GET" }).handler(async () => ({
  emailPassword: true,
  github: githubEnabled(),
}));

// --- catalog reads ---------------------------------------------------------------------------

export const getTaxonomy = createServerFn({ method: "GET" }).handler(() =>
  asUser(() => services.getTaxonomy()),
);

export const listApps = createServerFn({ method: "GET" })
  .validator(identity<ListAppsQuery>())
  .handler(({ data }) => asUser((principal) => services.listApps(principal, data)));

export const getApp = createServerFn({ method: "GET" })
  .validator(identity<{ slug: string; platform?: string }>())
  .handler(({ data }) =>
    asUser((principal) => services.getApp(principal, data.slug, data.platform)),
  );

export const listScreens = createServerFn({ method: "GET" })
  .validator(identity<ListScreensQuery>())
  .handler(({ data }) => asUser((principal) => services.listScreens(principal, data)));

export const getScreen = createServerFn({ method: "GET" })
  .validator(identity<{ id: string }>())
  .handler(({ data }) => asUser((principal) => services.getScreen(principal, data.id)));

export const listFlows = createServerFn({ method: "GET" })
  .validator(identity<ListFlowsQuery>())
  .handler(({ data }) => asUser((principal) => services.listFlows(principal, data)));

export const getFlow = createServerFn({ method: "GET" })
  .validator(identity<{ id: string }>())
  .handler(({ data }) => asUser((principal) => services.getFlow(principal, data.id)));

export const search = createServerFn({ method: "GET" })
  .validator(identity<SearchQuery>())
  .handler(({ data }) => asUser((principal) => services.search(principal, data)));

// --- contributions ---------------------------------------------------------------------------

/** Multipart: FormData with `image` (File), `thumbnail` (File), `meta` (JSON CreateScreenInput). */
export const createScreen = createServerFn({ method: "POST" })
  .validator((data: FormData) => {
    if (!(data instanceof FormData)) throw new Error("Expected FormData");
    return data;
  })
  .handler(({ data }) =>
    asUser((principal) =>
      services.createScreen(principal, {
        image: data.get("image"),
        thumbnail: data.get("thumbnail"),
        meta: data.get("meta"),
      }),
    ),
  );

/** JSON batch with base64 images (same body as POST /api/v1/captures). */
export const submitCaptures = createServerFn({ method: "POST" })
  .validator(identity<CaptureBatchInput>())
  .handler(({ data }) =>
    asUser((principal) => services.captures(principal, data, appOrigin(getRequest()))),
  );

export const createFlow = createServerFn({ method: "POST" })
  .validator(identity<CreateFlowInput>())
  .handler(({ data }) => asUser((principal) => services.createFlow(principal, data)));

// --- collections + saves ---------------------------------------------------------------------

export const listCollections = createServerFn({ method: "GET" }).handler(() =>
  asUser((principal) => services.listCollections(principal)),
);

export const getCollection = createServerFn({ method: "GET" })
  .validator(identity<{ id: string }>())
  .handler(({ data }) => asUser((principal) => services.getCollection(principal, data.id)));

export const createCollection = createServerFn({ method: "POST" })
  .validator(identity<{ name: string }>())
  .handler(({ data }) => asUser((principal) => services.createCollection(principal, data)));

export const renameCollection = createServerFn({ method: "POST" })
  .validator(identity<{ id: string; name: string }>())
  .handler(({ data }) =>
    asUser((principal) => services.renameCollection(principal, data.id, { name: data.name })),
  );

export const deleteCollection = createServerFn({ method: "POST" })
  .validator(identity<{ id: string }>())
  .handler(({ data }) =>
    asUser(async (principal) => {
      await services.deleteCollection(principal, data.id);
      return { ok: true as const };
    }),
  );

export const saveItem = createServerFn({ method: "POST" })
  .validator(identity<{ kind: SaveKind; id: string; collectionId?: string }>())
  .handler(({ data }) =>
    asUser(async (principal) => {
      await services.save(principal, data);
      return { saved: true as const };
    }),
  );

export const unsaveItem = createServerFn({ method: "POST" })
  .validator(identity<{ kind: SaveKind; id: string; collectionId?: string }>())
  .handler(({ data }) =>
    asUser(async (principal) => {
      await services.unsave(principal, data);
      return { saved: false as const };
    }),
  );

// --- API keys --------------------------------------------------------------------------------

export const listKeys = createServerFn({ method: "GET" }).handler(() =>
  asUser((principal) => services.listKeys(principal)),
);

/** Returns `{ key, token }`; the token is shown once and never retrievable again. */
export const createKey = createServerFn({ method: "POST" })
  .validator(identity<{ name: string }>())
  .handler(({ data }) => asUser((principal) => services.createKey(principal, data)));

export const revokeKey = createServerFn({ method: "POST" })
  .validator(identity<{ id: string }>())
  .handler(({ data }) =>
    asUser(async (principal) => {
      await services.revokeKey(principal, data.id);
      return { ok: true as const };
    }),
  );

// --- review (admin) --------------------------------------------------------------------------

export const getReviewQueue = createServerFn({ method: "GET" }).handler(() =>
  asUser((principal) => services.reviewQueue(principal)),
);

export const reviewItem = createServerFn({ method: "POST" })
  .validator(
    identity<{
      kind: "screen" | "flow";
      id: string;
      decision: "approve" | "reject";
      reason?: string;
    }>(),
  )
  .handler(({ data }) =>
    asUser(async (principal) => {
      await services.review(principal, data.kind, data.id, {
        decision: data.decision,
        reason: data.reason,
      });
      return { ok: true as const };
    }),
  );
