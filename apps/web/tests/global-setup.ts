import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { TestProject } from "vitest/node";

import { writeTestWranglerConfig } from "./wrangler-config";

const webDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIRST_PORT = Number(
  process.env.SCREEN_COMMONS_TEST_PORT ?? process.env.OPEN_UI_TEST_PORT ?? 5179,
);

/** First port from `start` that nothing is listening on (a dev server may hold 5173/5179). */
async function freePort(start: number): Promise<number> {
  for (let port = start; port < start + 20; port += 1) {
    const free = await new Promise<boolean>((resolve) => {
      const server = createServer()
        .once("error", () => resolve(false))
        .once("listening", () => server.close(() => resolve(true)))
        .listen(port, "localhost");
    });
    if (free) return port;
  }
  throw new Error(`no free port in ${start}-${start + 19}`);
}
export const ADMIN = {
  name: "Ada Admin",
  email: "admin@screen-commons.test",
  password: "correct-horse-1",
};

declare module "vitest" {
  export interface ProvidedContext {
    baseUrl: string;
    admin: { name: string; email: string; password: string };
    /** `user.role` in the first account's sign-up response. */
    adminSignUpRole: string;
  }
}

async function waitFor(url: string, child: ChildProcess, log: () => string) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`dev server exited early:\n${log()}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`dev server did not start:\n${log()}`);
}

/**
 * Boots `vite dev` (workerd + local D1/R2) on a throwaway state directory with migrations
 * applied, creates the first (admin) account, and tears everything down afterwards.
 */
export default async function setup(project: TestProject) {
  const PORT = await freePort(FIRST_PORT);
  const BASE_URL = `http://localhost:${PORT}`;
  const stateDir = await mkdtemp(join(tmpdir(), "screen-commons-test-"));
  const configDir = join(stateDir, "config");
  await mkdir(configDir);
  const configPath = writeTestWranglerConfig(configDir, {
    devVars: { APP_URL: BASE_URL, BETTER_AUTH_SECRET: randomBytes(32).toString("base64url") },
  });
  const env = {
    ...process.env,
    CI: "1",
    PORT: String(PORT),
    SCREEN_COMMONS_PERSIST_DIR: stateDir,
    SCREEN_COMMONS_WRANGLER_CONFIG: configPath,
    SCREEN_COMMONS_VITE_CACHE_DIR: join(webDir, "node_modules/.vite-test"),
  };
  execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "migrations",
      "apply",
      "DB",
      "--local",
      "--config",
      configPath,
      "--persist-to",
      stateDir,
    ],
    {
      cwd: webDir,
      env,
      stdio: "pipe",
    },
  );

  let output = "";
  const child = spawn("pnpm", ["exec", "vite", "dev"], {
    cwd: webDir,
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (data) => (output += String(data)));
  child.stderr?.on("data", (data) => (output += String(data)));

  const stop = async () => {
    if (child.pid && child.exitCode === null) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // already gone
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // already gone
      }
    }
    await rm(stateDir, { recursive: true, force: true });
  };

  let adminSignUpRole = "";
  try {
    await waitFor(`${BASE_URL}/api/v1/taxonomy`, child, () => output);
    // Warm up SSR (dependency optimisation can trigger a reload on first page load).
    await fetch(`${BASE_URL}/sign-in`).catch(() => undefined);

    const response = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE_URL },
      body: JSON.stringify(ADMIN),
    });
    if (!response.ok)
      throw new Error(`admin sign-up failed: ${response.status} ${await response.text()}`);
    adminSignUpRole = ((await response.json()) as { user: { role: string } }).user.role;
  } catch (error) {
    await stop();
    throw error;
  }

  project.provide("baseUrl", BASE_URL);
  project.provide("admin", ADMIN);
  project.provide("adminSignUpRole", adminSignUpRole);
  return stop;
}
