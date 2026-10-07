import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { createKey } from "../../server/functions";

export const Route = createFileRoute("/_app/extension/connect")({
  component: ExtensionConnect,
});

/**
 * Mints a key for the browser extension and hands it over via `window.postMessage`; the
 * extension's content script on this origin listens for `open-ui:connect`.
 */
function ExtensionConnect() {
  const [state, setState] = useState<"connecting" | "connected" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    createKey({ data: { name: "Browser extension" } })
      .then(({ token }) => {
        window.postMessage(
          { type: "open-ui:connect", token, baseUrl: location.origin },
          location.origin,
        );
        setState("connected");
      })
      .catch((failure: unknown) => {
        setError(failure instanceof Error ? failure.message : String(failure));
        setState("error");
      });
  }, []);

  return (
    <main>
      <h1>Connect the browser extension</h1>
      {state === "connecting" ? <p>Connecting…</p> : null}
      {state === "connected" ? (
        <p role="status">The extension is connected. You can close this tab.</p>
      ) : null}
      {state === "error" ? <p role="alert">Could not connect: {error}</p> : null}
    </main>
  );
}
