import { Button } from "@open-ui/ui/components/button";
import { Input } from "@open-ui/ui/components/input";
import { Label } from "@open-ui/ui/components/label";
import { Textarea } from "@open-ui/ui/components/textarea";
import { useQuery } from "@tanstack/react-query";
import { useCreateStore, useSelector } from "@tanstack/react-store";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CircleAlert,
  FileImage,
  GripVertical,
  LoaderCircle,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { capture } from "../../lib/analytics";

import {
  createDraft,
  createId,
  MAX_FLOW_IMAGES,
  moveDraftItem,
  restoreDraft,
  validateDraft,
} from "./draft";
import { saveRecoverableDraft } from "./draft-storage";
import { submissionAdapter } from "./server-adapter";
import { processImagesSequentially } from "./image-processing";
import type {
  ContributionDraft,
  DraftItem,
  SubmissionAdapter,
  SubmissionKind,
  UploadSnapshot,
} from "./types";

const ACTIVE_DRAFT_ID = "draft_current";

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function updateItem(draft: ContributionDraft, id: string, update: Partial<DraftItem>) {
  return {
    ...draft,
    items: draft.items.map((item) => (item.id === id ? { ...item, ...update } : item)),
    updatedAt: new Date().toISOString(),
  };
}

interface DraftEditorProps {
  adapter?: SubmissionAdapter;
}

