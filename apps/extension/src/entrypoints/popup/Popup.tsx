import { ArrowUpRight, Crosshair, Maximize2, RotateCw, ScanLine, Settings as SettingsIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { browser } from "wxt/browser";

import { sendToBackground } from "../../lib/messages";
import type { BridgeStatus } from "../../lib/storage";
import type { CaptureMode } from "../../lib/tray";
import { Button, Dot, IconButton, Kbd, Logo, Spinner, Switch, cx, type DotTone } from "../../ui/components";
import { hostLabel, useAccount, useStorage } from "../../ui/hooks";

const BRIDGE_COPY: Record<BridgeStatus["state"], { label: string; tone: DotTone }> = {
  connected: { label: "Connected", tone: "ok" },
  connecting: { label: "Connecting…", tone: "busy" },
  offline: { label: "Not running", tone: "idle" },
  unpaired: { label: "Not paired", tone: "idle" },
  unauthorized: { label: "Token rejected", tone: "danger" },
  replaced: { label: "In use elsewhere", tone: "warn" },
  disabled: { label: "Off", tone: "idle" },
};

function useShortcuts(): Record<string, string> {
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});
  useEffect(() => {
    void browser.commands?.getAll().then((commands) => {
      const map: Record<string, string> = {};
      for (const command of commands) if (command.name && command.shortcut) map[command.name] = command.shortcut;
      setShortcuts(map);
    });
  }, []);
  return shortcuts;
}

function prettyShortcut(value: string | undefined): string | null {
  if (!value) return null;
  const mac = navigator.platform.toLowerCase().includes("mac");
  if (!mac) return value.replace(/\+/gu, " ");
  return value
    .replace(/Alt\+?|Option\+?/gu, "⌥")
    .replace(/Shift\+?/gu, "⇧")
    .replace(/(Command|MacCtrl)\+?/gu, "⌘")
    .replace(/Ctrl\+?/gu, "⌃");
}

function openPage(path: "/tray.html" | "/options.html") {
  void browser.tabs.create({ url: browser.runtime.getURL(path) });
  window.close();
}

