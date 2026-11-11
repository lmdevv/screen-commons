import { execFile } from "node:child_process";
import { randomInt } from "node:crypto";
import { promisify } from "node:util";

import { createScreenCommonsClient, type CaptureBatchInput } from "@screen-commons/core";
import { inject } from "vitest";

import { makePng, makeWebp } from "./images";
import { webDir } from "./wrangler-config";

export const baseUrl = () => inject("baseUrl");

/** Minimal cookie-jar browser session against the test server. */
export class Session {
  private cookies = new Map<string, string>();

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (!headers.has("origin")) headers.set("origin", baseUrl());
    if (this.cookies.size > 0) {
      headers.set(
        "cookie",
        [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "),
      );
    }
    const response = await fetch(new URL(path, baseUrl()), {
      ...init,
      headers,
      redirect: "manual",
    });
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const index = pair!.indexOf("=");
      this.cookies.set(pair!.slice(0, index).trim(), pair!.slice(index + 1).trim());
    }
    return response;
  }

  async json<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetch(path, init);
    const text = await response.text();
    if (!response.ok)
      throw new Error(`${init.method ?? "GET"} ${path} → ${response.status}: ${text}`);
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /** Core typed client riding on this session's cookies. */
  client() {
    return createScreenCommonsClient({
      baseUrl: baseUrl(),
      fetch: (input, init) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        return this.fetch(url, init);
      },
    });
  }

  static async signUp(name: string, email: string, password = "password-123") {
    const session = new Session();
    await session.json("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    return session;
  }

  static async signIn(email: string, password: string) {
    const session = new Session();
    await session.json("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return session;
  }
}

/**
 * API client for a key. `images` simulates a failing or missing Images binding for its requests
 * (`x-test-images`, honoured by test servers only).
 */
export const keyClient = (apiKey: string, options: { images?: "fail" | "missing" } = {}) =>
  createScreenCommonsClient({
    baseUrl: baseUrl(),
    apiKey,
    headers: options.images ? { "x-test-images": options.images } : undefined,
  });

export const b64 = (buffer: Buffer) => buffer.toString("base64");

let seed = 1;
// Seeds restart in every test file. The offset keeps thumbnails unique across files, so one
// file's screens never keep another file's discarded thumbnail in storage.
const thumbnailColors = randomInt(2 ** 24);
function thumbnailColor() {
  const color = (thumbnailColors + seed) % 2 ** 24;
  return [color & 0xff, (color >> 8) & 0xff, color >> 16, 255];
}

/** One capture-batch screen with a real PNG (unique pixels) and a real WebP thumbnail. */
export function captureScreen(
  overrides: Partial<CaptureBatchInput["screens"][number]> = {},
): CaptureBatchInput["screens"][number] {
  seed += 1;
  const width = 320;
  const height = 200;
  return {
    image: { type: "image/png", base64: b64(makePng(width, height, seed)) },
    thumbnail: { type: "image/webp", base64: b64(makeWebp(160, 100, thumbnailColor())) },
    width,
    height,
    patterns: [],
    elements: [],
    tags: [],
    ...overrides,
  };
}

export const uniqueSuffix = () => Math.random().toString(36).slice(2, 8);

/**
 * Run a wrangler command against the test server's local state, e.g.
 * `wranglerLocal(["d1", "execute", "DB", "--command", sql])`, to set up states the API can't
 * produce (rows from before a migration). Async, so the test process stays responsive while
 * wrangler starts.
 */
export async function wranglerLocal(args: string[]): Promise<string> {
  const { stdout } = await promisify(execFile)(
    "pnpm",
    [
      "exec",
      "wrangler",
      ...args,
      "--local",
      "--config",
      inject("wranglerConfig"),
      "--persist-to",
      inject("stateDir"),
    ],
    { cwd: webDir, env: { ...process.env, CI: "1" }, maxBuffer: 16 * 1024 * 1024 },
  );
  return stdout;
}

/**
 * Run SQL against the test server's local D1. Wrangler does not wait for the lock while the
 * server writes, so a statement that SQLite refused as busy (and so never ran) runs again.
 */
export async function d1(sql: string): Promise<unknown[]> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const output = await wranglerLocal(["d1", "execute", "DB", "--json", "--command", sql]);
      return (JSON.parse(output) as { results: unknown[] }[])[0]?.results ?? [];
    } catch (error) {
      if (attempt === 5 || !String(error).includes("SQLITE_BUSY")) throw error;
    }
  }
}
