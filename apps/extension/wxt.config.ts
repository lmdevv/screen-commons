import { existsSync } from "node:fs";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// `wxt dev` opens a browser with the extension loaded. Use CHROME_PATH (or the system Chromium
// on NixOS) when set; otherwise web-ext finds Chrome itself.
const chromePath =
  process.env.CHROME_PATH ??
  (existsSync("/run/current-system/sw/bin/chromium")
    ? "/run/current-system/sw/bin/chromium"
    : undefined);

// https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  webExt: {
    ...(chromePath ? { binaries: { chrome: chromePath } } : {}),
    startUrls: ["http://localhost:5173"],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ browser }) => {
    const firefox = browser === "firefox";
    return {
      name: "Screen Commons Capture",
      short_name: "Commons",
      description:
        "Capture screens and flows into Screen Commons, and connect AI agents through its local MCP bridge.",
      permissions: [
        "activeTab",
        "tabs",
        "scripting",
        "storage",
        "alarms",
        "unlimitedStorage",
        ...(firefox ? [] : ["debugger"]),
      ],
      host_permissions: ["<all_urls>"],
      ...(firefox
        ? {
            browser_specific_settings: {
              gecko: {
                // Keep the installed extension identity stable across the rename.
                id: "open-ui@openui.dev",
                strict_min_version: "140.0",
                data_collection_permissions: { required: ["websiteContent"], optional: [] },
              },
            },
          }
        : { minimum_chrome_version: "120" }),
      commands: {
        "capture-visible": {
          suggested_key: { default: "Alt+Shift+V" },
          description: "Capture the visible part of the page",
        },
        "capture-full": {
          suggested_key: { default: "Alt+Shift+S" },
          description: "Capture the full page",
        },
        "capture-element": {
          suggested_key: { default: "Alt+Shift+E" },
          description: "Pick an element to capture",
        },
      },
    };
  },
});
