import { browser } from "wxt/browser";

/**
 * Runs on Screen Commons origins (manifest: default dev server; custom servers are registered at
 * runtime). Bridges `/extension/connect` to the background:
 *
 *   page → window.postMessage({ type: "screen-commons:connect", token, baseUrl }, location.origin)
 *   extension → window.postMessage({ type: "screen-commons:connect:result", ok, userName?, error? })
 *
 * On load it announces itself with `{ type: "screen-commons:extension-ready", version }` so the page
 * can (re)send the token if it posted before this script was ready.
 */
export default defineContentScript({
  matches: ["http://localhost:5173/*"],
  runAt: "document_start",
  main() {
    const flag = "__screenCommonsConnectInstalled";
    const scope = globalThis as unknown as Record<string, boolean>;
    if (scope[flag]) return;
    scope[flag] = true;

    let busy = false;
    window.addEventListener("message", (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin) return;
      const data = event.data as { type?: unknown; token?: unknown; baseUrl?: unknown } | null;
      if (!data || data.type !== "screen-commons:connect" || busy) return;
      if (typeof data.token !== "string" || typeof data.baseUrl !== "string") return;
      busy = true;
      void (
        browser.runtime.sendMessage({
          type: "connect:token",
          token: data.token,
          baseUrl: data.baseUrl,
        }) as Promise<
          { ok: true; data: { userName: string | null } } | { ok: false; error: string } | undefined
        >
      )
        .then((response) => {
          if (response?.ok) {
            window.postMessage(
              { type: "screen-commons:connect:result", ok: true, userName: response.data.userName },
              location.origin,
            );
            toast(
              response.data.userName
                ? `Screen Commons Capture connected as ${response.data.userName}`
                : "Screen Commons Capture connected",
            );
          } else {
            const error =
              response && !response.ok ? response.error : "The extension did not respond";
            window.postMessage(
              { type: "screen-commons:connect:result", ok: false, error },
              location.origin,
            );
            toast(`Could not connect: ${error}`);
          }
        })
        .finally(() => (busy = false));
    });

    const announce = () =>
      window.postMessage(
        { type: "screen-commons:extension-ready", version: browser.runtime.getManifest().version },
        location.origin,
      );
    announce();
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", announce, { once: true });
  },
});

function toast(text: string) {
  const mount = () => {
    const host = document.createElement("div");
    host.style.cssText =
      "all: initial; position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;";
    const root = host.attachShadow({ mode: "closed" });
    const el = document.createElement("div");
    el.textContent = text;
    el.style.cssText =
      "font: 500 13px/1.3 Inter, ui-sans-serif, system-ui, sans-serif; color: #fff; background: #0a0a0a; padding: 10px 14px; border-radius: 999px; box-shadow: 0 8px 28px rgba(0,0,0,.18); opacity: 0; transform: translateY(4px); transition: opacity 160ms ease, transform 160ms ease;";
    root.appendChild(el);
    document.body.appendChild(host);
    requestAnimationFrame(() => {
      el.style.opacity = "1";
      el.style.transform = "none";
    });
    setTimeout(() => {
      el.style.opacity = "0";
      setTimeout(() => host.remove(), 200);
    }, 3200);
  };
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });
}
