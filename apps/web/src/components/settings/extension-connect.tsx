import { Button, Callout, CodeBlock, Spinner, cn, textLinkClassName } from "@screen-commons/ui";
import { Link } from "@tanstack/react-router";
import { CircleAlert, CircleCheck, PlugZap, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { errorMessage } from "../../lib/toast";
import { createKey } from "../../server/functions";

/** How long to wait for the extension's content script before offering the manual path. */
export const EXTENSION_TIMEOUT_MS = 4000;

type State =
  | { kind: "minting" }
  | { kind: "waiting" }
  | { kind: "connected"; userName: string | null }
  | { kind: "no-extension" }
  | { kind: "failed"; error: string }
  | { kind: "mint-failed"; error: string };

/**
 * One key per visit: survives re-renders, StrictMode double effects and remounts, but a reload
 * (a new visit) mints a fresh one.
 */
let mintedThisVisit: Promise<string> | null = null;
function mintOnce(): Promise<string> {
  mintedThisVisit ??= createKey({ data: { name: "Browser extension" } }).then(
    (result) => result.token,
    (error: unknown) => {
      mintedThisVisit = null;
      throw error;
    },
  );
  return mintedThisVisit;
}

/**
 * The `/extension/connect` handshake with the extension's content script:
 *
 *   extension → { type: "open-ui:extension-ready" }        (on load; we re-send the token)
 *   page      → { type: "open-ui:connect", token, baseUrl } (after minting, and on ready)
 *   extension → { type: "open-ui:connect:result", ok, userName?, error? }
 */
export function ExtensionConnect() {
  const [state, setState] = useState<State>({ kind: "minting" });
  const [token, setToken] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const settled = useRef(false);

  const send = useCallback((value: string) => {
    window.postMessage(
      { type: "open-ui:connect", token: value, baseUrl: location.origin },
      location.origin,
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    let current: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin) return;
      const data = event.data as {
        type?: unknown;
        ok?: unknown;
        userName?: unknown;
        error?: unknown;
      } | null;
      if (!data || typeof data.type !== "string") return;
      if (data.type === "open-ui:extension-ready") {
        if (current && !settled.current) send(current);
      } else if (data.type === "open-ui:connect:result") {
        settled.current = true;
        clearTimeout(timer);
        if (data.ok === true) {
          setState({
            kind: "connected",
            userName: typeof data.userName === "string" ? data.userName : null,
          });
        } else {
          setState({
            kind: "failed",
            error: typeof data.error === "string" ? data.error : "The extension refused the key",
          });
        }
      }
    };
    window.addEventListener("message", onMessage);

    mintOnce()
      .then((value) => {
        if (cancelled) return;
        current = value;
        setToken(value);
        if (settled.current) return;
        setState((previous) => (previous.kind === "minting" ? { kind: "waiting" } : previous));
        send(value);
        timer = setTimeout(() => {
          if (!settled.current) setState({ kind: "no-extension" });
        }, EXTENSION_TIMEOUT_MS);
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ kind: "mint-failed", error: errorMessage(error) });
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    };
  }, [send]);

  function retry() {
    if (!token) return;
    settled.current = false;
    setState({ kind: "waiting" });
    send(token);
    setTimeout(() => {
      if (!settled.current) setState({ kind: "no-extension" });
    }, EXTENSION_TIMEOUT_MS);
  }

  if (state.kind === "connected") {
    return (
      <Panel
        tone="success"
        icon={<CircleCheck />}
        title={state.userName ? `Extension connected as ${state.userName}` : "Extension connected"}
        description="You can close this tab and start capturing from the extension."
      >
        <div className="mt-8 flex flex-wrap gap-3">
          <Button render={<Link to="/browse/$platform" params={{ platform: "web" }} />}>
            Back to the library
          </Button>
          <Button variant="outline" render={<Link to="/settings" search={{ tab: "keys" }} />}>
            Manage keys
          </Button>
        </div>
      </Panel>
    );
  }

  if (state.kind === "mint-failed") {
    return (
      <Panel
        tone="danger"
        icon={<CircleAlert />}
        title="Couldn’t create a key"
        description={state.error}
      >
        <div className="mt-8">
          <Button onClick={() => location.reload()}>Try again</Button>
        </div>
      </Panel>
    );
  }

  const waiting = state.kind === "minting" || state.kind === "waiting";
  return (
    <Panel
      icon={waiting ? <Spinner size={20} /> : <PlugZap />}
      title={
        waiting
          ? "Connecting the extension…"
          : state.kind === "failed"
            ? "The extension couldn’t connect"
            : "No extension found"
      }
      description={
        waiting
          ? "Creating a key for Screen Commons Capture and handing it over."
          : state.kind === "failed"
            ? state.error
            : "Screen Commons Capture didn’t answer. Install it, then reload this page — or paste the key into the extension yourself."
      }
    >
      {!waiting ? (
        <div className="mt-8 flex flex-col gap-6">
          {state.kind === "no-extension" ? (
            <ol className="flex flex-col gap-3 text-base text-fg-muted">
              <li className="flex gap-3">
                <StepNumber n={1} />
                <span>
                  Build it:{" "}
                  <code className="font-mono text-sm text-fg">
                    pnpm --filter @screen-commons/extension build
                  </code>
                </span>
              </li>
              <li className="flex gap-3">
                <StepNumber n={2} />
                <span>
                  In <code className="font-mono text-sm text-fg">chrome://extensions</code>, load{" "}
                  <code className="font-mono text-sm text-fg">
                    apps/extension/.output/chrome-mv3
                  </code>{" "}
                  unpacked.
                </span>
              </li>
              <li className="flex gap-3">
                <StepNumber n={3} />
                <span>Reload this page.</span>
              </li>
            </ol>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {state.kind === "no-extension" ? (
              <Button onClick={() => location.reload()}>Reload page</Button>
            ) : (
              <Button onClick={retry}>Try again</Button>
            )}
            {!showKey ? (
              <Button variant="outline" onClick={() => setShowKey(true)} disabled={!token}>
                Connect manually
              </Button>
            ) : null}
          </div>
          {showKey && token ? (
            <div className="flex flex-col gap-3">
              <p className="text-base text-fg-muted">
                In the extension, open <span className="text-fg">Options</span>, set the server to{" "}
                <code className="font-mono text-sm text-fg">{location.origin}</code> and paste this
                key:
              </p>
              <CodeBlock
                code={token}
                data-testid="extension-key"
                className="[&_pre]:break-all [&_pre]:whitespace-pre-wrap"
              />
              <Callout tone="warning" icon={<TriangleAlert />}>
                The key is shown only on this page. Revoke it in{" "}
                <Link to="/settings" search={{ tab: "keys" }} className={textLinkClassName}>
                  Settings
                </Link>{" "}
                if it leaks.
              </Callout>
            </div>
          ) : null}
          <Link
            to="/docs/$slug"
            params={{ slug: "extension" }}
            className={`${textLinkClassName} w-fit text-sm text-fg-muted`}
          >
            Browser extension guide
          </Link>
        </div>
      ) : null}
    </Panel>
  );
}

function Panel({
  tone = "neutral",
  icon,
  title,
  description,
  children,
}: {
  tone?: "neutral" | "success" | "danger";
  icon: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div role="status" aria-live="polite">
      <div
        aria-hidden
        className={cn(
          "flex size-11 items-center justify-center rounded-full [&_svg]:size-5",
          tone === "neutral" && "bg-muted text-fg-muted",
          tone === "success" && "bg-success-soft text-success",
          tone === "danger" && "bg-danger-soft text-danger",
        )}
      >
        {icon}
      </div>
      <h1 className="mt-6 text-xl font-semibold text-balance text-fg">{title}</h1>
      <p className="mt-2 text-base text-pretty text-fg-muted">{description}</p>
      {children}
    </div>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-fg-muted tabular-nums">
      {n}
    </span>
  );
}