export function Popup() {
  const settings = useStorage("settings");
  const bridge = useStorage("bridgeStatus");
  const tray = useStorage("trayState");
  const recording = useStorage("recording");
  const [account, recheck] = useAccount(settings);
  const shortcuts = useShortcuts();
  const [busy, setBusy] = useState<CaptureMode | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [capturable, setCapturable] = useState(true);

  useEffect(() => {
    void browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      setCapturable(Boolean(tab?.url && /^(https?|file):/u.test(tab.url)));
    });
  }, []);

  async function capture(mode: CaptureMode) {
    setNotice(null);
    if (mode === "element") {
      // The popup must close so the page can receive the pointer; the background keeps going.
      void sendToBackground({ type: "capture", mode }).catch(() => undefined);
      window.close();
      return;
    }
    setBusy(mode);
    try {
      const { shot } = await sendToBackground({ type: "capture", mode });
      if (shot) {
        setNotice({
          tone: "ok",
          text: `Added ${shot.width} × ${shot.height}${shot.truncated ? " (trimmed: very long page)" : ""}`,
        });
      }
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  }

  const bridgeCopy = BRIDGE_COPY[bridge?.state ?? "disabled"];
  const count = tray?.count ?? 0;
  const server = settings ? hostLabel(settings.serverUrl) : "";

  return (
    <div className="w-[340px] select-none">
      <header className="flex items-center justify-between px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-2">
          <Logo size={20} />
          <span className="text-[14px] font-semibold tracking-[-0.01em]">Open UI</span>
        </div>
        <IconButton label="Settings" onClick={() => void browser.runtime.openOptionsPage().then(() => window.close())}>
          <SettingsIcon className="size-4" strokeWidth={1.75} />
        </IconButton>
      </header>

      <section className="mx-3 divide-y divide-line rounded-xl border border-line">
        <div className="flex h-12 items-center gap-2.5 px-3">
          {account.state === "ok" ? (
            <>
              <Avatar name={account.user.name || account.user.email} image={account.user.image} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{account.user.name || account.user.email}</div>
                <div className="truncate text-[12px] text-muted">{server}</div>
              </div>
              <Dot tone="ok" />
            </>
          ) : (
            <>
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-line" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {account.state === "loading"
                    ? "Checking account…"
                    : account.state === "signed-out"
                      ? "Not connected"
                      : account.message}
                </div>
                <div className="truncate text-[12px] text-muted">{server}</div>
              </div>
              {account.state === "error" ? (
                <IconButton label="Retry" onClick={recheck}>
                  <RotateCw className="size-3.5" strokeWidth={1.75} />
                </IconButton>
              ) : null}
              {account.state !== "loading" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (!settings) return;
                    void browser.tabs.create({ url: `${settings.serverUrl}/extension/connect` });
                    window.close();
                  }}
                >
                  Connect
                </Button>
              ) : null}
            </>
          )}
        </div>
        <div className="flex h-10 items-center gap-2.5 px-3">
          <Dot tone={bridgeCopy.tone} />
          <span className="flex-1 font-medium">MCP bridge</span>
          <span className="text-muted">{bridgeCopy.label}</span>
          {bridge && ["offline", "unauthorized", "replaced"].includes(bridge.state) ? (
            <IconButton
              label="Reconnect"
              className="-mr-1.5"
              onClick={() => void sendToBackground({ type: "bridge:reconnect" })}
            >
              <RotateCw className="size-3.5" strokeWidth={1.75} />
            </IconButton>
          ) : null}
        </div>
      </section>

      <section className="space-y-2 px-3 pt-3">
        <Button
          variant="primary"
          size="lg"
          className="w-full justify-between! pr-4 pl-3.5"
          disabled={!capturable || busy !== null}
          onClick={() => void capture("full")}
        >
          <span className="flex items-center gap-2">
            {busy === "full" ? <Spinner /> : <Maximize2 className="size-4" strokeWidth={1.75} />}
            {busy === "full" ? "Capturing full page…" : "Capture full page"}
          </span>
          <Kbd>{prettyShortcut(shortcuts["capture-full"])}</Kbd>
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="lg"
            className="justify-between! pr-3.5 pl-3"
            disabled={!capturable || busy !== null}
            onClick={() => void capture("visible")}
          >
            <span className="flex items-center gap-2">
              {busy === "visible" ? <Spinner /> : <ScanLine className="size-4" strokeWidth={1.75} />}
              Visible
            </span>
            <Kbd>{prettyShortcut(shortcuts["capture-visible"])}</Kbd>
          </Button>
          <Button
            size="lg"
            className="justify-between! pr-3.5 pl-3"
            disabled={!capturable || busy !== null}
            onClick={() => void capture("element")}
          >
            <span className="flex items-center gap-2">
              <Crosshair className="size-4" strokeWidth={1.75} />
              Element
            </span>
            <Kbd>{prettyShortcut(shortcuts["capture-element"])}</Kbd>
          </Button>
        </div>
        {!capturable ? (
          <p className="px-1 pt-0.5 text-[12px] text-muted">This page can’t be captured. Open a website to start.</p>
        ) : null}
      </section>

      <section className="mx-3 mt-3 flex items-center gap-3 rounded-xl px-1 py-1">
        <div className="min-w-0 flex-1 pl-0.5">
          <div className="flex items-center gap-2 font-medium">
            Record flow
            {recording ? <span className="size-1.5 animate-pulse rounded-full bg-danger" aria-hidden /> : null}
          </div>
          <div className="text-[12px] text-muted">Each capture becomes the next step</div>
        </div>
        <Switch
          label="Record flow"
          checked={Boolean(recording)}
          onChange={(active) => void sendToBackground({ type: "recording:set", active })}
        />
      </section>

      <div className="min-h-3 px-4 pt-1.5">
        {notice ? (
          <p className={cx("truncate text-[12px]", notice.tone === "error" ? "text-danger" : "text-muted")} role="status">
            {notice.text}
          </p>
        ) : null}
      </div>

      <footer className="mt-1.5 flex items-center justify-between border-t border-line px-4 py-3">
        <span className="text-muted tabular-nums">
          <span className="font-medium text-fg">{count}</span> {count === 1 ? "shot" : "shots"} in tray
        </span>
        <Button size="sm" variant="secondary" onClick={() => openPage("/tray.html")} className="pr-2.5">
          Open tray
          <ArrowUpRight className="size-3.5" strokeWidth={1.75} />
        </Button>
      </footer>
    </div>
  );
}

function Avatar({ name, image }: { name: string; image: string | null }) {
  if (image) return <img src={image} alt="" className="size-6 shrink-0 rounded-full object-cover" />;
  return (
    <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-tile text-[11px] font-semibold uppercase">
      {name.trim().charAt(0) || "?"}
    </div>
  );
}
