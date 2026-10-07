import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ browser }) => {
    const firefox = browser === "firefox";
    return {
      name: "Open UI Capture",
      short_name: "Open UI",
      description:
        "Capture screens and flows from any website into your Open UI library. Also lets local AI agents drive the browser through the Open UI MCP bridge.",
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
