import type { FlowDetail, ScreenDetail } from "@screen-commons/core";
import { FLOW_TYPES, PATTERNS, ELEMENTS, labelFor } from "@screen-commons/core/taxonomy";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  Input,
  Textarea,
  FilterChip,
} from "@screen-commons/ui";
import { useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  updateScreen,
  updateFlow,
  deleteContribution,
  requestRemoval,
} from "../../server/functions";
import { queries } from "../../lib/queries";
import { errorMessage, notify } from "../../lib/toast";

export function ContributionActions({
  item,
  kind,
  onDeleted,
}: {
  item: ScreenDetail | FlowDetail | undefined;
  kind: "screen" | "flow";
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<"edit" | "delete" | "removal" | null>(null);
  if (!item?.permissions?.edit) return null;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAction("edit")}>
        Edit contribution
      </Button>
      {item.permissions.delete ? (
        <Button variant="ghost" size="sm" onClick={() => setAction("delete")}>
          Delete contribution
        </Button>
      ) : item.permissions.requestRemoval ? (
        <Button variant="ghost" size="sm" onClick={() => setAction("removal")}>
          {item.permissions.removalRequested ? "Update removal request" : "Request removal"}
        </Button>
      ) : null}
      {item.reviewReason ? (
        <p className="text-sm text-fg-muted">Review: {item.reviewReason}</p>
      ) : null}
      <Dialog open={!!action} onOpenChange={(open) => !open && setAction(null)}>
        {action ? (
          <ContributionForm
            key={`${item.id}:${action}`}
            item={item}
            kind={kind}
            action={action}
            close={() => setAction(null)}
            saved={async (deleted) => {
              setAction(null);
              if (deleted) onDeleted();
              await queryClient.invalidateQueries();
            }}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function ContributionForm({
  item,
  kind,
  action,
  close,
  saved,
}: {
  item: ScreenDetail | FlowDetail;
  kind: "screen" | "flow";
  action: "edit" | "delete" | "removal";
  close: () => void;
  saved: (deleted: boolean) => Promise<void>;
}) {
  const screen = kind === "screen" ? (item as ScreenDetail) : undefined;
  const flow = kind === "flow" ? (item as FlowDetail) : undefined;
  const [title, setTitle] = useState(screen?.title ?? flow?.name ?? "");
  const [patterns, setPatterns] = useState(screen?.patterns ?? []);
  const [elements, setElements] = useState(screen?.elements ?? []);
  const [tags, setTags] = useState(screen?.tags.join(", ") ?? "");
  const [type, setType] = useState<NonNullable<FlowDetail["type"]> | "">(flow?.type ?? "");
  const [description, setDescription] = useState(flow?.description ?? "");
  const [steps, setSteps] = useState(flow?.steps ?? []);
  const [addId, setAddId] = useState("");
  const candidates = useInfiniteQuery({
    ...queries.screensInfinite({ app: item.app.slug, limit: 100 }),
    enabled: !!flow && action === "edit",
  });
  const availableScreens = candidates.data?.pages.flatMap((page) => page.items) ?? [];
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (action === "delete") await deleteContribution({ data: { kind, id: item.id } });
      else if (action === "removal") await requestRemoval({ data: { kind, id: item.id, reason } });
      else if (screen)
        await updateScreen({
          data: {
            id: item.id,
            patch: {
              title: title.trim() || null,
              patterns,
              elements,
              tags: tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            },
          },
        });
      else
        await updateFlow({
          data: {
            id: item.id,
            patch: {
              name: title,
              type: type || undefined,
              description,
              steps: steps.map((s) => ({ screenId: s.screen.id, label: s.label ?? undefined })),
            },
          },
        });
      await saved(action === "delete");
      notify.success(
        action === "delete"
          ? "Contribution deleted"
          : action === "removal"
            ? "Removal requested"
            : "Changes saved",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <DialogContent size="lg">
      <DialogHeader>
        <DialogTitle>
          {action === "edit"
            ? "Edit contribution"
            : action === "delete"
              ? "Delete contribution?"
              : "Request removal"}
        </DialogTitle>
        <DialogDescription>
          {action === "delete"
            ? "This contribution will be removed from the library, saved collections and flows. This cannot be undone."
            : action === "removal"
              ? "A moderator will review your request before removing the published contribution."
              : "Update your contribution’s details."}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-5">
        {action === "removal" ? (
          <label className="block space-y-2">
            Reason
            <Textarea
              aria-label="Removal reason"
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        ) : action === "edit" ? (
          <>
            <label className="block space-y-2">
              {screen ? "Title" : "Flow name"}
              <Input
                aria-label={screen ? "Contribution title" : "Contribution flow name"}
                maxLength={screen ? 160 : 80}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            {screen ? (
              <>
                <div>
                  <p className="mb-2">Patterns</p>
                  <div className="flex flex-wrap gap-2">
                    {PATTERNS.map(({ slug, label }) => (
                      <FilterChip
                        key={slug}
                        selected={patterns.includes(slug)}
                        disabled={!patterns.includes(slug) && patterns.length >= 8}
                        onClick={() =>
                          setPatterns(
                            patterns.includes(slug)
                              ? patterns.filter((p) => p !== slug)
                              : [...patterns, slug],
                          )
                        }
                      >
                        {label}
                      </FilterChip>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2">Elements</p>
                  <div className="flex flex-wrap gap-2">
                    {ELEMENTS.map(({ slug, label }) => (
                      <FilterChip
                        key={slug}
                        selected={elements.includes(slug)}
                        disabled={!elements.includes(slug) && elements.length >= 24}
                        onClick={() =>
                          setElements(
                            elements.includes(slug)
                              ? elements.filter((p) => p !== slug)
                              : [...elements, slug],
                          )
                        }
                      >
                        {label}
                      </FilterChip>
                    ))}
                  </div>
                </div>
                <label className="block space-y-2">
                  Tags, separated by commas
                  <Input
                    aria-label="Contribution tags"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                  />
                </label>
              </>
            ) : (
              <>
                <label className="block space-y-2">
                  Flow type
                  <select
                    aria-label="Contribution flow type"
                    className="block w-full rounded-control border border-border bg-surface p-2"
                    value={type}
                    onChange={(e) => setType(e.target.value as typeof type)}
                  >
                    <option value="">None</option>
                    {FLOW_TYPES.map(({ slug }) => (
                      <option key={slug} value={slug}>
                        {labelFor(slug)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-2">
                  Description
                  <Textarea
                    aria-label="Contribution description"
                    maxLength={500}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
                <div>
                  <p className="mb-2">Steps</p>
                  <div className="mb-4 flex gap-2">
                    <select
                      aria-label="Add screen to flow"
                      className="min-w-0 flex-1 rounded-control border border-border bg-surface p-2"
                      value={addId}
                      onChange={(e) => setAddId(e.target.value)}
                    >
                      <option value="">Choose a screen from this app</option>
                      {availableScreens.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title ?? s.id}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="outline"
                      disabled={!addId || steps.length >= 30}
                      onClick={() => {
                        const selected = availableScreens.find((s) => s.id === addId);
                        if (selected)
                          setSteps([
                            ...steps,
                            { screen: selected, position: steps.length, label: null },
                          ]);
                        setAddId("");
                      }}
                    >
                      Add step
                    </Button>
                  </div>
                  {candidates.hasNextPage ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={candidates.isFetchingNextPage}
                      onClick={() => void candidates.fetchNextPage()}
                    >
                      Load more screens
                    </Button>
                  ) : null}
                  {candidates.isError ? (
                    <p role="alert">
                      Screens couldn’t be loaded.{" "}
                      <Button variant="ghost" size="sm" onClick={() => void candidates.refetch()}>
                        Retry
                      </Button>
                    </p>
                  ) : null}
                  {steps.map((step, index) => (
                    <div
                      key={`${step.screen.id}:${index}`}
                      className="mb-3 flex flex-wrap items-center gap-2 rounded-control border border-border p-3"
                    >
                      <span className="text-sm">
                        {index + 1}. {step.screen.title ?? "Screen"}
                      </span>
                      <Input
                        aria-label={`Step ${index + 1} label`}
                        className="min-w-0 flex-1"
                        maxLength={80}
                        value={step.label ?? ""}
                        onChange={(e) =>
                          setSteps(
                            steps.map((s, i) =>
                              i === index ? { ...s, label: e.target.value } : s,
                            ),
                          )
                        }
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={index === 0}
                        onClick={() =>
                          setSteps((previous) => {
                            const next = [...previous];
                            [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                            return next;
                          })
                        }
                      >
                        Move up
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={index === steps.length - 1}
                        onClick={() =>
                          setSteps((previous) => {
                            const next = [...previous];
                            [next[index + 1], next[index]] = [next[index]!, next[index + 1]!];
                            return next;
                          })
                        }
                      >
                        Move down
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={steps.length <= 2}
                        onClick={() => setSteps(steps.filter((_, i) => i !== index))}
                      >
                        Remove step
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" disabled={busy} onClick={close}>
          Cancel
        </Button>
        <Button
          loading={busy}
          disabled={
            (action === "removal" && !reason.trim()) ||
            (action === "edit" && !!flow && !title.trim())
          }
          onClick={() => void submit()}
        >
          {action === "edit"
            ? item.status === "rejected"
              ? "Save and resubmit"
              : "Save changes"
            : action === "delete"
              ? "Delete permanently"
              : "Send removal request"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
