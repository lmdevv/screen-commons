import type { CreateScreenInput, Screen, ScreenDetail } from "@screen-commons/core";
import type { Platform } from "@screen-commons/core/taxonomy";
import {
  Button,
  Container,
  PageHeader,
  Steps,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  pluralize,
  type RejectedFile,
} from "@screen-commons/ui";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";

import { errorMessage, notify } from "../../lib/toast";
import { updateScreen, updateFlow } from "../../server/functions";
import { loadDraft, saveDraft } from "./draft-storage";
import { findLibraryMatches, visualFingerprint } from "./library-duplicates";
import { ImageValidationError } from "./image-processing";
import {
  MAX_SCREENS,
  STEPS,
  findDuplicates,
  frameKindOf,
  initialState,
  isSkipped,
  isValidUrl,
  normalizeUrl,
  suggestPatternsFromText,
  titleFromFilename,
  type Draft,
  type WizardState,
} from "./model";
import { processImage } from "./process-client";
import { StepApp } from "./step-app";
import { StepReview, SubmitSuccess } from "./step-review";
import { StepScreens } from "./step-screens";
import { StepUpload } from "./step-upload";
import { createFlow, uploadScreen } from "./upload";

function keepUploadable(drafts: Draft[]): Draft[] {
  const duplicates = findDuplicates(drafts);
  return drafts.filter((d) => d.status === "ready" && !isSkipped(d, duplicates));
}

/** Screens uploaded in parallel: each request's time is mostly server round trips, not bytes. */
const UPLOAD_CONCURRENCY = 4;

