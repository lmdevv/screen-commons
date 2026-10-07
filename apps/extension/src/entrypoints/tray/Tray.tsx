import {
  CATEGORIES,
  FLOW_TYPES,
  PATTERNS,
  PLATFORMS,
  labelFor,
  type PatternSlug,
} from "@open-ui/core/taxonomy";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, GripVertical, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { browser } from "wxt/browser";

import { UPLOAD_PORT, type UploadServerMessage } from "../../lib/messages";
import { notifyTrayChanged, setItem } from "../../lib/storage";
import { EMPTY_DRAFT, moveItem, reindex, type Shot, type TrayDraft } from "../../lib/tray";
import { clearShots, deleteShots, listShots, updateShots } from "../../lib/tray-db";
import { validateDraft } from "../../lib/upload-plan";
import {
  Button,
  Chip,
  Field,
  IconButton,
  Input,
  Logo,
  Select,
  Spinner,
  Switch,
  cx,
  useFieldId,
} from "../../ui/components";
import { useStorage } from "../../ui/hooks";

interface TrayShot extends Shot {
  thumbUrl: string;
}

type UploadState =
  | { phase: "idle" }
  | { phase: "running"; done: number; total: number; message: string }
  | {
      phase: "done";
      appUrl: string;
      flowUrl: string | null;
      uploaded: number;
      appName: string;
      pending: boolean;
    }
  | { phase: "error"; message: string };

function useShots(version: number | undefined) {
  const [shots, setShots] = useState<TrayShot[] | null>(null);
  useEffect(() => {
    if (version === undefined) return;
    let alive = true;
    let created: string[] = [];
    void listShots().then((list) => {
      if (!alive) return;
      created = list.map((shot) => URL.createObjectURL(shot.thumbnail));
      setShots(list.map((shot, index) => ({ ...shot, thumbUrl: created[index]! })));
    });
    return () => {
      alive = false;
      // Revoke after the next render has swapped images.
      setTimeout(() => created.forEach((url) => URL.revokeObjectURL(url)), 1000);
    };
  }, [version]);
  return [shots, setShots] as const;
}

function pathLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./u, "")}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

