import { API_KEY_PREFIX, createApiKeyInputSchema, type ApiKey } from "@open-ui/core";
import { apiKey, user, type ApiKeyRow } from "@open-ui/db";
import { and, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "./env";
import { forbidden, notFound, parseInput } from "./errors";
import { base64UrlEncode, newId, sha256Hex } from "./ids";
import type { Principal } from "./principal";

/** Only bump `last_used_at` when it is older than this, to avoid a write per request. */
const LAST_USED_THROTTLE_MS = 60_000;

function toApiKey(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function requireSession(principal: Principal) {
  if (principal.via !== "session")
    throw forbidden("API keys can only be managed from a signed-in session");
}

export function generateToken(): string {
  return API_KEY_PREFIX + base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

export async function listKeys(principal: Principal): Promise<{ items: ApiKey[] }> {
  requireSession(principal);
  const rows = await getDb()
    .select()
    .from(apiKey)
    .where(and(eq(apiKey.userId, principal.user.id), isNull(apiKey.revokedAt)))
    .orderBy(desc(apiKey.createdAt));
  return { items: rows.map(toApiKey) };
}

export async function createKey(
  principal: Principal,
  input: unknown,
): Promise<{ key: ApiKey; token: string }> {
  requireSession(principal);
  const { name } = parseInput(createApiKeyInputSchema, input);
  const token = generateToken();
  const [row] = await getDb()
    .insert(apiKey)
    .values({
      id: newId(),
      userId: principal.user.id,
      name,
      prefix: token.slice(0, 8),
      hash: await sha256Hex(token),
      createdAt: new Date(),
    })
    .returning();
  return { key: toApiKey(row!), token };
}

export async function revokeKey(principal: Principal, id: string): Promise<void> {
  requireSession(principal);
  const result = await getDb()
    .update(apiKey)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKey.id, id), eq(apiKey.userId, principal.user.id), isNull(apiKey.revokedAt)))
    .returning({ id: apiKey.id });
  if (result.length === 0) throw notFound("API key");
}

/** Resolve a bearer token to its key + owner; null when unknown or revoked. */
export async function verifyToken(token: string) {
  if (!token.startsWith(API_KEY_PREFIX) || token.length > 200) return null;
  const db = getDb();
  const hash = await sha256Hex(token);
  const [row] = await db
    .select({ key: apiKey, user })
    .from(apiKey)
    .innerJoin(user, eq(user.id, apiKey.userId))
    .where(and(eq(apiKey.hash, hash), isNull(apiKey.revokedAt)))
    .limit(1);
  if (!row) return null;
  const now = Date.now();
  if (!row.key.lastUsedAt || now - row.key.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
    await db
      .update(apiKey)
      .set({ lastUsedAt: new Date(now) })
      .where(eq(apiKey.id, row.key.id));
  }
  return row;
}