export function DraftEditor({ adapter = submissionAdapter }: DraftEditorProps) {
  const initialDraft = { ...createDraft("flow"), id: ACTIVE_DRAFT_ID };
  const draftStore = useCreateStore({
    draft: initialDraft,
    recoveryNotice: null as string | null,
  });
  const draft = useSelector(draftStore, (state) => state.draft);
  const recoveryNotice = useSelector(draftStore, (state) => state.recoveryNotice);
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");
  const [validationIssues, setValidationIssues] = useState<string[]>([]);
  const [upload, setUpload] = useState<UploadSnapshot>({ items: [], state: "idle" });
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const abortUploadRef = useRef<AbortController | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useQuery({
    queryKey: ["contribution-draft", ACTIVE_DRAFT_ID],
    queryFn: async () => {
      const saved = await adapter.loadDraft(ACTIVE_DRAFT_ID);
      if (saved) {
        const restored = restoreDraft(saved);
        draftStore.setState((state) => ({
          ...state,
          draft: restored,
          recoveryNotice:
            restored.items.length > 0
              ? "Draft details were restored. For privacy, source images are not stored; reselect each file before submitting."
              : null,
        }));
      }
      return saved;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const updateDraft = (
    update: ContributionDraft | ((current: ContributionDraft) => ContributionDraft),
  ) => {
    let nextDraft = draft;
    draftStore.setState((state) => {
      nextDraft = typeof update === "function" ? update(state.draft) : update;
      return { ...state, draft: nextDraft };
    });
    if (upload.state === "complete") return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void saveRecoverableDraft(adapter, nextDraft), 350);
  };

  const clearRecoveryNotice = () =>
    draftStore.setState((state) => ({ ...state, recoveryNotice: null }));

  const setKind = (kind: SubmissionKind) => {
    updateDraft((current) => ({
      ...current,
      flowName: kind === "standalone" ? "" : current.flowName,
      items: kind === "standalone" ? current.items.slice(0, 1) : current.items,
      kind,
      updatedAt: new Date().toISOString(),
    }));
    setValidationIssues([]);
  };

  const processFiles = async (files: File[], replacementItemId?: string) => {
    if (files.length === 0) return;
    const allowed = replacementItemId
      ? 1
      : draft.kind === "standalone"
        ? Math.max(0, 1 - draft.items.length)
        : Math.max(0, MAX_FLOW_IMAGES - draft.items.length);
    const accepted = files.slice(0, allowed);
    if (accepted.length === 0) {
      setValidationIssues([
        draft.kind === "standalone"
          ? "A standalone submission can contain only one screenshot."
          : "A flow can contain at most 50 screenshots.",
      ]);
      return;
    }

    const ids = accepted.map(() => replacementItemId ?? createId());
    if (replacementItemId) {
      updateDraft((current) =>
        updateItem(current, replacementItemId, {
          artifact: undefined,
          error: undefined,
          fileName: accepted[0]?.name ?? "",
          previewUrl: undefined,
          progress: 0,
          status: "queued",
        }),
      );
    } else {
      updateDraft((current) => ({
        ...current,
        items: [
          ...current.items,
          ...accepted.map((file, index): DraftItem => ({
            fileName: file.name,
            id: ids[index] ?? createId(),
            notes: "",
            order: current.items.length + index + 1,
            progress: 0,
            status: "queued",
            title: file.name.replace(/\.[^.]+$/, "").replaceAll(/[-_]+/g, " "),
          })),
        ],
        updatedAt: new Date().toISOString(),
      }));
    }

    setIsProcessing(true);
    const results = await processImagesSequentially(accepted, (index, progress) => {
      const id = ids[index];
      if (!id) return;
      updateDraft((current) =>
        updateItem(current, id, { progress: progress.percent, status: progress.phase }),
      );
    });

    results.forEach((result, index) => {
      const id = ids[index];
      if (!id) return;
      if (result.image) {
        const previewUrl = URL.createObjectURL(result.image.thumbnail.blob);
        updateDraft((current) =>
          updateItem(current, id, {
            artifact: result.image,
            error: undefined,
            fileName: result.file.name,
            previewUrl,
            progress: 100,
            status: "ready",
          }),
        );
      } else {
        updateDraft((current) =>
          updateItem(current, id, { error: result.error, progress: 0, status: "error" }),
        );
      }
    });
    setIsProcessing(false);
    clearRecoveryNotice();
  };

  const removeItem = (id: string) => {
    updateDraft((current) => {
      const removed = current.items.find((item) => item.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return {
        ...current,
        items: current.items
          .filter((item) => item.id !== id)
          .map((item, index) => ({ ...item, order: index + 1 })),
      };
    });
  };

  const reorder = (id: string, direction: -1 | 1) => {
    updateDraft((current) => {
      const reordered = moveDraftItem(current.items, id, direction);
      const moved = reordered.find((item) => item.id === id);
      if (moved)
        setReorderAnnouncement(
          `${moved.title || moved.fileName} moved to position ${moved.order}.`,
        );
      return { ...current, items: reordered, updatedAt: new Date().toISOString() };
    });
  };

  const submit = async () => {
    const issues = validateDraft(draft);
    setValidationIssues(issues);
    if (issues.length > 0) return;
    const controller = new AbortController();
    capture("upload_started", { itemCount: draft.items.length, kind: draft.kind });
    abortUploadRef.current = controller;
    try {
      const submission = await adapter.submit(draft, setUpload, controller.signal);
      capture("upload_completed", { itemCount: draft.items.length, kind: draft.kind });
      capture("submission_created", { itemCount: draft.items.length, kind: draft.kind });
      setSubmittedId(submission.id);
    } catch (error) {
      if (controller.signal.aborted) {
        setUpload((current) => ({
          ...current,
          error: "Upload cancelled. Your draft is still saved.",
          state: "error",
        }));
      } else {
        setUpload((current) => ({
          ...current,
          error:
            error instanceof Error ? error.message : "Upload failed. Your draft is still saved.",
          state: "error",
        }));
      }
    }
  };

  const reset = async () => {
    draft.items.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
    await adapter.clearDraft(ACTIVE_DRAFT_ID);
    updateDraft({ ...createDraft(draft.kind), id: ACTIVE_DRAFT_ID });
    clearRecoveryNotice();
    setValidationIssues([]);
    setUpload({ items: [], state: "idle" });
    setSubmittedId(null);
  };

  if (submittedId) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-6 py-20 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-400">
          <Check className="size-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-xl font-semibold">Submission received</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Deterministic checks are complete. This submission is now waiting for a human review.
          </p>
        </div>
        <div className="flex gap-2">
          <Button render={<a href="/submissions" />}>View my submissions</Button>
          <Button variant="outline" onClick={() => void reset()}>
            Create another
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Reference: {submittedId}</p>
      </div>
    );
  }

  const isUploading =
    upload.state === "preparing" || upload.state === "uploading" || upload.state === "finalizing";

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
            Contribute
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Add UI references</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Upload a focused screen or an ordered journey. Images are validated and converted
            locally before upload.
          </p>
        </div>
        <Button variant="ghost" onClick={() => void reset()} disabled={isUploading}>
          <RotateCcw aria-hidden="true" /> Reset draft
        </Button>
      </div>

      {recoveryNotice ? (
        <div className="mb-5 flex gap-3 border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{recoveryNotice}</p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <section className="space-y-6">
          <div className="border bg-card p-4">
            <fieldset>
              <legend className="mb-3 text-xs font-medium">Submission type</legend>
              <div className="grid grid-cols-2 gap-2">
                {(["flow", "standalone"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={draft.kind === kind}
                    className="border p-3 text-left text-xs transition-colors hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-muted"
                    onClick={() => setKind(kind)}
                    disabled={isUploading}
                  >
                    <span className="block font-medium">
                      {kind === "flow" ? "Ordered flow" : "Standalone screen"}
                    </span>
                    <span className="mt-1 block text-muted-foreground">
                      {kind === "flow"
                        ? "A sequence of up to 50 screens"
                        : "One reusable interface reference"}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="grid gap-4 border bg-card p-4 sm:grid-cols-2">
            <Field label="Product name" required>
              <Input
                value={draft.productName}
                placeholder="e.g. Linear"
                onChange={(event) =>
                  updateDraft((current) => ({ ...current, productName: event.target.value }))
                }
                disabled={isUploading}
              />
            </Field>
            {draft.kind === "flow" ? (
              <Field label="Flow name" required>
                <Input
                  value={draft.flowName}
                  placeholder="e.g. Create an issue"
                  onChange={(event) =>
                    updateDraft((current) => ({ ...current, flowName: event.target.value }))
                  }
                  disabled={isUploading}
                />
              </Field>
            ) : (
              <Field label="Product version">
                <Input
                  value={draft.productVersion}
                  placeholder="Optional release or date"
                  onChange={(event) =>
                    updateDraft((current) => ({ ...current, productVersion: event.target.value }))
                  }
                  disabled={isUploading}
                />
              </Field>
            )}
            {draft.kind === "flow" ? (
              <Field label="Product version">
                <Input
                  value={draft.productVersion}
                  placeholder="Optional release or date"
                  onChange={(event) =>
                    updateDraft((current) => ({ ...current, productVersion: event.target.value }))
                  }
                  disabled={isUploading}
                />
              </Field>
            ) : null}
            <Field label="Capture date" required>
              <Input
                type="date"
                value={draft.captureDate}
                onChange={(event) =>
                  updateDraft((current) => ({ ...current, captureDate: event.target.value }))
                }
                disabled={isUploading}
              />
            </Field>
            <Field
              label="Source URL"
              required
              className={draft.kind === "standalone" ? "sm:col-span-2" : undefined}
            >
              <Input
                type="url"
                value={draft.sourceUrl}
                placeholder="https://…"
                onChange={(event) =>
                  updateDraft((current) => ({ ...current, sourceUrl: event.target.value }))
                }
                disabled={isUploading}
              />
            </Field>
            <Field label="Tags" className="sm:col-span-2" hint="Separate tags with commas.">
              <Input
                value={draft.tags.join(", ")}
                placeholder="onboarding, dashboard, settings"
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    tags: event.target.value.split(",").map((tag) => tag.trimStart()),
                  }))
                }
                disabled={isUploading}
              />
            </Field>
          </div>

          <section className="border bg-card">
            <div className="flex items-center justify-between gap-4 border-b p-4">
              <div>
                <h2 className="text-sm font-medium">Screens</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  JPEG, PNG, or WebP · 15 MB and 20 MP maximum · processed one at a time
                </p>
              </div>
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/80 has-[:disabled]:pointer-events-none has-[:disabled]:opacity-50">
                <Plus className="size-4" aria-hidden="true" /> Add{" "}
                {draft.kind === "flow" ? "screens" : "screen"}
                <input
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple={draft.kind === "flow"}
                  disabled={
                    isProcessing ||
                    isUploading ||
                    (draft.kind === "standalone" && draft.items.length > 0)
                  }
                  onChange={(event) => {
                    void processFiles(Array.from(event.target.files ?? []));
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>

            {draft.items.length === 0 ? (
              <label className="m-4 grid min-h-56 cursor-pointer place-items-center border border-dashed text-center hover:bg-muted/40">
                <span className="flex max-w-sm flex-col items-center p-8">
                  <FileImage className="mb-3 size-7 text-muted-foreground" aria-hidden="true" />
                  <span className="text-sm font-medium">Choose screenshots</span>
                  <span className="mt-1 text-xs text-muted-foreground">
                    Full-page captures may need to be split into focused screens.
                  </span>
                </span>
                <input
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple={draft.kind === "flow"}
                  onChange={(event) => void processFiles(Array.from(event.target.files ?? []))}
                />
              </label>
            ) : (
              <ol className="divide-y">
                {draft.items.map((item, index) => (
                  <li
                    key={item.id}
                    className="grid gap-3 p-4 sm:grid-cols-[6rem_minmax(0,1fr)_auto]"
                    onKeyDown={(event) => {
                      if (!event.altKey) return;
                      if (event.key === "ArrowUp" && index > 0) {
                        event.preventDefault();
                        reorder(item.id, -1);
                      }
                      if (event.key === "ArrowDown" && index < draft.items.length - 1) {
                        event.preventDefault();
                        reorder(item.id, 1);
                      }
                    }}
                  >
                    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted">
                      {item.previewUrl ? (
                        <img src={item.previewUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <FileImage className="size-5 text-muted-foreground" aria-hidden="true" />
                      )}
                      <span className="absolute top-1 left-1 bg-background/90 px-1.5 py-0.5 text-[10px] font-medium">
                        {index + 1}
                      </span>
                    </div>
                    <div className="min-w-0 space-y-2">
                      <Input
                        aria-label={`Title for screen ${index + 1}`}
                        value={item.title}
                        placeholder="Screen title"
                        disabled={isUploading}
                        onChange={(event) =>
                          updateDraft((current) =>
                            updateItem(current, item.id, { title: event.target.value }),
                          )
                        }
                      />
                      <Textarea
                        aria-label={`Notes for screen ${index + 1}`}
                        value={item.notes}
                        placeholder="What is happening in this step?"
                        className="min-h-16 text-xs"
                        disabled={isUploading}
                        onChange={(event) =>
                          updateDraft((current) =>
                            updateItem(current, item.id, { notes: event.target.value }),
                          )
                        }
                      />
                      <div className="text-[11px] text-muted-foreground">
                        {item.status === "ready" && item.artifact ? (
                          <span className="text-emerald-400">
                            Ready · {item.artifact.full.width}×{item.artifact.full.height} ·{" "}
                            {formatBytes(item.artifact.full.byteLength)}
                          </span>
                        ) : item.status === "error" ? (
                          <span className="text-red-400">{item.error}</span>
                        ) : item.progress > 0 ? (
                          <span>
                            {item.status} · {item.progress}%
                          </span>
                        ) : (
                          <span>File required to resume this screen.</span>
                        )}
                      </div>
                      {item.status !== "ready" || !item.artifact ? (
                        <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium underline underline-offset-4">
                          <Upload className="size-3" aria-hidden="true" /> Select file again
                          <input
                            className="sr-only"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            disabled={isProcessing || isUploading}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void processFiles([file], item.id);
                            }}
                          />
                        </label>
                      ) : null}
                    </div>
                    <div className="flex items-start gap-1">
                      {draft.kind === "flow" ? (
                        <>
                          <GripVertical
                            className="mt-2 size-4 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Move ${item.title || item.fileName} up`}
                            title="Move up (Alt+Arrow Up)"
                            disabled={index === 0 || isUploading}
                            onClick={() => reorder(item.id, -1)}
                          >
                            <ArrowUp />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Move ${item.title || item.fileName} down`}
                            title="Move down (Alt+Arrow Down)"
                            disabled={index === draft.items.length - 1 || isUploading}
                            onClick={() => reorder(item.id, 1)}
                          >
                            <ArrowDown />
                          </Button>
                        </>
                      ) : null}
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remove ${item.title || item.fileName}`}
                        disabled={isUploading}
                        onClick={() => removeItem(item.id)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <p className="sr-only" aria-live="polite">
              {reorderAnnouncement}
            </p>
          </section>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="border bg-card p-4">
            <h2 className="text-sm font-medium">Before you submit</h2>
            <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
              <li>Remove names, email addresses, tokens, and private account data.</li>
              <li>Use concise titles that explain each step.</li>
              <li>Put flow screens in the order a person sees them.</li>
            </ul>
            <label className="mt-4 flex cursor-pointer items-start gap-2 border-t pt-4 text-xs">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={draft.rightsConfirmed}
                disabled={isUploading}
                onChange={(event) =>
                  updateDraft((current) => ({ ...current, rightsConfirmed: event.target.checked }))
                }
              />
              <span>
                I may share these images and have removed personal or confidential information.
              </span>
            </label>
          </div>

          {validationIssues.length > 0 ? (
            <div className="border border-red-500/30 bg-red-500/5 p-4" role="alert">
              <h2 className="text-xs font-medium text-red-300">Check this draft</h2>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-red-200/80">
                {validationIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {upload.state !== "idle" ? (
            <div className="border bg-card p-4" aria-live="polite">
              <div className="flex items-center justify-between gap-2 text-xs font-medium">
                <span>
                  {upload.state === "error" ? "Upload interrupted" : "Preparing submission"}
                </span>
                {isUploading ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
              </div>
              <div className="mt-3 space-y-2">
                {upload.items.map((item, index) => (
                  <div key={item.itemId}>
                    <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                      <span>
                        Screen {index + 1} · {item.state.replaceAll("_", " ")}
                      </span>
                      <span>{item.progress}%</span>
                    </div>
                    <div className="h-1 overflow-hidden bg-muted">
                      <div
                        className="h-full bg-foreground transition-[width]"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {upload.error ? <p className="mt-3 text-xs text-red-300">{upload.error}</p> : null}
            </div>
          ) : null}

          <Button
            className="w-full"
            size="lg"
            disabled={isProcessing || isUploading}
            onClick={() => void submit()}
          >
            {isUploading ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <Upload aria-hidden="true" />
            )}
            {isUploading ? "Uploading…" : "Submit for review"}
          </Button>
          {isUploading ? (
            <Button
              className="w-full"
              variant="outline"
              onClick={() => abortUploadRef.current?.abort()}
            >
              Cancel upload
            </Button>
          ) : null}
          <p className="text-center text-[11px] text-muted-foreground">
            Demo mode stores metadata in this browser and makes no network upload.
          </p>
        </aside>
      </div>
    </main>
  );
}

function Field({
  children,
  className,
  hint,
  label,
  required,
}: {
  children: ReactNode;
  className?: string;
  hint?: string;
  label: string;
  required?: boolean;
}) {
  return (
    <Label className={`grid gap-1.5 text-xs ${className ?? ""}`}>
      <span>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="font-normal text-muted-foreground">{hint}</span> : null}
    </Label>
  );
}
