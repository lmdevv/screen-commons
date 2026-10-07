import { labelFor, type Platform } from "@open-ui/core/taxonomy";
import {
  AppLogo,
  Button,
  Callout,
  DetailList,
  DetailRow,
  UploadItem,
  cn,
  pluralize,
} from "@open-ui/ui";
import { Link } from "@tanstack/react-router";
import { CircleCheck, Info, TriangleAlert } from "lucide-react";

import type { AppChoice, Draft, FlowOptions, NewApp, SubmitState } from "./model";

export function StepReview({
  platform,
  app,
  newApp,
  drafts,
  flow,
  submit,
  isAdmin,
}: {
  platform: Platform;
  app: AppChoice;
  newApp: NewApp;
  drafts: Draft[];
  flow: FlowOptions;
  submit: SubmitState;
  isAdmin: boolean;
}) {
  const appName = app.mode === "existing" ? app.app.name : newApp.name;
  const asFlow = flow.enabled && drafts.length >= 2;
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-lg font-semibold text-fg">Review and submit</h2>
        <p className="mt-1 text-base text-fg-muted">
          {submit.phase === "uploading"
            ? "Uploading — keep this tab open."
            : "Check everything, then send it to the library."}
        </p>
      </div>

      <DetailList className="rounded-tile border border-border px-5 py-1">
        <DetailRow label="App">
          <span className="inline-flex items-center gap-2">
            {app.mode === "existing" ? <AppLogo app={app.app} size="xs" /> : null}
            {appName}
            {app.mode === "new" ? <span className="text-fg-muted">(new)</span> : null}
          </span>
        </DetailRow>
        <DetailRow label="Platform">{labelFor(platform)}</DetailRow>
        <DetailRow label="Screens">{drafts.length}</DetailRow>
        <DetailRow label="Flow">
          {asFlow
            ? `${flow.name}${flow.type ? ` · ${labelFor(flow.type)}` : ""}`
            : "Not saved as a flow"}
        </DetailRow>
      </DetailList>

      {!isAdmin ? (
        <Callout tone="neutral" icon={<Info />}>
          Members’ uploads are reviewed by an admin before they appear in the library. You can
          already see them in your own grids, marked pending.
        </Callout>
      ) : null}

      <ol aria-label="Upload queue" className="grid gap-2 sm:grid-cols-2">
        {drafts.map((draft, index) => (
          <li key={draft.id}>
            <UploadItem
              name={`${index + 1}. ${draft.title || draft.name}`}
              previewUrl={draft.previewUrl}
              bytes={draft.file.size}
              status={draft.upload.status}
              progress={Math.round(draft.upload.progress * 100)}
              error={draft.upload.error}
            />
          </li>
        ))}
      </ol>

      {drafts.some((d) => d.upload.status === "error") ? (
        <Callout tone="danger" icon={<TriangleAlert />}>
          Some screens didn’t upload. Fix the issue and press <strong>Retry</strong>; finished
          screens won’t be sent twice.
        </Callout>
      ) : null}
      {submit.flowError ? (
        <Callout tone="danger" icon={<TriangleAlert />}>
          The screens uploaded, but the flow couldn’t be created: {submit.flowError}
        </Callout>
      ) : null}
    </div>
  );
}

export function SubmitSuccess({
  drafts,
  submit,
  isAdmin,
  onReset,
}: {
  drafts: Draft[];
  submit: SubmitState;
  isAdmin: boolean;
  onReset: () => void;
}) {
  const app = drafts[0]?.upload.screen?.app;
  const count = drafts.length;
  return (
    <div className="flex flex-col items-center py-16 text-center" role="status">
      <div className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
        <CircleCheck aria-hidden className="size-6" />
      </div>
      <h2 className="mt-6 text-xl font-semibold text-fg">
        {isAdmin ? "Published" : "Submitted for review"}
      </h2>
      <p className="mt-2 max-w-md text-base text-pretty text-fg-muted">
        {isAdmin
          ? `${pluralize(count, "screen")}${submit.flow ? " and a flow are" : count === 1 ? " is" : " are"} live in the library.`
          : `Thanks! ${pluralize(count, "screen")}${submit.flow ? " and a flow" : ""} will appear in the library once an admin approves ${count === 1 && !submit.flow ? "it" : "them"}.`}
      </p>
      <div className="mt-8 flex w-full max-w-xl justify-center gap-3" aria-hidden>
        {drafts.slice(0, 4).map((draft, index) => (
          <div key={draft.id} className={cn("w-1/3 sm:w-1/4", index === 3 && "max-sm:hidden")}>
            <div className="overflow-hidden rounded-shot bg-tile shadow-[inset_0_0_0_1px_var(--color-shot-border)]">
              <img
                src={draft.previewUrl}
                alt=""
                className="block aspect-[16/10] w-full object-cover object-top"
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        {app ? (
          <Button
            render={
              <Link
                to="/apps/$slug"
                params={{ slug: app.slug }}
                search={submit.flow ? { flow: submit.flow.id } : {}}
              />
            }
          >
            {submit.flow ? "View flow" : `View ${app.name}`}
          </Button>
        ) : null}
        <Button variant="outline" onClick={onReset}>
          Contribute more
        </Button>
      </div>
    </div>
  );
}
