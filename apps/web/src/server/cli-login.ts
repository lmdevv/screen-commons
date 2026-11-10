import {
  decideCliLoginInputSchema,
  lookupCliLoginInputSchema,
  pollCliLoginInputSchema,
  startCliLoginInputSchema,
  type CliLoginPoll,
  type CliLoginStart,
  type CliLoginStatus,
  type CliLoginView,
} from "@screen-commons/core";
import { apiKey, verification, type ApiKeyKind, type Db } from "@screen-commons/db";
import { and, eq, gt, inArray, lt, sql, type SQL } from "drizzle-orm";

import { getDb } from "./env";
import { ServiceError, forbidden, parseInput } from "./errors";
import { newId } from "./ids";
import type { Principal } from "./principal";

const TTL_MS = 10 * 60_000;
const POLL_INTERVAL_SECONDS = 2;
const SWEEP_LIMIT = 50;
const CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";
const UNBIASED_BYTES = 256 - (256 % CODE_ALPHABET.length);

interface LoginRequest {
  state: "pending" | "approved" | "denied";
  hash: string;
  prefix: string;
  device: string;
  keyId: string;
  decidedBy?: string;
}

interface StoredLogin {
  rowId: string;
  storedValue: string;
  request: LoginRequest;
  expiresAt: Date;
}

const identifier = (code: string) => `cli-login:${code}`;

function newCode(): string {
  let code = "";
  while (code.length < 8) {
    for (const byte of crypto.getRandomValues(new Uint8Array(8))) {
      if (byte < UNBIASED_BYTES && code.length < 8) {
        code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      }
    }
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function statusOf(login: StoredLogin | undefined, now = Date.now()): CliLoginStatus {
  if (!login) return "expired";
  if (login.request.state !== "pending") return login.request.state;
  return now < login.expiresAt.getTime() ? "pending" : "expired";
}

async function findLogin(code: string): Promise<StoredLogin | undefined> {
  const [row] = await getDb()
    .select({ id: verification.id, value: verification.value, expiresAt: verification.expiresAt })
    .from(verification)
    .where(eq(verification.identifier, identifier(code)))
    .limit(1);
  if (!row) return undefined;
  return {
    rowId: row.id,
    storedValue: row.value,
    request: JSON.parse(row.value) as LoginRequest,
    expiresAt: row.expiresAt,
  };
}

export async function startCliLogin(input: unknown, origin: string): Promise<CliLoginStart> {
  const { hash, prefix, device } = parseInput(startCliLoginInputSchema, input);
  const code = newCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_MS);
  const request: LoginRequest = { state: "pending", hash, prefix, device, keyId: newId() };
  const db = getDb();
  const expired = db
    .select({ id: verification.id })
    .from(verification)
    .where(lt(verification.expiresAt, now))
    .limit(SWEEP_LIMIT);
  await db.batch([
    db.delete(verification).where(inArray(verification.id, expired)),
    db.insert(verification).values({
      id: newId(),
      identifier: identifier(code),
      value: JSON.stringify(request),
      expiresAt,
      createdAt: now,
      updatedAt: now,
    }),
  ]);
  return {
    code,
    url: `${origin}/cli-login?code=${code}`,
    expiresAt: expiresAt.toISOString(),
    interval: POLL_INTERVAL_SECONDS,
  };
}

export async function pollCliLogin(input: unknown): Promise<CliLoginPoll> {
  const { code, hash } = parseInput(pollCliLoginInputSchema, input);
  const found = await findLogin(code);
  const login = found?.request.hash === hash ? found : undefined;
  const status = statusOf(login);
  return status === "approved" ? { status, keyId: login!.request.keyId } : { status };
}

function requireBrowser(principal: Principal) {
  if (principal.via !== "session") throw forbidden("Approve a login from a signed-in browser");
}

const loginView = (code: string, login: StoredLogin | undefined): CliLoginView => ({
  code,
  device: login?.request.device ?? "",
  status: statusOf(login),
  expiresAt: (login?.expiresAt ?? new Date(0)).toISOString(),
});

export async function getCliLogin(principal: Principal, input: unknown): Promise<CliLoginView> {
  requireBrowser(principal);
  const { code } = parseInput(lookupCliLoginInputSchema, input);
  return loginView(code, await findLogin(code));
}

function insertLoginKeyWhile(
  db: Db,
  onlyIf: SQL | undefined,
  { request, userId, now }: { request: LoginRequest; userId: string; now: Date },
) {
  return db.insert(apiKey).select(
    db
      .select({
        id: sql<string>`${request.keyId}`.as("id"),
        userId: sql<string>`${userId}`.as("user_id"),
        name: sql<string>`${`CLI login on ${request.device}`}`.as("name"),
        prefix: sql<string>`${request.prefix}`.as("prefix"),
        hash: sql<string>`${request.hash}`.as("hash"),
        kind: sql<ApiKeyKind>`'login'`.as("kind"),
        lastUsedAt: sql<null>`NULL`.as("last_used_at"),
        createdAt: sql<number>`${now.getTime()}`.as("created_at"),
        revokedAt: sql<null>`NULL`.as("revoked_at"),
      })
      .from(verification)
      .where(onlyIf),
  );
}

const DECIDED = { approve: "approved", deny: "denied" } as const;

export async function decideCliLogin(principal: Principal, input: unknown): Promise<CliLoginView> {
  requireBrowser(principal);
  const { code, decision } = parseInput(decideCliLoginInputSchema, input);
  const login = await findLogin(code);
  if (login && statusOf(login) === "pending") {
    const now = new Date();
    const userId = principal.user.id;
    const decided: LoginRequest = { ...login.request, state: DECIDED[decision], decidedBy: userId };
    const db = getDb();
    const stillPending = and(
      eq(verification.id, login.rowId),
      eq(verification.value, login.storedValue),
      gt(verification.expiresAt, now),
    );
    const record = db
      .update(verification)
      .set({
        value: JSON.stringify(decided),
        updatedAt: now,
        expiresAt: new Date(now.getTime() + TTL_MS),
      })
      .where(stillPending);
    if (decision === "deny") {
      await record;
    } else {
      const insertKey = insertLoginKeyWhile(db, stillPending, {
        request: login.request,
        userId,
        now,
      });
      await db.batch([insertKey, record]).catch((error: unknown) => {
        throw /UNIQUE constraint failed/u.test(String(error))
          ? new ServiceError(
              "conflict",
              "This login can't be approved. Run screen-commons login again",
            )
          : error;
      });
    }
  }
  const after = await findLogin(code);
  const status = statusOf(after);
  if (status !== DECIDED[decision] || after?.request.decidedBy !== principal.user.id) {
    throw new ServiceError(
      "conflict",
      status === "expired"
        ? "This login code has expired. Run screen-commons login again"
        : `This login was already ${status}`,
    );
  }
  return loginView(code, after);
}
