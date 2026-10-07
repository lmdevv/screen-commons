import { BRIDGE_DEFAULT_PORT } from "@open-ui/core/bridge";
import { ArrowUpRight, Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { browser } from "wxt/browser";

import { sendToBackground } from "../../lib/messages";
import {
  DEFAULT_SERVER_URL,
  isValidPort,
  normalizeServerUrl,
  originMatchPattern,
  originOf,
  type FullPageMethod,
  type Settings,
} from "../../lib/settings";
import { getItem, saveSettings, type BridgeStatus } from "../../lib/storage";
import { Button, Dot, Field, IconButton, Input, Logo, Spinner, Switch, cx, useFieldId, type DotTone } from "../../ui/components";
import { checkAccount, useStorage, type AccountState } from "../../ui/hooks";

interface FormState {
  serverUrl: string;
  apiKey: string;
  bridgeEnabled: boolean;
  bridgePort: string;
  bridgeToken: string;
  fullPageMethod: FullPageMethod;
  lazyLoad: boolean;
}

function toForm(settings: Settings): FormState {
  return { ...settings, bridgePort: String(settings.bridgePort) };
}

const BRIDGE_LABEL: Record<BridgeStatus["state"], [string, DotTone]> = {
  connected: ["Connected", "ok"],
  connecting: ["Connecting…", "busy"],
  offline: ["Bridge not running", "idle"],
  unpaired: ["Add the pairing token to connect", "idle"],
  unauthorized: ["Pairing token rejected", "danger"],
  replaced: ["Another browser took over the bridge", "warn"],
  disabled: ["Off", "idle"],
};

export function Options() {
  const settings = useStorage("settings");
  const bridge = useStorage("bridgeStatus");
  const connectResult = useStorage("connectResult");
  const [form, setForm] = useState<FormState | null>(null);
  const [saved, setSaved] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountState | null>(null);
  const [testingBridge, setTestingBridge] = useState(false);
  const firstConnect = useRef<number | null>(null);
  const savedRef = useRef<FormState | null>(null);

  // Sync from storage when not editing (e.g. after the connect handoff).
  useEffect(() => {
    if (!settings) return;
    const next = toForm(settings);
    const previous = savedRef.current;
    savedRef.current = next;
    setSaved(next);
    setForm((current) => (!current || JSON.stringify(current) === JSON.stringify(previous) ? next : current));
  }, [settings]);

  useEffect(() => {
    if (!connectResult) return;
    if (firstConnect.current === null) {
      firstConnect.current = connectResult.at;
      return;
    }
    if (connectResult.at !== firstConnect.current) {
      setFlash(connectResult.userName ? `Connected as ${connectResult.userName}` : "Connected");
      setAccount(null);
    }
  }, [connectResult]);

  useEffect(() => {
    void getItem("connectResult").then((result) => (firstConnect.current = result?.at ?? 0));
  }, []);

  if (!form) return null;
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const set = (patch: Partial<FormState>) => {
    setForm((current) => (current ? { ...current, ...patch } : current));
    setError(null);
  };

  /** Validate + persist. Requests host access for custom servers (needs the click gesture). */
  async function save(): Promise<Settings | null> {
    if (!form) return null;
    const serverUrl = normalizeServerUrl(form.serverUrl);
    if (!serverUrl) {
      setError("Enter a valid server URL, like https://ui.example.com.");
      return null;
    }
    const port = Number(form.bridgePort);
    if (!isValidPort(port)) {
      setError("Bridge port must be a number between 1 and 65535.");
      return null;
    }
    if (originOf(serverUrl) !== originOf(DEFAULT_SERVER_URL)) {
      const pattern = originMatchPattern(serverUrl);
      if (pattern && !(await browser.permissions.contains({ origins: [pattern] }))) {
        const granted = await browser.permissions.request({ origins: [pattern] }).catch(() => false);
        if (!granted) setError("Without access to that site the one-click connect won’t work. Paste an API key instead.");
      }
    }
    const next = await saveSettings({
      serverUrl,
      apiKey: form.apiKey,
      bridgeEnabled: form.bridgeEnabled,
      bridgePort: port,
      bridgeToken: form.bridgeToken,
      fullPageMethod: form.fullPageMethod,
      lazyLoad: form.lazyLoad,
    });
    savedRef.current = toForm(next);
    setForm(toForm(next));
    setSaved(toForm(next));
    return next;
  }

  async function onSave() {
    if (await save()) {
      setFlash("Settings saved");
      setTimeout(() => setFlash(null), 2000);
    }
  }

  async function connect() {
    const next = await save();
    if (next) void browser.tabs.create({ url: `${next.serverUrl}/extension/connect` });
  }

  async function testAccount() {
    const serverUrl = normalizeServerUrl(form!.serverUrl);
    if (!serverUrl) return setError("Enter a valid server URL.");
    setAccount({ state: "loading" });
    setAccount(await checkAccount(serverUrl, form!.apiKey.trim()));
  }

  async function testBridge() {
    setTestingBridge(true);
    try {
      if (dirty && !(await save())) return;
      await sendToBackground({ type: "bridge:reconnect" });
      const deadline = Date.now() + 6000;
      while (Date.now() < deadline) {
        const status = await getItem("bridgeStatus");
        if (status.state !== "connecting") break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } finally {
      setTestingBridge(false);
    }
  }

  const bridgeLabel = BRIDGE_LABEL[bridge?.state ?? "disabled"];
  const isChromium = !import.meta.env.FIREFOX;

  return (
    <div className="min-h-screen pb-24">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-[640px] items-center gap-2.5 px-6">
          <Logo size={20} />
          <span className="text-[14px] font-semibold tracking-[-0.01em]">Open UI Capture</span>
          <span className="text-subtle">/</span>
          <span className="text-[14px] font-medium">Settings</span>
        </div>
      </header>

      <main className="mx-auto flex max-w-[640px] flex-col gap-10 px-6 pt-10">
        {flash ? (
          <div className="flex h-10 items-center gap-2.5 rounded-xl border border-line px-3.5" role="status">
            <Dot tone="ok" />
            <span className="font-medium">{flash}</span>
          </div>
        ) : null}

        <Section title="Account" description="Uploads go to this Open UI instance with your API key.">
          <TextField label="Server URL" value={form.serverUrl} onChange={(serverUrl) => set({ serverUrl })} placeholder={DEFAULT_SERVER_URL} spellCheck={false} />
          <SecretField
            label="API key"
            value={form.apiKey}
            onChange={(apiKey) => set({ apiKey })}
            placeholder="oui_…"
            hint="Create one under Settings → API keys on your instance, or use one-click connect."
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => void connect()}>
              Connect with Open UI
              <ArrowUpRight className="size-3.5" strokeWidth={1.75} />
            </Button>
            <Button onClick={() => void testAccount()} disabled={account?.state === "loading"}>
              {account?.state === "loading" ? <Spinner /> : null}
              Test connection
            </Button>
            <AccountResult account={account} />
          </div>
        </Section>

        <Section
          title="MCP bridge"
          description="Lets a local agent running open-ui-mcp drive this browser: navigate, screenshot and read pages."
          aside={<Switch label="Enable MCP bridge" checked={form.bridgeEnabled} onChange={(bridgeEnabled) => set({ bridgeEnabled })} />}
        >
          <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4">
            <TextField
              label="Port"
              value={form.bridgePort}
              onChange={(bridgePort) => set({ bridgePort: bridgePort.replace(/[^0-9]/gu, "") })}
              placeholder={String(BRIDGE_DEFAULT_PORT)}
              inputMode="numeric"
              disabled={!form.bridgeEnabled}
            />
            <SecretField
              label="Pairing token"
              value={form.bridgeToken}
              onChange={(bridgeToken) => set({ bridgeToken })}
              placeholder="Printed by open-ui-mcp on start"
              disabled={!form.bridgeEnabled}
            />
          </div>
          <p className="-mt-1 text-[12px] leading-4 text-subtle">
            Run <code className="font-mono text-[11.5px] text-muted">npx open-ui-mcp</code>; the token is printed on start and saved to{" "}
            <code className="font-mono text-[11.5px] text-muted">~/.config/open-ui/bridge-token</code>.
          </p>
          <div className="flex items-center gap-3">
            <Button onClick={() => void testBridge()} disabled={testingBridge || !form.bridgeEnabled}>
              {testingBridge ? <Spinner /> : null}
              Test bridge
            </Button>
            <span className="flex items-center gap-2 text-muted">
              <Dot tone={bridgeLabel[1]} />
              {bridgeLabel[0]}
              {bridge?.state === "connected" && bridge.server ? (
                <span className="text-subtle">
                  · {bridge.server.name} {bridge.server.version}
                </span>
              ) : null}
              <span className="text-subtle tabular-nums">· 127.0.0.1:{bridge?.port || form.bridgePort}</span>
            </span>
          </div>
        </Section>

        <Section title="Capture">
          <Field label="Full-page method">
            <div role="radiogroup" className="flex flex-col divide-y divide-line rounded-xl border border-line">
              {(
                [
                  ["auto", "Automatic", isChromium ? "Chrome DevTools Protocol, one exact render of the whole page." : "Firefox full-page capture in one pass."],
                  ["stitch", "Scroll and stitch", "Scrolls and combines viewport captures. Slower; try it if a page renders oddly."],
                ] as const
              ).map(([value, label, hint]) => (
                <label key={value} className="flex cursor-pointer items-start gap-3 px-3.5 py-3">
                  <input
                    type="radio"
                    name="fullPageMethod"
                    value={value}
                    checked={form.fullPageMethod === value}
                    onChange={() => set({ fullPageMethod: value })}
                    className="mt-0.5 accent-[var(--ou-fg)]"
                  />
                  <span>
                    <span className="block font-medium">{label}</span>
                    <span className="block text-[12px] text-muted">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </Field>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-medium">Load lazy content first</div>
              <div className="text-[12px] text-muted">Scroll through the page before full-page captures so images load.</div>
            </div>
            <Switch label="Load lazy content first" checked={form.lazyLoad} onChange={(lazyLoad) => set({ lazyLoad })} />
          </div>
          {isChromium ? (
            <button
              type="button"
              className="self-start text-[12px] font-medium text-muted underline-offset-4 hover:text-fg hover:underline"
              onClick={() => void browser.tabs.create({ url: "chrome://extensions/shortcuts" })}
            >
              Customize keyboard shortcuts
            </button>
          ) : null}
        </Section>
      </main>

      <div
        className={cx(
          "fixed inset-x-0 bottom-0 border-t border-line bg-bg/90 backdrop-blur transition-[opacity,transform] duration-150",
          dirty || error ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
        )}
      >
        <div className="mx-auto flex h-14 max-w-[640px] items-center justify-between gap-4 px-6">
          <p className={cx("truncate text-[12px]", error ? "text-danger" : "text-muted")}>{error ?? "You have unsaved changes"}</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => saved && (setForm(saved), setError(null))} disabled={!dirty}>
              Discard
            </Button>
            <Button variant="primary" onClick={() => void onSave()} disabled={!dirty}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, description, aside, children }: { title: string; description?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-6 border-b border-line pb-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
          {description ? <p className="mt-0.5 text-muted">{description}</p> : null}
        </div>
        {aside ? <div className="pt-1">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  hint,
  ...props
}: { label: string; value: string; onChange: (value: string) => void; hint?: string } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
>) {
  const id = useFieldId("field");
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} {...props} />
    </Field>
  );
}

function SecretField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useFieldId("secret");
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          className="pr-9 font-mono text-[12px]"
        />
        <IconButton
          label={visible ? `Hide ${label}` : `Show ${label}`}
          className="absolute top-1/2 right-0.5 size-7 -translate-y-1/2"
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
        >
          {visible ? <EyeOff className="size-3.5" strokeWidth={1.75} /> : <Eye className="size-3.5" strokeWidth={1.75} />}
        </IconButton>
      </div>
    </Field>
  );
}

function AccountResult({ account }: { account: AccountState | null }) {
  if (!account || account.state === "loading") return null;
  if (account.state === "ok") {
    return (
      <span className="ml-1 flex items-center gap-2 text-muted" role="status">
        <Dot tone="ok" />
        Signed in as <span className="font-medium text-fg">{account.user.name || account.user.email}</span>
        <span className="text-subtle">· {account.user.role}</span>
      </span>
    );
  }
  return (
    <span className="ml-1 flex items-center gap-2 text-muted" role="status">
      <Dot tone="danger" />
      {account.state === "signed-out" ? "Add an API key first" : account.message}
    </span>
  );
}
