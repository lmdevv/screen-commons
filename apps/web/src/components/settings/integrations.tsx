import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CodeBlock,
  SegmentedControl,
  textLinkClassName,
} from "@open-ui/ui";
import { Link } from "@tanstack/react-router";
import { KeyRound, PlugZap } from "lucide-react";
import { useState, type ReactNode } from "react";

import { CreateKeyDialog } from "./api-keys";

type Client = "claude" | "cursor" | "local";

const CLIENTS: { value: Client; label: string }[] = [
  { value: "claude", label: "Claude Code" },
  { value: "cursor", label: "Cursor" },
  { value: "local", label: "Local server" },
];

export function mcpSnippet(client: Client, origin: string, key: string) {
  switch (client) {
    case "claude":
      return {
        title: "Terminal",
        code: `claude mcp add --transport http open-ui ${origin}/mcp \\\n  --header "Authorization: Bearer ${key}"`,
      };
    case "cursor":
      return {
        title: "~/.cursor/mcp.json",
        code: JSON.stringify(
          {
            mcpServers: {
              "open-ui": { url: `${origin}/mcp`, headers: { Authorization: `Bearer ${key}` } },
            },
          },
          null,
          2,
        ),
      };
    case "local":
      return {
        title: "mcp.json",
        code: JSON.stringify(
          {
            mcpServers: {
              "open-ui": {
                command: "npx",
                args: ["-y", "open-ui-mcp"],
                env: { OPEN_UI_URL: origin, OPEN_UI_API_KEY: key },
              },
            },
          },
          null,
          2,
        ),
      };
  }
}

const CLIENT_NOTES: Record<Client, string> = {
  claude: "Adds the remote server at /mcp: search and view screens and flows, upload.",
  cursor: "Paste into ~/.cursor/mcp.json, or .cursor/mcp.json in a project.",
  local:
    "The local stdio server adds browser tools: crawl, capture and upload sites through the extension or headless Chromium.",
};

export function IntegrationsSection({ origin }: { origin: string }) {
  const [client, setClient] = useState<Client>("claude");
  const [token, setToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const snippet = mcpSnippet(client, origin, token ?? "oui_…");

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Browser extension</CardTitle>
          <CardDescription>
            Capture any site — visible area, full page or one element — and upload it here.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <ol className="flex flex-col gap-4">
            <Step n={1} title="Build it from the repository">
              <CodeBlock code="pnpm --filter @open-ui/extension build" className="mt-2" />
            </Step>
            <Step n={2} title="Load it in your browser">
              <p className="mt-1 text-base text-fg-muted">
                Open <code className="font-mono text-sm text-fg">chrome://extensions</code>, turn on
                Developer mode, click <span className="text-fg">Load unpacked</span> and pick{" "}
                <code className="font-mono text-sm text-fg">apps/extension/.output/chrome-mv3</code>
                .
              </p>
            </Step>
            <Step n={3} title="Connect it to your account">
              <p className="mt-1 text-base text-fg-muted">
                The extension receives its own key. No copy and paste.
              </p>
            </Step>
          </ol>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Button render={<Link to="/extension/connect" />}>
              <PlugZap />
              Connect extension
            </Button>
            <Link to="/docs/$slug" params={{ slug: "extension" }} className={textLinkClassName}>
              Extension guide
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MCP</CardTitle>
          <CardDescription>
            Let Claude Code, Cursor and other agents search the library and upload captures.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedControl<Client>
              aria-label="MCP client"
              size="sm"
              value={client}
              onValueChange={setClient}
              options={CLIENTS}
            />
            {token ? (
              <span className="text-sm text-fg-muted">Key inserted — copy it now</span>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
                <KeyRound />
                Insert a new key
              </Button>
            )}
          </div>
          <CodeBlock title={snippet.title} code={snippet.code} />
          <p className="text-sm text-fg-muted">
            {CLIENT_NOTES[client]}{" "}
            <Link to="/docs/$slug" params={{ slug: "mcp" }} className={textLinkClassName}>
              MCP guide
            </Link>
          </p>
        </CardContent>
      </Card>

      <CreateKeyDialog
        open={creating}
        onOpenChange={setCreating}
        defaultName="MCP"
        onCreated={(value) => setToken(value)}
      />
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-fg-muted tabular-nums">
        {n}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-base font-medium text-fg">{title}</p>
        {children}
      </div>
    </li>
  );
}