export function Tray() {
  const trayState = useStorage("trayState");
  const storedDraft = useStorage("draft");
  const settings = useStorage("settings");
  const [shots, setShots] = useShots(trayState?.version);
  const [draft, setDraft] = useState<TrayDraft>(EMPTY_DRAFT);
  const [upload, setUpload] = useState<UploadState>({ phase: "idle" });
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // Local edits win over storage echoes for a moment, so fast typing never loses characters.
  const lastLocalEdit = useRef(0);
  useEffect(() => {
    if (storedDraft && Date.now() - lastLocalEdit.current > 1000) setDraft(storedDraft);
  }, [storedDraft]);

  const editDraft = useCallback((patch: (draft: TrayDraft) => TrayDraft) => {
    lastLocalEdit.current = Date.now();
    setDraft((current) => {
      const next = { ...patch(current), touched: true };
      void setItem("draft", next);
      return next;
    });
  }, []);

  const editShot = useCallback(
    (id: string, patch: Partial<Pick<Shot, "title" | "patterns">>) => {
      setShots(
        (current) =>
          current?.map((shot) => (shot.id === id ? { ...shot, ...patch } : shot)) ?? null,
      );
      void updateShots([{ id, ...patch }]);
    },
    [setShots],
  );

  async function reorder(from: number, to: number) {
    if (!shots || from === to) return;
    const next = moveItem(shots, from, to);
    setShots(next);
    const changed = reindex(next);
    if (changed.length) {
      await updateShots(changed.map(({ id, order }) => ({ id, order })));
      await notifyTrayChanged();
    }
  }

  async function remove(id: string) {
    setShots((current) => current?.filter((shot) => shot.id !== id) ?? null);
    await deleteShots([id]);
    await notifyTrayChanged();
  }

  async function clearAll() {
    if (!shots?.length || !window.confirm(`Remove all ${shots.length} shots from the tray?`))
      return;
    await clearShots();
    await setItem("draft", EMPTY_DRAFT);
    await notifyTrayChanged();
  }

  function startUpload() {
    if (!shots) return;
    const appName = draft.app.name;
    setUpload({ phase: "running", done: 0, total: shots.length, message: "Starting…" });
    const port = browser.runtime.connect({ name: UPLOAD_PORT });
    port.onMessage.addListener((message: UploadServerMessage) => {
      if (message.type === "progress")
        setUpload({
          phase: "running",
          done: message.done,
          total: message.total,
          message: message.message,
        });
      else if (message.type === "done") {
        setUpload({
          phase: "done",
          appUrl: message.appUrl,
          flowUrl: message.flowUrl,
          uploaded: message.uploaded,
          appName,
          pending: message.result.screens.some((screen) => screen.status === "pending"),
        });
        lastLocalEdit.current = 0;
        setDraft(EMPTY_DRAFT);
        port.disconnect();
      } else if (message.type === "error") {
        setUpload({ phase: "error", message: message.message });
        port.disconnect();
      }
    });
    port.onDisconnect.addListener(() =>
      setUpload((current) =>
        current.phase === "running" ? { phase: "error", message: "Upload interrupted." } : current,
      ),
    );
    port.postMessage({ type: "start", draft, shotIds: shots.map((shot) => shot.id) });
  }

  const problem = useMemo(() => (shots ? validateDraft(draft, shots) : null), [draft, shots]);
  const count = shots?.length ?? 0;
  const running = upload.phase === "running";
  const missingKey = settings !== undefined && !settings.apiKey;

  function onDragOver(event: DragEvent, index: number) {
    if (!dragId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (overIndex !== index) setOverIndex(index);
  }
  function onDrop(event: DragEvent, index: number) {
    event.preventDefault();
    const from = shots?.findIndex((shot) => shot.id === dragId) ?? -1;
    setDragId(null);
    setOverIndex(null);
    if (from >= 0) void reorder(from, index);
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-2.5">
            <Logo size={20} />
            <span className="text-[14px] font-semibold tracking-[-0.01em]">Open UI</span>
            <span className="text-subtle">/</span>
            <span className="text-[14px] font-medium">Tray</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="mr-2 text-muted tabular-nums">
              {count} {count === 1 ? "shot" : "shots"}
            </span>
            <Button variant="ghost" onClick={() => void clearAll()} disabled={!count || running}>
              Clear
            </Button>
            <Button
              variant="primary"
              onClick={startUpload}
              disabled={!count || running || Boolean(problem) || missingKey}
              title={missingKey ? "Connect your account in Options first" : (problem ?? undefined)}
            >
              {running ? <Spinner /> : null}
              {running ? "Uploading…" : count > 1 ? `Upload ${count} screens` : "Upload"}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1240px] grid-cols-1 gap-10 px-6 py-8 md:grid-cols-[288px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-7 self-start md:sticky md:top-[88px]">
          <AppPanel draft={draft} editDraft={editDraft} disabled={running} />
          <FlowPanel draft={draft} editDraft={editDraft} disabled={running} count={count} />
          <UploadPanel
            upload={upload}
            problem={count ? problem : null}
            missingKey={missingKey}
            onDismiss={() => setUpload({ phase: "idle" })}
          />
        </aside>

        <section aria-label="Captured shots">
          {shots === null ? null : shots.length === 0 ? (
            upload.phase === "done" ? (
              <SuccessState upload={upload} />
            ) : (
              <EmptyState />
            )
          ) : (
            <ol className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-x-5 gap-y-7">
              {shots.map((shot, index) => (
                <li
                  key={shot.id}
                  draggable={!running}
                  onDragStart={(event) => {
                    setDragId(shot.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", shot.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverIndex(null);
                  }}
                  onDragOver={(event) => onDragOver(event, index)}
                  onDrop={(event) => onDrop(event, index)}
                  className={cx(
                    "group relative transition-opacity duration-150",
                    dragId === shot.id && "opacity-40",
                  )}
                >
                  {overIndex === index && dragId && dragId !== shot.id ? (
                    <span
                      className="absolute top-0 bottom-16 -left-3 w-0.5 rounded-full bg-fg"
                      aria-hidden
                    />
                  ) : null}
                  <ShotCard
                    shot={shot}
                    index={index}
                    total={shots.length}
                    flow={draft.flow.enabled}
                    disabled={running}
                    onEdit={(patch) => editShot(shot.id, patch)}
                    onMove={(to) => void reorder(index, to)}
                    onDelete={() => void remove(shot.id)}
                  />
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </div>
  );
}

function SectionTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-[13px] font-semibold tracking-[-0.005em]">{title}</h2>
      {children}
    </div>
  );
}

function AppPanel({
  draft,
  editDraft,
  disabled,
}: {
  draft: TrayDraft;
  editDraft: (patch: (draft: TrayDraft) => TrayDraft) => void;
  disabled: boolean;
}) {
  const nameId = useFieldId("app-name");
  const siteId = useFieldId("app-site");
  const categoryId = useFieldId("app-category");
  const setApp = (patch: Partial<TrayDraft["app"]>) =>
    editDraft((d) => ({ ...d, app: { ...d.app, ...patch } }));
  return (
    <div className="flex flex-col gap-4">
      <SectionTitle title="App" />
      <Field label="Name" htmlFor={nameId}>
        <Input
          id={nameId}
          value={draft.app.name}
          maxLength={80}
          placeholder="Linear"
          disabled={disabled}
          onChange={(e) => setApp({ name: e.target.value })}
        />
      </Field>
      <Field label="Website" htmlFor={siteId}>
        <Input
          id={siteId}
          value={draft.app.websiteUrl}
          placeholder="https://linear.app"
          inputMode="url"
          spellCheck={false}
          disabled={disabled}
          onChange={(e) => setApp({ websiteUrl: e.target.value })}
        />
      </Field>
      <Field label="Platform">
        <div
          role="radiogroup"
          aria-label="Platform"
          className="grid grid-cols-3 rounded-lg border border-line p-0.5"
        >
          {PLATFORMS.map((platform) => (
            <button
              key={platform.slug}
              type="button"
              role="radio"
              aria-checked={draft.app.platform === platform.slug}
              disabled={disabled}
              onClick={() => setApp({ platform: platform.slug })}
              className={cx(
                "h-7 rounded-md text-[12px] font-medium transition-colors duration-150",
                draft.app.platform === platform.slug
                  ? "bg-tile text-fg shadow-[inset_0_0_0_1px_var(--ou-line)]"
                  : "text-muted hover:text-fg",
              )}
            >
              {platform.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Category" htmlFor={categoryId}>
        <Select
          id={categoryId}
          value={draft.app.category}
          disabled={disabled}
          onChange={(e) => setApp({ category: e.target.value as TrayDraft["app"]["category"] })}
        >
          <option value="">No category</option>
          {CATEGORIES.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.label}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

function FlowPanel({
  draft,
  editDraft,
  disabled,
  count,
}: {
  draft: TrayDraft;
  editDraft: (patch: (draft: TrayDraft) => TrayDraft) => void;
  disabled: boolean;
  count: number;
}) {
  const nameId = useFieldId("flow-name");
  const typeId = useFieldId("flow-type");
  const setFlow = (patch: Partial<TrayDraft["flow"]>) =>
    editDraft((d) => ({ ...d, flow: { ...d.flow, ...patch } }));
  return (
    <div className="flex flex-col gap-4 border-t border-line pt-6">
      <SectionTitle title="Save as flow">
        <Switch
          label="Save as flow"
          checked={draft.flow.enabled}
          disabled={disabled}
          onChange={(enabled) => setFlow({ enabled })}
        />
      </SectionTitle>
      {draft.flow.enabled ? (
        <>
          <Field label="Flow name" htmlFor={nameId}>
            <Input
              id={nameId}
              value={draft.flow.name}
              maxLength={80}
              placeholder="Signing up"
              disabled={disabled}
              onChange={(e) => setFlow({ name: e.target.value })}
            />
          </Field>
          <Field label="Type" htmlFor={typeId}>
            <Select
              id={typeId}
              value={draft.flow.type}
              disabled={disabled}
              onChange={(e) => setFlow({ type: e.target.value as TrayDraft["flow"]["type"] })}
            >
              <option value="">No type</option>
              {FLOW_TYPES.map((type) => (
                <option key={type.slug} value={type.slug}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-[12px] leading-4 text-subtle">
            {count} {count === 1 ? "step" : "steps"} in tray order. Drag shots to reorder; titles
            become step labels.
          </p>
        </>
      ) : (
        <p className="-mt-1 text-[12px] leading-4 text-subtle">
          Upload the shots as an ordered flow, like onboarding or checkout.
        </p>
      )}
    </div>
  );
}

function UploadPanel({
  upload,
  problem,
  missingKey,
  onDismiss,
}: {
  upload: UploadState;
  problem: string | null;
  missingKey: boolean;
  onDismiss: () => void;
}) {
  if (upload.phase === "running") {
    const pct = upload.total ? Math.round((upload.done / upload.total) * 100) : 0;
    return (
      <div className="flex flex-col gap-2 border-t border-line pt-6" role="status">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-medium">{upload.message}</span>
          <span className="text-muted tabular-nums">{pct}%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-tile">
          <div
            className="h-full rounded-full bg-fg transition-[width] duration-300"
            style={{ width: `${Math.max(4, pct)}%` }}
          />
        </div>
      </div>
    );
  }
  if (upload.phase === "error") {
    return (
      <div
        className="flex items-start justify-between gap-3 border-t border-line pt-6"
        role="alert"
      >
        <p className="text-[12px] leading-4 text-danger">{upload.message}</p>
        <button
          type="button"
          className="text-[12px] font-medium text-muted hover:text-fg"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>
    );
  }
  if (missingKey) {
    return (
      <div className="flex flex-col gap-2 border-t border-line pt-6">
        <p className="text-[12px] leading-4 text-muted">Connect your Open UI account to upload.</p>
        <Button
          size="sm"
          className="self-start"
          onClick={() => void browser.runtime.openOptionsPage()}
        >
          Open settings
        </Button>
      </div>
    );
  }
  if (problem && problem !== "The tray is empty.") {
    return <p className="border-t border-line pt-6 text-[12px] leading-4 text-muted">{problem}</p>;
  }
  return null;
}

function ShotCard({
  shot,
  index,
  total,
  flow,
  disabled,
  onEdit,
  onMove,
  onDelete,
}: {
  shot: TrayShot;
  index: number;
  total: number;
  flow: boolean;
  disabled: boolean;
  onEdit: (patch: Partial<Pick<Shot, "title" | "patterns">>) => void;
  onMove: (to: number) => void;
  onDelete: () => void;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const available = PATTERNS.filter((pattern) => !shot.patterns.includes(pattern.slug));
  const aspect = shot.thumbnailWidth / shot.thumbnailHeight;
  return (
    <article>
      <div className="relative rounded-2xl bg-tile p-3">
        <div className="flex items-center justify-center" style={{ aspectRatio: "16 / 10" }}>
          <img
            src={shot.thumbUrl}
            alt=""
            width={shot.thumbnailWidth}
            height={shot.thumbnailHeight}
            draggable={false}
            className={cx(
              "max-h-full max-w-full rounded-md bg-bg object-contain object-top shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.06)]",
              aspect < 1 ? "h-full w-auto" : "h-auto w-full",
            )}
          />
        </div>
        <div className="absolute top-2 left-2 flex items-center gap-1">
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-bg px-1.5 text-[11px] font-semibold tabular-nums shadow-[0_0_0_1px_var(--ou-line)]">
            {flow ? (
              index + 1
            ) : (
              <GripVertical
                className="size-3.5 cursor-grab text-muted"
                strokeWidth={1.75}
                aria-label="Drag to reorder"
              />
            )}
          </span>
        </div>
        <div className="absolute top-2 right-2 flex items-center gap-0.5 rounded-full bg-bg p-0.5 opacity-0 shadow-[0_0_0_1px_var(--ou-line)] transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
          <IconButton
            label="Move earlier"
            className="size-6"
            disabled={disabled || index === 0}
            onClick={() => onMove(index - 1)}
          >
            <ArrowLeft className="size-3.5" strokeWidth={1.75} />
          </IconButton>
          <IconButton
            label="Move later"
            className="size-6"
            disabled={disabled || index === total - 1}
            onClick={() => onMove(index + 1)}
          >
            <ArrowRight className="size-3.5" strokeWidth={1.75} />
          </IconButton>
          <IconButton
            label="Delete shot"
            className="size-6 hover:text-danger"
            disabled={disabled}
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" strokeWidth={1.75} />
          </IconButton>
        </div>
      </div>
      <div className="mt-2.5 flex flex-col gap-2 px-0.5">
        <div>
          <input
            ref={titleRef}
            aria-label="Screen title"
            value={shot.title}
            maxLength={160}
            disabled={disabled}
            placeholder="Untitled screen"
            onChange={(e) => onEdit({ title: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && titleRef.current?.blur()}
            className="-mx-1.5 h-7 w-[calc(100%+12px)] truncate rounded-md border border-transparent bg-transparent px-1.5 font-medium text-fg placeholder:text-subtle hover:border-line focus:border-line focus:bg-field focus:outline-none"
          />
          <p className="truncate text-[12px] text-muted" title={shot.url}>
            {pathLabel(shot.url)}
            <span className="text-subtle">
              {" · "}
              <span className="tabular-nums">
                {shot.width} × {shot.height}
              </span>
              {shot.mode !== "full" ? ` · ${shot.mode}` : ""}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {shot.patterns.map((pattern) => (
            <Chip
              key={pattern}
              label={labelFor(pattern)}
              onRemove={
                disabled
                  ? undefined
                  : () => onEdit({ patterns: shot.patterns.filter((p) => p !== pattern) })
              }
            >
              {labelFor(pattern)}
            </Chip>
          ))}
          {shot.patterns.length < 8 ? (
            <label className="relative inline-flex h-6 cursor-pointer items-center rounded-full border border-dashed border-line px-2.5 text-[12px] font-medium text-muted hover:border-subtle hover:text-fg">
              + Pattern
              <select
                aria-label="Add pattern"
                value=""
                disabled={disabled}
                onChange={(e) =>
                  e.target.value &&
                  onEdit({ patterns: [...shot.patterns, e.target.value as PatternSlug] })
                }
                className="absolute inset-0 cursor-pointer opacity-0"
              >
                <option value="">Add pattern</option>
                {available.map((pattern) => (
                  <option key={pattern.slug} value={pattern.slug}>
                    {pattern.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl bg-tile px-6 text-center">
      <div className="mb-4 flex gap-1.5" aria-hidden>
        <span className="h-10 w-7 rounded-md border border-line bg-bg" />
        <span className="h-10 w-7 -translate-y-1 rounded-md border border-line bg-bg" />
        <span className="h-10 w-7 rounded-md border border-line bg-bg" />
      </div>
      <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Your tray is empty</h2>
      <p className="mt-1.5 max-w-[340px] text-muted">
        Capture pages from the toolbar popup or press{" "}
        <span className="font-medium text-fg">Alt+Shift+S</span>. Shots wait here for tagging before
        you upload them.
      </p>
    </div>
  );
}

function SuccessState({ upload }: { upload: Extract<UploadState, { phase: "done" }> }) {
  return (
    <div
      className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl bg-tile px-6 text-center"
      role="status"
    >
      <span className="mb-4 flex size-9 items-center justify-center rounded-full bg-fg text-bg">
        <Check className="size-4.5" strokeWidth={2.25} />
      </span>
      <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
        Uploaded {upload.uploaded} {upload.uploaded === 1 ? "screen" : "screens"}
        {upload.appName ? ` to ${upload.appName}` : ""}
      </h2>
      <p className="mt-1.5 text-muted">
        {upload.pending
          ? "They’ll appear in the library once an admin approves them."
          : "They’re live in the library now."}
      </p>
      <div className="mt-5 flex gap-2">
        <Button variant="primary" onClick={() => void browser.tabs.create({ url: upload.appUrl })}>
          View app
          <ArrowUpRight className="size-3.5" strokeWidth={1.75} />
        </Button>
        {upload.flowUrl ? (
          <Button onClick={() => void browser.tabs.create({ url: upload.flowUrl! })}>
            View flow
            <ArrowUpRight className="size-3.5" strokeWidth={1.75} />
          </Button>
        ) : null}
      </div>
      <a
        href={upload.appUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-3 text-[12px] text-subtle hover:text-fg"
        data-testid="app-link"
      >
        {upload.appUrl}
      </a>
    </div>
  );
}
