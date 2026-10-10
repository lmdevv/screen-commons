import type { CreateScreenInput, Screen } from "@screen-commons/core";
import type { Platform } from "@screen-commons/core/taxonomy";
import {
  Button,
  Container,
  PageHeader,
  Steps,
  pluralize,
  type RejectedFile,
} from "@screen-commons/ui";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { errorMessage, notify } from "../../lib/toast";
import { ImageValidationError } from "./image-processing";
import {
  MAX_SCREENS,
  STEPS,
  findDuplicates,
  frameKindOf,
  initialState,
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

let draftSeq = 0;

function keepUploadable(drafts: Draft[]): Draft[] {
  const duplicates = findDuplicates(drafts);
  return drafts.filter((d) => d.status === "ready" && !duplicates.has(d.id));
}

/** Screens uploaded in parallel: each request's time is mostly server round trips, not bytes. */
const UPLOAD_CONCURRENCY = 4;

export function ContributeWizard({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<WizardState>(initialState);
  const [showErrors, setShowErrors] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const headingRef = useRef<HTMLDivElement>(null);

  const { step, drafts, platform, submit } = state;
  const duplicates = useMemo(() => findDuplicates(drafts), [drafts]);
  const ready = drafts.filter((d) => d.status === "ready" && !duplicates.has(d.id));
  const processing = drafts.some((d) => d.status === "processing");

  const patchDraft = useCallback((id: string, patch: Partial<Draft>) => {
    setState((s) => ({
      ...s,
      drafts: s.drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }));
  }, []);

  const runProcessing = useCallback(
    (draft: Draft, kind: "web" | "mobile") => {
      processImage(draft.file, kind)
        .then((processed) => {
          const current = stateRef.current.drafts.find((d) => d.id === draft.id);
          if (!current) return;
          const previewUrl = URL.createObjectURL(processed.thumbnail);
          URL.revokeObjectURL(current.previewUrl);
          patchDraft(draft.id, { status: "ready", processed, previewUrl, error: undefined });
        })
        .catch((error: unknown) => {
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
        const name = file.name || `Pasted image ${draftSeq + 1}.png`;
        const title = titleFromFilename(name);
        return {
          id: `draft-${(draftSeq += 1)}`,
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

  // Revoke object URLs when leaving the page.
  useEffect(
    () => () => {
      for (const draft of stateRef.current.drafts) URL.revokeObjectURL(draft.previewUrl);
    },
    [],
  );

  // Warn before closing the tab with unsent work.
  const dirty = drafts.length > 0 && submit.phase !== "done";
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const appValid =
    state.app?.mode === "existing" ||
    (state.app?.mode === "new" &&
      state.newApp.name.trim().length > 0 &&
      (!state.newApp.websiteUrl.trim() || isValidUrl(normalizeUrl(state.newApp.websiteUrl))));
  const flowValid = !state.flow.enabled || ready.length < 2 || state.flow.name.trim().length > 0;

  const stepValid = [ready.length > 0 && !processing, appValid, flowValid, true][step] ?? false;
  const blockedReason =
    step === 0
      ? processing
        ? "Processing images…"
        : ready.length === 0
          ? "Add at least one screenshot"
          : null
      : step === 1 && !state.app
        ? "Pick or create an app"
        : null;

  function goTo(next: number) {
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
    const current = stateRef.current;
    if (current.submit.phase === "uploading" || !current.app) return;
    setState((s) => ({ ...s, submit: { ...s.submit, phase: "uploading", flowError: undefined } }));

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
    // Reuse the app created by an earlier (partial) attempt.
    const firstDone = current.drafts.find((d) => d.upload.screen)?.upload.screen;
    if (firstDone)
      appInput = { slug: firstDone.app.slug, name: firstDone.app.name, platform: current.platform };

    // Track results locally: state updates from this loop haven't rendered yet.
    const uploaded = new Map<string, Screen>();
    for (const draft of current.drafts)
      if (draft.upload.screen) uploaded.set(draft.id, draft.upload.screen);
    let failed = false;
    const uploadOne = async (draft: Draft, processed: NonNullable<Draft["processed"]>) => {
      patchDraft(draft.id, { upload: { status: "uploading", progress: 0 } });
      try {
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
            },
          },
          (progress) => patchDraft(draft.id, { upload: { status: "uploading", progress } }),
        );
        uploaded.set(draft.id, screen);
        patchDraft(draft.id, { upload: { status: "done", progress: 1, screen } });
        appInput = { slug: screen.app.slug, name: screen.app.name, platform: current.platform };
      } catch (error) {
        failed = true;
        patchDraft(draft.id, {
          upload: { status: "error", progress: 0, error: errorMessage(error) },
        });
      }
    };
    const pending = current.drafts.flatMap((draft) =>
      !uploaded.has(draft.id) && draft.processed ? [{ draft, processed: draft.processed }] : [],
    );
    // A new app is created by the first upload that succeeds: send one at a time until then, so
    // concurrent requests don't each create it.
    while (!appInput.slug && pending.length > 0) {
      const next = pending.shift()!;
      await uploadOne(next.draft, next.processed);
    }
    await Promise.all(
      Array.from({ length: Math.min(UPLOAD_CONCURRENCY, pending.length) }, async () => {
        for (let next = pending.shift(); next; next = pending.shift())
          await uploadOne(next.draft, next.processed);
      }),
    );

    void queryClient.invalidateQueries();
    if (failed) {
      setState((s) => ({ ...s, submit: { ...s.submit, phase: "error" } }));
      notify.error("Some screens didn’t upload");
      return;
    }

    const screens = current.drafts.map((d) => uploaded.get(d.id)).filter((s) => s !== undefined);
    let flow = current.submit.flow;
    if (current.flow.enabled && screens.length >= 2 && !flow) {
      try {
        flow = await createFlow({
          appId: screens[0]!.app.id,
          name: current.flow.name.trim(),
          type: current.flow.type || undefined,
          steps: current.drafts.map((d) => ({
            screenId: uploaded.get(d.id)!.id,
            label: d.stepLabel.trim() || undefined,
          })),
        });
      } catch (error) {
        setState((s) => ({
          ...s,
          submit: { ...s.submit, phase: "error", flowError: errorMessage(error) },
        }));
        return;
      }
    }
    setState((s) => ({ ...s, submit: { phase: "done", flow } }));
    window.scrollTo({ top: 0 });
  }

  function reset() {
    for (const draft of state.drafts) URL.revokeObjectURL(draft.previewUrl);
    setState(initialState());
    setShowErrors(false);
  }

  const done = submit.phase === "done";

  return (
    <Container size="narrow" className="pt-10 sm:pt-12">
      <PageHeader title="Contribute" description="Add real product screens to the library." />
      <Steps
        className="mt-6 overflow-x-auto pb-1"
        steps={STEPS}
        current={done ? STEPS.length : step}
        onStepClick={submit.phase === "idle" ? (index) => goTo(index) : undefined}
        aria-label="Progress"
      />
      <div ref={headingRef} tabIndex={-1} className="mt-10 pb-32 outline-none">
        {done ? (
          <SubmitSuccess drafts={drafts} submit={submit} isAdmin={isAdmin} onReset={reset} />
        ) : step === 0 ? (
          <StepUpload
            platform={platform}
            onPlatformChange={changePlatform}
            drafts={drafts}
            duplicates={duplicates}
            onFiles={addFiles}
            onReject={onReject}
            onRemove={removeDraft}
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
          <StepScreens
            drafts={drafts}
            onReorder={(next) => setState((s) => ({ ...s, drafts: next }))}
            onChange={patchDraft}
            onRemove={removeDraft}
            flow={state.flow}
            onFlowChange={(patch) => setState((s) => ({ ...s, flow: { ...s.flow, ...patch } }))}
            showErrors={showErrors}
          />
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

      {done ? null : (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150">
          <Container size="narrow" className="flex h-[72px] items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={() => goTo(step - 1)}
              disabled={step === 0 || submit.phase === "uploading"}
              className={step === 0 ? "invisible" : undefined}
            >
              <ArrowLeft />
              Back
            </Button>
            <div className="flex items-center gap-4">
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
