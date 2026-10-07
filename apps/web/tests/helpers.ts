import { createOpenUiClient, type CaptureBatchInput } from "@open-ui/core";
import { inject } from "vitest";

import { makePng, makeWebp } from "./images";

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
    return createOpenUiClient({
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

export const keyClient = (apiKey: string) => createOpenUiClient({ baseUrl: baseUrl(), apiKey });

export const b64 = (buffer: Buffer) => buffer.toString("base64");

let seed = 1;
/** One capture-batch screen with a real PNG (unique pixels) and a real WebP thumbnail. */
export function captureScreen(
  overrides: Partial<CaptureBatchInput["screens"][number]> = {},
): CaptureBatchInput["screens"][number] {
  seed += 1;
  const width = 320;
  const height = 200;
  return {
    image: { type: "image/png", base64: b64(makePng(width, height, seed)) },
    thumbnail: { type: "image/webp", base64: b64(makeWebp(160, 100, [seed % 255, 40, 80, 255])) },
    width,
    height,
    patterns: [],
    elements: [],
    tags: [],
    ...overrides,
  };
}

export const uniqueSuffix = () => Math.random().toString(36).slice(2, 8);