export function ContributeWizard({ isAdmin, userId }: { isAdmin: boolean; userId: string }) {
  const queryClient = useQueryClient();
  const [state, renderState] = useState<WizardState>(initialState);
  const [showErrors, setShowErrors] = useState(false);
  const stateRef = useRef(state);
  const setState = useCallback((update: SetStateAction<WizardState>) => {
    const next = typeof update === "function" ? update(stateRef.current) : update;
    stateRef.current = next;
    renderState(next);
  }, []);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [saved, setSaved] = useState(false);
  const [tabLocked, setTabLocked] = useState(false);
  const [checkingLibrary, setCheckingLibrary] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [checkVersion, setCheckVersion] = useState(0);
  const [discardOpen, setDiscardOpen] = useState(false);
  const ownsLock = useRef(false);

  const saveQueue = useRef(Promise.resolve());
  const controller = useRef<AbortController | null>(null);
  const processingVersions = useRef(new Map<string, number>());
  const mounted = useRef(true);
  const submitLock = useRef(false);
  const persist = useCallback(() => {
    const snapshot = stateRef.current;
    setSaved(false);
    const job = saveQueue.current.catch(() => {}).then(() => saveDraft(userId, snapshot));
    saveQueue.current = job;
    void job.then(
      () => {
        if (mounted.current) {
          setSaved(true);
          setStorageError("");
        }
      },
      () => {
        if (mounted.current)
          setStorageError(
            "Your browser couldn’t save this draft. Keep this tab open or free up browser storage.",
          );
      },
    );
    return job;
  }, [userId]);
  const headingRef = useRef<HTMLDivElement>(null);

  const { step, drafts, platform, submit } = state;
  const duplicates = useMemo(() => findDuplicates(drafts), [drafts]);
  const ready = drafts.filter((d) => d.status === "ready" && !isSkipped(d, duplicates));
  const processing = drafts.some((d) => d.status === "processing");

  const patchDraft = useCallback((id: string, patch: Partial<Draft>) => {
    setState((s) => ({
      ...s,
      drafts: s.drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }));
  }, []);

  const runProcessing = useCallback(
    (draft: Draft, kind: "web" | "mobile") => {
      const version = (processingVersions.current.get(draft.id) ?? 0) + 1;
      processingVersions.current.set(draft.id, version);
      processImage(draft.file, kind)
        .then((processed) => {
          const current = stateRef.current.drafts.find((d) => d.id === draft.id);
          if (!current || !mounted.current || processingVersions.current.get(draft.id) !== version)
            return;
          const previewUrl = URL.createObjectURL(processed.thumbnail);
          URL.revokeObjectURL(current.previewUrl);
          patchDraft(draft.id, { status: "ready", processed, previewUrl, error: undefined });
        })
        .catch((error: unknown) => {
          if (!mounted.current || processingVersions.current.get(draft.id) !== version) return;
          patchDraft(draft.id, {
            status: "invalid",
            error:
              error instanceof ImageValidationError ? error.message : "Couldn’t read this image",
          });
        });
    },
    [patchDraft],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const room = MAX_SCREENS - stateRef.current.drafts.length;
      if (room <= 0) return;
      if (files.length > room) notify.message(`Only the first ${room} images were added`);
      const kind = frameKindOf(stateRef.current.platform);
      const added: Draft[] = files.slice(0, room).map((file) => {
        const name = file.name || "Pasted image.png";
        const title = titleFromFilename(name).slice(0, 160);
        return {
          id: crypto.randomUUID(),
          file,
          name,
          previewUrl: URL.createObjectURL(file),
          status: "processing",
          title,
          patterns: suggestPatternsFromText(title),
          elements: [],
          stepLabel: "",
          upload: { status: "queued", progress: 0 },
        };
      });
      setState((s) => ({ ...s, drafts: [...s.drafts, ...added] }));
      for (const draft of added) runProcessing(draft, kind);
    },
    [runProcessing],
  );

  const onReject = useCallback((rejected: RejectedFile[]) => {
    for (const { file, reason } of rejected.slice(0, 3)) {
      notify.error(
        reason === "size"
          ? `${file.name} is larger than 15 MB`
          : `${file.name} isn’t a PNG, JPEG or WebP`,
      );
    }
  }, []);

  const removeDraft = (id: string) => {
    const draft = state.drafts.find((d) => d.id === id);
    if (draft) URL.revokeObjectURL(draft.previewUrl);
    setState((s) => ({ ...s, drafts: s.drafts.filter((d) => d.id !== id) }));
  };

  const changePlatform = (next: Platform) => {
    const changedKind = frameKindOf(next) !== frameKindOf(state.platform);
    setState((s) => ({
      ...s,
      platform: next,
      // App lists are per platform.
      app: s.app?.mode === "existing" && s.app.app.platform !== next ? null : s.app,
      drafts: changedKind
        ? s.drafts.map((d) => (d.status === "ready" ? { ...d, status: "processing" } : d))
        : s.drafts,
    }));
    // Thumbnail crops differ between desktop and phone frames.
    if (changedKind) {
      for (const draft of state.drafts)
        if (draft.status === "ready") runProcessing(draft, frameKindOf(next));
    }
  };

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    let restoredStorage = false;
    let owns = false;
    const waiting = new AbortController();
    ownsLock.current = false;
    setStorageReady(false);
    setTabLocked(false);
    let release: (() => void) | undefined;
    const restore = async () => {
      try {
        const restored = await loadDraft(userId);
        if (cancelled) {
          for (const d of restored?.drafts ?? []) URL.revokeObjectURL(d.previewUrl);
          return;
        }
        if (restored) {
          setState(restored);
          notify.message("Your saved contribution was restored");
          for (const draft of restored.drafts)
            if (draft.status === "processing") runProcessing(draft, frameKindOf(restored.platform));
        }
      } catch {
        setStorageError(
          "Your saved draft couldn’t be restored. Browser storage may be unavailable.",
        );
      }
      if (!cancelled) {
        restoredStorage = true;
        setStorageReady(true);
      }
    };
    if (navigator.locks) {
      setTabLocked(true);
      setStorageReady(true);
      void navigator.locks
        .request(`screen-commons-draft:${userId}`, { signal: waiting.signal }, async () => {
          if (cancelled) return;
          owns = true;
          ownsLock.current = true;
          setTabLocked(false);
          setStorageReady(false);
          const held = new Promise<void>((resolve) => {
            release = resolve;
          });
          await restore();
          await held;
        })
        .catch(() => {});
    } else {
      owns = true;
      ownsLock.current = true;
      void restore();
    }
    return () => {
      cancelled = true;
      waiting.abort();
      mounted.current = false;
      controller.current?.abort();
      if (owns && restoredStorage)
        void persist()
          .catch(() => {})
          .finally(() => release?.());
      else release?.();
      for (const draft of stateRef.current.drafts) URL.revokeObjectURL(draft.previewUrl);
    };
  }, [userId, runProcessing, setState, persist]);

  useEffect(() => {
    if (!storageReady || tabLocked) return;
    setSaved(false);
    const timer = setTimeout(() => void persist().catch(() => {}), 250);
    return () => clearTimeout(timer);
  }, [state, storageReady, tabLocked, persist]);

  useEffect(() => {
    if (!drafts.length || submit.phase === "done") return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (ownsLock.current) void persist().catch(() => {});
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [drafts.length, submit.phase, persist]);

  const libraryApp = JSON.stringify(
    state.app?.mode === "existing"
      ? { slug: state.app.app.slug, platform: state.platform }
      : { name: state.newApp.name, websiteUrl: state.newApp.websiteUrl, platform: state.platform },
  );
  const signatureKey = drafts
    .filter((d) => d.status === "ready")
    .map((d) => `${d.id}:${d.processed?.imageHash}`)
    .join(",");
  useEffect(() => {
    if (!state.app || !storageReady || state.submit.started || processing || !drafts.length) return;
    const abort = new AbortController();
    let active = true;
    setCheckingLibrary(true);
    setLibraryError("");
    setState((s) => ({ ...s, drafts: s.drafts.map((d) => ({ ...d, libraryMatch: undefined })) }));
    const app =
      state.app?.mode === "existing"
        ? { name: state.app.app.name, slug: state.app.app.slug, platform: state.platform }
        : {
            name: state.newApp.name.trim(),
            websiteUrl: state.newApp.websiteUrl.trim()
              ? normalizeUrl(state.newApp.websiteUrl)
              : undefined,
            platform: state.platform,
          };
    if (!app.name || (app.websiteUrl && !isValidUrl(app.websiteUrl))) {
      setCheckingLibrary(false);
      return;
    }
    void findLibraryMatches(app, stateRef.current.drafts, abort.signal, (id, screen) => {
      if (active) patchDraft(id, { libraryMatch: screen });
    })
      .catch(() => {
        if (active)
          setLibraryError(
            "Existing screenshots couldn’t be checked. You can retry the check or continue; exact repeats are still reused by the server.",
          );
      })
      .finally(() => {
        if (active) setCheckingLibrary(false);
      });
    return () => {
      active = false;
      abort.abort();
    };
  }, [
    libraryApp,
    signatureKey,
    storageReady,
    processing,
    state.submit.started,
    patchDraft,
    setState,
    checkVersion,
  ]);

  const appValid =
    state.app?.mode === "existing" ||
    (state.app?.mode === "new" &&
      state.newApp.name.trim().length > 0 &&
      (!state.newApp.websiteUrl.trim() || isValidUrl(normalizeUrl(state.newApp.websiteUrl))));
  const flowValid = !state.flow.enabled || ready.length < 2 || state.flow.name.trim().length > 0;

  const stepValid =
    [ready.length > 0 && !processing, appValid, ready.length > 0 && flowValid, ready.length > 0][
      step
    ] ?? false;
  const blockedReason =
    step === 0
      ? processing
        ? "Processing images…"
        : ready.length === 0
          ? "Add at least one screenshot"
          : null
      : step === 1 && !state.app
        ? "Pick or create an app"
        : step === 2 && !ready.length
          ? "Keep at least one screenshot"
          : null;

  function goTo(next: number) {
    if (stateRef.current.submit.started && next < 2) return;
    setShowErrors(false);
    setState((s) => ({
      ...s,
      step: next,
      // Images that failed validation, and repeats of an earlier image, are dropped once you
      // move on.
      drafts: next > 0 ? keepUploadable(s.drafts) : s.drafts,
    }));
    requestAnimationFrame(() => {
      headingRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    });
  }

  function onContinue() {
    if (!stepValid) {
      setShowErrors(true);
      return;
    }
    goTo(step + 1);
  }

  async function onSubmit() {
    const current = { ...stateRef.current, drafts: stateRef.current.drafts.map((d) => ({ ...d })) };
    if (
      submitLock.current ||
      current.submit.phase === "uploading" ||
      !current.app ||
      !ready.length ||
      processing ||
      !appValid ||
      !flowValid
    )
      return;
    submitLock.current = true;
    const abort = new AbortController();
    controller.current = abort;
    const submissionId = current.submit.submissionId ?? crypto.randomUUID();
    setState((s) => ({
      ...s,
      submit: {
        ...s.submit,
        phase: "uploading",
        paused: false,
        started: true,
        submissionId,
        flowError: undefined,
      },
    }));

    await persist().catch(() => {});
    try {
      const base: CreateScreenInput["app"] =
        current.app.mode === "existing"
          ? { slug: current.app.app.slug, name: current.app.app.name, platform: current.platform }
          : {
              name: current.newApp.name.trim(),
              platform: current.platform,
              websiteUrl: current.newApp.websiteUrl.trim()
                ? normalizeUrl(current.newApp.websiteUrl)
                : undefined,
              category: current.newApp.category || undefined,
              tagline: current.newApp.tagline.trim() || undefined,
            };
      let appInput = base;
      // Re-check the successful part of a resumed batch: it may have been edited, deleted,
      // or rejected while this draft was closed. Network failures never erase saved results.
      const uploaded = new Map<string, Screen>();
      const doneDrafts = current.drafts.filter((d) => d.upload.screen);
      let doneIndex = 0;
      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_CONCURRENCY, doneDrafts.length) }, async () => {
          for (let draft = doneDrafts[doneIndex++]; draft; draft = doneDrafts[doneIndex++]) {
            const previous = draft.upload.screen!;
            const response = await fetch(`/api/v1/screens/${previous.id}`, {
              signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30_000)]),
            });
            if (response.status === 404 || response.status === 403) {
              draft.upload = { status: "queued", progress: 0 };
              patchDraft(draft.id, { upload: draft.upload });
              continue;
            }
            if (!response.ok)
              throw new Error(
                "Finished screens couldn’t be checked. Retry when your connection or session is restored.",
              );
            const fresh = (await response.json()) as ScreenDetail;
            if (fresh.status === "rejected") {
              draft.upload = { status: "queued", progress: 0 };
              patchDraft(draft.id, { upload: draft.upload });
              continue;
            }
            if (!fresh.owned || (draft.title.trim() || null) === previous.title)
              draft.title = fresh.title ?? "";
            if (
              !fresh.owned ||
              JSON.stringify(draft.patterns) === JSON.stringify(previous.patterns)
            )
              draft.patterns = fresh.patterns;
            if (
              !fresh.owned ||
              JSON.stringify(draft.elements) === JSON.stringify(previous.elements)
            )
              draft.elements = fresh.elements;
            uploaded.set(draft.id, fresh);
            draft.upload = { status: "done", progress: 1, screen: fresh };
            patchDraft(draft.id, {
              title: draft.title,
              patterns: draft.patterns,
              elements: draft.elements,
              upload: draft.upload,
            });
          }
        }),
      );
      const firstDone = uploaded.values().next().value;
      if (firstDone)
        appInput = {
          slug: firstDone.app.slug,
          name: firstDone.app.name,
          platform: current.platform,
        };
      let failed = false;
      const uploadOne = async (draft: Draft, processed: NonNullable<Draft["processed"]>) => {
        patchDraft(draft.id, { upload: { status: "uploading", progress: 0 } });
        try {
          if (abort.signal.aborted) throw new DOMException("Upload paused", "AbortError");
          const screen = await uploadScreen(
            {
              image: processed.image,
              thumbnail: processed.thumbnail,
              meta: {
                app: appInput,
                title: draft.title.trim() || undefined,
                patterns: draft.patterns,
                elements: draft.elements,
                width: processed.imageWidth,
                height: processed.imageHeight,
                dominantColor: processed.dominantColor,
                source: "upload",
                visualFingerprint: visualFingerprint(draft),
              },
            },
            (progress) => patchDraft(draft.id, { upload: { status: "uploading", progress } }),
            abort.signal,
          );
          uploaded.set(draft.id, screen);
          patchDraft(draft.id, {
            upload: { status: "done", progress: 1, screen },
            ...(!screen.owned
              ? { title: screen.title ?? "", patterns: screen.patterns, elements: screen.elements }
              : {}),
          });
          await persist().catch(() => {});
          appInput = { slug: screen.app.slug, name: screen.app.name, platform: current.platform };
        } catch (error) {
          failed = true;
          patchDraft(draft.id, {
            upload: abort.signal.aborted
              ? { status: "queued", progress: 0 }
              : { status: "error", progress: 0, error: errorMessage(error) },
          });
        }
      };
      const pending = current.drafts.flatMap((draft) =>
        !uploaded.has(draft.id) && draft.processed ? [{ draft, processed: draft.processed }] : [],
      );
      // A new app is created by the first upload that succeeds: send one at a time until then, so
      // concurrent requests don't each create it.
      while (!abort.signal.aborted && !appInput.slug && pending.length > 0) {
        const next = pending.shift()!;
        await uploadOne(next.draft, next.processed);
      }
      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_CONCURRENCY, pending.length) }, async () => {
          for (let next = pending.shift(); next && !abort.signal.aborted; next = pending.shift())
            await uploadOne(next.draft, next.processed);
        }),
      );

      void queryClient.invalidateQueries();
      if (failed || abort.signal.aborted) {
        setState((s) => ({
          ...s,
          submit: { ...s.submit, phase: "error", paused: abort.signal.aborted },
        }));
        notify.message(
          abort.signal.aborted
            ? "Upload paused. Finished screens are saved; Retry resumes the rest."
            : "Some screens didn’t upload",
        );
        return;
      }

      // A completed upload is still editable on Retry. Never overwrite another contributor’s
      // reused screenshot, and don't lose metadata edits made to the successful part of a batch.
      for (const draft of current.drafts) {
        const item = uploaded.get(draft.id);
        if (
          item?.owned &&
          (item.title !== (draft.title.trim() || null) ||
            JSON.stringify(item.patterns) !== JSON.stringify(draft.patterns) ||
            JSON.stringify(item.elements) !== JSON.stringify(draft.elements))
        ) {
          try {
            const updated = await updateScreen({
              data: {
                id: item.id,
                patch: {
                  title: draft.title.trim() || null,
                  patterns: draft.patterns,
                  elements: draft.elements,
                  tags: item.tags,
                },
              },
            });
            uploaded.set(draft.id, updated);
            patchDraft(draft.id, { upload: { status: "done", progress: 1, screen: updated } });
          } catch (error) {
            setState((s) => ({
              ...s,
              submit: {
                ...s.submit,
                phase: "error",
                flowError: `Screen changes couldn’t be saved: ${errorMessage(error)}`,
              },
            }));
            return;
          }
        }
      }
      const screens = current.drafts.map((d) => uploaded.get(d.id)).filter((s) => s !== undefined);
      let flow = current.submit.flow;
      if (current.flow.enabled && screens.length >= 2 && !flow) {
        try {
          flow = await createFlow(
            {
              appId: screens[0]!.app.id,
              submissionId,
              name: current.flow.name.trim(),
              type: current.flow.type || undefined,
              steps: current.drafts.map((d) => ({
                screenId: uploaded.get(d.id)!.id,
                label: d.stepLabel.trim() || undefined,
              })),
            },
            abort.signal,
          );
          const patch = {
            name: current.flow.name.trim(),
            type: current.flow.type || undefined,
            description: flow.description ?? undefined,
            steps: current.drafts.map((d) => ({
              screenId: uploaded.get(d.id)!.id,
              label: d.stepLabel.trim() || undefined,
            })),
          };
          if (
            flow.status === "rejected" ||
            flow.name !== patch.name ||
            flow.type !== (patch.type ?? null) ||
            JSON.stringify(
              flow.steps.map((s) => ({ screenId: s.screen.id, label: s.label ?? undefined })),
            ) !== JSON.stringify(patch.steps)
          )
            flow = await updateFlow({ data: { id: flow.id, patch } });
        } catch (error) {
          setState((s) => ({
            ...s,
            submit: { ...s.submit, phase: "error", flowError: errorMessage(error) },
          }));
          return;
        }
      }
      setState((s) => ({ ...s, submit: { ...s.submit, phase: "done", flow } }));
      await persist().catch(() => {});
      window.scrollTo({ top: 0 });
    } catch (error) {
      setState((s) => ({
        ...s,
        submit: {
          ...s.submit,
          phase: "error",
          paused: abort.signal.aborted,
          flowError: abort.signal.aborted ? undefined : errorMessage(error),
        },
      }));
    } finally {
      submitLock.current = false;
      controller.current = null;
      void queryClient.invalidateQueries();
    }
  }

  function reset() {
    for (const draft of state.drafts) URL.revokeObjectURL(draft.previewUrl);
    setState(initialState());
    void persist().catch(() => {});
    setShowErrors(false);
  }

  const done = submit.phase === "done";

  return (
    <Container size="narrow" className="pt-10 sm:pt-12">
      <PageHeader title="Contribute" description="Add real product screens to the library." />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-fg-muted">
        <span role="status">
          {!storageReady
            ? "Restoring draft…"
            : tabLocked
              ? "This contribution is open in another tab. Close that tab to continue here."
              : storageError || (saved ? "Draft saved on this device" : "Saving draft…")}
        </span>
        {drafts.length > 0 && submit.phase !== "uploading" ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={!storageReady || tabLocked}
            onClick={() => setDiscardOpen(true)}
          >
            Start over
          </Button>
        ) : null}
      </div>
      <div inert={!storageReady || tabLocked}>
        <Steps
          className="mt-6 overflow-x-auto pb-1"
          steps={STEPS}
          current={done ? STEPS.length : step}
          onStepClick={
            !submit.started && submit.phase !== "uploading" ? (index) => goTo(index) : undefined
          }
          aria-label="Progress"
        />
        <div ref={headingRef} tabIndex={-1} className="mt-10 pb-32 outline-none">
          <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
            <DialogContent size="sm">
              <DialogHeader>
                <DialogTitle>Discard this draft?</DialogTitle>
                <DialogDescription>
                  Uploaded screens stay in the library. Screens and edits waiting in this draft will
                  be discarded.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDiscardOpen(false)}>
                  Keep draft
                </Button>
                <Button
                  onClick={() => {
                    setDiscardOpen(false);
                    reset();
                  }}
                >
                  Discard draft
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {done ? (
            <SubmitSuccess drafts={drafts} submit={submit} onReset={reset} />
          ) : step === 0 ? (
            <StepUpload
              platform={platform}
              onPlatformChange={changePlatform}
              drafts={drafts}
              duplicates={duplicates}
              onFiles={addFiles}
              onReject={onReject}
              onRemove={removeDraft}
              onDuplicateChoice={(id, choice) => patchDraft(id, { duplicateChoice: choice })}
            />
          ) : step === 1 ? (
            <StepApp
              platform={platform}
              choice={state.app}
              onChoiceChange={(app) => setState((s) => ({ ...s, app }))}
              newApp={state.newApp}
              onNewAppChange={(patch) =>
                setState((s) => ({ ...s, newApp: { ...s.newApp, ...patch } }))
              }
              showErrors={showErrors}
            />
          ) : step === 2 ? (
            <>
              <p className="mb-4 text-sm text-fg-muted" role="status">
                {checkingLibrary ? "Checking for similar screenshots in this app…" : libraryError}
              </p>
              {libraryError ? (
                <Button variant="outline" size="sm" onClick={() => setCheckVersion((v) => v + 1)}>
                  Retry duplicate check
                </Button>
              ) : null}
              {showErrors && !ready.length ? (
                <p role="alert" className="text-sm text-danger">
                  Keep at least one screenshot to continue.
                </p>
              ) : null}
              <StepScreens
                drafts={drafts}
                onReorder={(next) => setState((s) => ({ ...s, drafts: next }))}
                onChange={patchDraft}
                onRemove={removeDraft}
                flow={state.flow}
                onFlowChange={(patch) => setState((s) => ({ ...s, flow: { ...s.flow, ...patch } }))}
                showErrors={showErrors}
                onDuplicateChoice={(id, choice) => patchDraft(id, { duplicateChoice: choice })}
              />
            </>
          ) : state.app ? (
            <StepReview
              platform={platform}
              app={state.app}
              newApp={state.newApp}
              drafts={drafts}
              flow={state.flow}
              submit={submit}
              isAdmin={isAdmin}
            />
          ) : null}
        </div>
      </div>
      {done || tabLocked || !storageReady ? null : (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150">
          <Container size="narrow" className="flex h-[72px] items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={() => goTo(step - 1)}
              disabled={step === 0 || submit.phase === "uploading" || (submit.started && step <= 2)}
              className={step === 0 ? "invisible" : undefined}
            >
              <ArrowLeft />
              Back
            </Button>
            <div className="flex items-center gap-4">
              {submit.phase === "uploading" ? (
                <Button variant="outline" onClick={() => controller.current?.abort()}>
                  Pause upload
                </Button>
              ) : null}
              {blockedReason ? (
                <span className="hidden text-sm text-fg-muted sm:inline" aria-live="polite">
                  {blockedReason}
                </span>
              ) : step === 0 ? (
                <span className="hidden text-sm text-fg-muted tabular-nums sm:inline">
                  {pluralize(ready.length, "screen")} ready
                </span>
              ) : null}
              {step < STEPS.length - 1 ? (
                <Button onClick={onContinue} disabled={step === 0 && !stepValid}>
                  Continue
                  <ArrowRight />
                </Button>
              ) : (
                <Button onClick={() => void onSubmit()} loading={submit.phase === "uploading"}>
                  {submit.phase === "error"
                    ? "Retry"
                    : isAdmin
                      ? `Publish ${pluralize(drafts.length, "screen")}`
                      : `Submit ${pluralize(drafts.length, "screen")}`}
                </Button>
              )}
            </div>
          </Container>
        </div>
      )}
    </Container>
  );
}
