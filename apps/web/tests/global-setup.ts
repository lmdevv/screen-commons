import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { TestProject } from "vitest/node";

const webDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.OPEN_UI_TEST_PORT ?? 5179);
const BASE_URL = `http://localhost:${PORT}`;
export const ADMIN = {
  name: "Ada Admin",
  email: "admin@open-ui.test",
  password: "correct-horse-1",
};

declare module "vitest" {
  export interface ProvidedContext {
    baseUrl: string;
    admin: { name: string; email: string; password: string };
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
  const stateDir = await mkdtemp(join(tmpdir(), "open-ui-test-"));
  const env = {
    ...process.env,
    CI: "1",
    PORT: String(PORT),
    OPEN_UI_PERSIST_DIR: stateDir,
    OPEN_UI_APP_URL: BASE_URL,
  };
  execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "migrations", "apply", "DB", "--local", "--persist-to", stateDir],
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
  } catch (error) {
    await stop();
    throw error;
  }

  project.provide("baseUrl", BASE_URL);
  project.provide("admin", ADMIN);
  return stop;
}
